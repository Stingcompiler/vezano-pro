import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The UI guide's text scan (scripts/lint-ui.mjs) over the screens already
// migrated to the chosen direction (docs/ui-profile.md). The rest of the
// app is migrated in batches, so only the listed files must stay clean.
const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIST = join(FRONTEND, "scripts", "lint-ui-migrated.json");

test("every migrated file on the lint:ui allowlist exists", () => {
  const { files } = JSON.parse(readFileSync(LIST, "utf8"));
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(existsSync(join(FRONTEND, file)), `${file} is listed but missing`);
});

test("migrated screens have no banned card patterns (lint:ui --migrated)", () => {
  const run = spawnSync(process.execPath, [join(FRONTEND, "scripts", "lint-ui.mjs"), "--migrated"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(run.stdout.trim(), "");
});
