/**
 * Original, procedurally generated portrait for a fictional player.
 *
 * Every feature is picked deterministically from a seed (the player's name), so a player looks
 * the same everywhere without storing or downloading images. Skin tone is drawn independently of
 * nationality. Pure SVG: server-renderable, no client JavaScript.
 */

type Tone = { skin: string; shade: string; lip: string };

const SKIN: Tone[] = [
  { skin: "#f6d7c3", shade: "#e2b8a0", lip: "#c97f73" },
  { skin: "#efc4a4", shade: "#d9a482", lip: "#bd7465" },
  { skin: "#e0ac85", shade: "#c78d66", lip: "#a8604f" },
  { skin: "#c98e63", shade: "#ad7149", lip: "#8f4f3e" },
  { skin: "#a8704a", shade: "#8c5836", lip: "#6f3b2c" },
  { skin: "#8a5735", shade: "#704427", lip: "#552c20" },
  { skin: "#6b4026", shade: "#55301b", lip: "#401f15" },
  { skin: "#4e2d1a", shade: "#3c2113", lip: "#2b150d" },
];

const HAIR = ["#16110e", "#2a1b12", "#3d2716", "#5a3a20", "#8a5a2b", "#b98a4e", "#d8b56f", "#7a2f1b", "#8d8d8d"];
const HAIR_WEIGHTS = [22, 20, 16, 12, 8, 6, 6, 5, 2];

const KITS = [
  { main: "#1f6feb", trim: "#e8eef9" },
  { main: "#d93a3a", trim: "#fff1f1" },
  { main: "#0f9d58", trim: "#eafff3" },
  { main: "#f2f2f2", trim: "#1b1b1b" },
  { main: "#141414", trim: "#e7c35a" },
  { main: "#7b3fe4", trim: "#f2ecff" },
  { main: "#f39c12", trim: "#1d1d1d" },
  { main: "#0b2a5b", trim: "#f5d76e" },
];

type HairStyle = "buzz" | "crop" | "sidepart" | "quiff" | "curly" | "afro" | "long" | "bun" | "bald" | "slick";
const STYLES: HairStyle[] = ["buzz", "crop", "sidepart", "quiff", "curly", "afro", "long", "bun", "bald", "slick"];
const STYLE_WEIGHTS = [14, 16, 12, 12, 10, 7, 7, 6, 6, 10];

type Facial = "none" | "stubble" | "beard" | "moustache" | "goatee";
const FACIAL: Facial[] = ["none", "stubble", "beard", "moustache", "goatee"];
const FACIAL_WEIGHTS = [44, 24, 16, 6, 10];

/** FNV-1a string hash → mulberry32 generator. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, items: T[], weights?: number[]): T {
  if (!weights) return items[Math.floor(r() * items.length)];
  const total = weights.reduce((s, w) => s + w, 0);
  let x = r() * total;
  for (let i = 0; i < items.length; i++) if ((x -= weights[i]) < 0) return items[i];
  return items[items.length - 1];
}

export type FaceTraits = {
  tone: Tone;
  hair: string;
  style: HairStyle;
  facial: Facial;
  kit: (typeof KITS)[number];
  jaw: number; // half-width of the jaw, 19–23
  browTilt: number;
  browWeight: number;
  smile: boolean;
  eyeGap: number;
};

export function faceTraits(seed: string): FaceTraits {
  const r = rng(seed);
  const tone = pick(r, SKIN);
  const style = pick(r, STYLES, STYLE_WEIGHTS);
  // Grey and blond are rarer; very dark tones skew to darker hair, like real populations.
  let hair = pick(r, HAIR, HAIR_WEIGHTS);
  if (SKIN.indexOf(tone) >= 5 && r() < 0.8) hair = pick(r, HAIR.slice(0, 3));
  return {
    tone,
    hair,
    style,
    facial: pick(r, FACIAL, FACIAL_WEIGHTS),
    kit: pick(r, KITS),
    jaw: 19 + r() * 4,
    browTilt: (r() - 0.5) * 3,
    browWeight: 1.6 + r() * 1.2,
    smile: r() < 0.55,
    eyeGap: 8.5 + r() * 1.5,
  };
}

function HairBack({ t }: { t: FaceTraits }) {
  if (t.style === "afro") return <ellipse cx="50" cy="36" rx="31" ry="27" fill={t.hair} />;
  if (t.style === "long")
    return <path d="M24 40 C24 18 36 12 50 12 C64 12 76 18 76 40 L78 72 C70 76 30 76 22 72 Z" fill={t.hair} />;
  return null;
}

function HairFront({ t }: { t: FaceTraits }) {
  const c = t.hair;
  switch (t.style) {
    case "bald":
      return <ellipse cx="44" cy="24" rx="7" ry="3" fill="#fff" opacity="0.18" />;
    case "buzz":
      return <path d="M27.5 42 C27 21 38 15 50 15 C62 15 73 21 72.5 42 C69 30 60 25 50 25 C40 25 31 30 27.5 42 Z" fill={c} opacity="0.85" />;
    case "crop":
      return <path d="M27 44 C25 19 37 12 50 12 C63 12 75 19 73 44 L71 40 C69 29 61 24 50 24.5 C39 24 31 29 29 40 Z" fill={c} />;
    case "sidepart":
      return (
        <g fill={c}>
          <path d="M27 44 C24 18 37 11 51 11 C65 11 76 19 73 44 L71 37 C69 28 63 23.5 55 23 L44 28 C36 29 30 33 29 40 Z" />
          <path d="M55 23 C47 22 40 24 33 30 C37 21 45 17 55 18 Z" opacity="0.9" />
        </g>
      );
    case "quiff":
      return (
        <g fill={c}>
          <path d="M27 44 C25 22 34 14 44 11 C50 6 62 6 68 13 C74 19 74 30 73 44 L71 37 C69 29 63 24 52 24 C41 24 32 29 29 40 Z" />
          <path d="M44 11 C52 3 66 5 70 14 C62 10 52 10 44 14 Z" opacity="0.85" />
        </g>
      );
    case "slick":
      return (
        <g fill={c}>
          <path d="M27 42 C26 20 37 13 50 13 C63 13 74 20 73 42 C70 29 61 22.5 50 22.5 C39 22.5 30 29 27 42 Z" />
          <path d="M34 22 C42 17 58 17 66 22" stroke="#fff" strokeOpacity="0.15" strokeWidth="1" fill="none" />
        </g>
      );
    case "curly": {
      const dots: [number, number][] = [];
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * (1.05 + (i / 10) * 0.9);
        dots.push([50 + Math.cos(a) * 22, 38 + Math.sin(a) * 22]);
      }
      return (
        <g fill={c}>
          <path d="M28 40 C28 22 38 16 50 16 C62 16 72 22 72 40 C67 30 59 27 50 27 C41 27 33 30 28 40 Z" />
          {dots.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={5.2} />
          ))}
        </g>
      );
    }
    case "afro":
      return <path d="M27 42 C26 22 37 14 50 14 C63 14 74 22 73 42 C70 31 61 26.5 50 26.5 C39 26.5 30 31 27 42 Z" fill={c} />;
    case "long":
      return <path d="M27 44 C26 20 37 13 50 13 C63 13 74 20 73 44 C69 32 62 24 50 26 C38 24 31 32 27 44 Z" fill={c} />;
    case "bun":
      return (
        <g fill={c}>
          <circle cx="50" cy="10" r="7" />
          <path d="M27.5 42 C27 20 38 14 50 14 C62 14 73 20 72.5 42 C69 29 61 23.5 50 23.5 C39 23.5 31 29 27.5 42 Z" />
        </g>
      );
  }
}

function FacialHair({ t, jawL, jawR }: { t: FaceTraits; jawL: number; jawR: number }) {
  const c = t.hair === "#8d8d8d" ? "#9a9a9a" : t.hair;
  switch (t.facial) {
    case "none":
      return null;
    case "stubble":
      return (
        <path
          d={`M${jawL} 50 C${jawL} 64 41 72 50 72 C59 72 ${jawR} 64 ${jawR} 50 C${jawR - 3} 60 58 64 50 64 C42 64 ${jawL + 3} 60 ${jawL} 50 Z`}
          fill={c}
          opacity="0.28"
        />
      );
    case "beard":
      return (
        <path
          d={`M${jawL} 48 C${jawL} 66 40 75 50 75 C60 75 ${jawR} 66 ${jawR} 48 C${jawR - 2} 58 58 60 54 59.5 C52 58.8 48 58.8 46 59.5 C42 60 ${jawL + 2} 58 ${jawL} 48 Z M44 62 Q50 65.5 56 62 Q50 63.5 44 62 Z`}
          fill={c}
          fillRule="evenodd"
          opacity="0.95"
        />
      );
    case "moustache":
      return <path d="M42.5 59.5 C45 56.5 48 57 50 58.2 C52 57 55 56.5 57.5 59.5 C54 59 52 59.6 50 60 C48 59.6 46 59 42.5 59.5 Z" fill={c} />;
    case "goatee":
      return (
        <g fill={c}>
          <path d="M43 59.5 C46 57 48.5 57.6 50 58.4 C51.5 57.6 54 57 57 59.5 C54 59.2 52 59.8 50 60.2 C48 59.8 46 59.2 43 59.5 Z" />
          <path d="M45.5 64.5 Q50 63 54.5 64.5 L53 70 Q50 71.5 47 70 Z" />
        </g>
      );
  }
}

export function PlayerFace({ seed, className }: { seed: string; className?: string }) {
  const t = faceTraits(seed);
  const jawL = 50 - t.jaw;
  const jawR = 50 + t.jaw;
  const browY = 40.5;
  const eyeL = 50 - t.eyeGap;
  const eyeR = 50 + t.eyeGap;

  return (
    <svg aria-hidden viewBox="0 0 100 100" className={className}>
      <HairBack t={t} />
      {/* shirt */}
      <path d="M8 100 C10 82 28 75 50 75 C72 75 90 82 92 100 Z" fill={t.kit.main} />
      <path d="M38 76 L50 88 L62 76" fill="none" stroke={t.kit.trim} strokeWidth="3" strokeLinejoin="round" />
      {/* neck */}
      <path d="M41 62 L41 77 Q50 86 59 77 L59 62 Z" fill={t.tone.shade} />
      {/* ears */}
      <ellipse cx={jawL - 0.5} cy="47" rx="3.6" ry="5.6" fill={t.tone.shade} />
      <ellipse cx={jawR + 0.5} cy="47" rx="3.6" ry="5.6" fill={t.tone.shade} />
      {/* head */}
      <path
        d={`M${jawL} 40 C${jawL} 23 38 16 50 16 C62 16 ${jawR} 23 ${jawR} 40 L${jawR} 49 C${jawR} 63 61 72.5 50 72.5 C39 72.5 ${jawL} 63 ${jawL} 49 Z`}
        fill={t.tone.skin}
      />
      <HairFront t={t} />
      {/* brows */}
      <g stroke={t.hair === "#d8b56f" ? "#a8844a" : t.hair} strokeWidth={t.browWeight} strokeLinecap="round" fill="none">
        <path d={`M${eyeL - 4} ${browY + t.browTilt / 2} Q${eyeL} ${browY - 1.5} ${eyeL + 4} ${browY - t.browTilt / 2}`} />
        <path d={`M${eyeR - 4} ${browY - t.browTilt / 2} Q${eyeR} ${browY - 1.5} ${eyeR + 4} ${browY + t.browTilt / 2}`} />
      </g>
      {/* eyes */}
      <g fill="#1d1612">
        <ellipse cx={eyeL} cy="46.5" rx="2.1" ry="2.4" />
        <ellipse cx={eyeR} cy="46.5" rx="2.1" ry="2.4" />
      </g>
      <g fill="#fff" opacity="0.8">
        <circle cx={eyeL + 0.7} cy="45.7" r="0.6" />
        <circle cx={eyeR + 0.7} cy="45.7" r="0.6" />
      </g>
      {/* nose */}
      <path d="M50 47.5 Q47.6 54 49 55.3 Q50.5 56 52.6 55" fill="none" stroke={t.tone.shade} strokeWidth="1.4" strokeLinecap="round" />
      {/* mouth */}
      {t.smile ? (
        <path d="M44.5 61.2 Q50 65.6 55.5 61.2" fill="none" stroke={t.tone.lip} strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M45.5 62 Q50 63.2 54.5 62" fill="none" stroke={t.tone.lip} strokeWidth="1.6" strokeLinecap="round" />
      )}
      <FacialHair t={t} jawL={jawL} jawR={jawR} />
    </svg>
  );
}
