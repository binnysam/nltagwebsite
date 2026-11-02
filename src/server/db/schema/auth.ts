import { bigint, boolean, index, int, mysqlTable, text, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { asciiBin, idColumn, timestamp3 } from "../columns";

/**
 * Better Auth core tables. Property names (camelCase) are what Better Auth's Drizzle adapter
 * expects; column names are snake_case. Do not rename properties without checking
 * `node_modules/@better-auth/core/dist/db/get-tables.mjs`.
 */

export const user = mysqlTable(
  "user",
  {
    id: idColumn("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    // Case-insensitive collation makes the unique index treat A@x.com and a@x.com as one address.
    email: varchar("email", { length: 254 }).notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: varchar("image", { length: 2048 }),
    createdAt: timestamp3("created_at").notNull(),
    updatedAt: timestamp3("updated_at").notNull(),
  },
  (t) => [uniqueIndex("user_email_uq").on(t.email)],
);

export const session = mysqlTable(
  "session",
  {
    id: idColumn("id").primaryKey(),
    expiresAt: timestamp3("expires_at").notNull(),
    token: asciiBin("token", { length: 255 }).notNull(),
    createdAt: timestamp3("created_at").notNull(),
    updatedAt: timestamp3("updated_at").notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    userId: idColumn("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("session_token_uq").on(t.token), index("session_user_idx").on(t.userId), index("session_expires_idx").on(t.expiresAt)],
);

export const account = mysqlTable(
  "account",
  {
    id: idColumn("id").primaryKey(),
    accountId: asciiBin("account_id", { length: 255 }).notNull(),
    providerId: asciiBin("provider_id", { length: 64 }).notNull(),
    userId: idColumn("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // OAuth tokens are encrypted by Better Auth (account.encryptOAuthTokens) before storage.
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp3("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp3("refresh_token_expires_at"),
    scope: varchar("scope", { length: 1024 }),
    // Password hash (scrypt) for the "credential" provider only.
    password: asciiBin("password", { length: 255 }),
    createdAt: timestamp3("created_at").notNull(),
    updatedAt: timestamp3("updated_at").notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId), uniqueIndex("account_provider_uq").on(t.providerId, t.accountId)],
);

export const verification = mysqlTable(
  "verification",
  {
    id: idColumn("id").primaryKey(),
    // Stored hashed (verification.storeIdentifier = "hashed").
    identifier: asciiBin("identifier", { length: 255 }).notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp3("expires_at").notNull(),
    createdAt: timestamp3("created_at").notNull(),
    updatedAt: timestamp3("updated_at").notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier), index("verification_expires_idx").on(t.expiresAt)],
);

/** Better Auth's own rate-limit counters (rateLimit.storage = "database"). */
export const rateLimit = mysqlTable("rate_limit", {
  id: idColumn("id").primaryKey(),
  key: asciiBin("key", { length: 255 }).notNull().unique("rate_limit_key_uq"),
  count: int("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
