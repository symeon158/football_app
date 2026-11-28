"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { LiveEvent } from "@/lib/engine/live";
import { Director, highlightFor, PITCH, type Agent, type Side, type Slot } from "@/lib/match3d/director";
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
  speed: number; // 1 = normal, 3 = fast
  paused: boolean;
  started: boolean;
  /** Events before this index were already seen (e.g. after a reload) and are not replayed. */
  skipBefore: number;
  onBusy: (busy: boolean) => void;
  /** How many events may be shown in the scoreboard/commentary (no spoilers before a scene's outcome). */
  onReveal: (count: number) => void;
};

type Banner = { id: number; text: string; tone: "goal" | "save" | "miss" } | null;

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
  const [muted, setMuted] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

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
        camera={{ position: [0, 26, 40], fov: 40, near: 0.5, far: 500 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        aria-label="3D match view"
      >
        <Scene director={director} propsRef={propsRef} sound={sound} setBanner={setBanner} homeColor={props.homeColor} awayColor={props.awayColor} />
      </Canvas>

      {banner && (
        <div className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center">
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
  homeColor,
  awayColor,
}: {
  director: Director;
  propsRef: React.RefObject<ArenaProps>;
  sound: MatchSound;
  setBanner: (b: Banner) => void;
  homeColor: string;
  awayColor: string;
}) {
  const textures = useMemo(
    () => ({ pitch: pitchTexture(), ball: ballTexture(), crowd: crowdTexture([homeColor, awayColor, "#ffffff", "#facc15"]), boards: boardTexture() }),
    [homeColor, awayColor],
  );

  // Event → scene bookkeeping (refs: this runs every frame).
  const book = useRef({ next: -1, played: 0, waitingOutcome: -1, revealed: -1, busy: false, bannerUntil: 0, lastOutcomes: 0, scenes: [] as string[], half2: false });

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
        b.scenes.push(h.kind);
        b.played++;
        b.waitingOutcome = b.next;
        b.next++;
        break;
      }
      if (e.type === "half_time") {
        director.kickoff("away");
        sound.play("whistle-long");
        b.half2 = true;
      } else if (e.type === "full_time") {
        sound.play("whistle-long");
      } else if (e.type === "yellow_card" || e.type === "red_card") {
        sound.play("whistle");
      }
      b.next++;
      b.revealed = b.next;
      p.onReveal(b.revealed);
    }

    director.step(p.paused || !p.started ? 0 : dt * (p.speed > 1 ? 2.2 : 1), p.possession);
    for (const cue of director.takeCues()) sound.play(cue);

    // A scene reached its outcome: reveal its event (and celebrate).
    if (director.outcomes > b.lastOutcomes) {
      const kind = b.scenes[b.lastOutcomes];
      b.lastOutcomes = director.outcomes;
      if (b.waitingOutcome >= 0) {
        b.revealed = b.waitingOutcome + 1;
        b.waitingOutcome = -1;
        p.onReveal(b.revealed);
      }
      const t = state.clock.elapsedTime;
      b.bannerUntil = t + (kind === "goal" ? 2.6 : 1.4);
      const id = director.outcomes;
      setBanner(kind === "goal" ? { id, text: "Goal!", tone: "goal" } : kind === "save" ? { id, text: "Saved!", tone: "save" } : kind === "blocked" ? { id, text: "Blocked!", tone: "miss" } : { id, text: "So close!", tone: "miss" });
    } else if (b.bannerUntil && state.clock.elapsedTime > b.bannerUntil) {
      b.bannerUntil = 0;
      setBanner(null);
    }

    if (director.busy !== b.busy) {
      b.busy = director.busy;
      p.onBusy(director.busy);
    }
  });

  return (
    <>
      <color attach="background" args={["#0b1a33"]} />
      <fog attach="fog" args={["#0b1a33", 110, 260]} />
      <hemisphereLight args={["#dbeafe", "#14532d", 1.25]} />
      <directionalLight position={[20, 60, 30]} intensity={1.7} />
      <directionalLight position={[-30, 40, -20]} intensity={0.5} />

      <Stadium textures={textures} director={director} />
      {director.agents.map((a) => (
        <Player key={`${a.side}${a.index}`} agent={a} kit={a.side === "home" ? homeColor : awayColor} />
      ))}
      <BallMesh director={director} texture={textures.ball} />
      <NameTag director={director} propsRef={propsRef} />
      <Confetti director={director} />
      <CameraRig director={director} />
    </>
  );
}

/* ============================================================== stadium */

function Stadium({ textures, director }: { textures: { pitch: THREE.Texture; crowd: THREE.Texture; boards: THREE.Texture }; director: Director }) {
  const crowd = useRef<THREE.Group>(null);
  useFrame((state) => {
    // The crowd jumps when a goal goes in.
    if (crowd.current) crowd.current.position.y = director.sinceGoal < 3 ? Math.abs(Math.sin(state.clock.elapsedTime * 10)) * 0.5 : 0;
  });
  const L = PITCH.halfLength, W = PITCH.halfWidth;
  return (
    <group>
      {/* surroundings and pitch */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[260, 200]} />
        <meshStandardMaterial color="#14532d" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[117, 80]} />
        <meshStandardMaterial map={textures.pitch} roughness={0.95} />
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

      <Goal x={-L} />
      <Goal x={L} />
    </group>
  );
}

function Goal({ x }: { x: number }) {
  const d = Math.sign(x);
  const H = PITCH.goalHeight, G = PITCH.goalHalf, depth = 2.2;
  const post = <meshStandardMaterial color="#ffffff" roughness={0.3} />;
  return (
    <group position={[x, 0, 0]}>
      {[-G, G].map((z) => (
        <mesh key={z} position={[0, H / 2, z]}>
          <cylinderGeometry args={[0.1, 0.1, H, 10]} />
          {post}
        </mesh>
      ))}
      <mesh position={[0, H, 0]} rotation={[Math.PI / 2, 0, 0]}>
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

function Player({ agent, kit }: { agent: Agent; kit: string }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null), legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null), armR = useRef<THREE.Group>(null);
  const seed = agent.index * 7 + (agent.side === "home" ? 0 : 3);
  const skin = SKIN[seed % SKIN.length], hair = HAIR[(seed * 3) % HAIR.length];
  const shirt = agent.isKeeper ? (agent.side === "home" ? "#facc15" : "#22c55e") : kit;
  const shorts = agent.isKeeper ? "#111827" : agent.side === "home" ? "#ffffff" : "#1f2937";
  const ink = agent.isKeeper || agent.side === "away" ? "#111827" : "#ffffff";
  const number = useMemo(() => numberTexture(agent.number, ink), [agent.number, ink]);

  useFrame((state) => {
    if (!root.current || !body.current) return;
    const t = state.clock.elapsedTime + seed;
    const speed = Math.hypot(agent.vel.x, agent.vel.z);
    root.current.position.set(agent.pos.x, 0, agent.pos.z);
    root.current.rotation.y = agent.facing;
    const run = Math.min(1, speed / 4);
    const swing = Math.sin(t * (7 + speed * 0.9)) * run * 0.9;
    if (legL.current && legR.current) { legL.current.rotation.z = swing; legR.current.rotation.z = -swing; }
    if (armL.current && armR.current) {
      if (agent.celebrate) {
        armL.current.rotation.set(-2.7, 0, 0);
        armR.current.rotation.set(2.7, 0, 0);
      } else {
        armL.current.rotation.set(0, 0, -swing * 0.8);
        armR.current.rotation.set(0, 0, swing * 0.8);
      }
    }
    // Bounce while running, jump when celebrating, dive when saving.
    body.current.position.y = agent.celebrate ? Math.abs(Math.sin(t * 9)) * 0.9 : Math.abs(Math.sin(t * (7 + speed))) * run * 0.12;
    body.current.rotation.x += ((agent.dive ? agent.dive * 1.35 : 0) - body.current.rotation.x) * 0.2;
  });

  return (
    <group ref={root} scale={1.35}>
      {/* soft shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.55, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <group ref={body}>
        {/* legs (pivot at the hip) */}
        {[[legL, 0.17], [legR, -0.17]].map(([ref, z], i) => (
          <group key={i} ref={ref as React.RefObject<THREE.Group>} position={[0, 0.9, z as number]}>
            <mesh position={[0, -0.32, 0]}>
              <capsuleGeometry args={[0.12, 0.42, 4, 8]} />
              <meshStandardMaterial color={skin} />
            </mesh>
            <mesh position={[0, -0.62, 0]}>
              <cylinderGeometry args={[0.13, 0.13, 0.3, 8]} />
              <meshStandardMaterial color={shirt} />
            </mesh>
            <mesh position={[0.07, -0.84, 0]}>
              <boxGeometry args={[0.36, 0.13, 0.2]} />
              <meshStandardMaterial color="#111827" />
            </mesh>
          </group>
        ))}
        {/* shorts and shirt */}
        <mesh position={[0, 1.0, 0]}>
          <cylinderGeometry args={[0.33, 0.3, 0.32, 12]} />
          <meshStandardMaterial color={shorts} />
        </mesh>
        <mesh position={[0, 1.45, 0]}>
          <capsuleGeometry args={[0.34, 0.42, 4, 12]} />
          <meshStandardMaterial color={shirt} />
        </mesh>
        <mesh position={[-0.35, 1.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[0.45, 0.45]} />
          <meshBasicMaterial map={number} transparent />
        </mesh>
        {/* arms (pivot at the shoulder) */}
        {[[armL, 0.42], [armR, -0.42]].map(([ref, z], i) => (
          <group key={i} ref={ref as React.RefObject<THREE.Group>} position={[0, 1.68, z as number]}>
            <mesh position={[0, -0.28, 0]}>
              <capsuleGeometry args={[0.09, 0.36, 4, 8]} />
              <meshStandardMaterial color={shirt} />
            </mesh>
            <mesh position={[0, -0.56, 0]}>
              <sphereGeometry args={[0.09, 8, 8]} />
              <meshStandardMaterial color={agent.isKeeper ? "#f97316" : skin} />
            </mesh>
          </group>
        ))}
        {/* head */}
        <mesh position={[0, 2.08, 0]}>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshStandardMaterial color={skin} />
        </mesh>
        <mesh position={[-0.03, 2.16, 0]} scale={[1, 0.7, 1]}>
          <sphereGeometry args={[0.31, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={hair} />
        </mesh>
        {/* eyes, so the face points the way they run */}
        {[0.1, -0.1].map((z) => (
          <mesh key={z} position={[0.27, 2.1, z]}>
            <sphereGeometry args={[0.045, 8, 8]} />
            <meshBasicMaterial color="#111827" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ================================================== ball, tag, confetti */

function BallMesh({ director, texture }: { director: Director; texture: THREE.Texture }) {
  const ball = useRef<THREE.Mesh>(null);
  const shadow = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const b = director.ball;
    if (ball.current) {
      ball.current.position.set(b.pos.x, b.y + 0.3, b.pos.z);
      ball.current.rotation.z = -b.spin;
    }
    if (shadow.current) {
      shadow.current.position.set(b.pos.x, 0.03, b.pos.z);
      const s = 1 / (1 + b.y * 0.25);
      shadow.current.scale.set(s, s, s);
    }
  });
  return (
    <>
      <mesh ref={ball}>
        <sphereGeometry args={[0.38, 24, 16]} />
        <meshStandardMaterial map={texture} roughness={0.4} />
      </mesh>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.42, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </>
  );
}

function NameTag({ director, propsRef }: { director: Director; propsRef: React.RefObject<ArenaProps> }) {
  const sprite = useRef<THREE.Sprite>(null);
  const current = useRef<string>("");
  useFrame(() => {
    const s = sprite.current;
    if (!s) return;
    const c = director.carrier();
    s.visible = Boolean(c) && propsRef.current.started;
    if (!c) return;
    s.position.set(c.pos.x, 4.6, c.pos.z);
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
  useFrame((state) => {
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
    void state;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CONFETTI]} frustumCulled={false}>
      <planeGeometry args={[0.35, 0.22]} />
      <meshBasicMaterial side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/* =============================================================== camera */

function CameraRig({ director }: { director: Director }) {
  const look = useRef(new THREE.Vector3(0, 0, 0));
  const pos = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    const cam = state.camera;
    const b = director.ball.pos;
    const d = director.possession === "home" ? 1 : -1;
    const gx = d * PITCH.halfLength;
    switch (director.camera) {
      case "shot":
        target.set(gx - d * 9, 1, b.z * 0.4);
        pos.set(gx - d * 26, 9, b.z * 0.4 + 19);
        break;
      case "celebrate": {
        const party = director.agents.filter((a) => a.celebrate);
        const cx = party.length ? party.reduce((s, a) => s + a.pos.x, 0) / party.length : b.x;
        const cz = party.length ? party.reduce((s, a) => s + a.pos.z, 0) / party.length : b.z;
        target.set(cx, 1.5, cz);
        pos.set(cx - d * 10, 5.5, cz + (cz > 0 ? -11 : 11));
        break;
      }
      case "replay":
        target.set(b.x, director.ball.y + 0.5, b.z);
        pos.set(gx + d * 9, 3.2, b.z * 0.3 + 4);
        break;
      default:
        target.set(b.x * 0.92, 0, b.z * 0.5);
        pos.set(target.x, 24, target.z + 33);
    }
    const k = 1 - Math.exp(-Math.min(0.05, delta) * (director.camera === "broadcast" ? 2.4 : 3.5));
    cam.position.lerp(pos, k);
    look.current.lerp(target, k);
    cam.lookAt(look.current);
  });
  return null;
}
