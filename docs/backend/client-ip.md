# Client IP behind Hostinger's CDN

Security fix, November 2026. Code: `src/server/security/client-ip.ts` (resolver and header-shape capture), `src/proxy.ts`, `src/app/api/auth/[...all]/route.ts`, `src/server/auth/auth.ts`. Tests: `tests/unit/client-ip.test.ts`, `tests/integration/client-ip-rate-limit.test.ts`, `tests/integration/sign-in-protection.test.ts`, `tests/integration-production/fail-closed.test.ts` (NODE_ENV=production).

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
2. `X-Forwarded-For` is read **from the right**. The last `CLIENT_IP_PROXY_HOPS` entries are our own infrastructure's and are skipped; each must be a valid **internal** address (private, loopback, CGNAT, link-local, IPv6 unique-local) — a public one means the hop count is too high for this request (`untrusted-hop`). The next entry is the visitor and must be **public** — an internal one means the hop count is too low (`internal-candidate`). Everything further left was written by the caller and is ignored. The leftmost entry is never used.
3. With `CLIENT_IP_CROSSCHECK=x-real-ip` (default) the chosen entry must equal `X-Real-IP`, which Hostinger's CDN sets to the address that connected to it. Two independently written headers must agree.
4. Only plain IPv4/IPv6 addresses are accepted (no ports, brackets, zone ids, `unknown`). IPv4-mapped IPv6 counts as IPv4. Better Auth groups IPv6 visitors by /64.
5. Any variable it does not understand turns resolution off (and logs `client_ip.config_invalid` once). `CLIENT_IP_CROSSCHECK=none` is **refused in production** (resolution off, `problem: "crosscheck-none-in-production"`); it exists only for local experiments.

**Fail closed.** With no trusted address, the request reaches Better Auth without `x-nltag-client-ip`, so it is counted in the shared per-path bucket — exactly today's behaviour. The limit never switches off. Audit rows then carry no IP rather than a forged one.

## 3. Per-account sign-in protection

Independent of IP: every password check is **reserved** per address (keyed HMAC) before it runs, atomically, on a progressive-delay schedule (5 at once, then 30 s doubling to one per 15 minutes; resets after an hour without a wrong password). A recognised browser has its own budget. Full rules, alerting and limits: `docs/backend/data-and-auth.md` → "Sign-in protection".

So rotating or forged IPs — or concurrent bursts — cannot brute-force one account, even if the IP rule were ever wrong, and knowing a staff address is not enough to lock its owner out. Two-factor still protects Church Admins on top.

## 4. Trust assumptions — what must be true

| # | Assumption | Source / how confirmed | If it is false |
|---|---|---|---|
| A1 | Hostinger's CDN appends the connecting address as the last `X-Forwarded-For` entry and sets `X-Real-IP` to it | Hostinger support article *"Hostinger CDN: Visitor IP addresses in logs and analytics"*; capture §5 | Capture shows no `x-real-ip` or an unexpected position → do not enable; review |
| A2 | Between the CDN and Node, our infrastructure appends exactly `CLIENT_IP_PROXY_HOPS` entries, all internal addresses | **Unconfirmed — the header-shape capture (§5) confirms it** | Too high → the skipped entry is public → `untrusted-hop`; too low → the candidate is internal → `internal-candidate` or `real-ip-mismatch`. All fail closed (shared bucket) and show in the capture |
| A3 | Requests reach the app only through the CDN | Not verifiable from code. A request sent straight to the origin skips the CDN's hop: with hops = 0 the cross-check would then compare two caller-written values | A caller who reaches the origin directly can choose their own per-IP bucket (evading the per-IP limit, or targeting someone else's address). The per-account limit (§3) and two-factor still stop brute force |
| A4 | A visitor's own `X-Real-IP` does not survive the CDN (the article describes it as the connecting address; not stated explicitly) | Capture §5 steps 1b and 1c | With the right hop count: as A3. With a hop count one too high, the internal-hop rule now turns it into `untrusted-hop` (fail closed) |

We do **not** use guessed CDN address ranges: Hostinger does not publish them, and third-party lists are not authoritative. `TRUSTED_PROXIES` is no longer read.

## 5. Header-shape capture and enabling resolution

The proxy logs each distinct layout of the forwarding headers when first seen and again after 10, 100, 1000… occurrences (`"seen": n`), at most 20 layouts per process, as one runtime-log line `{"event":"client_ip.shape", …}`. Layouts are told apart only by what the CDN and our own hops write — the classes of the last `CLIENT_IP_PROXY_HOPS + 1` entries, whether anything stands to their left, `X-Real-IP`'s class and position, and the decision — so entries or headers a visitor adds cannot use up the 20 slots or hide the real layout (they are still shown in the line). It records **no address and no header value**: the number of `X-Forwarded-For` entries, the class of each (e.g. `ipv4-public`, `ipv4-cgnat`, `ipv4-private`), whether `X-Real-IP` is present and where it sits in the chain counted from the right (`realIpFromRight`), which forwarding-related headers are present, CDN-looking header **names**, and what the resolver decides under the current settings. `CLIENT_IP_SHAPE_LOG=off` stops it.

Procedure (each step needs the owner's approval):
1. Deploy with `CLIENT_IP_SOURCE` **unset** (behaviour unchanged: shared bucket). Open the site normally from two networks (home Wi-Fi, mobile data). No sign-in attempts are needed — page views are enough.
   1b. From one device, open one page with a made-up `X-Real-IP` header (a page view, not a sign-in), e.g. `curl -s -o /dev/null -H "X-Real-IP: 192.0.2.1" https://nltagkuwait.com/ta`. If the CDN replaces it, that line still shows the same `realIpFromRight` as normal visits; if `realIpFromRight` becomes `-1`, the visitor's value survives — do not enable.
   1c. From the same device, open one page with a **forged pair** — a made-up `X-Forwarded-For` **and** the same made-up `X-Real-IP` (again a page view only): `curl -s -o /dev/null -H "X-Forwarded-For: 192.0.2.1" -H "X-Real-IP: 192.0.2.1" https://nltagkuwait.com/ta`. Expected: the line shows `xffCount` one higher than normal visits, `realIpFromRight: 0` and a **public** last entry (`ipv4-public`/`ipv6-public`), exactly like a normal visit. If it shows `realIpFromRight: 1` (the made-up value matched one entry from the right), the CDN keeps a visitor's `X-Real-IP` and a hop count of 1 would have trusted the forged entry — **do not enable**; report. This catches the case 1b alone misses (A4 false combined with a hop count one too high).
   Restart the Node.js app before each capture round: the capture is per process and capped.
2. Read the `client_ip.shape` lines (Hostinger → Node.js → runtime logs).
3. Decide:

| What the capture shows for normal visits | Setting |
|---|---|
| `realIpFromRight: 0`, last entry public/CGNAT | `CLIENT_IP_SOURCE=forwarded-chain`, `CLIENT_IP_PROXY_HOPS=0` |
| `realIpFromRight: 1`, last entry private/loopback (an internal hop after the CDN) | `CLIENT_IP_SOURCE=forwarded-chain`, `CLIENT_IP_PROXY_HOPS=1` |
| No `x-real-ip`, `realIpFromRight: -1`, or the layout differs between visits | Leave unset; report — the cross-check cannot be satisfied safely |

4. Set the variables, redeploy, and confirm the capture now shows `"resolution":"ok"` for normal visits. Then the activation check, always with **made-up** addresses: 6 wrong passwords from one device (a different made-up address each time, so the per-account delay is not what is measured) → 6th blocked; another network with yet another made-up address still gets "Email or password is incorrect".

## 6. Configuration

| Variable | Values | Default |
|---|---|---|
| `CLIENT_IP_SOURCE` | `none`, `forwarded-chain` | `none` (shared bucket) |
| `CLIENT_IP_PROXY_HOPS` | `0`–`4` | `0` |
| `CLIENT_IP_CROSSCHECK` | `x-real-ip`, `none` (refused in production) | `x-real-ip` (keep it) |
| `CLIENT_IP_SHAPE_LOG` | `on`, `off` | on (capped, no addresses) |

These are read at request time by `client-ip.ts` (also inside `src/proxy.ts`), so they are not part of `serverEnv()`.

## 7. Remaining risks

- **Origin bypass (A3).** If the origin accepts requests that skip the CDN, a caller can pick their per-IP bucket. With hops = 1 the internal-hop rule now refuses such requests (fail closed); with hops = 0 it cannot be detected. Mitigated by the per-account protection and two-factor; not otherwise by this code.
- **Shared addresses.** Visitors behind one carrier NAT or office network share a per-IP bucket (5 wrong passwords per 15 minutes between them). Per-account limits are unaffected.
- **Account delay.** Someone who knows a staff address can slow sign-in to it from browsers that have never completed a sign-in there (one attempt per 15 minutes at worst). Browsers the owner has used keep their own budget. Audited as `auth.sign_in.throttled`, with an alert email to the account holder.
- **Until resolution is enabled** (§5 step 4), the shared-bucket behaviour of 2 Nov 2026 remains.
