import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

export const OPEN_CHROMIUM_RUNTIME_VERSION = "playwright-core@1.58.2";
export const OPEN_CHROMIUM_REVISION = "1208";
export const OPEN_CHROMIUM_VERSION = "145.0.7632.6";

export interface BrowserInstallOptions {
  cwd?: string;
  cacheDir?: string;
  writeEnv?: boolean;
  runInstaller?: () => Promise<{ code: number; output: string }>;
  exists?: (path: string) => boolean;
  hashFile?: (path: string) => Promise<string>;
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolveDone, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolveDone);
  });
  return hash.digest("hex");
}

async function runOfficialInstaller(cacheDir: string): Promise<{ code: number; output: string }> {
  const cli = join(import.meta.dir, "node_modules", "playwright-core", "cli.js");
  if (!existsSync(cli)) throw new Error("playwright-core installer is unavailable");
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: cacheDir };
  const child = Bun.spawn(
    [process.execPath, cli, "install", "chromium"],
    { cwd: import.meta.dir, env, stdout: "pipe", stderr: "inherit" },
  );
  const output = await new Response(child.stdout).text();
  process.stdout.write(output);
  return { code: await child.exited, output };
}

function managedChromiumPath(cacheDir: string, platform = process.platform): string {
  const root = join(cacheDir, `chromium-${OPEN_CHROMIUM_REVISION}`);
  const candidates = platform === "win32"
    ? [join(root, "chrome-win64", "chrome.exe")]
    : platform === "darwin"
      ? [
          join(root, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
          join(root, "chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"),
        ]
      : [join(root, "chrome-linux", "chrome"), join(root, "chrome-linux64", "chrome")];
  const executable = candidates.find(existsSync);
  if (!executable) throw new Error(`Playwright Chromium revision ${OPEN_CHROMIUM_REVISION} is incomplete`);
  return executable;
}

function installedPath(output: string, exists: (path: string) => boolean): string | null {
  const ansi = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
  const lines = output.split(/\r?\n/).map((line) => line.replace(ansi, "").trim()).filter(Boolean);
  return lines.reverse().find((line) => exists(line)) ?? null;
}

export function browserEnvText(current: string, binaryPath: string, sha256: string, newline = "\n", prefix: "IDFRI_CHROMIUM" | "ALIASMODE_FIREFOX" = "IDFRI_CHROMIUM"): string {
  const pathKey = `${prefix}_BINARY_PATH`;
  const hashKey = `${prefix}_BINARY_SHA256`;
  const owned = new RegExp(`^\\s*(?:${pathKey}|${hashKey})\\s*=.*$`, "i");
  const kept = current.split(/\r?\n/).filter((line) => !owned.test(line));
  while (kept.length && !kept.at(-1)?.trim()) kept.pop();
  if (kept.length) kept.push("");
  kept.push(`${pathKey}=${binaryPath}`, `${hashKey}=${sha256.toLowerCase()}`, "");
  return kept.join(newline);
}

/** Install Playwright's open-source Chromium build, then pin its exact executable hash. */
export async function installOpenChromium(opts: BrowserInstallOptions = {}): Promise<{ path: string; sha256: string }> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const cacheDir = resolve(opts.cacheDir ?? join(cwd, "runtime", "chromium-cache"));
  mkdirSync(cacheDir, { recursive: true });
  const run = opts.runInstaller ?? (() => runOfficialInstaller(cacheDir));
  const exists = opts.exists ?? existsSync;
  const result = await run();
  if (result.code !== 0) throw new Error(`Playwright Chromium installer exited with code ${result.code}`);
  const path = installedPath(result.output, exists) ?? managedChromiumPath(cacheDir);

  const sha256 = (await (opts.hashFile ?? sha256File)(path)).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("installed Chromium returned an invalid SHA-256");

  if (opts.writeEnv !== false) {
    const envPath = resolve(cwd, ".env");
    const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
    const newline = current.includes("\r\n") || process.platform === "win32" ? "\r\n" : "\n";
    writeFileSync(envPath, browserEnvText(current, path, sha256, newline), "utf8");
  }
  return { path, sha256 };
}
