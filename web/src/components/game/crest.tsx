import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Original crest outlines (templates crest-01 … crest-06). */
const SHAPES: Record<string, string> = {
  "crest-01": "M32 2 60 10v20c0 16-12 27-28 32C16 57 4 46 4 30V10Z", // heater shield
  "crest-02": "M32 2a30 30 0 1 1 0 60 30 30 0 0 1 0-60Z", // roundel
  "crest-03": "M32 2 58 17v30L32 62 6 47V17Z", // hexagon
  "crest-04": "M6 4h52v30c0 14-11 24-26 28C17 58 6 48 6 34Z", // flat-top shield
  "crest-05": "M32 2 62 32 32 62 2 32Z", // diamond
  "crest-06": "M10 2h44l6 14-6 46H10L4 16Z", // banner
};

export function Crest({
  template = "crest-01",
  primary,
  secondary,
  name,
  className,
}: {
  template?: string;
  primary: string;
  secondary: string;
  name: string;
  className?: string;
}) {
  const d = SHAPES[template] ?? SHAPES["crest-01"];
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={`${name} crest`} className={cn("size-12 shrink-0", className)}>
      <path d={d} fill={primary} stroke={secondary} strokeWidth="3" strokeLinejoin="round" />
      <path d={d} fill="url(#crest-sheen)" opacity="0.35" />
      <defs>
        <linearGradient id="crest-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <text
        x="32"
        y="38"
        textAnchor="middle"
        fontSize="17"
        fontWeight="800"
        fill={secondary}
        style={{ fontFamily: "var(--font-geist-sans)" }}
      >
        {initials(name)}
      </text>
    </svg>
  );
}
