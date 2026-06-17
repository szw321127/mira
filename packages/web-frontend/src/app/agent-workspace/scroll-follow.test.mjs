import assert from "node:assert/strict";
import test from "node:test";

import { isScrolledNearBottom } from "./scroll-follow.mjs";

test("isScrolledNearBottom returns true inside the threshold", () => {
  assert.equal(
    isScrolledNearBottom({
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 552,
    }),
    true,
  );
});

test("isScrolledNearBottom returns false outside the threshold", () => {
  assert.equal(
    isScrolledNearBottom({
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 500,
    }),
    false,
  );
});
