import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs script without type declarations
import { BANNER, SYNCED } from "../../../scripts/sync-functions-shared.mjs";

describe("modules copied from packages/shared", () => {
  for (const [from, to] of SYNCED as Array<[string, string]>) {
    it(`${to} is up to date (run pnpm sync:functions)`, () => {
      const root = new URL("../../../", import.meta.url);
      expect(readFileSync(new URL(to, root), "utf8")).toBe(BANNER + readFileSync(new URL(from, root), "utf8"));
    });
  }
});
