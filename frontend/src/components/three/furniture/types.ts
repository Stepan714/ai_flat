export type Vec3 = readonly [number, number, number];

export const FURNITURE_TYPES = [
  "sofa",
  "table",
  "bed",
  "armchair",
  "chair",
  "pouf",
  "bench",
  "coffee_table",
  "side_table",
  "desk",
  "console",
  "nightstand",
  "bookshelf",
  "wardrobe",
  "dresser",
  "tv_stand",
  "cabinet",
  "plant",
  "floor_lamp",
  "lamp",
  "bp_blake_avenue_chef_table",
  "bp_dwr_matera_dresser_2",
  "bp_gus_ossington_end_table",
  "bp_bd_shale_bedside_smoke",
  "bp_cb_archnight_white",
  "bp_cb_blue_block_60x96",
  "bp_cb_clapboard",
  "bp_cb_kendall_bookcase_walnut",
  "bp_cb_moore",
  "bp_cb_rochelle_gray",
  "bp_cb_scholar_table",
  "bp_cb_tecs",
  "bp_closed_door_28x80",
  "bp_gus_church_chair_whiteoak",
  "bp_ik_ekero_blue",
  "bp_ik_ekero_orange",
  "bp_ik_kivine",
  "bp_ik_stockholm_coffee_brown",
  "bp_ik_nordli_full",
  "bp_nyc_poster_2",
  "bp_open_door",
  "bp_ore_3_legged_white",
  "bp_we_crosby_2_piece_green",
  "bp_we_narrow_6_white",
  "bp_white_window",
] as const;

export type FurnitureType = (typeof FURNITURE_TYPES)[number];

export function isFurnitureType(v: unknown): v is FurnitureType {
  return (
    typeof v === "string" &&
    (FURNITURE_TYPES as readonly string[]).includes(v)
  );
}

export type FurnitureItem = {
  id: string;
  type: FurnitureType;
  position: Vec3;
  rotation: Vec3; // Euler radians: [x, y, z]
  scale?: number; // uniform scale multiplier
  color?: string; // optional per-item color in #rrggbb
};

