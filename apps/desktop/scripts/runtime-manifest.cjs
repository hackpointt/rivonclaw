// @ts-check
// Runtime manifest utilities for the archive-based vendor packaging pipeline.
//
// The manifest records metadata about a runtime archive (content hash, version,
// platform, timestamp) so the hydrator can verify integrity after extraction
// and detect version mismatches without unpacking the archive.
//
// Shared between create-runtime-archive.cjs (writes) and the runtime hydrator
// in main.ts (reads).

const fs = require("fs");
const path = require("path");

const MANIFEST_FILENAME = "runtime-manifest.json";

/**
 * @typedef {Object} RuntimeManifest
 * @property {string} version     - Vendor package.json version (e.g. "2026.3.7")
 * @property {string} sha256      - Hex-encoded SHA-256 of the archive file
 * @property {string} platform    - Node.js process.platform at build time
 * @property {string} arch        - Node.js process.arch at build time
 * @property {string} createdAt   - ISO-8601 timestamp of archive creation
 * @property {string} archiveFile - Basename of the archive file
 */

/**
 * Read and parse a runtime manifest from a directory.
 *
 * @param {string} dir - Directory containing runtime-manifest.json
 * @returns {RuntimeManifest | null} Parsed manifest, or null if not found / invalid
 */
function readManifest(dir) {
  const manifestPath = path.join(dir, MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) return null;
  const raw = fs.readFileSync(manifestPath, "utf-8");
  const data = JSON.parse(raw);
  if (!data.version || !data.sha256 || !data.platform || !data.createdAt) {
    return null;
  }
  return /** @type {RuntimeManifest} */ (data);
}

/**
 * Write a runtime manifest to a directory.
 *
 * @param {string} dir  - Directory to write runtime-manifest.json into
 * @param {RuntimeManifest} data - Manifest data
 */
function writeManifest(dir, data) {
  const manifestPath = path.join(dir, MANIFEST_FILENAME);
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

module.exports = {
  MANIFEST_FILENAME,
  readManifest,
  writeManifest,
};
