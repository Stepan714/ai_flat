import type { GenerateLayoutResponse } from "@/lib/layout/types";
import type {
  FurnitureItem,
  FurnitureType,
} from "@/components/three/furniture/types";
import { isFurnitureType as isKnownFurnitureType } from "@/components/three/furniture/types";

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isFurnitureType(v: unknown): v is FurnitureType {
  return isKnownFurnitureType(v);
}

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null;
}

function isVec3(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#([0-9a-fA-F]{6})$/.test(v);
}

export function applyGeneratedLayout(
  layout: GenerateLayoutResponse,
): FurnitureItem[] {
  const out: FurnitureItem[] = [];

  for (const obj of layout.objects ?? []) {
    if (!isRecord(obj)) continue;
    const type = obj["type"];
    if (!isFurnitureType(type)) continue;

    const pos = obj["position"];
    if (!isVec3(pos)) continue;

    const rot = obj["rotation"];
    const rotation = isVec3(rot) ? rot : ([0, 0, 0] as const);
    const scaleRaw = obj["scale"];
    const scale =
      typeof scaleRaw === "number" && Number.isFinite(scaleRaw)
        ? Math.max(0.2, Math.min(5, scaleRaw))
        : 1;
    const colorRaw = obj["color"];
    const color = isHexColor(colorRaw) ? colorRaw : undefined;

    out.push({
      id: newId(),
      type,
      position: [pos[0], pos[1], pos[2]],
      rotation: [rotation[0], rotation[1], rotation[2]],
      scale,
      color,
    });
  }

  return out;
}

