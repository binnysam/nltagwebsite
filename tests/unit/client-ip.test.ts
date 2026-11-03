// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import {
  CLIENT_IP_HEADER,
  MAX_SHAPES_LOGGED,
  classifyAddress,
  clientIpConfig,
  clientIpOf,
  describeHeaderShape,
  normalizeIp,
  noteHeaderShape,
  resetHeaderShapeLogForTests,
  resolveClientIp,
  withTrustedClientIp,
  withTrustedClientIpRequest,
  type ClientIpConfig,
} from "@/server/security/client-ip";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const CHAIN: ClientIpConfig = { source: "forwarded-chain", proxyHops: 0, crossCheck: "x-real-ip", invalid: false };
const CHAIN_ONE_HOP: ClientIpConfig = { ...CHAIN, proxyHops: 1 };
const h = (o: Record<string, string>) => new Headers(o);

/** What Hostinger's CDN documents: the connecting address is X-Real-IP and the last XFF entry. */
const viaCdn = (client: string, spoofedLeft?: string) =>
  h({ "x-forwarded-for": spoofedLeft ? `${spoofedLeft}, ${client}` : client, "x-real-ip": client });

describe("M3: incorrect configurations fail closed", () => {
  const prodEnv = (e: Record<string, string>) => env({ NODE_ENV: "production", ...e });

  it("refuses CLIENT_IP_CROSSCHECK=none in production (resolution off, every visitor shares the bucket)", () => {
    for (const hops of ["0", "1", "2"]) {
      const c = clientIpConfig(prodEnv({ CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_PROXY_HOPS: hops, CLIENT_IP_CROSSCHECK: "none" }));
      expect(c).toMatchObject({ source: "none", invalid: true, problem: "crosscheck-none-in-production" });
      expect(resolveClientIp(viaCdn("203.0.113.9"), c)).toEqual({ ip: null, reason: "config-invalid" });
    }
    // With the source off, CROSSCHECK=none changes nothing and is not an error.
    expect(clientIpConfig(prodEnv({ CLIENT_IP_CROSSCHECK: "none" })).invalid).toBe(false);
    // The production default is accepted.
    expect(clientIpConfig(prodEnv({ CLIENT_IP_SOURCE: "forwarded-chain" })).invalid).toBe(false);
  });

  it("refuses unknown values with a reason and no value in it", () => {
    const bad: Record<string, string>[] = [{ CLIENT_IP_SOURCE: "forwarded" }, { CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_PROXY_HOPS: "one" }, { CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_CROSSCHECK: "X-Real-IP " + "x" }];
    for (const e of bad) {
      expect(clientIpConfig(prodEnv(e))).toMatchObject({ source: "none", invalid: true, problem: "unknown-value" });
    }
  });

  // Every wrong hop count × CDN behaviour × cross-check combination, as a caller would attack it.
  // Real layout: the CDN appends the connecting address (public) to X-Forwarded-For and sets X-Real-IP.
  const client = "203.0.113.9";
  const attacker = "192.0.2.66";
  const cases: { name: string; headers: Record<string, string>; config: ClientIpConfig; expected: string }[] = [
    // Hops too high (configured 1, real 0).
    { name: "hops too high, normal visit", headers: { "x-forwarded-for": client, "x-real-ip": client }, config: CHAIN_ONE_HOP, expected: "too-few-entries" },
    { name: "hops too high, caller adds an XFF entry (CDN overwrites X-Real-IP)", headers: { "x-forwarded-for": `${attacker}, ${client}`, "x-real-ip": client }, config: CHAIN_ONE_HOP, expected: "untrusted-hop" },
    { name: "hops too high, caller forges XFF + X-Real-IP (CDN keeps X-Real-IP, A4 false)", headers: { "x-forwarded-for": `${attacker}, ${client}`, "x-real-ip": attacker }, config: CHAIN_ONE_HOP, expected: "untrusted-hop" },
    { name: "hops too high, no cross-check (non-production)", headers: { "x-forwarded-for": `${attacker}, ${client}` }, config: { ...CHAIN_ONE_HOP, crossCheck: "none" }, expected: "untrusted-hop" },
    { name: "hops two too high", headers: { "x-forwarded-for": `${attacker}, 198.51.100.4, ${client}`, "x-real-ip": attacker }, config: { ...CHAIN, proxyHops: 2 }, expected: "untrusted-hop" },
    // Hops too low (configured 0, real 1: an internal hop follows the client entry).
    { name: "hops too low, normal visit", headers: { "x-forwarded-for": `${client}, 10.0.0.5`, "x-real-ip": client }, config: CHAIN, expected: "internal-candidate" },
    { name: "hops too low, no cross-check (non-production)", headers: { "x-forwarded-for": `${client}, 10.0.0.5` }, config: { ...CHAIN, crossCheck: "none" }, expected: "internal-candidate" },
    { name: "hops too low, internal X-Real-IP agrees", headers: { "x-forwarded-for": `${client}, 10.0.0.5`, "x-real-ip": "10.0.0.5" }, config: CHAIN, expected: "internal-candidate" },
    // Mismatched or malformed headers with the right hop count.
    { name: "X-Real-IP differs", headers: { "x-forwarded-for": client, "x-real-ip": attacker }, config: CHAIN, expected: "real-ip-mismatch" },
    { name: "X-Real-IP missing", headers: { "x-forwarded-for": client }, config: CHAIN, expected: "real-ip-missing" },
    { name: "X-Real-IP has two values", headers: { "x-forwarded-for": client, "x-real-ip": `${client}, ${attacker}` }, config: CHAIN, expected: "real-ip-mismatch" },
    { name: "skipped hop malformed", headers: { "x-forwarded-for": `${client}, not-an-ip`, "x-real-ip": client }, config: CHAIN_ONE_HOP, expected: "invalid-entry" },
    { name: "skipped hop empty", headers: { "x-forwarded-for": `${client}, `, "x-real-ip": client }, config: CHAIN_ONE_HOP, expected: "invalid-entry" },
    { name: "loopback as the visitor", headers: { "x-forwarded-for": "127.0.0.1", "x-real-ip": "127.0.0.1" }, config: CHAIN, expected: "internal-candidate" },
    { name: "CGNAT as the visitor", headers: { "x-forwarded-for": "100.64.1.1", "x-real-ip": "100.64.1.1" }, config: CHAIN, expected: "internal-candidate" },
    { name: "IPv6 unique-local as the visitor", headers: { "x-forwarded-for": "fd12::1", "x-real-ip": "fd12::1" }, config: CHAIN, expected: "internal-candidate" },
  ];
  for (const c of cases) {
    it(`fails closed: ${c.name}`, () => {
      expect(resolveClientIp(h(c.headers), c.config)).toEqual({ ip: null, reason: c.expected });
      expect(withTrustedClientIp(h({ ...c.headers, [CLIENT_IP_HEADER]: attacker }), c.config).has(CLIENT_IP_HEADER)).toBe(false);
    });
  }

  it("accepts the correct configurations", () => {
    expect(resolveClientIp(viaCdn(client, attacker), CHAIN)).toEqual({ ip: client, reason: "ok" });
    for (const hop of ["10.0.0.5", "172.20.1.1", "192.168.1.1", "100.100.0.1", "127.0.0.1", "fd00::5", "fe80::1"]) {
      expect(resolveClientIp(h({ "x-forwarded-for": `${attacker}, ${client}, ${hop}`, "x-real-ip": client }), CHAIN_ONE_HOP)).toEqual({ ip: client, reason: "ok" });
    }
  });
});

describe("configuration (fails closed)", () => {
  it("is off unless explicitly set", () => {
    expect(clientIpConfig(env({}))).toEqual({ source: "none", proxyHops: 0, crossCheck: "x-real-ip", invalid: false });
  });

  it("reads a valid configuration", () => {
    expect(clientIpConfig(env({ CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_PROXY_HOPS: "1", CLIENT_IP_CROSSCHECK: "none" }))).toEqual({
      source: "forwarded-chain",
      proxyHops: 1,
      crossCheck: "none",
      invalid: false,
    });
  });

  it("turns resolution off for any value it does not understand", () => {
    for (const e of <Record<string, string>[]>[
      { CLIENT_IP_SOURCE: "x-forwarded-for" },
      { CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_PROXY_HOPS: "-1" },
      { CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_PROXY_HOPS: "5" },
      { CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_PROXY_HOPS: "1.5" },
      { CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_PROXY_HOPS: "one" },
      { CLIENT_IP_SOURCE: "forwarded-chain", CLIENT_IP_CROSSCHECK: "cf-connecting-ip" },
    ]) {
      const c = clientIpConfig(env(e));
      expect(c, JSON.stringify(e)).toMatchObject({ source: "none", invalid: true });
      expect(resolveClientIp(viaCdn("203.0.113.9"), c)).toEqual({ ip: null, reason: "config-invalid" });
    }
  });

  it("resolves nothing while off, whatever the headers say", () => {
    expect(resolveClientIp(viaCdn("203.0.113.9"), clientIpConfig(env({})))).toEqual({ ip: null, reason: "disabled" });
  });
});

describe("normalizeIp", () => {
  it("accepts plain IPv4 and IPv6 only", () => {
    expect(normalizeIp(" 203.0.113.7 ")).toBe("203.0.113.7");
    expect(normalizeIp("2001:DB8::1")).toBe("2001:0db8:0000:0000:0000:0000:0000:0001");
    expect(normalizeIp("::ffff:198.51.100.4")).toBe("198.51.100.4");
    for (const bad of ["", "unknown", "203.0.113.7:443", "[2001:db8::1]", "2001:db8::1%eth0", "203.0.113", "999.1.1.1", "localhost", "1.2.3.4 5.6.7.8"]) {
      expect(normalizeIp(bad), bad).toBeNull();
    }
  });
});

describe("resolveClientIp — Hostinger CDN layout (hops 0, X-Real-IP cross-check)", () => {
  it("uses the entry the CDN appended, not the caller's", () => {
    expect(resolveClientIp(viaCdn("203.0.113.9"), CHAIN)).toEqual({ ip: "203.0.113.9", reason: "ok" });
    expect(resolveClientIp(viaCdn("203.0.113.9", "198.51.100.1"), CHAIN).ip).toBe("203.0.113.9");
  });

  it("ignores any number of spoofed left-hand entries", () => {
    for (const spoof of ["1.1.1.1", "10.0.0.1, 8.8.8.8", "not-an-ip", "::1, 127.0.0.1", ""]) {
      expect(resolveClientIp(viaCdn("203.0.113.9", spoof), CHAIN).ip, spoof).toBe("203.0.113.9");
    }
  });

  it("never uses a client-supplied internal header", () => {
    const headers = h({ [CLIENT_IP_HEADER]: "192.0.2.66" });
    expect(resolveClientIp(headers, CHAIN)).toEqual({ ip: null, reason: "no-forwarded-for" });
    const forged = viaCdn("203.0.113.9");
    forged.set(CLIENT_IP_HEADER, "192.0.2.66");
    expect(withTrustedClientIp(forged, CHAIN).get(CLIENT_IP_HEADER)).toBe("203.0.113.9");
    const unresolved = h({ [CLIENT_IP_HEADER]: "192.0.2.66" });
    expect(withTrustedClientIp(unresolved, CHAIN).has(CLIENT_IP_HEADER)).toBe(false);
  });

  it("refuses when the two headers disagree or X-Real-IP is missing (forged chain)", () => {
    expect(resolveClientIp(h({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.1" }), CHAIN)).toEqual({ ip: null, reason: "real-ip-mismatch" });
    expect(resolveClientIp(h({ "x-forwarded-for": "203.0.113.9" }), CHAIN)).toEqual({ ip: null, reason: "real-ip-missing" });
    expect(resolveClientIp(h({ "x-forwarded-for": "203.0.113.9", "x-real-ip": " " }), CHAIN)).toEqual({ ip: null, reason: "real-ip-missing" });
    expect(resolveClientIp(h({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9, 1.1.1.1" }), CHAIN).ip).toBeNull();
  });

  it("refuses missing, empty or malformed chains", () => {
    expect(resolveClientIp(h({ "x-real-ip": "203.0.113.9" }), CHAIN).reason).toBe("no-forwarded-for");
    for (const xff of ["", " ", "203.0.113.9, ", "198.51.100.1, unknown", "198.51.100.1, 203.0.113.9:443"]) {
      expect(resolveClientIp(h({ "x-forwarded-for": xff, "x-real-ip": "203.0.113.9" }), CHAIN).ip, xff).toBeNull();
    }
  });

  it("treats IPv4-mapped and differently written IPv6 as the same address", () => {
    expect(resolveClientIp(h({ "x-forwarded-for": "::ffff:203.0.113.9", "x-real-ip": "203.0.113.9" }), CHAIN).ip).toBe("203.0.113.9");
    expect(resolveClientIp(h({ "x-forwarded-for": "2001:db8:0:0::7", "x-real-ip": "2001:DB8::7" }), CHAIN).ip).toBe("2001:0db8:0000:0000:0000:0000:0000:0007");
  });
});

describe("resolveClientIp — one extra infrastructure hop", () => {
  it("skips exactly the configured number of right-hand entries", () => {
    const headers = h({ "x-forwarded-for": "1.1.1.1, 203.0.113.9, 10.0.0.5", "x-real-ip": "203.0.113.9" });
    expect(resolveClientIp(headers, CHAIN_ONE_HOP)).toEqual({ ip: "203.0.113.9", reason: "ok" });
  });

  it("refuses when there are fewer entries than hops, or a skipped hop is not an address", () => {
    expect(resolveClientIp(h({ "x-forwarded-for": "10.0.0.5", "x-real-ip": "10.0.0.5" }), CHAIN_ONE_HOP).reason).toBe("too-few-entries");
    expect(resolveClientIp(h({ "x-forwarded-for": "203.0.113.9, garbage", "x-real-ip": "203.0.113.9" }), CHAIN_ONE_HOP).reason).toBe("invalid-entry");
  });

  it("refuses a request that skipped the CDN (one hop short): the skipped hop is a public address", () => {
    // Direct to origin: the caller writes XFF; only the origin hop (the caller's own public address) is appended.
    const headers = h({ "x-forwarded-for": "192.0.2.66, 198.51.100.200", "x-real-ip": "198.51.100.200" });
    expect(resolveClientIp(headers, CHAIN_ONE_HOP).reason).toBe("untrusted-hop");
  });
});

describe("clientIpOf (audit) and request wrapper", () => {
  it("uses the same resolution as the rate limiter, never the leftmost entry", () => {
    expect(clientIpOf(viaCdn("203.0.113.9", "192.0.2.66"), CHAIN)).toBe("203.0.113.9");
    expect(clientIpOf(h({ "x-forwarded-for": "192.0.2.66" }), CHAIN)).toBeNull();
    expect(clientIpOf(undefined, CHAIN)).toBeNull();
  });

  it("keeps method and body when wrapping a request", async () => {
    const req = new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { ...Object.fromEntries(viaCdn("203.0.113.9", "192.0.2.66")), [CLIENT_IP_HEADER]: "192.0.2.66", "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    const out = withTrustedClientIpRequest(req, CHAIN);
    expect(out.method).toBe("POST");
    expect(out.headers.get(CLIENT_IP_HEADER)).toBe("203.0.113.9");
    expect(await out.json()).toEqual({ a: 1 });
  });
});

describe("header-shape capture (no addresses)", () => {
  beforeEach(() => resetHeaderShapeLogForTests());

  it("classifies addresses without keeping them", () => {
    expect(classifyAddress("203.0.113.9")).toBe("ipv4-public");
    expect(classifyAddress("10.1.2.3")).toBe("ipv4-private");
    expect(classifyAddress("172.20.0.1")).toBe("ipv4-private");
    expect(classifyAddress("192.168.1.1")).toBe("ipv4-private");
    expect(classifyAddress("100.72.1.1")).toBe("ipv4-cgnat");
    expect(classifyAddress("127.0.0.1")).toBe("ipv4-loopback");
    expect(classifyAddress("169.254.1.1")).toBe("ipv4-link-local");
    expect(classifyAddress("2a00:1450::1")).toBe("ipv6-public");
    expect(classifyAddress("fd00::1")).toBe("ipv6-unique-local");
    expect(classifyAddress("fe80::1")).toBe("ipv6-link-local");
    expect(classifyAddress("::1")).toBe("ipv6-loopback");
    expect(classifyAddress("")).toBe("empty");
    expect(classifyAddress("unknown")).toBe("not-an-ip");
  });

  it("describes the chain: count, classes, X-Real-IP position, header presence, markers", () => {
    const headers = h({
      "x-forwarded-for": "198.51.100.1, 203.0.113.9, 10.0.0.5",
      "x-real-ip": "203.0.113.9",
      "x-forwarded-proto": "https",
      "x-hcdn-request-id": "abc",
      cookie: "nltag.session_token=secret",
    });
    const shape = describeHeaderShape(headers, CHAIN);
    expect(shape).toEqual({
      xffCount: 3,
      xffClasses: ["ipv4-public", "ipv4-public", "ipv4-private"],
      realIpClass: "ipv4-public",
      realIpFromRight: 1,
      present: ["x-real-ip", "x-forwarded-proto"],
      markerNames: ["x-hcdn-request-id"],
      resolution: "internal-candidate",
      source: "forwarded-chain",
      proxyHops: 0,
    });
    expect(describeHeaderShape(headers, CHAIN_ONE_HOP).resolution).toBe("ok");
  });

  it("never writes an address, cookie or header value", () => {
    const lines: string[] = [];
    noteHeaderShape(
      h({ "x-forwarded-for": "198.51.100.77, 2001:db8::abcd", "x-real-ip": "2001:db8::abcd", cookie: "nltag.session_token=topsecretvalue", "x-hcdn-id": "edge-node-17" }),
      CHAIN,
      env({}),
      (l) => lines.push(l),
    );
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    for (const secret of ["198.51.100.77", "2001:db8", "abcd", "topsecretvalue", "session_token", "edge-node-17"]) expect(line, secret).not.toContain(secret);
    expect(JSON.parse(line)).toMatchObject({ event: "client_ip.shape", xffCount: 2, realIpFromRight: 0, resolution: "ok" });
  });

  it("logs each distinct shape once, again at 10/100/… occurrences, and can be switched off", () => {
    const lines: string[] = [];
    const w = (l: string) => lines.push(l);
    expect(noteHeaderShape(viaCdn("203.0.113.9"), CHAIN, env({}), w)).toBe(true);
    expect(noteHeaderShape(viaCdn("198.51.100.3"), CHAIN, env({}), w)).toBe(false); // same shape, different visitor
    for (let i = 0; i < 8; i++) noteHeaderShape(viaCdn(`203.0.113.${i + 20}`), CHAIN, env({}), w);
    expect(lines.length).toBe(2); // 1st and 10th sighting
    expect(JSON.parse(lines[1]!).seen).toBe(10);
    resetHeaderShapeLogForTests();
    expect(noteHeaderShape(viaCdn("203.0.113.9"), CHAIN, env({ CLIENT_IP_SHAPE_LOG: "off" }), w)).toBe(false);
  });

  it("L2: entries and headers a visitor adds cannot create new shapes or fill the slots", () => {
    const lines: string[] = [];
    const w = (l: string) => lines.push(l);
    noteHeaderShape(viaCdn("203.0.113.9"), CHAIN, env({}), w);
    // Prepended entries of every length and class, extra marker-like headers, forwarded headers.
    for (let i = 0; i < 60; i++) {
      const left = Array.from({ length: (i % 7) + 1 }, (_, j) => (j % 2 ? "10.1.2.3" : `192.0.2.${j}`)).join(", ");
      noteHeaderShape(
        h({ "x-forwarded-for": `${left}, 203.0.113.${i}`, "x-real-ip": `203.0.113.${i}`, [`x-cdn-junk-${i}`]: "1", forwarded: "for=1.2.3.4", "cf-connecting-ip": "1.2.3.4" }),
        CHAIN,
        env({}),
        w,
      );
    }
    // Only two keys: "nothing to the left" and "something to the left"; logged at 1st and 10th sighting.
    expect(lines.map((l) => JSON.parse(l).seen)).toEqual([1, 1, 10]);
    // A genuinely different CDN-side shape is still recorded after all that noise.
    expect(noteHeaderShape(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.5", "x-real-ip": "203.0.113.9" }), CHAIN, env({}), w)).toBe(true);
  });

  it("stops recording new shapes after a fixed number per process", () => {
    const lines: string[] = [];
    const w = (l: string) => lines.push(l);
    // Different CDN-side tails (hop classes) are distinct keys; beyond the cap nothing new is logged.
    const classes = ["10.0.0.1", "127.0.0.1", "100.64.0.1", "169.254.0.1", "fd00::1", "fe80::1", "::1", "172.16.0.1", "192.168.0.1", "203.0.113.1", "2001:db8::1", "garbage", ""];
    for (const a of classes) for (const b of classes) noteHeaderShape(h({ "x-forwarded-for": `${a}, ${b}` }), { ...CHAIN, proxyHops: 1 }, env({}), w);
    expect(lines.length).toBe(MAX_SHAPES_LOGGED);
  });
});
