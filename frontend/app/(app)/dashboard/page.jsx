"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";

import {
  AttentionItem,
  AttentionList,
  Button,
  DefinitionSection,
  Figure,
  FigureRow,
  PageHeader,
  PrimaryBlock,
} from "@/components/ui/kit";
import { dashboard } from "@/lib/api";
import { useAuth } from "../../providers/AuthProvider";
import { useI18n } from "../../providers/I18nProvider";
import { translateRole } from "@/lib/i18n";
import BarList from "@/components/reports/BarList";
import { SkeletonBar } from "@/components/ui/Skeleton";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";

// The overview, in the chosen direction (docs/ui-profile.md): what matters
// now first — today's block (the one raised surface) — then what needs
// attention as a list of rows, then reference sections as definition lists
// and divided figure rows. Same data and the same role gates as before:
// a section shows only when the API sends it (the server filters by role),
// and the links and actions keep their permission checks.

const LINK_PRIMARY =
  "tap inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-control bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-strong sm:flex-none";
const LINK_SECONDARY =
  "tap inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-control border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent/40 hover:bg-paper sm:flex-none";

// Loading: the same shape as the page — today's block, three rows, two
// reference sections — so nothing jumps when the figures land.
function DashboardSkeleton() {
  const { t } = useI18n();
  const row = (w, k) => (
    <div key={k} className="flex min-h-11 items-center justify-between gap-4 py-2">
      <SkeletonBar className={w} />
      <SkeletonBar className="h-3.5 w-20 shrink-0" />
    </div>
  );
  return (
    <div role="status" aria-live="polite" className="dashboard-c">
      <span className="sr-only">{t("common.loading")}</span>
      <div className="rounded-card bg-surface p-4 shadow-raise sm:p-6" aria-hidden="true">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2"><SkeletonBar className="h-5 w-24" /><SkeletonBar className="h-3 w-36" /></div>
          <div className="flex w-full gap-2 sm:w-auto"><SkeletonBar className="h-11 flex-1 sm:w-28" /><SkeletonBar className="h-11 flex-1 sm:w-28" /></div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-end">
          <div className="space-y-2"><SkeletonBar className="h-3 w-28" /><SkeletonBar className="h-8 w-48" /></div>
          <div className="grid grid-cols-2 gap-4"><SkeletonBar className="h-12" /><SkeletonBar className="h-12" /></div>
        </div>
      </div>
      <div aria-hidden="true">
        <SkeletonBar className="mb-3 h-4 w-32" />
        <div className="divide-y divide-line border-y border-line">{["w-1/2", "w-2/3", "w-2/5"].map((w, i) => row(w, i))}</div>
      </div>
      <div className="dashboard-c__sections" aria-hidden="true">
        {[0, 1].map((s) => (
          <div key={s}>
            <SkeletonBar className="mb-2 h-4 w-28" />
            <div className="divide-y divide-line border-t border-line">{["w-1/3", "w-2/5", "w-1/4", "w-1/3"].map((w, i) => row(w, i))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, canWrite, canRead, can } = useAuth();
  const { t, language } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [advanceAlertDismissed, setAdvanceAlertDismissed] = useState(false);

  // One money rule app-wide (lib/money.js): two decimals and the currency
  // label ("ج.س" / "SDG") on every figure.
  const money = (v) => formatMoney(v, { currency: data?.currency || user?.currency, language });

  const load = () => {
    setError(false);
    dashboard
      .get()
      .then((res) => setData(res.data))
      .catch(() => setError(true));
  };
  useEffect(() => { load(); }, []);

  const sections = data?.sections || {};
  const advanceRequestSignature = sections.advance_requests
    ? JSON.stringify(sections.advance_requests)
    : "";

  useEffect(() => {
    if (!advanceRequestSignature || !user?.id || !user?.company) {
      setAdvanceAlertDismissed(false);
      return;
    }
    const key = `vezano.advance-request-alert:${user.company}:${user.id}`;
    setAdvanceAlertDismissed(window.localStorage.getItem(key) === advanceRequestSignature);
  }, [advanceRequestSignature, user?.company, user?.id]);

  // The setup checklist can be put away (a one-person shop never "adds a
  // team"); it is a per-person convenience, so browser storage is enough.
  const setupKey = user?.id && user?.company ? `vezano.setup-hidden:${user.company}:${user.id}` : "";
  const [setupHidden, setSetupHidden] = useState(false);
  useEffect(() => {
    if (!setupKey) return;
    try { setSetupHidden(window.localStorage.getItem(setupKey) === "1"); } catch { /* storage blocked */ }
  }, [setupKey]);
  const hideSetup = () => {
    setSetupHidden(true);
    try { window.localStorage.setItem(setupKey, "1"); } catch { /* storage blocked */ }
  };
  const setupTotal = data?.setup?.length || 1;
  const setupDone = data?.setup?.filter((step) => step.done).length || 0;
  const setupNext = data?.setup?.find((step) => !step.done);

  const dismissAdvanceRequestAlert = () => {
    const key = `vezano.advance-request-alert:${user.company}:${user.id}`;
    window.localStorage.setItem(key, advanceRequestSignature);
    setAdvanceAlertDismissed(true);
  };

  const notShop = user?.business_type !== "shop";
  const { sales, debts, inventory, purchasing, returns, crm, hr, finance, website } = sections;
  const today = formatDate(new Date(), language, {
    weekday: "long", day: "numeric", month: "long",
  }, "en-GB");

  // Today's actions: the two things people start here (the owner's team
  // link sits in the page header). Low stock, negative stock and returns are states, not
  // actions — they live in "needs attention" below.
  const actions = [
    canWrite("sales") && <Link key="sale" className={LINK_PRIMARY} href="/sales?tab=pos">{t("improvements.newSale")}</Link>,
    canWrite("purchasing") && <Link key="receive" className={LINK_SECONDARY} href="/purchasing?tab=receive">{t("improvements.receiveStock")}</Link>,
  ].filter(Boolean);

  const n = (v) => Number(v || 0);
  const attention = data ? [
    canRead("inventory") && n(inventory?.negative_stock_count) > 0 && (
      <AttentionItem key="negative" tone="danger" count={inventory.negative_stock_count} title={t("dashboard.negativeStock")} href="/inventory?negative=1" action={t("common.view")} />
    ),
    n(sales?.overdue_count) > 0 && (
      <AttentionItem key="overdue" count={sales.overdue_count} title={t("improvements.overdue")} href="/sales?tab=invoices&overdue=1" action={t("common.view")} />
    ),
    sections.salary_advances?.pending_count > 0 && (
      <AttentionItem key="advances" count={sections.salary_advances.pending_count} title={t("dashboard.pendingAdvancesTitle")}
        detail={t("dashboard.pendingAdvancesMessage", { count: sections.salary_advances.pending_count })}
        href="/hr?tab=advances" action={t("dashboard.reviewAdvances")} />
    ),
    canRead("inventory") && n(inventory?.low_stock_count) > 0 && (
      <AttentionItem key="low" count={inventory.low_stock_count} title={t("dashboard.lowStock")} href="/inventory?low_stock=1" action={t("common.view")} />
    ),
    n(inventory?.expiring_batch_count) > 0 && (
      <AttentionItem key="expiring" count={inventory.expiring_batch_count} title={t("dashboard.expiringBatches")} />
    ),
    n(returns?.pending_disposition_count) > 0 && (
      canRead("sales_returns")
        ? <AttentionItem key="returns" count={returns.pending_disposition_count} title={t("dashboard.awaitingDisposition")} detail={t("dashboard.quarantined")} href="/returns" action={t("improvements.reviewReturns")} />
        : <AttentionItem key="returns" count={returns.pending_disposition_count} title={t("dashboard.awaitingDisposition")} detail={t("dashboard.quarantined")} />
    ),
    notShop && n(hr?.pending_leave_count) > 0 && (
      <AttentionItem key="leave" count={hr.pending_leave_count} title={t("dashboard.pendingLeave")} detail={t("dashboard.awaitingApproval")} />
    ),
    sections.advance_requests && !advanceAlertDismissed && (
      <AttentionItem key="requests" tone="accent" title={t("dashboard.advanceRequestStatus")}
        detail={t("dashboard.advanceRequestMessage", sections.advance_requests)}
        href="/hr?tab=advances" onClick={dismissAdvanceRequestAlert} action={t("dashboard.viewAdvanceRequests")} />
    ),
    data.setup?.some((step) => !step.done) && !setupHidden && (
      <AttentionItem key="setup" tone="accent"
        count={`${setupDone}/${setupTotal}`}
        title={t("improvements.checklist")}
        detail={<>
          {setupNext && t("dashboard.setupNext", { step: t(`improvements.${setupNext.key}`) })}
          {/* ui-allow: progress indicator (setup checklist) */}
          <span className="mt-2 block h-1.5 max-w-xs overflow-hidden rounded-full bg-line" role="progressbar" aria-label={t("improvements.checklist")} aria-valuetext={t("improvements.checklistProgress", { done: setupDone, total: setupTotal })} aria-valuemin={0} aria-valuemax={setupTotal} aria-valuenow={setupDone}>
            <span className="block h-full rounded-full bg-accent" style={{ width: `${(setupDone / setupTotal) * 100}%` }} />
          </span>
        </>}
        actions={<>
          {setupNext && <Link href={setupNext.href} className="tap inline-flex min-h-10 items-center rounded-control px-3 text-sm font-medium text-accent hover:bg-surface">{t("improvements.openStep")}</Link>}
          <Button variant="ghost" onClick={hideSetup}>{t("improvements.checklistHide")}</Button>
        </>}
      />
    ),
  ].filter(Boolean) : [];

  const purchasingReturnsTitle = [purchasing && t("dashboard.purchasing"), returns && t("dashboard.returns")].filter(Boolean).join(" · ");
  const hasSections = Object.keys(sections).length > 0;

  return (
    <div>
      <PageHeader
        title={t("dashboard.title")}
        subtitle={[user?.company_name || t("shell.workspace"), translateRole(user?.role_name, t)].filter(Boolean).join(" · ")}
        actions={can("users.assign_owner") && (
          <Link className="tap inline-flex min-h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-accent/40" href="/users">
            <UserPlus size={16} aria-hidden="true" />{t("users.manageOwners")}
          </Link>
        )}
      />

      {error && (
        <div className="rounded-card border border-line bg-surface p-6 text-muted">
          <p role="alert">{t("dashboard.loadError")}</p><Button className="mt-3" onClick={load}>{t("improvements.retry")}</Button>
        </div>
      )}

      {!data && !error && <DashboardSkeleton />}

      {data && (
        <div className="dashboard-c">
          {(sales || actions.length > 0) && (
            <PrimaryBlock title={t("dashboard.today")} meta={today} actions={actions.length ? actions : null}>
              {sales && (
                <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-end">
                  <Link href="/sales?tab=invoices" className="tap block min-w-0 rounded-control">
                    <span className="text-sm text-muted">{t("improvements.todaySales")}</span>
                    <Figure value={money(sales.today_total)} size="xl" className="mt-1" valueClassName="font-bold text-ink" />
                  </Link>
                  <FigureRow cols={2} items={[
                    { key: "month", label: t("dashboard.revenueMonth"), value: money(sales.revenue_total) },
                    { key: "invoices", label: t("dashboard.invoices"), value: sales.invoice_count, href: "/sales?tab=invoices" },
                  ]} />
                </div>
              )}
            </PrimaryBlock>
          )}

          {hasSections && (attention.length > 0 ? (
            <AttentionList title={t("dashboard.attention")}>{attention}</AttentionList>
          ) : (
            <p className="text-sm text-muted">{t("dashboard.allClear")}</p>
          ))}

          <div className="dashboard-c__sections">
            {debts && (
              <DefinitionSection title={t("dashboard.debtLedger")} link={{ href: "/debts", label: t("common.view") }} className="dashboard-c__wide">
                <FigureRow cols={4} items={[
                  { key: "outstanding", label: t("dashboard.outstandingReceivables"), value: money(debts.outstanding), href: "/debts" },
                  { key: "overdue", label: t("dashboard.overdueReceivables"), value: money(debts.overdue), tone: "warn", href: "/debts?status=overdue" },
                  { key: "owing", label: t("dashboard.customersOwing"), value: debts.debtor_count, href: "/debts?status=owing" },
                  { key: "credit", label: t("dashboard.customerCredit"), value: money(debts.credit_balance), href: "/debts?status=credit" },
                ]} />
              </DefinitionSection>
            )}

            {finance && (
              <DefinitionSection title={t("dashboard.financeMonth")} items={[
                { key: "revenue", label: t("dashboard.revenueLabel"), value: money(finance.revenue) },
                { key: "expenses", label: t("dashboard.expensesLabel"), value: money(finance.expenses) },
                // Count differences and damage at cost (review 2026-09-24):
                // part of net profit, shown so the net figure adds up.
                n(finance.stock_adjustments) !== 0 && { key: "adjust", label: t("dashboard.stockAdjustments"), value: money(finance.stock_adjustments), tone: n(finance.stock_adjustments) > 0 ? "warn" : undefined },
                { key: "net", label: t("improvements.netProfit"), value: money(finance.net), tone: n(finance.net) < 0 ? "danger" : undefined },
              ]} />
            )}

            {sales && (
              <DefinitionSection title={t("dashboard.sales")} link={{ href: "/sales?tab=invoices", label: t("common.view") }}>
                {/* This month's top products by invoiced amount (gross,
                    before returns), scoped like the sales totals. */}
                {sales.top_products?.length > 0 && (
                  <div className="pt-3">
                    <h3 className="mb-3 text-sm text-muted">{t("dashboard.topProductsMonth")}</h3>
                    <BarList items={sales.top_products.map((p) => ({ label: p.label, value: Number(p.value) }))} />
                  </div>
                )}
              </DefinitionSection>
            )}

            {inventory && (
              <DefinitionSection title={t("dashboard.inventory")} link={canRead("inventory") ? { href: "/inventory", label: t("common.view") } : null} items={[
                { key: "products", label: t("dashboard.products"), value: inventory.product_count },
                { key: "low", label: t("dashboard.lowStock"), value: inventory.low_stock_count, tone: "warn", hint: n(inventory.low_stock_count) > 0 ? undefined : t("dashboard.aboveReorder") },
                { key: "expiring", label: t("dashboard.expiringBatches"), value: inventory.expiring_batch_count ?? 0, tone: "warn" },
                { key: "negative", label: t("dashboard.negativeStock"), value: inventory.negative_stock_count ?? 0, tone: "danger" },
              ]} />
            )}

            {(purchasing || returns) && (
              <DefinitionSection title={purchasingReturnsTitle} items={[
                purchasing && { key: "suppliers", label: t("dashboard.suppliers"), value: purchasing.supplier_count },
                purchasing && { key: "bills", label: t("dashboard.bills"), value: purchasing.bill_count },
                returns && { key: "returns", label: t("dashboard.awaitingDisposition"), value: returns.pending_disposition_count, tone: "warn", hint: t("dashboard.quarantined") },
              ]} />
            )}

            {notShop && crm && (
              <DefinitionSection title={t("dashboard.crm")} items={[
                { key: "leads", label: t("dashboard.openLeads"), value: crm.open_lead_count },
                { key: "pipeline", label: t("dashboard.pipelineValue"), value: money(crm.pipeline_value) },
              ]} />
            )}

            {notShop && hr && (
              <DefinitionSection title={t("dashboard.hr")} items={[
                { key: "employees", label: t("dashboard.employees"), value: hr.employee_count },
                { key: "leave", label: t("dashboard.pendingLeave"), value: hr.pending_leave_count, tone: "warn" },
              ]} />
            )}

            {notShop && website && (
              <DefinitionSection title={t("dashboard.website")} items={[
                { key: "status", label: t("dashboard.siteStatus"), value: website.is_published ? t("dashboard.published") : t("dashboard.draft"), tone: website.is_published ? "ok" : "warn", hint: website.is_published ? undefined : t("dashboard.publishHint") },
                { key: "sections", label: t("dashboard.pageSections"), value: website.section_count, hint: website.section_count === 0 ? t("dashboard.addSectionsHint") : undefined },
              ]} />
            )}
          </div>

          {!hasSections && (
            <p className="text-muted">{t("dashboard.noSections")}</p>
          )}
        </div>
      )}
    </div>
  );
}
