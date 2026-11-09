// @vitest-environment node
// Regression tests for the staging canonical check (tests/e2e/staging.spec.ts). The earlier
// assertion rejected any URL containing "nltagkuwait.com", which also rejected the legitimate
// staging origin https://staging.nltagkuwait.com.
import { describe, expect, it } from "vitest";
import { canonicalProblem } from "../support/canonical";

const STAGING = "https://staging.nltagkuwait.com";

describe("canonicalProblem", () => {
  it("rejects the production origin (with and without www, any path)", () => {
    expect(canonicalProblem("https://nltagkuwait.com/ta", STAGING, "/ta")).toMatch(/production/);
    expect(canonicalProblem("https://www.nltagkuwait.com/en", STAGING, "/en")).toMatch(/production/);
    // Even when production is the site under test, a staging check never accepts it.
    expect(canonicalProblem("https://nltagkuwait.com/ta", "https://nltagkuwait.com", "/ta")).toMatch(/production/);
  });

  it("accepts the staging origin, which contains nltagkuwait.com", () => {
    expect(canonicalProblem("https://staging.nltagkuwait.com/ta", STAGING, "/ta")).toBeNull();
    expect(canonicalProblem("https://staging.nltagkuwait.com/en/sermons", STAGING, "/en")).toBeNull();
    expect(canonicalProblem("http://127.0.0.1:3200/en", "http://127.0.0.1:3200", "/en")).toBeNull();
  });

  it("rejects unexpected origins and look-alikes", () => {
    expect(canonicalProblem("https://example.com/ta", STAGING, "/ta")).toMatch(/not the site under test/);
    expect(canonicalProblem("https://staging.nltagkuwait.com.evil.example/ta", STAGING, "/ta")).toMatch(/not the site under test/);
    expect(canonicalProblem("http://staging.nltagkuwait.com/ta", STAGING, "/ta")).toMatch(/not the site under test/);
    expect(canonicalProblem("https://staging.nltagkuwait.com:8443/ta", STAGING, "/ta")).toMatch(/not the site under test/);
  });

  it("rejects a missing, relative or wrong-locale canonical", () => {
    expect(canonicalProblem(null, STAGING, "/ta")).toMatch(/no canonical/);
    expect(canonicalProblem("/ta", STAGING, "/ta")).toMatch(/absolute/);
    expect(canonicalProblem("https://staging.nltagkuwait.com/en", STAGING, "/ta")).toMatch(/path/);
    expect(canonicalProblem("https://staging.nltagkuwait.com/tamil", STAGING, "/ta")).toMatch(/path/);
  });
});
