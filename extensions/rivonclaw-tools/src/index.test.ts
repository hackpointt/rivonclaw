import { describe, it, expect } from "vitest";
import plugin from "./index.js";

describe("rivonclaw-tools plugin", () => {
  it("exports a valid plugin definition", () => {
    expect(plugin.id).toBe("rivonclaw-tools");
    expect(plugin.name).toBe("RivonClaw Tools");
    expect(typeof plugin.activate).toBe("function");
  });

  it("registers before_prompt_build hook and no tools on activate", () => {
    const hooks: string[] = [];
    const toolsRegistered: unknown[] = [];

    const mockApi = {
      id: "rivonclaw-tools",
      logger: { info: () => {}, warn: () => {} },
      on(event: string) { hooks.push(event); },
      registerTool(factory: unknown) { toolsRegistered.push(factory); },
    };

    plugin.activate(mockApi);

    expect(hooks).toContain("before_prompt_build");
    expect(hooks).not.toContain("before_agent_start");
    expect(hooks).toHaveLength(1);
    expect(toolsRegistered).toHaveLength(0);
  });
});
