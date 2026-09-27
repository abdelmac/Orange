import { describe, expect, it } from "vitest";
import { sidebarGesture } from "../src/components/use-sidebar-gesture";
describe("navigation tactile", () => {
  const start = { x: 12, y: 240, time: 100 };
  it("ouvre depuis le bord puis ferme par un geste inverse", () => {
    expect(sidebarGesture(start, { x: 150, y: 252, time: 350 }, false)).toBe(true);
    expect(sidebarGesture({ x: 200, y: 240, time: 100 }, { x: 70, y: 235, time: 350 }, true)).toBe(
      false,
    );
  });
  it("ignore les défilements verticaux, gestes courts, lents et hors du bord", () => {
    expect(sidebarGesture(start, { x: 150, y: 380, time: 350 }, false)).toBeNull();
    expect(sidebarGesture(start, { x: 45, y: 244, time: 350 }, false)).toBeNull();
    expect(sidebarGesture(start, { x: 150, y: 242, time: 1400 }, false)).toBeNull();
    expect(sidebarGesture({ ...start, x: 80 }, { x: 220, y: 242, time: 350 }, false)).toBeNull();
  });
});
