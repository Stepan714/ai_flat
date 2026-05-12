"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FurnitureItem, FurnitureType } from "@/components/three/furniture/types";
import type { FurnitureAppearance } from "@/components/three/furniture/appearance";
import type { LayoutStyle } from "@/lib/layout/types";
import {
  RoomControlsPanel,
  type RoomDims,
  type SceneColors,
} from "@/components/controls/RoomControlsPanel";

export type ControlsDockProps = {
  room: RoomDims;
  onRoomChange: (next: RoomDims) => void;
  furniture: FurnitureItem[];
  onAddFurniture: (type: FurnitureType) => void;
  onSmartAddFurniture: () => void;
  style: LayoutStyle;
  onStyleChange: (style: LayoutStyle) => void;
  onGenerateLayout: () => void | Promise<void>;
  isGeneratingLayout: boolean;
  aiPrompt: string;
  onAiPromptChange: (next: string) => void;
  statusText: string;
  colors: SceneColors;
  onColorsChange: (next: SceneColors) => void;
  furnitureAppearance: FurnitureAppearance;
  onFurnitureAppearanceChange: (next: FurnitureAppearance) => void;
  visible?: boolean;
};

export function ControlsDock(props: ControlsDockProps) {
  // Start collapsed so the room is unobstructed.
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const visible = props.visible ?? true;

  const panel = useMemo(
    () => (
      <RoomControlsPanel
        room={props.room}
        onChange={props.onRoomChange}
        onAddFurniture={props.onAddFurniture}
        onSmartAddFurniture={props.onSmartAddFurniture}
        furnitureCount={props.furniture.length}
        style={props.style}
        onStyleChange={props.onStyleChange}
        onGenerateLayout={props.onGenerateLayout}
        isGeneratingLayout={props.isGeneratingLayout}
        aiPrompt={props.aiPrompt}
        onAiPromptChange={props.onAiPromptChange}
        statusText={props.statusText}
        colors={props.colors}
        onColorsChange={props.onColorsChange}
        furnitureAppearance={props.furnitureAppearance}
        onFurnitureAppearanceChange={props.onFurnitureAppearanceChange}
      />
    ),
    [
      props.furniture.length,
      props.isGeneratingLayout,
      props.onAddFurniture,
      props.onGenerateLayout,
      props.onSmartAddFurniture,
      props.onRoomChange,
      props.onStyleChange,
      props.aiPrompt,
      props.onAiPromptChange,
      props.onColorsChange,
      props.furnitureAppearance,
      props.onFurnitureAppearanceChange,
      props.room,
      props.statusText,
      props.style,
      props.colors,
    ],
  );

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "h") {
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!open) return;
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (visible) return;
    setOpen(false);
  }, [visible]);

  return (
    <div
      className={[
        "pointer-events-none fixed inset-0 z-50",
        "transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "opacity-0",
      ].join(" ")}
      aria-hidden={!visible}
    >
      {/* Collapsed button */}
      {!open && visible ? (
        <div className="pointer-events-auto absolute bottom-8 right-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group inline-flex items-center gap-2 rounded-full bg-white/60 px-4 py-2 text-sm font-medium text-black/70 shadow-[0_18px_60px_rgba(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-2xl transition duration-300 ease-out hover:scale-[1.02] hover:bg-white/75 hover:text-black"
            aria-label="Open controls (H)"
            title="Controls (H)"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-[linear-gradient(135deg,#007AFF,#AF52DE)]" />
            Controls
            <span className="text-[11px] font-medium text-black/35 group-hover:text-black/45">
              H
            </span>
          </button>
        </div>
      ) : null}

      {/* Sheet */}
      <div
        ref={rootRef}
        className={[
          "pointer-events-auto absolute right-6 top-20",
          "w-[380px] max-w-[calc(100vw-48px)]",
          "transition duration-300 ease-out",
          open && visible ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0",
        ].join(" ")}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[11px] font-medium tracking-wide text-black/45">
            Controls
            <span className="ml-2 rounded-full bg-white/60 px-2 py-0.5 text-[10px] text-black/40 ring-1 ring-black/5 backdrop-blur">
              Press H to hide
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full bg-white/60 px-3 py-1.5 text-[11px] font-medium text-black/55 ring-1 ring-black/5 backdrop-blur transition duration-300 ease-out hover:scale-[1.02] hover:bg-white/75 hover:text-black"
          >
            Hide
          </button>
        </div>

        <div className="max-h-[calc(100vh-140px)] overflow-auto rounded-[24px]">
          {panel}
        </div>
      </div>
    </div>
  );
}

