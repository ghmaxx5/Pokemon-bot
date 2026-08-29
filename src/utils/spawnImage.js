const { createCanvas } = require("@napi-rs/canvas");
const S = require("./scene");
const K = require("./canvasKit");
const { getSprite } = require("./spriteCache");
const { getPokemonImage } = require("../data/pokemonLoader");
const { getRarityInfo } = require("../data/rarity");
const { capitalize, getTypeEmoji } = require("./helpers");

/**
 * Wild-spawn cards: the Pokemon standing in a type-appropriate scene.
 *
 * Spawns used to be a bare sprite on Discord's embed background with no sense
 * of place. The scene comes from `scene.js`, so real artwork dropped into
 * assets/backgrounds/ is picked up here automatically.
 */

const WIDTH = 720;
const HEIGHT = 400;

// The drawing primitives moved to canvasKit.js so battleImage.js can share them.
// Re-exported below under the same names, so nothing that imported them breaks.
const { TYPE_COLORS, roundedPath, drawPill, outlinedText, fitSprite, drawSparkles } = K;

/**
 * @param {object} pokemon  a pokemon.json species record
 * @param {object} opts
 * @param {boolean} opts.shiny
 * @param {boolean} opts.revealName   show the species name (post-catch cards)
 * @param {string}  opts.sceneKey     force a scene instead of deriving it
 * @param {number}  opts.seed         scenery seed — pass the channel id so a
 *                                    channel's spawns look consistent
 * @returns {Promise<Buffer>} PNG
 */
async function generateSpawnImage(pokemon, opts = {}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const types = pokemon?.types || [];
  const sceneKey = opts.sceneKey || S.sceneForTypes(types);
  const tier = pokemon ? getRarityInfo(pokemon) : null;
  const accent = S.sceneInfo(sceneKey).accent;

  const { horizon } = await S.drawScene(ctx, WIDTH, HEIGHT, sceneKey, {
    seed: opts.seed ?? S.seedFrom(sceneKey, pokemon?.id),
    horizon: Math.round(HEIGHT * 0.66)
  });

  // ── the Pokemon ──
  const groundY = horizon + 44;
  const sprite = await getSprite(getPokemonImage(pokemon.id, !!opts.shiny));

  S.drawPlatform(ctx, WIDTH / 2, groundY, 150, accent);

  if (sprite) {
    const { w, h } = fitSprite(sprite, 300, 258);
    const x = WIDTH / 2 - w / 2;
    const y = groundY - h + 12;

    // A shiny gets a warm halo so it reads as special even at a glance.
    if (opts.shiny) {
      const halo = ctx.createRadialGradient(WIDTH / 2, y + h / 2, 10, WIDTH / 2, y + h / 2, Math.max(w, h) * 0.7);
      halo.addColorStop(0, "rgba(255,236,150,0.42)");
      halo.addColorStop(1, "rgba(255,236,150,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    ctx.drawImage(sprite, x, y, w, h);

    if (opts.shiny) drawSparkles(ctx, x, y, w, h, S.makeRng(S.seedFrom("shiny", pokemon.id)));
  } else {
    // No sprite is still a playable spawn — draw a question mark placeholder.
    outlinedText(ctx, "?", WIDTH / 2, groundY - 60, {
      font: "bold 150px sans-serif", align: "center", color: "rgba(255,255,255,0.35)"
    });
  }

  // ── header ──
  const title = opts.revealName
    ? capitalize(pokemon.displayName || pokemon.name)
    : "A wild Pokémon appeared!";
  outlinedText(ctx, title, 26, 46, { font: "bold 29px sans-serif" });

  // ── rarity + type chips ──
  let chipX = 26;
  const chipY = 62;
  if (tier) {
    chipX += drawPill(ctx, chipX, chipY, `${tier.emoji} ${tier.label}`, {
      border: `#${tier.color.toString(16).padStart(6, "0")}`,
      color: "#ffffff"
    }) + 8;
  }
  for (const t of types) {
    const key = String(t).toLowerCase();
    chipX += drawPill(ctx, chipX, chipY, `${getTypeEmoji(key) || ""} ${capitalize(key)}`.trim(), {
      bg: `${TYPE_COLORS[key] || "#555"}cc`,
      font: "bold 14px sans-serif"
    }) + 7;
  }

  // ── event banner ──
  if (pokemon.isEventPokemon) {
    drawPill(ctx, 26, HEIGHT - 44, `🎊 ${pokemon.eventName || "Special Event"}`, {
      bg: "rgba(247,37,133,0.85)", border: "#ffd6ea", height: 30, font: "bold 15px sans-serif"
    });
  }

  return canvas.toBuffer("image/png");
}

module.exports = {
  generateSpawnImage, TYPE_COLORS, drawPill, outlinedText, fitSprite, drawSparkles,
  WIDTH, HEIGHT
};

