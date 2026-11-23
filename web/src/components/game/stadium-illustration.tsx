import { cn } from "@/lib/utils";

type Levels = { seating: number; lighting: number; pitch: number; facilities: number };

const PITCH_COLORS = ["#3f6b3a", "#3f7a3c", "#2f8a42", "#25994a", "#1faa55"]; // greener with quality

/**
 * Side-on stadium that grows with each upgrade category:
 * seating → stand tiers, lighting → floodlights, pitch → turf quality,
 * facilities → roof and side buildings. Original artwork.
 */
export function StadiumIllustration({ levels, className, title }: { levels: Levels; className?: string; title: string }) {
  const tiers = Math.max(1, Math.min(5, levels.seating));
  const lights = Math.max(1, Math.min(5, levels.lighting));
  const pitch = PITCH_COLORS[Math.max(1, Math.min(5, levels.pitch)) - 1];
  const tierH = 11;
  const baseY = 96;
  const standTop = baseY - tiers * tierH;
  const glow = 0.15 + lights * 0.12;

  return (
    <svg viewBox="0 0 320 140" role="img" aria-label={title} className={cn("w-full", className)}>
      <defs>
        <radialGradient id="stadium-glow" cx="50%" cy="0%" r="80%">
          <stop offset="0" stopColor="#fdf6c8" stopOpacity={glow} />
          <stop offset="1" stopColor="#fdf6c8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="stadium-stand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#334155" />
          <stop offset="1" stopColor="#1e293b" />
        </linearGradient>
      </defs>

      <rect width="320" height="140" fill="url(#stadium-glow)" />

      {/* floodlight masts */}
      {(lights >= 3 ? [22, 92, 228, 298] : [30, 290]).map((x) => {
        const top = standTop - 26 - lights * 3;
        return (
          <g key={x}>
            <line x1={x} y1={baseY} x2={x} y2={top} stroke="#64748b" strokeWidth="2" />
            <rect x={x - 7} y={top - 6} width="14" height="7" rx="1.5" fill="#fef9c3" opacity={0.5 + lights * 0.1} />
            <path d={`M${x - 7} ${top + 1} L${x - 30} ${baseY + 20} L${x + 30} ${baseY + 20} L${x + 7} ${top + 1}Z`} fill="#fef9c3" opacity={0.025 * lights} />
          </g>
        );
      })}

      {/* side buildings from facilities */}
      {levels.facilities >= 2 && <rect x="4" y={baseY - 18} width="26" height="18" rx="2" fill="#1e293b" />}
      {levels.facilities >= 4 && <rect x="290" y={baseY - 24} width="26" height="24" rx="2" fill="#1e293b" />}
      {levels.facilities >= 2 &&
        [10, 18].map((x) => <rect key={x} x={x} y={baseY - 13} width="4" height="4" fill="#fde68a" opacity="0.7" />)}

      {/* stand tiers with crowd dots */}
      {Array.from({ length: tiers }, (_, t) => {
        const inset = t * 10;
        const y = baseY - (t + 1) * tierH;
        return (
          <g key={t}>
            <path d={`M${40 + inset} ${y + tierH} L${46 + inset} ${y} L${274 - inset} ${y} L${280 - inset} ${y + tierH}Z`} fill="url(#stadium-stand)" stroke="#0f172a" strokeWidth="0.5" />
            {Array.from({ length: Math.floor((228 - inset * 2) / 7) }, (_, i) => (
              <circle key={i} cx={50 + inset + i * 7} cy={y + 5.5} r="1.6" fill={["#e2e8f0", "#94a3b8", "#4ade80", "#fbbf24"][(i * 7 + t * 3) % 4]} opacity="0.55" />
            ))}
          </g>
        );
      })}

      {/* roof */}
      {levels.facilities >= 3 && (
        <path d={`M${36 + (tiers - 1) * 10} ${standTop} L${160} ${standTop - 10} L${284 - (tiers - 1) * 10} ${standTop}`} fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
      )}

      {/* pitch */}
      <path d={`M20 ${baseY} H300 L316 138 H4Z`} fill={pitch} />
      {Array.from({ length: 6 }, (_, i) => (
        <path key={i} d={`M${20 + i * 46.6} ${baseY} h23.3 l2.7 42 h-26.3Z`} fill="#fff" opacity="0.04" />
      ))}
      <g stroke="#fff" strokeOpacity="0.6" strokeWidth="1" fill="none">
        <path d={`M26 ${baseY + 3} H294 L308 135 H12Z`} />
        <path d={`M160 ${baseY + 3} V135`} />
        <ellipse cx="160" cy="117" rx="22" ry="9" />
      </g>
    </svg>
  );
}
