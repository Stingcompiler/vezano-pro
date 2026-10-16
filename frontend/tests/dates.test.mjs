import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ARABIC_DATE_LOCALE,
  dateLocale,
  formatDate,
  formatDateTime,
  formatTime,
  isolate,
  localToday,
} from "../lib/dates.js";

test("the local calendar day, not the UTC one", () => {
  // 00:30 local on 1 Oct: whatever the machine's zone, the local fields win.
  const d = new Date(2026, 9, 1, 0, 30);
  assert.equal(localToday(d), "2026-10-01");
});

const ARABIC_INDIC = /[٠-٩۰-۹]/;
// A local moment, so the expected fields do not depend on the machine's zone.
const MOMENT = new Date(2026, 9, 16, 14, 5, 9);

test("Arabic is pinned to Latin digits, English stays as asked", () => {
  assert.equal(dateLocale("ar"), ARABIC_DATE_LOCALE);
  assert.equal(dateLocale("ar"), "ar-u-nu-latn");
  assert.equal(dateLocale("en"), "en");
  assert.equal(dateLocale("en", "en-GB"), "en-GB");
  // Arabic ignores the English override.
  assert.equal(dateLocale("ar", "en-GB"), "ar-u-nu-latn");
  assert.equal(new Intl.DateTimeFormat(dateLocale("ar")).resolvedOptions().numberingSystem, "latn");
});

test("no Arabic-Indic digit in any Arabic shape the app uses", () => {
  const shapes = [
    () => formatDate(MOMENT, "ar"),
    () => formatDate(MOMENT, "ar", { dateStyle: "medium" }),
    () => formatDate(MOMENT, "ar", { day: "numeric", month: "short" }),
    () => formatDate(MOMENT, "ar", { month: "long", year: "numeric" }),
    () => formatDateTime(MOMENT, "ar"),
    () => formatDateTime(MOMENT, "ar", { dateStyle: "medium", timeStyle: "short" }),
    () => formatDateTime(MOMENT, "ar", { dateStyle: "short", timeStyle: "short" }),
    () => formatTime(MOMENT, "ar"),
  ];
  for (const shape of shapes) {
    const text = shape();
    assert.doesNotMatch(text, ARABIC_INDIC, text);
    assert.match(text, /\d/, text);
  }
  // The control: a locale whose default is Arabic-Indic does show them.
  assert.match(MOMENT.toLocaleDateString("ar-u-nu-arab"), ARABIC_INDIC);
});

test("the output is the platform's own for the pinned locale and the caller's options", () => {
  const opts = { dateStyle: "medium", timeStyle: "short" };
  assert.equal(formatDateTime(MOMENT, "ar", opts), isolate(MOMENT.toLocaleString("ar-u-nu-latn", opts)));
  assert.equal(formatDateTime(MOMENT, "en", opts), isolate(MOMENT.toLocaleString("en", opts)));
  assert.equal(formatDate(MOMENT, "en"), isolate(MOMENT.toLocaleDateString("en")));
  assert.equal(formatTime(MOMENT, "en"), isolate(MOMENT.toLocaleTimeString("en")));
  assert.equal(formatDate(MOMENT, "en", { day: "numeric", month: "long" }, "en-GB"), isolate("16 October"));
  assert.match(formatDate(MOMENT, "ar"), /16.*10.*2026/);
  assert.match(formatTime(MOMENT, "ar"), /2:05:09/);
});

test("every date is bidi-isolated, so the sentence around it cannot reorder it", () => {
  assert.equal(isolate("x"), "\u2068x\u2069");
  for (const text of [formatDate(MOMENT, "ar"), formatDateTime(MOMENT, "en"), formatTime(MOMENT, "ar")]) {
    assert.ok(text.startsWith("\u2068"), JSON.stringify(text));
    assert.ok(text.endsWith("\u2069"), JSON.stringify(text));
    // Exactly one isolate pair: nothing nested, nothing left open.
    assert.equal(text.split("\u2068").length, 2);
    assert.equal(text.split("\u2069").length, 2);
  }
});

test("strings and numbers are parsed as the caller's new Date would", () => {
  const iso = "2026-10-16T08:00:00Z";
  assert.equal(formatDateTime(iso, "ar"), isolate(new Date(iso).toLocaleString("ar-u-nu-latn")));
  // A bare day keeps its usual (UTC) parse; callers that want local midnight
  // still append T00:00:00 themselves.
  assert.equal(formatDate("2026-10-16", "en"), isolate(new Date("2026-10-16").toLocaleDateString("en")));
  assert.equal(formatDate("2026-10-16T00:00:00", "en"), isolate("10/16/2026"));
  assert.equal(formatDate(MOMENT.getTime(), "en"), isolate(MOMENT.toLocaleDateString("en")));
});

// The guard: a date formatted anywhere else would bring back the browser's
// own Arabic digits. Numbers may still use toLocaleString("en-US", …).
test("no screen formats a date itself", () => {
  const frontend = join(dirname(fileURLToPath(import.meta.url)), "..");
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, out);
      else if (/\.(jsx?|mjs)$/.test(name)) out.push(path);
    }
    return out;
  };
  const RAW = /toLocale(?:Date|Time)String\(|toLocaleString\(\s*(?:language|locale|"ar|undefined)|new Intl\.DateTimeFormat\(/;
  const hits = [];
  for (const file of ["app", "components", "lib"].flatMap((d) => walk(join(frontend, d)))) {
    const rel = relative(frontend, file);
    if (rel === join("lib", "dates.js")) continue;
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (RAW.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, [], "format dates with lib/dates.js (formatDate/formatDateTime/formatTime)");
});
