import { execSync } from "node:child_process";

export default function globalSetup() {
  // Kill any leftover RivonClaw instances from previous test runs.
  // .env loading is handled by dotenv in playwright.config.ts.
  if (process.platform === "darwin") {
    // Use killall (~10ms) instead of pkill which can take 20-50s on macOS
    // due to slow proc_info kernel calls when many processes are running.
    try {
      execSync("killall -9 RivonClaw 2>/dev/null || true", { stdio: "ignore" });
    } catch {}
  }
  if (process.platform === "win32") {
    try {
      execSync("taskkill /F /IM RivonClaw.exe 2>nul || exit 0", { stdio: "ignore" });
    } catch {}
  }
}
