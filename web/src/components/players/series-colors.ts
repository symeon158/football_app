/**
 * Categorical slots 1–3 of the reference palette, dark steps. Validated
 * against our card surface #0b1522 (all-pairs, dark): lightness, chroma,
 * CVD ΔE ≥ 9.4, normal-vision ΔE ≥ 20.9, contrast ≥ 3:1 — all PASS.
 * Assigned in fixed order: player 1 is always blue, 2 orange, 3 aqua.
 *
 * Lives outside the "use client" chart module so Server Components get the
 * real array (importing it from a client module yields a client reference).
 */
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70"] as const;
