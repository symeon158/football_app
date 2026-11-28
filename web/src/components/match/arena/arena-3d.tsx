"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { LiveEvent } from "@/lib/engine/live";
import { Director, highlightFor, KICK_TIME, PITCH, type Agent, type Highlight, type Side, type Slot } from "@/lib/match3d/director";
import { MatchSound } from "@/lib/match3d/sound";

import { ballTexture, boardTexture, crowdTexture, nameTagTexture, numberTexture, pitchTexture } from "./textures";

export type ArenaProps = {
  events: LiveEvent[]; // everything the server has revealed so far, in order
  clock: number;
  possession: Side;
  homeSlots: Slot[];
  awaySlots: Slot[];
  homeNames: string[];
  awayNames: string[];
  homeColor: string;
  awayColor: string;
  /** Team names and the (already revealed) score for the TV score graphic. */
  homeTeam: string;
  awayTeam: string;
  score: { home: number; away: number };
  speed: number; // 1 = normal, 3 = fast
  paused: boolean;
  started: boolean;
  /** Events before this index were already seen (e.g. after a reload) and are not replayed. */
  skipBefore: number;
  onBusy: (busy: boolean) => void;
  /** How many events may be shown in the scoreboard/commentary (no spoilers before a scene's outcome). */
  onReveal: (count: number) => void;
};

type Banner = { id: number; text: string; sub: string | null; tone: "goal" | "save" | "miss" } | null;

/** Players are drawn larger than life so they read well on a phone. */
const PLAYER_SCALE = 1.75;
/** Scene time per real second (the director's choreography) at normal and fast speed. */
const PACE = { normal: 1.25, fast: 2.4 };

/** Weaker devices (few CPU cores) skip real-time shadows. */
const highQuality = () => typeof navigator === "undefined" || (navigator.hardwareConcurrency ?? 8) > 4;

/** Three-letter team code for the score graphic ("Harbour Lions" → "HAR"). */
const code = (name: string) => (name.replace(/[^\p{L}]/gu, "").slice(0, 3) || name.slice(0, 3)).toUpperCase();

export default function Arena3D(props: ArenaProps) {
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });
  const director = useMemo(
    () => new Director(props.homeSlots, props.awaySlots, props.homeNames, props.awayNames),
    // The line-ups are fixed for the match; substitutes keep their slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const sound = useMemo(() => new MatchSound(), []);
  const shadows = useMemo(() => highQuality(), []);
  const [muted, setMuted] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [replay, setReplay] = useState(false);

  // Browsers only allow audio after a user gesture: start on the first click/tap/key.
  useEffect(() => {
    const start = () => sound.start();
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      sound.stop();
    };
  }, [sound]);

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-[#0b1a33]">
      <Canvas
        shadows={shadows ? "soft" : false}
        camera={{ position: [0, 18, 30], fov: 40, near: 0.5, far: 500 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        aria-label="3D match view"
      >
        <Scene director={director} propsRef={propsRef} sound={sound} setBanner={setBanner} setReplay={setReplay} homeColor={props.homeColor} awayColor={props.awayColor} shadows={shadows} />
      </Canvas>

      {/* TV score graphic */}
      {props.started && (
        <div className="pointer-events-none absolute left-2 top-2 flex items-stretch overflow-hidden rounded-md text-[11px] font-bold uppercase text-white shadow-lg sm:left-3 sm:top-3 sm:text-sm" aria-hidden>
          <span className="flex items-center gap-1.5 bg-slate-950/85 px-2 py-1">
            <i className="h-3 w-1 rounded-sm" style={{ background: props.homeColor }} />
            {code(props.homeTeam)}
          </span>
          <span key={`${props.score.home}-${props.score.away}`} className="bg-white px-2 py-1 tabular-nums text-slate-900 motion-safe:animate-in motion-safe:fade-in">
            {props.score.home}–{props.score.away}
          </span>
          <span className="flex items-center gap-1.5 bg-slate-950/85 px-2 py-1">
            {code(props.awayTeam)}
            <i className="h-3 w-1 rounded-sm" style={{ background: props.awayColor }} />
          </span>
          <span className="bg-emerald-600/90 px-2 py-1 tabular-nums">{props.clock}&apos;</span>
        </div>
      )}

      {replay && (
        <div className="pointer-events-none absolute right-12 top-2 rounded-md bg-red-600/90 px-2.5 py-1 text-[11px] font-black uppercase italic tracking-widest text-white shadow-lg motion-safe:animate-pulse sm:top-3 sm:text-sm">
          Replay
        </div>
      )}

      {banner && (
        <div className="pointer-events-none absolute inset-x-0 top-[28%] flex flex-col items-center gap-2">
          <span
            key={banner.id}
            className={
              banner.tone === "goal"
                ? "rounded-2xl bg-gradient-to-b from-yellow-300 to-amber-500 px-8 py-2 text-5xl font-black uppercase italic tracking-wider text-slate-900 shadow-[0_0_40px_rgba(250,204,21,0.7)] motion-safe:animate-in motion-safe:zoom-in-50 sm:text-7xl"
                : "rounded-xl bg-black/65 px-6 py-1.5 text-2xl font-black uppercase italic tracking-widest text-white motion-safe:animate-in motion-safe:zoom-in-75 sm:text-4xl"
            }
          >
            {banner.text}
          </span>
          {banner.sub && (
            <span key={`s${banner.id}`} className="rounded-lg bg-slate-950/80 px-4 py-1 text-sm font-bold text-white motion-safe:animate-in motion-safe:slide-in-from-bottom-2 motion-safe:fade-in sm:text-lg">
              {banner.sub}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          sound.start();
          sound.setMuted(!muted);
          setMuted(!muted);
        }}
        className="absolute right-2 top-2 rounded-full bg-black/55 p-2 text-white backdrop-blur hover:bg-black/70"
        aria-label={muted ? "Turn sound on" : "Mute sound"}
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>
    </div>
  );
}

/* ================================================================ scene */

function Scene({
  director,
  propsRef,
  sound,
  setBanner,
  setReplay,
  homeColor,
  awayColor,
  shadows,
}: {
  director: Director;
  propsRef: React.RefObject<ArenaProps>;
  sound: MatchSound;
  setBanner: (b: Banner) => void;
  setReplay: (on: boolean) => void;
  homeColor: string;
  awayColor: string;
  shadows: boolean;
}) {
  const textures = useMemo(
    () => ({ pitch: pitchTexture(), ball: ballTexture(), crowd: crowdTexture([homeColor, awayColor, "#ffffff", "#facc15"]), boards: boardTexture() }),
    [homeColor, awayColor],
  );

  // Event → scene bookkeeping (refs: this runs every frame).
  const book = useRef({ next: -1, waitingOutcome: -1, revealed: -1, busy: false, replay: false, bannerUntil: 0, lastOutcomes: 0, scenes: [] as Highlight[] });

  useFrame((state, delta) => {
    const p = propsRef.current;
    const b = book.current;
    const dt = Math.min(0.05, delta);
    if (b.next < 0) {
      // First frame: anything already seen before a reload is not acted out again.
      b.next = p.skipBefore;
      b.revealed = p.skipBefore;
      p.onReveal(b.revealed);
    }

    // Walk through newly revealed events in order. Scenes block the walk until their outcome.
    while (b.next < p.events.length && b.waitingOutcome < 0) {
      const e = p.events[b.next];
      const h = p.started ? highlightFor(e) : null;
      if (h) {
        director.play(h);
        b.scenes.push(h);
        b.waitingOutcome = b.next;
        b.next++;
        break;
      }
      if (e.type === "half_time") {
        director.kickoff("away");
        sound.play("whistle-long");
      } else if (e.type === "full_time") {
        sound.play("whistle-long");
      } else if (e.type === "yellow_card" || e.type === "red_card") {
        sound.play("whistle");
      }
      b.next++;
      b.revealed = b.next;
      p.onReveal(b.revealed);
    }

    director.step(p.paused || !p.started ? 0 : dt * (p.speed > 1 ? PACE.fast : PACE.normal), p.possession);
    for (const cue of director.takeCues()) sound.play(cue);

    // A scene reached its outcome: reveal its event (and celebrate).
    if (director.outcomes > b.lastOutcomes) {
      const h = b.scenes[b.lastOutcomes];
      b.lastOutcomes = director.outcomes;
      if (b.waitingOutcome >= 0) {
        b.revealed = b.waitingOutcome + 1;
        b.waitingOutcome = -1;
        p.onReveal(b.revealed);
      }
      const t = state.clock.elapsedTime;
      b.bannerUntil = t + (h?.kind === "goal" ? 2.4 : 1.3);
      const id = director.outcomes;
      if (h?.kind === "goal") setBanner({ id, text: h.penalty ? "Penalty goal!" : "Goal!", sub: h.scorer, tone: "goal" });
      else if (h?.kind === "save") setBanner({ id, text: "Saved!", sub: h.penalty ? "Penalty saved" : null, tone: "save" });
      else if (h?.kind === "blocked") setBanner({ id, text: "Blocked!", sub: null, tone: "miss" });
      else setBanner({ id, text: "So close!", sub: null, tone: "miss" });
    } else if (b.bannerUntil && state.clock.elapsedTime > b.bannerUntil) {
      b.bannerUntil = 0;
      setBanner(null);
    }

    const replaying = director.camera === "replay";
    if (replaying !== b.replay) {
      b.replay = replaying;
      setReplay(replaying);
    }
    if (director.busy !== b.busy) {
      b.busy = director.busy;
      p.onBusy(director.busy);
    }
  });

  return (
    <>
      <color attach="background" args={["#0b1a33"]} />
      <fog attach="fog" args={["#0b1a33", 120, 280]} />
      <hemisphereLight args={["#dbeafe", "#1f5130", 1.05]} />
      <directionalLight
        position={[28, 70, 32]}
        intensity={2.1}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-68}
        shadow-camera-right={68}
        shadow-camera-top={48}
        shadow-camera-bottom={-48}
        shadow-camera-near={10}
        shadow-camera-far={180}
      />
      <directionalLight position={[-30, 40, -20]} intensity={0.55} />

      <Stadium textures={textures} director={director} shadows={shadows} />
      {director.agents.map((a) => (
        <Player key={`${a.side}${a.index}`} agent={a} kit={a.side === "home" ? homeColor : awayColor} shadows={shadows} />
      ))}
      <BallMesh director={director} texture={textures.ball} shadows={shadows} />
      <BallTrail director={director} />
      <NameTag director={director} propsRef={propsRef} />
      <Confetti director={director} />
      <CameraRig director={director} />
    </>
  );
}

/* ============================================================== stadium */

function Stadium({ textures, director, shadows }: { textures: { pitch: THREE.Texture; crowd: THREE.Texture; boards: THREE.Texture }; director: Director; shadows: boolean }) {
  const crowd = useRef<THREE.Group>(null);
  useFrame((state) => {
    // The crowd jumps when a goal goes in, and sways a little the rest of the time.
    if (!crowd.current) return;
    const t = state.clock.elapsedTime;
    crowd.current.position.y = director.sinceGoal < 3 ? Math.abs(Math.sin(t * 10)) * 0.6 : Math.abs(Math.sin(t * 2.2)) * 0.06;
  });
  const L = PITCH.halfLength, W = PITCH.halfWidth;
  return (
    <group>
      {/* surroundings and pitch */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow={shadows}>
        <planeGeometry args={[260, 200]} />
        <meshStandardMaterial color="#14532d" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[117, 80]} />
        <meshStandardMaterial map={textures.pitch} roughness={0.92} />
      </mesh>

      {/* advertising boards */}
      {[
        { p: [0, 0.5, -W - 4] as const, r: 0, w: 116 },
        { p: [-L - 5, 0.5, 0] as const, r: Math.PI / 2, w: 76 },
        { p: [L + 5, 0.5, 0] as const, r: -Math.PI / 2, w: 76 },
      ].map((b, i) => (
        <mesh key={i} position={[...b.p]} rotation={[0, b.r, 0]}>
          <boxGeometry args={[b.w, 1, 0.2]} />
          <meshBasicMaterial map={textures.boards} />
        </mesh>
      ))}

      {/* stands full of supporters (far side and both ends) */}
      <group ref={crowd}>
        {[
          { p: [0, 7, -W - 14] as const, r: [-0.55, 0, 0] as const, w: 130 },
          { p: [-L - 15, 7, 0] as const, r: [-0.55, Math.PI / 2, 0] as const, w: 88 },
          { p: [L + 15, 7, 0] as const, r: [-0.55, -Math.PI / 2, 0] as const, w: 88 },
        ].map((s, i) => (
          <mesh key={i} position={[...s.p]} rotation={[...s.r]}>
            <planeGeometry args={[s.w, 18]} />
            <meshBasicMaterial map={textures.crowd} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 16, -W - 22]}>
        <boxGeometry args={[134, 1.2, 14]} />
        <meshStandardMaterial color="#334155" />
      </mesh>

      {/* dugouts on the near side */}
      {[-12, 12].map((x) => (
        <mesh key={x} position={[x, 1.1, W + 5]}>
          <boxGeometry args={[8, 2.2, 2.4]} />
          <meshStandardMaterial color="#1e293b" transparent opacity={0.85} />
        </mesh>
      ))}

      {/* floodlights */}
      {[[-L - 10, -W - 10], [L + 10, -W - 10], [-L - 10, W + 14], [L + 10, W + 14]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 16, 0]}>
            <cylinderGeometry args={[0.35, 0.5, 32, 8]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
          <mesh position={[0, 33, 0]} rotation={[0, Math.atan2(x, z), 0]}>
            <boxGeometry args={[6, 3, 0.6]} />
            <meshBasicMaterial color="#fffbe6" />
          </mesh>
        </group>
      ))}

      {/* corner flags */}
      {[[-L, -W], [L, -W], [-L, W], [L, W]].map(([x, z], i) => (
        <group key={`f${i}`} position={[x, 0, z]}>
          <mesh position={[0, 0.8, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 1.6, 6]} />
            <meshStandardMaterial color="#f8fafc" />
          </mesh>
          <mesh position={[0.25, 1.45, 0]}>
            <planeGeometry args={[0.5, 0.32]} />
            <meshBasicMaterial color="#facc15" side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}

      <Goal x={-L} shadows={shadows} />
      <Goal x={L} shadows={shadows} />
    </group>
  );
}

function Goal({ x, shadows }: { x: number; shadows: boolean }) {
  const d = Math.sign(x);
  const H = PITCH.goalHeight, G = PITCH.goalHalf, depth = 2.2;
  const post = <meshStandardMaterial color="#ffffff" roughness={0.3} />;
  return (
    <group position={[x, 0, 0]}>
      {[-G, G].map((z) => (
        <mesh key={z} position={[0, H / 2, z]} castShadow={shadows}>
          <cylinderGeometry args={[0.1, 0.1, H, 10]} />
          {post}
        </mesh>
      ))}
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow={shadows}>
        <cylinderGeometry args={[0.1, 0.1, G * 2 + 0.2, 10]} />
        {post}
      </mesh>
      {/* net: back, roof and sides */}
      <mesh position={[d * depth, H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[G * 2, H, 14, 6]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.55} />
      </mesh>
      <mesh position={[(d * depth) / 2, H, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[depth, G * 2, 3, 14]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.45} />
      </mesh>
      {[-G, G].map((z) => (
        <mesh key={`s${z}`} position={[(d * depth) / 2, H / 2, z]}>
          <planeGeometry args={[depth, H, 3, 6]} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

/* ============================================================== players */

const SKIN = ["#f1c7a5", "#e0ac85", "#c98e63", "#a8704a", "#7a4a2c", "#5b3720", "#f6dccb"];
const HAIR = ["#1c1917", "#3f2a1d", "#6b4423", "#a16207", "#d6b370", "#111827"];

/** Shared geometry for all 22 players (built once). Local space: the player faces +x, up is +y. */
const GEO = {
  shortLeg: new THREE.CylinderGeometry(0.165, 0.15, 0.26, 12),
  thigh: new THREE.CapsuleGeometry(0.125, 0.3, 4, 10),
  shin: new THREE.CapsuleGeometry(0.1, 0.32, 4, 10),
  boot: new THREE.BoxGeometry(0.34, 0.12, 0.17),
  hips: new THREE.CylinderGeometry(0.31, 0.29, 0.26, 14),
  torso: new THREE.CapsuleGeometry(0.3, 0.38, 6, 14),
  collar: new THREE.TorusGeometry(0.12, 0.035, 6, 16),
  neck: new THREE.CylinderGeometry(0.095, 0.11, 0.16, 10),
  head: new THREE.SphereGeometry(0.26, 20, 16),
  hairCap: new THREE.SphereGeometry(0.275, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
  afro: new THREE.SphereGeometry(0.32, 16, 12),
  mohawk: new THREE.BoxGeometry(0.44, 0.13, 0.08),
  ear: new THREE.SphereGeometry(0.055, 8, 6),
  eye: new THREE.SphereGeometry(0.036, 8, 6),
  brow: new THREE.BoxGeometry(0.02, 0.024, 0.09),
  sleeve: new THREE.CapsuleGeometry(0.1, 0.16, 4, 8),
  forearm: new THREE.CapsuleGeometry(0.075, 0.2, 4, 8),
  hand: new THREE.SphereGeometry(0.085, 10, 8),
  number: new THREE.PlaneGeometry(0.42, 0.42),
  badge: new THREE.PlaneGeometry(0.17, 0.17),
  blob: new THREE.CircleGeometry(0.6, 20),
};

type Limb = React.RefObject<THREE.Group | null>;
const smooth = (lo: number, hi: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

function Player({ agent, kit, shadows }: { agent: Agent; kit: string; shadows: boolean }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const thighL = useRef<THREE.Group>(null), thighR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null), kneeR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null), armR = useRef<THREE.Group>(null);
  const elbowL = useRef<THREE.Group>(null), elbowR = useRef<THREE.Group>(null);
  const anim = useRef({ gait: agent.seed, kickMax: KICK_TIME, lastKick: 0, dive: 0 });

  const seed = agent.index * 7 + (agent.side === "home" ? 0 : 3);
  const skin = SKIN[seed % SKIN.length], hair = HAIR[(seed * 3) % HAIR.length];
  const style = (seed * 5 + 1) % 5; // 0–1 short, 2 afro, 3 mohawk, 4 shaved
  const shirt = agent.isKeeper ? (agent.side === "home" ? "#facc15" : "#22c55e") : kit;
  const shorts = agent.isKeeper ? "#111827" : agent.side === "home" ? "#ffffff" : "#1f2937";
  const trim = agent.isKeeper ? "#111827" : agent.side === "home" ? "#ffffff" : "#111827";
  const socks = agent.isKeeper ? shirt : kit;
  const ink = agent.isKeeper || agent.side === "away" ? "#111827" : "#ffffff";
  const number = useMemo(() => numberTexture(agent.number, ink), [agent.number, ink]);
  const gloves = agent.isKeeper ? "#f97316" : skin;

  // Real-time shadows from every body part (except the soft contact shadow).
  useEffect(() => {
    root.current?.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== GEO.blob && o.geometry !== GEO.number && o.geometry !== GEO.badge) o.castShadow = shadows;
    });
  }, [shadows]);

  useFrame((state, delta) => {
    if (!root.current || !body.current || !torso.current) return;
    const dt = Math.min(0.05, delta);
    const A = anim.current;
    const t = state.clock.elapsedTime + seed;
    const speed = Math.hypot(agent.vel.x, agent.vel.z);
    root.current.position.set(agent.pos.x, 0, agent.pos.z);
    root.current.rotation.y = agent.facing;

    // Running gait: the stride quickens with speed; nothing moves when the match is paused.
    const moving = smooth(0.25, 1.4, speed);
    const run = Math.min(1, speed / 7.5);
    A.gait += dt * (moving > 0 ? 4.2 + speed * 1.05 : 0);
    const g = A.gait;
    const amp = (0.32 + 0.62 * run) * moving;
    let tl = Math.sin(g) * amp, tr = -Math.sin(g) * amp;
    let kl = -(0.12 + (0.35 + 1.0 * run) * Math.max(0, -Math.sin(g - 0.6))) * moving;
    let kr = -(0.12 + (0.35 + 1.0 * run) * Math.max(0, Math.sin(g - 0.6))) * moving;
    let al = { x: -0.12, z: -Math.sin(g) * amp * 0.85 }, ar = { x: 0.12, z: Math.sin(g) * amp * 0.85 };
    let el = 0.25 + 0.9 * run * moving, er = el;
    let lean = -0.2 * run * moving, twist = Math.sin(g) * 0.14 * run;
    let y = Math.abs(Math.cos(g)) * 0.07 * moving * (0.5 + run);
    let roll = 0;

    // Kicking (passes and shots): back-swing, then the strike through the ball.
    if (agent.kick > A.lastKick + 1e-4) A.kickMax = agent.kick;
    A.lastKick = agent.kick;
    if (agent.kick > 0) {
      const k = 1 - agent.kick / A.kickMax;
      if (k < 0.35) {
        const e = k / 0.35;
        tr = -0.85 * e;
        kr = -1.3 * e;
      } else {
        const e = 1 - (1 - (k - 0.35) / 0.65) ** 2;
        tr = -0.85 + 2.15 * e;
        kr = -1.3 * (1 - e);
      }
      tl = 0.12;
      kl = -0.25;
      al = { x: -1.1, z: 0.2 };
      ar = { x: 0.9, z: -0.3 };
      lean = k < 0.35 ? -0.12 : 0.12;
      twist = 0;
    }

    // Sliding tackle.
    if (agent.tackle > 0) {
      tl = 1.35; kl = -0.05;
      tr = 0.75; kr = -1.0;
      al = { x: -1.2, z: 0.6 }; ar = { x: 1.2, z: 0.6 };
      lean = 1.05;
      y = -0.12;
      twist = 0;
    }

    // Keeper dive: launch sideways, arms stretched above the head.
    A.dive += ((agent.dive ? 1 : 0) - A.dive) * Math.min(1, dt * 9);
    if (agent.isKeeper && A.dive > 0.02) {
      roll = (agent.dive || Math.sign(body.current.rotation.x) || 1) * 1.3 * A.dive;
      y = 0.5 * A.dive;
      al = { x: -0.3, z: 3.0 * A.dive };
      ar = { x: 0.3, z: 3.0 * A.dive };
      el = 0.1;
      er = 0.1;
      tl = 0.3 * A.dive; tr = -0.2 * A.dive;
    }

    // Celebrations: the scorer knee-slides, team-mates jump, fly like a plane or punch the air.
    if (agent.star) {
      tl = 0.15; kl = -1.55; tr = 0.15; kr = -1.55;
      y = -0.42;
      lean = 0.38;
      al = { x: -1.75, z: 0.5 }; ar = { x: 1.75, z: 0.5 };
      el = 0.1; er = 0.1;
      twist = 0;
    } else if (agent.celebrate) {
      const v = agent.index % 3;
      if (v === 0) {
        y = Math.abs(Math.sin(t * 8)) * 0.75;
        al = { x: -0.4, z: 2.9 }; ar = { x: 0.4, z: 2.9 };
        el = 0.2; er = 0.2;
        kl = kr = -0.5 * Math.abs(Math.cos(t * 8));
      } else if (v === 1) {
        al = { x: -1.55, z: 0 }; ar = { x: 1.55, z: 0 };
        el = 0; er = 0;
      } else {
        ar = { x: 0.2, z: 2.6 + Math.sin(t * 10) * 0.35 };
        er = 0.6;
        y += Math.abs(Math.sin(t * 5)) * 0.25;
      }
    }

    const set = (r: Limb, z: number, x = 0) => r.current?.rotation.set(x, 0, z);
    set(thighL, tl); set(thighR, tr);
    set(kneeL, kl); set(kneeR, kr);
    set(armL, al.z, al.x); set(armR, ar.z, ar.x);
    set(elbowL, el); set(elbowR, er);
    torso.current.rotation.set(0, twist, 0);
    body.current.position.y += (y - body.current.position.y) * Math.min(1, dt * 18);
    body.current.rotation.z += (lean - body.current.rotation.z) * Math.min(1, dt * 12);
    body.current.rotation.x += (roll - body.current.rotation.x) * Math.min(1, dt * 12);
  });

  const leg = (thigh: Limb, knee: Limb, z: number) => (
    <group ref={thigh} position={[0, 0.92, z]}>
      <mesh geometry={GEO.shortLeg} position={[0, -0.08, 0]}>
        <meshStandardMaterial color={shorts} roughness={0.7} />
      </mesh>
      <mesh geometry={GEO.thigh} position={[0, -0.27, 0]}>
        <meshStandardMaterial color={skin} roughness={0.6} />
      </mesh>
      <group ref={knee} position={[0, -0.46, 0]}>
        <mesh geometry={GEO.shin} position={[0, -0.2, 0]}>
          <meshStandardMaterial color={socks} roughness={0.75} />
        </mesh>
        <mesh geometry={GEO.boot} position={[0.06, -0.42, 0]}>
          <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.1} />
        </mesh>
      </group>
    </group>
  );
  const arm = (shoulder: Limb, elbow: Limb, z: number) => (
    <group ref={shoulder} position={[0, 0.72, z]}>
      <mesh geometry={GEO.sleeve} position={[0, -0.12, 0]}>
        <meshStandardMaterial color={shirt} roughness={0.7} />
      </mesh>
      <group ref={elbow} position={[0, -0.3, 0]}>
        <mesh geometry={GEO.forearm} position={[0, -0.14, 0]}>
          <meshStandardMaterial color={agent.isKeeper ? shirt : skin} roughness={0.6} />
        </mesh>
        <mesh geometry={GEO.hand} position={[0, -0.31, 0]}>
          <meshStandardMaterial color={gloves} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );

  return (
    <group ref={root} scale={PLAYER_SCALE}>
      {/* soft contact shadow */}
      <mesh geometry={GEO.blob} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <meshBasicMaterial color="#000000" transparent opacity={shadows ? 0.2 : 0.3} depthWrite={false} />
      </mesh>
      <group ref={body}>
        {leg(thighL, kneeL, 0.15)}
        {leg(thighR, kneeR, -0.15)}
        <mesh geometry={GEO.hips} position={[0, 0.98, 0]}>
          <meshStandardMaterial color={shorts} roughness={0.7} />
        </mesh>
        <group ref={torso} position={[0, 1.05, 0]}>
          <mesh geometry={GEO.torso} position={[0, 0.38, 0]} scale={[0.78, 1, 1.08]}>
            <meshStandardMaterial color={shirt} roughness={0.65} />
          </mesh>
          {/* number on the back, crest on the chest */}
          <mesh geometry={GEO.number} position={[-0.245, 0.45, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <meshBasicMaterial map={number} transparent />
          </mesh>
          <mesh geometry={GEO.badge} position={[0.245, 0.62, 0.14]} rotation={[0, Math.PI / 2, 0]}>
            <meshBasicMaterial color={trim} />
          </mesh>
          <mesh geometry={GEO.collar} position={[0, 0.86, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <meshStandardMaterial color={trim} />
          </mesh>
          <mesh geometry={GEO.neck} position={[0, 0.92, 0]}>
            <meshStandardMaterial color={skin} />
          </mesh>
          {arm(armL, elbowL, 0.4)}
          {arm(armR, elbowR, -0.4)}
          {/* head */}
          <group position={[0, 1.15, 0]}>
            <mesh geometry={GEO.head}>
              <meshStandardMaterial color={skin} roughness={0.55} />
            </mesh>
            {[0.25, -0.25].map((z) => (
              <mesh key={z} geometry={GEO.ear} position={[0, 0, z]}>
                <meshStandardMaterial color={skin} />
              </mesh>
            ))}
            {style <= 1 && (
              <mesh geometry={GEO.hairCap} position={[-0.02, 0.03, 0]} rotation={[0, 0, style === 1 ? 0.25 : 0.1]}>
                <meshStandardMaterial color={hair} roughness={0.9} />
              </mesh>
            )}
            {style === 2 && (
              <mesh geometry={GEO.afro} position={[-0.05, 0.1, 0]} scale={[1, 0.85, 1]}>
                <meshStandardMaterial color={hair} roughness={1} />
              </mesh>
            )}
            {style === 3 && (
              <>
                <mesh geometry={GEO.hairCap} position={[-0.02, 0.01, 0]} scale={0.97}>
                  <meshStandardMaterial color={skin} roughness={0.8} />
                </mesh>
                <mesh geometry={GEO.mohawk} position={[-0.03, 0.25, 0]}>
                  <meshStandardMaterial color={hair} roughness={0.9} />
                </mesh>
              </>
            )}
            {style === 4 && (
              <mesh geometry={GEO.hairCap} position={[-0.01, 0.01, 0]} scale={0.98}>
                <meshStandardMaterial color={hair} roughness={1} transparent opacity={0.55} />
              </mesh>
            )}
            {/* eyes and brows, so the face points the way they run */}
            {[0.09, -0.09].map((z) => (
              <group key={z}>
                <mesh geometry={GEO.eye} position={[0.225, 0.03, z]}>
                  <meshBasicMaterial color="#111827" />
                </mesh>
                <mesh geometry={GEO.brow} position={[0.24, 0.1, z]}>
                  <meshBasicMaterial color={hair} />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

/* ================================================== ball, tag, confetti */

const BALL_R = 0.4;

function BallMesh({ director, texture, shadows }: { director: Director; texture: THREE.Texture; shadows: boolean }) {
  const ball = useRef<THREE.Mesh>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const last = useRef<{ x: number; z: number } | null>(null);
  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), axis: new THREE.Vector3() }), []);
  useFrame(() => {
    const b = director.ball;
    const m = ball.current;
    if (m) {
      m.position.set(b.pos.x, b.y + BALL_R - 0.11, b.pos.z);
      // Roll: rotate about the axis perpendicular to the direction of travel.
      if (last.current) {
        const dx = b.pos.x - last.current.x, dz = b.pos.z - last.current.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-4 && d < 5) {
          tmp.axis.set(dz / d, 0, -dx / d);
          tmp.q.setFromAxisAngle(tmp.axis, d / BALL_R);
          m.quaternion.premultiply(tmp.q);
        }
      }
      last.current = { x: b.pos.x, z: b.pos.z };
    }
    if (shadow.current) {
      shadow.current.position.set(b.pos.x, 0.03, b.pos.z);
      const s = 1 / (1 + b.y * 0.25);
      shadow.current.scale.set(s, s, s);
    }
  });
  return (
    <>
      <mesh ref={ball} castShadow={shadows}>
        <sphereGeometry args={[BALL_R, 28, 18]} />
        <meshStandardMaterial map={texture} roughness={0.35} />
      </mesh>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.45, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </>
  );
}

const TRAIL = 14;
/** A glowing streak behind the ball on shots. */
function BallTrail({ director }: { director: Director }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const hist = useRef<{ x: number; y: number; z: number }[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const b = director.ball;
    const h = hist.current;
    if (director.ballFast) h.unshift({ x: b.pos.x, y: b.y + BALL_R - 0.11, z: b.pos.z });
    else h.pop(); // fade out
    if (h.length > TRAIL) h.length = TRAIL;
    m.visible = h.length > 1;
    if (!m.visible) return;
    for (let i = 0; i < TRAIL; i++) {
      const p = h[i] ?? h[h.length - 1];
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(i < h.length ? (1 - i / TRAIL) * 0.9 : 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, TRAIL]} frustumCulled={false}>
      <sphereGeometry args={[BALL_R, 10, 8]} />
      <meshBasicMaterial color="#fff3c4" transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} />
    </instancedMesh>
  );
}

function NameTag({ director, propsRef }: { director: Director; propsRef: React.RefObject<ArenaProps> }) {
  const sprite = useRef<THREE.Sprite>(null);
  const current = useRef<string>("");
  useFrame(() => {
    const s = sprite.current;
    if (!s) return;
    const c = director.carrier();
    s.visible = Boolean(c) && propsRef.current.started && director.camera !== "replay";
    if (!c) return;
    s.position.set(c.pos.x, 2.5 * PLAYER_SCALE + 1.3, c.pos.z);
    const key = `${c.side}${c.index}`;
    if (key !== current.current) {
      current.current = key;
      const color = c.side === "home" ? propsRef.current.homeColor : propsRef.current.awayColor;
      (s.material as THREE.SpriteMaterial).map = nameTagTexture(c.name, color);
      (s.material as THREE.SpriteMaterial).needsUpdate = true;
    }
  });
  return (
    <sprite ref={sprite} scale={[7, 1.5, 1]}>
      <spriteMaterial transparent depthTest={false} />
    </sprite>
  );
}

const CONFETTI = 260;
function Confetti({ director }: { director: Director }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(
    () => Array.from({ length: CONFETTI }, (_, i) => ({ x: (Math.sin(i * 12.9898) * 43758.5453) % 1, z: (Math.sin(i * 78.233) * 12345.678) % 1, v: 0.6 + ((i * 37) % 100) / 100, r: i * 0.7 })),
    [],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const palette = ["#facc15", "#22c55e", "#3b82f6", "#ef4444", "#ffffff", "#a855f7", "#f97316"].map((c) => new THREE.Color(c));
    for (let i = 0; i < CONFETTI; i++) m.setColorAt(i, palette[i % palette.length]);
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const t = director.sinceGoal;
    m.visible = t < 4.5;
    if (!m.visible) return;
    const cx = director.ball.pos.x;
    seeds.forEach((s, i) => {
      dummy.position.set(cx + s.x * 22, 18 - t * 4.2 * s.v + Math.sin(t * 3 + s.r) * 0.6, s.z * 18);
      dummy.rotation.set(t * 5 + s.r, t * 3 + s.r, 0);
      dummy.scale.setScalar(t < 4 ? 1 : 1 - (t - 4) * 2);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CONFETTI]} frustumCulled={false}>
      <planeGeometry args={[0.35, 0.22]} />
      <meshBasicMaterial side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/* =============================================================== camera */

/**
 * TV-style camera: the main camera tracks play from the stand, leaning ahead in the direction of
 * attack and zooming in near the box; shots cut tighter, celebrations close, replays from behind
 * the goal. A short shake when the ball hits the net.
 */
function CameraRig({ director }: { director: Director }) {
  const look = useRef(new THREE.Vector3(0, 0, 0));
  const lead = useRef(0);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    const dt = Math.min(0.05, delta);
    const cam = state.camera;
    const b = director.ball.pos;
    const d = director.possession === "home" ? 1 : -1;
    const gx = d * PITCH.halfLength;
    switch (director.camera) {
      case "shot":
        target.set(gx - d * 8, 1.2, b.z * 0.4);
        pos.set(gx - d * 21, 6.5, b.z * 0.4 + 15);
        break;
      case "celebrate": {
        const party = director.agents.filter((a) => a.celebrate);
        const cx = party.length ? party.reduce((s, a) => s + a.pos.x, 0) / party.length : b.x;
        const cz = party.length ? party.reduce((s, a) => s + a.pos.z, 0) / party.length : b.z;
        target.set(cx, 2, cz);
        pos.set(cx - d * 11, 6.5, cz + (cz > 0 ? -13 : 13));
        break;
      }
      case "replay":
        target.set(b.x, director.ball.y + 0.8, b.z);
        pos.set(gx + d * 8.5, 3.4, b.z * 0.3 + 4);
        break;
      default: {
        lead.current += (d * 6 - lead.current) * Math.min(1, dt * 0.8);
        const third = Math.max(0, Math.min(1, (Math.abs(b.x) - 18) / 28));
        const zoom = 1 - 0.16 * third;
        target.set(Math.max(-44, Math.min(44, b.x * 0.92 + lead.current)), 0.5, b.z * 0.45);
        pos.set(target.x, 16 * zoom, target.z + 27 * zoom);
      }
    }
    const k = 1 - Math.exp(-dt * (director.camera === "broadcast" ? 2.2 : 3.4));
    cam.position.lerp(pos, k);
    look.current.lerp(target, k);
    if (director.sinceGoal < 0.7) {
      const s = (1 - director.sinceGoal / 0.7) * 0.22;
      const t = state.clock.elapsedTime;
      cam.position.x += Math.sin(t * 47) * s;
      cam.position.y += Math.sin(t * 61) * s;
    }
    cam.lookAt(look.current);
  });
  return null;
}
