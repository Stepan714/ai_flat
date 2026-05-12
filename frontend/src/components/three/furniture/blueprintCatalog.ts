import type { FurniturePlacement } from "@/components/three/furniture/catalog";

export type BlueprintCatalogItem = {
  type: string;
  label: string;
  category: string;
  footprint: { width: number; depth: number; height: number };
  placement: FurniturePlacement;
  mount?: "floor" | "wall";
  opening?: {
    width: number;
    height: number;
    sill: number;
  };
  modelFile: string;
  targetHeight: number;
};

export const BLUEPRINT_CATALOG: BlueprintCatalogItem[] = [
  { type: "bp_blake_avenue_chef_table", label: "BP Chef Table", category: "blueprint / tables", footprint: { width: 2.2, depth: 1.0, height: 0.9 }, placement: "center", modelFile: "BlakeAvenuejoshuatreecheftable.js", targetHeight: 0.9 },
  { type: "bp_dwr_matera_dresser_2", label: "BP Matera Dresser", category: "blueprint / storage", footprint: { width: 1.5, depth: 0.55, height: 0.92 }, placement: "wall", modelFile: "DWR_MATERA_DRESSER2.js", targetHeight: 0.92 },
  { type: "bp_gus_ossington_end_table", label: "BP Ossington End Table", category: "blueprint / tables", footprint: { width: 0.6, depth: 0.6, height: 0.55 }, placement: "flex", modelFile: "GUSossingtonendtable.js", targetHeight: 0.55 },
  { type: "bp_bd_shale_bedside_smoke", label: "BP Shale Bedside", category: "blueprint / storage", footprint: { width: 0.6, depth: 0.45, height: 0.58 }, placement: "wall", modelFile: "bd-shalebedside-smoke_baked.js", targetHeight: 0.58 },
  { type: "bp_cb_archnight_white", label: "BP Arch Nightstand", category: "blueprint / storage", footprint: { width: 0.55, depth: 0.43, height: 0.58 }, placement: "wall", modelFile: "cb-archnight-white_baked.js", targetHeight: 0.58 },
  { type: "bp_cb_blue_block_60x96", label: "BP Blue Block Art", category: "blueprint / decor", footprint: { width: 1.0, depth: 0.1, height: 0.65 }, placement: "wall", mount: "wall", modelFile: "cb-blue-block-60x96.js", targetHeight: 0.65 },
  { type: "bp_cb_clapboard", label: "BP Clapboard Decor", category: "blueprint / decor", footprint: { width: 1.0, depth: 0.2, height: 0.8 }, placement: "wall", modelFile: "cb-clapboard_baked.js", targetHeight: 0.8 },
  { type: "bp_cb_kendall_bookcase_walnut", label: "BP Kendall Bookcase", category: "blueprint / storage", footprint: { width: 1.1, depth: 0.36, height: 2.0 }, placement: "wall", modelFile: "cb-kendallbookcasewalnut_baked.js", targetHeight: 2.0 },
  { type: "bp_cb_moore", label: "BP Moore Decor", category: "blueprint / decor", footprint: { width: 0.9, depth: 0.2, height: 0.7 }, placement: "wall", mount: "wall", modelFile: "cb-moore_baked.js", targetHeight: 0.7 },
  { type: "bp_cb_rochelle_gray", label: "BP Rochelle Gray", category: "blueprint / decor", footprint: { width: 1.0, depth: 0.2, height: 0.8 }, placement: "wall", mount: "wall", modelFile: "cb-rochelle-gray_baked.js", targetHeight: 0.8 },
  { type: "bp_cb_scholar_table", label: "BP Scholar Table", category: "blueprint / tables", footprint: { width: 1.45, depth: 0.7, height: 0.76 }, placement: "wall", modelFile: "cb-scholartable_baked.js", targetHeight: 0.76 },
  { type: "bp_cb_tecs", label: "BP Tecs Table", category: "blueprint / tables", footprint: { width: 1.2, depth: 0.65, height: 0.74 }, placement: "center", modelFile: "cb-tecs_baked.js", targetHeight: 0.74 },
  { type: "bp_closed_door_28x80", label: "BP Closed Door", category: "blueprint / doors & windows", footprint: { width: 0.95, depth: 0.12, height: 2.05 }, placement: "wall", mount: "wall", opening: { width: 0.95, height: 2.05, sill: 0.0 }, modelFile: "closed-door28x80_baked.js", targetHeight: 2.05 },
  { type: "bp_gus_church_chair_whiteoak", label: "BP Church Chair", category: "blueprint / seating", footprint: { width: 0.58, depth: 0.62, height: 0.92 }, placement: "flex", modelFile: "gus-churchchair-whiteoak.js", targetHeight: 0.92 },
  { type: "bp_ik_ekero_blue", label: "BP Ekero Blue", category: "blueprint / seating", footprint: { width: 0.92, depth: 0.92, height: 0.9 }, placement: "flex", modelFile: "ik-ekero-blue_baked.js", targetHeight: 0.9 },
  { type: "bp_ik_ekero_orange", label: "BP Ekero Orange", category: "blueprint / seating", footprint: { width: 0.92, depth: 0.92, height: 0.9 }, placement: "flex", modelFile: "ik-ekero-orange_baked.js", targetHeight: 0.9 },
  { type: "bp_ik_kivine", label: "BP Kivine Sofa", category: "blueprint / seating", footprint: { width: 2.2, depth: 0.95, height: 0.86 }, placement: "wall", modelFile: "ik-kivine_baked.js", targetHeight: 0.86 },
  { type: "bp_ik_stockholm_coffee_brown", label: "BP Stockholm Coffee Table", category: "blueprint / tables", footprint: { width: 1.15, depth: 0.72, height: 0.43 }, placement: "center", modelFile: "ik-stockholmcoffee-brown.js", targetHeight: 0.43 },
  { type: "bp_ik_nordli_full", label: "BP Nordli Unit", category: "blueprint / storage", footprint: { width: 1.6, depth: 0.5, height: 0.95 }, placement: "wall", modelFile: "ik_nordli_full.js", targetHeight: 0.95 },
  { type: "bp_nyc_poster_2", label: "BP NYC Poster", category: "blueprint / decor", footprint: { width: 1.0, depth: 0.08, height: 0.75 }, placement: "wall", mount: "wall", modelFile: "nyc-poster2.js", targetHeight: 0.75 },
  { type: "bp_open_door", label: "BP Open Door", category: "blueprint / doors & windows", footprint: { width: 0.95, depth: 0.12, height: 2.05 }, placement: "wall", mount: "wall", opening: { width: 0.95, height: 2.05, sill: 0.0 }, modelFile: "open_door.js", targetHeight: 2.05 },
  { type: "bp_ore_3_legged_white", label: "BP 3-Legged Table", category: "blueprint / tables", footprint: { width: 0.72, depth: 0.72, height: 0.6 }, placement: "flex", modelFile: "ore-3legged-white_baked.js", targetHeight: 0.6 },
  { type: "bp_we_crosby_2_piece_green", label: "BP Crosby 2-Piece", category: "blueprint / seating", footprint: { width: 2.4, depth: 1.0, height: 0.88 }, placement: "wall", modelFile: "we-crosby2piece-greenbaked.js", targetHeight: 0.88 },
  { type: "bp_we_narrow_6_white", label: "BP Narrow 6 White", category: "blueprint / storage", footprint: { width: 0.9, depth: 0.35, height: 1.85 }, placement: "wall", modelFile: "we-narrow6white_baked.js", targetHeight: 1.85 },
  { type: "bp_white_window", label: "BP White Window", category: "blueprint / doors & windows", footprint: { width: 1.2, depth: 0.12, height: 1.2 }, placement: "wall", mount: "wall", opening: { width: 1.2, height: 1.2, sill: 0.9 }, modelFile: "whitewindow.js", targetHeight: 1.2 },
];

export const BLUEPRINT_BY_TYPE = new Map(
  BLUEPRINT_CATALOG.map((item) => [item.type, item] as const),
);

