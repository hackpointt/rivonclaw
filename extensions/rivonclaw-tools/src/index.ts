/**
 * RivonClaw Tools Plugin
 *
 * Pure prompt-injection plugin that registers a `before_prompt_build` hook
 * to replace the OpenClaw CLI Quick Reference section in the system prompt
 * with RivonClaw-specific guidance (runtime string replacement).
 *
 * Discovery: OpenClaw auto-discovers this plugin via the openclaw.plugin.json
 * manifest when the extensions/ directory is in plugins.load.paths.
 */

import { defineRivonClawPlugin } from "@rivonclaw/plugin-sdk";
import { createRivonClawContext } from "./rivonclaw-context.js";

export default defineRivonClawPlugin({
  id: "rivonclaw-tools",
  name: "RivonClaw Tools",

  setup(api) {
    // Replace OpenClaw CLI section in system prompt with RivonClaw guidance
    api.on("before_prompt_build", createRivonClawContext());
  },
});
