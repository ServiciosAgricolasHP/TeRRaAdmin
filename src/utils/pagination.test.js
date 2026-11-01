import { describe, it, expect } from "vitest";
import { pageWindow } from "./pagination";

describe("pageWindow", () => {
  it("hasta 7 páginas, todas", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(7, 4)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("con más, la primera, la última y las vecinas, con … donde se salta", () => {
    expect(pageWindow(20, 1)).toEqual([1, 2, "…", 20]);
    expect(pageWindow(20, 10)).toEqual([1, "…", 9, 10, 11, "…", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "…", 19, 20]);
  });
});
