const { createCanvas } = require("@napi-rs/canvas");
const S = require("./scene");
const K = require("./canvasKit");
const { getSprite } = require("./spriteCache");

/**
 * The battle field: both Pokemon in a single frame, laid out like a GBA battle.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ [FOE HP]                        ( foe )      │  foe box top-left,
 *   │                                ══platform══  │  foe sprite top-right
 *   │        ( player )                            │
 *   │      ═══platform═══            [PLAYER HP]   │  player sprite bottom-left,
 *   └──────────────────────────────────────────────┘  player box bottom-right
 *
 * The old renderer put both Pokemon on a flat gradient with no depth, reloaded
 * every sprite from the network on every turn, and drew the HP numbers on top of
 * the team dots. This one uses the shared scene engine, the shared sprite cache,
 * and shows the state the engine actually tracks: status, stat stages, Mega /
 * Gigantamax form and aura, Protect, and fainting.
 */

const WIDTH = 800;
const HEIGHT = 400;

const BOX_W = 300;
const BOX_H = 80;
const MARGIN = 16;

// Foe reads as further away: smaller sprite, higher and tighter platform.
const FOE = { cx: 568, cy: 206, radius: 104, maxW: 168, maxH: 152, lift: 10 };
const YOU = { cx: 232, cy: 352, radius: 142, maxW: 236, maxH: 206, lift: 14 };

const STATUS_BADGE = {
  burn:     { code: "BRN", color: "#f2673d" },
  poison:   { code: "PSN", color: "#a55eb5" },
  toxic:    { code: "TOX", color: "#8e44ad" },
  paralyze: { code: "PAR", color: "#e3b62c" },
  freeze:   { code: "FRZ", color: "#6ec6f0" },
  sleep:    { code: "SLP", color: "#8d97ab" }
};

const STAGE_LABEL = {
  atk: "Atk", def: "Def", spatk: "SpA", spdef: "SpD",
  spd: "Spe", accuracy: "Acc", evasion: "Eva"
};

// Form auras. Primal gets its own colour so Kyogre/Groudon don't read as Mega.
const AURA = {
  mega:   { inner: "rgba(200,107,255,0.55)", outer: "rgba(200,107,255,0)", pill: "#c86bff", label: "MEGA" },
  primal: { inner: "rgba(255,157,77,0.55)",  outer: "rgba(255,157,77,0)",  pill: "#ff9d4d", label: "PRIMAL" },
  gmax:   { inner: "rgba(255,77,109,0.55)",  outer: "rgba(255,77,109,0)",  pill: "#ff4d6d", label: "G-MAX" },
  zmove:  { inner: "rgba(90,230,255,0.55)",  outer: "rgba(90,230,255,0)",  pill: "#5ae6ff", label: "Z-POWER" }
};

/** Which aura a combatant is currently wearing, if any. */
function auraFor(side) {
  if (side.gmaxed) return AURA.gmax;
  if (side.megaEvolved) return side.isPrimal ? AURA.primal : AURA.mega;
  if (side.zPowered) return AURA.zmove;
  return null;
}

/** Loads the first sprite candidate that decodes, so a bad form URL can't blank the frame. */
async function firstSprite(urls) {
  for (const url of urls) {
    if (!url) continue;
    const img = await getSprite(url);
    if (img) return img;
  }
  return null;
}

// ── HP box ───────────────────────────────────────────────────────────────────

/**
 * Name / level / HP bar / HP numbers / status badges / stat stages / team dots.
 *
 * Rows are laid out explicitly: the numbers used to be drawn at y+62 and the
 * team dots at y+57, so on a 3v3 they overlapped into an unreadable smear.
 */
function drawHpBox(ctx, x, y, side) {
  const max = Math.max(1, side.maxHp || 1);
  const current = Math.max(0, Math.min(max, side.currentHp ?? 0));
  const pct = current / max;
  const fainted = current <= 0;

  ctx.save();

  // panel
  K.roundedPath(ctx, x, y, BOX_W, BOX_H, 12);
  ctx.fillStyle = "rgba(14,16,30,0.82)";
  ctx.fill();
  ctx.strokeStyle = fainted ? "rgba(244,67,54,0.45)" : "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // row 1 — name and level
  ctx.font = "13px sans-serif";
  const levelText = `Lv. ${side.level ?? "?"}`;
  const levelW = ctx.measureText(levelText).width;

  ctx.font = "bold 17px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = fainted ? "#8d8da8" : "#ffffff";
  ctx.fillText(K.ellipsize(ctx, side.displayName || "?", BOX_W - 26 - levelW - 10), x + 13, y + 24);

  ctx.font = "13px sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "#aab0d0";
  ctx.fillText(levelText, x + BOX_W - 13, y + 24);

  // row 2 — HP bar with the numbers beside it, never under it
  const numbersW = 66;
  const barX = x + 38;
  const barY = y + 36;
  const barW = BOX_W - 38 - 13 - numbersW - 6;
  const barH = 11;

  ctx.textAlign = "left";
  ctx.font = "bold 11px sans-serif";
  ctx.fillStyle = "#aab0d0";
  ctx.fillText("HP", x + 13, y + 45);

  K.roundedPath(ctx, barX, barY, barW, barH, 5.5);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fill();
  if (pct > 0) {
    // Always leave a sliver visible so 1 HP doesn't look like a faint.
    K.roundedPath(ctx, barX, barY, Math.max(3, barW * pct), barH, 5.5);
    ctx.fillStyle = K.hpColor(pct);
    ctx.fill();
  }

  ctx.font = "12px sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "#ccd0e6";
  ctx.fillText(`${current}/${max}`, x + BOX_W - 13, y + 46);

  // row 3 — team dots on the right, condition badges on the left
  const dots = Array.isArray(side.teamDots) ? side.teamDots : null;
  let rightEdge = x + BOX_W - 13;
  if (dots && dots.length) {
    const spacing = 14;
    let dotX = rightEdge - 5;
    for (let i = dots.length - 1; i >= 0; i--) {
      ctx.beginPath();
      ctx.arc(dotX, y + 64, 5, 0, Math.PI * 2);
      ctx.fillStyle = dots[i] ? "#4caf50" : "#4b4f66";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      dotX -= spacing;
    }
    rightEdge = dotX + spacing - 10;
  }

  drawConditions(ctx, x + 13, y + 55, rightEdge - (x + 13), side);

  ctx.restore();
}

/** Status badge, confusion, Protect, charge state and every non-zero stat stage. */
function drawConditions(ctx, x, y, maxWidth, side) {
  const chips = [];

  const badge = STATUS_BADGE[side.status];
  if (badge) chips.push({ text: badge.code, color: badge.color });
  if (side.confusedTurns > 0) chips.push({ text: "CNF", color: "#e07ab8" });
  if (side.protecting) chips.push({ text: "PROT", color: "#6ec6f0" });
  if (side.charging) chips.push({ text: "CHG", color: "#f2c53d" });
  if (side.mustRecharge) chips.push({ text: "TIRED", color: "#8d97ab" });

  for (const [key, label] of Object.entries(STAGE_LABEL)) {
    const stage = side.stages?.[key] || 0;
    if (!stage) continue;
    chips.push({
      text: `${label}${stage > 0 ? "▲" : "▼"}${Math.abs(stage)}`,
      color: stage > 0 ? "#4caf50" : "#ef5350"
    });
  }

  if (!chips.length) return;

  const font = "bold 11px sans-serif";
  let cx = x;
  let drawn = 0;

  for (const chip of chips) {
    const w = K.pillWidth(ctx, chip.text, { font, padX: 6 });
    // Reserve room for a "+n" marker rather than clipping a chip in half.
    const needsRoom = drawn < chips.length - 1 ? 26 : 0;
    if (cx + w + needsRoom > x + maxWidth) break;

    K.drawPill(ctx, cx, y, chip.text, {
      font, padX: 6, height: 17, radius: 5,
      bg: `${chip.color}33`, border: `${chip.color}cc`, borderWidth: 1.2, color: "#ffffff"
    });
    cx += w + 4;
    drawn++;
  }

  if (drawn < chips.length) {
    K.drawPill(ctx, cx, y, `+${chips.length - drawn}`, {
      font, padX: 5, height: 17, radius: 5,
      bg: "rgba(255,255,255,0.14)", color: "#dfe3f5"
    });
  }
}

/** Type chips, drawn outside the HP box so they never crowd the bar. */
function drawTypeChips(ctx, x, y, types) {
  let cx = x;
  for (const t of types || []) {
    const key = String(t).toLowerCase();
    cx += K.drawPill(ctx, cx, y, key.toUpperCase(), {
      font: "bold 11px sans-serif", padX: 8, height: 20, radius: 6,
      bg: `${K.TYPE_COLORS[key] || "#555"}dd`, border: "rgba(0,0,0,0.35)", borderWidth: 1
    }) + 5;
  }
}

// ── combatants ───────────────────────────────────────────────────────────────

/**
 * Draws one Pokemon on its platform.
 *
 * @param {boolean} mirror flip horizontally — the player's Pokemon is a front
 *                         sprite standing in the back slot, so mirroring is what
 *                         makes it read as facing the foe.
 */
function drawCombatant(ctx, slot, sprite, side, rng) {
  const fainted = (side.currentHp ?? 0) <= 0;
  const aura = fainted ? null : auraFor(side);

  // A Gigantamax form is drawn oversized, the way the anime plays it.
  const scale = side.gmaxed ? 1.22 : 1;
  const maxW = slot.maxW * scale;
  const maxH = slot.maxH * scale;

  S.drawPlatform(ctx, slot.cx, slot.cy, slot.radius, side.accent || "#ffffff");

  if (!sprite) {
    K.outlinedText(ctx, "?", slot.cx, slot.cy - 30, {
      font: `bold ${Math.round(slot.maxH * 0.62)}px sans-serif`,
      align: "center", color: "rgba(255,255,255,0.32)"
    });
    return;
  }

  const { w, h } = K.fitSprite(sprite, maxW, maxH);
  const x = slot.cx - w / 2;
  const y = slot.cy + slot.lift - h;

  if (aura) {
    const g = ctx.createRadialGradient(slot.cx, y + h * 0.55, 6, slot.cx, y + h * 0.55, Math.max(w, h) * 0.72);
    g.addColorStop(0, aura.inner);
    g.addColorStop(1, aura.outer);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(x - w * 0.5, y - h * 0.3, w * 2, h * 1.7);
    ctx.restore();
  } else if (side.shiny && !fainted) {
    const g = ctx.createRadialGradient(slot.cx, y + h * 0.55, 8, slot.cx, y + h * 0.55, Math.max(w, h) * 0.68);
    g.addColorStop(0, "rgba(255,236,150,0.40)");
    g.addColorStop(1, "rgba(255,236,150,0)");
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(x - w * 0.5, y - h * 0.3, w * 2, h * 1.7);
    ctx.restore();
  }

  ctx.save();
  if (fainted) {
    // Greyed and faded, so a KO'd Pokemon still shows the matchup but reads as out.
    ctx.filter = "grayscale(100%)";
    ctx.globalAlpha = 0.42;
  }
  if (slot.mirror) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, 0, w, h);
  } else {
    ctx.drawImage(sprite, x, y, w, h);
  }
  ctx.restore();

  if (side.shiny && !fainted) K.drawSparkles(ctx, x, y, w, h, rng, 12);

  if (side.protecting && !fainted) drawShield(ctx, slot, w, h, y);

  if (fainted) {
    K.outlinedText(ctx, "FAINTED", slot.cx, slot.cy - 6, {
      font: "bold 20px sans-serif", align: "center", color: "#ff8f8f", outlineWidth: 4
    });
  }
}

/** Translucent barrier arc in front of a Protecting Pokemon. */
function drawShield(ctx, slot, w, h, y) {
  ctx.save();
  const cy = y + h * 0.55;
  const g = ctx.createRadialGradient(slot.cx, cy, w * 0.2, slot.cx, cy, w * 0.75);
  g.addColorStop(0, "rgba(110,198,240,0.05)");
  g.addColorStop(0.75, "rgba(110,198,240,0.22)");
  g.addColorStop(1, "rgba(110,198,240,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(slot.cx, cy, w * 0.72, h * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(150,220,255,0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

// ── entry point ──────────────────────────────────────────────────────────────

/**
 * @param {object} p1 the viewer's Pokemon (drawn bottom-left)
 * @param {object} p2 the opponent's Pokemon (drawn top-right)
 *
 *   Required on each: currentHp, maxHp, displayName, level
 *   Optional:         teamDots, types, status, confusedTurns, stages, shiny,
 *                     megaEvolved, isPrimal, gmaxed, zPowered, protecting,
 *                     charging, mustRecharge, spriteUrls
 *
 * @param {string} p1ImageUrl kept for the original call shape — used as p1's
 *                            sprite when `p1.spriteUrls` isn't supplied
 * @param {string} p2ImageUrl likewise for p2
 * @param {object} opts {turn, sceneKey, seed, label1, label2}
 * @returns {Promise<Buffer>} PNG
 */
async function generateBattleImage(p1, p2, p1ImageUrl, p2ImageUrl, opts = {}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const sceneKey = opts.sceneKey || S.sceneForTypes(p1?.types || p2?.types || []);
  const seed = opts.seed ?? S.seedFrom(sceneKey, "battle");
  const rng = S.makeRng(seed);

  const { horizon, scene } = await S.drawScene(ctx, WIDTH, HEIGHT, sceneKey, {
    seed, horizon: Math.round(HEIGHT * 0.44), dim: 0.08
  });

  // Both sprites at once — they're usually already cached, and on a first load
  // this halves the latency compared with awaiting them one after the other.
  const [foeSprite, youSprite] = await Promise.all([
    firstSprite(p2?.spriteUrls?.length ? p2.spriteUrls : [p2ImageUrl]),
    firstSprite(p1?.spriteUrls?.length ? p1.spriteUrls : [p1ImageUrl])
  ]);

  const foeSide = { ...p2, accent: scene.accent };
  const youSide = { ...p1, accent: scene.accent };

  // Foe first: drawing the nearer Pokemon last keeps the depth order right.
  drawCombatant(ctx, { ...FOE, mirror: false }, foeSprite, foeSide, rng);
  drawCombatant(ctx, { ...YOU, mirror: true }, youSprite, youSide, rng);

  // Faint dividing haze along the horizon, so the two halves separate cleanly.
  ctx.save();
  const haze = ctx.createLinearGradient(0, horizon - 16, 0, horizon + 16);
  haze.addColorStop(0, "rgba(255,255,255,0)");
  haze.addColorStop(0.5, `${scene.accent}14`);
  haze.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizon - 16, WIDTH, 32);
  ctx.restore();

  // Foe box top-left with its types beneath it.
  drawHpBox(ctx, MARGIN, MARGIN, foeSide);
  drawTypeChips(ctx, MARGIN, MARGIN + BOX_H + 6, p2?.types);

  // Player box bottom-right with its types above it.
  const youBoxX = WIDTH - BOX_W - MARGIN;
  const youBoxY = HEIGHT - BOX_H - MARGIN;
  drawTypeChips(ctx, youBoxX, youBoxY - 26, p1?.types);
  drawHpBox(ctx, youBoxX, youBoxY, youSide);

  // Form badges, each in its own Pokemon's outer corner.
  const foeAura = auraFor(foeSide);
  if (foeAura && (p2.currentHp ?? 0) > 0) {
    const text = `${foeAura.label}${p2.gmaxTurns ? ` ${p2.gmaxTurns}` : ""}`;
    const w = K.pillWidth(ctx, text, { font: "bold 13px sans-serif", padX: 10 });
    K.drawPill(ctx, WIDTH - MARGIN - w, MARGIN, text, {
      font: "bold 13px sans-serif", padX: 10, height: 24,
      bg: "rgba(12,14,26,0.8)", border: foeAura.pill, color: foeAura.pill
    });
  }

  const youAura = auraFor(youSide);
  if (youAura && (p1.currentHp ?? 0) > 0) {
    const text = `${youAura.label}${p1.gmaxTurns ? ` ${p1.gmaxTurns}` : ""}`;
    K.drawPill(ctx, MARGIN, HEIGHT - MARGIN - 24, text, {
      font: "bold 13px sans-serif", padX: 10, height: 24,
      bg: "rgba(12,14,26,0.8)", border: youAura.pill, color: youAura.pill
    });
  }

  // Turn counter, centred at the top.
  if (opts.turn) {
    const text = `TURN ${opts.turn}`;
    const w = K.pillWidth(ctx, text, { font: "bold 13px sans-serif", padX: 12 });
    K.drawPill(ctx, WIDTH / 2 - w / 2, 14, text, {
      font: "bold 13px sans-serif", padX: 12, height: 24,
      bg: "rgba(12,14,26,0.74)", border: "rgba(255,255,255,0.25)", color: "#e8ebff"
    });
  }

  return canvas.toBuffer("image/png");
}

module.exports = {
  generateBattleImage,
  WIDTH, HEIGHT, STATUS_BADGE, STAGE_LABEL, AURA
};
