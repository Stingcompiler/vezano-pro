// Today's date as the person at the device sees it (YYYY-MM-DD).
//
// `new Date().toISOString().slice(0, 10)` is the UTC date: in Khartoum
// (UTC+2) an expense entered at 01:00 on the 1st defaulted to the last day
// of the previous month — the wrong period.
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Dates and times for display, in the UI language with Latin digits.
//
// The default numbering system of "ar" comes from each browser's ICU data:
// some show 16/10/2026, others ١٦/١٠/٢٠٢٦. The product shows Latin digits
// everywhere (docs/ui-profile.md), so Arabic is pinned to `ar-u-nu-latn`.
// Every date on screen goes through these helpers; the option sets are the
// caller's, unchanged, and so is the timezone (the device's, as before) and
// the parsing (a value is passed to `new Date` exactly as the caller gave it).
//
// `english`: the locale for English — "en" unless a screen already used
// another (the dashboard and /track use "en-GB" for day-first dates).
//
// The result is bidi-isolated: wrapped in FIRST STRONG ISOLATE (U+2068) …
// POP DIRECTIONAL ISOLATE (U+2069), the plain-text form of <bdi>. A date
// mixes digits with Arabic words ("16/10/2026، 2:05 م"), and most dates
// sit inside a sentence or a translated string ("فتحه E2E Owner · <date>"):
// without isolation the digits joined the Latin name's run and the line
// read out of order. The marks are invisible and work inside t(...)
// interpolation, title attributes and SVG text, where <bdi> cannot go.
export const ARABIC_DATE_LOCALE = "ar-u-nu-latn";

export function dateLocale(language, english = "en") {
  return language === "ar" ? ARABIC_DATE_LOCALE : english;
}

const toDate = (value) => (value instanceof Date ? value : new Date(value));

const FSI = "\u2068";
const PDI = "\u2069";

// Text isolated from the direction of whatever surrounds it.
export function isolate(text) {
  return `${FSI}${text}${PDI}`;
}

// Date only (Date#toLocaleDateString).
export function formatDate(value, language, options, english) {
  return isolate(toDate(value).toLocaleDateString(dateLocale(language, english), options));
}

// Date and time (Date#toLocaleString).
export function formatDateTime(value, language, options, english) {
  return isolate(toDate(value).toLocaleString(dateLocale(language, english), options));
}

// Time only (Date#toLocaleTimeString).
export function formatTime(value, language, options, english) {
  return isolate(toDate(value).toLocaleTimeString(dateLocale(language, english), options));
}
