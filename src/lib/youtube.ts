/**
 * YouTube video ids from the link shapes the church may paste into the CMS (roadmap B4):
 * watch?v=, youtu.be/, /live/, /shorts/, /embed/ on youtube.com, m.youtube.com, youtube-nocookie.com.
 * Anything else returns null and the page keeps the plain link. Pure; unit-tested.
 */
const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

export function youTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (HOSTS.has(host)) {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const [, kind, value] = u.pathname.split("/");
      if (kind && ["live", "shorts", "embed"].includes(kind)) id = value ?? null;
    }
  }
  return id && ID.test(id) ? id : null;
}

/** Privacy-enhanced embed address (no cookies until the visitor plays; loaded only on click). */
export const youTubeEmbedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
