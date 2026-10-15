"""Seed the LOCAL Docker database with a demo company (`make seed`).

Local development only; never point this at a real database. It creates one
company + Business Owner (if the email has no account yet) with a random
password printed once, then runs the regular `seed_demo --owner <email>
--platform --yes` so the workspace, public page and platform inbox look
lived-in.

Environment:
    SEED_OWNER_EMAIL     default dev-owner@vezano.test (.test never routes)
    SEED_RESET_PASSWORD  1 = give an existing owner a new random password
"""
import os
import secrets
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.core.management import call_command  # noqa: E402
from django.db import connection, transaction  # noqa: E402

from accounts.models import Role, User  # noqa: E402
from org.models import Branch, Company  # noqa: E402

EMAIL = os.environ.get("SEED_OWNER_EMAIL", "dev-owner@vezano.test").strip().lower()
RESET = os.environ.get("SEED_RESET_PASSWORD", "") in ("1", "true", "yes")


def main():
    if not settings.DEBUG:
        sys.exit("Refusing to seed: DEBUG is off (this is for the local Docker stack only).")
    print(f"Database: {connection.settings_dict['NAME']} on "
          f"{connection.settings_dict.get('HOST') or 'local file'}")

    password = None
    with transaction.atomic():
        call_command("seed_roles", verbosity=0)
        owner = User.objects.filter(email__iexact=EMAIL).first()
        if owner is None:
            company = Company.objects.create(
                name="Vezano Dev Company",
                legal_name="Vezano Dev Company",
                email=EMAIL,
                business_type=Company.TYPE_ENTERPRISE,
                business_type_chosen=True,
            )
            branch = Branch.objects.create(company=company, name="Main Branch", code="MAIN")
            password = secrets.token_urlsafe(12)
            owner = User.objects.create_user(
                email=EMAIL, password=password, full_name="Dev Owner",
                company=company, branch=branch,
                role=Role.objects.get(name="Business Owner"),
            )
        elif RESET:
            password = secrets.token_urlsafe(12)
            owner.set_password(password)
            owner.save(update_fields=["password"])

    call_command("seed_demo", "--owner", EMAIL, "--platform", "--yes")

    print()
    print(f"Sign in at http://localhost:{os.environ.get('FRONTEND_PORT', '3000')}/login/")
    print(f"  email:    {EMAIL}")
    if password:
        print(f"  password: {password}")
        print("  (shown once and stored nowhere; run with SEED_RESET_PASSWORD=1 for a new one)")
    else:
        print("  password: unchanged (run `make seed SEED_RESET_PASSWORD=1` for a new one)")


if __name__ == "__main__":
    main()
