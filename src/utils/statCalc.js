// ── Stat calculation ──────────────────────────────────────────────────
// Single source of truth for every stat number the bot shows or fights with.
// Before this existed, battle.js / info.js / battleImage.js each had their
// own copy and natures were ignored entirely.

const { getNatureMultiplier } = require("../data/natures");

// Battles run at a flat 0 EVs. Kept as a named constant so the formula reads
// like the official one and EVs can be wired in later without hunting magic 0s.
const EV = 0;

/** Max HP. HP uses a different formula from the other five stats. */
function calcHP(baseHP, iv, level) {
  if (baseHP === 1) return 1; // Shedinja
  return Math.floor(((2 * baseHP + iv + Math.floor(EV / 4)) * level) / 100) + level + 10;
}

/**
 * Atk/Def/SpAtk/SpDef/Spd at a given level, including the nature modifier.
 * `stat` must be one of atk/def/spatk/spdef/spd so the nature can be applied.
 */
function calcStat(baseStat, iv, level, stat, nature) {
  const raw = Math.floor(((2 * baseStat + iv + Math.floor(EV / 4)) * level) / 100) + 5;
  return Math.max(1, Math.floor(raw * getNatureMultiplier(nature, stat)));
}

/** All six battle-ready stats for a stored Pokemon row + species data. */
function calcAllStats(baseStats, ivs, level, nature) {
  return {
    hp:    calcHP(baseStats.hp, ivs.hp, level),
    atk:   calcStat(baseStats.atk,   ivs.atk,   level, "atk",   nature),
    def:   calcStat(baseStats.def,   ivs.def,   level, "def",   nature),
    spatk: calcStat(baseStats.spatk, ivs.spatk, level, "spatk", nature),
    spdef: calcStat(baseStats.spdef, ivs.spdef, level, "spdef", nature),
    spd:   calcStat(baseStats.spd,   ivs.spd,   level, "spd",   nature)
  };
}

// ── Stat stages (-6 … +6) ─────────────────────────────────────────────
// Atk/Def/SpAtk/SpDef/Spd use the (2+n)/2 ladder; accuracy and evasion use
// the shallower (3+n)/3 ladder.
function stageMultiplier(stage) {
  const n = Math.max(-6, Math.min(6, stage || 0));
  return n >= 0 ? (2 + n) / 2 : 2 / (2 - n);
}

function accuracyStageMultiplier(stage) {
  const n = Math.max(-6, Math.min(6, stage || 0));
  return n >= 0 ? (3 + n) / 3 : 3 / (3 - n);
}

/** Applies a stat stage to an already-calculated stat. */
function applyStage(stat, stage) {
  return Math.max(1, Math.floor(stat * stageMultiplier(stage)));
}

module.exports = {
  calcHP,
  calcStat,
  calcAllStats,
  stageMultiplier,
  accuracyStageMultiplier,
  applyStage
};
