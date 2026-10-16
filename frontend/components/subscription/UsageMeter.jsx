"use client";

import { useI18n } from "../../app/providers/I18nProvider";

// What the plan allows against what the company actually has — the same
// counters the server enforces at create/sign-in, so a full bar here means
// the next attempt is refused there.
export const USAGE_KEYS = ["devices", "users", "branches", "warehouses"];

export function usageTone(cell) {
  if (!cell || cell.limit == null) return "muted";
  if (cell.used > cell.limit) return "danger";
  if (cell.used >= cell.limit) return "warn";
  return "ok";
}

// "3 / 5" is one left-to-right run (bdi), so an Arabic line cannot reorder
// it into "5 / 3". A counter with no limit has nothing to fill: it shows the
// count and "unlimited" in words, and no bar.
export default function UsageMeter({ usage, compact = false }) {
  const { t } = useI18n();
  if (!usage) return null;
  return (
    <div className={compact ? "grid gap-x-6 gap-y-3 sm:grid-cols-2" : "space-y-3"}>
      {USAGE_KEYS.filter((key) => usage[key]).map((key) => {
        const cell = usage[key];
        const tone = usageTone(cell);
        const unlimited = cell.limit == null;
        const pct = unlimited ? 0 : cell.limit ? Math.min(100, Math.round((cell.used / cell.limit) * 100)) : 100;
        const bar = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" }[tone];
        return (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{t(`usage.${key}`)}</span>
              {unlimited ? (
                <span className="whitespace-nowrap">
                  <bdi dir="ltr" className="tabular font-semibold">{cell.used}</bdi>
                  <span className="text-muted"> · {t("usage.unlimited")}</span>
                </span>
              ) : (
                <bdi dir="ltr" className={`tabular whitespace-nowrap font-semibold ${tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : ""}`}>
                  {cell.used}<span className="font-normal text-muted"> / {cell.limit}</span>
                </bdi>
              )}
            </div>
            {!unlimited && (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
