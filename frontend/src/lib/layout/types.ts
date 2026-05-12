import type { FurnitureType } from "@/components/three/furniture/types";

export type RoomSize = {
  width: number;
  length: number;
  height: number;
};

export type LayoutStyle = "minimalism" | "modern" | "scandinavian";

export type LayoutObject = {
  type: FurnitureType;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  color?: string;
};

export type GenerateLayoutRequest = {
  room: RoomSize;
  style: LayoutStyle;
  prompt?: string;
};

export type GenerateLayoutResponse = {
  objects: LayoutObject[];
  room?: Partial<RoomSize>;
  sceneColors?: {
    walls?: string;
    floor?: string;
    furniture?: string;
  };
  furnitureAppearance?: {
    design?: "apple_soft" | "modern" | "scandinavian" | "industrial";
    material?: "ivory_oak" | "walnut" | "ash_gray" | "graphite";
  };
  rationale?: string;
};

