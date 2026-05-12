import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type SofaProps = {
  position?: THREE.Vector3Tuple;
  rotation?: THREE.Vector3Tuple; // Euler radians
};

export class Sofa extends THREE.Group {
  constructor({ position = [0, 0, 0], rotation = [0, 0, 0] }: SofaProps) {
    super();
    this.position.set(position[0], position[1], position[2]);
    this.rotation.set(rotation[0], rotation[1], rotation[2]);

    // Realistic scale (meters)
    const width = 2.2;
    const depth = 0.92;
    const seatHeight = 0.42;
    const armHeight = 0.58;
    const backHeight = 0.78;
    const legH = 0.12;

    const fabric = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#f0f2f5"),
      roughness: 0.95,
      metalness: 0.0,
    });

    const base = new THREE.Mesh(
      new RoundedBoxGeometry(width, seatHeight, depth, 6, 0.055),
      fabric,
    );
    base.position.set(0, legH + seatHeight / 2, 0);
    base.castShadow = true;
    base.receiveShadow = false;

    const back = new THREE.Mesh(
      new RoundedBoxGeometry(width, backHeight, 0.18, 6, 0.05),
      fabric,
    );
    back.position.set(0, legH + seatHeight + backHeight / 2 - 0.08, -(depth / 2) + 0.09);
    back.castShadow = true;

    const armL = new THREE.Mesh(
      new RoundedBoxGeometry(0.18, armHeight, depth, 6, 0.045),
      fabric,
    );
    armL.position.set(-(width / 2) + 0.09, legH + seatHeight + (armHeight - seatHeight) / 2 - 0.02, 0);
    armL.castShadow = true;

    const armR = armL.clone();
    armR.position.x = width / 2 - 0.09;

    const legMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#d6d6d6"),
      roughness: 0.55,
      metalness: 0.05,
    });
    const legGeo = new THREE.BoxGeometry(0.06, legH, 0.06);
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.castShadow = true;

    const lx = width / 2 - 0.16;
    const lz = depth / 2 - 0.16;
    const legs: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const m = leg.clone();
        m.position.set(sx * lx, legH / 2, sz * lz);
        legs.push(m);
      }
    }

    this.add(base, back, armL, armR, ...legs);
  }
}

