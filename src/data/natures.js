// ── Natures ───────────────────────────────────────────────────────────
// Each nature raises one stat by 10% and lowers another by 10%.
// The five "neutral" natures (Hardy, Docile, Serious, Bashful, Quirky)
// raise and lower the same stat, so they have no net effect.
//
// Stat keys match the columns/fields used everywhere else in the bot:
// hp, atk, def, spatk, spdef, spd. HP is never affected by nature.

const NATURE_MODIFIERS = {
  Hardy:   { up: null,    down: null },
  Lonely:  { up: "atk",   down: "def" },
  Brave:   { up: "atk",   down: "spd" },
  Adamant: { up: "atk",   down: "spatk" },
  Naughty: { up: "atk",   down: "spdef" },

  Bold:    { up: "def",   down: "atk" },
  Docile:  { up: null,    down: null },
  Relaxed: { up: "def",   down: "spd" },
  Impish:  { up: "def",   down: "spatk" },
  Lax:     { up: "def",   down: "spdef" },

  Timid:   { up: "spd",   down: "atk" },
  Hasty:   { up: "spd",   down: "def" },
  Serious: { up: null,    down: null },
  Jolly:   { up: "spd",   down: "spatk" },
  Naive:   { up: "spd",   down: "spdef" },

  Modest:  { up: "spatk", down: "atk" },
  Mild:    { up: "spatk", down: "def" },
  Quiet:   { up: "spatk", down: "spd" },
  Bashful: { up: null,    down: null },
  Rash:    { up: "spatk", down: "spdef" },

  Calm:    { up: "spdef", down: "atk" },
  Gentle:  { up: "spdef", down: "def" },
  Sassy:   { up: "spdef", down: "spd" },
  Careful: { up: "spdef", down: "spatk" },
  Quirky:  { up: null,    down: null }
};

const STAT_LABELS = {
  hp: "HP",
  atk: "Attack",
  def: "Defense",
  spatk: "Sp. Atk",
  spdef: "Sp. Def",
  spd: "Speed"
};

/**
 * Multiplier a nature applies to a given stat.
 * Returns 1.1 for the boosted stat, 0.9 for the hindered stat, 1 otherwise.
 */
function getNatureMultiplier(nature, stat) {
  if (!nature || stat === "hp") return 1;
  const mod = NATURE_MODIFIERS[nature];
  if (!mod || !mod.up) return 1;
  if (mod.up === stat) return 1.1;
  if (mod.down === stat) return 0.9;
  return 1;
}

/** Human-readable summary, e.g. "+Attack / -Sp. Atk" or "neutral". */
function describeNature(nature) {
  const mod = NATURE_MODIFIERS[nature];
  if (!mod || !mod.up) return "neutral";
  return `+${STAT_LABELS[mod.up]} / -${STAT_LABELS[mod.down]}`;
}

/** Natures that boost `stat` — used by the Nature Mint to target a stat. */
function naturesBoosting(stat) {
  return Object.keys(NATURE_MODIFIERS).filter(n => NATURE_MODIFIERS[n].up === stat);
}

module.exports = { NATURE_MODIFIERS, STAT_LABELS, getNatureMultiplier, describeNature, naturesBoosting };
