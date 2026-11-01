import { customType, datetime } from "drizzle-orm/mysql-core";

/**
 * Column helpers for MariaDB 11.8.
 *
 * Tables default to utf8mb4 + utf8mb4_uca1400_ai_ci (set on the database by migration 0000) so
 * Tamil text sorts and compares correctly. That collation is case- and accent-insensitive, which
 * is right for names and emails but wrong for secrets: identifiers, tokens and hashes use
 * `ascii_bin`, so "abc" never matches "ABC".
 */
export const asciiBin = customType<{ data: string; config: { length: number } }>({
  dataType(config) {
    return `varchar(${config?.length ?? 64}) CHARACTER SET ascii COLLATE ascii_bin`;
  },
});

/** Identifier column for Better Auth ids (32-char random strings) and our own ids. */
export const idColumn = (name: string) => asciiBin(name, { length: 64 });

/** Millisecond-precision UTC timestamp. The pool sets the session time zone to UTC. */
export const timestamp3 = (name: string) => datetime(name, { mode: "date", fsp: 3 });
