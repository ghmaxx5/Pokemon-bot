// ── Spawn rarity ──────────────────────────────────────────────────────
// Wild spawns used to be a uniform pick over all 1025 species, which meant
// Mewtwo appeared exactly as often as Caterpie. Tiers are derived from the
// `captureRate` already present on every entry in pokemon.json, plus the
// isLegendary / isMythical flags, so no new data is required.

const TIERS = {
  common:     { weight: 100, label: "Common",     emoji: "⚪", color: 0x95a5a6 },
  uncommon:   { weight: 45,  label: "Uncommon",   emoji: "🟢", color: 0x2ecc71 },
  rare:       { weight: 12,  label: "Rare",       emoji: "🔵", color: 0x3498db },
  ultra_rare: { weight: 5,   label: "Ultra Rare", emoji: "🟣", color: 0x9b59b6 },
  legendary:  { weight: 2,   label: "Legendary",  emoji: "🟠", color: 0xe67e22 },
  mythical:   { weight: 0.8, label: "Mythical",   emoji: "🔴", color: 0xe74c3c },
  event:      { weight: 0,   label: "Event",      emoji: "🎊", color: 0xf72585 }
};

/** Rarity tier for a species entry from pokemon.json. */
function getRarity(p) {
  if (!p) return "common";
  if (p.isEventPokemon) return "event";
  if (p.spawnRarity && TIERS[p.spawnRarity]) return p.spawnRarity;
  if (p.isMythical) return "mythical";
  if (p.isLegendary) return "legendary";
  const cr = typeof p.captureRate === "number" ? p.captureRate : 255;
  if (cr <= 20) return "ultra_rare";
  if (cr <= 45) return "rare";
  if (cr <= 120) return "uncommon";
  return "common";
}

function getRarityInfo(p) {
  return TIERS[getRarity(p)] || TIERS.common;
}

/**
 * Weighted-random picker over a fixed list.
 * Builds a cumulative-weight table once, then each pick is a binary search
 * instead of a fresh O(n) scan and filter.
 */
function buildWeightedPicker(entries, weightOf) {
  const items = [];
  const cumulative = [];
  let total = 0;
  for (const e of entries) {
    const w = weightOf(e);
    if (!(w > 0)) continue;
    total += w;
    items.push(e);
    cumulative.push(total);
  }

  return {
    total,
    size: items.length,
    pick() {
      if (!items.length) return null;
      const roll = Math.random() * total;
      let lo = 0, hi = cumulative.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cumulative[mid] <= roll) lo = mid + 1;
        else hi = mid;
      }
      return items[lo];
    }
  };
}

module.exports = { TIERS, getRarity, getRarityInfo, buildWeightedPicker };
