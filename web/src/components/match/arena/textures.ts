/**
 * Procedural textures for the 3D match (drawn on canvases — no image files): the striped pitch
 * with markings, the ball, shirt numbers, name tags, the crowd and the advertising boards.
 * Browser-only.
 */
import * as THREE from "three";

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

function texture(c: HTMLCanvasElement, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Pitch 105 × 68 m (+ a grass border) at 20 px per metre, mown stripes and all the markings. */
export function pitchTexture() {
  const pxm = 20, border = 6;
  const W = (105 + border * 2) * pxm, H = (68 + border * 2) * pxm;
  const { c, g } = canvas(W, H);
  const stripe = 105 / 14;
  for (let i = -1; i < 17; i++) {
    g.fillStyle = i % 2 ? "#2f9e44" : "#37b24d";
    g.fillRect((border + i * stripe) * pxm, 0, stripe * pxm + 1, H);
  }
  // A little grain so the grass doesn't look flat.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.035)";
    g.fillRect(Math.random() * W, Math.random() * H, 3, 3);
  }
  const X = (m: number) => (border + m) * pxm, Y = (m: number) => (border + m) * pxm;
  g.strokeStyle = "rgba(255,255,255,0.92)";
  g.lineWidth = 0.14 * pxm;
  g.strokeRect(X(0), Y(0), 105 * pxm, 68 * pxm);
  g.beginPath(); g.moveTo(X(52.5), Y(0)); g.lineTo(X(52.5), Y(68)); g.stroke();
  g.beginPath(); g.arc(X(52.5), Y(34), 9.15 * pxm, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "white";
  g.beginPath(); g.arc(X(52.5), Y(34), 0.3 * pxm, 0, Math.PI * 2); g.fill();
  for (const side of [0, 1]) {
    const gx = side ? 105 : 0, d = side ? -1 : 1;
    const box = (depth: number, wide: number) => g.strokeRect(X(side ? gx - depth : gx), Y(34 - wide / 2), depth * pxm, wide * pxm);
    box(16.5, 40.32);
    box(5.5, 18.32);
    g.beginPath(); g.arc(X(gx + d * 11), Y(34), 0.3 * pxm, 0, Math.PI * 2); g.fill();
    g.save();
    g.beginPath(); g.rect(side ? X(0) : X(16.5), Y(0), 88.5 * pxm, 68 * pxm); g.clip();
    g.beginPath(); g.arc(X(gx + d * 11), Y(34), 9.15 * pxm, 0, Math.PI * 2); g.stroke();
    g.restore();
  }
  for (const [cx, cy, a0] of [[0, 0, 0], [105, 0, Math.PI / 2], [105, 68, Math.PI], [0, 68, -Math.PI / 2]] as const) {
    g.beginPath(); g.arc(X(cx), Y(cy), 1 * pxm, a0, a0 + Math.PI / 2); g.stroke();
  }
  return texture(c);
}

/** A classic black-and-white ball pattern. */
export function ballTexture() {
  const { c, g } = canvas(256, 128);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#111827";
  const spots = [[32, 30], [96, 64], [160, 30], [224, 64], [64, 100], [128, 100], [192, 100], [0, 64], [128, 10], [256, 30]];
  for (const [x, y] of spots) {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
    }
    g.closePath();
    g.fill();
  }
  return texture(c);
}

const numberCache = new Map<string, THREE.Texture>();
/** Shirt number for the back of a player. */
export function numberTexture(n: number, ink: string) {
  const key = `${n}-${ink}`;
  const hit = numberCache.get(key);
  if (hit) return hit;
  const { c, g } = canvas(128, 128);
  g.fillStyle = ink;
  g.font = "900 92px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(n), 64, 70);
  const t = texture(c);
  numberCache.set(key, t);
  return t;
}

const tagCache = new Map<string, THREE.Texture>();
/** Name tag shown above the player on the ball. */
export function nameTagTexture(name: string, color: string) {
  const key = `${name}-${color}`;
  const hit = tagCache.get(key);
  if (hit) return hit;
  const { c, g } = canvas(512, 112);
  g.font = "800 54px system-ui, sans-serif";
  const label = name.length > 20 ? `${name.slice(0, 19)}…` : name;
  const w = Math.min(500, g.measureText(label).width + 56);
  g.fillStyle = "rgba(10,15,25,0.82)";
  g.beginPath();
  g.roundRect((512 - w) / 2, 14, w, 84, 42);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc((512 - w) / 2 + 30, 56, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, 256 + 12, 58);
  const t = texture(c);
  tagCache.set(key, t);
  return t;
}

/** Rows of supporters (head-and-shoulders dots) in both teams' colours. */
export function crowdTexture(colors: string[]) {
  const { c, g } = canvas(512, 256);
  g.fillStyle = "#1f2937";
  g.fillRect(0, 0, 512, 256);
  const skin = ["#f1c7a5", "#d9a072", "#a86b45", "#6d4227", "#f6dccb"];
  for (let row = 0; row < 8; row++) {
    for (let i = 0; i < 26; i++) {
      const x = i * 20 + (row % 2) * 10 + Math.random() * 4, y = 22 + row * 30;
      g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      g.beginPath(); g.ellipse(x, y + 10, 8, 7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = skin[Math.floor(Math.random() * skin.length)];
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      if (Math.random() < 0.08) { // a scarf or a flag held up
        g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        g.fillRect(x - 2, y - 16, 12, 7);
      }
    }
  }
  return texture(c, [6, 1]);
}

/** Pitch-side advertising boards with the game's own branding. */
export function boardTexture() {
  const { c, g } = canvas(1024, 64);
  const panels = [["#0f172a", "#facc15", "FOOTBALL LEGENDS"], ["#16a34a", "#ffffff", "KICK OFF!"], ["#1d4ed8", "#ffffff", "★ PLAY FAIR ★"], ["#dc2626", "#ffffff", "GOAL!"]];
  panels.forEach(([bg, ink, text], i) => {
    g.fillStyle = bg;
    g.fillRect(i * 256, 0, 256, 64);
    g.fillStyle = ink;
    g.font = "900 30px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, i * 256 + 128, 34);
  });
  return texture(c, [5, 1]);
}
