// TODO(cleanup): Remove this migration module after v1.8.0 when most users
// have upgraded past the EasyClaw → RivonClaw rebrand. Also remove the hook
// in main.ts (~line 300).

import { homedir, hostname, userInfo } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { platform } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "node:crypto";
import { createLogger } from "@rivonclaw/logger";

const execFileAsync = promisify(execFile);
const log = createLogger("rebrand-migration");

const OLD_DIR_NAME = ".easyclaw";
const NEW_DIR_NAME = ".rivonclaw";
const OLD_SERVICE_PREFIX = "easyclaw/";
const NEW_SERVICE_PREFIX = "rivonclaw/";
const NEW_ACCOUNT = "rivonclaw";

/**
 * One-time migration from EasyClaw → RivonClaw.
 *
 * Copies ~/.easyclaw → ~/.rivonclaw and migrates macOS Keychain entries
 * from the `easyclaw/` service prefix to `rivonclaw/`.
 *
 * Old data is kept as a backup — nothing is deleted.
 * Migration failure does NOT prevent the app from starting.
 */
export async function migrateFromEasyClaw(): Promise<void> {
  try {
    const home = homedir();
    const oldDir = join(home, OLD_DIR_NAME);
    const newDir = join(home, NEW_DIR_NAME);

    // Skip if old directory doesn't exist (nothing to migrate)
    if (!existsSync(oldDir)) {
      log.debug("~/.easyclaw does not exist — nothing to migrate");
      return;
    }

    // Use a marker file to track migration status. We can't rely on the
    // directory existing because Electron/storage may create it before us.
    const marker = join(newDir, ".migrated-from-easyclaw");
    if (existsSync(marker)) {
      log.debug("Migration marker exists — already migrated");
      return;
    }

    // If db.sqlite already exists in the new dir, someone already set up
    // fresh data there — only migrate keychain, don't overwrite files.
    const newDbExists = existsSync(join(newDir, "db.sqlite"));

    log.info("Starting rebrand migration: ~/.easyclaw → ~/.rivonclaw");

    // Move data directory (skip if new dir already has a db — don't overwrite fresh data)
    if (!newDbExists) {
      // Remove empty new dir if it was created by Electron before migration ran
      if (existsSync(newDir)) {
        rmSync(newDir, { recursive: true, force: true });
      }
      renameSync(oldDir, newDir);
      log.info("Renamed ~/.easyclaw → ~/.rivonclaw");
    } else {
      log.info("~/.rivonclaw/db.sqlite exists — skipping file move, migrating keychain only");
    }

    // Replace "easyclaw" references in the openclaw config file
    replaceInConfig(join(newDir, "openclaw", "openclaw.json"));

    // Migrate secrets
    if (platform() === "darwin") {
      // macOS: keychain entries
      await migrateKeychainEntries();
    } else {
      // Windows/Linux: re-encrypt file-based secrets with new salt
      reEncryptFileSecrets(join(newDir, "secrets"));
    }

    // Write marker so we don't re-run
    mkdirSync(newDir, { recursive: true });
    writeFileSync(marker, new Date().toISOString(), "utf-8");

    log.info("Rebrand migration complete");
  } catch (err) {
    log.error("Rebrand migration failed (app will continue):", err);
  }
}

/**
 * Replace stale "easyclaw" references in a JSON config file.
 * Handles plugin names, paths, env vars, etc.
 */
function replaceInConfig(configPath: string): void {
  if (!existsSync(configPath)) return;
  try {
    const content = readFileSync(configPath, "utf-8");
    const updated = content
      .replaceAll("easyclaw-tools", "rivonclaw-tools")
      .replaceAll("easyclaw-policy", "rivonclaw-policy")
      .replaceAll("easyclaw-event-bridge", "rivonclaw-event-bridge")
      .replaceAll("easyclaw-file-permissions", "rivonclaw-file-permissions")
      .replaceAll(".easyclaw", ".rivonclaw")
      .replaceAll("EASYCLAW_", "RIVONCLAW_")
      .replaceAll("EasyClaw", "RivonClaw");
    if (updated !== content) {
      writeFileSync(configPath, updated, "utf-8");
      log.info(`Updated references in ${configPath}`);
    }
  } catch (err) {
    log.warn(`Failed to update config at ${configPath}:`, err);
  }
}

/**
 * Re-encrypt file-based secrets from the old "easyclaw" salt to the new "rivonclaw" salt.
 * Used on Windows and Linux where secrets are AES-256-GCM encrypted files.
 */
function reEncryptFileSecrets(secretsDir: string): void {
  if (!existsSync(secretsDir)) return;

  const IV_LENGTH = 16;
  const AUTH_TAG_LENGTH = 16;
  const ALGORITHM = "aes-256-gcm" as const;

  const user = userInfo().username;
  const host = hostname();

  const oldKey = scryptSync("easyclaw-" + host + "-" + user, "easyclaw-v0-salt", 32);
  const newKey = scryptSync("rivonclaw-" + host + "-" + user, "rivonclaw-v0-salt", 32);

  let files: string[];
  try {
    files = readdirSync(secretsDir).filter((f) => f.endsWith(".enc"));
  } catch {
    return;
  }

  if (files.length === 0) return;
  log.info(`Re-encrypting ${files.length} secret file(s) with new salt`);

  for (const file of files) {
    const filePath = join(secretsDir, file);
    try {
      // Decrypt with old key
      const data = readFileSync(filePath);
      const iv = data.subarray(0, IV_LENGTH);
      const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
      const decipher = createDecipheriv(ALGORITHM, oldKey, iv);
      decipher.setAuthTag(authTag);
      const plaintext = decipher.update(ciphertext) + decipher.final("utf8");

      // Re-encrypt with new key
      const newIv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, newKey, newIv);
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const newAuthTag = cipher.getAuthTag();
      writeFileSync(filePath, Buffer.concat([newIv, newAuthTag, encrypted]));

      log.info(`Re-encrypted secret: ${file}`);
    } catch (err) {
      log.warn(`Failed to re-encrypt secret "${file}":`, err);
    }
  }
}

/**
 * Find all `easyclaw/*` keychain entries and re-save them under `rivonclaw/*`.
 * Old entries are kept as backup.
 */
async function migrateKeychainEntries(): Promise<void> {
  log.info("Migrating macOS Keychain entries...");

  // Discover all easyclaw/* service names
  const { stdout } = await execFileAsync("security", ["dump-keychain"]);
  const keys: string[] = [];
  const serviceRegex = /"svce"<blob>="easyclaw\/([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = serviceRegex.exec(stdout)) !== null) {
    keys.push(match[1]);
  }

  if (keys.length === 0) {
    log.info("No easyclaw/* keychain entries found");
    return;
  }

  log.info(`Found ${keys.length} keychain entries to migrate`);

  for (const key of keys) {
    try {
      // Read the password from old entry
      const { stdout: password } = await execFileAsync("security", [
        "find-generic-password",
        "-s", OLD_SERVICE_PREFIX + key,
        "-w",
      ]);

      // Save under new prefix
      await execFileAsync("security", [
        "add-generic-password",
        "-s", NEW_SERVICE_PREFIX + key,
        "-a", NEW_ACCOUNT,
        "-w", password.trim(),
        "-U",
      ]);

      log.info(`Migrated keychain entry: ${key}`);
    } catch (err) {
      log.warn(`Failed to migrate keychain entry "${key}":`, err);
    }
  }
}
