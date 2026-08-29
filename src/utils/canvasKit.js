/**
 * Small drawing primitives shared by the spawn card and the battle scene.
 *
 * These used to live only in spawnImage.js; battleImage.js needs the same pill,
 * outline and fitting maths, and two copies would drift.
 */

const TYPE_COLORS = {
  normal: "#a8a878", fire: "#f08030", water: "#6890f0", electric: "#f8d030",
  grass: "#78c850", ice: "#98d8d8", fighting: "#c03028", poison: "#a040a0",
  ground: "#e0c068", flying: "#a890f0", psychic: "#f85888", bug: "#a8b820",
  rock: "#b8a038", ghost: "#705898", dragon: "#7038f8", dark: "#705848",
  steel: "#b8b8d0", fairy: "#ee99ac"
};

function roundedPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Pill label with an outlined background, legible on any scene. */
function drawPill(ctx, x, y, text, opts = {}) {
  const font = opts.font || "bold 15px sans-serif";
  const padX = opts.padX ?? 11;
  const height = opts.height ?? 27;

  ctx.save();
  ctx.font = font;
  const w = opts.width ?? ctx.measureText(text).width + padX * 2;

  roundedPath(ctx, x, y, w, height, opts.radius ?? height / 2);
  ctx.fillStyle = opts.bg || "rgba(12,14,26,0.72)";
  ctx.fill();
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = opts.borderWidth ?? 1.6;
    ctx.stroke();
  }

  ctx.fillStyle = opts.color || "#ffffff";
  ctx.textBaseline = "middle";
  ctx.textAlign = opts.align || "left";
  const tx = opts.align === "center" ? x + w / 2 : x + padX;
  ctx.fillText(text, tx, y + height / 2 + 0.5);
  ctx.restore();

  return w;
}

/** Measures what drawPill would return, without drawing it. */
function pillWidth(ctx, text, opts = {}) {
  ctx.save();
  ctx.font = opts.font || "bold 15px sans-serif";
  const w = ctx.measureText(text).width + (opts.padX ?? 11) * 2;
  ctx.restore();
  return w;
}

/** Draws text with a dark outline so it survives a bright background. */
function outlinedText(ctx, text, x, y, opts = {}) {
  ctx.save();
  ctx.font = opts.font || "bold 30px sans-serif";
  ctx.textBaseline = opts.baseline || "alphabetic";
  ctx.textAlign = opts.align || "left";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = opts.outline || "rgba(0,0,0,0.75)";
  ctx.lineWidth = opts.outlineWidth ?? 5;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = opts.color || "#ffffff";
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Fits an image inside a box while preserving its aspect ratio. */
function fitSprite(img, maxW, maxH) {
  const scale = Math.min(maxW / img.width, maxH / img.height);
  return { w: img.width * scale, h: img.height * scale };
}

/** Green above half, amber above a fifth, red below. */
function hpColor(pct) {
  if (pct > 0.5) return "#4caf50";
  if (pct > 0.2) return "#ffb300";
  return "#f44336";
}

/** Four-point sparkles, used for shinies. */
function drawSparkles(ctx, x, y, w, h, rng, count = 14) {
  ctx.save();
  for (let i = 0; i < count; i++) {
    const sx = x + rng() * w;
    const sy = y + rng() * h;
    const r = 2 + rng() * 4;
    ctx.globalAlpha = 0.4 + rng() * 0.5;
    ctx.strokeStyle = "#fff6c2";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(sx - r, sy); ctx.lineTo(sx + r, sy);
    ctx.moveTo(sx, sy - r); ctx.lineTo(sx, sy + r);
    ctx.stroke();
  }
  ctx.restore();
}

/** Truncates to fit `maxWidth` at the context's current font, adding an ellipsis. */
function ellipsize(ctx, text, maxWidth) {
  const str = String(text ?? "");
  if (ctx.measureText(str).width <= maxWidth) return str;
  let lo = 0;
  let hi = str.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${str.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${str.slice(0, Math.max(1, lo))}…`;
}

module.exports = {
  TYPE_COLORS, roundedPath, drawPill, pillWidth, outlinedText,
  fitSprite, hpColor, drawSparkles, ellipsize
};
