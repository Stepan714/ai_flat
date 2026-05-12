import type { FurnitureType } from "@/components/three/furniture/types";
import { BLUEPRINT_CATALOG } from "@/components/three/furniture/blueprintCatalog";

export type FurniturePlacement = "wall" | "center" | "corner" | "flex";

export type FurnitureCatalogItem = {
  type: FurnitureType;
  label: string;
  category: string;
  footprint: {
    width: number;
    depth: number;
    height: number;
  };
  placement: FurniturePlacement;
  mount?: "floor" | "wall";
  opening?: {
    width: number;
    height: number;
    sill: number;
  };
};

export const FURNITURE_CATALOG: FurnitureCatalogItem[] = [
  { type: "sofa", label: "Sofa", category: "seating", footprint: { width: 2.2, depth: 0.92, height: 0.9 }, placement: "wall" },
  { type: "armchair", label: "Armchair", category: "seating", footprint: { width: 0.9, depth: 0.9, height: 0.95 }, placement: "flex" },
  { type: "chair", label: "Chair", category: "seating", footprint: { width: 0.52, depth: 0.52, height: 0.9 }, placement: "flex" },
  { type: "pouf", label: "Pouf", category: "seating", footprint: { width: 0.62, depth: 0.62, height: 0.48 }, placement: "center" },
  { type: "bench", label: "Bench", category: "seating", footprint: { width: 1.35, depth: 0.45, height: 0.52 }, placement: "wall" },

  { type: "table", label: "Dining Table", category: "tables", footprint: { width: 1.6, depth: 0.85, height: 0.77 }, placement: "center" },
  { type: "coffee_table", label: "Coffee Table", category: "tables", footprint: { width: 1.1, depth: 0.6, height: 0.43 }, placement: "center" },
  { type: "side_table", label: "Side Table", category: "tables", footprint: { width: 0.5, depth: 0.5, height: 0.52 }, placement: "flex" },
  { type: "desk", label: "Desk", category: "tables", footprint: { width: 1.45, depth: 0.68, height: 0.76 }, placement: "wall" },
  { type: "console", label: "Console", category: "tables", footprint: { width: 1.3, depth: 0.38, height: 0.82 }, placement: "wall" },

  { type: "bed", label: "Bed", category: "sleep", footprint: { width: 1.6, depth: 2.05, height: 1.0 }, placement: "wall" },
  { type: "nightstand", label: "Nightstand", category: "sleep", footprint: { width: 0.5, depth: 0.42, height: 0.55 }, placement: "wall" },

  { type: "bookshelf", label: "Bookshelf", category: "storage", footprint: { width: 0.92, depth: 0.34, height: 2.0 }, placement: "wall" },
  { type: "wardrobe", label: "Wardrobe", category: "storage", footprint: { width: 1.6, depth: 0.62, height: 2.25 }, placement: "wall" },
  { type: "dresser", label: "Dresser", category: "storage", footprint: { width: 1.25, depth: 0.5, height: 0.92 }, placement: "wall" },
  { type: "tv_stand", label: "TV Stand", category: "storage", footprint: { width: 1.6, depth: 0.42, height: 0.58 }, placement: "wall" },
  { type: "cabinet", label: "Cabinet", category: "storage", footprint: { width: 0.9, depth: 0.45, height: 1.2 }, placement: "wall" },

  { type: "plant", label: "Plant", category: "decor", footprint: { width: 0.52, depth: 0.52, height: 1.3 }, placement: "corner" },
  { type: "floor_lamp", label: "Floor Lamp", category: "decor", footprint: { width: 0.35, depth: 0.35, height: 1.7 }, placement: "corner" },
  { type: "lamp", label: "Table Lamp", category: "decor", footprint: { width: 0.25, depth: 0.25, height: 0.45 }, placement: "flex" },

  ...BLUEPRINT_CATALOG.map((item) => ({
    type: item.type as FurnitureType,
    label: item.label,
    category: item.category,
    footprint: item.footprint,
    placement: item.placement,
    mount: item.mount,
    opening: item.opening,
  })),
];

export const FURNITURE_CATALOG_MAP = new Map<FurnitureType, FurnitureCatalogItem>(
  FURNITURE_CATALOG.map((item) => [item.type, item]),
);

