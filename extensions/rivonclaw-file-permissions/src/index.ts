/**
 * RivonClaw File Permissions Plugin
 *
 * Enforces file access permissions via OpenClaw's before_tool_call hook.
 * This plugin validates file paths against RIVONCLAW_FILE_PERMISSIONS environment variable
 * and blocks unauthorized file operations.
 */

import { defineRivonClawPlugin } from "@rivonclaw/plugin-sdk";
import type { PluginApi } from "@rivonclaw/plugin-sdk";
import {
  parseFilePermissions,
  isPathAllowed,
  extractFilePaths,
  extractExecFilePaths,
} from "./validators.js";

type PluginHookBeforeToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
};

type PluginHookToolContext = {
  sessionId?: string;
};

type PluginHookBeforeToolCallResult = {
  block?: boolean;
  blockReason?: string;
};

// Tools that perform read-only file access
const READ_TOOLS = new Set(["read", "image"]);

// Tools that perform write file access
const WRITE_TOOLS = new Set(["write", "edit", "apply-patch", "apply_patch"]);

// Tools that can perform arbitrary file access (exec/bash can do both)
const EXEC_TOOLS = new Set(["exec", "process"]);

export default defineRivonClawPlugin({
  id: "rivonclaw-file-permissions",
  name: "File Permissions",

  setup(api: PluginApi) {
    api.logger.info("Activating RivonClaw file permissions plugin");

    api.on("before_tool_call", handleBeforeToolCall(api), { priority: 100 });

    api.logger.info("File permissions hook registered");
  },
});

/**
 * Creates the hook handler for before_tool_call, closed over the plugin API for logging.
 */
function handleBeforeToolCall(api: PluginApi) {
  return async (
    event: PluginHookBeforeToolCallEvent,
    _ctx: PluginHookToolContext,
  ): Promise<PluginHookBeforeToolCallResult | void> => {
    const { toolName, params } = event;

    // Determine access mode based on tool type
    const isRead = READ_TOOLS.has(toolName);
    const isWrite = WRITE_TOOLS.has(toolName);
    const isExec = EXEC_TOOLS.has(toolName);

    api.logger.info(`[file-perms] tool=${toolName} isRead=${isRead} isWrite=${isWrite} isExec=${isExec}`);

    if (!isRead && !isWrite && !isExec) {
      return; // Allow non-file tools to proceed
    }

    // Parse permissions from environment variable
    const permissionsEnv = process.env.RIVONCLAW_FILE_PERMISSIONS;
    if (!permissionsEnv) {
      api.logger.info("[file-perms] No RIVONCLAW_FILE_PERMISSIONS env var, allowing all");
      return;
    }

    const permissions = parseFilePermissions(permissionsEnv);
    api.logger.info(`[file-perms] Parsed permissions: read=[${permissions.read.join(", ")}] write=[${permissions.write.join(", ")}]`);

    // Extract file paths from tool parameters
    let filePaths = extractFilePaths(params);

    // For exec tools, also extract paths from the command string
    if (isExec) {
      filePaths = [...filePaths, ...extractExecFilePaths(params)];
    }

    api.logger.info(`[file-perms] Extracted paths: [${filePaths.join(", ")}]`);

    if (filePaths.length === 0) {
      return;
    }

    // Determine permission check mode:
    // - "write": dedicated write tools (write/edit/apply-patch) require write permissions
    // - "read": dedicated read tools check both read+write paths
    // - "unknown": exec/process tools — actual access intent is ambiguous;
    //   treated as "read" for now, pending future LLM-based command analysis
    const mode: "read" | "write" | "unknown" = isWrite
      ? "write"
      : isRead
        ? "read"
        : "unknown";
    const effectiveMode = mode === "unknown" ? "read" : mode;

    // Validate all file paths
    const deniedPaths: string[] = [];
    for (const filePath of filePaths) {
      const allowed = isPathAllowed(filePath, permissions, effectiveMode);
      api.logger.info(`[file-perms] isPathAllowed(${filePath}, mode=${mode}, effective=${effectiveMode}) = ${allowed}`);
      if (!allowed) {
        deniedPaths.push(filePath);
      }
    }

    // Block if any paths are denied
    if (deniedPaths.length > 0) {
      const reason = `File access denied by RivonClaw (中文名：爪爪). The following paths are not in the allowed permissions: ${deniedPaths.join(", ")}. Ask the user to update permissions in RivonClaw (中文名：爪爪) panel's Permissions page.`;
      api.logger.info(`[file-perms] BLOCKED: ${reason}`);
      return {
        block: true,
        blockReason: reason,
      };
    }

    api.logger.info("[file-perms] ALLOWED");
    return;
  };
}
