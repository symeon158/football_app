/** Canvas renderer for the playable match (browser-only; purely visual, never affects the sim). */
import { PITCH, type MatchState, type PlayerState } from "./types";

const L = PITCH.length;
const W = PITCH.width;
const VIEW_LENGTH = 56; // metres of pitch visible across the screen

export type Camera = { x: number; y: number };

export function createCamera(): Camera {
  return { x: L / 2, y: W / 2 };
}

const GK_KITS = ["#f5c542", "#2bd4a4"]; // goalkeepers wear a different colour from their team

export function render(ctx: CanvasRenderingContext2D, s: MatchState, cam: Camera, width: number, height: number) {
  const scale = Math.max(width / VIEW_LENGTH, height / (W + 6));
  const viewLen = width / scale, viewWid = height / scale;
  // Follow the ball smoothly, never showing much beyond the pitch.
  const tx = Math.min(Math.max(s.ball.x, viewLen / 2 - 4), L - viewLen / 2 + 4);
  const ty = viewWid >= W + 6 ? W / 2 : Math.min(Math.max(s.ball.y, viewWid / 2 - 3), W - viewWid / 2 + 3);
  cam.x += (tx - cam.x) * 0.09;
  cam.y += (ty - cam.y) * 0.09;
  const ox = width / 2 - cam.x * scale;
  const oy = height / 2 - cam.y * scale;
  const X = (x: number) => ox + x * scale;
  const Y = (y: number) => oy + y * scale;

  // Grass with mowing stripes.
  ctx.fillStyle = "#0f5a2c";
  ctx.fillRect(0, 0, width, height);
  for (let i = -2; i < L / 7 + 2; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#137034" : "#11652f";
    ctx.fillRect(X(i * 7), Y(-4), 7 * scale + 1, (W + 8) * scale);
  }

  // Markings.
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(1.5, 0.12 * scale);
  ctx.strokeRect(X(0), Y(0), L * scale, W * scale);
  line(ctx, X(L / 2), Y(0), X(L / 2), Y(W));
  circle(ctx, X(L / 2), Y(W / 2), 9.15 * scale, false);
  circle(ctx, X(L / 2), Y(W / 2), 0.25 * scale, true);
  for (const side of [0, 1] as const) {
    const gx = side === 0 ? 0 : L, d = side === 0 ? 1 : -1;
    const box = (depth: number, wide: number) => {
      const x0 = side === 0 ? gx : gx - depth;
      ctx.strokeRect(X(x0), Y(W / 2 - wide / 2), depth * scale, wide * scale);
    };
    box(16.5, 40.32);
    box(5.5, 18.32);
    circle(ctx, X(gx + d * 11), Y(W / 2), 0.25 * scale, true);
    // The "D" outside the penalty area.
    ctx.save();
    ctx.beginPath();
    ctx.rect(side === 0 ? X(16.5) : X(0), Y(0), side === 0 ? (L - 16.5) * scale : (L - 16.5) * scale, W * scale);
    ctx.clip();
    circle(ctx, X(gx + d * 11), Y(W / 2), 9.15 * scale, false);
    ctx.restore();
    // Goal with net.
    const gx0 = side === 0 ? -PITCH.goalDepth : L;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(X(gx0), Y(W / 2 - PITCH.goalWidth / 2), PITCH.goalDepth * scale, PITCH.goalWidth * scale);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    for (let k = 0.5; k < PITCH.goalWidth; k += 0.5) line(ctx, X(gx0), Y(W / 2 - PITCH.goalWidth / 2 + k), X(gx0 + PITCH.goalDepth), Y(W / 2 - PITCH.goalWidth / 2 + k));
    ctx.restore();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(2, 0.2 * scale);
    ctx.strokeRect(X(gx0), Y(W / 2 - PITCH.goalWidth / 2), PITCH.goalDepth * scale, PITCH.goalWidth * scale);
  }

  // Shadows first, then players, so overlapping players stay readable.
  const r = 0.85 * scale;
  for (const p of s.players) {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ellipse(ctx, X(p.x) + r * 0.25, Y(p.y) + r * 0.35, r, r * 0.6);
  }
  const controlled = s.players[s.controlled];
  if (s.phase !== "halftime" && s.phase !== "fulltime") {
    // Marker under the human-controlled player.
    ctx.strokeStyle = "#f5c542";
    ctx.lineWidth = Math.max(2, 0.18 * scale);
    circle(ctx, X(controlled.x), Y(controlled.y), r * 1.55, false);
  }
  for (const p of s.players) drawPlayer(ctx, s, p, X(p.x), Y(p.y), r);

  // Ball (lifted slightly when moving fast, for a sense of speed).
  const speed = Math.hypot(s.ball.vx, s.ball.vy);
  const lift = Math.min(1, speed / 30) * 0.5 * scale;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ellipse(ctx, X(s.ball.x) + 2, Y(s.ball.y) + 2, 0.34 * scale, 0.22 * scale);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#1b1b1b";
  ctx.lineWidth = Math.max(1, 0.06 * scale);
  ctx.beginPath();
  ctx.arc(X(s.ball.x), Y(s.ball.y) - lift, Math.max(3, 0.34 * scale), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  drawRadar(ctx, s, width, height);

  // Name and shot-power bar over the controlled player.
  if (s.phase === "play" || s.phase === "restart") {
    const cx = X(controlled.x), cy = Y(controlled.y) - r * 2.1;
    ctx.font = `600 ${Math.max(11, 0.95 * scale)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    const label = shortName(controlled.name);
    const tw = ctx.measureText(label).width;
    roundRect(ctx, cx - tw / 2 - 5, cy - Math.max(11, 0.95 * scale) - 2, tw + 10, Math.max(11, 0.95 * scale) + 7, 4);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, cx, cy);
    if (s.charge > 0) {
      const bw = 2.6 * scale, bh = Math.max(4, 0.32 * scale), by = Y(controlled.y) + r * 1.8;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(cx - bw / 2, by, bw, bh);
      ctx.fillStyle = s.charge > 0.8 ? "#ef4444" : "#f5c542";
      ctx.fillRect(cx - bw / 2, by, bw * s.charge, bh);
    }
  }
}

/** Mini-map of the whole pitch (bottom-right). */
function drawRadar(ctx: CanvasRenderingContext2D, s: MatchState, width: number, height: number) {
  const rw = Math.min(190, width * 0.22), rh = rw * (W / L), pad = 12;
  const x0 = width - rw - pad, y0 = height - rh - pad, k = rw / L;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x0 - 4, y0 - 4, rw + 8, rh + 8);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, rw, rh);
  line(ctx, x0 + rw / 2, y0, x0 + rw / 2, y0 + rh);
  for (const p of s.players) {
    ctx.fillStyle = p.id === s.controlled ? "#f5c542" : p.role === "GK" ? GK_KITS[p.team] : s.setup.teams[p.team].kit.primary;
    ctx.beginPath();
    ctx.arc(x0 + p.x * k, y0 + p.y * k, p.id === s.controlled ? 3.5 : 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x0 + s.ball.x * k, y0 + s.ball.y * k, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: MatchState, p: PlayerState, x: number, y: number, r: number) {
  const kit = s.setup.teams[p.team].kit;
  const fill = p.role === "GK" ? GK_KITS[p.team] : kit.primary;
  // Dark rim so every kit stands out from the grass.
  ctx.fillStyle = "rgba(5,10,15,0.85)";
  ctx.beginPath();
  ctx.arc(x, y, r * 1.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.strokeStyle = p.role === "GK" ? "#111827" : kit.secondary;
  ctx.lineWidth = Math.max(1.5, r * 0.22);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Facing notch.
  ctx.fillStyle = p.role === "GK" ? "#111827" : kit.secondary;
  ctx.beginPath();
  ctx.arc(x + p.fx * r * 0.62, y + p.fy * r * 0.62, r * 0.26, 0, Math.PI * 2);
  ctx.fill();
  if (p.stun > 0) {
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    circle(ctx, x, y, r * 1.25, false);
  }
}

const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
};

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: boolean) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  } else ctx.stroke();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
