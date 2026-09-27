import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  browserEnvText,
  OPEN_CHROMIUM_REVISION,
  OPEN_CHROMIUM_RUNTIME_VERSION,
  OPEN_CHROMIUM_VERSION,
  installOpenChromium,
} from "./browser-install.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("open Chromium runtime identity is pinned to playwright-core", () => {
  expect(OPEN_CHROMIUM_RUNTIME_VERSION).toBe("playwright-core@1.58.2");
  expect(OPEN_CHROMIUM_REVISION).toBe("1208");
  expect(OPEN_CHROMIUM_VERSION).toBe("145.0.7632.6");
});

test("browserEnvText preserves unrelated config and replaces old browser pins", () => {
  const hash = "a".repeat(64);
  const next = browserEnvText(
    "HUB_URL=https://hub.example\r\nIDFRI_CHROMIUM_BINARY_PATH=C:\\old\\chrome.exe\r\nIDFRI_CHROMIUM_BINARY_SHA256=bad\r\nHUB_PASSWORD=secret\r\n",
    "C:\\IDFRI\\runtime\\chromium-1208\\chrome.exe",
    hash.toUpperCase(),
    "\r\n",
  );
  expect(next).toContain("HUB_URL=https://hub.example\r\n");
  expect(next).toContain("HUB_PASSWORD=secret\r\n");
  expect(next).not.toContain("C:\\old");
  expect(next).toContain("IDFRI_CHROMIUM_BINARY_PATH=C:\\IDFRI\\runtime\\chromium-1208\\chrome.exe\r\n");
  expect(next).toContain(`IDFRI_CHROMIUM_BINARY_SHA256=${hash}\r\n`);
});

test("installOpenChromium records the readable binary reported by the Playwright installer", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aliasmode-browser-install-"));
  dirs.push(dir);
  const binary = join(dir, "cache", "chrome.exe");
  writeFileSync(join(dir, ".env"), "HUB_PASSWORD=keep-me\n");

  const result = await installOpenChromium({
    cwd: dir,
    runInstaller: async () => ({ code: 0, output: `Downloading...\n${binary}\n` }),
    exists: (path) => path === binary,
    hashFile: async () => "c".repeat(64),
  });

  expect(result).toEqual({ path: binary, sha256: "c".repeat(64) });
  const env = readFileSync(join(dir, ".env"), "utf8");
  expect(env).toContain("HUB_PASSWORD=keep-me");
  expect(env).toContain(`IDFRI_CHROMIUM_BINARY_PATH=${binary}`);
  expect(env).toContain(`IDFRI_CHROMIUM_BINARY_SHA256=${"c".repeat(64)}`);
});

test("installOpenChromium writes nothing when the Playwright installer fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aliasmode-browser-install-fail-"));
  dirs.push(dir);
  const envPath = join(dir, ".env");
  writeFileSync(envPath, "HUB_PASSWORD=unchanged\n");
  await expect(installOpenChromium({
    cwd: dir,
    runInstaller: async () => ({ code: 9, output: "download failed" }),
  })).rejects.toThrow("exited with code 9");
  expect(readFileSync(envPath, "utf8")).toBe("HUB_PASSWORD=unchanged\n");
});

test("installOpenChromium can return a verified binary without writing environment pins", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aliasmode-browser-install-no-env-"));
  dirs.push(dir);
  const binary = join(dir, "cache", "chrome");
  const sha256 = "b".repeat(64);

  await expect(installOpenChromium({
    cwd: dir,
    writeEnv: false,
    runInstaller: async () => ({ code: 0, output: `${binary}\n` }),
    exists: (path) => path === binary,
    hashFile: async () => sha256,
  })).resolves.toEqual({ path: binary, sha256 });

  expect(existsSync(join(dir, ".env"))).toBe(false);
});
