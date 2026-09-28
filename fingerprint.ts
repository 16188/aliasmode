/** Deterministic IDFRI Browser fingerprint derivation. */

import type { Profile } from "./types.ts";
import { proxyUrl } from "./proxy.ts";

/** FNV-1a 32-bit hash → positive integer. Stable across runs and platforms. */
export function deterministicSeed(profileId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < profileId.length; i++) {
    h ^= profileId.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts to stay in integer range.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  // Keep it well clear of 0 so a seed is always "set".
  return h === 0 ? 1 : h;
}

/** Parse AdsPower "1680*1050" (or "1680x1050") → width/height; default 1920x1080. */
export function parseResolution(res: string): { width: number; height: number } {
  const m = (res ?? "").trim().match(/^(\d{3,5})\s*[*x×]\s*(\d{3,5})$/i);
  if (!m) return { width: 1920, height: 1080 };
  return { width: Number(m[1]), height: Number(m[2]) };
}

/** Mobile UAs cannot be represented coherently by AliasMode's desktop browser. */
export function isMobileUserAgent(ua: string): boolean {
  return /\b(?:android|iphone|ipad|ipod|windows phone|mobile)\b/i.test(ua ?? "");
}

/** Infer a recognized desktop platform; blank/mobile/unknown UAs have no imported persona. */
export function platformFromUA(ua: string): "windows" | "macos" | "linux" | null {
  const s = (ua ?? "").toLowerCase();
  if (s.includes("mac os") || s.includes("macintosh")) return "macos";
  if (s.includes("linux") && !s.includes("android")) return "linux";
  if (s.includes("windows")) return "windows";
  return null;
}

/** The platform this host would present, recorded once at profile creation. */
export function hostPlatformOs(): "windows" | "macos" | "linux" {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  return "linux";
}

/** Infer only architecture tokens that a desktop UA states explicitly. */
export function architectureFromUA(ua: string): "x64" | "arm64" | null {
  const s = (ua ?? "").toLowerCase();
  if (/\b(?:arm64|aarch64)\b/.test(s)) return "arm64";
  if (/\b(?:x86_64|x64|amd64|win64|wow64)\b/.test(s)) return "x64";
  return null;
}

/** Pull the Chrome major version (e.g. "143") out of a UA, or null. */
export function chromeMajorFromUA(ua: string): string | null {
  const m = (ua ?? "").match(/Chrome\/(\d+)/);
  return m ? m[1]! : null;
}

export type DesktopPersonaPlatform = "windows" | "macos";

export interface MobilePersonaConversion {
  profile: Profile;
  platform: DesktopPersonaPlatform;
  screenChanged: boolean;
}

const DESKTOP_SCREENS: ReadonlyArray<readonly [number, number]> = [
  [1920, 1080],
  [1536, 864],
  [1366, 768],
  [1440, 900],
  [1600, 900],
  [2560, 1440],
];

function mobilePersonaDesktopPlatform(ua: string): DesktopPersonaPlatform {
  // This deliberately follows the effective pre-hardening behavior. The old
  // platform classifier mapped Apple mobile UAs to macOS and defaulted Android
  // and Windows Phone to Windows. Keeping that family minimizes account-visible
  // discontinuity while replacing the impossible mobile claim.
  return /\b(?:iphone|ipad|ipod)\b|mac os/i.test(ua) ? "macos" : "windows";
}

function sourceChromiumMajor(ua: string): string {
  // Preserve the imported major when one exists. Current AliasMode does not
  // force it at launch; this only keeps the persisted/exported desktop UA
  // meaningful and remains compatible with older managers.
  return ua.match(/\b(?:Chrome|CriOS)\/(\d+)/i)?.[1] ?? "146";
}

function desktopUserAgent(platform: DesktopPersonaPlatform, sourceUa: string): string {
  const major = sourceChromiumMajor(sourceUa);
  if (platform === "macos") {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

/**
 * Convert an imported mobile persona into the closest coherent desktop one.
 *
 * This is intentionally a narrow, explicit migration: account credentials,
 * cookies, proxy, timezone, fingerprint seed, extensions and tags remain
 * untouched. A plausible landscape desktop screen is preserved; a phone/tablet
 * screen is replaced deterministically from the existing seed so retries are
 * idempotent and the result does not rotate between operators.
 */
export function convertMobilePersonaToDesktop(profile: Profile): MobilePersonaConversion {
  if (!isMobileUserAgent(profile.ua)) {
    throw new Error("profile does not have a mobile persona");
  }
  const platform = mobilePersonaDesktopPlatform(profile.ua);
  const plausibleDesktopScreen = profile.screenWidth >= 1024
    && profile.screenHeight >= 600
    && profile.screenWidth >= profile.screenHeight;
  const screen = plausibleDesktopScreen
    ? [profile.screenWidth, profile.screenHeight] as const
    : DESKTOP_SCREENS[profile.fingerprintSeed % DESKTOP_SCREENS.length]!;
  return {
    platform,
    screenChanged: !plausibleDesktopScreen,
    profile: {
      ...profile,
      ua: desktopUserAgent(platform, profile.ua),
      screenWidth: screen[0],
      screenHeight: screen[1],
    },
  };
}

const CHROMIUM_VERSION = "150.0.7871.114";
const CHROMIUM_MAJOR = "150";

const WINDOWS_FONTS = [
  "Arial", "Arial Black", "Bahnschrift", "Calibri", "Cambria", "Candara",
  "Comic Sans MS", "Consolas", "Constantia", "Corbel", "Courier New", "Ebrima",
  "Gadugi", "Georgia", "Impact", "Leelawadee UI", "MS Gothic", "MV Boli",
  "Malgun Gothic", "Microsoft JhengHei", "Microsoft YaHei", "Nirmala UI",
  "Segoe UI", "Segoe UI Emoji", "Segoe UI Variable", "Sitka", "Sylfaen",
  "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana", "Webdings", "Wingdings",
  "Yu Gothic",
];

const WEBGL_EXTENSIONS = [
  "ANGLE_instanced_arrays", "EXT_blend_minmax", "EXT_clip_control",
  "EXT_color_buffer_half_float", "EXT_depth_clamp", "EXT_float_blend",
  "EXT_frag_depth", "EXT_polygon_offset_clamp", "EXT_shader_texture_lod",
  "EXT_texture_compression_bptc", "EXT_texture_compression_rgtc",
  "EXT_texture_filter_anisotropic", "EXT_texture_mirror_clamp_to_edge", "EXT_sRGB",
  "OES_element_index_uint", "OES_fbo_render_mipmap", "OES_standard_derivatives",
  "OES_texture_float", "OES_texture_float_linear", "OES_texture_half_float",
  "OES_texture_half_float_linear", "OES_vertex_array_object",
  "WEBGL_blend_func_extended", "WEBGL_color_buffer_float",
  "WEBGL_compressed_texture_s3tc", "WEBGL_compressed_texture_s3tc_srgb",
  "WEBGL_debug_renderer_info", "WEBGL_debug_shaders", "WEBGL_depth_texture",
  "WEBGL_draw_buffers", "WEBGL_lose_context", "WEBGL_multi_draw", "WEBGL_polygon_mode",
];

const WEBGL_PARAMS = {
  MAX_TEXTURE_SIZE: 16384,
  MAX_RENDERBUFFER_SIZE: 16384,
  MAX_CUBE_MAP_TEXTURE_SIZE: 16384,
  MAX_TEXTURE_IMAGE_UNITS: 16,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32,
  MAX_VERTEX_ATTRIBS: 16,
  MAX_VERTEX_UNIFORM_VECTORS: 4096,
  MAX_FRAGMENT_UNIFORM_VECTORS: 1024,
  MAX_VARYING_VECTORS: 30,
  RED_BITS: 8,
  GREEN_BITS: 8,
  BLUE_BITS: 8,
  ALPHA_BITS: 8,
  DEPTH_BITS: 24,
  STENCIL_BITS: 0,
  SUBPIXEL_BITS: 4,
  SAMPLE_BUFFERS: 0,
  SAMPLES: 0,
  MAX_VIEWPORT_DIMS: "32767,32767",
  ALIASED_LINE_WIDTH_RANGE: "1,1",
  ALIASED_POINT_SIZE_RANGE: "1,1024",
  VENDOR: "WebKit",
  RENDERER: "WebKit WebGL",
  UNMASKED_VENDOR_WEBGL: "Google Inc. (NVIDIA)",
  UNMASKED_RENDERER_WEBGL: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
};

const U64_MASK = (1n << 64n) - 1n;

function mix64(value: bigint): bigint {
  let z = (value + 0x9e3779b97f4a7c15n) & U64_MASK;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64_MASK;
  return (z ^ (z >> 31n)) & U64_MASK;
}

function subSeed(seed: number, purpose: string): number {
  let value = BigInt(seed >>> 0);
  for (const byte of new TextEncoder().encode(purpose)) value = mix64(value ^ BigInt(byte));
  return Number(mix64(value) & 0x7fffffffn);
}

/**
 * Build the complete schema consumed by the source-level IDFRI Chromium patches.
 * The hardware values come from Fury's measured Windows 11 / RTX 4060 persona;
 * profile-owned screen, timezone and noise seeds stay stable across launches.
 */
export function deriveIdfriFingerprintConfig(profile: Profile) {
  const platform = profile.platformOs || platformFromUA(profile.ua) || "windows";
  if (platform !== "windows") {
    throw new Error(`IDFRI Browser 当前仅支持 Windows 指纹资料，收到：${platform}`);
  }
  const width = Math.max(640, Math.round(profile.screenWidth));
  const height = Math.max(480, Math.round(profile.screenHeight));
  const fullBrands = [
    "Not;A=Brand/8.0.0.0",
    `Chromium/${CHROMIUM_VERSION}`,
    `Google Chrome/${CHROMIUM_VERSION}`,
  ];
  return {
    schema_version: 1,
    navigator: {
      userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36`,
      platform: "Win32",
      languages: ["zh-CN", "zh"],
      hardwareConcurrency: 12,
      deviceMemory: 8,
      maxTouchPoints: 0,
    },
    clientHints: {
      brands: ["Not;A=Brand/8", `Chromium/${CHROMIUM_MAJOR}`, `Google Chrome/${CHROMIUM_MAJOR}`],
      fullVersionList: fullBrands,
      platform: "Windows",
      platformVersion: "15.0.0",
      architecture: "x86",
      bitness: "64",
      model: "",
      mobile: false,
      wow64: false,
      fullVersion: CHROMIUM_VERSION,
      formFactors: [],
    },
    screen: {
      width,
      height,
      availWidth: width,
      availHeight: Math.max(480, height - 48),
      availLeft: 0,
      availTop: 0,
      colorDepth: 24,
      devicePixelRatio: 1,
      chromeHeightDelta: 139,
      chromeWidthDelta: 0,
      scrollbarWidth: 15,
    },
    gpu: {
      webglParams: WEBGL_PARAMS,
      webglExtensions: WEBGL_EXTENSIONS,
      webgpu: {
        vendor: "nvidia",
        architecture: "ada",
        device: "",
        description: "",
        limits: {
          maxTextureDimension1D: 16384,
          maxTextureDimension2D: 16384,
          maxTextureDimension3D: 2048,
          maxTextureArrayLayers: 2048,
          maxBindGroups: 4,
          maxBindingsPerBindGroup: 1000,
          maxVertexAttributes: 16,
          maxVertexBuffers: 8,
          maxColorAttachments: 8,
          maxBufferSize: 2147483648,
          maxUniformBufferBindingSize: 65536,
          maxStorageBufferBindingSize: 2147483644,
          minUniformBufferOffsetAlignment: 256,
          minStorageBufferOffsetAlignment: 256,
        },
        features: [
          "depth-clip-control", "depth32float-stencil8", "texture-compression-bc",
          "timestamp-query", "indirect-first-instance", "shader-f16",
          "rg11b10ufloat-renderable", "float32-filterable",
        ],
      },
    },
    audio: { sampleRate: 48000, baseLatency: 0.01, outputLatency: 0.02 },
    fonts: WINDOWS_FONTS,
    locale: { timezone: profile.timezone || "Asia/Shanghai", locale: "zh-CN" },
    noise: {
      canvasSeed: subSeed(profile.fingerprintSeed, "canvas"),
      audioSeed: subSeed(profile.fingerprintSeed, "audio"),
      clientRectsSeed: subSeed(profile.fingerprintSeed, "clientRects"),
      deviceIdSalt: subSeed(profile.fingerprintSeed, "deviceId"),
    },
    permissions: { notifications: "prompt", geolocation: "prompt" },
    engine: { jsHeapSizeLimit: 4294705152 },
    automation: { hideTraces: true },
    webrtc: { ipHandlingPolicy: "disable_non_proxied_udp" },
    battery: { charging: true, level: 1, chargingTime: 0, dischargingTime: -1 },
  };
}

/** Map the stored IDFRI persona to ClearCote Chromium 150's native switches. */
export function deriveClearcoteFingerprintArgs(profile: Profile): string[] {
  const config = deriveIdfriFingerprintConfig(profile);
  return [
    `--fingerprint=${profile.fingerprintSeed}`,
    "--fingerprint-platform=windows",
    `--fingerprint-platform-version=${config.clientHints.platformVersion}`,
    "--fingerprint-brand=chrome",
    `--fingerprint-brand-version=${CHROMIUM_VERSION}`,
    `--fingerprint-gpu-vendor=${config.gpu.webglParams.UNMASKED_VENDOR_WEBGL}`,
    `--fingerprint-gpu-renderer=${config.gpu.webglParams.UNMASKED_RENDERER_WEBGL}`,
    `--fingerprint-hardware-concurrency=${config.navigator.hardwareConcurrency}`,
    `--fingerprint-device-memory=${config.navigator.deviceMemory}`,
    `--fingerprint-screen-width=${config.screen.width}`,
    `--fingerprint-screen-height=${config.screen.height}`,
    `--fingerprint-avail-width=${config.screen.availWidth}`,
    `--fingerprint-avail-height=${config.screen.availHeight}`,
    `--fingerprint-color-depth=${config.screen.colorDepth}`,
    `--fingerprint-device-pixel-ratio=${config.screen.devicePixelRatio}`,
    `--fingerprint-max-touch-points=${config.navigator.maxTouchPoints}`,
    `--timezone=${config.locale.timezone}`,
    "--accept-lang=zh-CN,zh,en-US,en",
    "--lang=zh-CN",
    `--fingerprint-tls-profile=chrome-${CHROMIUM_MAJOR}`,
  ];
}

/** Render a ProxySpec as a Chromium `--proxy-server` value with inline credentials. */
export function proxyServerFlag(profile: Profile): string | null {
  const p = profile.proxy;
  if (!p) return null;
  return `--proxy-server=${proxyUrl(p)}`;
}
