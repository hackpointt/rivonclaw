/**
 * RivonClaw Event Bridge plugin.
 *
 * Mirrors agent events for ALL channels to the Chat Page by working around
 * the vendor's `isControlUiVisible` gate in server-chat.ts. External channel
 * runs (Telegram, Feishu, Mobile, etc.) normally have their sessionKey stripped
 * from enriched events, so server-chat never broadcasts them. This plugin:
 *
 * 1. Builds a runId -> sessionKey map via the `llm_input` hook.
 * 2. Listens to ALL agent events via `runtime.events.onAgentEvent()`.
 * 3. When an event's sessionKey is undefined (suppressed), looks up the real
 *    sessionKey and broadcasts via `gatewayBroadcast`.
 */

import { defineRivonClawPlugin } from "@rivonclaw/plugin-sdk";

const CLEANUP_DELAY_MS = 30_000;

type AgentEventPayload = {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  data: Record<string, unknown>;
  sessionKey?: string;
};

type BroadcastFn = (event: string, payload: unknown) => void;

export default defineRivonClawPlugin({
  id: "rivonclaw-event-bridge",
  name: "RivonClaw Event Bridge",

  setup(api) {
    /** runId -> sessionKey mapping built from llm_input hook context. */
    const runSessionMap = new Map<string, string>();

    /** Captured gateway broadcast function — set on first gateway method invocation. */
    let gatewayBroadcast: BroadcastFn | null = null;

    // ── Capture broadcast via a lightweight gateway method ──────────
    // The desktop panel calls "event_bridge_init" once after gateway start
    // to hand the broadcast function to this plugin.
    if (typeof api.registerGatewayMethod === "function") {
      api.registerGatewayMethod(
        "event_bridge_init",
        ({ respond, context }: { respond: (ok: boolean) => void; context?: { broadcast: BroadcastFn } }) => {
          if (!gatewayBroadcast && context) {
            gatewayBroadcast = context.broadcast;
            api.logger.info("Gateway broadcast captured");
          }
          respond(true);
        },
      );
    }

    // ── Build runId -> sessionKey map from llm_input hook ───────────
    api.on(
      "llm_input",
      (evt: { runId?: string }, ctx: { sessionKey?: string }) => {
        if (evt.runId && ctx?.sessionKey) {
          runSessionMap.set(evt.runId, ctx.sessionKey);
        }
      },
    );

    // ── Cleanup map entries after agent_end with a delay ────────────
    api.on(
      "agent_end",
      (_evt: unknown, ctx: { sessionKey?: string }) => {
        if (!ctx?.sessionKey) return;
        const sessionKey = ctx.sessionKey;
        setTimeout(() => {
          for (const [runId, sk] of runSessionMap) {
            if (sk === sessionKey) {
              runSessionMap.delete(runId);
            }
          }
        }, CLEANUP_DELAY_MS);
      },
    );

    // ── Mirror suppressed agent events to Chat Page ─────────────────
    const unsubscribe = (api as any).runtime.events.onAgentEvent((evt: AgentEventPayload) => {
      // If sessionKey is present, server-chat.ts is already broadcasting — skip.
      if (evt.sessionKey) return;

      if (!gatewayBroadcast) return;

      // Look up real sessionKey from our hook-built map.
      const sessionKey = runSessionMap.get(evt.runId);
      if (!sessionKey) return;

      // Only mirror streams the Chat Page cares about.
      if (evt.stream !== "assistant" && evt.stream !== "lifecycle" && evt.stream !== "tool") {
        return;
      }

      gatewayBroadcast("rivonclaw.chat-mirror", {
        runId: evt.runId,
        sessionKey,
        stream: evt.stream,
        data: evt.data,
        seq: evt.seq,
      });
    });

    // Cleanup on gateway_stop.
    api.on("gateway_stop", () => {
      unsubscribe();
      runSessionMap.clear();
      gatewayBroadcast = null;
    });
  },
});
