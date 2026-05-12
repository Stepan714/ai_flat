import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createOakTexture } from "@/lib/three/oakTexture";

export type TableProps = {
  position?: THREE.Vector3Tuple;
  rotation?: THREE.Vector3Tuple; // Euler radians
};

export class Table extends THREE.Group {
  constructor({ position = [0, 0, 0], rotation = [0, 0, 0] }: TableProps) {
    super();
    this.position.set(position[0], position[1], position[2]);
    this.rotation.set(rotation[0], rotation[1], rotation[2]);

    // Realistic dining table (meters)
    const topW = 1.6;
    const topD = 0.85;
    const topT = 0.045;
    const legH = 0.72;
    const legS = 0.06;

    const oak = createOakTexture({ repeat: 2, seed: 11 });
    const wood = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#ffffff"),
      map: oak,
      roughness: 0.65,
      metalness: 0.02,
    });

    const top = new THREE.Mesh(new RoundedBoxGeometry(topW, topT, topD, 6, 0.025), wood);
    top.position.set(0, legH + topT / 2, 0);
    top.castShadow = true;
    top.receiveShadow = false;

    const legMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#e7e7e7"),
      roughness: 0.5,
      metalness: 0.03,
    });
    const legGeo = new THREE.CylinderGeometry(legS * 0.5, legS * 0.5, legH, 14);
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.castShadow = true;

    const lx = topW / 2 - 0.12;
    const lz = topD / 2 - 0.12;
    const legs: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const m = leg.clone();
        m.position.set(sx * lx, legH / 2, sz * lz);
        legs.push(m);
      }
    }

    this.add(top, ...legs);
  }
}

