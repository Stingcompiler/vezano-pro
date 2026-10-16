"use client";

// One report on the reports page: flat on the page, no card (docs/ui-profile.md,
// direction C). A heading with a hairline under it, an optional hint, and its
// own actions (CSV, a period select) at the end of the heading line. Figures
// inside are a FigureRow or a definition list, charts and tables sit directly
// under the heading.
export default function ReportSection({ title, hint, action, className = "", children }) {
  return (
    <section className={`min-w-0 ${className}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-line pb-2">
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
