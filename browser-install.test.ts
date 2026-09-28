import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  browserEnvText,
  IDFRI_BROWSER_ARCHIVE_NAME,
  IDFRI_BROWSER_ARCHIVE_SHA256,
  IDFRI_BROWSER_ARCHIVE_URL,
  IDFRI_BROWSER_EXECUTABLE_SHA256,
  IDFRI_BROWSER_RELEASE,
  OPEN_CHROMIUM_REVISION,
  OPEN_CHROMIUM_RUNTIME_VERSION,
  OPEN_CHROMIUM_VERSION,
  installOpenChromium,
} from "./browser-install.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("Chromium runtime identity is pinned to the ClearCote 150 preview", () => {
  expect(IDFRI_BROWSER_RELEASE).toBe("v0.1.0-pre.23");
  expect(IDFRI_BROWSER_ARCHIVE_NAME).toBe("clearcote-150.0.7871.114-windows-x64.zip");
  expect(IDFRI_BROWSER_ARCHIVE_URL).toBe(
    `https://github.com/clearcotelabs/clearcote-browser/releases/download/${IDFRI_BROWSER_RELEASE}/${IDFRI_BROWSER_ARCHIVE_NAME}`,
  );
  expect(IDFRI_BROWSER_ARCHIVE_SHA256).toBe("93fc03c45b931d8d82f714814318892929f44dd671b0993788332071d53f3135");
  expect(IDFRI_BROWSER_EXECUTABLE_SHA256).toBe("f49b0d6bc5a08857e34f951ddc456abc643283ae45ff330ee7c2c39cd75b4869");
  expect(OPEN_CHROMIUM_RUNTIME_VERSION).toBe("clearcote@150.0.7871.114-pre.23");
  expect(OPEN_CHROMIUM_REVISION).toBe("150.0.7871.114-pre.23");
  expect(OPEN_CHROMIUM_VERSION).toBe("150.0.7871.114");
});

test("browserEnvText preserves unrelated config and replaces old browser pins", () => {
  const hash = "a".repeat(64);
  const next = browserEnvText(
    "HUB_URL=https://hub.example\r\nIDFRI_CHROMIUM_BINARY_PATH=C:\\old\\chrome.exe\r\nIDFRI_CHROMIUM_BINARY_SHA256=bad\r\nHUB_PASSWORD=secret\r\n",
    "C:\\IDFRI\\runtime\\clearcote-150.0.7871.114-pre.23\\chrome.exe",
    hash.toUpperCase(),
    "\r\n",
  );
  expect(next).toContain("HUB_URL=https://hub.example\r\n");
  expect(next).toContain("HUB_PASSWORD=secret\r\n");
  expect(next).not.toContain("C:\\old");
  expect(next).toContain("IDFRI_CHROMIUM_BINARY_PATH=C:\\IDFRI\\runtime\\clearcote-150.0.7871.114-pre.23\\chrome.exe\r\n");
  expect(next).toContain(`IDFRI_CHROMIUM_BINARY_SHA256=${hash}\r\n`);
});

test("installOpenChromium downloads, verifies, and records ClearCote Chromium 150", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aliasmode-browser-install-"));
  dirs.push(dir);
  const binary = join(dir, "cache", `clearcote-${OPEN_CHROMIUM_REVISION}`, "chrome.exe");
  writeFileSync(join(dir, ".env"), "HUB_PASSWORD=keep-me\n");

  const result = await installOpenChromium({
    cwd: dir,
    cacheDir: join(dir, "cache"),
    platform: "win32",
    arch: "x64",
    downloadArchive: async (url) => {
      expect(url).toBe(IDFRI_BROWSER_ARCHIVE_URL);
      return new TextEncoder().encode("approved archive");
    },
    archiveHash: () => IDFRI_BROWSER_ARCHIVE_SHA256,
    extractArchive: async (_bytes, destination) => {
      writeFileSync(join(destination, "chrome.exe"), "browser");
      return 1;
    },
    hashFile: async () => IDFRI_BROWSER_EXECUTABLE_SHA256,
  });

  expect(result).toEqual({ path: binary, sha256: IDFRI_BROWSER_EXECUTABLE_SHA256 });
  const env = readFileSync(join(dir, ".env"), "utf8");
  expect(env).toContain("HUB_PASSWORD=keep-me");
  expect(env).toContain(`IDFRI_CHROMIUM_BINARY_PATH=${binary}`);
  expect(env).toContain(`IDFRI_CHROMIUM_BINARY_SHA256=${IDFRI_BROWSER_EXECUTABLE_SHA256}`);
});

test("installOpenChromium writes nothing when the ClearCote archive hash is wrong", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aliasmode-browser-install-fail-"));
  dirs.push(dir);
  const envPath = join(dir, ".env");
  writeFileSync(envPath, "HUB_PASSWORD=unchanged\n");
  await expect(installOpenChromium({
    cwd: dir,
    cacheDir: join(dir, "cache"),
    platform: "win32",
    arch: "x64",
    downloadArchive: async () => new TextEncoder().encode("changed archive"),
  })).rejects.toThrow("归档 SHA-256");
  expect(readFileSync(envPath, "utf8")).toBe("HUB_PASSWORD=unchanged\n");
});

test("installOpenChromium rejects an archive containing the wrong chrome.exe", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aliasmode-browser-install-executable-fail-"));
  dirs.push(dir);
  await expect(installOpenChromium({
    cwd: dir,
    cacheDir: join(dir, "cache"),
    platform: "win32",
    arch: "x64",
    writeEnv: false,
    downloadArchive: async () => new TextEncoder().encode("approved archive"),
    archiveHash: () => IDFRI_BROWSER_ARCHIVE_SHA256,
    extractArchive: async (_bytes, destination) => {
      writeFileSync(join(destination, "chrome.exe"), "changed browser");
      return 1;
    },
    hashFile: async () => "0".repeat(64),
  })).rejects.toThrow("可执行文件 SHA-256");
});

test("installOpenChromium can return a verified binary without writing environment pins", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aliasmode-browser-install-no-env-"));
  dirs.push(dir);
  const binary = join(dir, "cache", `clearcote-${OPEN_CHROMIUM_REVISION}`, "chrome.exe");
  const sha256 = IDFRI_BROWSER_EXECUTABLE_SHA256;

  await expect(installOpenChromium({
    cwd: dir,
    cacheDir: join(dir, "cache"),
    writeEnv: false,
    platform: "win32",
    arch: "x64",
    downloadArchive: async () => new TextEncoder().encode("approved archive"),
    archiveHash: () => IDFRI_BROWSER_ARCHIVE_SHA256,
    extractArchive: async (_bytes, destination) => {
      writeFileSync(join(destination, "chrome.exe"), "browser");
      return 1;
    },
    hashFile: async () => sha256,
  })).resolves.toEqual({ path: binary, sha256 });

  expect(existsSync(join(dir, ".env"))).toBe(false);
});

test("installOpenChromium reuses only a fully verified cached ClearCote browser", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aliasmode-browser-install-cache-"));
  dirs.push(dir);
  const root = join(dir, "cache", `clearcote-${OPEN_CHROMIUM_REVISION}`);
  const binary = join(root, "chrome.exe");
  mkdirSync(root, { recursive: true });
  writeFileSync(binary, "browser");
  writeFileSync(join(root, ".archive-sha256"), `${IDFRI_BROWSER_ARCHIVE_SHA256}\n`);

  await expect(installOpenChromium({
    cwd: dir,
    cacheDir: join(dir, "cache"),
    writeEnv: false,
    platform: "win32",
    arch: "x64",
    downloadArchive: async () => { throw new Error("verified cache must not download"); },
    hashFile: async () => IDFRI_BROWSER_EXECUTABLE_SHA256,
  })).resolves.toEqual({ path: binary, sha256: IDFRI_BROWSER_EXECUTABLE_SHA256 });
});

test("installOpenChromium rejects hosts without a ClearCote Chromium 150 build", async () => {
  await expect(installOpenChromium({ platform: "linux", arch: "x64", writeEnv: false }))
    .rejects.toThrow("Windows x64");
});
