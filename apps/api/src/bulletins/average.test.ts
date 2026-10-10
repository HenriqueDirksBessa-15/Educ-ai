import { describe, expect, it } from "vitest";

import { calculateBulletinAverage } from "./average.js";

describe("bulletin average", () => {
  it("gives every normalized activity grade the same weight", () => {
    expect(calculateBulletinAverage([10, 7.5, 5])).toBe(7.5);
  });

  it("rounds to two decimal places", () => {
    expect(calculateBulletinAverage([10, 9, 9])).toBe(9.33);
  });

  it("blocks a bulletin without grades", () => {
    expect(() => calculateBulletinAverage([])).toThrow(
      "BULLETIN_WITHOUT_GRADES",
    );
  });
});
