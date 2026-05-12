import { NextResponse, type NextRequest } from "next/server";
import { FURNITURE_TYPES, isFurnitureType as isKnownFurnitureType, type FurnitureType } from "@/components/three/furniture/types";
import type { LayoutStyle } from "@/lib/layout/types";
import type { GenerateLayoutResponse } from "@/lib/layout/types";
import { generateMockLayout } from "@/lib/layout/generateMockLayout";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isStyle(v: unknown): v is LayoutStyle {
  return v === "minimalism" || v === "modern" || v === "scandinavian";
}

function isFurnitureType(v: unknown): v is FurnitureType {
  return isKnownFurnitureType(v);
}

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#([0-9a-fA-F]{6})$/.test(v);
}

const TECHNICAL_SYSTEM_PROMPT = `
You are a deterministic interior layout engine for a 3D room planner.
Return ONLY strict JSON (no markdown, no comments, no explanations outside JSON).

Task:
Generate a practical furniture layout that looks clean and realistic.

Hard rules:
1) Use ONLY object types from this list:
${FURNITURE_TYPES.join(", ")}
2) Keep all objects INSIDE room bounds.
3) Avoid collisions as much as possible.
4) Keep center area reasonably walkable.
5) Coordinates:
   - room center is [0,0,0]
   - floor level is y=0
   - position format: [x,y,z]
   - rotation format: [0,yaw,0] in radians
6) scale range: 0.6..1.4
7) colors must be strict #RRGGBB
8) Return 4..14 objects unless user explicitly asks otherwise.
9) Prefer coherent composition by style:
   - minimalism: fewer objects, more empty space
   - modern: functional + balanced accents
   - scandinavian: warm/light tones, cozy composition
10) Design composition rules (very important):
   - Create clear functional zones: sleep / storage / circulation.
   - Keep one primary focal composition (usually bed area).
   - Place large objects first (bed, wardrobe, dresser), then secondary, then decor.
   - Align key furniture to dominant room axes (0, pi/2, pi, 3pi/2 yaw).
   - Avoid random angles unless explicitly requested by user.
   - Preserve visual balance: if one side is heavy, counterbalance with medium objects.
   - Keep a readable pathway from room center to at least one wall opening area.
11) Spacing constraints:
   - Min free passage between major objects: 0.7m preferred, 0.55m hard minimum.
   - Keep at least 0.08m clearance from walls unless object is wall-mounted.
   - Avoid placing objects so they clip into corners.
12) Style-specific presets:
   - minimalism: 4..8 objects, low clutter, neutral palette, strong symmetry.
   - modern: 6..11 objects, functional grouping, moderate contrast.
   - scandinavian: 6..10 objects, light tones, soft asymmetry, cozy accents.
13) For bedroom-like prompts:
   - Bed should be primary anchor.
   - Wardrobes should be aligned near walls, not blocking bed access.
   - Nightstands should be near bed when space allows.
14) Determinism:
   - Given similar inputs, prefer stable and repeatable layouts.
   - Do not output chaotic scatter placements.

Output JSON schema:
{
  "room": { "width": number, "length": number, "height": number },
  "sceneColors": { "walls": "#RRGGBB", "floor": "#RRGGBB", "furniture": "#RRGGBB" },
  "furnitureAppearance": {
    "design": "apple_soft|modern|scandinavian|industrial",
    "material": "ivory_oak|walnut|ash_gray|graphite"
  },
  "objects": [
    {
      "type": string,
      "position": [number,number,number],
      "rotation": [number,number,number],
      "scale": number,
      "color": "#RRGGBB"
    }
  ],
  "rationale": "short reasoning"
}
`.trim();

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const raw = text.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sanitizeAiResponse(
  raw: unknown,
  fallbackRoom: { width: number; length: number; height: number },
): GenerateLayoutResponse | null {
  if (!isRecord(raw)) return null;
  const objectsRaw = raw["objects"];
  if (!Array.isArray(objectsRaw)) return null;
  const objects: GenerateLayoutResponse["objects"] = [];
  for (const v of objectsRaw) {
    if (!isRecord(v)) continue;
    const type = v["type"];
    const pos = v["position"];
    const rot = v["rotation"];
    const scale = v["scale"];
    const color = v["color"];
    if (
      !isFurnitureType(type) ||
      !Array.isArray(pos) ||
      pos.length !== 3 ||
      !pos.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      continue;
    }
    const rotation =
      Array.isArray(rot) &&
      rot.length === 3 &&
      rot.every((n) => typeof n === "number" && Number.isFinite(n))
        ? ([rot[0], rot[1], rot[2]] as [number, number, number])
        : ([0, 0, 0] as [number, number, number]);
    const next = {
      type,
      position: [pos[0], pos[1], pos[2]] as [number, number, number],
      rotation,
      scale:
        typeof scale === "number" && Number.isFinite(scale)
          ? Math.max(0.2, Math.min(5, scale))
          : 1,
      color: isHexColor(color) ? color : undefined,
    };
    objects.push(next);
  }
  if (objects.length === 0) return null;

  const roomRaw = raw["room"];
  const sceneRaw = raw["sceneColors"];
  const appRaw = raw["furnitureAppearance"];
  const rationale = typeof raw["rationale"] === "string" ? raw["rationale"] : undefined;

  const response: GenerateLayoutResponse = { objects, rationale };
  if (isRecord(roomRaw)) {
    response.room = {
      width:
        typeof roomRaw["width"] === "number" && Number.isFinite(roomRaw["width"])
          ? roomRaw["width"]
          : fallbackRoom.width,
      length:
        typeof roomRaw["length"] === "number" && Number.isFinite(roomRaw["length"])
          ? roomRaw["length"]
          : fallbackRoom.length,
      height:
        typeof roomRaw["height"] === "number" && Number.isFinite(roomRaw["height"])
          ? roomRaw["height"]
          : fallbackRoom.height,
    };
  }
  if (isRecord(sceneRaw)) {
    response.sceneColors = {
      walls: isHexColor(sceneRaw["walls"]) ? sceneRaw["walls"] : undefined,
      floor: isHexColor(sceneRaw["floor"]) ? sceneRaw["floor"] : undefined,
      furniture: isHexColor(sceneRaw["furniture"]) ? sceneRaw["furniture"] : undefined,
    };
  }
  if (isRecord(appRaw)) {
    const design = appRaw["design"];
    const material = appRaw["material"];
    response.furnitureAppearance = {
      design:
        design === "apple_soft" ||
        design === "modern" ||
        design === "scandinavian" ||
        design === "industrial"
          ? design
          : undefined,
      material:
        material === "ivory_oak" ||
        material === "walnut" ||
        material === "ash_gray" ||
        material === "graphite"
          ? material
          : undefined,
    };
  }
  return response;
}

type ChatCompletionShape = {
  choices?: Array<{ message?: { content?: string } }>;
};

function extractModelText(rawJson: unknown): string | null {
  if (!isRecord(rawJson)) return null;
  const direct = rawJson as ChatCompletionShape;
  const directText = direct.choices?.[0]?.message?.content;
  if (typeof directText === "string" && directText.trim()) return directText;

  const wrapped = rawJson["response"];
  if (!isRecord(wrapped)) return null;
  const wrappedJson = wrapped as ChatCompletionShape;
  const wrappedText = wrappedJson.choices?.[0]?.message?.content;
  if (typeof wrappedText === "string" && wrappedText.trim()) return wrappedText;
  return null;
}

async function generateWithLlmApi(payload: {
  room: { width: number; length: number; height: number };
  style: LayoutStyle;
  prompt: string;
}): Promise<GenerateLayoutResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY;
  if (!apiKey) return null;
  const endpoint =
    process.env.LLM_API_URL ?? "https://api.eliza.yandex.net/openai/v1/chat/completions";
  const authScheme = process.env.LLM_AUTH_SCHEME ?? "OAuth";
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1";

  const userPrompt = `
Room:
- width: ${payload.room.width}
- length: ${payload.room.length}
- height: ${payload.room.height}
Base style: ${payload.style}
User request: ${payload.prompt || "(empty)"}
`.trim();

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `${authScheme} ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: "system", content: TECHNICAL_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as unknown;
  const text = extractModelText(json);
  if (typeof text !== "string" || !text.trim()) return null;
  const parsed = extractJsonObject(text);
  return sanitizeAiResponse(parsed, payload.room);
}

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const room = body["room"];
  const style = body["style"];
  const promptRaw = body["prompt"];

  if (!isRecord(room)) {
    return NextResponse.json({ error: "Missing room" }, { status: 400 });
  }

  const width = room["width"];
  const length = room["length"];
  const height = room["height"];

  if (!isFiniteNumber(width) || !isFiniteNumber(length) || !isFiniteNumber(height)) {
    return NextResponse.json(
      { error: "room.width/length/height must be numbers" },
      { status: 400 },
    );
  }

  if (!isStyle(style)) {
    return NextResponse.json(
      { error: "style must be minimalism | modern | scandinavian" },
      { status: 400 },
    );
  }

  const prompt = typeof promptRaw === "string" ? promptRaw.trim() : "";
  const ai = await generateWithLlmApi({
    room: { width, length, height },
    style,
    prompt,
  });
  const result =
    ai ??
    generateMockLayout({
      room: { width, length, height },
      style,
    });

  return NextResponse.json(result);
}

