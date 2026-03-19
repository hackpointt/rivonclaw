import type { CdpCookie } from "./cdp-transport.js";
import { getCookies, setCookies } from "./cdp-transport.js";

const LOG_PREFIX = "[browser-profiles:cookies]";

// Cookies pushed by desktop, waiting to be restored on browser start
const pendingRestore = new Map<string, CdpCookie[]>();
// Cookies captured from browser, waiting for desktop to pull
const capturedCookies = new Map<string, CdpCookie[]>();
// CDP port for each profile (pushed by desktop or discovered from browser status)
const profilePorts = new Map<string, number>();

/**
 * Store cookies that should be restored when the browser starts.
 * Optionally records the CDP port for the profile.
 */
export function pushCookiesForRestore(
  profileName: string,
  cookies: CdpCookie[],
  cdpPort?: number,
): void {
  pendingRestore.set(profileName, cookies);
  if (cdpPort !== undefined) {
    profilePorts.set(profileName, cdpPort);
  }
  console.log(
    `${LOG_PREFIX} pushCookiesForRestore: ${cookies.length} cookies queued for "${profileName}"`,
  );
}

/**
 * Store or update the CDP port for a profile.
 */
export function pushCdpPort(profileName: string, cdpPort: number): void {
  profilePorts.set(profileName, cdpPort);
  console.log(`${LOG_PREFIX} pushCdpPort: port ${cdpPort} set for "${profileName}"`);
}

/**
 * Restore pending cookies into the browser via CDP.
 * Checks pendingRestore first, then falls back to capturedCookies
 * (handles browser restart within the same gateway session).
 * Uses the provided cdpPort, or falls back to the stored port for the profile.
 */
export async function restoreCookies(
  profileName: string,
  cdpPort?: number,
): Promise<{ restored: number }> {
  let cookies = pendingRestore.get(profileName);
  let source: "pending" | "captured" = "pending";
  if (!cookies || cookies.length === 0) {
    // Fallback: use previously captured cookies (browser restart scenario)
    cookies = capturedCookies.get(profileName);
    source = "captured";
  }
  if (!cookies || cookies.length === 0) {
    return { restored: 0 };
  }

  const port = cdpPort ?? profilePorts.get(profileName);
  if (port === undefined) {
    console.log(
      `${LOG_PREFIX} restoreCookies: no CDP port available for "${profileName}", skipping`,
    );
    return { restored: 0 };
  }

  await setCookies(port, cookies);
  if (source === "pending") {
    pendingRestore.delete(profileName);
  } else {
    capturedCookies.delete(profileName);
  }

  console.log(
    `${LOG_PREFIX} restoreCookies: restored ${cookies.length} cookies for "${profileName}" on port ${port}`,
  );
  return { restored: cookies.length };
}

/**
 * Capture all cookies from the browser via CDP and store them for later pull.
 * Uses the provided cdpPort, or falls back to the stored port for the profile.
 */
export async function captureCookies(
  profileName: string,
  cdpPort?: number,
): Promise<{ captured: number }> {
  const port = cdpPort ?? profilePorts.get(profileName);
  if (port === undefined) {
    console.log(
      `${LOG_PREFIX} captureCookies: no CDP port available for "${profileName}", skipping`,
    );
    return { captured: 0 };
  }

  const cookies = await getCookies(port);
  capturedCookies.set(profileName, cookies);

  console.log(
    `${LOG_PREFIX} captureCookies: captured ${cookies.length} cookies for "${profileName}" from port ${port}`,
  );
  return { captured: cookies.length };
}

/**
 * Pull and remove captured cookies for a profile.
 * Returns null if no cookies have been captured for this profile.
 */
export function pullCapturedCookies(profileName: string): CdpCookie[] | null {
  const cookies = capturedCookies.get(profileName);
  if (!cookies) return null;
  capturedCookies.delete(profileName);
  return cookies;
}

/**
 * Clear all in-memory state. Called on gateway_stop for cleanup.
 */
export function clearAll(): void {
  pendingRestore.clear();
  capturedCookies.clear();
  profilePorts.clear();
  console.log(`${LOG_PREFIX} clearAll: all cookie state cleared`);
}
