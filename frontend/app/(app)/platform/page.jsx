"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, Lock } from "lucide-react";

import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { registration } from "@/lib/api";
import { usePlatformRoleLabel } from "@/components/PlatformShell";
import { Badge, Card, DefinitionSection, FigureRow, PageHeader } from "@/components/ui/kit";
import { subscriptionStateLabel } from "@/lib/labels";
import PushPrompt from "@/components/orders/PushPrompt";

// A count that is waiting on someone is in the warning colour; a zero is
// quiet (FigureRow), and "…" holds the place while the overview loads.
const waiting = (value) => (value ? "warn" : undefined);

export default function PlatformPage() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const roleLabel = usePlatformRoleLabel();
  // Latin digits in Arabic too (docs/ui-profile.md).
  const locale = language === "ar" ? "ar-u-nu-latn" : "en";
  const fmt = (value) => new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  // Unknown role names (e.g. "Django superuser") fall back to the raw label.
  const memberRole = (name) => {
    if (!name) return "";
    const label = t(`platformTeam.roles.${name}`);
    return label.startsWith("platformTeam.") ? name : label;
  };
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user?.is_platform_admin) return;
    registration.overview().then((response) => setOverview(response.data)).catch(() => setError(t("platform.loadError")));
  }, [t, user?.is_platform_admin]);
  if (!user?.is_platform_admin) return <Card className="mx-auto mt-16 max-w-md p-8 text-center"><Lock className="mx-auto text-muted" /><p className="mt-3 text-muted">{t("shell.noAccessBody", { module: t("nav.platform") })}</p></Card>;
  const counts = overview?.counts;
  const attention = overview?.registration_attention || [];
  const expiring = overview?.expiring_subscriptions || [];
  // Only present for members who may see the team (platform.team.view).
  const team = overview?.team;
  const count = (key) => (counts ? counts[key] ?? 0 : "…");
  return <div>
    <PageHeader title={t("platform.title")} subtitle={t("platform.subtitle")} actions={<Badge tone="accent">{roleLabel}</Badge>} />
    {error && <p role="alert" className="mb-5 rounded-control bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    <PushPrompt onKey="platform.pushOn" offKey="platform.pushOff" />
    {/* The way a company's first owner is created is a one-time question:
        a help line that opens on demand, beside the action it explains,
        instead of a permanent card at the top of the page. */}
    <div className="mb-6 flex flex-wrap items-start gap-x-5 gap-y-3">
      <Link href="/platform-registrations" className="tap inline-flex min-h-10 shrink-0 items-center rounded-control bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-sm transition-colors hover:bg-accent-strong">{t("platform.createOwnerAction")}</Link>
      <details className="group min-w-0 flex-1 basis-64 py-2">
        <summary className="tap inline-flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-accent hover:underline [&::-webkit-details-marker]:hidden">
          {t("platform.ownerCreationTitle")}
          <ChevronDown size={15} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
        </summary>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{t("platform.ownerCreationHint")}</p>
      </details>
    </div>
    <FigureRow cols={4} items={[
      { key: "registrations", href: "/platform-registrations", label: t("platform.registrationAttention"), value: count("registration_attention"), tone: waiting(counts?.registration_attention), hint: t("platform.registrationAttentionHint") },
      { key: "payments", href: "/platform-subscriptions", label: t("platform.pendingPaymentsTitle"), value: count("pending_payments"), tone: waiting(counts?.pending_payments), hint: t("platform.pendingPaymentsHint") },
      { key: "companies", href: "/platform-subscriptions", label: t("platform.provisionedCompanies"), value: count("provisioned_companies"), hint: t("platform.provisionedCompaniesHint") },
      { key: "expiring", href: "/platform-subscriptions", label: t("platform.expiringSoon"), value: count("expiring_within_7_days"), tone: waiting(counts?.expiring_within_7_days), hint: t("platform.expiringSoonHint") },
    ]} />
    <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-2">
      <DefinitionSection title={t("platform.registrationQueue")} link={{ href: "/platform-registrations", label: t("platform.openQueue") }}>
        {attention.length ? <ul className="divide-y divide-line">{attention.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
            <div className="min-w-0">
              <div className="font-medium text-ink">{row.company_name}</div>
              <div className="mt-0.5 text-sm text-muted">{row.contact_name} · <bdi dir="ltr">{row.email}</bdi></div>
            </div>
            <Badge className="shrink-0" tone={row.status === "approved" ? "ok" : "warn"}>{t(`platformRegistration.status${row.status.charAt(0).toUpperCase()}${row.status.slice(1)}`)}</Badge>
          </li>
        ))}</ul> : <p className="py-3 text-sm text-muted">{t("platform.noRegistrationAttention")}</p>}
      </DefinitionSection>
      {team && <DefinitionSection title={t("platform.teamPresence")} link={{ href: "/platform-team", label: t("platform.openTeam") }}>
        <p className="mt-2 text-sm text-muted">{t("platform.teamPresenceHint")}</p>
        <ul className="mt-1 divide-y divide-line">{team.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><Link href={`/platform-team/member/?id=${row.id}`} className="font-medium hover:text-accent hover:underline">{row.full_name || row.email}</Link>{row.online && <Badge tone="ok"><span className="me-1 inline-block h-2 w-2 rounded-full bg-ok" />{t("platformTeam.online")}</Badge>}</div>
              <div className="mt-1 truncate text-sm text-muted"><bdi dir="ltr">{row.email}</bdi>{row.role_name && <> · {memberRole(row.role_name)}</>}</div>
            </div>
            <div className="shrink-0 text-end text-xs text-muted">{row.online ? "" : row.last_seen_at ? t("platformTeam.lastSeen", { date: fmt(row.last_seen_at) }) : t("platformTeam.neverSignedIn")}</div>
          </li>
        ))}</ul>
      </DefinitionSection>}
      <DefinitionSection title={t("platform.expiringQueue")}>
        {expiring.length ? <ul className="divide-y divide-line">{expiring.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0"><div className="font-medium text-ink">{row.company_name}</div><div className="mt-0.5 text-sm text-muted">{subscriptionStateLabel(t, row.status)}</div></div>
            <time className="shrink-0 text-sm text-muted tabular" dateTime={row.ends_at}>{new Date(row.ends_at).toLocaleDateString(locale)}</time>
          </li>
        ))}</ul> : <p className="py-3 text-sm text-muted">{t("platform.noExpiringSubscriptions")}</p>}
      </DefinitionSection>
    </div>
  </div>;
}
