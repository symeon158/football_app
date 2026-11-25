import type { StadiumDesign } from "@/lib/game/stadium";
import { cn } from "@/lib/utils";

type Levels = { seating: number; lighting: number; pitch: number; facilities: number };

/** Surface by "surface" level: concrete court → artificial cage → turf → grass. */
const SURFACE = [
  { fill: "#6b7280", stripe: "#9ca3af", lines: "#f8fafc" }, // 1 concrete
  { fill: "#2f8f4e", stripe: "#3aa35c", lines: "#f8fafc" }, // 2 five-a-side astro
  { fill: "#2a8a47", stripe: "#33a055", lines: "#f8fafc" }, // 3 full-size artificial turf
  { fill: "#27904a", stripe: "#2fa556", lines: "#ffffff" }, // 4 natural grass
  { fill: "#1f9a4c", stripe: "#29b15a", lines: "#ffffff" }, // 5 pristine grass
];

/** Neighbourhood backdrops (original artwork). */
const SCENE: Record<StadiumDesign, { sky: [string, string]; block: string; window: string; accent: string }> = {
  classic: { sky: ["#1e293b", "#0f172a"], block: "#a16207", window: "#fde68a", accent: "#78350f" }, // old town
  modern: { sky: ["#1f2937", "#111827"], block: "#475569", window: "#bae6fd", accent: "#e11d48" }, // urban, graffiti
  bowl: { sky: ["#14532d", "#052e16"], block: "#166534", window: "#fef08a", accent: "#4ade80" }, // park
  fortress: { sky: ["#0c4a6e", "#082f49"], block: "#0369a1", window: "#fde68a", accent: "#f97316" }, // harbour
};

/**
 * Side-on neighbourhood ground that grows with each upgrade: surface, stands & supporters,
 * floodlights and the clubhouse. Original artwork.
 */
export function StadiumIllustration({
  levels,
  design = "classic",
  className,
  title,
}: {
  levels: Levels;
  design?: StadiumDesign;
  className?: string;
  title: string;
}) {
  const sc = SCENE[design] ?? SCENE.classic;
  const clamp = (n: number) => Math.max(1, Math.min(5, n));
  const stands = clamp(levels.seating), lights = clamp(levels.lighting), surface = clamp(levels.pitch), club = clamp(levels.facilities);
  const s = SURFACE[surface - 1];
  const baseY = 96;
  const skyId = `ground-sky-${design}`;
  const glowId = `ground-glow-${lights}`;

  return (
    <svg viewBox="0 0 320 140" role="img" aria-label={title} className={cn("w-full", className)}>
      <defs>
        <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sc.sky[1]} />
          <stop offset="1" stopColor={sc.sky[0]} />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="10%" r="85%">
          <stop offset="0" stopColor="#fff7cc" stopOpacity={0.05 + lights * 0.07} />
          <stop offset="1" stopColor="#fff7cc" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="320" height="140" fill={`url(#${skyId})`} />

      {/* Backdrop: the neighbourhood behind the ground */}
      <Backdrop design={design} sc={sc} baseY={baseY} />
      <rect width="320" height="140" fill={`url(#${glowId})`} />

      {/* Clubhouse (facilities) on the left */}
      {club === 1 && <g><rect x="6" y={baseY - 10} width="20" height="8" rx="2" fill="#334155" /><circle cx="10" cy={baseY - 2} r="2" fill="#0f172a" /><circle cx="22" cy={baseY - 2} r="2" fill="#0f172a" /></g>}
      {club === 2 && <g><rect x="4" y={baseY - 16} width="30" height="16" fill={sc.accent} /><g stroke="#00000033">{[8, 12, 16, 20, 24, 28].map((x) => <line key={x} x1={x} y1={baseY - 16} x2={x} y2={baseY} />)}</g></g>}
      {club >= 3 && (
        <g>
          <rect x="2" y={baseY - (club >= 5 ? 34 : club === 4 ? 26 : 20)} width={club >= 5 ? 44 : 34} height={club >= 5 ? 34 : club === 4 ? 26 : 20} rx="2" fill="#e5e7eb" />
          <path d={`M0 ${baseY - (club >= 5 ? 34 : club === 4 ? 26 : 20)} h${club >= 5 ? 48 : 38} l-4 -5 h${club >= 5 ? -40 : -30}Z`} fill={sc.accent} />
          {Array.from({ length: club >= 5 ? 6 : 3 }, (_, i) => (
            <rect key={i} x={6 + (i % 3) * 11} y={baseY - (club >= 5 ? 28 : club === 4 ? 20 : 15) + Math.floor(i / 3) * 12} width="6" height="5" fill="#fde68a" opacity="0.85" />
          ))}
          {club >= 4 && <rect x="6" y={baseY - 7} width="9" height="7" fill="#475569" />}
        </g>
      )}

      {/* Floodlights */}
      {(lights === 1 ? [300] : lights === 2 ? [56, 292] : [56, 120, 200, 292]).map((x, i) => {
        const top = lights === 1 ? baseY - 30 : baseY - 34 - lights * 6;
        return (
          <g key={i}>
            <line x1={x} y1={baseY} x2={x} y2={top} stroke="#94a3b8" strokeWidth={lights === 1 ? 1.2 : 2} />
            {lights === 1 ? (
              <path d={`M${x} ${top} q-6 0 -8 4`} stroke="#94a3b8" strokeWidth="1.2" fill="none" />
            ) : (
              <rect x={x - 6} y={top - 5} width="12" height="6" rx="1.5" fill="#fef9c3" opacity={0.55 + lights * 0.08} />
            )}
            <path d={`M${x - (lights === 1 ? 8 : 5)} ${top + 3} L${x - 34} ${baseY + 22} L${x + 26} ${baseY + 22} L${x + 5} ${top + 3}Z`} fill="#fef9c3" opacity={0.02 + lights * 0.018} />
          </g>
        );
      })}

      {/* Stands & supporters */}
      <Stands level={stands} baseY={baseY} accent={sc.accent} />

      {/* Surface */}
      <path d={`M14 ${baseY} H306 L318 138 H2Z`} fill={s.fill} />
      {surface >= 2 &&
        Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${14 + i * 41.7} ${baseY} h20.8 l2.4 42 h-23.2Z`} fill={s.stripe} opacity="0.55" />)}
      {surface === 1 && Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${30 + i * 32} ${baseY + 8 + (i % 3) * 9} l6 2`} stroke="#4b5563" strokeWidth="0.8" />)}
      <g stroke={s.lines} strokeOpacity="0.7" strokeWidth="1" fill="none">
        <path d={surface <= 2 ? `M70 ${baseY + 4} H250 L262 134 H58Z` : `M20 ${baseY + 3} H300 L312 135 H8Z`} />
        <path d={`M160 ${baseY + 3} V135`} />
        <ellipse cx="160" cy="117" rx={surface <= 2 ? 12 : 22} ry={surface <= 2 ? 5 : 9} />
      </g>
      {/* Goals */}
      {[surface <= 2 ? 60 : 12, surface <= 2 ? 260 : 308].map((x, i) => (
        <path key={i} d={`M${x} 128 V112 H${x + (i === 0 ? 8 : -8)} V128`} stroke="#ffffff" strokeWidth="1.5" fill="none" />
      ))}
      {/* Cage around the small pitches, chain-link fence behind bigger ones */}
      {surface <= 2 ? (
        <g stroke="#cbd5e1" strokeOpacity="0.55" strokeWidth="0.6">
          <path d={`M56 ${baseY - 14} H264 V138 H56Z`} fill="none" />
          {Array.from({ length: 27 }, (_, i) => <line key={i} x1={56 + i * 8} y1={baseY - 14} x2={56 + i * 8} y2={baseY} />)}
        </g>
      ) : (
        <g stroke="#cbd5e1" strokeOpacity="0.35" strokeWidth="0.5">
          <line x1="14" y1={baseY - 6} x2="306" y2={baseY - 6} />
          {Array.from({ length: 37 }, (_, i) => <line key={i} x1={14 + i * 8} y1={baseY - 6} x2={14 + i * 8} y2={baseY} />)}
        </g>
      )}
    </svg>
  );
}

function Backdrop({ design, sc, baseY }: { design: StadiumDesign; sc: (typeof SCENE)[StadiumDesign]; baseY: number }) {
  if (design === "bowl") {
    // Park: trees and low houses
    return (
      <g>
        {[20, 60, 110, 170, 230, 285].map((x, i) => <rect key={`h${i}`} x={x} y={baseY - 24 - (i % 2) * 6} width="30" height={24 + (i % 2) * 6} fill="#365314" opacity="0.7" />)}
        {[10, 45, 90, 140, 200, 255, 305].map((x, i) => (
          <g key={`t${i}`}><rect x={x - 1} y={baseY - 18} width="2" height="18" fill="#3f2d1e" /><circle cx={x} cy={baseY - 24 - (i % 3) * 3} r={9 + (i % 2) * 3} fill={i % 2 ? "#15803d" : "#166534"} /></g>
        ))}
      </g>
    );
  }
  if (design === "fortress") {
    // Harbour: stacked containers and cranes by the sea
    return (
      <g>
        <rect x="0" y={baseY - 12} width="320" height="12" fill="#075985" opacity="0.6" />
        {[["#ea580c", 30], ["#0284c7", 62], ["#16a34a", 94], ["#dc2626", 206], ["#ca8a04", 238], ["#7c3aed", 270]].map(([c, x], i) => (
          <g key={i}>
            <rect x={x as number} y={baseY - 20} width="30" height="9" fill={c as string} />
            <rect x={(x as number) + 4} y={baseY - 29} width="30" height="9" fill={(["#0284c7", "#ea580c", "#ca8a04"] as const)[i % 3]} />
          </g>
        ))}
        {[150, 180].map((x) => <path key={x} d={`M${x} ${baseY - 12} V${baseY - 70} H${x + 34} M${x} ${baseY - 60} l20 -10`} stroke="#f97316" strokeWidth="2" fill="none" />)}
      </g>
    );
  }
  // Old town / urban: apartment blocks with balconies and lit windows
  const heights = [52, 66, 44, 74, 58, 48, 70, 54];
  return (
    <g>
      {heights.map((h, i) => {
        const x = i * 40;
        return (
          <g key={i}>
            <rect x={x + 2} y={baseY - h} width="36" height={h} fill={sc.block} opacity={design === "modern" ? 0.9 : 0.85} />
            {Array.from({ length: Math.floor(h / 12) }, (_, r) => (
              <g key={r}>
                <rect x={x + 2} y={baseY - h + 8 + r * 12} width="36" height="1.5" fill="#00000040" />
                {[0, 1, 2].map((c) => (
                  <rect key={c} x={x + 7 + c * 10} y={baseY - h + 2 + r * 12} width="5" height="5" fill={(i + r + c) % 3 ? sc.window : "#00000055"} opacity="0.8" />
                ))}
              </g>
            ))}
          </g>
        );
      })}
      {design === "modern" && (
        <g>
          <rect x="70" y={baseY - 16} width="180" height="16" fill="#334155" />
          {[["#e11d48", 80], ["#22d3ee", 120], ["#facc15", 165], ["#a855f7", 205]].map(([c, x], i) => (
            <path key={i} d={`M${x} ${baseY - 4} q8 -12 16 -2 t16 -4`} stroke={c as string} strokeWidth="3" fill="none" strokeLinecap="round" />
          ))}
        </g>
      )}
    </g>
  );
}

function Stands({ level, baseY, accent }: { level: number; baseY: number; accent: string }) {
  const crowd = (x0: number, x1: number, y: number, rows: number, key: string) =>
    Array.from({ length: rows }, (_, r) =>
      Array.from({ length: Math.floor((x1 - x0) / 6) }, (_, i) => (
        <circle key={`${key}${r}-${i}`} cx={x0 + 3 + i * 6 + (r % 2) * 3} cy={y - r * 5} r="1.7"
          fill={["#e2e8f0", "#94a3b8", accent, "#fbbf24"][(i * 5 + r * 3) % 4]} opacity="0.8" />
      )),
    );
  if (level === 1) return <g>{crowd(100, 220, baseY - 2, 1, "s")}</g>; // a few fans along the fence
  if (level === 2) {
    // wooden benches
    return (
      <g>
        {[70, 170].map((x) => <rect key={x} x={x} y={baseY - 6} width="80" height="3" fill="#92400e" />)}
        {crowd(72, 148, baseY - 8, 1, "b1")}
        {crowd(172, 248, baseY - 8, 1, "b2")}
      </g>
    );
  }
  const tiers = level - 1; // 3 → covered terrace, 4 → both sides, 5 → packed
  const width = level >= 4 ? [60, 260] : [100, 220];
  return (
    <g>
      {Array.from({ length: tiers }, (_, t) => {
        const y = baseY - (t + 1) * 9;
        return <path key={t} d={`M${width[0] + t * 6} ${y + 9} L${width[0] + 4 + t * 6} ${y} L${width[1] - 4 - t * 6} ${y} L${width[1] - t * 6} ${y + 9}Z`} fill="#334155" stroke="#0f172a" strokeWidth="0.5" />;
      })}
      {crowd(width[0] + 4, width[1] - 4, baseY - 4, tiers * 2 - (level === 3 ? 1 : 0), "t")}
      {/* roof over the terrace */}
      <path d={`M${width[0] - 4} ${baseY - tiers * 9 - 6} H${width[1] + 4}`} stroke={accent} strokeWidth="3" strokeLinecap="round" />
      {level === 5 &&
        [width[0] + 20, 160, width[1] - 20].map((x) => (
          <g key={x}><line x1={x} y1={baseY - tiers * 9 - 6} x2={x} y2={baseY - tiers * 9 - 20} stroke="#e5e7eb" /><path d={`M${x} ${baseY - tiers * 9 - 20} h10 l-3 4 l3 4 h-10Z`} fill={accent} /></g>
        ))}
    </g>
  );
}
