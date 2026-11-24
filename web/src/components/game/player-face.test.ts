import { describe, expect, it } from "vitest";

import { faceTraits } from "./player-face";

describe("faceTraits", () => {
  it("is deterministic: the same player always gets the same face", () => {
    expect(faceTraits("Thijs Hoogendam")).toEqual(faceTraits("Thijs Hoogendam"));
  });

  it("gives different players different faces and uses the whole palette", () => {
    const faces = Array.from({ length: 400 }, (_, i) => faceTraits(`Player ${i}`));
    const signature = (f: ReturnType<typeof faceTraits>) => JSON.stringify([f.tone, f.hair, f.style, f.facial, f.kit]);
    expect(new Set(faces.map(signature)).size).toBeGreaterThan(300);
    expect(new Set(faces.map((f) => f.tone.skin)).size).toBe(8);
    expect(new Set(faces.map((f) => f.style)).size).toBe(10);
    expect(new Set(faces.map((f) => f.facial)).size).toBe(5);
  });
});
