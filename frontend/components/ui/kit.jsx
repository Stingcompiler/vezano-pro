"use client";

import { cloneElement, forwardRef, isValidElement, useId } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { figureFitStyle, splitFigure } from "../../lib/figureFit";
import { useCountUp } from "../../lib/useCountUp";

// Press feedback: the button gives a little (scale 0.98 in 100 ms) while it
// is held, and its colours, border and focus halo ease in over 150 ms. The
// scale is `motion-safe:` only, and the reduced-motion rule in globals.css
// cuts the colour transition to nothing; the click itself is never delayed.
const BUTTON_MOTION =
  "transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-150 ease-motion active:duration-100 motion-safe:active:scale-[0.98] focus-visible:shadow-[0_0_0_4px_rgb(var(--accent)/0.15)]";

export function Button({ variant = "primary", className = "", ...props }) {
  const base =
    `tap inline-flex items-center justify-center gap-2 min-h-10 rounded-control px-4 py-2 text-sm font-semibold ${BUTTON_MOTION} disabled:opacity-50 disabled:pointer-events-none`;
  const variants = {
    primary: "bg-accent text-on-accent shadow-sm hover:bg-accent-strong",
    ghost: "text-muted hover:bg-paper hover:text-ink",
    outline: "border border-line bg-surface text-ink shadow-sm hover:border-accent/40 hover:bg-paper",
    danger: "bg-danger text-on-danger hover:opacity-90",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

// A labelled control with its hint and error wired for assistive tech: the
// control gets a stable id, `aria-describedby` points at the hint/error text,
// and `aria-invalid` follows `error`. Callers keep passing a bare <Input>;
// nothing changes visually unless `error` is set.
export function Field({ label, hint, error, children }) {
  const generated = useId();
  const control = isValidElement(children) ? children : null;
  const id = control?.props?.id || generated;
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const child = control
    ? cloneElement(control, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;
  return (
    <div className="block">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">{label}</label>
      {child}
      {hint && <span id={hintId} className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span id={errorId} role="alert" className="mt-1 block text-xs text-danger">{error}</span>}
    </div>
  );
}

export const controlClass =
  "tap w-full rounded-control border border-line bg-surface min-h-10 px-3 py-2 text-sm text-ink shadow-sm outline-none transition-colors hover:border-muted/40 focus:border-accent focus:ring-2 focus:ring-accent/15";

// forwardRef so callers can focus the field programmatically — the barcode
// scanner relies on refocusing after every scan.
// A caller passing its own width (`w-20`, `w-28`) means it; controlClass's
// `w-full` must yield to it instead of racing it in the stylesheet order.
function sized(className) {
  return /\bw-\S+/.test(className) ? controlClass.replace("w-full ", "") : controlClass;
}

// A date or time control lays its fields out in the page direction: on an
// Arabic (RTL) page "10/05/2026, 01:40" came out reordered as
// "10 / 05 / 2026 , 40 : 1". Its fields are Latin-ordered, so it is LTR
// unless a caller says otherwise.
const LTR_TYPES = new Set(["date", "datetime-local", "time", "month", "week"]);

export const Input = forwardRef(function Input({ className = "", ...props }, ref) {
  const dir = props.dir ?? (LTR_TYPES.has(props.type) ? "ltr" : undefined);
  return <input ref={ref} className={`${sized(className)} ${className}`} {...props} dir={dir} />;
});

export function Select({ className = "", children, ...props }) {
  return (
    <select className={`${sized(className)} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Badge({ tone = "muted", className = "", children }) {
  const tones = {
    muted: "bg-paper text-muted",
    ok: "bg-ok/10 text-ok",
    warn: "bg-warn/10 text-warn",
    danger: "bg-danger/10 text-danger",
    accent: "bg-accent/10 text-accent",
  };
  return (
    <span
      className={`badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

// A number in Latin digits that keeps its own left-to-right order inside
// Arabic text. Without isolation a negative stock of -3 read "3-" in RTL:
// the minus is a neutral character and took the paragraph's direction.
// A bdi element with dir="ltr" isolates it (unicode-bidi: isolate; direction: ltr).
const NUMERIC = /^[-+−]?[\d.,%/\s×]*\d[\d.,%/\s×]*$/u;

export function isNumericText(value) {
  return value !== null && value !== undefined && NUMERIC.test(String(value).trim());
}

// A figure's text with only its number isolated: "1,234.00 ج.س" keeps the
// currency label after the number in the reading direction (to its left in
// Arabic), while "-3" or "-1,234.00" can no longer flip. Text that is not a
// number ("منشور", "—") passes through.
export function NumText({ value }) {
  const parts = splitFigure(value);
  if (parts) return <><bdi dir="ltr">{parts[0]}</bdi> <span>{parts[1]}</span></>;
  if (isNumericText(value)) return <bdi dir="ltr">{value}</bdi>;
  return value ?? null;
}

// True for a figure that is zero: 0, "0", "0.00 ج.س". A zero is "nothing
// to see", so rows of figures show it quietly (muted, regular weight)
// instead of in the same voice as the day's takings.
export function isZeroFigure(value) {
  if (value === null || value === undefined || value === "") return false;
  // The first number in the text: "0.00 ج.س" has a second "." in its label.
  const match = String(value).replace(/−/g, "-").match(/-?[\d,]*\.?\d+/);
  if (!match) return false;
  const n = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(n) && n === 0;
}

// A headline figure ("615,480.00 ج.س", "12"). It shrinks with its length to
// fit its box on one line (lib/figureFit.js + .figure-fit in globals.css).
// `size`: "xl" (20px phone → 30px wider), "lg" (24px), "md" (20px) is the
// largest it gets; long figures go down to 11px. The number itself never
// breaks; only in a box too narrow even at 11px does the currency label
// move, whole, under the number. The number is bidi-isolated (NumText).
//
// It counts to its value when it appears and when the value changes
// (lib/useCountUp.js): the count is drawn over the final text, which keeps
// sizing the box, so nothing moves. `animate={false}` where a count would
// distract (a receipt, a row of figures, a list); reduced motion and
// printing always show the final figure at once.
// `chars`: size the figure as if it were that many cells long. A row of
// figures passes the longest one's length so every figure in it matches
// (lib/planDeck.js sharedFigureChars).
export function Figure({ value, size = "lg", className = "", valueClassName = "", animate = true, chars }) {
  const parts = splitFigure(value);
  const { counting, overlay, numberRef } = useCountUp(value, animate);
  const overlayParts = counting ? splitFigure(overlay) : null;
  return (
    <div className={`figure-fit ${className}`}>
      <span
        className={`figure-fit__value figure-${size} tabular ${parts ? "figure-fit__value--money" : ""} ${counting ? "figure-count" : ""} ${valueClassName}`}
        style={chars ? { "--figure-chars": chars } : figureFitStyle(value)}
      >
        <NumText value={value} />
        {counting && (
          <span className="figure-count__overlay" aria-hidden="true">
            {overlayParts
              ? <><bdi dir="ltr" ref={numberRef}>{overlayParts[0]}</bdi> <span>{overlayParts[1]}</span></>
              : <bdi dir="ltr" ref={numberRef}>{overlay}</bdi>}
          </span>
        )}
      </span>
    </div>
  );
}

// A bordered surface: a hairline, no shadow. Depth is kept for the one
// primary block of a screen (PrimaryBlock below; docs/ui-profile.md, the chosen
// direction). A card that is a link lifts a hair on hover
// (`a > .workspace-card` in globals.css). `style` passes through, e.g. an
// entrance delay (lib/motion.js enterStyle).
export function Card({ className = "", style, children }) {
  return (
    <div className={`workspace-card rounded-card border border-line bg-surface ${className}`} style={style}>
      {children}
    </div>
  );
}

// The screen's primary block: what matters now (today's takings, the next
// action). The ONE raised surface on a screen: soft depth (shadow-raise),
// no border, no tint. `title` is its heading, `meta` a quiet line under it
// (a date, a branch), `actions` its own buttons or links.
export function PrimaryBlock({ title, meta, actions, className = "", children, ...rest }) {
  return (
    <section className={`primary-block rounded-card bg-surface p-4 shadow-raise sm:p-6 ${className}`} {...rest}>
      {(title || meta || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            {title && <h2 className="font-display text-lg font-bold text-ink">{title}</h2>}
            {meta && <p className="mt-0.5 text-sm text-muted">{meta}</p>}
          </div>
          {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const FIGURE_TONE = { warn: "text-warn", danger: "text-danger", ok: "text-ok", accent: "text-accent" };
const ROW_COLS = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5",
};

// Several figures of equal weight side by side, divided by hairlines: no
// card per number, no icons. items: [{ key, label, value, href?, tone?,
// hint? }]. A zero is quiet (muted, regular weight) and never takes its
// tone; a non-zero `tone` (warn/danger/ok/accent) colours the figure, and
// `hint` says in words what the colour means. An item with `href` is one
// link, the whole cell (its only action). `cols`: 2, 3, 4 or 5 on wide
// screens (2 on a phone). Figures do not count up here. `content` (a node)
// stands in for the figure while it has none to show: a loading line, or a
// failure with its own retry.
export function FigureRow({ items, cols = 4, size = "md", className = "" }) {
  const shown = (items || []).filter(Boolean);
  if (!shown.length) return null;
  return (
    <div className={`figure-row overflow-hidden ${className}`}>
      <div className={`-ms-px -mt-px grid ${ROW_COLS[cols] || ROW_COLS[4]}`}>
        {shown.map((item) => {
          const zero = isZeroFigure(item.value);
          const tone = zero ? "font-normal text-muted" : `font-semibold ${FIGURE_TONE[item.tone] || "text-ink"}`;
          const body = (
            <>
              <div className="text-sm text-muted">{item.label}</div>
              {item.content ?? <Figure value={item.value} size={size} animate={false} className="mt-1" valueClassName={tone} />}
              {item.hint && <div className="mt-0.5 text-xs text-muted">{item.hint}</div>}
            </>
          );
          const cell = "figure-row__cell block min-w-0 border-s border-t border-line px-3 py-3 sm:px-4";
          return item.href ? (
            <Link key={item.key || item.label} href={item.href} className={`${cell} tap transition-colors hover:bg-paper focus-visible:bg-paper`}>
              {body}
            </Link>
          ) : (
            <div key={item.key || item.label} className={cell}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}

// "Needs attention": a short list of things to act on, one row each.
// It renders nothing without rows: an empty list is not shown, and the
// caller says "nothing needs you" itself if it wants to.
export function AttentionList({ title, children, className = "" }) {
  const rows = [children].flat(Infinity).filter(Boolean);
  if (!rows.length) return null;
  return (
    <section className={className}>
      {title && <h2 className="mb-2 font-display text-base font-bold text-ink">{title}</h2>}
      <ul className="divide-y divide-line border-y border-line">{rows}</ul>
    </section>
  );
}

// One attention row. `count` (in the row's tone) and `title` say what;
// `detail` adds a line. Behaviour follows the actions:
//   - `href` alone: the whole row is one link (its single action), with
//     `action` as its visible verb and a direction-aware chevron;
//   - `actions` (nodes): the row is not a link and each action is its own
//     target, so clicks never overlap.
// The status is in the words; the tone only colours the count.
export function AttentionItem({ count, title, detail, tone = "warn", href, action, actions, onClick }) {
  const toneClass = FIGURE_TONE[tone] || "text-ink";
  const text = (
    <>
      {count !== undefined && count !== null && (
        <span className={`tabular min-w-8 shrink-0 text-lg font-semibold ${toneClass}`}><NumText value={count} /></span>
      )}
      <span className="min-w-[11rem] flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        {detail && <span className="mt-0.5 block text-xs text-muted">{detail}</span>}
      </span>
    </>
  );
  if (href && !actions) {
    return (
      <li>
        <Link href={href} onClick={onClick} className="tap flex min-h-12 items-center gap-3 px-1 py-3 transition-colors hover:bg-surface focus-visible:bg-surface sm:px-3">
          {text}
          {action && <span className="hidden shrink-0 text-sm font-medium text-accent sm:inline">{action}</span>}
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted rtl:rotate-180" />
        </Link>
      </li>
    );
  }
  return (
    <li className="flex min-h-12 flex-wrap items-center gap-3 px-1 py-3 sm:px-3">
      {text}
      {actions && <span className="flex shrink-0 flex-wrap items-center gap-2">{actions}</span>}
    </li>
  );
}

// A reference section: a heading, an optional link at its end, and its
// facts as a definition list (label at the start, value at the end, one per
// row, hairlines between). Flat on the page: no card, no shadow.
// items: [{ key, label, value, tone?, hint?, href? }]; a zero value is
// quiet. `children` go under the list (a chart, a note).
export function DefinitionSection({ title, link, items, className = "", children }) {
  const shown = (items || []).filter(Boolean);
  return (
    <section className={`definition-section min-w-0 ${className}`}>
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <h2 className="font-display text-base font-bold text-ink">{title}</h2>
        {link && <Link href={link.href} className="tap inline-flex items-center text-sm font-medium text-accent hover:underline">{link.label}</Link>}
      </div>
      {shown.length > 0 && (
        <dl className="divide-y divide-line">
          {shown.map((item) => {
            const zero = isZeroFigure(item.value);
            const valueClass = zero ? "text-muted" : `font-semibold ${FIGURE_TONE[item.tone] || "text-ink"}`;
            const value = <span className={`tabular whitespace-nowrap ${valueClass}`}><NumText value={item.value} /></span>;
            return (
              <div key={item.key || item.label} className="flex min-h-11 items-center justify-between gap-4 py-2">
                <dt className="min-w-0 text-sm text-muted">
                  {item.label}
                  {item.hint && <span className="block text-xs">{item.hint}</span>}
                </dt>
                <dd className="shrink-0 text-end text-sm">
                  {item.href ? <Link href={item.href} className="tap inline-flex items-center hover:underline">{value}</Link> : value}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {children}
    </section>
  );
}

// A small whole number that counts up from zero when it appears and to its
// new value when it changes (the days left in a ring). Same mechanism as
// <Figure>: the final text stays in the layout and sizes the box, and the
// count is drawn over it. Reduced motion and printing show the number.
export function CountUp({ value, className = "" }) {
  const text = value === null || value === undefined ? "" : String(value);
  const { counting, overlay, numberRef } = useCountUp(text);
  return (
    <span className={`${counting ? "figure-count" : ""} ${className}`}>
      {text}
      {counting && (
        <span className="figure-count__overlay" aria-hidden="true">
          <span ref={numberRef}>{overlay}</span>
        </span>
      )}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-7 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
