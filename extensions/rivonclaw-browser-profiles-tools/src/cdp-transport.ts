import { get as httpGet } from "node:http";
import WebSocket from "ws";

export type CdpCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

/**
 * Fetch the WebSocket debugger URL from Chrome's /json/list endpoint.
 * Uses a page-level target (supports Network domain commands like
 * getAllCookies/setCookies). Falls back to first available target
 * if no page targets are found.
 * Returns null if Chrome is not reachable within 3 seconds.
 */
export function fetchDebuggerUrl(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const req = httpGet(`http://127.0.0.1:${port}/json/list`, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let body = "";
      res.setEncoding("utf-8");
      res.on("data", (chunk: string) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const targets = JSON.parse(body) as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
          const page = targets.find(t => t.type === "page");
          resolve(page?.webSocketDebuggerUrl ?? targets[0]?.webSocketDebuggerUrl ?? null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Send a single CDP command over WebSocket and return the result.
 * Opens a connection, sends {id, method, params}, waits for matching
 * response, then closes. Timeout defaults to 5 seconds.
 */
export function sendCdpCommand(
  wsUrl: string,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 5000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error(`CDP command '${method}' timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    ws.on("open", () => {
      ws.send(JSON.stringify({ id, method, params }));
    });

    ws.on("message", (data) => {
      if (settled) return;
      try {
        const msg = JSON.parse(data.toString()) as {
          id?: number;
          result?: unknown;
          error?: { message: string };
        };
        if (msg.id === id) {
          settled = true;
          clearTimeout(timer);
          ws.close();
          if (msg.error) {
            reject(new Error(`CDP error: ${msg.error.message}`));
          } else {
            resolve(msg.result);
          }
        }
      } catch {
        // Ignore parse errors on non-matching messages
      }
    });

    ws.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

/**
 * Retrieve all cookies from a Chrome instance via CDP.
 * Returns an empty array if the browser is unreachable.
 */
export async function getCookies(port: number): Promise<CdpCookie[]> {
  try {
    const wsUrl = await fetchDebuggerUrl(port);
    if (!wsUrl) {
      console.warn(`[cdp-transport] Cannot reach Chrome on port ${port}, returning empty cookies`);
      return [];
    }
    const result = (await sendCdpCommand(wsUrl, "Network.getAllCookies")) as {
      cookies?: CdpCookie[];
    };
    return result?.cookies ?? [];
  } catch (err) {
    console.warn(`[cdp-transport] getCookies failed for port ${port}:`, err);
    return [];
  }
}

/**
 * Set cookies in a Chrome instance via CDP.
 * No-op if the browser is unreachable.
 */
export async function setCookies(port: number, cookies: CdpCookie[]): Promise<void> {
  try {
    const wsUrl = await fetchDebuggerUrl(port);
    if (!wsUrl) {
      console.warn(`[cdp-transport] Cannot reach Chrome on port ${port}, skipping setCookies`);
      return;
    }
    await sendCdpCommand(wsUrl, "Network.setCookies", { cookies });
  } catch (err) {
    console.warn(`[cdp-transport] setCookies failed for port ${port}:`, err);
  }
}
