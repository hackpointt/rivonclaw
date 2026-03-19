import { describe, it, expect } from "vitest";
import plugin from "./index.js";

describe("rivonclaw-browser-profiles-tools plugin", () => {
  it("exports a valid plugin definition", () => {
    expect(plugin.id).toBe("rivonclaw-browser-profiles-tools");
    expect(plugin.name).toBe("Browser Profiles Tools");
    expect(typeof plugin.activate).toBe("function");
  });

  it("registers cookie gateway methods and all 5 tools on activate", () => {
    const hooks: string[] = [];
    const tools: Array<{ factory: unknown; opts: unknown }> = [];
    const gatewayMethods: string[] = [];

    const mockApi = {
      logger: { info: () => {} },
      on(event: string) {
        hooks.push(event);
      },
      registerTool(factory: unknown, opts?: unknown) {
        tools.push({ factory, opts });
      },
      registerGatewayMethod(name: string) {
        gatewayMethods.push(name);
      },
    };

    plugin.activate(mockApi);

    // Only cookie and lifecycle hooks — no before_tool_call or before_prompt_build
    expect(hooks).not.toContain("before_tool_call");
    expect(hooks).not.toContain("before_prompt_build");
    expect(hooks).toContain("browser_session_start");
    expect(hooks).toContain("browser_session_end");
    expect(hooks).toContain("gateway_stop");

    // Cookie gateway methods only — no run context
    expect(gatewayMethods).toContain("browser_profiles_push_cookies");
    expect(gatewayMethods).toContain("browser_profiles_pull_cookies");
    expect(gatewayMethods).not.toContain("browser_profiles_set_run_context");

    // 3 read tools + 2 write tools = 5 (always registered)
    expect(tools).toHaveLength(5);

    // All tools must be registered with { optional: true } (ADR-031)
    for (const entry of tools) {
      expect(entry.opts).toEqual({ optional: true });
    }
  });

  it("tool factories return tool defs unconditionally", () => {
    const tools: Array<(ctx: { config?: Record<string, unknown> }) => unknown> = [];

    const mockApi = {
      logger: { info: () => {} },
      on() {},
      registerTool(factory: (ctx: { config?: Record<string, unknown> }) => unknown, _opts?: unknown) {
        tools.push(factory);
      },
      registerGatewayMethod() {},
    };

    plugin.activate(mockApi);

    const expectedNames = [
      "browser_profiles_list",
      "browser_profiles_get",
      "browser_profiles_find",
      "browser_profiles_manage",
      "browser_profiles_test_proxy",
    ];

    // Each factory returns a valid tool definition regardless of config
    const results = tools.map((factory) => factory({})) as Array<{
      name: string;
      label: string;
      description: string;
      parameters: { type: string; properties: Record<string, unknown> };
    }>;

    expect(results).toHaveLength(5);
    for (let i = 0; i < results.length; i++) {
      const tool = results[i];
      expect(tool.name).toBe(expectedNames[i]);
      expect(tool.label).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe("object");
    }
  });
});
