import type {
  GenerateLayoutRequest,
  GenerateLayoutResponse,
  LayoutObject,
} from "@/lib/layout/types";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function generateMockLayout(
  req: GenerateLayoutRequest,
): GenerateLayoutResponse {
  const w = clamp(req.room.width, 2, 50);
  const l = clamp(req.room.length, 2, 50);

  // Keep objects away from walls a little.
  const margin = 0.9;
  const cx = 0;
  const cz = 0;
  const xLeft = -(w / 2 - margin);
  const xRight = w / 2 - margin;
  const zTop = -(l / 2 - margin);
  const zBottom = l / 2 - margin;

  const base: LayoutObject[] = [
    { type: "sofa", position: [xLeft * 0.35, 0, zBottom * 0.35], rotation: [0, Math.PI / 2, 0] },
    { type: "table", position: [cx, 0, cz], rotation: [0, 0, 0] },
  ];

  if (req.style === "modern") {
    base.push({ type: "bed", position: [xRight * 0.35, 0, zTop * 0.25], rotation: [0, -Math.PI / 2, 0] });
  }

  if (req.style === "scandinavian") {
    // Slightly more “open” center; move sofa away a bit.
    base[0] = { type: "sofa", position: [xLeft * 0.25, 0, cz], rotation: [0, Math.PI / 2, 0] };
  }

  // minimalism stays with 2 objects.
  return { objects: base };
}

