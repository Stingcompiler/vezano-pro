// The UI guide's text scan (docs/ui-profile.md; guide section 10): finds the
// banned card patterns the way they are written in THIS codebase.
//
//   npm run lint:ui            prints file:line  [pattern]  snippet, exits 1
//                              on any hit; silent with exit 0 when clean
//   npm run lint:ui -- --summary   also prints counts per pattern and file
//   npm run lint:ui -- --migrated  only the files already moved to the chosen
//                              direction (scripts/lint-ui-migrated.json).
//                              `npm test` runs this (tests/lintUi.test.mjs),
//                              so a migrated screen cannot regress while the
//                              rest of the app is still being migrated. Add a
//                              file to the list when its screen is migrated.
//
// Patterns:
//   stripe        a coloured top/side stripe: border-s-4/border-t-2… with an
//                 accent/status colour, a thin absolute bar or a ::before/
//                 ::after bar in a status colour, or the same in CSS
//   tinted-icon   an icon inside a fixed-size circle/square tinted with a
//                 status/accent wash (bg-accent/10, bg-warn/20, bg-paper…)
//   gradient      a gradient on a button, link, heading or as gradient text
//   pulse         a continuous animation (animate-pulse/ping/bounce, CSS
//                 `infinite`, framer `repeat: Infinity`) — skeletons and
//                 spinners on a running process are not counted
//   card-in-card  a card (<Card>, .rounded-card box, a local component whose
//                 root is a card) opened inside another card in the same file
//
// It reads class strings, not rendered pages: nesting across files and
// classes built at runtime are invisible to it. It is a cheap guard against
// regressions, not a review.
//
// Exceptions: a comment containing `ui-allow: <reason>` on the same line or
// the line above silences that line, e.g.
//   {/* ui-allow: active tab indicator */}
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN = ["app", "components"];
const EXT = /\.(jsx?|tsx?|css)$/;
const SUMMARY = process.argv.includes("--summary");
const MIGRATED = process.argv.includes("--migrated")
  ? new Set(JSON.parse(readFileSync(join(FRONTEND, "scripts", "lint-ui-migrated.json"), "utf8")).files)
  : null;

const COLOR = "(?:accent|ok|warn|danger|pro|brand|(?:red|green|emerald|amber|yellow|orange|sky|blue|indigo|violet|purple|rose|pink|teal|cyan|lime)-\\d{2,3})";
// A light wash, not a solid fill and not a hover-only state: bg-accent/10,
// bg-paper, bg-sky-50 — the class itself, not `hover:bg-…`.
const STATUS_BG = new RegExp(`(?:^|\\s)bg-(?:${COLOR}/\\d+|paper(?:/\\d+)?|(?:\\w+)-(?:50|100))(?=\\s|$)`);
const SIDE_WIDTH = /(?:^|\s|:)border-(?:s|e|l|r|t|x|y)-(?:[2-8]|\[\d+px\])(?=\s|$)/;
const BOTTOM_WIDTH = /(?:^|\s|:)border-b-(?:[2-8]|\[\d+px\])(?=\s|$)/;
const COLORED_BORDER = new RegExp(`(?:^|\\s|:)border-(?:[setblrxy]-)?${COLOR}(?:/\\d+)?(?=\\s|$)`);
const CARD_CUES = /\b(?:rounded-card|shadow-card|workspace-card|bg-surface)\b/;
const BAR = /(?:^|\s)(?:w-(?:0\.5|1|1\.5|\[[2-6]px\])|h-(?:0\.5|1|\[[2-6]px\]))(?=\s|$)/;
const BAR_POS = /(?:^|\s)(?:inset-y-0|inset-x-0|top-0|bottom-0|start-0|end-0|left-0|right-0)(?=\s|$)/;
const PSEUDO_BAR = new RegExp(`(?:before|after):(?:w-(?:0\\.5|1|1\\.5)|h-(?:0\\.5|1))\\b[\\s\\S]*(?:before|after):bg-${COLOR}|(?:before|after):bg-${COLOR}[\\s\\S]*(?:before|after):(?:w-(?:0\\.5|1|1\\.5)|h-(?:0\\.5|1))\\b`);
const SQUARE = /(?:^|\s)(?:h-(\d+) w-(\d+)|w-(\d+) h-(\d+)|size-(\d+))(?=\s|$)/;
const ROUNDED = /(?:^|\s)rounded-(?:full|md|lg|xl|2xl|3xl|control)(?=\s|$)/;
const CENTERED = /\b(?:place-items-center|justify-center)\b/;
const GRADIENT = /\b(?:bg-gradient-to-\w+|bg-\[(?:linear|radial|conic)-gradient)/;
const PULSE = /(?:^|\s|:)animate-(?:pulse|ping|bounce)(?=\s|$)/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXT.test(name)) out.push(path);
  }
  return out;
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

// The JSX tags of a file, in order: { name, close, selfClose, cls, index, end }.
// Attributes are read with brace depth and quotes tracked, so `=>` or `a > b`
// inside {…} does not end a tag early.
function tags(text) {
  const out = [];
  const re = /<(\/?)([A-Za-z][\w.]*|)(?=[\s/>])/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index;
    // `a<b` in code (a comparison) is not a tag: require a JSX-ish lead-in.
    const before = text.slice(Math.max(0, start - 30), start).trimEnd();
    if (!m[1] && /[\w)\]]$/.test(before) && !/\breturn$/.test(before)) continue;
    let i = re.lastIndex;
    // A stack of open contexts: "{" (an expression), "`" (a template
    // string), or a quote char; `${` inside a template pushes an expression.
    const ctx = [];
    for (; i < text.length; i += 1) {
      const c = text[i];
      const top = ctx[ctx.length - 1];
      if (top === '"' || top === "'") {
        if (c === "\\") i += 1;
        else if (c === top) ctx.pop();
        continue;
      }
      if (top === "`") {
        if (c === "\\") i += 1;
        else if (c === "`") ctx.pop();
        else if (c === "$" && text[i + 1] === "{") { ctx.push("{"); i += 1; }
        continue;
      }
      if (c === '"' || c === "`" || (c === "'" && top === "{")) ctx.push(c);
      else if (c === "{") ctx.push("{");
      else if (c === "}") ctx.pop();
      else if (c === ">" && !ctx.length) break;
    }
    const raw = text.slice(start, i + 1);
    const clsMatch = raw.match(/className=(?:"([^"]*)"|\{`([\s\S]*?)`\}|\{"([^"]*)"\})/);
    out.push({
      name: m[2],
      close: m[1] === "/",
      selfClose: raw.endsWith("/>"),
      cls: clsMatch ? (clsMatch[1] ?? clsMatch[2] ?? clsMatch[3]) : "",
      index: start,
      end: i + 1,
    });
    re.lastIndex = i + 1;
  }
  return out;
}

function isCardClass(cls) {
  return /\brounded-card\b/.test(cls) && /\b(?:border|shadow-card|bg-surface)\b/.test(cls)
    || /\b(?:workspace-card|dashboard-section|dashboard-stat)\b/.test(cls);
}

function scanJsx(text, hit) {
  const all = tags(text);

  // Local components whose root element is a card.
  const cardComponents = new Set(["Card"]);
  const fnRe = /(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)|\w+)\s*=>)/g;
  let f;
  while ((f = fnRe.exec(text))) {
    const first = all.find((t) => t.index > f.index && !t.close && t.name);
    if (first && (first.name === "Card" || isCardClass(first.cls))) cardComponents.add(f[1] || f[2]);
  }

  const stack = [];
  for (const [n, t] of all.entries()) {
    if (t.close) {
      const at = stack.map((s) => s.name).lastIndexOf(t.name);
      if (at >= 0) stack.length = at;
      continue;
    }
    const cls = t.cls;
    const card = cardComponents.has(t.name) || isCardClass(cls);

    if (card && stack.some((s) => s.card)) hit("card-in-card", t.index, `<${t.name}> inside a card`);

    if (cls) {
      const colored = COLORED_BORDER.test(cls) && !/\bborder-transparent\b/.test(cls);
      if ((SIDE_WIDTH.test(cls) && colored) || (BOTTOM_WIDTH.test(cls) && colored && CARD_CUES.test(cls))) {
        hit("stripe", t.index, cls);
      } else if (/\babsolute\b/.test(cls) && BAR.test(cls) && BAR_POS.test(cls) && STATUS_BG.test(cls)) {
        hit("stripe", t.index, cls);
      } else if (PSEUDO_BAR.test(cls)) {
        hit("stripe", t.index, cls);
      }

      const sq = cls.match(SQUARE);
      if (sq && ROUNDED.test(cls) && CENTERED.test(cls) && STATUS_BG.test(cls) && !t.selfClose) {
        const size = Number(sq[1] || sq[3] || sq[5]);
        // Its content up to the next tag after its first child: an icon
        // component (<Icon …/>, <AlertTriangle …/>) or a passed icon.
        const next = all[n + 1];
        const inner = text.slice(t.end, next && !next.close ? next.end : t.end + 160);
        if (size >= 6 && size <= 16 && (next && !next.close && /^[A-Z]/.test(next.name) || /\{\s*icon\b/i.test(inner))) {
          hit("tinted-icon", t.index, cls);
        }
      }

      if (/\bbg-clip-text\b/.test(cls) && GRADIENT.test(cls)) hit("gradient", t.index, cls);
      else if (GRADIENT.test(cls) && (/^(?:button|Button|a|Link|h[1-6])$/.test(t.name) || /\b(?:font-semibold|font-bold)\b/.test(cls) && /\b(?:px-\d|rounded-control)\b/.test(cls))) {
        hit("gradient", t.index, cls);
      }

      if (PULSE.test(cls) && !/skeleton/i.test(cls) && !/skeleton/i.test(currentFile)) hit("pulse", t.index, cls);
    }
    if (!t.selfClose && t.name !== undefined) stack.push({ name: t.name, card });
  }

  // framer-motion loops.
  for (const m of text.matchAll(/repeat:\s*Infinity/g)) hit("pulse", m.index, m[0]);
}

function scanCss(text, hit) {
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = m;
    const at = m.index + selector.length - selector.trimStart().length;
    if (/border-(?:inline-start|inline-end|left|right|top|block-start)(?:-width)?\s*:\s*(?:[2-9]|\d{2,})px/.test(body)) hit("stripe", at, selector.trim());
    else if (/box-shadow\s*:\s*inset\s+-?[2-9]px\s+0/.test(body)) hit("stripe", at, selector.trim());
    // A ::before/::after bar along a side (full height, thin) or along the top
    // edge. An underline below a link (`bottom: …`) is a nav indicator.
    else if (/::?(?:before|after)/.test(selector) && /background/.test(body) && !/\bbottom\s*:/.test(body)
      && (/(?:inset-block|top)\s*:\s*0/.test(body) && /(?:\bwidth|inline-size)\s*:\s*[1-6]px/.test(body)
        || /\btop\s*:\s*0/.test(body) && /(?:\bheight|block-size)\s*:\s*[1-6]px/.test(body))) hit("stripe", at, selector.trim());
    if (/linear-gradient|radial-gradient/.test(body) && /\b(?:button|btn|h[1-6]|heading|title)\b/i.test(selector)) hit("gradient", at, selector.trim());
    if (/animation[^;]*\binfinite\b/.test(body) && !/skeleton|spin|loading/i.test(selector)) hit("pulse", at, selector.trim());
  }
}

const hits = [];
let currentFile = "";
for (const dir of SCAN) {
  for (const path of walk(join(FRONTEND, dir))) {
    const text = readFileSync(path, "utf8");
    const lines = text.split("\n");
    const file = relative(FRONTEND, path);
    if (MIGRATED && !MIGRATED.has(file)) continue;
    currentFile = file;
    const hit = (pattern, index, snippet) => {
      const line = lineOf(text, index);
      if (/ui-allow:/.test(lines[line - 1]) || /ui-allow:/.test(lines[line - 2] || "")) return;
      hits.push({ file, line, pattern, snippet: snippet.replace(/\s+/g, " ").trim().slice(0, 110) });
    };
    if (path.endsWith(".css")) scanCss(text, hit);
    else scanJsx(text, hit);
  }
}

if (hits.length) {
  for (const h of hits) console.log(`${h.file}:${h.line}  [${h.pattern}]  ${h.snippet}`);
  if (SUMMARY) {
    const by = (key) => hits.reduce((acc, h) => ({ ...acc, [key(h)]: (acc[key(h)] || 0) + 1 }), {});
    console.log("\nper pattern:");
    for (const [k, v] of Object.entries(by((h) => h.pattern)).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
    console.log("\nper pattern and file:");
    for (const [k, v] of Object.entries(by((h) => `${h.pattern}  ${h.file}`)).sort()) console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
  console.log(`\n${hits.length} banned-pattern hit(s). Rebuild the composition, or add a \`ui-allow: <reason>\` comment for a documented exception.`);
  process.exit(1);
}
