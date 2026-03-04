/**
 * Startup timing preload script.
 *
 * Injected via NODE_OPTIONS="--require .../startup-timer.cjs" by the launcher.
 * Logs timestamps for key startup phases so we can see where time is spent.
 *
 * Also contains the plugin-sdk Module._resolveFilename fix that prevents jiti
 * from babel-transforming the 17 MB plugin-sdk on every startup.
 *
 * Output goes to stderr so it doesn't interfere with stdout protocol messages.
 */
"use strict";

const t0 = performance.now();
let requireCount = 0;
let requireTotalMs = 0;

const fs = require("fs");
const path = require("path");

function logPhase(label) {
  const elapsed = (performance.now() - t0).toFixed(0);
  process.stderr.write(`[startup-timer] +${elapsed}ms ${label}\n`);
}

logPhase("preload executing");

// ── Compile cache diagnostic ──
// Log whether NODE_COMPILE_CACHE is set and how many cache entries exist.
// Helps verify that V8 compile cache is working (2nd+ startup should be faster).
const compileCacheDir = process.env.NODE_COMPILE_CACHE;
if (compileCacheDir) {
  try {
    const entries = fs.readdirSync(compileCacheDir).filter((f) => !f.startsWith("."));
    logPhase(`compile cache: ${compileCacheDir} (${entries.length} entries)`);
    for (const e of entries) {
      const sub = path.join(compileCacheDir, e);
      if (fs.statSync(sub).isDirectory()) {
        const subEntries = fs.readdirSync(sub);
        logPhase(`  cache bucket: ${e} (${subEntries.length} files)`);
      }
    }
  } catch {
    logPhase(`compile cache: ${compileCacheDir} (not readable)`);
  }
} else {
  logPhase("compile cache: DISABLED (NODE_COMPILE_CACHE not set)");
}

// ── Hook CJS Module._load ──
const Module = require("module");
const origLoad = Module._load;

// ── Fix: Redirect openclaw/plugin-sdk to the already-loaded module ──
// Extensions use require("openclaw/plugin-sdk") as an external dependency.
// Without this hook, Node.js native require fails (no node_modules/openclaw/),
// causing jiti to fall back to its babel-transform pipeline. jiti's nested
// requires are NOT cached to disk, so the plugin-sdk gets babel-transformed
// on EVERY startup (~12 s macOS, ~22 s Windows).
//
// This hook captures the absolute path of plugin-sdk when entry.js first
// loads it via require("./plugin-sdk/index.js"), then redirects all future
// require("openclaw/plugin-sdk") calls to that path. jiti's native require
// succeeds → no fallback → no babel → instant extension loading.
//
// With lazy-chunked plugin-sdk (Phase 0.5a), the index.js is a thin ~20KB
// wrapper with lazy getters. Loading it costs <1ms. Only when an extension
// accesses a specific export does the corresponding chunk load.
let pluginSdkResolvedPath = null;
let pluginSdkDir = null;

const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWithPluginSdk(
  request,
  parent,
  isMain,
  options,
) {
  if (pluginSdkResolvedPath) {
    if (request === "openclaw/plugin-sdk") {
      return pluginSdkResolvedPath;
    }
    if (request.startsWith("openclaw/plugin-sdk/")) {
      // e.g. "openclaw/plugin-sdk/account-id" → "<sdk-dir>/account-id"
      const subpath = request.slice("openclaw/plugin-sdk/".length);
      return origResolveFilename.call(
        this,
        path.join(pluginSdkDir, subpath),
        parent,
        isMain,
        options,
      );
    }
  }
  return origResolveFilename.call(this, request, parent, isMain, options);
};

Module._load = function timedLoad(request, parent, isMain) {
  requireCount++;
  const start = performance.now();

  // Capture plugin-sdk path on first load for the _resolveFilename hook above.
  if (!pluginSdkResolvedPath && /plugin-sdk[/\\]index\.js$/.test(request)) {
    try {
      pluginSdkResolvedPath = origResolveFilename.call(
        Module,
        request,
        parent,
        isMain,
      );
      pluginSdkDir = path.dirname(pluginSdkResolvedPath);
      logPhase(`plugin-sdk alias set: ${pluginSdkResolvedPath}`);
    } catch {
      // Non-critical — extensions will still load via jiti fallback
    }
  }

  const result = origLoad.call(this, request, parent, isMain);
  const dur = performance.now() - start;
  requireTotalMs += dur;

  if (dur > 100) {
    const shortReq =
      request.length > 60 ? "..." + request.slice(-57) : request;
    logPhase(`require("${shortReq}") took ${dur.toFixed(0)}ms`);
  }
  return result;
};

// Log when the event loop starts processing (= all top-level ESM code done).
setImmediate(() => {
  logPhase(
    `event loop started (${requireCount} requires/${requireTotalMs.toFixed(0)}ms)`,
  );
});

// Log when the gateway starts listening (detect via stdout write)
const origStdoutWrite = process.stdout.write;
process.stdout.write = function (chunk, ...args) {
  const str = typeof chunk === "string" ? chunk : chunk.toString();
  if (str.includes("listening on")) {
    logPhase("gateway listening (READY)");
    // Flush V8 compile cache to disk immediately. Critical on Windows where
    // the process is force-killed via `taskkill /T /F` — without an explicit
    // flush, V8 never writes the cache and every startup pays full parse cost.
    try {
      if (typeof Module.flushCompileCache === "function") {
        Module.flushCompileCache();
        logPhase("compile cache flushed to disk");
      }
    } catch {
      // Non-critical — cache will be written at next graceful exit (if any)
    }
  }
  return origStdoutWrite.call(this, chunk, ...args);
};

// Log at process exit for total lifetime
process.on("exit", () => {
  logPhase("process exiting");
});
