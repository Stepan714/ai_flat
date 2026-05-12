"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FullScreenScene } from "@/components/three/FullScreenScene";
import {
  RoomControlsPanel,
  type RoomDims,
  type SceneColors,
} from "@/components/controls/RoomControlsPanel";
import type {
  FurnitureItem,
  FurnitureType,
} from "@/components/three/furniture/types";
import { isFurnitureType } from "@/components/three/furniture/types";
import {
  DEFAULT_FURNITURE_APPEARANCE,
  type FurnitureAppearance,
} from "@/components/three/furniture/appearance";
import {
  FURNITURE_CATALOG,
  FURNITURE_CATALOG_MAP,
} from "@/components/three/furniture/catalog";
import type { GenerateLayoutResponse, LayoutStyle } from "@/lib/layout/types";
import { applyGeneratedLayout } from "@/lib/layout/applyLayout";

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeYaw(y: number) {
  const twoPi = Math.PI * 2;
  let out = y % twoPi;
  if (out < 0) out += twoPi;
  return out;
}

function getFootprint(type: FurnitureType) {
  return FURNITURE_CATALOG_MAP.get(type)?.footprint ?? { width: 1, depth: 1, height: 1 };
}

function getFurnitureLabel(type: FurnitureType) {
  return FURNITURE_CATALOG_MAP.get(type)?.label ?? type;
}

function getHalfExtents(type: FurnitureType, yaw: number) {
  const fp = getFootprint(type);
  const quarterTurn = Math.abs(Math.sin(normalizeYaw(yaw)));
  const swapped = quarterTurn > 0.707;
  return swapped
    ? { halfX: fp.depth / 2, halfZ: fp.width / 2 }
    : { halfX: fp.width / 2, halfZ: fp.depth / 2 };
}

function getWallMountedPose(
  type: FurnitureType,
  room: RoomDims,
  existing: FurnitureItem[],
): { x: number; y: number; z: number; yaw: number } {
  const meta = FURNITURE_CATALOG_MAP.get(type);
  const fp = getFootprint(type);
  const halfW = room.width / 2;
  const halfL = room.length / 2;
  const inset = Math.max(0.03, fp.depth / 2 + 0.01);
  const defaultY = Math.min(room.height - fp.height / 2 - 0.05, Math.max(1.2, room.height * 0.58));
  const y = meta?.opening
    ? Math.max(0.05, Math.min(room.height - meta.opening.height / 2 - 0.02, meta.opening.sill + meta.opening.height / 2))
    : defaultY;

  const walls: Array<"front" | "back" | "left" | "right"> = ["front", "back", "left", "right"];
  const occupied = existing
    .filter((it) => FURNITURE_CATALOG_MAP.get(it.type)?.mount === "wall")
    .map((it) => ({
      item: it,
      fp: getFootprint(it.type),
    }));
  const side = walls[occupied.length % walls.length];
  const span = side === "front" || side === "back" ? room.width : room.length;
  const slots = [0, -0.22, 0.22, -0.38, 0.38, -0.48, 0.48].map((k) => k * span);
  const mainExtent = Math.max(fp.width, fp.depth) * 0.5;
  let coord = 0;

  const collides = (c: number) =>
    occupied.some(({ item, fp: ofp }) => {
      const oSide = (() => {
        const x = item.position[0];
        const z = item.position[2];
        const dFront = Math.abs(z + halfL);
        const dBack = Math.abs(z - halfL);
        const dLeft = Math.abs(x + halfW);
        const dRight = Math.abs(x - halfW);
        const min = Math.min(dFront, dBack, dLeft, dRight);
        if (min === dFront) return "front";
        if (min === dBack) return "back";
        if (min === dLeft) return "left";
        return "right";
      })();
      if (oSide !== side) return false;
      const oCoord = oSide === "front" || oSide === "back" ? item.position[0] : item.position[2];
      const oExtent = Math.max(ofp.width, ofp.depth) * 0.5;
      return Math.abs(oCoord - c) < mainExtent + oExtent + 0.12;
    });

  for (const s of slots) {
    const c = Math.max(-span / 2 + mainExtent + 0.05, Math.min(span / 2 - mainExtent - 0.05, s));
    if (!collides(c)) {
      coord = c;
      break;
    }
  }

  if (side === "front") return { x: coord, y, z: -(halfL - inset), yaw: 0 };
  if (side === "back") return { x: coord, y, z: halfL - inset, yaw: Math.PI };
  if (side === "left") return { x: -(halfW - inset), y, z: coord, yaw: Math.PI / 2 };
  return { x: halfW - inset, y, z: coord, yaw: -Math.PI / 2 };
}

type RoomTransform = {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number]; // Euler radians
};

type ProjectSnapshot = {
  room: RoomDims;
  roomTransform: RoomTransform;
  furniture: FurnitureItem[];
  colors: SceneColors;
  furnitureAppearance: FurnitureAppearance;
};

export default function Home() {
  const studioRef = useRef<HTMLElement | null>(null);

  const [room, setRoom] = useState<RoomDims>({
    width: 6,
    length: 8,
    height: 3.2,
  });

  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [style, setStyle] = useState<LayoutStyle>("minimalism");
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [furnitureAppearance, setFurnitureAppearance] = useState<FurnitureAppearance>(
    DEFAULT_FURNITURE_APPEARANCE,
  );
  const [colors, setColors] = useState<SceneColors>({
    walls: "#f2f5fa",
    floor: "#f4f1e7",
    furniture: "#e6ebf2",
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState<string>("Ready");
  const [roomTransform, setRoomTransform] = useState<RoomTransform>({
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  });
  const [assist, setAssist] = useState({
    snapMove: true,
    moveGrid: 0.25,
    snapRotate: true,
    rotateStepDeg: 15,
  });
  const historyRef = useRef<{
    past: ProjectSnapshot[];
    future: ProjectSnapshot[];
    prev: ProjectSnapshot | null;
    applying: boolean;
  }>({
    past: [],
    future: [],
    prev: null,
    applying: false,
  });

  // Keep the studio centered on each full page mount.
  useEffect(() => {
    setRoomTransform({ position: [0, 0, 0], rotation: [0, 0, 0] });
  }, []);

  const currentSnapshot = useMemo<ProjectSnapshot>(
    () => ({
      room,
      roomTransform,
      furniture,
      colors,
      furnitureAppearance,
    }),
    [room, roomTransform, furniture, colors, furnitureAppearance],
  );

  useEffect(() => {
    const history = historyRef.current;
    if (!history.prev) {
      history.prev = currentSnapshot;
      return;
    }

    const prevKey = JSON.stringify(history.prev);
    const nextKey = JSON.stringify(currentSnapshot);
    if (prevKey === nextKey) return;

    if (!history.applying) {
      history.past.push(history.prev);
      if (history.past.length > 100) history.past.shift();
      history.future = [];
    }

    history.prev = currentSnapshot;
    history.applying = false;
  }, [currentSnapshot]);

  const applySnapshot = (snap: ProjectSnapshot) => {
    historyRef.current.applying = true;
    setRoom(snap.room);
    setRoomTransform(snap.roomTransform);
    setFurniture(snap.furniture);
    setColors(snap.colors);
    setFurnitureAppearance(snap.furnitureAppearance);
  };

  const undo = () => {
    const history = historyRef.current;
    if (!history.prev || history.past.length === 0) return;
    const target = history.past.pop();
    if (!target) return;
    history.future.push(history.prev);
    applySnapshot(target);
    setStatusText("Undo");
  };

  const redo = () => {
    const history = historyRef.current;
    if (!history.prev || history.future.length === 0) return;
    const target = history.future.pop();
    if (!target) return;
    history.past.push(history.prev);
    applySnapshot(target);
    setStatusText("Redo");
  };

  const exportProject = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      ...currentSnapshot,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-flat-project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusText("Project exported");
  };

  const importProject = (jsonText: string) => {
    try {
      const raw = JSON.parse(jsonText) as Record<string, unknown>;
      const nextRoom = raw.room as Partial<RoomDims> | undefined;
      const nextTransform = raw.roomTransform as
        | { position?: unknown; rotation?: unknown }
        | undefined;
      const nextFurnitureRaw = Array.isArray(raw.furniture) ? raw.furniture : [];
      const nextColors = raw.colors as Partial<SceneColors> | undefined;
      const nextAppearance = raw.furnitureAppearance as Partial<FurnitureAppearance> | undefined;

      const importedFurniture: FurnitureItem[] = nextFurnitureRaw
        .map((it) => it as Partial<FurnitureItem>)
        .filter(
          (it): it is Partial<FurnitureItem> & { type: FurnitureType } =>
            typeof it.type === "string" && isFurnitureType(it.type),
        )
        .map((it) => ({
          id: typeof it.id === "string" ? it.id : newId(),
          type: it.type,
          position:
            Array.isArray(it.position) && it.position.length === 3
              ? [Number(it.position[0]) || 0, Number(it.position[1]) || 0, Number(it.position[2]) || 0]
              : [0, 0, 0],
          rotation:
            Array.isArray(it.rotation) && it.rotation.length === 3
              ? [Number(it.rotation[0]) || 0, Number(it.rotation[1]) || 0, Number(it.rotation[2]) || 0]
              : [0, 0, 0],
          scale:
            typeof it.scale === "number" && Number.isFinite(it.scale)
              ? Math.max(0.2, Math.min(5, it.scale))
              : 1,
          color: typeof it.color === "string" ? it.color : undefined,
        }));

      applySnapshot({
        room: {
          width:
            typeof nextRoom?.width === "number" && Number.isFinite(nextRoom.width)
              ? nextRoom.width
              : room.width,
          length:
            typeof nextRoom?.length === "number" && Number.isFinite(nextRoom.length)
              ? nextRoom.length
              : room.length,
          height:
            typeof nextRoom?.height === "number" && Number.isFinite(nextRoom.height)
              ? nextRoom.height
              : room.height,
        },
        roomTransform: {
          position:
            Array.isArray(nextTransform?.position) && nextTransform.position.length === 3
              ? [
                  Number(nextTransform.position[0]) || 0,
                  Number(nextTransform.position[1]) || 0,
                  Number(nextTransform.position[2]) || 0,
                ]
              : roomTransform.position,
          rotation:
            Array.isArray(nextTransform?.rotation) && nextTransform.rotation.length === 3
              ? [
                  Number(nextTransform.rotation[0]) || 0,
                  Number(nextTransform.rotation[1]) || 0,
                  Number(nextTransform.rotation[2]) || 0,
                ]
              : roomTransform.rotation,
        },
        furniture: importedFurniture,
        colors: {
          walls: typeof nextColors?.walls === "string" ? nextColors.walls : colors.walls,
          floor: typeof nextColors?.floor === "string" ? nextColors.floor : colors.floor,
          furniture:
            typeof nextColors?.furniture === "string" ? nextColors.furniture : colors.furniture,
        },
        furnitureAppearance: {
          design: nextAppearance?.design ?? furnitureAppearance.design,
          material: nextAppearance?.material ?? furnitureAppearance.material,
        },
      });
      setStatusText(`Imported ${importedFurniture.length} objects`);
    } catch {
      setStatusText("Import failed: invalid JSON");
    }
  };

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }
      if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        undo();
        return;
      }
      if ((ev.metaKey || ev.ctrlKey) && ev.shiftKey && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const placeFurnitureSmart = (
    type: FurnitureType,
    existing: FurnitureItem[],
  ): { x: number; y: number; z: number; yaw: number } => {
    const meta = FURNITURE_CATALOG_MAP.get(type);
    if (meta?.mount === "wall") {
      return getWallMountedPose(type, room, existing);
    }

    const candidateYaws = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    // Keep only tiny technical margin so objects can be placed nearly flush.
    const margin = 0.005;
    const step = 0.4;
    const pref = FURNITURE_CATALOG_MAP.get(type)?.placement ?? "flex";

    const occupied = existing.map((it) => {
      const fp = getFootprint(it.type);
      const s = typeof it.scale === "number" ? Math.max(0.2, it.scale) : 1;
      const radius = Math.sqrt((fp.width * s * 0.5) ** 2 + (fp.depth * s * 0.5) ** 2);
      return { x: it.position[0], z: it.position[2], radius };
    });

    let best: { x: number; z: number; yaw: number; score: number } | null = null;
    const halfRoomX = room.width / 2;
    const halfRoomZ = room.length / 2;
    const corners = [
      { x: -halfRoomX, z: -halfRoomZ },
      { x: halfRoomX, z: -halfRoomZ },
      { x: -halfRoomX, z: halfRoomZ },
      { x: halfRoomX, z: halfRoomZ },
    ];

    for (const yaw of candidateYaws) {
      const { halfX, halfZ } = getHalfExtents(type, yaw);
      const minX = -halfRoomX + halfX + margin;
      const maxX = halfRoomX - halfX - margin;
      const minZ = -halfRoomZ + halfZ + margin;
      const maxZ = halfRoomZ - halfZ - margin;
      if (minX > maxX || minZ > maxZ) continue;

      for (let x = minX; x <= maxX; x += step) {
        for (let z = minZ; z <= maxZ; z += step) {
          const radius = Math.sqrt(halfX ** 2 + halfZ ** 2);
          let minGap = Number.POSITIVE_INFINITY;
          let overlap = false;
          for (const o of occupied) {
            const dx = x - o.x;
            const dz = z - o.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            const gap = d - (radius + o.radius);
            minGap = Math.min(minGap, gap);
            if (gap < 0) {
              overlap = true;
              break;
            }
          }
          if (overlap) continue;

          const wallDist = Math.min(maxX - x, x - minX, maxZ - z, z - minZ);
          const centerDist = Math.sqrt(x * x + z * z);
          const cornerDist = Math.min(
            ...corners.map((c) => Math.sqrt((x - c.x) ** 2 + (z - c.z) ** 2)),
          );

          let score = minGap * 2;
          if (pref === "wall") score += -wallDist * 2.2 - centerDist * 0.1;
          if (pref === "center") score += wallDist * 1.8 - centerDist * 0.3;
          if (pref === "corner") score += -cornerDist * 1.7;
          if (pref === "flex") score += -Math.abs(wallDist - 0.9);
          score += Math.random() * 0.02;

          if (!best || score > best.score) {
            best = { x, z, yaw, score };
          }
        }
      }
    }

    if (best) return { x: best.x, y: 0, z: best.z, yaw: best.yaw };
    return { x: 0, y: 0, z: 0, yaw: 0 };
  };

  const addFurniture = (type: FurnitureType) => {
    if (!FURNITURE_CATALOG_MAP.has(type)) {
      setStatusText(`Unknown furniture type: ${String(type)}`);
      return;
    }
    setFurniture((prev) => {
      const pos = placeFurnitureSmart(type, prev);
      const item: FurnitureItem = {
        id: newId(),
        type,
        position: [pos.x, pos.y, pos.z],
        rotation: [0, pos.yaw, 0],
        scale: 1,
      };
      return [...prev, item];
    });
    setStatusText(`Added ${getFurnitureLabel(type)} [${type}]`);
  };

  const smartAddFurniture = () => {
    const occupiedArea = furniture.reduce((acc, it) => {
      const fp = getFootprint(it.type);
      const s = typeof it.scale === "number" ? Math.max(0.2, it.scale) : 1;
      return acc + fp.width * s * fp.depth * s;
    }, 0);
    const roomArea = Math.max(1, room.width * room.length);
    const freeRatio = Math.max(0, 1 - occupiedArea / roomArea);
    const pool = FURNITURE_CATALOG.filter((it) => {
      const fp = it.footprint;
      const area = fp.width * fp.depth;
      if (freeRatio < 0.25) return area < 0.7;
      if (freeRatio < 0.45) return area < 1.5;
      return true;
    });
    const next = pool[Math.floor(Math.random() * pool.length)] ?? FURNITURE_CATALOG[0];
    addFurniture(next.type);
  };

  const generateAiLayout = async () => {
    try {
      setIsGenerating(true);
      setStatusText("Generating layout…");
      const res = await fetch("/api/generate-layout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room, style, prompt: aiPrompt }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const json = (await res.json()) as GenerateLayoutResponse;
      if (json.room) {
        setRoom((prev) => ({
          width:
            typeof json.room?.width === "number" && Number.isFinite(json.room.width)
              ? json.room.width
              : prev.width,
          length:
            typeof json.room?.length === "number" && Number.isFinite(json.room.length)
              ? json.room.length
              : prev.length,
          height:
            typeof json.room?.height === "number" && Number.isFinite(json.room.height)
              ? json.room.height
              : prev.height,
        }));
      }
      if (json.sceneColors) {
        setColors((prev) => ({
          walls:
            typeof json.sceneColors?.walls === "string"
              ? json.sceneColors.walls
              : prev.walls,
          floor:
            typeof json.sceneColors?.floor === "string"
              ? json.sceneColors.floor
              : prev.floor,
          furniture:
            typeof json.sceneColors?.furniture === "string"
              ? json.sceneColors.furniture
              : prev.furniture,
        }));
      }
      if (json.furnitureAppearance) {
        setFurnitureAppearance((prev) => ({
          design: json.furnitureAppearance?.design ?? prev.design,
          material: json.furnitureAppearance?.material ?? prev.material,
        }));
      }
      setFurniture(applyGeneratedLayout(json));
      setStatusText(`Applied ${json.objects?.length ?? 0} objects (${style})`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      {/* HERO (описание) */}
      <main className="relative min-h-screen overflow-hidden">
        {/* Soft premium gradients */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-56 left-1/2 h-[760px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.92),transparent_64%)]" />
          <div className="absolute -left-56 top-10 h-[680px] w-[680px] rounded-full bg-[radial-gradient(circle_at_center,rgba(10,132,255,0.30),transparent_64%)] opacity-[0.18]" />
          <div className="absolute -right-56 top-20 h-[700px] w-[700px] rounded-full bg-[radial-gradient(circle_at_center,rgba(175,82,222,0.30),transparent_64%)] opacity-[0.13]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,249,252,0.9),rgba(245,245,247,1))]" />
        </div>

        <div className="relative mx-auto flex min-h-screen max-w-[1320px] flex-col px-6 py-8 sm:px-10 sm:py-12">
          <header className="animate-premium-in flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-white/78 px-3 py-1 text-[11px] font-medium tracking-wide text-black/55 shadow-sm ring-1 ring-black/5 backdrop-blur">
                Spatial experience
              </div>
              <div className="text-sm font-medium tracking-wide text-black/65">
                AI Flat
              </div>
            </div>
            <div className="rounded-full bg-white/78 px-4 py-2 text-sm font-medium text-black/55 shadow-sm ring-1 ring-black/5 backdrop-blur">
              Three.js + AI
            </div>
          </header>

          <section className="mt-12 grid items-center gap-8 lg:grid-cols-12">
            <div className="animate-premium-in-delayed lg:col-span-7">
              <h1 className="text-balance text-[44px] font-semibold leading-[0.98] tracking-[-0.04em] text-black/90 sm:text-[70px]">
                Design spaces
                <br />
                that feel intentional.
              </h1>
              <p className="mt-6 max-w-[640px] text-pretty text-[18px] font-light leading-8 text-black/58 sm:text-[20px]">
                Apple-style 3D studio for room planning: cinematic lighting,
                fluid controls, instant object library, and AI-assisted layout
                generation in one clean workflow.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    studioRef.current?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="inline-flex h-11 items-center justify-center rounded-full bg-black px-6 text-sm font-medium text-white shadow-[0_14px_28px_rgba(0,0,0,0.24)] transition duration-300 ease-out hover:scale-[1.02]"
                >
                  Enter 3D Studio
                </button>
                <button
                  type="button"
                  onClick={() =>
                    studioRef.current?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="inline-flex h-11 items-center justify-center rounded-full bg-white/85 px-6 text-sm font-medium text-black/68 shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-300 ease-out hover:scale-[1.02]"
                >
                  Watch workflow
                </button>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl bg-white/70 p-4 shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-300 ease-out hover:scale-[1.02] hover:bg-white/80">
                  <div className="text-[11px] font-medium tracking-wide text-black/45">
                    Object Library
                  </div>
                  <div className="mt-1 text-lg font-semibold tracking-tight text-black/82">
                    20+ assets
                  </div>
                </div>
                <div className="rounded-3xl bg-white/70 p-4 shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-300 ease-out hover:scale-[1.02] hover:bg-white/80">
                  <div className="text-[11px] font-medium tracking-wide text-black/45">
                    Smart Placement
                  </div>
                  <div className="mt-1 text-lg font-semibold tracking-tight text-black/82">
                    collision-aware
                  </div>
                </div>
                <div className="rounded-3xl bg-white/70 p-4 shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-300 ease-out hover:scale-[1.02] hover:bg-white/80">
                  <div className="text-[11px] font-medium tracking-wide text-black/45">
                    Real-time Scene
                  </div>
                  <div className="mt-1 text-lg font-semibold tracking-tight text-black/82">
                    60 fps feel
                  </div>
                </div>
              </div>
            </div>

            <div className="animate-premium-in lg:col-span-5">
              <div className="relative mx-auto max-w-[500px] overflow-hidden rounded-[34px] border border-white/75 bg-[linear-gradient(165deg,rgba(255,255,255,0.82),rgba(255,255,255,0.58))] p-5 shadow-[0_34px_120px_rgba(12,20,38,0.16)] backdrop-blur-2xl">
                <div className="absolute -top-28 right-[-80px] h-[260px] w-[260px] rounded-full bg-[radial-gradient(circle,rgba(10,132,255,0.32),transparent_68%)]" />
                <div className="absolute -bottom-28 left-[-90px] h-[240px] w-[240px] rounded-full bg-[radial-gradient(circle,rgba(175,82,222,0.28),transparent_70%)]" />
                <div className="relative rounded-[24px] border border-black/[0.06] bg-[#edf1f8] p-4 shadow-inner">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[11px] font-medium tracking-wide text-black/45">
                      Live Preview
                    </div>
                    <div className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] font-medium text-black/45">
                      Interactive
                    </div>
                  </div>
                  <div className="relative h-[255px] overflow-hidden rounded-2xl border border-black/10 bg-[linear-gradient(180deg,#dfe7f2,#d7e0ec)]">
                    <div className="absolute left-1/2 top-[22%] h-[130px] w-[220px] -translate-x-1/2 rounded-[18px] border border-[#87a6cf]/60 bg-[#e9eef7]/65 shadow-[0_20px_45px_rgba(18,30,56,0.18)]" />
                    <div className="absolute left-1/2 top-[53%] h-[80px] w-[250px] -translate-x-1/2 -rotate-[4deg] rounded-[14px] border border-[#7e98bd]/55 bg-[#d4dff0]/75" />
                    <div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-white/65 px-3 py-2 text-[11px] text-black/50 backdrop-blur">
                      Drag furniture, tune colors, and generate layout instantly.
                    </div>
                  </div>
                </div>
                <div className="relative mt-4 grid grid-cols-3 gap-2">
                  {["Lighting", "Smart Add", "Apple UI"].map((chip) => (
                    <div
                      key={chip}
                      className="rounded-2xl bg-white/70 px-3 py-2 text-center text-[11px] font-medium text-black/55 ring-1 ring-black/5"
                    >
                      {chip}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-12 text-xs text-black/38">
            <div>Built with Next.js 14 + Three.js + TypeScript</div>
            <div className="rounded-full bg-white/70 px-3 py-1 ring-1 ring-black/5">
              background #f5f5f7
            </div>
          </footer>
        </div>
      </main>

      {/* STUDIO (полноэкранная комната) */}
      <section
        ref={studioRef}
        id="studio"
        className="relative min-h-[180vh] bg-[#f5f5f7]"
      >
        <div className="sticky top-0 flex h-screen items-center justify-center px-5 py-5 sm:px-8">
          <div className="mx-auto flex h-[92vh] w-full max-w-[1640px] items-stretch gap-4 lg:gap-6">
            <div className="relative min-w-0 flex-1 overflow-hidden rounded-[28px] border border-black/10 bg-[#dfe5ef] shadow-[0_30px_120px_rgba(0,0,0,0.16)]">
              <div className="absolute left-5 top-5 z-20 flex items-center gap-2">
                <div className="pointer-events-none rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium tracking-wide text-black/55 shadow-sm ring-1 ring-black/5 backdrop-blur">
                  3D Studio area
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFurniture([]);
                    setStatusText("Room cleared");
                  }}
                  className="pointer-events-auto rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium tracking-wide text-black/60 shadow-sm ring-1 ring-black/10 backdrop-blur transition duration-200 hover:scale-[1.02] hover:bg-white"
                >
                  Clear room
                </button>
              </div>

              <FullScreenScene
                className="absolute inset-0"
                room={room}
                roomTransform={roomTransform}
                onRoomTransformChange={setRoomTransform}
                furniture={furniture}
                onFurnitureChange={setFurniture}
                colors={colors}
                furnitureAppearance={furnitureAppearance}
                assist={assist}
              />

              {/* Subtle top fade so the transition from hero feels premium */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(to_bottom,rgba(223,229,239,1),rgba(223,229,239,0))]" />

              {/* Soft vignette to frame the room (premium separation) */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_800px_at_50%_40%,rgba(0,0,0,0.06),transparent_55%)] opacity-70" />
            </div>

            <div className="hidden h-full w-[380px] shrink-0 lg:block">
              <RoomControlsPanel
                room={room}
                onChange={setRoom}
                onAddFurniture={addFurniture}
                onSmartAddFurniture={smartAddFurniture}
                furnitureCount={furniture.length}
                style={style}
                onStyleChange={setStyle}
                onGenerateLayout={generateAiLayout}
                isGeneratingLayout={isGenerating}
                aiPrompt={aiPrompt}
                onAiPromptChange={setAiPrompt}
                statusText={statusText}
                colors={colors}
                onColorsChange={setColors}
                furnitureAppearance={furnitureAppearance}
                onFurnitureAppearanceChange={setFurnitureAppearance}
                canUndo={historyRef.current.past.length > 0}
                canRedo={historyRef.current.future.length > 0}
                onUndo={undo}
                onRedo={redo}
                onExportProject={exportProject}
                onImportProject={importProject}
                assist={assist}
                onAssistChange={setAssist}
                className="h-full max-h-full overflow-y-auto max-w-none rounded-[28px] bg-white/62 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.14)] ring-1 ring-black/6 backdrop-blur-2xl"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
