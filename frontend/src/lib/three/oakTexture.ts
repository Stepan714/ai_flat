import * as THREE from "three";

export type OakTextureOptions = {
  size?: number;
  repeat?: number;
  seed?: number;
};

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createOakTexture({
  size = 512,
  repeat = 2,
  seed = 7,
}: OakTextureOptions = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context is not available");

  const rnd = mulberry32(seed);

  // Base oak tone
  ctx.fillStyle = "#e9d7b7";
  ctx.fillRect(0, 0, size, size);

  // Gentle vertical gradient
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, "rgba(255,255,255,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0.06)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Grain lines
  for (let i = 0; i < 220; i++) {
    const x = rnd() * size;
    const w = 0.5 + rnd() * 2.2;
    const a = 0.02 + rnd() * 0.08;
    const hue = 30 + rnd() * 10; // warm
    ctx.strokeStyle = `hsla(${hue}, 35%, ${35 + rnd() * 18}%, ${a})`;
    ctx.lineWidth = w;

    ctx.beginPath();
    let y = -10;
    ctx.moveTo(x, y);

    const amp = 6 + rnd() * 18;
    const freq = 0.008 + rnd() * 0.02;
    while (y < size + 10) {
      y += 8 + rnd() * 14;
      const nx = x + Math.sin(y * freq + rnd() * 2) * amp;
      ctx.lineTo(nx, y);
    }
    ctx.stroke();
  }

  // Subtle pores/noise
  const img = ctx.getImageData(0, 0, size, size);
  for (let p = 0; p < img.data.length; p += 4) {
    const n = (rnd() - 0.5) * 10; // tiny variation
    img.data[p] = Math.min(255, Math.max(0, img.data[p] + n));
    img.data[p + 1] = Math.min(255, Math.max(0, img.data[p + 1] + n));
    img.data[p + 2] = Math.min(255, Math.max(0, img.data[p + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return texture;
}

