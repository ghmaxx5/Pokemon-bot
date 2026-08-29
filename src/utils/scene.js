const fs = require("fs");
const path = require("path");
const { loadImage } = require("@napi-rs/canvas");

/**
 * Shared background engine for wild spawns and battles.
 *
 * Scenes are drawn procedurally so the bot ships with no image assets and needs
 * no network access at boot. If a real painting is dropped into
 * `assets/backgrounds/<scene>.png` it is used instead, with no code change —
 * see `loadBackdrop`.
 */

const ASSET_DIR = path.join(__dirname, "..", "..", "assets", "backgrounds");

// ── deterministic randomness ─────────────────────────────────────────────────
// Scenery must not jitter between turns of the same battle, so every random
// choice is derived from a seed rather than Math.random().
function makeRng(seed) {
  let s = (seed | 0) || 1;
  return function next() {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 8) & 0xffffff) / 0x1000000;
  };
}

function seedFrom(...parts) {
  let h = 2166136261;
  for (const part of parts) {
    const str = String(part ?? "");
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

// ── scene palettes ───────────────────────────────────────────────────────────
// `sky` is a top-to-horizon gradient, `ground` a horizon-to-bottom gradient.
// `far` / `near` are silhouette layers, `accent` tints light and particles.
const SCENES = {
  meadow: {
    label: "Sunlit Meadow",
    sky: ["#7ec8e3", "#bfe6c3"], ground: ["#5aa860", "#2f6b39"],
    far: "#4a8f57", near: "#356b41", accent: "#f6f7b2",
    silhouette: "hills", particles: "pollen"
  },
  forest: {
    label: "Deep Forest",
    sky: ["#4b7f52", "#8fbf7a"], ground: ["#4a7c3f", "#22421f"],
    far: "#2f5c34", near: "#1d3a22", accent: "#c9e6a0",
    silhouette: "trees", particles: "pollen"
  },
  shore: {
    label: "Quiet Shore",
    sky: ["#63b8e8", "#cfe9f5"], ground: ["#3d94c4", "#1b4f74"],
    far: "#2f7fae", near: "#e2d3a8", accent: "#ffffff",
    silhouette: "waves", particles: "bubbles"
  },
  volcano: {
    label: "Volcanic Crag",
    sky: ["#3b1210", "#a8391b"], ground: ["#6b2416", "#2a0d0a"],
    far: "#57200f", near: "#341008", accent: "#ff9d4d",
    silhouette: "peaks", particles: "embers"
  },
  tundra: {
    label: "Frozen Tundra",
    sky: ["#9fc7e8", "#e9f4fb"], ground: ["#dbeaf5", "#9db6c9"],
    far: "#c2d9ea", near: "#a9c2d6", accent: "#ffffff",
    silhouette: "peaks", particles: "snow"
  },
  canyon: {
    label: "Rocky Canyon",
    sky: ["#e0a06a", "#f5d6a8"], ground: ["#b5713e", "#5e3319"],
    far: "#9a5c30", near: "#6d3d1e", accent: "#ffd9a0",
    silhouette: "mesas", particles: "dust"
  },
  storm: {
    label: "Thunder Plain",
    sky: ["#2a2b45", "#5c5f8a"], ground: ["#3c3f5c", "#191a2b"],
    far: "#33355a", near: "#1f2033", accent: "#ffe45e",
    silhouette: "hills", particles: "sparks"
  },
  aurora: {
    label: "Aurora Expanse",
    sky: ["#1b1040", "#5b2a86"], ground: ["#3a2060", "#170d2c"],
    far: "#4a2a75", near: "#251442", accent: "#9ff5e0",
    silhouette: "hills", particles: "stars"
  },
  graveyard: {
    label: "Haunted Hollow",
    sky: ["#161327", "#3b2f4f"], ground: ["#2a2338", "#100c1a"],
    far: "#241d33", near: "#15101f", accent: "#a86fd8",
    silhouette: "trees", particles: "wisps"
  },
  peaks: {
    label: "Dragon's Peaks",
    sky: ["#2b3a63", "#7d8fc0"], ground: ["#4c5878", "#1e2437"],
    far: "#3d4767", near: "#242a3d", accent: "#ffd28a",
    silhouette: "peaks", particles: "stars"
  },
  foundry: {
    label: "Steel Foundry",
    sky: ["#3a3f47", "#6f7883"], ground: ["#4a5058", "#20242a"],
    far: "#3b4149", near: "#22262c", accent: "#9fd8ff",
    silhouette: "industrial", particles: "sparks"
  },
  skyfield: {
    label: "Open Sky",
    sky: ["#4aa3e0", "#d6ecfa"], ground: ["#8fc6e8", "#4d8ab5"],
    far: "#ffffff", near: "#cfe6f5", accent: "#ffffff",
    silhouette: "clouds", particles: "feathers"
  },
  arena: {
    label: "Battle Arena",
    sky: ["#171b2e", "#2f3554"], ground: ["#3a3f63", "#161a2b"],
    far: "#2b3050", near: "#1b1f33", accent: "#ffd166",
    silhouette: "stadium", particles: "stars"
  }
};

// Primary type decides the scene; the order matters because dual types resolve
// on the first match.
const TYPE_SCENE = {
  grass: "meadow", bug: "forest",
  water: "shore", ice: "tundra",
  fire: "volcano",
  rock: "canyon", ground: "canyon",
  electric: "storm",
  psychic: "aurora", fairy: "aurora",
  ghost: "graveyard", dark: "graveyard",
  dragon: "peaks",
  steel: "foundry",
  flying: "skyfield",
  normal: "meadow", fighting: "canyon", poison: "graveyard"
};

/** Picks a scene from a Pokémon's types, falling back to the arena. */
function sceneForTypes(types) {
  for (const t of types || []) {
    const key = TYPE_SCENE[String(t).toLowerCase()];
    if (key) return key;
  }
  return "arena";
}

function sceneKeys() {
  return Object.keys(SCENES);
}

function sceneInfo(key) {
  return SCENES[key] || SCENES.arena;
}

// ── optional real artwork ────────────────────────────────────────────────────
const backdropCache = new Map();

/**
 * Returns a loaded background image for `key`, or null.
 *
 * Drop a PNG/JPG at assets/backgrounds/<key>.png and it is used in place of the
 * procedural scene. Misses are cached as null so a missing file isn't re-stat'ed
 * on every render.
 */
async function loadBackdrop(key) {
  if (backdropCache.has(key)) return backdropCache.get(key);

  let img = null;
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const file = path.join(ASSET_DIR, `${key}.${ext}`);
    try {
      if (!fs.existsSync(file)) continue;
      img = await loadImage(file);
      break;
    } catch (err) {
      console.error(`Failed to load backdrop ${file}:`, err.message);
    }
  }
  backdropCache.set(key, img);
  return img;
}

/** Clears the backdrop cache so newly added art is picked up without a restart. */
function refreshBackdrops() {
  backdropCache.clear();
}

// ── drawing ──────────────────────────────────────────────────────────────────

function fillGradient(ctx, x, y, w, h, colors) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function drawHills(ctx, w, horizon, color, rng, amplitude, offset) {
  ctx.beginPath();
  ctx.moveTo(0, horizon + offset);
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const x = (w / steps) * i;
    const y = horizon + offset - amplitude * (0.4 + rng() * 0.6);
    ctx.quadraticCurveTo(x - w / (steps * 2), y, x, horizon + offset - amplitude * 0.15);
  }
  ctx.lineTo(w, horizon + offset + 40);
  ctx.lineTo(0, horizon + offset + 40);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawPeaks(ctx, w, horizon, color, rng, amplitude, offset) {
  ctx.beginPath();
  ctx.moveTo(0, horizon + offset);
  let x = 0;
  while (x < w) {
    const width = 60 + rng() * 90;
    const height = amplitude * (0.5 + rng() * 0.8);
    ctx.lineTo(x + width / 2, horizon + offset - height);
    ctx.lineTo(x + width, horizon + offset);
    x += width;
  }
  ctx.lineTo(w, horizon + offset + 40);
  ctx.lineTo(0, horizon + offset + 40);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawTrees(ctx, w, horizon, color, rng, amplitude, offset) {
  ctx.fillStyle = color;
  let x = -10;
  while (x < w + 10) {
    const width = 26 + rng() * 34;
    const height = amplitude * (0.6 + rng() * 0.9);
    const baseY = horizon + offset;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x + width / 2, baseY - height);
    ctx.lineTo(x + width, baseY);
    ctx.closePath();
    ctx.fill();
    // trunk
    ctx.fillRect(x + width / 2 - 2.5, baseY - height * 0.18, 5, height * 0.2);
    x += width * (0.55 + rng() * 0.5);
  }
}

function drawMesas(ctx, w, horizon, color, rng, amplitude, offset) {
  ctx.fillStyle = color;
  let x = -20;
  while (x < w + 20) {
    const width = 70 + rng() * 110;
    const height = amplitude * (0.35 + rng() * 0.6);
    ctx.fillRect(x, horizon + offset - height, width, height + 40);
    x += width * (0.8 + rng() * 0.7);
  }
}

function drawWaves(ctx, w, horizon, color, rng, amplitude, offset) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const y = horizon + offset + i * 14 + rng() * 6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 40) {
      ctx.quadraticCurveTo(x + 10, y - 5, x + 20, y);
      ctx.quadraticCurveTo(x + 30, y + 5, x + 40, y);
    }
    ctx.globalAlpha = 0.5 - i * 0.07;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawClouds(ctx, w, horizon, color, rng, amplitude, offset) {
  ctx.fillStyle = color;
  for (let i = 0; i < 7; i++) {
    const cx = rng() * w;
    const cy = horizon + offset - rng() * amplitude;
    const r = 18 + rng() * 30;
    ctx.globalAlpha = 0.25 + rng() * 0.35;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.7, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawIndustrial(ctx, w, horizon, color, rng, amplitude, offset) {
  ctx.fillStyle = color;
  let x = -15;
  while (x < w + 15) {
    const width = 34 + rng() * 46;
    const height = amplitude * (0.4 + rng() * 1.0);
    ctx.fillRect(x, horizon + offset - height, width, height + 40);
    if (rng() > 0.55) ctx.fillRect(x + width * 0.3, horizon + offset - height - 26, 9, 26);
    x += width * (0.9 + rng() * 0.5);
  }
}

function drawStadium(ctx, w, horizon, color, rng, amplitude, offset) {
  ctx.fillStyle = color;
  ctx.fillRect(0, horizon + offset - amplitude * 0.7, w, amplitude * 0.7 + 40);
  // Crowd speckle, kept sparse so it reads as texture rather than noise.
  for (let i = 0; i < 140; i++) {
    const cx = rng() * w;
    const cy = horizon + offset - rng() * amplitude * 0.65;
    ctx.globalAlpha = 0.10 + rng() * 0.18;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx, cy, 3, 3);
  }
  ctx.globalAlpha = 1;
}

const SILHOUETTES = {
  hills: drawHills, peaks: drawPeaks, trees: drawTrees, mesas: drawMesas,
  waves: drawWaves, clouds: drawClouds, industrial: drawIndustrial, stadium: drawStadium
};

function drawParticles(ctx, w, h, kind, accent, rng) {
  ctx.save();
  const count = kind === "snow" ? 70 : kind === "stars" ? 90 : 40;

  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const size = 1 + rng() * 2.4;

    switch (kind) {
      case "snow":
      case "stars":
        ctx.globalAlpha = 0.25 + rng() * 0.6;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "embers":
      case "sparks":
        ctx.globalAlpha = 0.3 + rng() * 0.6;
        ctx.fillStyle = accent;
        ctx.fillRect(x, y, size, size * 2.2);
        break;
      case "bubbles":
        ctx.globalAlpha = 0.18 + rng() * 0.3;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y * 0.9 + h * 0.1, size * 2.2, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "wisps":
        ctx.globalAlpha = 0.12 + rng() * 0.22;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.ellipse(x, y, size * 5, size * 2, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
        break;
      default: // pollen, dust, feathers
        ctx.globalAlpha = 0.15 + rng() * 0.35;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(x, y, size * 1.4, 0, Math.PI * 2);
        ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Paints a full background. Uses real artwork when present, otherwise draws the
 * procedural scene.
 *
 * @param {object} opts
 * @param {number} opts.horizon  y of the horizon line (defaults to 62% height)
 * @param {number} opts.seed     scenery seed; same seed → identical scenery
 * @param {number} opts.dim      0–1 darkening pass, for text legibility
 */
async function drawScene(ctx, width, height, key, opts = {}) {
  const scene = sceneInfo(key);
  const horizon = opts.horizon ?? Math.round(height * 0.62);
  const rng = makeRng(opts.seed ?? 1);

  const backdrop = await loadBackdrop(key);
  if (backdrop) {
    // Cover-fit so a painting of any aspect ratio fills the frame.
    const scale = Math.max(width / backdrop.width, height / backdrop.height);
    const dw = backdrop.width * scale;
    const dh = backdrop.height * scale;
    ctx.drawImage(backdrop, (width - dw) / 2, (height - dh) / 2, dw, dh);
  } else {
    fillGradient(ctx, 0, 0, width, horizon + 1, scene.sky);
    fillGradient(ctx, 0, horizon, width, height - horizon, scene.ground);

    const draw = SILHOUETTES[scene.silhouette] || drawHills;
    ctx.save();
    ctx.globalAlpha = 0.75;
    draw(ctx, width, horizon, scene.far, rng, height * 0.22, -10);
    ctx.globalAlpha = 1;
    draw(ctx, width, horizon, scene.near, rng, height * 0.13, 14);
    ctx.restore();

    // Light bloom on the horizon gives the flat gradients some depth.
    const bloom = ctx.createRadialGradient(width * 0.5, horizon, 0, width * 0.5, horizon, width * 0.6);
    bloom.addColorStop(0, `${scene.accent}33`);
    bloom.addColorStop(1, "#00000000");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, width, height);

    drawParticles(ctx, width, height, scene.particles, scene.accent, rng);
  }

  // Vignette — keeps the corners quiet so overlaid cards stay readable.
  const vig = ctx.createRadialGradient(width / 2, height / 2, height * 0.25, width / 2, height / 2, width * 0.75);
  vig.addColorStop(0, "#00000000");
  vig.addColorStop(1, "#00000066");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  if (opts.dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, opts.dim)})`;
    ctx.fillRect(0, 0, width, height);
  }

  return { horizon, scene };
}

/** Soft elliptical platform + contact shadow, so sprites don't float. */
function drawPlatform(ctx, cx, cy, radius, accent = "#ffffff") {
  ctx.save();

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, "rgba(0,0,0,0.38)");
  g.addColorStop(0.65, "rgba(0,0,0,0.18)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius, radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `${accent}2b`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius * 0.86, radius * 0.26, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

module.exports = {
  SCENES, TYPE_SCENE,
  sceneForTypes, sceneKeys, sceneInfo,
  drawScene, drawPlatform,
  loadBackdrop, refreshBackdrops,
  makeRng, seedFrom,
  ASSET_DIR
};
