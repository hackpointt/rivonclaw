import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@easyclaw/logger";

const log = createLogger("runtime-hydrator");

export interface HydrateProgress {
  phase: "checking" | "ready" | "error";
  message: string;
  percent?: number;
}

export interface HydrateResult {
  runtimeDir: string; // absolute path to the ASAR archive (Electron resolves paths inside it)
  version: string;
  wasExtracted: boolean; // always false — ASAR requires no extraction
}

interface RuntimeManifest {
  sha256: string;
  version: string;
}

const ASAR_FILENAME = "openclaw-runtime.asar";

/**
 * Read and parse the runtime-manifest.json from a directory.
 * Returns null if the file doesn't exist or is malformed.
 */
function readManifest(dir: string): RuntimeManifest | null {
  const manifestPath = join(dir, "runtime-manifest.json");
  if (!existsSync(manifestPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    if (typeof raw.sha256 !== "string" || typeof raw.version !== "string") return null;
    return { sha256: raw.sha256, version: raw.version };
  } catch {
    return null;
  }
}

/**
 * Fast synchronous check — returns the ASAR path if the runtime archive
 * exists at the expected location inside the archive directory.
 * Returns null if the ASAR is missing.
 */
export function checkRuntimeReady(archiveDir: string): string | null {
  const asarPath = join(archiveDir, ASAR_FILENAME);
  if (!existsSync(asarPath)) {
    log.warn(`Runtime ASAR not found: ${asarPath}`);
    return null;
  }

  const manifest = readManifest(archiveDir);
  if (!manifest) {
    log.warn(`No valid runtime-manifest.json in archive dir: ${archiveDir}`);
    return null;
  }

  log.info(`Runtime ASAR ready at ${asarPath} (v${manifest.version})`);
  return asarPath;
}

/**
 * Verify the ASAR runtime archive is present and return its path.
 *
 * With ASAR packaging, Electron reads files directly from the archive —
 * no extraction is needed. This function simply validates that the ASAR
 * file and its manifest exist at the expected location.
 */
export async function hydrateRuntime(opts: {
  archiveDir: string;
  onProgress?: (progress: HydrateProgress) => void;
}): Promise<HydrateResult> {
  const { archiveDir, onProgress } = opts;

  const report = (progress: HydrateProgress): void => {
    log.debug(`[hydrate] ${progress.phase}: ${progress.message}`);
    onProgress?.(progress);
  };

  report({ phase: "checking", message: "Checking runtime archive..." });

  const manifest = readManifest(archiveDir);
  if (!manifest) {
    const msg = `No valid runtime-manifest.json found in ${archiveDir}`;
    report({ phase: "error", message: msg });
    throw new Error(msg);
  }

  const asarPath = join(archiveDir, ASAR_FILENAME);
  if (!existsSync(asarPath)) {
    const msg = `Runtime ASAR not found: ${asarPath}`;
    report({ phase: "error", message: msg });
    throw new Error(msg);
  }

  log.info(`Runtime v${manifest.version} available at ${asarPath}`);
  report({ phase: "ready", message: `Runtime v${manifest.version} ready`, percent: 100 });

  return { runtimeDir: asarPath, version: manifest.version, wasExtracted: false };
}
