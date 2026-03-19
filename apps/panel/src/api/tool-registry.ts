/** REST client for the unified tool capability registry (panel-server endpoints). */

export interface AvailableTool {
  id: string;
  displayName: string;
  description: string;
  category: string;
  allowed: boolean;
  denialReason?: string;
}

export interface ToolSelection {
  toolId: string;
  enabled: boolean;
}

const BASE = "/api/tools";

export async function fetchAvailableTools(): Promise<AvailableTool[]> {
  const res = await fetch(`${BASE}/available`);
  if (!res.ok) return [];
  const data = (await res.json()) as { tools: AvailableTool[] };
  return data.tools;
}

export async function fetchToolSelections(
  scopeType: string,
  scopeKey: string,
): Promise<ToolSelection[]> {
  const params = new URLSearchParams({ scopeType, scopeKey });
  const res = await fetch(`${BASE}/selections?${params}`);
  if (!res.ok) throw new Error(`fetchToolSelections failed: ${res.status}`);
  const data = (await res.json()) as { selections: ToolSelection[] };
  return data.selections;
}

export async function saveToolSelections(
  scopeType: string,
  scopeKey: string,
  selections: ToolSelection[],
): Promise<void> {
  const res = await fetch(`${BASE}/selections`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopeType, scopeKey, selections }),
  });
  if (!res.ok) throw new Error(`saveToolSelections failed: ${res.status}`);
}

export async function fetchSurfaceAvailability(): Promise<string[]> {
  const res = await fetch(`${BASE}/surface-availability`);
  if (!res.ok) return [];
  const data = (await res.json()) as { availableToolIds: string[] };
  return data.availableToolIds;
}

// ensureToolContext removed — context is now pushed automatically by Desktop
// when gateway fires session_start via the event-bridge pattern.
