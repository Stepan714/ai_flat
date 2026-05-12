"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  FURNITURE_TYPES,
  type FurnitureType,
} from "@/components/three/furniture/types";
import {
  FURNITURE_CATALOG,
  FURNITURE_CATALOG_MAP,
} from "@/components/three/furniture/catalog";
import {
  FURNITURE_DESIGN_OPTIONS,
  FURNITURE_MATERIAL_OPTIONS,
  type FurnitureAppearance,
} from "@/components/three/furniture/appearance";
import type { LayoutStyle } from "@/lib/layout/types";

export type RoomDims = {
  width: number;
  length: number;
  height: number;
};

export type SceneColors = {
  walls: string;
  floor: string;
  furniture: string;
};

export type RoomControlsPanelProps = {
  room: RoomDims;
  onChange: (next: RoomDims) => void;
  onAddFurniture?: (type: FurnitureType) => void;
  onSmartAddFurniture?: () => void;
  furnitureCount?: number;
  style: LayoutStyle;
  onStyleChange: (style: LayoutStyle) => void;
  onGenerateLayout?: () => void | Promise<void>;
  isGeneratingLayout?: boolean;
  aiPrompt: string;
  onAiPromptChange: (next: string) => void;
  statusText?: string;
  colors: SceneColors;
  onColorsChange: (next: SceneColors) => void;
  furnitureAppearance: FurnitureAppearance;
  onFurnitureAppearanceChange: (next: FurnitureAppearance) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onExportProject?: () => void;
  onImportProject?: (jsonText: string) => void;
  assist?: {
    snapMove: boolean;
    moveGrid: number;
    snapRotate: boolean;
    rotateStepDeg: number;
  };
  onAssistChange?: (next: {
    snapMove: boolean;
    moveGrid: number;
    snapRotate: boolean;
    rotateStepDeg: number;
  }) => void;
  className?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const parsed = raw === "" ? NaN : Number(raw);
    if (Number.isNaN(parsed)) return;
    onChange(clamp(parsed, min, max));
  };

  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium tracking-wide text-black/55">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="h-11 w-full rounded-2xl bg-white/70 px-4 text-[15px] text-black/80 shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-300 ease-out hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-black/20"
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium tracking-wide text-black/55">
        {label}
      </span>
      <div className="flex h-11 items-center gap-3 rounded-2xl bg-white/70 px-3 shadow-sm ring-1 ring-black/5 backdrop-blur">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded-md border-0 bg-transparent p-0"
          aria-label={label}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-black/55">
          {value}
        </span>
      </div>
    </label>
  );
}

export function RoomControlsPanel({
  room,
  onChange,
  onAddFurniture,
  onSmartAddFurniture,
  furnitureCount,
  style,
  onStyleChange,
  onGenerateLayout,
  isGeneratingLayout,
  aiPrompt,
  onAiPromptChange,
  statusText,
  colors,
  onColorsChange,
  furnitureAppearance,
  onFurnitureAppearanceChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExportProject,
  onImportProject,
  assist: assistProp,
  onAssistChange,
  className,
}: RoomControlsPanelProps) {
  const assist = assistProp ?? {
    snapMove: true,
    moveGrid: 0.25,
    snapRotate: true,
    rotateStepDeg: 15,
  };
  const [selectedFurniture, setSelectedFurniture] = useState<FurnitureType>("sofa");
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const catalogByCategory = useMemo(() => {
    const out = new Map<string, Array<(typeof FURNITURE_CATALOG)[number]>>();
    for (const item of FURNITURE_CATALOG) {
      const arr = out.get(item.category) ?? [];
      arr.push(item);
      out.set(item.category, arr);
    }
    return out;
  }, []);
  const selectedLabel =
    FURNITURE_CATALOG_MAP.get(selectedFurniture)?.label ??
    selectedFurniture;

  const handleAddSelected = () => {
    const raw = selectRef.current?.value ?? selectedFurniture;
    if (
      typeof raw === "string" &&
      (FURNITURE_TYPES as readonly string[]).includes(raw)
    ) {
      onAddFurniture?.(raw as FurnitureType);
    }
  };

  return (
    <aside
      className={
        className ??
        "pointer-events-auto relative w-full max-w-[380px] overflow-hidden rounded-[24px] bg-white/55 p-6 shadow-[0_18px_60px_rgba(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-2xl"
      }
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(120%_120%_at_50%_0%,rgba(0,122,255,0.25),transparent_60%)] opacity-60" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold tracking-tight text-black/75">
            Room
          </div>
          <div className="mt-1 text-xs leading-5 text-black/45">
            Параметры обновляют сцену мгновенно.
          </div>
        </div>
        <div className="rounded-full bg-black/[0.04] px-3 py-1 text-[11px] font-medium text-black/50 ring-1 ring-black/[0.04]">
          meters
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <NumberField
          label="Ширина"
          value={room.width}
          min={2}
          max={20}
          step={0.1}
          onChange={(width) => onChange({ ...room, width })}
        />
        <NumberField
          label="Длина"
          value={room.length}
          min={2}
          max={30}
          step={0.1}
          onChange={(length) => onChange({ ...room, length })}
        />
        <NumberField
          label="Высота"
          value={room.height}
          min={2}
          max={10}
          step={0.05}
          onChange={(height) => onChange({ ...room, height })}
        />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-black/55">Furniture</div>
          <div className="text-[11px] font-medium text-black/40">
            {typeof furnitureCount === "number" ? `${furnitureCount} items` : ""}
          </div>
        </div>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-2">
            <span className="text-xs font-medium tracking-wide text-black/55">
              Object Library ({FURNITURE_CATALOG.length})
            </span>
            <select
              ref={selectRef}
              value={selectedFurniture}
              onChange={(e) => {
                const next = e.target.value;
                if (
                  typeof next === "string" &&
                  (FURNITURE_TYPES as readonly string[]).includes(next)
                ) {
                  setSelectedFurniture(next as FurnitureType);
                }
              }}
              className="h-11 w-full appearance-none rounded-2xl bg-white/70 px-4 text-[15px] text-black/80 shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-300 ease-out hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-black/20"
            >
              {[...catalogByCategory.entries()].map(([category, items]) => (
                <optgroup key={category} label={category}>
                  {items.map((item) => (
                    <option key={item.type} value={item.type}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleAddSelected}
              className="h-10 rounded-2xl bg-white/70 text-xs font-medium text-black/70 shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-300 ease-out hover:scale-[1.02] hover:bg-white hover:shadow-md active:scale-[1.00]"
            >
              Add: {selectedLabel}
            </button>
            <button
              type="button"
              onClick={() => onSmartAddFurniture?.()}
              className="h-10 rounded-2xl bg-[linear-gradient(135deg,#0f172a,rgba(15,23,42,0.86))] text-xs font-medium text-white shadow-sm transition duration-300 ease-out hover:scale-[1.02] hover:shadow-md active:scale-[1.00]"
            >
              Smart Add (Random)
            </button>
          </div>
        </div>
        <div className="mt-2 text-[11px] leading-5 text-black/40">
          Smart Add автоматически подбирает объект и находит свободное место в комнате.
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs font-medium text-black/55">Furniture Style</div>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-2">
            <span className="text-xs font-medium tracking-wide text-black/55">
              Design language
            </span>
            <select
              value={furnitureAppearance.design}
              onChange={(e) =>
                onFurnitureAppearanceChange({
                  ...furnitureAppearance,
                  design: e.target.value as FurnitureAppearance["design"],
                })
              }
              className="h-11 w-full appearance-none rounded-2xl bg-white/70 px-4 text-[15px] text-black/80 shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-300 ease-out hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-black/20"
            >
              {FURNITURE_DESIGN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium tracking-wide text-black/55">
              Material preset
            </span>
            <select
              value={furnitureAppearance.material}
              onChange={(e) =>
                onFurnitureAppearanceChange({
                  ...furnitureAppearance,
                  material: e.target.value as FurnitureAppearance["material"],
                })
              }
              className="h-11 w-full appearance-none rounded-2xl bg-white/70 px-4 text-[15px] text-black/80 shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-300 ease-out hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-black/20"
            >
              {FURNITURE_MATERIAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs font-medium text-black/55">Colors</div>
        <div className="mt-3 grid gap-3">
          <ColorField
            label="Walls"
            value={colors.walls}
            onChange={(walls) => onColorsChange({ ...colors, walls })}
          />
          <ColorField
            label="Floor"
            value={colors.floor}
            onChange={(floor) => onColorsChange({ ...colors, floor })}
          />
          <ColorField
            label="Furniture"
            value={colors.furniture}
            onChange={(furniture) => onColorsChange({ ...colors, furniture })}
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs font-medium text-black/55">AI Layout</div>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-2">
            <span className="text-xs font-medium tracking-wide text-black/55">
              Prompt
            </span>
            <textarea
              value={aiPrompt}
              onChange={(e) => onAiPromptChange(e.target.value)}
              rows={4}
              placeholder="Например: современный уютный интерьер, светлое дерево, акцентная зона отдыха, не перегружать центр комнаты."
              className="w-full resize-none rounded-2xl bg-white/70 px-4 py-3 text-[14px] leading-6 text-black/80 shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-300 ease-out hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-black/20"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-medium tracking-wide text-black/55">
              Style
            </span>
            <select
              value={style}
              onChange={(e) => onStyleChange(e.target.value as LayoutStyle)}
              className="h-11 w-full appearance-none rounded-2xl bg-white/70 px-4 text-[15px] text-black/80 shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-300 ease-out hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-black/20"
            >
              <option value="minimalism">Minimalism</option>
              <option value="modern">Modern</option>
              <option value="scandinavian">Scandinavian</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => onGenerateLayout?.()}
            disabled={!onGenerateLayout || isGeneratingLayout}
            className="h-11 w-full rounded-2xl bg-[linear-gradient(135deg,#111827,rgba(17,24,39,0.85))] text-sm font-medium text-white shadow-sm transition duration-300 ease-out hover:scale-[1.02] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 active:scale-[1.00]"
          >
            {isGeneratingLayout ? "Generating…" : "Generate AI Layout"}
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-black/[0.03] p-4 ring-1 ring-black/[0.04]">
        <div className="mb-3 text-xs font-medium text-black/55">Project</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onUndo?.()}
            disabled={!canUndo}
            className="h-9 rounded-2xl bg-white/70 text-xs font-medium text-black/70 ring-1 ring-black/6 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => onRedo?.()}
            disabled={!canRedo}
            className="h-9 rounded-2xl bg-white/70 text-xs font-medium text-black/70 ring-1 ring-black/6 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={() => onExportProject?.()}
            className="h-9 rounded-2xl bg-white/70 text-xs font-medium text-black/70 ring-1 ring-black/6 transition hover:scale-[1.02]"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="h-9 rounded-2xl bg-white/70 text-xs font-medium text-black/70 ring-1 ring-black/6 transition hover:scale-[1.02]"
          >
            Import JSON
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              onImportProject?.(text);
              e.currentTarget.value = "";
            }}
          />
        </div>
        <div className="mt-4 text-xs font-medium text-black/55">Snapping</div>
        <div className="mt-2 grid gap-2">
          <label className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-xs text-black/70 ring-1 ring-black/5">
            <span>Move grid snap</span>
            <input
              type="checkbox"
              checked={assist.snapMove}
              onChange={(e) => onAssistChange?.({ ...assist, snapMove: e.target.checked })}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[11px] text-black/50">Grid (m)</span>
            <input
              type="number"
              min={0.01}
              max={1}
              step={0.01}
              value={assist.moveGrid}
              onChange={(e) =>
                onAssistChange?.({
                  ...assist,
                  moveGrid: Math.min(1, Math.max(0.01, Number(e.target.value) || 0.25)),
                })
              }
              className="h-9 rounded-xl bg-white/70 px-3 text-xs text-black/75 ring-1 ring-black/5"
            />
          </label>
          <label className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-xs text-black/70 ring-1 ring-black/5">
            <span>Rotate angle snap</span>
            <input
              type="checkbox"
              checked={assist.snapRotate}
              onChange={(e) => onAssistChange?.({ ...assist, snapRotate: e.target.checked })}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[11px] text-black/50">Angle (deg)</span>
            <input
              type="number"
              min={1}
              max={90}
              step={1}
              value={assist.rotateStepDeg}
              onChange={(e) =>
                onAssistChange?.({
                  ...assist,
                  rotateStepDeg: Math.min(90, Math.max(1, Number(e.target.value) || 15)),
                })
              }
              className="h-9 rounded-xl bg-white/70 px-3 text-xs text-black/75 ring-1 ring-black/5"
            />
          </label>
        </div>
        <div className="mt-3 text-[11px] leading-5 text-black/45">
          Shortcuts: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl/Cmd+D.
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-black/[0.03] p-4 ring-1 ring-black/[0.04]">
        <div className="text-xs font-medium text-black/55">Подсказка</div>
        <p className="mt-1 text-xs leading-5 text-black/45">
          Перетаскивание — orbit, колесо — zoom, правой кнопкой — pan.
        </p>
        <p className="mt-2 text-xs leading-5 text-black/45">
          Мебель можно <span className="font-medium text-black/55">перетаскивать</span> мышью по полу.
        </p>
        {statusText ? (
          <p className="mt-3 text-[11px] leading-5 text-black/45">
            <span className="font-medium text-black/50">Status:</span>{" "}
            {statusText}
          </p>
        ) : null}
      </div>
    </aside>
  );
}

