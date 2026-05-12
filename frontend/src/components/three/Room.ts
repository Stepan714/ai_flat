import * as THREE from "three";
import { createOakTexture } from "@/lib/three/oakTexture";

export type RoomProps = {
  width: number;
  length: number;
  height: number;
  openings?: RoomOpening[];
};

export type RoomWallSide = "front" | "back" | "left" | "right";

export type RoomOpening = {
  wall: RoomWallSide;
  center: number; // x for front/back, z for left/right
  width: number;
  height: number;
  bottom: number;
};

type RoomParts = {
  floor: THREE.Mesh;
  ceiling: THREE.Mesh;
  walls: [THREE.Mesh, THREE.Mesh, THREE.Mesh, THREE.Mesh];
  guideEdges: THREE.LineSegments;
  wallBySide: {
    front: THREE.Mesh;
    back: THREE.Mesh;
    left: THREE.Mesh;
    right: THREE.Mesh;
  };
  materials: {
    wall: THREE.MeshStandardMaterial;
    floor: THREE.MeshStandardMaterial;
    guide: THREE.LineBasicMaterial;
  };
  geometries: {
    floor: THREE.BoxGeometry;
    ceiling: THREE.BoxGeometry;
    walls: [THREE.ShapeGeometry, THREE.ShapeGeometry, THREE.ShapeGeometry, THREE.ShapeGeometry];
    guide: THREE.EdgesGeometry;
  };
  textures: {
    floorOak: THREE.Texture;
  };
};

function buildWallGeometry(span: number, height: number, openings: RoomOpening[]) {
  const half = span / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(half, height);
  shape.lineTo(-half, height);
  shape.lineTo(-half, 0);

  for (const o of openings) {
    const w = Math.max(0.12, Math.min(span - 0.12, o.width));
    const h = Math.max(0.2, Math.min(height - 0.1, o.height));
    const bottom = Math.max(0.02, Math.min(height - h - 0.02, o.bottom));
    const cx = Math.max(-half + w / 2 + 0.02, Math.min(half - w / 2 - 0.02, o.center));
    const hole = new THREE.Path();
    hole.moveTo(cx - w / 2, bottom);
    hole.lineTo(cx + w / 2, bottom);
    hole.lineTo(cx + w / 2, bottom + h);
    hole.lineTo(cx - w / 2, bottom + h);
    hole.lineTo(cx - w / 2, bottom);
    shape.holes.push(hole);
  }

  return new THREE.ShapeGeometry(shape);
}

export class Room extends THREE.Group {
  public readonly width: number;
  public readonly length: number;
  public readonly height: number;

  private readonly parts: RoomParts;

  constructor({ width, length, height, openings = [] }: RoomProps) {
    super();
    this.width = width;
    this.length = length;
    this.height = height;

    const t = 0.12; // wall/floor thickness (m)
    const floorY = -t / 2;
    const ceilingY = height + t / 2;

    const floorOak = createOakTexture({ repeat: Math.max(1, Math.round(Math.max(width, length) / 2)) });

    const wallMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#f2f5fa"),
      roughness: 0.9,
      metalness: 0.0,
    });
    // Make the room readable from any orbit angle (inside/outside).
    wallMat.side = THREE.DoubleSide;

    const floorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#f4f1e7"),
      map: floorOak,
      roughness: 0.65,
      metalness: 0.05,
    });

    const floorGeo = new THREE.BoxGeometry(width, t, length);
    const ceilingGeo = new THREE.BoxGeometry(width, t, length);
    const frontGeo = buildWallGeometry(width, height, openings.filter((o) => o.wall === "front"));
    const backGeo = buildWallGeometry(width, height, openings.filter((o) => o.wall === "back"));
    const leftGeo = buildWallGeometry(length, height, openings.filter((o) => o.wall === "left"));
    const rightGeo = buildWallGeometry(length, height, openings.filter((o) => o.wall === "right"));

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, floorY, 0);
    floor.receiveShadow = true;
    (floor.userData as { roomSurface?: string }).roomSurface = "floor";

    const ceiling = new THREE.Mesh(ceilingGeo, wallMat);
    ceiling.position.set(0, ceilingY, 0);
    ceiling.receiveShadow = true;
    (ceiling.userData as { roomSurface?: string }).roomSurface = "ceiling";

    const front = new THREE.Mesh(frontGeo, wallMat);
    front.position.set(0, 0, -length / 2);
    front.receiveShadow = true;
    (front.userData as { roomSurface?: string }).roomSurface = "wall";

    const back = new THREE.Mesh(backGeo, wallMat);
    back.position.set(0, 0, length / 2);
    back.receiveShadow = true;
    (back.userData as { roomSurface?: string }).roomSurface = "wall";

    const left = new THREE.Mesh(leftGeo, wallMat);
    left.position.set(-width / 2, 0, 0);
    left.rotation.y = Math.PI / 2;
    left.receiveShadow = true;
    (left.userData as { roomSurface?: string }).roomSurface = "wall";

    const right = new THREE.Mesh(rightGeo, wallMat);
    right.position.set(width / 2, 0, 0);
    right.rotation.y = Math.PI / 2;
    right.receiveShadow = true;
    (right.userData as { roomSurface?: string }).roomSurface = "wall";

    // Keep the room as a shadow receiver; let other objects cast.
    for (const m of [floor, ceiling, front, back, left, right]) {
      m.castShadow = false;
    }

    // Thin edges make room silhouette readable against bright backgrounds.
    const guideGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, length));
    const guideMat = new THREE.LineBasicMaterial({
      color: new THREE.Color("#98a4bd"),
      transparent: true,
      opacity: 0.82,
    });
    const guideEdges = new THREE.LineSegments(guideGeo, guideMat);
    guideEdges.position.set(0, height / 2, 0);
    guideEdges.renderOrder = 2;

    this.add(floor, ceiling, front, back, left, right, guideEdges);

    this.parts = {
      floor,
      ceiling,
      walls: [front, back, left, right],
      guideEdges,
      wallBySide: { front, back, left, right },
      materials: { wall: wallMat, floor: floorMat, guide: guideMat },
      geometries: {
        floor: floorGeo,
        ceiling: ceilingGeo,
        walls: [frontGeo, backGeo, leftGeo, rightGeo],
        guide: guideGeo,
      },
      textures: { floorOak },
    };
  }

  /**
   * If the camera goes outside the room volume, hide the closest wall(s)
   * (and optionally ceiling) so interior objects don't disappear behind walls.
   */
  updateCutaway(cameraWorldPos: THREE.Vector3) {
    const halfW = this.width / 2;
    const halfL = this.length / 2;

    const outsideXPos = cameraWorldPos.x > halfW;
    const outsideXNeg = cameraWorldPos.x < -halfW;
    const outsideZPos = cameraWorldPos.z > halfL;
    const outsideZNeg = cameraWorldPos.z < -halfL;
    const outsideYPos = cameraWorldPos.y > this.height;

    // Default: show all
    const { wallBySide, ceiling } = this.parts;
    wallBySide.front.visible = true;
    wallBySide.back.visible = true;
    wallBySide.left.visible = true;
    wallBySide.right.visible = true;
    ceiling.visible = true;

    const isOutside = outsideXPos || outsideXNeg || outsideZPos || outsideZNeg || outsideYPos;
    if (!isOutside) return;

    // Hide walls that block the view from outside.
    if (outsideXPos) wallBySide.right.visible = false;
    if (outsideXNeg) wallBySide.left.visible = false;
    if (outsideZPos) wallBySide.back.visible = false;
    if (outsideZNeg) wallBySide.front.visible = false;

    // If camera is above the room, hide ceiling.
    if (outsideYPos) ceiling.visible = false;
  }

  setFloorAnisotropy(anisotropy: number) {
    const tex = this.parts.textures.floorOak;
    tex.anisotropy = anisotropy;
    tex.needsUpdate = true;
  }

  setWallColor(color: THREE.ColorRepresentation) {
    this.parts.materials.wall.color.set(color);
    this.parts.materials.wall.needsUpdate = true;
  }

  setFloorColor(color: THREE.ColorRepresentation) {
    this.parts.materials.floor.color.set(color);
    this.parts.materials.floor.needsUpdate = true;
  }

  setOpenings(openings: RoomOpening[]) {
    const frontGeo = buildWallGeometry(this.width, this.height, openings.filter((o) => o.wall === "front"));
    const backGeo = buildWallGeometry(this.width, this.height, openings.filter((o) => o.wall === "back"));
    const leftGeo = buildWallGeometry(this.length, this.height, openings.filter((o) => o.wall === "left"));
    const rightGeo = buildWallGeometry(this.length, this.height, openings.filter((o) => o.wall === "right"));

    const [front, back, left, right] = this.parts.walls;
    this.parts.geometries.walls[0].dispose();
    this.parts.geometries.walls[1].dispose();
    this.parts.geometries.walls[2].dispose();
    this.parts.geometries.walls[3].dispose();

    front.geometry = frontGeo;
    back.geometry = backGeo;
    left.geometry = leftGeo;
    right.geometry = rightGeo;
    this.parts.geometries.walls = [frontGeo, backGeo, leftGeo, rightGeo];
  }

  dispose() {
    const { geometries, materials, textures } = this.parts;
    geometries.floor.dispose();
    geometries.ceiling.dispose();
    for (const g of geometries.walls) g.dispose();
    geometries.guide.dispose();

    textures.floorOak.dispose();

    materials.floor.dispose();
    materials.wall.dispose();
    materials.guide.dispose();
  }
}

