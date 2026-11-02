# Client IP behind Hostinger's CDN

Security fix, November 2026. Code: `src/server/security/client-ip.ts` (resolver and header-shape capture), `src/proxy.ts`, `src/app/api/auth/[...all]/route.ts`, `src/server/auth/auth.ts`. Tests: `tests/unit/client-ip.test.ts`, `tests/integration/client-ip-rate-limit.test.ts`.

## 1. What was wrong (production, 2 Nov 2026)

Better Auth 1.7.15 reads `X-Forwarded-For` and, without `trustedProxies`, accepts it only when it holds exactly one address. Behind Hostinger's CDN the header held more than one, so no address was resolved and every visitor was counted in one shared bucket per path (`no-trusted-ip|/sign-in/email`).

Evidence (read-only, owner-approved): the runtime log's one-time Better Auth warning *"Rate limiting could not determine a client IP and is falling back to a single shared per-path bucket"*; the `rate_limit` table held a single row, `no-trusted-ip|/sign-in/email`, count 5, and no per-IP rows. A test from one Mac and a later sign-in from a phone on mobile data hit the same counter.

Effect: any five wrong passwords anywhere blocked sign-in for everyone for 15 minutes (likewise reset, sign-up, two-factor codes). It failed closed — nobody could use it to break in — but anyone could keep the Church Admin locked out. Audit rows separately used the **leftmost** `X-Forwarded-For` entry, which the caller controls.

## 2. How the address is resolved now

One resolver, `resolveClientIp(headers)`, used by:
- **Better Auth's limiter**: `src/proxy.ts` and, again, the `/api/auth` route replace the internal header `x-nltag-client-ip` with the resolved address (or remove it). Better Auth reads only that header (`advanced.ipAddress.ipAddressHeaders`). A value sent by a client is always removed first.
- **Audit rows** (`clientIp()` in `session.ts`, `clientIpOf()` in `auth.ts`).

Rules, all of which must pass or the result is "no trusted address":

1. Resolution is on only when `CLIENT_IP_SOURCE=forwarded-chain`. Unset → off.
2. `X-Forwarded-For` is read **from the right**. The last `CLIENT_IP_PROXY_HOPS` entries are our own infrastructure's and are skipped (each must still be a valid address); the next one is the visitor. Everything further left was written by the caller and is ignored. The leftmost entry is never used.
3. With `CLIENT_IP_CROSSCHECK=x-real-ip` (default) the chosen entry must equal `X-Real-IP`, which Hostinger's CDN sets to the address that connected to it. Two independently written headers must agree.
4. Only plain IPv4/IPv6 addresses are accepted (no ports, brackets, zone ids, `unknown`). IPv4-mapped IPv6 counts as IPv4. Better Auth groups IPv6 visitors by /64.
5. Any variable it does not understand turns resolution off (and logs `client_ip.config_invalid` once).

**Fail closed.** With no trusted address, the request reaches Better Auth without `x-nltag-client-ip`, so it is counted in the shared per-path bucket — exactly today's behaviour. The limit never switches off. Audit rows then carry no IP rather than a forged one.

## 3. Per-account sign-in limit

Independent of IP: wrong-password sign-ins (`401`) are counted per address in `rate_limit_bucket` under `signin-fail:<HMAC of the address>` (`LIMITS.signInFailuresPerAccount`, 10 per 15 minutes, fixed window). When the count is reached, `/sign-in/email` is refused **before** the password is checked, with `429` / `TOO_MANY_ATTEMPTS`, and an `auth.sign_in.account_limited` audit row (no address). Addresses without an account are treated identically. Correct passwords and malformed requests do not count. The HMAC uses `BETTER_AUTH_SECRET`, like the email-per-address limit.

So rotating or forged IPs cannot brute-force one account, even if the IP rule were ever wrong. Two-factor still protects Church Admins on top.

## 4. Trust assumptions — what must be true

| # | Assumption | Source / how confirmed | If it is false |
|---|---|---|---|
| A1 | Hostinger's CDN appends the connecting address as the last `X-Forwarded-For` entry and sets `X-Real-IP` to it | Hostinger support article *"Hostinger CDN: Visitor IP addresses in logs and analytics"*; capture §5 | Capture shows no `x-real-ip` or an unexpected position → do not enable; review |
| A2 | Between the CDN and Node, our infrastructure appends exactly `CLIENT_IP_PROXY_HOPS` entries | **Unconfirmed — the header-shape capture (§5) confirms it** | Wrong count → cross-check mismatch → shared bucket (fail closed), visible as `resolution: "real-ip-mismatch"` in the capture |
| A3 | Requests reach the app only through the CDN | Not verifiable from code. A request sent straight to the origin skips the CDN's hop: with hops = 0 the cross-check would then compare two caller-written values | A caller who reaches the origin directly can choose their own per-IP bucket (evading the per-IP limit, or targeting someone else's address). The per-account limit (§3) and two-factor still stop brute force |
| A4 | A visitor's own `X-Real-IP` does not survive the CDN (the article describes it as the connecting address; not stated explicitly) | Capture §5 step 1b | As A3 |

We do **not** use guessed CDN address ranges: Hostinger does not publish them, and third-party lists are not authoritative. `TRUSTED_PROXIES` is no longer read.

## 5. Header-shape capture and enabling resolution

The proxy logs each distinct layout of the forwarding headers once per process (at most 20), as one runtime-log line `{"event":"client_ip.shape", …}`. It records **no address and no header value**: the number of `X-Forwarded-For` entries, the class of each (e.g. `ipv4-public`, `ipv4-cgnat`, `ipv4-private`), whether `X-Real-IP` is present and where it sits in the chain counted from the right (`realIpFromRight`), which forwarding-related headers are present, CDN-looking header **names**, and what the resolver decides under the current settings. `CLIENT_IP_SHAPE_LOG=off` stops it.

Procedure (each step needs the owner's approval):
1. Deploy with `CLIENT_IP_SOURCE` **unset** (behaviour unchanged: shared bucket). Open the site normally from two networks (home Wi-Fi, mobile data). No sign-in attempts are needed — page views are enough.
   1b. From one device, open one page with a made-up `X-Real-IP` header (a page view, not a sign-in), e.g. `curl -s -o /dev/null -H "X-Real-IP: 192.0.2.1" https://nltagkuwait.com/ta`. If the CDN replaces it, that line still shows the same `realIpFromRight` as normal visits; if `realIpFromRight` becomes `-1`, the visitor's value survives — do not enable.
2. Read the `client_ip.shape` lines (Hostinger → Node.js → runtime logs).
3. Decide:

| What the capture shows for normal visits | Setting |
|---|---|
| `realIpFromRight: 0`, last entry public/CGNAT | `CLIENT_IP_SOURCE=forwarded-chain`, `CLIENT_IP_PROXY_HOPS=0` |
| `realIpFromRight: 1`, last entry private/loopback (an internal hop after the CDN) | `CLIENT_IP_SOURCE=forwarded-chain`, `CLIENT_IP_PROXY_HOPS=1` |
| No `x-real-ip`, `realIpFromRight: -1`, or the layout differs between visits | Leave unset; report — the cross-check cannot be satisfied safely |

4. Set the variables, redeploy, and confirm the capture now shows `"resolution":"ok"` for normal visits. Then the activation check: 6 wrong passwords from one device → 6th blocked; another network still gets "Email or password is incorrect".

## 6. Configuration

| Variable | Values | Default |
|---|---|---|
| `CLIENT_IP_SOURCE` | `none`, `forwarded-chain` | `none` (shared bucket) |
| `CLIENT_IP_PROXY_HOPS` | `0`–`4` | `0` |
| `CLIENT_IP_CROSSCHECK` | `x-real-ip`, `none` | `x-real-ip` (keep it) |
| `CLIENT_IP_SHAPE_LOG` | `on`, `off` | on (capped, no addresses) |

These are read at request time by `client-ip.ts` (also inside `src/proxy.ts`), so they are not part of `serverEnv()`.

## 7. Remaining risks

- **Origin bypass (A3).** If the origin accepts requests that skip the CDN, a caller can pick their per-IP bucket. Mitigated by the per-account limit and two-factor; not by this code.
- **Shared addresses.** Visitors behind one carrier NAT or office network share a per-IP bucket (5 wrong passwords per 15 minutes between them). Per-account limits are unaffected.
- **Account lock-out.** Someone who knows a staff address can block that account's sign-in for 15 minutes with 10 wrong passwords. Inherent to per-account limits; audited as `auth.sign_in.account_limited`.
- **Until resolution is enabled** (§5 step 4), the shared-bucket behaviour of 2 Nov 2026 remains.
