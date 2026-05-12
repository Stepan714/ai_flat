import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type BedProps = {
  position?: THREE.Vector3Tuple;
  rotation?: THREE.Vector3Tuple; // Euler radians
};

export class Bed extends THREE.Group {
  constructor({ position = [0, 0, 0], rotation = [0, 0, 0] }: BedProps) {
    super();
    this.position.set(position[0], position[1], position[2]);
    this.rotation.set(rotation[0], rotation[1], rotation[2]);

    // Double bed (meters)
    const frameW = 1.6;
    const frameL = 2.05;
    const frameH = 0.22;
    const legH = 0.12;

    const mattressH = 0.23;
    const headboardH = 0.95;
    const headboardT = 0.07;

    const frameMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#f3f3f3"),
      roughness: 0.9,
      metalness: 0.0,
    });

    const mattressMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#ffffff"),
      roughness: 0.85,
      metalness: 0.0,
    });

    const frame = new THREE.Mesh(
      new RoundedBoxGeometry(frameW, frameH, frameL, 6, 0.05),
      frameMat,
    );
    frame.position.set(0, legH + frameH / 2, 0);
    frame.castShadow = true;

    const mattress = new THREE.Mesh(
      new RoundedBoxGeometry(frameW * 0.98, mattressH, frameL * 0.96, 6, 0.06),
      mattressMat,
    );
    mattress.position.set(0, legH + frameH + mattressH / 2 - 0.03, 0.01);
    mattress.castShadow = true;

    const headboard = new THREE.Mesh(
      new RoundedBoxGeometry(frameW, headboardH, headboardT, 6, 0.03),
      frameMat,
    );
    headboard.position.set(
      0,
      legH + frameH + headboardH / 2 - 0.02,
      -(frameL / 2) + headboardT / 2,
    );
    headboard.castShadow = true;

    const legMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#dedede"),
      roughness: 0.55,
      metalness: 0.03,
    });
    const legGeo = new THREE.BoxGeometry(0.06, legH, 0.06);
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.castShadow = true;

    const lx = frameW / 2 - 0.12;
    const lz = frameL / 2 - 0.12;
    const legs: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const m = leg.clone();
        m.position.set(sx * lx, legH / 2, sz * lz);
        legs.push(m);
      }
    }

    this.add(frame, mattress, headboard, ...legs);
  }
}

