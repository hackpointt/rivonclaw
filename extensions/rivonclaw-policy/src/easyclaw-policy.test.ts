import { describe, it, expect, vi } from "vitest";
import { createRivonClawPlugin } from "./index.js";
import type {
  PolicyProvider,
  GuardProvider,
  AgentStartContext,
  OpenClawPluginAPI,
} from "@rivonclaw/policy";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePolicyProvider(policyView: string): PolicyProvider {
  return { getCompiledPolicyView: () => policyView };
}

function makeGuardProvider(
  guards: Array<{ id: string; ruleId: string; content: string }>,
): GuardProvider {
  return { getActiveGuards: () => guards };
}

function makeGuardContent(
  condition: string,
  action: string,
  reason: string,
): string {
  return JSON.stringify({ type: "guard", condition, action, reason });
}

/** Build a mock API that satisfies both PluginApi (from SDK) and OpenClawPluginAPI. */
function makeMockApi(overrides?: Partial<OpenClawPluginAPI>) {
  return {
    id: "test",
    logger: { info: vi.fn(), warn: vi.fn() },
    on: vi.fn(),
    registerHook: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Plugin Registration Tests
// ---------------------------------------------------------------------------

describe("createRivonClawPlugin", () => {
  it("plugin has correct name", () => {
    const plugin = createRivonClawPlugin({
      policyProvider: makePolicyProvider(""),
      guardProvider: makeGuardProvider([]),
    });

    expect(plugin.name).toBe("RivonClaw Policy");
  });

  it("plugin has correct id", () => {
    const plugin = createRivonClawPlugin({
      policyProvider: makePolicyProvider(""),
      guardProvider: makeGuardProvider([]),
    });

    expect(plugin.id).toBe("rivonclaw-policy");
  });

  it("plugin registers only before_agent_start hook", () => {
    const plugin = createRivonClawPlugin({
      policyProvider: makePolicyProvider("Test policy"),
      guardProvider: makeGuardProvider([]),
    });

    const registeredHooks: string[] = [];
    const mockAPI = makeMockApi({
      registerHook: vi.fn((hookName: string) => {
        registeredHooks.push(hookName);
      }) as unknown as OpenClawPluginAPI["registerHook"],
    });

    plugin.activate(mockAPI);

    expect(registeredHooks).toContain("before_agent_start");
    expect(registeredHooks).not.toContain("before_tool_call");
    expect(registeredHooks).toHaveLength(1);
  });

  it("full integration: policy + guard prompt injection via before_agent_start", () => {
    const policyProvider = makePolicyProvider("Never modify system files.");
    const guardProvider = makeGuardProvider([
      {
        id: "g-int-1",
        ruleId: "r-int-1",
        content: makeGuardContent(
          "path:/etc/*",
          "block",
          "System directory protected",
        ),
      },
    ]);

    const plugin = createRivonClawPlugin({ policyProvider, guardProvider });

    // Capture registered handler
    let agentStartHandler:
      | ((ctx: AgentStartContext) => { prependContext: string })
      | undefined;

    const mockAPI = makeMockApi({
      registerHook: vi.fn(
        (hookName: string, handler: (...args: unknown[]) => unknown) => {
          if (hookName === "before_agent_start") {
            agentStartHandler = handler as typeof agentStartHandler;
          }
        },
      ) as unknown as OpenClawPluginAPI["registerHook"],
    });

    plugin.activate(mockAPI);

    // Verify policy injection works
    expect(agentStartHandler).toBeDefined();
    const agentResult = agentStartHandler!({ prependContext: "" });
    expect(agentResult.prependContext).toContain("--- RivonClaw Policy ---");
    expect(agentResult.prependContext).toContain(
      "Never modify system files.",
    );
    // Guard should also be injected into the prompt
    expect(agentResult.prependContext).toContain("--- RivonClaw Guards (MUST enforce) ---");
    expect(agentResult.prependContext).toContain("System directory protected");
  });
});
