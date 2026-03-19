import type { ToolScopeType, ToolSelection, GQL } from "@rivonclaw/core";
import type { RouteHandler } from "./api-context.js";
import { parseBody, sendJson } from "./route-utils.js";
import { toolCapabilityResolver } from "../utils/tool-capability-resolver.js";

export const handleToolRegistryRoutes: RouteHandler = async (req, res, url, pathname, ctx) => {
  // GET /api/tools/effective-tools?sessionKey=xxx&scopeType=chat_session
  // Called by capability-manager plugin to resolve effective tools on demand.
  if (pathname === "/api/tools/effective-tools" && req.method === "GET") {
    const sessionKey = url.searchParams.get("sessionKey");
    const scopeType = (url.searchParams.get("scopeType") ?? "chat_session") as ToolScopeType;
    if (!sessionKey) {
      sendJson(res, 400, { error: "Missing sessionKey" });
      return true;
    }

    if (!toolCapabilityResolver.isInitialized()) {
      sendJson(res, 200, { effectiveToolIds: [] });
      return true;
    }

    // Detect cron sessions: sessionKey contains ":cron:<jobId>:" segment
    let lookupScopeType = scopeType;
    let lookupScopeKey = sessionKey;
    const cronMatch = sessionKey.match(/:cron:([^:]+)/);
    if (cronMatch) {
      lookupScopeType = "cron_job";
      lookupScopeKey = cronMatch[1];
    }

    const selections = ctx.storage.toolSelections.getForScope(lookupScopeType, lookupScopeKey);
    const runProfile: GQL.RunProfile | null = selections.length > 0
      ? {
          id: `ephemeral-${lookupScopeKey}`,
          name: lookupScopeType === "cron_job" ? "Cron Selection" : "Session Selection",
          selectedToolIds: selections.filter(s => s.enabled).map(s => s.toolId),
          surfaceId: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : null; // No explicit selection → resolver uses default tools (system + custom, no entitled)

    const result = toolCapabilityResolver.computeEffectiveTools(null, runProfile);
    sendJson(res, 200, { effectiveToolIds: result.effectiveToolIds });
    return true;
  }

  // GET /api/tools/available — available tools (empty for guests, entitled tools for authenticated users)
  if (pathname === "/api/tools/available" && req.method === "GET") {
    if (!ctx.authSession?.getAccessToken()) {
      sendJson(res, 200, { tools: [] });
      return true;
    }

    let tools = ctx.authSession.getCachedAvailableTools();
    if (!tools) {
      tools = await ctx.authSession.fetchAvailableTools();
    }
    sendJson(res, 200, { tools });
    return true;
  }

  // GET /api/tools/surface-availability — tools available after surface restriction
  if (pathname === "/api/tools/surface-availability" && req.method === "GET") {
    if (!toolCapabilityResolver.isInitialized()) {
      sendJson(res, 200, { availableToolIds: [] });
      return true;
    }
    // No surface selected yet — returns all available tools
    const availability = toolCapabilityResolver.computeSurfaceAvailability(null);
    sendJson(res, 200, { availableToolIds: availability.availableToolIds });
    return true;
  }

  // GET /api/tools/selections?scopeType=...&scopeKey=...
  if (pathname === "/api/tools/selections" && req.method === "GET") {
    const scopeType = url.searchParams.get("scopeType") as ToolScopeType | null;
    const scopeKey = url.searchParams.get("scopeKey");
    if (!scopeType || !scopeKey) {
      sendJson(res, 400, { error: "Missing scopeType or scopeKey" });
      return true;
    }

    const selections = ctx.storage.toolSelections.getForScope(scopeType, scopeKey);
    sendJson(res, 200, { selections });
    return true;
  }

  // PUT /api/tools/selections — save tool selections
  if (pathname === "/api/tools/selections" && req.method === "PUT") {
    const body = await parseBody(req) as {
      scopeType?: ToolScopeType;
      scopeKey?: string;
      selections?: ToolSelection[];
    };
    if (!body.scopeType || !body.scopeKey || !Array.isArray(body.selections)) {
      sendJson(res, 400, { error: "Missing scopeType, scopeKey, or selections" });
      return true;
    }

    ctx.storage.toolSelections.setForScope(body.scopeType, body.scopeKey, body.selections);

    sendJson(res, 200, { ok: true });
    return true;
  }

  // DEPRECATED: Ambiguous scope-agnostic lookup. Use GET /api/tools/selections with explicit scopeType instead.
  // Retained for backward compatibility. Do not use for plugin runtime enforcement.
  // GET /api/tools/selections-by-key?scopeKey=... — scope-agnostic lookup
  if (pathname === "/api/tools/selections-by-key" && req.method === "GET") {
    const scopeKey = url.searchParams.get("scopeKey");
    if (!scopeKey) {
      sendJson(res, 400, { error: "Missing scopeKey" });
      return true;
    }

    const result = ctx.storage.toolSelections.getByKey(scopeKey);
    sendJson(res, 200, result ?? { scopeType: null, selections: [] });
    return true;
  }

  // POST /api/tools/ensure-context — build and push effective context for a scope
  // Called by the panel when activating a session to ensure default preset is available
  if (pathname === "/api/tools/ensure-context" && req.method === "POST") {
    const body = await parseBody(req) as {
      scopeType?: string;
      scopeKey?: string;
    };
    if (!body.scopeType || !body.scopeKey) {
      sendJson(res, 400, { error: "Missing scopeType or scopeKey" });
      return true;
    }

    const validScopeTypes: string[] = ["chat_session", "cron_job", "app_run"];
    if (!validScopeTypes.includes(body.scopeType)) {
      sendJson(res, 400, { error: `Invalid scopeType: ${body.scopeType}` });
      return true;
    }

    if (!ctx.authSession?.getAccessToken()) {
      sendJson(res, 401, { error: "Not authenticated" });
      return true;
    }

    sendJson(res, 200, { ok: true });
    return true;
  }

  // DELETE /api/tools/selections?scopeType=...&scopeKey=...
  if (pathname === "/api/tools/selections" && req.method === "DELETE") {
    const scopeType = url.searchParams.get("scopeType") as ToolScopeType | null;
    const scopeKey = url.searchParams.get("scopeKey");
    if (!scopeType || !scopeKey) {
      sendJson(res, 400, { error: "Missing scopeType or scopeKey" });
      return true;
    }

    ctx.storage.toolSelections.deleteForScope(scopeType, scopeKey);

    sendJson(res, 200, { ok: true });
    return true;
  }

  // GET /api/tools/run-context?scopeType=...&scopeKey=...
  if (pathname === "/api/tools/run-context" && req.method === "GET") {
    const scopeType = url.searchParams.get("scopeType");
    const scopeKey = url.searchParams.get("scopeKey");
    if (!scopeType || !scopeKey) {
      sendJson(res, 400, { error: "scopeType and scopeKey are required" });
      return true;
    }

    const validScopeTypes: string[] = ["chat_session", "cron_job", "app_run"];
    if (!validScopeTypes.includes(scopeType)) {
      sendJson(res, 400, { error: `Invalid scopeType: ${scopeType}` });
      return true;
    }

    if (!ctx.authSession) {
      sendJson(res, 401, { error: "Not authenticated" });
      return true;
    }

    if (!toolCapabilityResolver.isInitialized()) {
      sendJson(res, 200, { scopeType, scopeKey, effectiveTools: [] });
      return true;
    }

    const selections = ctx.storage.toolSelections.getForScope(scopeType as ToolScopeType, scopeKey);
    const now = new Date().toISOString();
    const runProfile: GQL.RunProfile = {
      id: selections.length > 0 ? `ephemeral-${scopeKey}` : "default",
      name: selections.length > 0 ? "Session Selection" : "All Available",
      selectedToolIds: selections.length > 0
        ? selections.filter(s => s.enabled).map(s => s.toolId)
        : toolCapabilityResolver.getAllAvailableToolIds(),
      surfaceId: "",
      createdAt: now,
      updatedAt: now,
    };
    const result = toolCapabilityResolver.computeEffectiveTools(null, runProfile);
    sendJson(res, 200, {
      scopeType,
      scopeKey,
      entitledTools: result.entitledToolIds,
      surfaceId: result.surfaceId,
      surfaceAllowedTools: result.surfaceAllowedToolIds,
      runProfileSelectedTools: result.runProfileSelectedToolIds,
      effectiveTools: result.effectiveToolIds,
    });
    return true;
  }

  return false;
};
