import { defineRivonClawPlugin } from "@rivonclaw/plugin-sdk";
import type { PluginApi } from "@rivonclaw/plugin-sdk";
import { createPolicyInjector } from "@rivonclaw/policy";
import type {
  GuardProvider,
  OpenClawPluginAPI,
  PolicyProvider,
} from "@rivonclaw/policy";

/** Options for creating the RivonClaw OpenClaw plugin. */
export interface RivonClawPluginOptions {
  policyProvider: PolicyProvider;
  guardProvider: GuardProvider;
}

/**
 * Creates the RivonClaw plugin that registers with the OpenClaw gateway.
 * It wires the policy injector (before_agent_start) which injects both
 * policy fragments and guard directives into the agent's system prompt.
 *
 * Guard enforcement via before_tool_call is intentionally disabled —
 * the current pattern matcher is too limited (only tool:/path: prefixes)
 * and risks false positives. Guards are instead injected as prompt-level
 * directives until a proper condition DSL is implemented.
 */
export function createRivonClawPlugin(options: RivonClawPluginOptions) {
  return defineRivonClawPlugin({
    id: "rivonclaw-policy",
    name: "RivonClaw Policy",

    setup(api: PluginApi) {
      const policyHandler = createPolicyInjector(options.policyProvider, options.guardProvider);

      // This plugin uses the registerHook API pattern (OpenClawPluginAPI)
      // rather than the standard api.on pattern.
      const hookApi = api as unknown as OpenClawPluginAPI;
      hookApi.registerHook("before_agent_start", policyHandler);
    },
  });
}
