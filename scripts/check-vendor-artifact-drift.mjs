#!/usr/bin/env node

/**
 * Vendor Artifact Drift Check (ADR-030)
 *
 * Ensures generated artifacts are in sync with the current vendor source.
 *
 * How it works:
 *   1. Re-run the generation script (scripts/generate-vendor-artifacts.mjs)
 *   2. Check git diff on the generated output paths
 *   3. If any generated file changed, the committed artifacts are stale → FAIL
 *
 * This should run in CI after vendor setup and before build, so that a vendor
 * update that forgets to regenerate artifacts fails fast.
 *
 * Exit 0 = generated artifacts are up-to-date (PASS)
 * Exit 1 = generated artifacts are stale (FAIL)
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

// Paths where generated artifacts live (relative to repo root)
const GENERATED_PATHS = [
  "packages/core/src/generated/",
  "packages/gateway/src/generated/",
];

console.log("");
console.log("\uD83D\uDD04 Vendor artifact drift check (ADR-030)");
console.log("");

// Step 1: Re-generate artifacts
console.log("Regenerating artifacts from current vendor source...");
try {
  execSync("node scripts/generate-vendor-artifacts.mjs", {
    cwd: ROOT,
    stdio: "pipe",
  });
} catch (err) {
  console.error("\u274C Generation script failed:");
  console.error(err.stderr?.toString() || err.message);
  process.exit(1);
}
console.log("Generation complete.");
console.log("");

// Step 2: Check git diff on generated paths
const diffArgs = GENERATED_PATHS.map((p) => `"${p}"`).join(" ");
let diff;
try {
  diff = execSync(`git diff --name-only -- ${diffArgs}`, {
    cwd: ROOT,
    encoding: "utf-8",
  }).trim();
} catch {
  console.error("\u274C Could not run git diff (is this a git repository?)");
  process.exit(1);
}

if (diff) {
  console.log("\u274C Generated artifacts are STALE — the following files differ from vendor source:");
  console.log("");
  for (const file of diff.split("\n")) {
    console.log(`  ${file}`);
  }
  console.log("");
  console.log("Fix: run 'node scripts/generate-vendor-artifacts.mjs' and commit the updated files.");
  console.log("");
  console.log("Result: FAIL \u2014 generated artifacts out of sync with vendor");
  process.exit(1);
}

console.log("Result: PASS \u2014 all generated artifacts are up-to-date with vendor source");
