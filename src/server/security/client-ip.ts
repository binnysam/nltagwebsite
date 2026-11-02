/**
 * Client IP resolution behind Hostinger's CDN — the one place that decides which address a request
 * comes from. Used by Better Auth's rate limiter (through CLIENT_IP_HEADER), the audit log and the
 * header-shape capture. Rules and trust assumptions: docs/backend/client-ip.md.
 *
 * Nothing here trusts a forwarding header blindly:
 * - X-Forwarded-For is read from the RIGHT. Entries our own infrastructure appends are skipped by
 *   count (CLIENT_IP_PROXY_HOPS); everything to the left of the client entry is caller-supplied
 *   and ignored. The leftmost entry is never used.
 * - With CLIENT_IP_CROSSCHECK=x-real-ip (the default), the chosen entry must also equal X-Real-IP,
 *   which Hostinger's CDN sets to the address that connected to it. Two independent headers have
 *   to agree.
 * - Any doubt (source off, missing or malformed headers, too few hops, mismatch, bad config)
 *   resolves to null. Better Auth then keeps its single shared bucket for that path: the limit
 *   still applies, to everyone together (fail closed).
 * - CLIENT_IP_HEADER is internal. Incoming copies are always removed before it is set.
 *
 * No `server-only` import: the request proxy (src/proxy.ts) and unit tests use this module too.
 * It never logs or returns an address except as the resolved value.
 */
import { z } from "zod";

/** Internal header carrying the resolved address to Better Auth. Never accepted from clients. */
export const CLIENT_IP_HEADER = "x-nltag-client-ip";

export type ClientIpSource = "none" | "forwarded-chain";
export type CrossCheck = "x-real-ip" | "none";

export interface ClientIpConfig {
  source: ClientIpSource;
  /** X-Forwarded-For entries appended by our own infrastructure after the client entry. */
  proxyHops: number;
  crossCheck: CrossCheck;
  /** True when a variable was set to something we do not understand (then source is "none"). */
  invalid: boolean;
}

export const MAX_PROXY_HOPS = 4;
const OFF: ClientIpConfig = { source: "none", proxyHops: 0, crossCheck: "x-real-ip", invalid: false };

/**
 * Reads CLIENT_IP_SOURCE, CLIENT_IP_PROXY_HOPS and CLIENT_IP_CROSSCHECK. Unset → resolution off
 * (fail closed). Any invalid value → off and `invalid: true`, never a guess.
 */
export function clientIpConfig(env: NodeJS.ProcessEnv = process.env): ClientIpConfig {
  const source = (env.CLIENT_IP_SOURCE ?? "").trim() || "none";
  const hopsRaw = (env.CLIENT_IP_PROXY_HOPS ?? "").trim() || "0";
  const cross = (env.CLIENT_IP_CROSSCHECK ?? "").trim() || "x-real-ip";
  const hops = /^\d$/.test(hopsRaw) ? Number(hopsRaw) : NaN;
  if ((source !== "none" && source !== "forwarded-chain") || !(hops >= 0 && hops <= MAX_PROXY_HOPS) || (cross !== "x-real-ip" && cross !== "none")) {
    return { ...OFF, invalid: true };
  }
  return { source, proxyHops: hops, crossCheck: cross, invalid: false };
}

const ipv4 = z.ipv4();
const ipv6 = z.ipv6();
const isIPv4 = (v: string) => ipv4.safeParse(v).success;
const isIPv6 = (v: string) => ipv6.safeParse(v).success;

function expandIPv6(raw: string): string[] {
  let ip = raw;
  // Dotted IPv4 tail (::ffff:198.51.100.4) → two hex groups.
  const dotted = ip.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const [a, b, c, d] = dotted[2]!.split(".").map(Number) as [number, number, number, number];
    ip = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = ip.includes("::") ? ip.split("::") : [ip, undefined];
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const zeros = tail === undefined ? [] : Array(8 - left.length - right.length).fill("0");
  return [...left, ...zeros, ...right].map((g) => g.toLowerCase().padStart(4, "0"));
}

/**
 * Canonical form, or null if the value is not a plain IP address. IPv4-mapped IPv6 becomes IPv4;
 * IPv6 is fully expanded in lower case. Ports, brackets, zone ids, "unknown" → null.
 */
export function normalizeIp(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v || v.length > 45) return null;
  if (isIPv4(v)) return v.split(".").map(Number).join(".");
  if (!isIPv6(v)) return null;
  const groups = expandIPv6(v);
  if (groups.length !== 8) return null;
  if (groups.slice(0, 5).every((g) => g === "0000") && groups[5] === "ffff") {
    const n = (i: number) => Number.parseInt(groups[i]!, 16);
    return [n(6) >> 8, n(6) & 255, n(7) >> 8, n(7) & 255].join(".");
  }
  return groups.join(":");
}

export type ResolveReason =
  | "ok"
  | "disabled"
  | "config-invalid"
  | "no-forwarded-for"
  | "too-few-entries"
  | "invalid-entry"
  | "real-ip-missing"
  | "real-ip-mismatch";

export interface Resolution {
  ip: string | null;
  reason: ResolveReason;
}

function forwardedEntries(headers: Headers): string[] | null {
  const raw = headers.get("x-forwarded-for");
  if (raw === null) return null;
  return raw.split(",").map((s) => s.trim());
}

/** Resolves the visitor's address from the raw forwarding headers. Never reads CLIENT_IP_HEADER. */
export function resolveClientIp(headers: Headers, config: ClientIpConfig = clientIpConfig()): Resolution {
  if (config.invalid) return { ip: null, reason: "config-invalid" };
  if (config.source === "none") return { ip: null, reason: "disabled" };
  const entries = forwardedEntries(headers);
  if (!entries) return { ip: null, reason: "no-forwarded-for" };
  const index = entries.length - 1 - config.proxyHops;
  if (index < 0) return { ip: null, reason: "too-few-entries" };
  // The hops we skip are our own infrastructure's; they must at least be well-formed addresses.
  for (let i = entries.length - 1; i > index; i--) if (!normalizeIp(entries[i])) return { ip: null, reason: "invalid-entry" };
  const candidate = normalizeIp(entries[index]);
  if (!candidate) return { ip: null, reason: "invalid-entry" };
  if (config.crossCheck === "x-real-ip") {
    const real = headers.get("x-real-ip");
    if (real === null || real.trim() === "") return { ip: null, reason: "real-ip-missing" };
    if (normalizeIp(real) !== candidate) return { ip: null, reason: "real-ip-mismatch" };
  }
  return { ip: candidate, reason: "ok" };
}

/** The visitor's address for audit rows and other app code, or null when it cannot be trusted. */
export function clientIpOf(headers: Headers | undefined | null, config?: ClientIpConfig): string | null {
  return headers ? resolveClientIp(headers, config).ip : null;
}

/**
 * Copy of `headers` with CLIENT_IP_HEADER removed and, when the address resolves, set to it.
 * Better Auth reads only CLIENT_IP_HEADER (auth.ts), so a request whose address cannot be trusted
 * reaches it without one and is counted in the shared bucket.
 */
export function withTrustedClientIp(headers: Headers, config?: ClientIpConfig): Headers {
  const out = new Headers(headers);
  out.delete(CLIENT_IP_HEADER);
  const { ip } = resolveClientIp(out, config);
  if (ip) out.set(CLIENT_IP_HEADER, ip);
  return out;
}

/** The same request with trusted client-IP headers (body and method unchanged). */
export function withTrustedClientIpRequest(req: Request, config?: ClientIpConfig): Request {
  return new Request(req, { headers: withTrustedClientIp(req.headers, config), duplex: "half" } as RequestInit);
}

// ---------------------------------------------------------------------------------------------
// Header-shape capture. Describes HOW the forwarding headers look, never WHAT they contain:
// counts, address classes and positions only. No address, no other header value, no cookie.
// ---------------------------------------------------------------------------------------------

export type AddressClass =
  | "ipv4-public"
  | "ipv4-private"
  | "ipv4-cgnat"
  | "ipv4-loopback"
  | "ipv4-link-local"
  | "ipv6-public"
  | "ipv6-unique-local"
  | "ipv6-loopback"
  | "ipv6-link-local"
  | "empty"
  | "not-an-ip";

export function classifyAddress(raw: string | null | undefined): AddressClass {
  if (!raw || raw.trim() === "") return "empty";
  const ip = normalizeIp(raw);
  if (!ip) return "not-an-ip";
  if (!ip.includes(":")) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    if (a === 127) return "ipv4-loopback";
    if (a === 169 && b === 254) return "ipv4-link-local";
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "ipv4-private";
    if (a === 100 && b >= 64 && b <= 127) return "ipv4-cgnat";
    return "ipv4-public";
  }
  if (ip === "0000:0000:0000:0000:0000:0000:0000:0001") return "ipv6-loopback";
  const first = Number.parseInt(ip.slice(0, 4), 16);
  if ((first & 0xffc0) === 0xfe80) return "ipv6-link-local";
  if ((first & 0xfe00) === 0xfc00) return "ipv6-unique-local";
  return "ipv6-public";
}

/** Headers whose presence (never value) helps confirm the proxy chain. */
const SHAPE_HEADERS = [
  "forwarded",
  "x-real-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "x-client-ip",
  "x-cluster-client-ip",
  "fastly-client-ip",
  "x-original-forwarded-for",
  "via",
  "cdn-loop",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  CLIENT_IP_HEADER,
] as const;
/** Other header NAMES that look like CDN/proxy markers (names only, e.g. x-hcdn-*). */
const MARKER_NAME = /^(x-)?(hcdn|cdn|hostinger|lsws|litespeed|edge|proxy|forwarded)[a-z0-9-]*$/;

export interface HeaderShape {
  xffCount: number | null;
  /** Class of each X-Forwarded-For entry, left to right. */
  xffClasses: AddressClass[];
  realIpClass: AddressClass | null;
  /** Position of the X-Real-IP value in X-Forwarded-For counted from the right (0 = last), -1 if absent. */
  realIpFromRight: number | null;
  present: string[];
  markerNames: string[];
  /** What resolveClientIp decides under the current configuration. */
  resolution: ResolveReason;
  source: ClientIpSource;
  proxyHops: number;
}

export function describeHeaderShape(headers: Headers, config: ClientIpConfig = clientIpConfig()): HeaderShape {
  const entries = forwardedEntries(headers);
  const real = headers.get("x-real-ip");
  const realNorm = normalizeIp(real);
  let realIpFromRight: number | null = null;
  if (real !== null) {
    realIpFromRight = -1;
    if (realNorm && entries) {
      for (let i = entries.length - 1; i >= 0; i--) {
        if (normalizeIp(entries[i]) === realNorm) {
          realIpFromRight = entries.length - 1 - i;
          break;
        }
      }
    }
  }
  const present = SHAPE_HEADERS.filter((h) => headers.has(h));
  const markerNames: string[] = [];
  headers.forEach((_v, name) => {
    const n = name.toLowerCase();
    if (n.length <= 48 && MARKER_NAME.test(n) && !(SHAPE_HEADERS as readonly string[]).includes(n) && n !== "x-forwarded-for" && !markerNames.includes(n)) markerNames.push(n);
  });
  return {
    xffCount: entries ? entries.length : null,
    xffClasses: entries ? entries.slice(-8).map(classifyAddress) : [],
    realIpClass: real === null ? null : classifyAddress(real),
    realIpFromRight,
    present,
    markerNames: markerNames.sort().slice(0, 12),
    resolution: resolveClientIp(headers, config).reason,
    source: config.source,
    proxyHops: config.proxyHops,
  };
}

/** Distinct shapes logged per process, then silence (the capture is a diagnostic, not a log stream). */
export const MAX_SHAPES_LOGGED = 20;
const seen = new Set<string>();

/**
 * Logs each distinct header shape once per process (at most MAX_SHAPES_LOGGED), as one JSON line
 * `{"level":"info","event":"client_ip.shape",...}`. On by default; CLIENT_IP_SHAPE_LOG=off stops it.
 * Returns whether a line was written.
 */
export function noteHeaderShape(headers: Headers, config?: ClientIpConfig, env: NodeJS.ProcessEnv = process.env, write: (line: string) => void = console.info): boolean {
  if ((env.CLIENT_IP_SHAPE_LOG ?? "").trim() === "off") return false;
  if (seen.size >= MAX_SHAPES_LOGGED) return false;
  const shape = describeHeaderShape(headers, config);
  const key = JSON.stringify(shape);
  if (seen.has(key)) return false;
  seen.add(key);
  write(JSON.stringify({ level: "info", event: "client_ip.shape", at: new Date().toISOString(), ...shape }));
  return true;
}

export function resetHeaderShapeLogForTests() {
  seen.clear();
}
