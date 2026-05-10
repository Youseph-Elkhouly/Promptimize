#!/usr/bin/env ts-node
/**
 * Promptimize CostDiff CLI
 * Usage: npx ts-node scripts/run-cost-diff.ts [projectId] [prevCommit] [currCommit]
 */

import * as cp from "child_process";
import * as https from "https";
import * as http from "http";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function git(cmd: string): string {
  try { return cp.execSync(cmd, { encoding: "utf8" }).trim(); }
  catch { return "unknown"; }
}

function post(path: string, body: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(BACKEND_URL + path);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      { hostname: url.hostname, port: url.port || 80, path: url.pathname, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": data.length } },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve(JSON.parse(raw)));
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const projectId = process.argv[2] || "sample-ai-app";
  const previousCommit = process.argv[3] || git("git rev-parse HEAD~1");
  const currentCommit = process.argv[4] || git("git rev-parse HEAD");

  console.log("\n═══════════════════════════════════════════");
  console.log("  Promptimize — CostDiff Report");
  console.log("═══════════════════════════════════════════");
  console.log(`  Project:  ${projectId}`);
  console.log(`  Prev:     ${previousCommit.slice(0, 7)}`);
  console.log(`  Current:  ${currentCommit.slice(0, 7)}`);
  console.log("");

  let result: any;
  try {
    result = await post("/cost-diff", { projectId, previousCommit, currentCommit });
  } catch (e: any) {
    console.error(`  ERROR: ${e.message}`);
    console.error("  Make sure the backend is running on", BACKEND_URL);
    process.exit(1);
  }

  console.log(`  Previous monthly cost:  $${result.previousMonthlyCost.toFixed(2)}`);
  console.log(`  Current monthly cost:   $${result.currentMonthlyCost.toFixed(2)}`);
  console.log(`  Token change:           ${result.tokenIncreasePercent > 0 ? "+" : ""}${result.tokenIncreasePercent.toFixed(1)}%`);
  console.log(`  Cost change:            ${result.costIncreasePercent > 0 ? "+" : ""}${result.costIncreasePercent.toFixed(1)}%`);
  console.log("");

  if (result.mainCauses?.length) {
    console.log("  MAIN CAUSES:");
    for (const c of result.mainCauses) {
      console.log(`  • ${c.filePath}`);
      console.log(`    ${c.reason} (+$${c.monthlyCostIncrease.toFixed(2)}/mo)`);
    }
    console.log("");
  }

  if (result.recommendations?.length) {
    console.log("  RECOMMENDATIONS:");
    for (const r of result.recommendations) {
      console.log(`  → ${r}`);
    }
    console.log("");
  }

  const statusLabel =
    result.status === "pass" ? "✓ PASS" :
    result.status === "warning" ? "⚠ WARNING" : "✗ FAILED BUDGET";
  console.log(`  STATUS: ${statusLabel}`);
  console.log("═══════════════════════════════════════════\n");

  if (result.status === "failed_budget") process.exit(1);
}

main().catch(console.error);
