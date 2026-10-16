"use client";

// The operational reports the build plan asked for alongside the financial
// ones (M5/M9): returns (sales and purchase), payment reconciliation
// (recorded vs verified) and the CRM pipeline. Each loads only for a role
// whose report areas include it — the server enforces the same map.

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";

import { API_BASE, reports } from "@/lib/api";
import { useAuth } from "../../app/providers/AuthProvider";
import { useI18n } from "../../app/providers/I18nProvider";
import { Badge, FigureRow, NumText } from "@/components/ui/kit";
import BarList from "@/components/reports/BarList";
import { SkeletonLines } from "@/components/ui/Skeleton";
import { ReportFailed } from "@/components/reports/ReportState";
import ReportSection from "@/components/reports/ReportSection";
import { slotFromError } from "@/lib/reportSlots";
import { formatAmount } from "@/lib/money";

// A report with its CSV link at the end of its heading line.
function Section({ title, hint, csvHref, children }) {
  return (
    <ReportSection
      title={title}
      hint={hint}
      action={csvHref && (
        <a href={csvHref} className="tap inline-flex h-8 items-center gap-1 rounded-control border border-line px-2.5 text-xs text-ink hover:bg-paper">
          <Download size={13} />CSV
        </a>
      )}
    >
      {children}
    </ReportSection>
  );
}

export default function OperationalReports({ range, areas }) {
  const { t } = useI18n();
  const { canRead } = useAuth();
  const money = (v) => formatAmount(v);
  const count = (v) => Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 3 });
  const pct = (v) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`);
  const sales = areas.includes("sales");
  const purchasing = areas.includes("purchasing");
  const finance = areas.includes("finance");
  // Leads carry names and phone numbers: the sales report area is not
  // enough, the reader must be allowed into the CRM (the server agrees).
  const crmReport = sales && canRead("crm");

  const [salesReturns, setSalesReturns] = useState(null);
  const [purchaseReturns, setPurchaseReturns] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [crm, setCrm] = useState(null);

  const params = {};
  if (range.start) params.start = range.start;
  if (range.end) params.end = range.end;
  const csv = (path) => `${API_BASE}${path}?${new URLSearchParams({ ...params, format: "csv" })}`;

  // Each card loads (and retries) on its own: null = loading, a string =
  // why it failed (lib/reportSlots), anything else = the answer.
  const fetchers = useCallback(() => {
    const p = {};
    if (range.start) p.start = range.start;
    if (range.end) p.end = range.end;
    return {
      salesReturns: [sales, () => reports.salesReturns(p), setSalesReturns],
      crm: [crmReport, () => reports.crm(p), setCrm],
      purchaseReturns: [purchasing, () => reports.purchaseReturns(p), setPurchaseReturns],
      reconciliation: [finance, () => reports.paymentReconciliation(p), setReconciliation],
    };
  }, [range.start, range.end, sales, crmReport, purchasing, finance]);

  // A card already showing an answer keeps it (dimmed, `refreshing`) while
  // the new period loads, so its bars move to the new values instead of
  // redrawing from a skeleton; a card with nothing yet shows its skeleton.
  const [refreshing, setRefreshing] = useState(0);
  const fetchOne = useCallback(([wanted, fetch, setter]) => {
    if (!wanted) return;
    setter((prev) => (prev && typeof prev === "object" ? prev : null));
    setRefreshing((n) => n + 1);
    fetch().then((r) => setter(r.data)).catch((err) => setter(slotFromError(err)))
      .finally(() => setRefreshing((n) => n - 1));
  }, []);

  useEffect(() => {
    Object.values(fetchers()).forEach(fetchOne);
  }, [fetchers, fetchOne]);

  if (!sales && !purchasing && !finance) return null;
  const body = (key, data, render) =>
    data === null ? <SkeletonLines />
      : typeof data === "string" ? <ReportFailed status={data} onRetry={() => fetchOne(fetchers()[key])} />
        : render(data);

  return (
    <div aria-busy={refreshing > 0 || undefined}
      className={`mt-10 grid gap-x-8 gap-y-10 transition-opacity duration-200 lg:grid-cols-2 ${refreshing > 0 ? "opacity-60" : ""}`}>
      {finance && (
        <div className="lg:col-span-2">
          <Section title={t("reports.ops.reconciliation")} hint={t("reports.ops.reconciliationHint")} csvHref={csv("/reports/payment-reconciliation/")}>
            {body("reconciliation", reconciliation, (d) => (
              <>
                <FigureRow cols={4} items={[
                  { key: "recorded", label: t("reports.ops.recorded"), value: `${count(d.recorded.count)} · ${money(d.recorded.amount)}` },
                  { key: "verified", label: t("reports.ops.verified"), value: `${count(d.verified.count)} · ${money(d.verified.amount)}`, tone: "ok" },
                  { key: "unverified", label: t("reports.ops.unverified"), value: `${count(d.unverified.count)} · ${money(d.unverified.amount)}`, tone: d.unverified.count ? "warn" : undefined },
                  { key: "rate", label: t("reports.ops.verifiedRate"), value: pct(d.verified_rate) },
                ]} />
                {d.oldest_unverified_days != null && (
                  <p className="mt-3 text-sm text-warn">{t("reports.ops.oldestUnverified", { days: d.oldest_unverified_days })}</p>
                )}
                {d.by_account.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line text-xs text-muted">
                          <th className="px-2 py-2 text-start font-medium">{t("reports.ops.account")}</th>
                          <th className="px-2 py-2 text-end font-medium">{t("reports.ops.recorded")}</th>
                          <th className="px-2 py-2 text-end font-medium">{t("reports.ops.verified")}</th>
                          <th className="px-2 py-2 text-end font-medium">{t("reports.ops.unverified")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.by_account.map((row) => (
                          <tr key={row.account ?? "none"} className="border-b border-line last:border-0">
                            <td className="px-2 py-2 text-ink">{row.name || t(`reports.ops.method.${row.method || "cash"}`)}</td>
                            <td className="tabular px-2 py-2 text-end"><NumText value={money(row.recorded)} /></td>
                            <td className="tabular px-2 py-2 text-end text-ok"><NumText value={money(row.verified)} /></td>
                            <td className={`tabular px-2 py-2 text-end ${Number(row.unverified) ? "text-warn" : "text-muted"}`}><NumText value={money(row.unverified)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ))}
          </Section>
        </div>
      )}

      {sales && (
        <Section title={t("reports.ops.salesReturns")} hint={t("reports.ops.salesReturnsHint")} csvHref={csv("/reports/sales-returns/")}>
          {body("salesReturns", salesReturns, (d) => (
            <>
              <FigureRow cols={2} items={[
                { key: "returns", label: t("reports.ops.returns"), value: count(d.return_count) },
                { key: "quantity", label: t("reports.ops.quantity"), value: count(d.quantity) },
                { key: "credited", label: t("reports.ops.credited"), value: money(d.credit_total) },
                { key: "refunded", label: t("reports.ops.refunded"), value: money(d.refund_total) },
              ]} />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.by_disposition.map((row) => (
                  <Badge key={row.disposition} tone={row.disposition === "scrapped" ? "danger" : row.disposition === "restocked" ? "ok" : "warn"}>
                    {t(`reports.ops.disposition.${row.disposition}`)} · {count(row.quantity)}
                  </Badge>
                ))}
              </div>
              {Number(d.written_off_total) > 0 && (
                <p className="mt-2 text-xs text-danger">{t("reports.ops.writtenOff", { amount: money(d.written_off_total) })}</p>
              )}
              <h3 className="mb-3 mt-6 text-sm font-medium text-ink">{t("reports.ops.topReturned")}</h3>
              <BarList items={d.top_products} labelKey="name" valueKey="quantity" format={count} />
            </>
          ))}
        </Section>
      )}

      {purchasing && (
        <Section title={t("reports.ops.purchaseReturns")} hint={t("reports.ops.purchaseReturnsHint")} csvHref={csv("/reports/purchase-returns/")}>
          {body("purchaseReturns", purchaseReturns, (d) => (
            <>
              <FigureRow cols={2} items={[
                { key: "returns", label: t("reports.ops.returns"), value: count(d.return_count) },
                { key: "debited", label: t("reports.ops.debited"), value: money(d.debit_total) },
              ]} />
              <h3 className="mb-3 mt-6 text-sm font-medium text-ink">{t("reports.ops.bySupplier")}</h3>
              <BarList items={d.by_supplier} labelKey="name" valueKey="amount" format={money} />
            </>
          ))}
        </Section>
      )}

      {crmReport && (
        <Section title={t("reports.ops.crm")} hint={t("reports.ops.crmHint")} csvHref={csv("/reports/crm/")}>
          {body("crm", crm, (d) => (
            <>
              <FigureRow cols={2} items={[
                { key: "leads", label: t("reports.ops.newLeads"), value: count(d.new_leads) },
                { key: "pipeline", label: t("reports.ops.pipeline"), value: money(d.pipeline_value) },
                { key: "conversion", label: t("reports.ops.conversion"), value: pct(d.conversion_rate) },
                { key: "overdue", label: t("reports.ops.overdueFollowUps"), value: count(d.follow_ups.overdue), tone: d.follow_ups.overdue ? "warn" : undefined },
              ]} />
              <h3 className="mb-3 mt-6 text-sm font-medium text-ink">{t("reports.ops.byStage")}</h3>
              <BarList
                items={d.stages.map((row) => ({ ...row, label: t(`reports.ops.stage.${row.stage}`) }))}
                valueKey="count"
                format={count}
              />
            </>
          ))}
        </Section>
      )}
    </div>
  );
}
