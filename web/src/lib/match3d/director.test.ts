import { describe, expect, it } from "vitest";

import { basePosition, Director, highlightFor, PITCH, type Slot } from "./director";

const SLOTS: Slot[] = [[50, 6], [15, 28], [37, 24], [63, 24], [85, 28], [30, 50], [50, 46], [70, 50], [18, 76], [50, 84], [82, 76]].map(([x, y]) => ({ x, y }));
const names = (p: string) => SLOTS.map((_, i) => `${p} ${i}`);
const make = () => new Director(SLOTS, SLOTS, names("Home"), names("Away"));

/** Runs the director until it is idle again (or a safety limit). */
function runUntilIdle(d: Director, side: "home" | "away" = "home") {
  const cues: string[] = [];
  let busySeen = false;
  for (let i = 0; i < 60 * 30; i++) {
    d.step(1 / 60, side);
    cues.push(...d.takeCues());
    if (d.busy) busySeen = true;
    else if (busySeen) return { cues, frames: i };
  }
  throw new Error("scene never finished");
}

describe("3D match director", () => {
  it("places both teams in their own half, keepers in goal", () => {
    for (const s of SLOTS) {
      const h = basePosition(s, "home"), a = basePosition(s, "away");
      expect(Math.abs(h.x)).toBeLessThanOrEqual(PITCH.halfLength);
      expect(h.x).toBeLessThan(0);
      expect(a.x).toBeGreaterThan(0);
    }
    expect(basePosition(SLOTS[0], "home").x).toBeLessThan(-45);
  });

  it("acts out a goal: shot into the net, roar, celebration, replay, then kick-off", () => {
    const d = make();
    d.play({ kind: "goal", side: "home", scorer: "Home 9", penalty: false });
    let maxX = -999;
    let sawReplay = false;
    const cues: string[] = [];
    for (let i = 0; i < 60 * 30; i++) {
      d.step(1 / 60, "home");
      cues.push(...d.takeCues());
      maxX = Math.max(maxX, d.ball.pos.x);
      if (d.camera === "replay") sawReplay = true;
      if (i > 10 && !d.busy) break;
    }
    expect(maxX).toBeGreaterThan(PITCH.halfLength); // in the net, beyond the goal line
    expect(cues).toContain("roar");
    expect(sawReplay).toBe(true);
    expect(d.busy).toBe(false);
    // Kick-off by the side that conceded.
    expect(d.carrier()?.side).toBe("away");
  });

  it("acts out a save: the keeper ends up with the ball", () => {
    const d = make();
    d.play({ kind: "save", side: "away", scorer: "Away 9", penalty: false });
    const { cues } = runUntilIdle(d, "away");
    expect(cues).toContain("save");
    expect(d.carrier()?.isKeeper).toBe(true);
    expect(d.carrier()?.side).toBe("home");
  });

  it("a miss never crosses the goal line between the posts", () => {
    const d = make();
    d.play({ kind: "miss", side: "home", scorer: null, penalty: false });
    let crossedInside = false;
    for (let i = 0; i < 60 * 20 && (i < 10 || d.busy); i++) {
      d.step(1 / 60, "home");
      if (d.ball.pos.x > PITCH.halfLength && Math.abs(d.ball.pos.z) < PITCH.goalHalf && d.ball.y < PITCH.goalHeight) crossedInside = true;
    }
    expect(crossedInside).toBe(false);
  });

  it("wins the ball back by closing down and tackling when possession changes", () => {
    const d = make();
    for (let i = 0; i < 60 * 4; i++) d.step(1 / 60, "home"); // home keep the ball after kick-off
    expect(d.carrier()?.side).toBe("home");
    let won = false;
    for (let i = 0; i < 60 * 6 && !won; i++) {
      d.step(1 / 60, "away");
      won = d.carrier()?.side === "away";
    }
    expect(won).toBe(true);
  });

  it("players keep their distance and turn smoothly", () => {
    const d = make();
    let maxTurn = 0;
    const before = d.agents.map((a) => a.facing);
    for (let i = 0; i < 60 * 8; i++) {
      d.step(1 / 60, i < 240 ? "home" : "away");
      d.agents.forEach((a, k) => {
        const turn = Math.abs(Math.atan2(Math.sin(a.facing - before[k]), Math.cos(a.facing - before[k])));
        if (a.kick === 0 && a.tackle === 0) maxTurn = Math.max(maxTurn, turn);
        before[k] = a.facing;
      });
    }
    expect(maxTurn).toBeLessThan(0.2); // never snaps around in one frame
    const crowded = d.agents.filter((a) => d.agents.some((b) => b !== a && Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < 0.5));
    expect(crowded.length).toBeLessThanOrEqual(2);
  });

  it("turns match events into the right scenes", () => {
    expect(highlightFor({ type: "goal", side: "home", player: "A", detail: "2–1 (pen)" })).toMatchObject({ kind: "goal", penalty: true, scorer: "A" });
    expect(highlightFor({ type: "save", side: "away", player: "Keeper", detail: "Denies Max Power" })).toMatchObject({ kind: "save", side: "home", scorer: "Max Power" });
    expect(highlightFor({ type: "chance", side: "home", player: "B", detail: "Tackled" })).toMatchObject({ kind: "blocked" });
    expect(highlightFor({ type: "yellow_card", side: "home", player: "C", detail: null })).toBeNull();
  });
});
