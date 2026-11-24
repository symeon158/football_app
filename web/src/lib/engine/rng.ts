/**
 * Small, fast, seedable PRNG (mulberry32). The engine draws every random
 * number from one instance, so a match is fully determined by its seed and
 * inputs — which makes results reproducible, replayable and testable.
 * Not for security; seeds themselves come from crypto on the server.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Weighted pick; items with weight <= 0 are never chosen. Returns undefined if all weights are 0. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
    const weights = items.map((i) => Math.max(0, weight(i)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return undefined;
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll < 0) return items[i];
    }
    return items[items.length - 1];
  }
}

/** A 31-bit seed from a secure source (server-side). */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] & 0x7fffffff;
}
