"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Room, type RoomOpening } from "@/components/three/Room";
import type { FurnitureItem } from "@/components/three/furniture/types";
import { createFurniture } from "@/components/three/furniture/createFurniture";
import { FURNITURE_CATALOG_MAP } from "@/components/three/furniture/catalog";
import {
  DEFAULT_FURNITURE_APPEARANCE,
  type FurnitureAppearance,
} from "@/components/three/furniture/appearance";
import { disposeObject3D } from "@/lib/three/dispose";

export type FullScreenSceneProps = {
  room?: {
    width: number;
    length: number;
    height: number;
  };
  roomTransform?: {
    position: readonly [number, number, number];
    rotation: readonly [number, number, number];
  };
  onRoomTransformChange?: (next: {
    position: readonly [number, number, number];
    rotation: readonly [number, number, number];
  }) => void;
  furniture?: FurnitureItem[];
  onFurnitureChange?: (next: FurnitureItem[]) => void;
  colors?: {
    walls: string;
    floor: string;
    furniture: string;
  };
  furnitureAppearance?: FurnitureAppearance;
  assist?: {
    snapMove: boolean;
    moveGrid: number;
    snapRotate: boolean;
    rotateStepDeg: number;
  };
  className?: string;
};

function buildRoomOpenings(
  furniture: FurnitureItem[],
  room: { width: number; length: number; height: number },
): RoomOpening[] {
  const halfW = room.width / 2;
  const halfL = room.length / 2;
  const out: RoomOpening[] = [];

  for (const item of furniture) {
    const meta = FURNITURE_CATALOG_MAP.get(item.type);
    if (!meta?.opening) continue;

    const x = item.position[0];
    const z = item.position[2];
    const defaultBottom = meta.opening.sill;
    const computedBottom = item.position[1] - meta.opening.height / 2;
    const bottom = Number.isFinite(computedBottom) && computedBottom > 0.02 ? computedBottom : defaultBottom;
    const dFront = Math.abs(z + halfL);
    const dBack = Math.abs(z - halfL);
    const dLeft = Math.abs(x + halfW);
    const dRight = Math.abs(x - halfW);
    const min = Math.min(dFront, dBack, dLeft, dRight);

    if (min === dFront) {
      out.push({
        wall: "front",
        center: x,
        width: meta.opening.width,
        height: meta.opening.height,
        bottom,
      });
    } else if (min === dBack) {
      out.push({
        wall: "back",
        center: x,
        width: meta.opening.width,
        height: meta.opening.height,
        bottom,
      });
    } else if (min === dLeft) {
      out.push({
        wall: "left",
        center: z,
        width: meta.opening.width,
        height: meta.opening.height,
        bottom,
      });
    } else {
      out.push({
        wall: "right",
        center: z,
        width: meta.opening.width,
        height: meta.opening.height,
        bottom,
      });
    }
  }

  return out;
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function FullScreenScene({
  room = { width: 6, length: 8, height: 3.2 },
  roomTransform = { position: [0, 0, 0], rotation: [0, 0, 0] },
  onRoomTransformChange,
  furniture = [],
  onFurnitureChange,
  colors = { walls: "#f2f5fa", floor: "#f4f1e7", furniture: "#e6ebf2" },
  furnitureAppearance = DEFAULT_FURNITURE_APPEARANCE,
  assist = { snapMove: true, moveGrid: 0.1, snapRotate: true, rotateStepDeg: 15 },
  className,
}: FullScreenSceneProps) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<HTMLDivElement | null>(null);
  const debugTextRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [objectMenu, setObjectMenu] = useState<null | {
    id: string;
    x: number;
    y: number;
    scale: number;
    color: string;
    dirty: boolean;
  }>(null);

  const furnitureMemo = useMemo(() => furniture, [furniture]);
  const assistRef = useRef(assist);

  const stateRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    ro: ResizeObserver;
    pmrem: THREE.PMREMGenerator;
    envTex: THREE.Texture;
    room3d: Room | null;
    currentRoom: { width: number; length: number; height: number };
    dir: THREE.DirectionalLight;
    hemi: THREE.HemisphereLight;
    furnitureRoot: THREE.Group;
    studioRoot: THREE.Group;
    snapGrid: THREE.GridHelper;
    latestFurniture: FurnitureItem[];
    latestRoomTransform: {
      position: readonly [number, number, number];
      rotation: readonly [number, number, number];
    };
    raycaster: THREE.Raycaster;
    dragging:
      | null
      | {
          id: string;
          root: THREE.Object3D;
          offset: THREE.Vector3;
          pointerId: number;
        };
    rotating:
      | null
      | {
          id: string;
          root: THREE.Object3D;
          pointerId: number;
          startClientX: number;
          startYaw: number;
        };
    gizmo: THREE.Group;
    gizmoPickables: THREE.Object3D[];
    gizmoDrag:
      | null
      | {
          pointerId: number;
          type: "moveX" | "moveZ" | "moveXZ" | "moveScreen" | "rotateY";
          target: { kind: "room" } | { kind: "furniture"; id: string };
          startPosWorld: THREE.Vector3;
          startPosLocal: THREE.Vector3;
          axisWorld?: THREE.Vector3;
          startT?: number;
          startHitAngle?: number;
          startYaw?: number;
          startClientX?: number;
          startClientY?: number;
          moveBasisX?: THREE.Vector3;
          moveBasisY?: THREE.Vector3;
          worldPerPixel?: number;
          offsetWorld?: THREE.Vector3;
        };
    selected: null | { kind: "room" } | { kind: "furniture"; id: string };
    furnitureById: Map<string, THREE.Object3D>;
    raf: number;
  } | null>(null);

  const applyFurnitureColor = (root: THREE.Object3D, colorHex: string) => {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        const maybe = mat as THREE.Material & {
          color?: THREE.Color;
          needsUpdate?: boolean;
        };
        if (maybe.color) {
          maybe.color.set(colorHex);
          if (typeof maybe.needsUpdate === "boolean") maybe.needsUpdate = true;
        }
      }
    });
  };

  const getFurniturePrimaryColor = (root: THREE.Object3D) => {
    let color = "#e6ebf2";
    root.traverse((obj) => {
      if (color !== "#e6ebf2") return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        const maybe = mat as THREE.Material & { color?: THREE.Color };
        if (maybe.color) {
          color = `#${maybe.color.getHexString()}`;
          return;
        }
      }
    });
    return color;
  };

  const clampFurnitureWithinRoom = (root: THREE.Object3D) => {
    const state = stateRef.current;
    if (!state) return;
    // Allow placing furniture almost flush to walls.
    const pad = 0.005;
    const minX = -state.currentRoom.width / 2 + pad;
    const maxX = state.currentRoom.width / 2 - pad;
    const minZ = -state.currentRoom.length / 2 + pad;
    const maxZ = state.currentRoom.length / 2 - pad;

    const bounds = getFurnitureBoundsInStudio(root);
    if (!bounds) return;
    let dx = 0;
    let dz = 0;
    if (bounds.min.x < minX) dx += minX - bounds.min.x;
    if (bounds.max.x > maxX) dx += maxX - bounds.max.x;
    if (bounds.min.z < minZ) dz += minZ - bounds.min.z;
    if (bounds.max.z > maxZ) dz += maxZ - bounds.max.z;

    root.position.set(root.position.x + dx, root.position.y, root.position.z + dz);
  };

  const clampWallMountedToWall = (root: THREE.Object3D, furnitureId?: string) => {
    const state = stateRef.current;
    if (!state || typeof furnitureId !== "string") return;
    const item = state.latestFurniture.find((it) => it.id === furnitureId);
    if (!item) return;
    const meta = FURNITURE_CATALOG_MAP.get(item.type);
    if (meta?.mount !== "wall") return;

    const fp = meta.footprint;
    const halfW = state.currentRoom.width / 2;
    const halfL = state.currentRoom.length / 2;
    const inset = Math.max(0.03, fp.depth / 2 + 0.01);
    if (meta.opening) {
      root.position.y = Math.max(
        meta.opening.height * 0.5,
        Math.min(
          state.currentRoom.height - meta.opening.height * 0.5 - 0.02,
          meta.opening.sill + meta.opening.height * 0.5,
        ),
      );
    } else {
      const defaultY = Math.min(
        state.currentRoom.height - fp.height * 0.5 - 0.05,
        Math.max(1.2, state.currentRoom.height * 0.58),
      );
      root.position.y = Number.isFinite(root.position.y) ? Math.max(0.15, root.position.y) : defaultY;
    }
    const x = root.position.x;
    const z = root.position.z;
    const dFront = Math.abs(z + halfL);
    const dBack = Math.abs(z - halfL);
    const dLeft = Math.abs(x + halfW);
    const dRight = Math.abs(x - halfW);
    const min = Math.min(dFront, dBack, dLeft, dRight);
    const spanX = halfW - 0.05;
    const spanZ = halfL - 0.05;

    if (min === dFront) {
      root.position.z = -(halfL - inset);
      root.position.x = Math.max(-spanX, Math.min(spanX, root.position.x));
      root.rotation.set(0, 0, 0);
      return;
    }
    if (min === dBack) {
      root.position.z = halfL - inset;
      root.position.x = Math.max(-spanX, Math.min(spanX, root.position.x));
      root.rotation.set(0, Math.PI, 0);
      return;
    }
    if (min === dLeft) {
      root.position.x = -(halfW - inset);
      root.position.z = Math.max(-spanZ, Math.min(spanZ, root.position.z));
      root.rotation.set(0, Math.PI / 2, 0);
      return;
    }
    root.position.x = halfW - inset;
    root.position.z = Math.max(-spanZ, Math.min(spanZ, root.position.z));
    root.rotation.set(0, -Math.PI / 2, 0);
  };

  const getFurnitureBoundsInStudio = (root: THREE.Object3D) => {
    const state = stateRef.current;
    if (!state) return null;
    state.studioRoot.updateMatrixWorld(true);
    root.updateMatrixWorld(true);
    const invStudioLocal = state.studioRoot.matrixWorld.clone().invert();

    let hasPoint = false;
    const bounds = new THREE.Box3();
    const localPt = new THREE.Vector3();
    const worldPt = new THREE.Vector3();
    const corners = [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ];

    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry as THREE.BufferGeometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox;
      if (!bb) return;

      corners[0].set(bb.min.x, bb.min.y, bb.min.z);
      corners[1].set(bb.min.x, bb.min.y, bb.max.z);
      corners[2].set(bb.min.x, bb.max.y, bb.min.z);
      corners[3].set(bb.min.x, bb.max.y, bb.max.z);
      corners[4].set(bb.max.x, bb.min.y, bb.min.z);
      corners[5].set(bb.max.x, bb.min.y, bb.max.z);
      corners[6].set(bb.max.x, bb.max.y, bb.min.z);
      corners[7].set(bb.max.x, bb.max.y, bb.max.z);

      for (const c of corners) {
        worldPt.copy(c).applyMatrix4(mesh.matrixWorld);
        localPt.copy(worldPt).applyMatrix4(invStudioLocal);
        if (!hasPoint) {
          bounds.min.copy(localPt);
          bounds.max.copy(localPt);
          hasPoint = true;
        } else {
          bounds.expandByPoint(localPt);
        }
      }
    });

    return hasPoint ? bounds : null;
  };

  const resolveFurnitureCollisions = (movingRoot: THREE.Object3D, movingId?: string) => {
    const state = stateRef.current;
    if (!state) return;
    // Allow objects to be almost touching.
    const clearance = 0.0;
    const maxIterations = 8;

    for (let iter = 0; iter < maxIterations; iter += 1) {
      const movingBounds = getFurnitureBoundsInStudio(movingRoot);
      if (!movingBounds) return;
      const mx = (movingBounds.min.x + movingBounds.max.x) * 0.5;
      const mz = (movingBounds.min.z + movingBounds.max.z) * 0.5;
      const mw = Math.max(0.001, movingBounds.max.x - movingBounds.min.x);
      const md = Math.max(0.001, movingBounds.max.z - movingBounds.min.z);
      const mr = Math.sqrt((mw * 0.5) ** 2 + (md * 0.5) ** 2);

      let pushed = false;
      for (const other of state.furnitureRoot.children) {
        if (other === movingRoot) continue;
        const otherId = (other.userData as { furnitureId?: unknown }).furnitureId;
        if (typeof movingId === "string" && otherId === movingId) continue;

        const otherBounds = getFurnitureBoundsInStudio(other);
        if (!otherBounds) continue;
        // If items are vertically separated, allow same XZ region (stacking).
        const verticalSeparated =
          movingBounds.min.y >= otherBounds.max.y - 0.002 ||
          otherBounds.min.y >= movingBounds.max.y - 0.002;
        if (verticalSeparated) continue;

        const ox = (otherBounds.min.x + otherBounds.max.x) * 0.5;
        const oz = (otherBounds.min.z + otherBounds.max.z) * 0.5;
        const halfMx = Math.max(0.001, movingBounds.max.x - movingBounds.min.x) * 0.5;
        const halfMz = Math.max(0.001, movingBounds.max.z - movingBounds.min.z) * 0.5;
        const halfOx = Math.max(0.001, otherBounds.max.x - otherBounds.min.x) * 0.5;
        const halfOz = Math.max(0.001, otherBounds.max.z - otherBounds.min.z) * 0.5;

        const dx = mx - ox;
        const dz = mz - oz;
        const overlapX = halfMx + halfOx + clearance - Math.abs(dx);
        const overlapZ = halfMz + halfOz + clearance - Math.abs(dz);
        if (overlapX <= 0 || overlapZ <= 0) continue;

        if (overlapX < overlapZ) {
          const signX = dx >= 0 ? 1 : -1;
          movingRoot.position.x += signX * overlapX;
        } else {
          const signZ = dz >= 0 ? 1 : -1;
          movingRoot.position.z += signZ * overlapZ;
        }
        clampFurnitureWithinRoom(movingRoot);
        clampWallMountedToWall(movingRoot, movingId);
        pushed = true;
      }
      if (!pushed) break;
    }
  };

  const getFurnitureTypeById = (id: string) => {
    const state = stateRef.current;
    if (!state) return null;
    const hit = state.latestFurniture.find((it) => it.id === id);
    return hit?.type ?? null;
  };

  const updateFurniturePatch = (
    id: string,
    patch: Partial<Pick<FurnitureItem, "scale" | "color" | "position" | "rotation">>,
  ) => {
    const state = stateRef.current;
    if (!state || !onFurnitureChange) return;
    const next = state.latestFurniture.map((it) =>
      it.id === id ? { ...it, ...patch } : it,
    );
    onFurnitureChange(next);
  };

  useEffect(() => {
    assistRef.current = assist;
  }, [assist]);

  useEffect(() => {
    if (!objectMenu) return;
    const onWindowPointerDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      setObjectMenu(null);
    };
    const onWindowKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setObjectMenu(null);
    };
    window.addEventListener("pointerdown", onWindowPointerDown);
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onWindowPointerDown);
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [objectMenu]);

  const isStackableType = (type: string | null) => type === "plant" || type === "lamp";

  const canReceiveStackType = (type: string | null) =>
    type === "table" ||
    type === "coffee_table" ||
    type === "side_table" ||
    type === "desk" ||
    type === "console" ||
    type === "chair" ||
    type === "bench" ||
    type === "nightstand" ||
    type === "dresser" ||
    type === "tv_stand" ||
    type === "cabinet";

  const trySnapStackOnTop = (movingRoot: THREE.Object3D, movingId?: string) => {
    const state = stateRef.current;
    if (!state || !movingId) return;
    const movingType = getFurnitureTypeById(movingId);
    if (!isStackableType(movingType)) {
      movingRoot.position.y = 0;
      return;
    }
    const movingBounds = getFurnitureBoundsInStudio(movingRoot);
    if (!movingBounds) return;
    const halfMx = Math.max(0.001, movingBounds.max.x - movingBounds.min.x) * 0.5;
    const halfMz = Math.max(0.001, movingBounds.max.z - movingBounds.min.z) * 0.5;
    const centerX = (movingBounds.min.x + movingBounds.max.x) * 0.5;
    const centerZ = (movingBounds.min.z + movingBounds.max.z) * 0.5;

    let bestTop = Number.NEGATIVE_INFINITY;
    for (const other of state.furnitureRoot.children) {
      if (other === movingRoot) continue;
      const otherId = (other.userData as { furnitureId?: unknown }).furnitureId;
      const otherType = typeof otherId === "string" ? getFurnitureTypeById(otherId) : null;
      if (!canReceiveStackType(otherType)) continue;
      const ob = getFurnitureBoundsInStudio(other);
      if (!ob) continue;

      const innerMinX = ob.min.x + halfMx + 0.002;
      const innerMaxX = ob.max.x - halfMx - 0.002;
      const innerMinZ = ob.min.z + halfMz + 0.002;
      const innerMaxZ = ob.max.z - halfMz - 0.002;
      if (innerMinX > innerMaxX || innerMinZ > innerMaxZ) continue;
      if (centerX < innerMinX || centerX > innerMaxX || centerZ < innerMinZ || centerZ > innerMaxZ) {
        continue;
      }
      bestTop = Math.max(bestTop, ob.max.y);
    }

    if (bestTop > -1e8) {
      const dy = bestTop + 0.002 - movingBounds.min.y;
      movingRoot.position.y += dy;
    } else {
      movingRoot.position.y = 0;
    }
  };

  useEffect(() => {
    const hostEl = canvasHostRef.current;
    const interactionEl = interactionRef.current;
    const debugEl = debugTextRef.current;
    if (!hostEl || !interactionEl) return;

    let disposed = false;

    const scene = new THREE.Scene();
    // Stronger contrast vs room walls so room reads clearly.
    scene.background = new THREE.Color("#e5e9f0");
    scene.fog = new THREE.Fog(new THREE.Color("#e5e9f0"), 48, 150);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.domElement.style.touchAction = "none";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;

    hostEl.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    // Lights (soft + realistic)
    const hemi = new THREE.HemisphereLight(0xffffff, 0xe9edf4, 0.32);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 2.85);
    dir.position.set(4, 6, 3);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.bias = -0.0002;
    dir.shadow.normalBias = 0.02;
    scene.add(dir);

    // Interaction layer sits above the canvas so you can orbit/drag
    // even when there are visual overlays (marketing content).
    interactionEl.style.touchAction = "none";
    interactionEl.classList.add("cursor-grab");
    const controls = new OrbitControls(camera, interactionEl);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    // Pan makes the whole room "drift" and look offset; we provide a dedicated
    // move-handle UX instead.
    controls.enablePan = false;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;

    // Root for furniture instances
    const furnitureRoot = new THREE.Group();
    // Studio root: room + furniture move together.
    const studioRoot = new THREE.Group();
    scene.add(studioRoot);
    studioRoot.add(furnitureRoot);
    const gridSize = Math.max(room.width, room.length, 8);
    const gridDivisions = Math.max(8, Math.round(gridSize / Math.max(0.01, assist.moveGrid)));
    const snapGrid = new THREE.GridHelper(gridSize, gridDivisions, 0x7aa2d6, 0xaebed4);
    snapGrid.position.y = 0.002;
    const snapGridMat = snapGrid.material as THREE.Material & { transparent?: boolean; opacity?: number };
    snapGridMat.transparent = true;
    snapGridMat.opacity = 0.28;
    snapGrid.visible = assist.snapMove;
    studioRoot.add(snapGrid);

    // CAD-like center gizmo (like KOMPAS-3D): always in 3D, not DOM.
    const gizmo = new THREE.Group();
    gizmo.visible = false;
    gizmo.renderOrder = 10;
    scene.add(gizmo);

    const gizmoMat = (hex: string, opacity = 1) =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(hex),
        transparent: opacity < 1,
        opacity,
        depthTest: false,
        depthWrite: false,
      });

    const gizmoPickables: THREE.Object3D[] = [];

    const makeAxisArrow = (dir: "x" | "z") => {
      const group = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.52, 12),
        gizmoMat(dir === "x" ? "#ff3b30" : "#0a84ff"),
      );
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.045, 0.12, 16),
        gizmoMat(dir === "x" ? "#ff3b30" : "#0a84ff"),
      );

      // Cylinder is Y-aligned by default.
      shaft.rotation.z = Math.PI / 2;
      head.rotation.z = Math.PI / 2;

      if (dir === "x") {
        shaft.position.set(0.28, 0.02, 0);
        head.position.set(0.60, 0.02, 0);
        group.userData = { gizmoType: "moveX" };
      } else {
        // Z axis
        shaft.rotation.y = Math.PI / 2;
        head.rotation.y = Math.PI / 2;
        shaft.position.set(0, 0.02, 0.28);
        head.position.set(0, 0.02, 0.60);
        group.userData = { gizmoType: "moveZ" };
      }

      // Make pickable by the mesh, not the group.
      (shaft.userData as any).gizmoType = group.userData.gizmoType;
      (head.userData as any).gizmoType = group.userData.gizmoType;
      gizmoPickables.push(shaft, head);

      group.add(shaft, head);
      return group;
    };

    const planeHandle = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.22),
      gizmoMat("#ffffff", 0.55),
    );
    planeHandle.rotation.x = -Math.PI / 2;
    planeHandle.position.set(0.12, 0.02, 0.12);
    (planeHandle.userData as any).gizmoType = "moveXZ";
    gizmoPickables.push(planeHandle);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.012, 10, 96),
      gizmoMat("#8e8e93", 0.95),
    );
    ring.rotation.x = Math.PI / 2; // XZ plane (rotate around Y)
    ring.position.set(0, 0.16, 0);
    (ring.userData as any).gizmoType = "rotateY";
    gizmoPickables.push(ring);

    gizmo.add(makeAxisArrow("x"), makeAxisArrow("z"), planeHandle, ring);

    // Adaptive resizing
    const resize = () => {
      const w = hostEl.clientWidth;
      const h = hostEl.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(hostEl);
    resize();

    const raycaster = new THREE.Raycaster();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0
    const tmpRay = new THREE.Ray();
    const invStudio = new THREE.Matrix4();
    const tmpV3 = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    const tmpBox = new THREE.Box3();
    const tmpCenter = new THREE.Vector3();
    const tmpHandle = new THREE.Vector3();

    const getNdcFromEvent = (ev: PointerEvent) => {
      // Use canvas rect as source of truth for picking coordinates.
      const canvasRect = renderer.domElement.getBoundingClientRect();
      const rect =
        canvasRect.width > 0 && canvasRect.height > 0
          ? canvasRect
          : interactionEl.getBoundingClientRect();
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top) / rect.height;
      ndc.set(x * 2 - 1, -(y * 2 - 1));
    };

    const setRayFromEvent = (ev: PointerEvent) => {
      // Keep matrices fresh so raycasting matches exactly what user sees now.
      camera.updateMatrixWorld(true);
      studioRoot.updateMatrixWorld(true);
      stateRef.current?.room3d?.updateMatrixWorld(true);
      getNdcFromEvent(ev);
      raycaster.setFromCamera(ndc, camera);
    };

    const setRayFromClient = (clientX: number, clientY: number) => {
      camera.updateMatrixWorld(true);
      studioRoot.updateMatrixWorld(true);
      stateRef.current?.room3d?.updateMatrixWorld(true);
      const canvasRect = renderer.domElement.getBoundingClientRect();
      const rect =
        canvasRect.width > 0 && canvasRect.height > 0
          ? canvasRect
          : interactionEl.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      ndc.set(x * 2 - 1, -(y * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
    };

    const getSelectedRoot = () => {
      const state = stateRef.current;
      if (!state?.selected) return null;
      if (state.selected.kind === "room") return state.studioRoot;
      return state.furnitureById.get(state.selected.id) ?? null;
    };

    const getSelectedFurnitureRoot = () => {
      const state = stateRef.current;
      if (!state?.selected || state.selected.kind !== "furniture") return null;
      return state.furnitureById.get(state.selected.id) ?? null;
    };

    const getSelectedRoomRoot = () => {
      const state = stateRef.current;
      if (!state?.selected || state.selected.kind !== "room") return null;
      return state.studioRoot;
    };

    const getGizmoCenterWorld = () => {
      const state = stateRef.current;
      if (!state?.selected) return null;
      if (state.selected.kind === "room") {
        const c = new THREE.Vector3(0, state.currentRoom.height * 0.45, 0);
        return c.applyMatrix4(studioRoot.matrixWorld);
      }
      const root = getSelectedFurnitureRoot();
      if (!root) return null;
      tmpBox.setFromObject(root);
      tmpBox.getCenter(tmpCenter);
      return tmpCenter.clone();
    };

    const beginInteraction = (ev: PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      // Keep zoom independent from drag: disable rotate/pan only.
      controls.enableRotate = false;
      controls.enablePan = false;
      controls.enableZoom = true;
      interactionEl.classList.remove("cursor-grab");
      interactionEl.classList.add("cursor-grabbing");
      interactionEl.setPointerCapture(ev.pointerId);
    };

    const endInteraction = (pointerId: number) => {
      controls.enableRotate = true;
      controls.enablePan = false;
      controls.enableZoom = true;
      try {
        interactionEl.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
      interactionEl.classList.remove("cursor-grabbing");
      interactionEl.classList.add("cursor-grab");
    };

    const closestTOnAxis = (ray: THREE.Ray, p0: THREE.Vector3, u: THREE.Vector3) => {
      // Ray: r0 + s*v, Axis: p0 + t*u
      const r0 = ray.origin;
      const v = ray.direction;
      const w0 = r0.clone().sub(p0);
      const a = v.dot(v);
      const b = v.dot(u);
      const c = u.dot(u);
      const d = v.dot(w0);
      const e = u.dot(w0);
      const denom = a * c - b * b;
      if (Math.abs(denom) < 1e-6) return -e / c;
      return (a * e - b * d) / denom;
    };

    const setDebug = (msg: string) => {
      if (debugEl) debugEl.textContent = msg;
    };

    const projectRoomCornersToScreen = () => {
      const state = stateRef.current;
      if (!state) return [] as Array<{ x: number; y: number; z: number }>;
      const rect = interactionEl.getBoundingClientRect();
      const r = state.currentRoom;
      const corners = [
        new THREE.Vector3(-r.width / 2, 0, -r.length / 2),
        new THREE.Vector3(r.width / 2, 0, -r.length / 2),
        new THREE.Vector3(r.width / 2, 0, r.length / 2),
        new THREE.Vector3(-r.width / 2, 0, r.length / 2),
        new THREE.Vector3(-r.width / 2, r.height, -r.length / 2),
        new THREE.Vector3(r.width / 2, r.height, -r.length / 2),
        new THREE.Vector3(r.width / 2, r.height, r.length / 2),
        new THREE.Vector3(-r.width / 2, r.height, r.length / 2),
      ];
      return corners.map((v) => {
        const world = v.clone().applyMatrix4(state.studioRoot.matrixWorld);
        const p = world.project(camera);
        return {
          x: rect.left + (p.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (-p.y * 0.5 + 0.5) * rect.height,
          z: p.z,
        };
      });
    };

    const getVisibleRoomSurfaceQuadsScreen = () => {
      const state = stateRef.current;
      if (!state) return [] as Array<Array<{ x: number; y: number; z: number }>>;
      const rect = interactionEl.getBoundingClientRect();
      const r = state.currentRoom;
      const hw = r.width / 2;
      const hl = r.length / 2;
      const h = r.height;
      const camPos = camera.position.clone();
      const q = state.studioRoot.quaternion;

      const surfaces: Array<{ verts: THREE.Vector3[]; normal: THREE.Vector3 }> = [
        {
          // floor
          verts: [
            new THREE.Vector3(-hw, 0, -hl),
            new THREE.Vector3(hw, 0, -hl),
            new THREE.Vector3(hw, 0, hl),
            new THREE.Vector3(-hw, 0, hl),
          ],
          normal: new THREE.Vector3(0, 1, 0),
        },
        {
          // front wall (-z)
          verts: [
            new THREE.Vector3(-hw, 0, -hl),
            new THREE.Vector3(hw, 0, -hl),
            new THREE.Vector3(hw, h, -hl),
            new THREE.Vector3(-hw, h, -hl),
          ],
          normal: new THREE.Vector3(0, 0, -1),
        },
        {
          // back wall (+z)
          verts: [
            new THREE.Vector3(-hw, 0, hl),
            new THREE.Vector3(hw, 0, hl),
            new THREE.Vector3(hw, h, hl),
            new THREE.Vector3(-hw, h, hl),
          ],
          normal: new THREE.Vector3(0, 0, 1),
        },
        {
          // left wall (-x)
          verts: [
            new THREE.Vector3(-hw, 0, -hl),
            new THREE.Vector3(-hw, 0, hl),
            new THREE.Vector3(-hw, h, hl),
            new THREE.Vector3(-hw, h, -hl),
          ],
          normal: new THREE.Vector3(-1, 0, 0),
        },
        {
          // right wall (+x)
          verts: [
            new THREE.Vector3(hw, 0, -hl),
            new THREE.Vector3(hw, 0, hl),
            new THREE.Vector3(hw, h, hl),
            new THREE.Vector3(hw, h, -hl),
          ],
          normal: new THREE.Vector3(1, 0, 0),
        },
      ];

      const result: Array<Array<{ x: number; y: number; z: number }>> = [];
      for (const s of surfaces) {
        const centerLocal = s.verts
          .reduce((acc, v) => acc.add(v), new THREE.Vector3())
          .multiplyScalar(1 / s.verts.length);
        const centerWorld = centerLocal.applyMatrix4(state.studioRoot.matrixWorld);
        const normalWorld = s.normal.clone().applyQuaternion(q).normalize();
        const toCam = camPos.clone().sub(centerWorld).normalize();
        // Keep only front-facing surfaces.
        if (normalWorld.dot(toCam) <= 0.02) continue;

        const quad = s.verts.map((v) => {
          const world = v.clone().applyMatrix4(state.studioRoot.matrixWorld);
          const p = world.project(camera);
          return {
            x: rect.left + (p.x * 0.5 + 0.5) * rect.width,
            y: rect.top + (-p.y * 0.5 + 0.5) * rect.height,
            z: p.z,
          };
        });
        // Skip surfaces fully outside near/far clip.
        if (quad.every((p) => p.z < -1.2 || p.z > 1.2)) continue;
        result.push(quad);
      }
      return result;
    };

    const getRoomScreenHull = () => {
      const quads = getVisibleRoomSurfaceQuadsScreen();
      const visible = quads.flat().map((p) => ({ x: p.x, y: p.y }));
      if (visible.length < 3) return [] as Array<{ x: number; y: number }>;
      const sorted = [...visible].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
      const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
        (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

      const lower: Array<{ x: number; y: number }> = [];
      for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
          lower.pop();
        }
        lower.push(p);
      }
      const upper: Array<{ x: number; y: number }> = [];
      for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
          upper.pop();
        }
        upper.push(p);
      }
      lower.pop();
      upper.pop();
      return lower.concat(upper);
    };

    const isPointerInRoomScreenHull = (clientX: number, clientY: number) => {
      const poly = getRoomScreenHull();
      if (poly.length < 3) return false;

      // Inside polygon test.
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x;
        const yi = poly[i].y;
        const xj = poly[j].x;
        const yj = poly[j].y;
        const inter =
          yi > clientY !== yj > clientY &&
          clientX < ((xj - xi) * (clientY - yi)) / (yj - yi + 1e-9) + xi;
        if (inter) inside = !inside;
      }

      if (inside) return true;

      // Soft tolerance near border so small AA gaps don't break drag.
      const distToSeg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const apx = p.x - a.x;
        const apy = p.y - a.y;
        const ab2 = abx * abx + aby * aby + 1e-9;
        const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
        const qx = a.x + t * abx;
        const qy = a.y + t * aby;
        const dx = p.x - qx;
        const dy = p.y - qy;
        return Math.sqrt(dx * dx + dy * dy);
      };

      const p = { x: clientX, y: clientY };
      const pxTol = 14;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        if (distToSeg(p, poly[j], poly[i]) <= pxTol) return true;
      }
      return false;
    };

    const isPointerOnRoomSurface2D = (clientX: number, clientY: number) => {
      const pointInTri = (
        p: { x: number; y: number },
        a: { x: number; y: number },
        b: { x: number; y: number },
        c: { x: number; y: number },
      ) => {
        const s = (p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }) =>
          (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
        const d1 = s(p, a, b);
        const d2 = s(p, b, c);
        const d3 = s(p, c, a);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        return !(hasNeg && hasPos);
      };

      const p = { x: clientX, y: clientY };
      const quads = getVisibleRoomSurfaceQuadsScreen();
      for (const q of quads) {
        const a = { x: q[0].x, y: q[0].y };
        const b = { x: q[1].x, y: q[1].y };
        const c = { x: q[2].x, y: q[2].y };
        const d = { x: q[3].x, y: q[3].y };
        if (pointInTri(p, a, b, c) || pointInTri(p, a, c, d)) return true;
      }
      return false;
    };

    const findFurnitureRoot = (obj: THREE.Object3D) => {
      let cur: THREE.Object3D | null = obj;
      while (cur) {
        const id = (cur.userData as { furnitureId?: unknown }).furnitureId;
        if (typeof id === "string") return cur;
        cur = cur.parent;
      }
      return null;
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 2) setObjectMenu(null);
      setRayFromEvent(ev);
      const state = stateRef.current;
      if (!state) return;

      // Compute nearest room and furniture hits first to match visible geometry.
      const roomTargets: THREE.Object3D[] = [];
      if (state.room3d) roomTargets.push(state.room3d);
      const roomHits = raycaster
        .intersectObjects(roomTargets, true)
        .filter((hit) => {
          const obj = hit.object as THREE.Object3D & { isMesh?: boolean };
          const surface = (hit.object.userData as { roomSurface?: string }).roomSurface;
          return Boolean(obj.isMesh) && surface !== "ceiling";
        });
      const nearestRoomHit = roomHits[0];

      const furnitureHits = raycaster
        .intersectObjects(state.furnitureRoot.children, true)
        .map((hit) => ({ hit, root: findFurnitureRoot(hit.object) }))
        .filter(
          (x): x is { hit: THREE.Intersection; root: THREE.Object3D } => x.root !== null,
        );
      const nearestFurniture = furnitureHits[0];

      // 1) Furniture direct manipulation has priority over room.
      // Room walls are semi-transparent for UX, so clicking a visible furniture
      // item should still select furniture even if a wall is geometrically closer.
      if (nearestFurniture) {
        const root = nearestFurniture.root;
        const furnitureId = (root.userData as { furnitureId?: unknown }).furnitureId;
        if (typeof furnitureId === "string") {
          state.selected = { kind: "furniture", id: furnitureId };
          const rotateFurniture = ev.button === 0 && ev.shiftKey;

          if (ev.button === 2 || (ev.button === 0 && ev.ctrlKey)) {
            ev.preventDefault();
            ev.stopPropagation();
            const rect = interactionEl.getBoundingClientRect();
            const current = state.latestFurniture.find((it) => it.id === furnitureId);
            const scale =
              typeof current?.scale === "number" && Number.isFinite(current.scale)
                ? current.scale
                : Number.isFinite(root.scale.x)
                  ? root.scale.x
                  : 1;
            const color =
              typeof current?.color === "string" ? current.color : getFurniturePrimaryColor(root);
            setObjectMenu({
              id: furnitureId,
              x: Math.min(Math.max(16, ev.clientX - rect.left), rect.width - 256),
              y: Math.min(Math.max(16, ev.clientY - rect.top), rect.height - 188),
              scale: Math.max(0.2, Math.min(5, scale)),
              color,
              dirty: false,
            });
            setDebug(`menu | furniture=${furnitureId}`);
            return;
          }

          beginInteraction(ev);

          if (rotateFurniture) {
            state.rotating = {
              id: furnitureId,
              root,
              pointerId: ev.pointerId,
              startClientX: ev.clientX,
              startYaw: root.rotation.y,
            };
            setDebug(`down | furniture=${furnitureId} mode=FURNITURE_ROTATE`);
            return;
          }

          // Intersect floor in studio-local space for stable drag under room transforms.
          invStudio.copy(studioRoot.matrixWorld).invert();
          tmpRay.copy(raycaster.ray).applyMatrix4(invStudio);
          const p = tmpRay.intersectPlane(floorPlane, tmpV3);
          if (!p) {
            endInteraction(ev.pointerId);
            return;
          }

          state.dragging = {
            id: furnitureId,
            root,
            offset: new THREE.Vector3(root.position.x - p.x, 0, root.position.z - p.z),
            pointerId: ev.pointerId,
          };
          setDebug(`down | furniture=${furnitureId} mode=FURNITURE_DRAG`);
          return;
        }
      }

      // 2) If cursor is on room (floor/walls), drag room.
      const inHull = isPointerInRoomScreenHull(ev.clientX, ev.clientY);
      const surface2D = isPointerOnRoomSurface2D(ev.clientX, ev.clientY);
      setDebug(
        `down | btn=${ev.button} roomHit=${roomHits.length > 0} hull=${inHull} surface2D=${surface2D} mode=${
          roomHits.length > 0 && ev.button === 0 ? "ROOM_DRAG" : "ORBIT"
        }`,
      );
      if (
        nearestRoomHit &&
        ev.button === 0
      ) {
        state.selected = { kind: "room" };
        beginInteraction(ev);

        // Fixed screen-plane translation setup (depth locked; zoom controls depth).
        const rect = interactionEl.getBoundingClientRect();
        const h = Math.max(1, rect.height);
        const centerWorldForScale = getGizmoCenterWorld() ?? studioRoot.position;
        const dist = camera.position.distanceTo(centerWorldForScale);
        const fov = (camera.fov * Math.PI) / 180;
        const worldPerPixel = (2 * Math.tan(fov / 2) * dist) / h;

        const basisX = new THREE.Vector3()
          .setFromMatrixColumn(camera.matrixWorld, 0)
          .setY(0)
          .normalize();
        const basisY = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
        if (basisX.lengthSq() < 1e-6 || basisY.lengthSq() < 1e-6) return;

        state.gizmoDrag = {
          pointerId: ev.pointerId,
          type: "moveScreen",
          target: { kind: "room" },
          startPosWorld: studioRoot.position.clone(),
          startPosLocal: studioRoot.position.clone(),
          startClientX: ev.clientX,
          startClientY: ev.clientY,
          moveBasisX: basisX,
          moveBasisY: basisY,
          worldPerPixel,
        };
        return;
      }

      // 3) Try gizmo (CAD-style) when not directly dragging room/furniture.
      const gizmoHits = raycaster.intersectObjects(state.gizmoPickables, true);
      if (gizmoHits.length > 0) {
        const gizmoType = (gizmoHits[0].object.userData as any).gizmoType as
          | "moveX"
          | "moveZ"
          | "moveXZ"
          | "rotateY"
          | undefined;
        if (!gizmoType) return;

        const centerWorld = getGizmoCenterWorld();
        if (!centerWorld) return;

        beginInteraction(ev);

        const target = state.selected ?? { kind: "room" as const };
        // Room should be moved by user, not rotated as an object.
        if (target.kind === "room" && gizmoType === "rotateY") {
          return;
        }

        // Snapshot start positions.
        const startPosWorld =
          target.kind === "room"
            ? studioRoot.position.clone()
            : centerWorld.clone(); // unused for furniture world move (we apply in local)

        const startPosLocal =
          target.kind === "room"
            ? studioRoot.position.clone()
            : (getSelectedFurnitureRoot()?.position.clone() ?? new THREE.Vector3());

        const drag: (typeof state.gizmoDrag) extends null ? never : NonNullable<typeof state.gizmoDrag> =
          {
            pointerId: ev.pointerId,
            type: gizmoType,
            target,
            startPosWorld,
            startPosLocal,
          };

        if (gizmoType === "moveX" || gizmoType === "moveZ") {
          const axisLocal = gizmoType === "moveX" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
          const axisWorld = axisLocal.applyQuaternion(studioRoot.quaternion).normalize();
          drag.axisWorld = axisWorld;
          drag.startT = closestTOnAxis(raycaster.ray, centerWorld, axisWorld);
        }

        if (gizmoType === "moveXZ") {
          const p = raycaster.ray.intersectPlane(floorPlane, tmpV3);
          if (!p) return;
          drag.offsetWorld = new THREE.Vector3(centerWorld.x - p.x, 0, centerWorld.z - p.z);
        }

        if (gizmoType === "rotateY") {
          const up = new THREE.Vector3(0, 1, 0);
          const plane = new THREE.Plane(up, -up.dot(centerWorld));
          const p = raycaster.ray.intersectPlane(plane, tmpV3);
          if (!p) return;
          const v = p.clone().sub(centerWorld);
          drag.startHitAngle = Math.atan2(v.x, v.z);
          drag.startYaw =
            target.kind === "room"
              ? studioRoot.rotation.y
              : (getSelectedFurnitureRoot()?.rotation.y ?? 0);
        }

        state.gizmoDrag = drag;
        return;
      }
      // 4) Outside room/furniture => orbit view.
      return;
    };

    const onPointerMove = (ev: PointerEvent) => {
      const state = stateRef.current;
      if (!state) return;

      // Gizmo drag (KOMPAS-like).
      if (state.gizmoDrag) {
        if (state.gizmoDrag.pointerId !== ev.pointerId) return;
        // Important: update ray from current pointer position each frame.
        setRayFromEvent(ev);

        const centerWorld = getGizmoCenterWorld();
        if (!centerWorld) return;

        if (state.gizmoDrag.type === "moveX" || state.gizmoDrag.type === "moveZ") {
          const axisWorld = state.gizmoDrag.axisWorld!;
          const t = closestTOnAxis(raycaster.ray, centerWorld, axisWorld);
          const dt = t - (state.gizmoDrag.startT ?? t);
          const deltaWorld = axisWorld.clone().multiplyScalar(dt);

          if (state.gizmoDrag.target.kind === "room") {
            const next = state.gizmoDrag.startPosWorld.clone().add(deltaWorld);
            next.y = 0;
            studioRoot.position.copy(next);
            studioRoot.updateMatrixWorld(true);
          } else {
            const root = getSelectedFurnitureRoot();
            if (!root) return;
            const invQ = studioRoot.quaternion.clone().invert();
            const deltaLocal = deltaWorld.clone().applyQuaternion(invQ);
            const nextLocal = state.gizmoDrag.startPosLocal.clone().add(deltaLocal);
            root.position.set(nextLocal.x, root.position.y, nextLocal.z);
            resolveFurnitureCollisions(
              root,
              state.gizmoDrag.target.kind === "furniture" ? state.gizmoDrag.target.id : undefined,
            );
            clampFurnitureWithinRoom(root);
            if (state.gizmoDrag.target.kind === "furniture") {
              clampWallMountedToWall(root, state.gizmoDrag.target.id);
            }
            if (state.gizmoDrag.target.kind === "furniture") {
              trySnapStackOnTop(root, state.gizmoDrag.target.id);
            }
          }
          return;
        }

        if (state.gizmoDrag.type === "moveXZ") {
          const p = raycaster.ray.intersectPlane(floorPlane, tmpV3);
          if (!p) return;
          const off = state.gizmoDrag.offsetWorld ?? new THREE.Vector3();
          const nextWorld = new THREE.Vector3(p.x + off.x, 0, p.z + off.z);

          if (state.gizmoDrag.target.kind === "room") {
            studioRoot.position.copy(nextWorld);
            studioRoot.updateMatrixWorld(true);
          } else {
            const root = getSelectedFurnitureRoot();
            if (!root) return;
            invStudio.copy(studioRoot.matrixWorld).invert();
            const nextLocal = nextWorld.clone().applyMatrix4(invStudio);
            root.position.set(nextLocal.x, root.position.y, nextLocal.z);
            resolveFurnitureCollisions(
              root,
              state.gizmoDrag.target.kind === "furniture" ? state.gizmoDrag.target.id : undefined,
            );
            clampFurnitureWithinRoom(root);
            if (state.gizmoDrag.target.kind === "furniture") {
              clampWallMountedToWall(root, state.gizmoDrag.target.id);
            }
            if (state.gizmoDrag.target.kind === "furniture") {
              trySnapStackOnTop(root, state.gizmoDrag.target.id);
            }
          }
          return;
        }

        if (state.gizmoDrag.type === "moveScreen") {
          // Screen-plane drag with depth axis locked (depth changes only by zoom).
          const sx = state.gizmoDrag.startClientX ?? ev.clientX;
          const sy = state.gizmoDrag.startClientY ?? ev.clientY;
          const dx = ev.clientX - sx;
          const dy = ev.clientY - sy;

          const worldPerPixel = state.gizmoDrag.worldPerPixel ?? 0;
          const basisX = state.gizmoDrag.moveBasisX?.clone() ?? new THREE.Vector3();
          const basisY = state.gizmoDrag.moveBasisY?.clone() ?? new THREE.Vector3();
          if (basisX.lengthSq() < 1e-6 || basisY.lengthSq() < 1e-6) return;

          const delta = basisX
            .multiplyScalar(dx * worldPerPixel)
            .add(basisY.multiplyScalar(-dy * worldPerPixel));

          const next = state.gizmoDrag.startPosWorld.clone().add(delta);
          next.y = 0;
          studioRoot.position.copy(next);
          studioRoot.updateMatrixWorld(true);
          setDebug(
            `move | mode=ROOM_DRAG depthLocked=true x=${next.x.toFixed(2)} z=${next.z.toFixed(2)}`,
          );
          return;
        }

        if (state.gizmoDrag.type === "rotateY") {
          const up = new THREE.Vector3(0, 1, 0);
          const plane = new THREE.Plane(up, -up.dot(centerWorld));
          const p = raycaster.ray.intersectPlane(plane, tmpV3);
          if (!p) return;
          const v = p.clone().sub(centerWorld);
          const ang = Math.atan2(v.x, v.z);
          const startAng = state.gizmoDrag.startHitAngle ?? ang;
          const dyaw = ang - startAng;

          if (state.gizmoDrag.target.kind === "room") {
            const rawYaw = (state.gizmoDrag.startYaw ?? studioRoot.rotation.y) + dyaw;
            const snapRad = THREE.MathUtils.degToRad(
              Math.max(1, assistRef.current.rotateStepDeg || 15),
            );
            const yaw = assistRef.current.snapRotate
              ? Math.round(rawYaw / snapRad) * snapRad
              : rawYaw;
            studioRoot.rotation.set(0, yaw, 0);
            studioRoot.updateMatrixWorld(true);
          } else {
            const root = getSelectedFurnitureRoot();
            if (!root) return;
            const rawYaw = (state.gizmoDrag.startYaw ?? root.rotation.y) + dyaw;
            const snapRad = THREE.MathUtils.degToRad(
              Math.max(1, assistRef.current.rotateStepDeg || 15),
            );
            const yaw = assistRef.current.snapRotate
              ? Math.round(rawYaw / snapRad) * snapRad
              : rawYaw;
            root.rotation.set(0, yaw, 0);
            resolveFurnitureCollisions(
              root,
              state.gizmoDrag.target.kind === "furniture" ? state.gizmoDrag.target.id : undefined,
            );
            if (state.gizmoDrag.target.kind === "furniture") {
              trySnapStackOnTop(root, state.gizmoDrag.target.id);
            }
          }
          return;
        }
      }

      // Preview mode under cursor when not dragging.
      setRayFromEvent(ev);
      const roomTargets: THREE.Object3D[] = [];
      if (state.room3d) roomTargets.push(state.room3d);
      const roomHits = raycaster
        .intersectObjects(roomTargets, true)
        .filter((hit) => {
          const obj = hit.object as THREE.Object3D & { isMesh?: boolean };
          const surface = (hit.object.userData as { roomSurface?: string }).roomSurface;
          return Boolean(obj.isMesh) && surface !== "ceiling";
        });
      const inHull = isPointerInRoomScreenHull(ev.clientX, ev.clientY);
      const surface2D = isPointerOnRoomSurface2D(ev.clientX, ev.clientY);
      setDebug(
        `hover | roomHit=${roomHits.length > 0} hull=${inHull} surface2D=${surface2D} mode=${
          roomHits.length > 0 ? "ROOM_DRAG" : "ORBIT"
        }`,
      );

      if (state.rotating) {
        if (state.rotating.pointerId !== ev.pointerId) return;
        const dx = ev.clientX - state.rotating.startClientX;
        const yaw = state.rotating.startYaw + dx * 0.012;
        state.rotating.root.rotation.set(0, yaw, 0);
        resolveFurnitureCollisions(state.rotating.root, state.rotating.id);
        return;
      }

      if (!state.dragging) return;
      if (state.dragging.pointerId !== ev.pointerId) return;

      setRayFromEvent(ev);
      // Intersect floor plane in studio-local space so furniture stays inside
      // even when the whole room is moved/rotated.
      invStudio.copy(studioRoot.matrixWorld).invert();
      tmpRay.copy(raycaster.ray).applyMatrix4(invStudio);
      const p = tmpRay.intersectPlane(floorPlane, tmpV3);
      if (!p) return;

      const { root, offset } = state.dragging;
      let nx = p.x + offset.x;
      let nz = p.z + offset.z;
      if (assistRef.current.snapMove) {
        const grid = Math.max(0.01, assistRef.current.moveGrid || 0.1);
        nx = Math.round(nx / grid) * grid;
        nz = Math.round(nz / grid) * grid;
      }
      root.position.set(nx, root.position.y, nz);
      resolveFurnitureCollisions(root, state.dragging.id);
      clampFurnitureWithinRoom(root);
      clampWallMountedToWall(root, state.dragging.id);
      trySnapStackOnTop(root, state.dragging.id);
    };

    const onPointerUp = (ev: PointerEvent) => {
      const state = stateRef.current;
      if (!state) return;

      if (state.gizmoDrag && state.gizmoDrag.pointerId === ev.pointerId) {
        const target = state.gizmoDrag.target;
        state.gizmoDrag = null;
        endInteraction(ev.pointerId);

        // Commit to React state.
        if (target.kind === "room") {
          onRoomTransformChange?.({
            position: [studioRoot.position.x, 0, studioRoot.position.z],
            rotation: [0, studioRoot.rotation.y, 0],
          });
        } else {
          const root = getSelectedFurnitureRoot();
          if (root && onFurnitureChange) {
            const id = target.id;
            const next = state.latestFurniture.map((it) =>
              it.id === id
                ? {
                    ...it,
                    position: [root.position.x, root.position.y, root.position.z] as const,
                    rotation: [0, root.rotation.y, 0] as const,
                    scale: Number.isFinite(root.scale.x) ? root.scale.x : it.scale,
                  }
                : it,
            );
            onFurnitureChange(next);
          }
        }

        setDebug("up | mode=ORBIT");
        return;
      }

      const releasingRotating =
        state.rotating && state.rotating.pointerId === ev.pointerId;
      const releasingDragging =
        state.dragging && state.dragging.pointerId === ev.pointerId;
      if (!releasingRotating && !releasingDragging) return;

      const id = releasingRotating ? state.rotating!.id : state.dragging!.id;
      const root = releasingRotating ? state.rotating!.root : state.dragging!.root;

      state.dragging = null;
      state.rotating = null;
      controls.enableRotate = true;
      controls.enablePan = false;
      controls.enableZoom = true;

      try {
        interactionEl.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }

      interactionEl.classList.remove("cursor-grabbing");
      interactionEl.classList.add("cursor-grab");

      if (onFurnitureChange) {
        const next = state.latestFurniture.map((it) =>
          it.id === id
            ? {
                ...it,
                position: [root.position.x, root.position.y, root.position.z] as const,
                rotation: [0, root.rotation.y, 0] as const,
                scale: Number.isFinite(root.scale.x) ? root.scale.x : it.scale,
              }
            : it,
        );
        onFurnitureChange(next);
      }
      setDebug("up | mode=ORBIT");
    };

    const onContextMenu = (ev: MouseEvent) => {
      ev.preventDefault();
      const state = stateRef.current;
      if (!state) return;
      setRayFromClient(ev.clientX, ev.clientY);
      const furnitureHits = raycaster
        .intersectObjects(state.furnitureRoot.children, true)
        .map((hit) => ({ hit, root: findFurnitureRoot(hit.object) }))
        .filter(
          (x): x is { hit: THREE.Intersection; root: THREE.Object3D } => x.root !== null,
        );
      const nearestFurniture = furnitureHits[0];
      if (!nearestFurniture) return;
      const root = nearestFurniture.root;
      const furnitureId = (root.userData as { furnitureId?: unknown }).furnitureId;
      if (typeof furnitureId !== "string") return;
      state.selected = { kind: "furniture", id: furnitureId };

      const rect = interactionEl.getBoundingClientRect();
      const current = state.latestFurniture.find((it) => it.id === furnitureId);
      const scale =
        typeof current?.scale === "number" && Number.isFinite(current.scale)
          ? current.scale
          : Number.isFinite(root.scale.x)
            ? root.scale.x
            : 1;
      const color =
        typeof current?.color === "string" ? current.color : getFurniturePrimaryColor(root);
      setObjectMenu({
        id: furnitureId,
        x: Math.min(Math.max(16, ev.clientX - rect.left), rect.width - 256),
        y: Math.min(Math.max(16, ev.clientY - rect.top), rect.height - 188),
        scale: Math.max(0.2, Math.min(5, scale)),
        color,
        dirty: false,
      });
      setDebug(`menu | furniture=${furnitureId}`);
    };

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

      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "d") {
        const state = stateRef.current;
        if (!state || state.selected?.kind !== "furniture") return;
        const selectedId = state.selected.id;
        const selected = state.latestFurniture.find((it) => it.id === selectedId);
        if (!selected) return;
        const cloneId = newId();
        const next: FurnitureItem = {
          ...selected,
          id: cloneId,
          position: [selected.position[0] + 0.35, selected.position[1], selected.position[2] + 0.35],
        };
        onFurnitureChange?.([...state.latestFurniture, next]);
        state.selected = { kind: "furniture", id: cloneId };
        setDebug(`duplicate | furniture=${cloneId}`);
        ev.preventDefault();
        return;
      }

      if (ev.key !== "Delete" && ev.key !== "Backspace") return;
      const state = stateRef.current;
      if (!state || state.selected?.kind !== "furniture") return;
      const id = state.selected.id;
      state.selected = { kind: "room" };
      state.dragging = null;
      state.rotating = null;
      state.gizmoDrag = null;
      onFurnitureChange?.(state.latestFurniture.filter((it) => it.id !== id));
      setDebug(`delete | furniture=${id}`);
      ev.preventDefault();
    };


    // Capture phase helps us win against OrbitControls.
    interactionEl.addEventListener("pointerdown", onPointerDown, true);
    interactionEl.addEventListener("pointermove", onPointerMove);
    interactionEl.addEventListener("pointerup", onPointerUp);
    interactionEl.addEventListener("pointercancel", onPointerUp);
    interactionEl.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    let raf = 0;
    const tick = () => {
      if (disposed) return;
      raf = window.requestAnimationFrame(tick);
      controls.update();
      if (stateRef.current?.room3d) {
        // The room may be moved/rotated; convert camera position into room-local space
        // for correct cutaway decisions.
        const camLocal = stateRef.current.room3d.worldToLocal(camera.position.clone());
        stateRef.current.room3d.updateCutaway(camLocal);
      }

      // Update 3D gizmo (position/orientation/constant screen size).
      if (stateRef.current) {
        const state = stateRef.current;
        const centerWorld = getGizmoCenterWorld();
        if (!centerWorld) {
          state.gizmo.visible = false;
        } else {
          state.gizmo.visible = true;
          // For room selection, hide rotation ring to avoid "room rotates around me" UX.
          ring.visible = state.selected?.kind !== "room";
          state.gizmo.position.copy(centerWorld);
          // Align to room/world axes (like CAD triad).
          state.gizmo.quaternion.copy(studioRoot.quaternion);

          const d = state.camera.position.distanceTo(centerWorld);
          const s = THREE.MathUtils.clamp(d * 0.085, 0.55, 3.2);
          state.gizmo.scale.setScalar(s);
        }
      }

      renderer.render(scene, camera);
    };
    tick();

    stateRef.current = {
      scene,
      camera,
      renderer,
      controls,
      ro,
      pmrem,
      envTex,
      room3d: null,
      currentRoom: { ...room },
      dir,
      hemi,
      furnitureRoot,
      studioRoot,
      snapGrid,
      latestFurniture: furnitureMemo,
      latestRoomTransform: roomTransform,
      raycaster,
      dragging: null,
      rotating: null,
      gizmo,
      gizmoPickables,
      gizmoDrag: null,
      selected: { kind: "room" },
      furnitureById: new Map(),
      raf,
    };

    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);

      const state = stateRef.current;
      stateRef.current = null;

      if (state) {
        interactionEl.removeEventListener("pointerdown", onPointerDown, true);
        interactionEl.removeEventListener("pointermove", onPointerMove);
        interactionEl.removeEventListener("pointerup", onPointerUp);
        interactionEl.removeEventListener("pointercancel", onPointerUp);
        interactionEl.removeEventListener("contextmenu", onContextMenu);

        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        window.removeEventListener("keydown", onKeyDown);

        // `state.raf` may be stale across frames; we cancel `raf` above and stop via `disposed`.
        window.cancelAnimationFrame(state.raf);
        state.ro.disconnect();

        state.controls.dispose();

        if (state.room3d) {
          state.room3d.dispose();
          state.studioRoot.remove(state.room3d);
        }

        disposeObject3D(state.furnitureRoot);
        state.studioRoot.remove(state.furnitureRoot);
        state.scene.remove(state.studioRoot);
        state.scene.remove(state.gizmo);

        state.envTex.dispose();
        state.pmrem.dispose();

        state.renderer.dispose();
        state.renderer.forceContextLoss();
        state.renderer.domElement.remove();
      }
    };
  }, []);

    // Update Room when dimensions change
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;

    state.currentRoom = { ...room };

    if (state.room3d) {
      state.room3d.dispose();
      state.studioRoot.remove(state.room3d);
    }

    const room3d = new Room({
      ...room,
      openings: buildRoomOpenings(state.latestFurniture, room),
    });
    room3d.setFloorAnisotropy(
      Math.min(16, state.renderer.capabilities.getMaxAnisotropy()),
    );
    room3d.setWallColor(colors.walls);
    room3d.setFloorColor(colors.floor);
    state.studioRoot.add(room3d);
    state.room3d = room3d;
    const gridSize = Math.max(room.width, room.length, 8);
    const gridDivisions = Math.max(8, Math.round(gridSize / Math.max(0.01, assistRef.current.moveGrid)));
    state.snapGrid.geometry.dispose();
    state.snapGrid.geometry = new THREE.BufferGeometry();
    const nextGrid = new THREE.GridHelper(gridSize, gridDivisions, 0x7aa2d6, 0xaebed4);
    state.snapGrid.geometry.copy(nextGrid.geometry);
    nextGrid.geometry.dispose();
    state.snapGrid.visible = assistRef.current.snapMove;

    // Re-clamp current furniture when room dimensions change.
    let movedByClamp = false;
    for (const obj of state.furnitureRoot.children) {
      const beforeX = obj.position.x;
      const beforeZ = obj.position.z;
      const beforeY = obj.position.y;
      clampFurnitureWithinRoom(obj);
      const id = (obj.userData as { furnitureId?: unknown }).furnitureId;
      if (typeof id === "string") clampWallMountedToWall(obj, id);
      resolveFurnitureCollisions(obj, typeof id === "string" ? id : undefined);
      if (typeof id === "string") trySnapStackOnTop(obj, id);
      if (
        Math.abs(obj.position.x - beforeX) > 1e-5 ||
        Math.abs(obj.position.y - beforeY) > 1e-5 ||
        Math.abs(obj.position.z - beforeZ) > 1e-5
      ) {
        movedByClamp = true;
      }
    }
    if (movedByClamp && onFurnitureChange) {
      const next = state.latestFurniture.map((it) => {
        const root = state.furnitureById.get(it.id);
        if (!root) return it;
        return {
          ...it,
          position: [root.position.x, root.position.y, root.position.z] as const,
        };
      });
      onFurnitureChange(next);
    }


    // Fit camera + shadows to the new room (simple, predictable)
    const lookAt = new THREE.Vector3(0, room.height * 0.45, 0);
    // Keep the controls target in world-space even if the studioRoot moves/rotates.
    const lookAtWorld = lookAt.clone().applyMatrix4(state.studioRoot.matrixWorld);
    state.controls.target.copy(lookAtWorld);
    state.controls.update();

    // Centered "fit-to-view" camera so the room is visually centered on screen.
    // We position the camera in studio-local space, then convert to world space.
    const halfW = room.width / 2;
    const halfL = room.length / 2;
    const halfH = room.height / 2;
    const centerLocal = new THREE.Vector3(0, room.height * 0.45, 0);

    // Bounding sphere radius of the room volume around its center.
    const radius = Math.sqrt(halfW * halfW + halfL * halfL + halfH * halfH);
    const fov = (state.camera.fov * Math.PI) / 180;
    const dist = Math.max(5.2, (radius / Math.sin(fov / 2)) * 1.05);

    const dirLocal = new THREE.Vector3(1, 0.9, 1).normalize();
    const camLocal = centerLocal.clone().addScaledVector(dirLocal, dist);
    const camWorld = camLocal.applyMatrix4(state.studioRoot.matrixWorld);

    state.camera.position.copy(camWorld);
    state.camera.lookAt(lookAtWorld);
    state.controls.update();

    // Keep light target in world space (studioRoot may move/rotate).
    state.dir.target.position.copy(lookAtWorld);
    if (!state.dir.target.parent) state.scene.add(state.dir.target);

    const maxDim = Math.max(room.width, room.length, room.height);
    const shadowRadius = Math.max(room.width, room.length) * 0.75;
    const sc = state.dir.shadow.camera as THREE.OrthographicCamera;
    sc.left = -shadowRadius;
    sc.right = shadowRadius;
    sc.top = shadowRadius;
    sc.bottom = -shadowRadius;
    sc.near = 0.1;
    sc.far = room.height * 4 + maxDim * 2;
    sc.updateProjectionMatrix();
  }, [onFurnitureChange, room]);

  // Keep snap grid visibility/density in sync with panel settings.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    const gridSize = Math.max(state.currentRoom.width, state.currentRoom.length, 8);
    const gridDivisions = Math.max(8, Math.round(gridSize / Math.max(0.01, assist.moveGrid)));
    state.snapGrid.geometry.dispose();
    state.snapGrid.geometry = new THREE.BufferGeometry();
    const nextGrid = new THREE.GridHelper(gridSize, gridDivisions, 0x7aa2d6, 0xaebed4);
    state.snapGrid.geometry.copy(nextGrid.geometry);
    nextGrid.geometry.dispose();
    state.snapGrid.visible = assist.snapMove;
  }, [assist.moveGrid, assist.snapMove]);

  // Apply color updates without rebuilding geometry/camera.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.room3d?.setWallColor(colors.walls);
    state.room3d?.setFloorColor(colors.floor);
    for (const obj of state.furnitureRoot.children) {
      const id = (obj.userData as { furnitureId?: unknown }).furnitureId;
      const item =
        typeof id === "string"
          ? state.latestFurniture.find((it) => it.id === id)
          : undefined;
      // Keep design/material preset visible; apply explicit per-item override only.
      if (typeof item?.color === "string") {
        applyFurnitureColor(obj, item.color);
      }
    }
  }, [colors.floor, colors.furniture, colors.walls]);

  // Apply room transform without re-framing camera each pointer move.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;

    state.latestRoomTransform = roomTransform;
    state.studioRoot.position.set(
      roomTransform.position[0],
      roomTransform.position[1],
      roomTransform.position[2],
    );
    state.studioRoot.rotation.set(
      roomTransform.rotation[0],
      roomTransform.rotation[1],
      roomTransform.rotation[2],
    );
    state.studioRoot.updateMatrixWorld(true);
  }, [roomTransform]);

  // Update Furniture instances
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;

    state.latestFurniture = furnitureMemo;
    state.furnitureById.clear();

    const mkPickProxy = (obj: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const proxy = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.max(size.x * 1.08, 0.45),
          Math.max(size.y * 1.02, 0.4),
          Math.max(size.z * 1.08, 0.45),
        ),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: true,
        }),
      );
      proxy.name = "pick-proxy";
      proxy.position.copy(obj.worldToLocal(center));
      proxy.renderOrder = -1;
      obj.add(proxy);
    };

    // Clear existing furniture
    for (const child of [...state.furnitureRoot.children]) {
      disposeObject3D(child);
      state.furnitureRoot.remove(child);
    }

    // Add current furniture
    for (const item of furnitureMemo) {
      const obj = createFurniture(item, furnitureAppearance);
      obj.name = `furniture:${item.type}:${item.id}`;
      (obj.userData as { furnitureId?: string }).furnitureId = item.id;
      obj.position.y = Math.max(0, obj.position.y); // keep on/above floor
      state.furnitureRoot.add(obj);
      if (typeof item.color === "string") {
        applyFurnitureColor(obj, item.color);
      }
      clampFurnitureWithinRoom(obj);
      clampWallMountedToWall(obj, item.id);
      resolveFurnitureCollisions(obj, item.id);
      trySnapStackOnTop(obj, item.id);
      mkPickProxy(obj);
      state.furnitureById.set(item.id, obj);
    }

    state.room3d?.setOpenings(buildRoomOpenings(furnitureMemo, state.currentRoom));

    // If the selected furniture no longer exists (e.g. after applying a layout),
    // keep UX stable by falling back to the room selection.
    if (state.selected?.kind === "furniture" && !state.furnitureById.has(state.selected.id)) {
      state.selected = { kind: "room" };
    }
  }, [furnitureAppearance, furnitureMemo]);

  const applyObjectMenuScale = (value: number) => {
    if (!objectMenu) return;
    const clamped = Math.max(0.2, Math.min(5, value));
    const state = stateRef.current;
    const root = state?.furnitureById.get(objectMenu.id);
    if (root) {
      root.scale.setScalar(clamped);
      clampFurnitureWithinRoom(root);
      clampWallMountedToWall(root, objectMenu.id);
      resolveFurnitureCollisions(root, objectMenu.id);
      trySnapStackOnTop(root, objectMenu.id);
    }
    setObjectMenu((prev) => (prev ? { ...prev, scale: clamped, dirty: true } : prev));
  };

  const applyObjectMenuColor = (color: string) => {
    if (!objectMenu) return;
    const state = stateRef.current;
    const root = state?.furnitureById.get(objectMenu.id);
    if (root) applyFurnitureColor(root, color);
    setObjectMenu((prev) => (prev ? { ...prev, color, dirty: true } : prev));
  };

  const saveObjectMenu = () => {
    if (!objectMenu) return;
    updateFurniturePatch(objectMenu.id, {
      scale: objectMenu.scale,
      color: objectMenu.color,
    });
    setObjectMenu((prev) => (prev ? { ...prev, dirty: false } : prev));
  };

  return (
    <div className={className ?? "absolute inset-0 h-full w-full"}>
      <div className="relative h-full w-full">
        <div ref={canvasHostRef} className="absolute inset-0" />
        <div ref={interactionRef} className="absolute inset-0" />

        {objectMenu ? (
          <div
            ref={menuRef}
            className="pointer-events-auto absolute z-40 w-[240px] rounded-2xl bg-white/90 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.22)] ring-1 ring-black/10 backdrop-blur-xl"
            style={{ left: objectMenu.x, top: objectMenu.y }}
          >
            <div className="mb-2 text-[11px] font-semibold tracking-wide text-black/55">
              Object settings
            </div>
            <label className="mb-2 grid gap-1">
              <span className="text-[11px] font-medium text-black/55">
                Size: {objectMenu.scale.toFixed(2)}x
              </span>
              <input
                type="range"
                min={0.2}
                max={5}
                step={0.01}
                value={objectMenu.scale}
                onChange={(e) => applyObjectMenuScale(Number(e.target.value))}
                className="h-2 w-full accent-black"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-medium text-black/55">Color</span>
              <div className="flex items-center gap-2 rounded-xl bg-black/[0.04] px-2 py-1.5 ring-1 ring-black/[0.06]">
                <input
                  type="color"
                  value={objectMenu.color}
                  onChange={(e) => applyObjectMenuColor(e.target.value)}
                  className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <span className="text-[11px] font-medium uppercase tracking-wide text-black/55">
                  {objectMenu.color}
                </span>
              </div>
            </label>
            <button
              type="button"
              onClick={saveObjectMenu}
              className="mt-3 h-9 w-full rounded-xl bg-black text-xs font-medium text-white shadow-sm transition duration-200 hover:scale-[1.01] active:scale-[1.00]"
            >
              {objectMenu.dirty ? "Save changes" : "Saved"}
            </button>
          </div>
        ) : null}

        <div className="pointer-events-none absolute right-6 top-6 z-30 rounded-2xl bg-black/55 px-3 py-2 text-[11px] font-medium text-white shadow-lg backdrop-blur">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-white/60">
            Input Debug
          </div>
          <div ref={debugTextRef}>hover | roomHit=false hull=false surface2D=false mode=ORBIT</div>
        </div>

        {/* Subtle interaction hint */}
        <div className="pointer-events-none absolute bottom-6 left-6 rounded-full bg-white/55 px-4 py-2 text-xs font-medium text-black/55 shadow-sm ring-1 ring-black/5 backdrop-blur">
          Click object • Use 3D gizmo (arrows / ring / square) • Drag to orbit • Press{" "}
          <span className="font-semibold">H</span> for controls
        </div>
      </div>
    </div>
  );
}

