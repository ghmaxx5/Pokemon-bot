const { createCanvas, loadImage } = require("@napi-rs/canvas");

/**
 * Generates a Poketwo-style battle image with both Pokemon and HP bars.
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │  P2 HP bar (top-left)   P1 name (top-r) │
 *   │  [P2 sprite - left]   [P1 sprite - right]│
 *   │  P1 HP bar (bot-left)   P2 name (bot-r)  │
 *   └─────────────────────────────────────────┘
 *
 * Actually follows Poketwo convention:
 *   - Opponent (p2) is on the LEFT (back-sprite feel but we use front)
 *   - Player (p1) is on the RIGHT
 *   - p2's info card is TOP-LEFT
 *   - p1's info card is BOTTOM-RIGHT
 */

const WIDTH = 800;
const HEIGHT = 360;
const BG_COLOR = "#1a1a2e";
const CARD_BG = "rgba(255,255,255,0.08)";

function hpColor(pct) {
  if (pct > 0.5) return "#4caf50";
  if (pct > 0.2) return "#ffb300";
  return "#f44336";
}

function drawHpBar(ctx, x, y, w, h, current, max, name, level, teamDots) {
  const pct = Math.max(0, Math.min(1, current / max));
  const radius = 10;

  // Card background
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = "rgba(20,20,40,0.85)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Name
  ctx.save();
  ctx.font = "bold 16px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name.length > 18 ? name.slice(0, 17) + "…" : name, x + 12, y + 24);

  // Level
  ctx.font = "13px sans-serif";
  ctx.fillStyle = "#aaaacc";
  ctx.fillText(`Lv. ${level}`, x + w - 52, y + 24);
  ctx.restore();

  // HP label
  ctx.save();
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#aaaacc";
  ctx.fillText("HP", x + 12, y + 46);
  ctx.restore();

  // HP bar track
  const barX = x + 32;
  const barY = y + 36;
  const barW = w - 44;
  const barH = 10;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 5);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fill();

  // HP fill
  if (pct > 0) {
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * pct, barH, 5);
    ctx.fillStyle = hpColor(pct);
    ctx.fill();
  }
  ctx.restore();

  // HP numbers
  ctx.save();
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#ccccdd";
  ctx.textAlign = "right";
  ctx.fillText(`${current}/${max}`, x + w - 12, y + 62);
  ctx.restore();

  // Team dots (alive indicators)
  if (teamDots && teamDots.length > 0) {
    const dotRadius = 5;
    const dotSpacing = 14;
    const dotY = y + 57;
    let dotX = x + 12;
    for (const alive of teamDots) {
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = alive ? "#4caf50" : "#555577";
      ctx.fill();
      dotX += dotSpacing;
    }
  }
}

async function generateBattleImage(p1, p2, p1ImageUrl, p2ImageUrl) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, "#0f0c29");
  grad.addColorStop(0.5, "#302b63");
  grad.addColorStop(1, "#24243e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Ground line
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, HEIGHT - 60);
  ctx.lineTo(WIDTH - 40, HEIGHT - 60);
  ctx.stroke();
  ctx.restore();

  // VS text in center
  ctx.save();
  ctx.font = "bold 48px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.textAlign = "center";
  ctx.fillText("VS", WIDTH / 2, HEIGHT / 2 + 16);
  ctx.restore();

  // Load images with fallback
  let p1Img = null;
  let p2Img = null;

  try { p1Img = await loadImage(p1ImageUrl); } catch {}
  try { p2Img = await loadImage(p2ImageUrl); } catch {}

  const spriteSize = 200;
  const groundY = HEIGHT - 65;

  // P2 (opponent) sprite — LEFT side
  if (p2Img) {
    const p2X = WIDTH / 4 - spriteSize / 2;
    const p2Y = groundY - spriteSize;
    ctx.drawImage(p2Img, p2X, p2Y, spriteSize, spriteSize);
  } else {
    // Fallback silhouette
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(WIDTH / 4 - 60, groundY - 130, 120, 120);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // P1 (player) sprite — RIGHT side
  if (p1Img) {
    const p1X = (3 * WIDTH) / 4 - spriteSize / 2;
    const p1Y = groundY - spriteSize;
    // Flip horizontally to face left (like a battle)
    ctx.save();
    ctx.translate(p1X + spriteSize, p1Y);
    ctx.scale(-1, 1);
    ctx.drawImage(p1Img, 0, 0, spriteSize, spriteSize);
    ctx.restore();
  } else {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect((3 * WIDTH) / 4 - 60, groundY - 130, 120, 120);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // --- HP Cards ---
  const cardW = 260;
  const cardH = 72;
  const margin = 16;

  // P2 card — TOP LEFT
  drawHpBar(
    ctx,
    margin, margin,
    cardW, cardH,
    p2.currentHp, p2.maxHp,
    p2.displayName, p2.level,
    p2.teamDots
  );

  // P1 card — BOTTOM RIGHT
  drawHpBar(
    ctx,
    WIDTH - cardW - margin, HEIGHT - cardH - margin,
    cardW, cardH,
    p1.currentHp, p1.maxHp,
    p1.displayName, p1.level,
    p1.teamDots
  );

  return canvas.toBuffer("image/png");
}

module.exports = { generateBattleImage };
