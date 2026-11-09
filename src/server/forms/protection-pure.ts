// Pure constants and helpers shared by validation.ts (no server-only imports, so unit tests and the
// client bundle never pull in secrets).
export const MAX_LINKS = 2;
export const countLinks = (text: string) => (text.match(/(https?:\/\/|www\.)/gi) ?? []).length;
