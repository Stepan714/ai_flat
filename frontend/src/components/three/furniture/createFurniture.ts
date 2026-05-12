import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { FurnitureItem } from "@/components/three/furniture/types";
import type { FurnitureAppearance } from "@/components/three/furniture/appearance";
import { DEFAULT_FURNITURE_APPEARANCE } from "@/components/three/furniture/appearance";
import { Sofa } from "@/components/three/furniture/Sofa";
import { Table } from "@/components/three/furniture/Table";
import { Bed } from "@/components/three/furniture/Bed";
import { BLUEPRINT_BY_TYPE } from "@/components/three/furniture/blueprintCatalog";

type LegacyGeometryJson = {
  scale?: number;
  vertices?: number[];
  faces?: number[];
  uvs?: unknown[];
};

const blueprintGeometryCache = new Map<string, Promise<THREE.BufferGeometry>>();

function parseLegacyJsonGeometry(json: LegacyGeometryJson): THREE.BufferGeometry {
  const scale = typeof json.scale === "number" && Number.isFinite(json.scale) ? json.scale : 1;
  const vertices = Array.isArray(json.vertices) ? json.vertices : [];
  const faces = Array.isArray(json.faces) ? json.faces : [];
  const uvLayers = Array.isArray(json.uvs) ? json.uvs.length : 0;
  const positions: number[] = [];

  const pushTri = (a: number, b: number, c: number) => {
    const ia = a * 3;
    const ib = b * 3;
    const ic = c * 3;
    if (
      ia + 2 >= vertices.length ||
      ib + 2 >= vertices.length ||
      ic + 2 >= vertices.length
    ) {
      return;
    }
    positions.push(
      vertices[ia] * scale, vertices[ia + 1] * scale, vertices[ia + 2] * scale,
      vertices[ib] * scale, vertices[ib + 1] * scale, vertices[ib + 2] * scale,
      vertices[ic] * scale, vertices[ic + 1] * scale, vertices[ic + 2] * scale,
    );
  };

  let i = 0;
  while (i < faces.length) {
    const type = faces[i++] | 0;
    const isQuad = (type & 1) !== 0;
    const hasMaterial = (type & 2) !== 0;
    const hasFaceUv = (type & 4) !== 0;
    const hasFaceVertexUv = (type & 8) !== 0;
    const hasFaceNormal = (type & 16) !== 0;
    const hasFaceVertexNormal = (type & 32) !== 0;
    const hasFaceColor = (type & 64) !== 0;
    const hasFaceVertexColor = (type & 128) !== 0;
    const vertsPerFace = isQuad ? 4 : 3;

    const a = faces[i++] | 0;
    const b = faces[i++] | 0;
    const c = faces[i++] | 0;
    const d = isQuad ? (faces[i++] | 0) : 0;
    if (isQuad) {
      pushTri(a, b, d);
      pushTri(b, c, d);
    } else {
      pushTri(a, b, c);
    }

    if (hasMaterial) i += 1;
    if (hasFaceUv) i += uvLayers;
    if (hasFaceVertexUv) i += uvLayers * vertsPerFace;
    if (hasFaceNormal) i += 1;
    if (hasFaceVertexNormal) i += vertsPerFace;
    if (hasFaceColor) i += 1;
    if (hasFaceVertexColor) i += vertsPerFace;
  }

  const geometry = new THREE.BufferGeometry();
  if (positions.length === 0) {
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  } else {
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function loadBlueprintGeometry(modelFile: string): Promise<THREE.BufferGeometry> {
  const key = modelFile;
  let cached = blueprintGeometryCache.get(key);
  if (!cached) {
    cached = fetch(`/models/blueprint3d/${modelFile}`)
      .then((res) => (res.ok ? res.text() : "{}"))
      .then((text) => JSON.parse(text) as LegacyGeometryJson)
      .then((json) => parseLegacyJsonGeometry(json))
      .catch(() => new THREE.BoxGeometry(1, 1, 1));
    blueprintGeometryCache.set(key, cached);
  }
  return cached;
}

function makeBlueprintModel(
  item: FurnitureItem,
  appearance: FurnitureAppearance,
  position: THREE.Vector3Tuple,
  rotation: THREE.Vector3Tuple,
) {
  const def = BLUEPRINT_BY_TYPE.get(item.type);
  const holder = new THREE.Group();
  holder.position.set(position[0], position[1], position[2]);
  holder.rotation.set(rotation[0], rotation[1], rotation[2]);

  const fallback = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.7),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color("#d9e0ea"),
      roughness: 0.85,
      metalness: 0.02,
      transparent: true,
      opacity: 0.6,
    }),
  );
  fallback.position.y = 0.35;
  fallback.castShadow = true;
  fallback.receiveShadow = true;
  holder.add(fallback);
  if (!def) return holder;

  loadBlueprintGeometry(def.modelFile).then((geometry) => {
    const preset = resolvePreset(appearance);
    const color = typeof item.color === "string" ? item.color : preset.base;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: preset.roughness,
      metalness: preset.metalness,
    });
    const mesh = new THREE.Mesh(geometry.clone(), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox ?? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bb.getSize(size);
    bb.getCenter(center);
    const h = Math.max(0.001, size.y);
    const scale = def.targetHeight / h;
    mesh.scale.setScalar(scale);
    mesh.position.set(-center.x * scale, -bb.min.y * scale, -center.z * scale);

    holder.remove(fallback);
    holder.add(mesh);
  });

  return holder;
}

function addLegs(
  group: THREE.Group,
  width: number,
  depth: number,
  legHeight: number,
  legSize = 0.05,
) {
  const legGeo = new THREE.BoxGeometry(legSize, legHeight, legSize);
  const legMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#e3e6eb"),
    roughness: 0.55,
    metalness: 0.03,
  });
  const leg = new THREE.Mesh(legGeo, legMat);
  leg.castShadow = true;
  const lx = width / 2 - 0.09;
  const lz = depth / 2 - 0.09;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const m = leg.clone();
      m.position.set(sx * lx, legHeight / 2, sz * lz);
      group.add(m);
    }
  }
}

function makeSimpleTable(width: number, depth: number, height: number) {
  const group = new THREE.Group();
  const topT = 0.04;
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(width, topT, depth),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color("#f3f5f8"),
      roughness: 0.65,
      metalness: 0.02,
    }),
  );
  top.position.set(0, height - topT / 2, 0);
  top.castShadow = true;
  group.add(top);
  addLegs(group, width, depth, Math.max(0.28, height - topT), 0.05);
  return group;
}

type CabinetOptions = {
  mode?: "doors" | "open_shelves" | "drawers" | "tv";
  split?: 1 | 2 | 3;
};

function makeCabinet(width: number, depth: number, height: number, opts: CabinetOptions = {}) {
  const group = new THREE.Group();
  const shellT = Math.max(0.02, Math.min(0.035, Math.min(width, depth) * 0.08));
  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#eef2f7"),
    roughness: 0.82,
    metalness: 0.01,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#dde3ec"),
    roughness: 0.78,
    metalness: 0.02,
  });
  const handleMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#c4ccd8"),
    roughness: 0.35,
    metalness: 0.14,
  });

  const shell = new THREE.Mesh(
    new RoundedBoxGeometry(width, height, depth, 5, Math.min(0.03, shellT)),
    bodyMat,
  );
  shell.position.set(0, height / 2, 0);
  shell.castShadow = true;
  group.add(shell);

  const cavity = new THREE.Mesh(
    new THREE.BoxGeometry(
      Math.max(0.02, width - shellT * 2.2),
      Math.max(0.02, height - shellT * 2.2),
      Math.max(0.02, depth - shellT * 1.4),
    ),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color("#f7f9fc"),
      roughness: 0.9,
      metalness: 0.01,
      side: THREE.BackSide,
    }),
  );
  cavity.position.set(0, height / 2, shellT * 0.1);
  group.add(cavity);

  const topCap = new THREE.Mesh(
    new RoundedBoxGeometry(width, shellT, depth, 4, Math.min(0.02, shellT * 0.6)),
    accentMat,
  );
  topCap.position.set(0, height - shellT * 0.5, 0);
  group.add(topCap);

  const mode = opts.mode ?? "doors";
  const split = opts.split ?? (width > 1.1 ? 2 : 1);

  const addHandle = (x: number, y: number, z: number) => {
    const h = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.16, 12),
      handleMat,
    );
    h.rotation.x = Math.PI / 2;
    h.position.set(x, y, z);
    group.add(h);
  };

  if (mode === "open_shelves") {
    const shelves = Math.max(3, Math.floor(height / 0.45));
    for (let i = 1; i <= shelves; i += 1) {
      const y = (height / (shelves + 1)) * i;
      const shelf = new THREE.Mesh(
        new RoundedBoxGeometry(width - shellT * 2.2, shellT * 0.85, depth - shellT * 2.2, 3, 0.01),
        accentMat,
      );
      shelf.position.set(0, y, shellT * 0.15);
      group.add(shelf);

      // Decorative books to avoid "empty block" look.
      const booksCount = Math.max(2, Math.floor((width - shellT * 2.6) / 0.14));
      for (let b = 0; b < booksCount; b += 1) {
        if (Math.random() < 0.35) continue;
        const bw = 0.06 + (b % 3) * 0.01;
        const bh = 0.16 + (b % 4) * 0.03;
        const book = new THREE.Mesh(
          new RoundedBoxGeometry(bw, bh, 0.12, 2, 0.004),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(["#e3d7c8", "#cfd7e6", "#d8e1d3", "#d7d3e3"][b % 4]),
            roughness: 0.82,
            metalness: 0.0,
          }),
        );
        const x = -((width - shellT * 2.7) / 2) + b * 0.11;
        book.position.set(x, y + bh / 2 + shellT * 0.45, depth * 0.15);
        group.add(book);
      }
    }
    return group;
  }

  if (mode === "drawers") {
    const drawers = Math.max(2, Math.floor(height / 0.26));
    for (let i = 0; i < drawers; i += 1) {
      const dh = (height - shellT * 2.4) / drawers;
      const y = shellT + dh * i + dh / 2;
      const front = new THREE.Mesh(
        new RoundedBoxGeometry(width - shellT * 1.6, dh - shellT * 0.8, shellT * 0.9, 3, 0.01),
        accentMat,
      );
      front.position.set(0, y, depth / 2 + shellT * 0.06);
      front.castShadow = true;
      group.add(front);
      addHandle(0, y, depth / 2 + shellT * 0.34);
    }
    return group;
  }

  if (mode === "tv") {
    const niche = new THREE.Mesh(
      new RoundedBoxGeometry(width - shellT * 2.6, height * 0.32, depth - shellT * 1.8, 3, 0.01),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#f4f6f9"),
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.BackSide,
      }),
    );
    niche.position.set(0, height * 0.62, shellT * 0.15);
    group.add(niche);
    const doorH = height * 0.45;
    const doorW = (width - shellT * 2.2 - shellT * (split - 1)) / split;
    for (let i = 0; i < split; i += 1) {
      const x = -((split - 1) * (doorW + shellT)) / 2 + i * (doorW + shellT);
      const front = new THREE.Mesh(
        new RoundedBoxGeometry(doorW, doorH, shellT * 0.9, 3, 0.01),
        accentMat,
      );
      front.position.set(x, doorH * 0.5 + shellT, depth / 2 + shellT * 0.06);
      front.castShadow = true;
      group.add(front);
      addHandle(
        x + doorW * (i % 2 === 0 ? 0.28 : -0.28),
        doorH * 0.5 + shellT,
        depth / 2 + shellT * 0.34,
      );
    }
    return group;
  }

  // Default: door cabinet / wardrobe style.
  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(shellT * 0.45, height * 0.88, shellT * 0.9),
    accentMat,
  );
  seam.position.set(0, height * 0.5, depth / 2 + shellT * 0.04);
  group.add(seam);
  const doorW = (width - shellT * 2.2 - shellT * (split - 1)) / split;
  const doorH = height - shellT * 2.2;
  for (let i = 0; i < split; i += 1) {
    const x = -((split - 1) * (doorW + shellT)) / 2 + i * (doorW + shellT);
    const door = new THREE.Mesh(
      new RoundedBoxGeometry(doorW, doorH, shellT * 0.9, 4, 0.012),
      accentMat,
    );
    door.position.set(x, height * 0.5, depth / 2 + shellT * 0.06);
    door.castShadow = true;
    group.add(door);
    addHandle(
      x + doorW * (i % 2 === 0 ? 0.28 : -0.28),
      height * 0.5,
      depth / 2 + shellT * 0.34,
    );
  }
  return group;
}

function makePlant() {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.15, 0.3, 24),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color("#d9d4c8"),
      roughness: 0.85,
      metalness: 0.02,
    }),
  );
  pot.position.y = 0.15;
  pot.castShadow = true;
  group.add(pot);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.035, 0.5, 12),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color("#7c946d"),
      roughness: 0.9,
      metalness: 0,
    }),
  );
  stem.position.y = 0.52;
  group.add(stem);
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 10),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#9fb999"),
        roughness: 0.95,
        metalness: 0,
      }),
    );
    const angle = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 0.12, 0.78 + (i % 2) * 0.08, Math.sin(angle) * 0.12);
    group.add(leaf);
  }
  return group;
}

function makeProceduralDoor(
  position: THREE.Vector3Tuple,
  rotation: THREE.Vector3Tuple,
  isOpen: boolean,
) {
  const group = new THREE.Group();
  const w = 0.95;
  const h = 2.05;
  const t = 0.045;
  const frameT = 0.045;

  const frameMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#f2f4f8"),
    roughness: 0.78,
    metalness: 0.02,
  });
  const doorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#e7ebf2"),
    roughness: 0.72,
    metalness: 0.02,
  });
  const handleMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#cfd6e1"),
    roughness: 0.35,
    metalness: 0.15,
  });

  const top = new THREE.Mesh(new THREE.BoxGeometry(w + frameT * 2, frameT, t), frameMat);
  top.position.set(0, h - frameT / 2, 0);
  const left = new THREE.Mesh(new THREE.BoxGeometry(frameT, h, t), frameMat);
  left.position.set(-w / 2 - frameT / 2, h / 2, 0);
  const right = new THREE.Mesh(new THREE.BoxGeometry(frameT, h, t), frameMat);
  right.position.set(w / 2 + frameT / 2, h / 2, 0);
  group.add(top, left, right);

  const doorPivot = new THREE.Group();
  doorPivot.position.set(-w / 2, 0, 0);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.02, t * 0.8), doorMat);
  leaf.position.set(w / 2, h / 2, 0.002);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  doorPivot.add(leaf);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 14), handleMat);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(w - 0.12, h * 0.52, t * 0.45);
  doorPivot.add(handle);
  if (isOpen) doorPivot.rotation.y = -Math.PI * 0.38;
  group.add(doorPivot);

  group.position.set(position[0], position[1] - h / 2, position[2]);
  group.rotation.set(rotation[0], rotation[1], rotation[2]);
  return group;
}

function makeProceduralWindow(position: THREE.Vector3Tuple, rotation: THREE.Vector3Tuple) {
  const group = new THREE.Group();
  const w = 1.2;
  const h = 1.2;
  const t = 0.04;
  const frameT = 0.06;

  const frameMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#f3f5f8"),
    roughness: 0.76,
    metalness: 0.02,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#d9ecff"),
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.28,
  });

  const top = new THREE.Mesh(new THREE.BoxGeometry(w + frameT * 2, frameT, t), frameMat);
  top.position.set(0, h - frameT / 2, 0);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(w + frameT * 2, frameT, t), frameMat);
  bottom.position.set(0, frameT / 2, 0);
  const left = new THREE.Mesh(new THREE.BoxGeometry(frameT, h, t), frameMat);
  left.position.set(-w / 2 - frameT / 2, h / 2, 0);
  const right = new THREE.Mesh(new THREE.BoxGeometry(frameT, h, t), frameMat);
  right.position.set(w / 2 + frameT / 2, h / 2, 0);
  const midV = new THREE.Mesh(new THREE.BoxGeometry(frameT * 0.8, h - frameT * 2, t * 0.9), frameMat);
  midV.position.set(0, h / 2, 0);
  const midH = new THREE.Mesh(new THREE.BoxGeometry(w - frameT * 1.2, frameT * 0.8, t * 0.9), frameMat);
  midH.position.set(0, h / 2, 0);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - frameT * 1.6, h - frameT * 1.6), glassMat);
  glass.position.set(0, h / 2, 0.005);

  for (const m of [top, bottom, left, right, midV, midH]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(top, bottom, left, right, midV, midH, glass);
  group.position.set(position[0], position[1] - h / 2, position[2]);
  group.rotation.set(rotation[0], rotation[1], rotation[2]);
  return group;
}

export function createFurniture(
  item: FurnitureItem,
  appearance: FurnitureAppearance = DEFAULT_FURNITURE_APPEARANCE,
): THREE.Object3D {
  const position: THREE.Vector3Tuple = [
    item.position[0],
    item.position[1],
    item.position[2],
  ];
  const rotation: THREE.Vector3Tuple = [
    item.rotation[0],
    item.rotation[1],
    item.rotation[2],
  ];

  if (item.type === "bp_open_door") {
    const obj = makeProceduralDoor(position, rotation, true);
    const s = typeof item.scale === "number" && Number.isFinite(item.scale) ? item.scale : 1;
    obj.scale.setScalar(Math.max(0.2, Math.min(5, s)));
    return obj;
  }
  if (item.type === "bp_closed_door_28x80") {
    const obj = makeProceduralDoor(position, rotation, false);
    const s = typeof item.scale === "number" && Number.isFinite(item.scale) ? item.scale : 1;
    obj.scale.setScalar(Math.max(0.2, Math.min(5, s)));
    return obj;
  }
  if (item.type === "bp_white_window") {
    const obj = makeProceduralWindow(position, rotation);
    const s = typeof item.scale === "number" && Number.isFinite(item.scale) ? item.scale : 1;
    obj.scale.setScalar(Math.max(0.2, Math.min(5, s)));
    return obj;
  }

  if (item.type.startsWith("bp_")) {
    const obj = makeBlueprintModel(item, appearance, position, rotation);
    const s = typeof item.scale === "number" && Number.isFinite(item.scale) ? item.scale : 1;
    obj.scale.setScalar(Math.max(0.2, Math.min(5, s)));
    return obj;
  }

  let obj: THREE.Object3D;
  switch (item.type) {
    case "sofa":
      obj = new Sofa({ position, rotation });
      break;
    case "table":
      obj = new Table({ position, rotation });
      break;
    case "bed":
      obj = new Bed({ position, rotation });
      break;
    case "armchair": {
      obj = new Sofa({ position, rotation });
      obj.scale.set(0.45, 0.45, 0.55);
      break;
    }
    case "chair":
      obj = makeSimpleTable(0.52, 0.52, 0.9);
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "pouf":
      obj = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.3, 0.42, 20),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#eef1f6"),
          roughness: 0.95,
          metalness: 0,
        }),
      );
      obj.position.set(position[0], 0.21, position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "bench":
      obj = makeSimpleTable(1.35, 0.45, 0.52);
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "coffee_table":
      obj = makeSimpleTable(1.1, 0.6, 0.43);
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "side_table":
      obj = makeSimpleTable(0.5, 0.5, 0.52);
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "desk":
      obj = makeSimpleTable(1.45, 0.68, 0.76);
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "console":
      obj = makeSimpleTable(1.3, 0.38, 0.82);
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "nightstand":
      obj = makeCabinet(0.5, 0.42, 0.55, { mode: "drawers", split: 1 });
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "bookshelf":
      obj = makeCabinet(0.92, 0.34, 2.0, { mode: "open_shelves", split: 1 });
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "wardrobe":
      obj = makeCabinet(1.6, 0.62, 2.25, { mode: "doors", split: 2 });
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "dresser":
      obj = makeCabinet(1.25, 0.5, 0.92, { mode: "drawers", split: 2 });
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "tv_stand":
      obj = makeCabinet(1.6, 0.42, 0.58, { mode: "tv", split: 2 });
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "cabinet":
      obj = makeCabinet(0.9, 0.45, 1.2, { mode: "doors", split: 1 });
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "plant":
      obj = makePlant();
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    case "floor_lamp": {
      const group = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.05, 18),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#dfe4eb"),
          roughness: 0.45,
          metalness: 0.08,
        }),
      );
      base.position.y = 0.025;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 1.45, 12),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#e5e9ef"),
          roughness: 0.35,
          metalness: 0.08,
        }),
      );
      stem.position.y = 0.75;
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 0.28, 24, 1, true),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#f4f6fa"),
          roughness: 0.88,
          metalness: 0,
          side: THREE.DoubleSide,
        }),
      );
      shade.position.y = 1.57;
      shade.rotation.x = Math.PI;
      group.add(base, stem, shade);
      obj = group;
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    }
    case "lamp": {
      const group = new THREE.Group();
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.07, 0.08, 16),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#d8dee8"),
          roughness: 0.65,
          metalness: 0.05,
        }),
      );
      b.position.y = 0.04;
      const s = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.2, 12),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#e9edf3"),
          roughness: 0.5,
          metalness: 0.06,
        }),
      );
      s.position.y = 0.18;
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.18, 16, 1, true),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#fafbfc"),
          roughness: 0.9,
          metalness: 0,
          side: THREE.DoubleSide,
        }),
      );
      shade.position.y = 0.38;
      shade.rotation.x = Math.PI;
      group.add(b, s, shade);
      obj = group;
      obj.position.set(position[0], position[1], position[2]);
      obj.rotation.set(rotation[0], rotation[1], rotation[2]);
      break;
    }
    default: {
      throw new Error(`Unknown furniture type: ${String(item.type)}`);
    }
  }

  const s = typeof item.scale === "number" && Number.isFinite(item.scale) ? item.scale : 1;
  obj.scale.setScalar(Math.max(0.2, Math.min(5, s)));
  applyAppearance(obj, item, appearance);
  return obj;
}

function resolvePreset(appearance: FurnitureAppearance) {
  const baseByMaterial: Record<FurnitureAppearance["material"], string> = {
    ivory_oak: "#f2f4f7",
    walnut: "#8a6f5a",
    ash_gray: "#cdd3dc",
    graphite: "#5f6670",
  };
  const accentByMaterial: Record<FurnitureAppearance["material"], string> = {
    ivory_oak: "#e5d9c7",
    walnut: "#6e5747",
    ash_gray: "#b9c2cf",
    graphite: "#444b53",
  };
  const metalByMaterial: Record<FurnitureAppearance["material"], string> = {
    ivory_oak: "#d7dce4",
    walnut: "#b8b2aa",
    ash_gray: "#9ca7b5",
    graphite: "#7a828f",
  };

  const roughnessByDesign: Record<FurnitureAppearance["design"], number> = {
    apple_soft: 0.86,
    modern: 0.68,
    scandinavian: 0.8,
    industrial: 0.52,
  };
  const metalnessByDesign: Record<FurnitureAppearance["design"], number> = {
    apple_soft: 0.02,
    modern: 0.08,
    scandinavian: 0.03,
    industrial: 0.16,
  };

  return {
    base: baseByMaterial[appearance.material],
    accent: accentByMaterial[appearance.material],
    metal: metalByMaterial[appearance.material],
    roughness: roughnessByDesign[appearance.design],
    metalness: metalnessByDesign[appearance.design],
  };
}

function applyAppearance(
  obj: THREE.Object3D,
  item: FurnitureItem,
  appearance: FurnitureAppearance,
) {
  const preset = resolvePreset(appearance);
  const overrideColor = typeof item.color === "string" ? item.color : null;
  let idx = 0;
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as THREE.Material & {
        color?: THREE.Color;
        roughness?: number;
        metalness?: number;
        needsUpdate?: boolean;
      };
      if (!m.color) continue;
      const palette = idx % 4;
      const clr =
        overrideColor ??
        (palette === 0 ? preset.base : palette === 1 ? preset.accent : palette === 2 ? preset.base : preset.metal);
      m.color.set(clr);
      if (typeof m.roughness === "number") m.roughness = preset.roughness;
      if (typeof m.metalness === "number") m.metalness = preset.metalness;
      if (typeof m.needsUpdate === "boolean") m.needsUpdate = true;
      idx += 1;
    }
  });
}

