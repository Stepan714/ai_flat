export type FurnitureDesign = "apple_soft" | "modern" | "scandinavian" | "industrial";
export type FurnitureMaterialPreset = "ivory_oak" | "walnut" | "ash_gray" | "graphite";

export type FurnitureAppearance = {
  design: FurnitureDesign;
  material: FurnitureMaterialPreset;
};

export const DEFAULT_FURNITURE_APPEARANCE: FurnitureAppearance = {
  design: "apple_soft",
  material: "ivory_oak",
};

export const FURNITURE_DESIGN_OPTIONS: Array<{ value: FurnitureDesign; label: string }> = [
  { value: "apple_soft", label: "Apple Soft" },
  { value: "modern", label: "Modern" },
  { value: "scandinavian", label: "Scandinavian" },
  { value: "industrial", label: "Industrial" },
];

export const FURNITURE_MATERIAL_OPTIONS: Array<{
  value: FurnitureMaterialPreset;
  label: string;
}> = [
  { value: "ivory_oak", label: "Ivory Oak" },
  { value: "walnut", label: "Walnut" },
  { value: "ash_gray", label: "Ash Gray" },
  { value: "graphite", label: "Graphite" },
];

