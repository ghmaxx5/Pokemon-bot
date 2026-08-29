// ── Battle engine ─────────────────────────────────────────────────────
// Every mechanic that decides what happens in a turn lives here, so
// commands/battle.js only has to deal with Discord. Previously the whole
// engine was inline in the command and had no physical/special split, no PP,
// no crits, no priority and no status conditions.

const { getEffectiveness } = require("../data/types");
const { calcHP, calcStat, applyStage, accuracyStageMultiplier } = require("./statCalc");
const { getEquippedMoves } = require("../data/moves");
const { getMegaData, getGmaxData } = require("../data/mega");
const { capitalize } = require("./helpers");

const STAT_KEYS = ["atk", "def", "spatk", "spdef", "spd"];

const STATUS_INFO = {
  burn:     { icon: "🔥", label: "Burn",      applied: "was burned"          },
  poison:   { icon: "☠️", label: "Poison",    applied: "was poisoned"        },
  toxic:    { icon: "☠️", label: "Toxic",     applied: "was badly poisoned"  },
  paralyze: { icon: "⚡", label: "Paralysis", applied: "was paralyzed"       },
  freeze:   { icon: "🧊", label: "Freeze",    applied: "was frozen solid"    },
  sleep:    { icon: "😴", label: "Sleep",     applied: "fell asleep"         }
};

const STAT_LABELS = { atk: "Attack", def: "Defense", spatk: "Sp. Atk", spdef: "Sp. Def", spd: "Speed", accuracy: "accuracy", evasion: "evasiveness" };

// Used when a Pokemon has no PP left in any slot.
const STRUGGLE = {
  name: "Struggle", type: "normal", power: 50, accuracy: 100,
  category: "physical", pp: 1, neverMiss: true, effect: { recoil: 0.25 }
};

// ── Setup ─────────────────────────────────────────────────────────────

/** Turns a `pokemon` DB row + species data into a battle-ready combatant. */
function prepareBattlePokemon(row, data) {
  const maxHp = calcHP(data.baseStats.hp, row.iv_hp, row.level);
  const heldItem = row.held_item || null;
  const megaData = heldItem === "mega_stone" ? getMegaData(row.pokemon_id) : null;
  const gmaxData = heldItem === "gmax_ring" ? getGmaxData(row.pokemon_id) : null;

  const moves = getEquippedMoves(
    [row.move1, row.move2, row.move3, row.move4],
    data.types, row.level, row.pokemon_id
  ).map(m => ({ ...m, pp: m.pp || 20, maxPp: m.pp || 20 }));

  const canZMove = heldItem === "z_ring";

  return {
    ...row,
    data,
    maxHp,
    currentHp: maxHp,
    baseMaxHp: maxHp,
    moves,
    canMega: !!megaData,
    canGmax: !!gmaxData,
    canZMove,
    zUsed: false,
    zPowered: false,
    megaData,
    gmaxData,
    megaEvolved: false,
    gmaxed: false,
    gmaxTurns: 0,
    activeTypes: [...data.types],
    // Raw additions to the *base* stats, granted by Mega Evolution / Primal
    // Reversion. Distinct from `stages`, which are the in-battle -6..+6 ladder.
    baseBoosts: { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 },
    stages: { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0, accuracy: 0, evasion: 0 },
    status: null,
    sleepTurns: 0,
    toxicCounter: 0,
    confusedTurns: 0,
    protecting: false,
    protectStreak: 0,
    mustRecharge: false,
    chargedMove: null,
    flinched: false,
    heldItem
  };
}

// ── Stats ─────────────────────────────────────────────────────────────

/**
 * A stat as it is right now: species base + Mega boost, through the nature
 * modifier, then the stat stage, then status penalties.
 */
function effStat(poke, key, { ignoreStages = false, critIgnore = false } = {}) {
  const base = (poke.data.baseStats[key] || 0) + (poke.baseBoosts?.[key] || 0);
  let value = calcStat(base, poke[`iv_${key}`] ?? 0, poke.level, key, poke.nature);

  if (!ignoreStages) {
    let stage = poke.stages?.[key] || 0;
    // A critical hit ignores the attacker's drops and the target's boosts.
    if (critIgnore) stage = key === "def" || key === "spdef" ? Math.min(0, stage) : Math.max(0, stage);
    value = applyStage(value, stage);
  }

  if (key === "atk" && poke.status === "burn") value = Math.max(1, Math.floor(value * 0.5));
  if (key === "spd" && poke.status === "paralyze") value = Math.max(1, Math.floor(value * 0.5));
  return value;
}

function getSpeed(poke) {
  return effStat(poke, "spd");
}

/** Nature-adjusted stat block for display (no stages, no status). */
function displayStats(poke) {
  const out = {};
  for (const k of STAT_KEYS) out[k] = effStat(poke, k, { ignoreStages: true });
  out.hp = poke.maxHp;
  return out;
}

// ── Presentation ──────────────────────────────────────────────────────

function battleName(poke) {
  let prefix = "";
  if (poke.megaEvolved) prefix = poke.megaData?.isPrimal ? "Primal " : "Mega ";
  else if (poke.gmaxed) prefix = "G-Max ";
  return `${poke.shiny ? "✨ " : ""}${prefix}${poke.nickname || capitalize(poke.data.name)}`;
}

function hpBar(current, max, width = 20) {
  const pct = Math.max(0, Math.min(1, max > 0 ? current / max : 0));
  const filled = Math.round(pct * width);
  const char = pct > 0.5 ? "🟩" : pct > 0.2 ? "🟨" : "🟥";
  return `${char} \`[${"█".repeat(filled)}${"░".repeat(width - filled)}]\` **${current}**/${max} HP`;
}

function miniBar(current, max, width = 10) {
  const pct = Math.max(0, Math.min(1, max > 0 ? current / max : 0));
  const filled = Math.round(pct * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

/** Compact status/stage badge for embeds, e.g. "🔥 Burn · 😵 Confused · Atk +2". */
function statusTag(poke) {
  const parts = [];
  if (poke.status && STATUS_INFO[poke.status]) {
    parts.push(`${STATUS_INFO[poke.status].icon} ${STATUS_INFO[poke.status].label}`);
  }
  if (poke.confusedTurns > 0) parts.push("😵 Confused");
  for (const k of [...STAT_KEYS, "accuracy", "evasion"]) {
    const s = poke.stages?.[k] || 0;
    if (s !== 0) parts.push(`${STAT_LABELS[k]} ${s > 0 ? "+" : ""}${s}`);
  }
  return parts.join(" · ");
}

/** The move list to show — G-Max moves replace the normal set while active. */
function currentMoves(poke) {
  if (poke.gmaxed && poke.gmaxData?.gmaxMoves) {
    if (!poke._gmaxMoveState || poke._gmaxMoveState.length !== poke.gmaxData.gmaxMoves.length) {
      poke._gmaxMoveState = poke.gmaxData.gmaxMoves.map(m => ({
        ...m,
        category: m.category || (m.power > 0 ? "physical" : "status"),
        pp: m.pp || 5,
        maxPp: m.pp || 5,
        effect: m.effect || (m.isProtect ? { isProtect: true } : undefined)
      }));
    }
    return poke._gmaxMoveState;
  }
  return poke.moves;
}

// ── Transformations ───────────────────────────────────────────────────

function applyMega(poke) {
  const md = poke.megaData;
  if (!md) return null;
  poke.megaEvolved = true;
  poke.canMega = false;
  poke.activeTypes = md.types ? [...md.types] : poke.activeTypes;
  poke.baseBoosts = { ...poke.baseBoosts, ...(md.statBoost || {}) };
  const newMax = calcHP(poke.data.baseStats.hp + (md.statBoost?.hp || 0), poke.iv_hp, poke.level);
  if (newMax > poke.maxHp) {
    poke.currentHp += newMax - poke.maxHp;
    poke.maxHp = newMax;
  }
  return md.isPrimal ? "Primal Reversion" : "Mega Evolution";
}

function applyGmax(poke) {
  if (!poke.gmaxData) return null;
  poke.gmaxed = true;
  poke.canGmax = false;
  poke.gmaxTurns = 3;
  poke.maxHp = Math.floor(poke.baseMaxHp * 1.5);
  poke.currentHp = Math.min(poke.maxHp, Math.floor(poke.currentHp * 1.5));
  return poke.gmaxData.name;
}

/** Counts down an active Gigantamax; returns a log line when it wears off. */
function tickGmax(poke) {
  if (!poke.gmaxed) return null;
  poke.gmaxTurns--;
  if (poke.gmaxTurns > 0) return null;
  poke.gmaxed = false;
  poke.activeTypes = [...poke.data.types];
  poke._gmaxMoveState = null;
  const ratio = poke.maxHp > 0 ? poke.currentHp / poke.maxHp : 1;
  poke.maxHp = poke.baseMaxHp;
  poke.currentHp = Math.max(1, Math.min(poke.maxHp, Math.floor(ratio * poke.baseMaxHp)));
  return `💍 **${battleName(poke)}**'s Gigantamax wore off!`;
}

function applyZPower(poke) {
  if (!poke.canZMove || poke.zUsed) return false;
  poke.zPowered = true;
  poke.zUsed = true;
  poke.canZMove = false;
  return true;
}

// ── Status helpers ────────────────────────────────────────────────────

function statusImmune(poke, status) {
  const types = poke.activeTypes || poke.data.types;
  if (status === "burn" && types.includes("fire")) return true;
  if (status === "freeze" && types.includes("ice")) return true;
  if (status === "paralyze" && types.includes("electric")) return true;
  if ((status === "poison" || status === "toxic") && (types.includes("poison") || types.includes("steel"))) return true;
  return false;
}

function applyStatus(poke, status, log) {
  if (status === "confuse") {
    if (poke.confusedTurns > 0) return false;
    poke.confusedTurns = 2 + Math.floor(Math.random() * 3);
    log.push(`   └─ 😵 **${battleName(poke)}** became confused!`);
    return true;
  }
  if (poke.status) return false;
  if (statusImmune(poke, status)) return false;
  poke.status = status;
  if (status === "sleep") poke.sleepTurns = 1 + Math.floor(Math.random() * 3);
  if (status === "toxic") poke.toxicCounter = 0;
  const info = STATUS_INFO[status];
  log.push(`   └─ ${info.icon} **${battleName(poke)}** ${info.applied}!`);
  return true;
}

function applyBoost(poke, boosts, log) {
  for (const [key, delta] of Object.entries(boosts || {})) {
    if (!(key in poke.stages)) continue;
    const before = poke.stages[key];
    poke.stages[key] = Math.max(-6, Math.min(6, before + delta));
    const changed = poke.stages[key] - before;
    if (changed === 0) {
      log.push(`   └─ **${battleName(poke)}**'s ${STAT_LABELS[key]} can't go ${delta > 0 ? "higher" : "lower"}!`);
      continue;
    }
    const word = Math.abs(changed) >= 2 ? (changed > 0 ? "sharply rose" : "harshly fell") : (changed > 0 ? "rose" : "fell");
    log.push(`   └─ 📊 **${battleName(poke)}**'s ${STAT_LABELS[key]} ${word}!`);
  }
}

function healPoke(poke, amount, log, reason) {
  const healed = Math.min(poke.maxHp - poke.currentHp, Math.max(0, amount));
  if (healed <= 0) {
    log.push(`   └─ **${battleName(poke)}**'s HP is already full!`);
    return 0;
  }
  poke.currentHp += healed;
  log.push(`   └─ 💚 **${battleName(poke)}** restored **${healed}** HP${reason ? ` ${reason}` : ""}!`);
  return healed;
}

// ── Damage ────────────────────────────────────────────────────────────

function critChance(move) {
  return move.effect?.highCrit ? 1 / 8 : 1 / 16;
}

function computeDamage(attacker, defender, move) {
  const category = move.category === "special" ? "special" : "physical";
  const atkKey = category === "special" ? "spatk" : "atk";
  // Psyshock-style moves are special but hit physical Defense.
  const defKey = move.effect?.defensiveStat || (category === "special" ? "spdef" : "def");

  const isCrit = Math.random() < critChance(move);
  // Foul Play swings with the target's Attack instead of the user's.
  const attackSource = move.effect?.useTargetAttack ? defender : attacker;
  const atkStat = effStat(attackSource, atkKey, { critIgnore: isCrit });
  const defStat = effStat(defender, defKey, { critIgnore: isCrit });

  let power = move.power;
  if (move.effect?.doubleIf === "status" && defender.status) power *= 2;
  if (move.effect?.doubleIf === "poisoned" && (defender.status === "poison" || defender.status === "toxic")) power *= 2;

  const moveType = move.type || "normal";
  const effectiveness = getEffectiveness(moveType, defender.activeTypes || defender.data.types);
  if (effectiveness === 0) return { damage: 0, effectiveness: 0, isCrit: false };

  const stab = (attacker.activeTypes || attacker.data.types).includes(moveType) ? 1.5 : 1;
  const base = Math.floor((((2 * attacker.level / 5 + 2) * power * atkStat / defStat) / 50) + 2);

  let damage = base * effectiveness * stab;
  if (isCrit) damage *= 1.5;
  if (attacker.zPowered) damage *= 1.6;
  if (attacker.gmaxed) damage *= 1.3;
  // Hand-held Color Pouch: +20% to Fairy and Water moves.
  if (attacker.heldItem === "hand_held_color_pouch" && (moveType === "fairy" || moveType === "water")) damage *= 1.2;
  damage *= 0.85 + Math.random() * 0.15;

  return { damage: Math.max(1, Math.floor(damage)), effectiveness, isCrit };
}

function effectivenessText(eff) {
  if (eff === 0) return " ❌ It had no effect!";
  if (eff >= 2) return " 💥 Super effective!";
  if (eff > 1) return " 💥 Super effective!";
  if (eff === 0.25) return " 😐 Barely effective...";
  if (eff < 1) return " 😐 Not very effective...";
  return "";
}

// ── Turn flow ─────────────────────────────────────────────────────────

/** Move order: priority bracket first, then Speed, then a coin flip on a tie. */
function firstActorIsA(aPoke, aMove, bPoke, bMove) {
  const aPrio = aMove?.priority || 0;
  const bPrio = bMove?.priority || 0;
  if (aPrio !== bPrio) return aPrio > bPrio;
  const aSpd = getSpeed(aPoke);
  const bSpd = getSpeed(bPoke);
  if (aSpd !== bSpd) return aSpd > bSpd;
  return Math.random() < 0.5;
}

/** Clears the per-turn flags before choices are collected. */
function resetTurnFlags(poke) {
  if (!poke.protecting) poke.protectStreak = 0;
  poke.protecting = false;
  poke.flinched = false;
}

/** Wipes volatile state when a Pokemon leaves the field. */
function onSwitchOut(poke) {
  if (!poke) return;
  poke.stages = { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0, accuracy: 0, evasion: 0 };
  poke.confusedTurns = 0;
  poke.protecting = false;
  poke.protectStreak = 0;
  poke.mustRecharge = false;
  poke.chargedMove = null;
  poke.flinched = false;
}

/**
 * A Pokemon locked into a two-turn move must use it, so the UI skips asking.
 * Returns the forced move, or null.
 */
function forcedMove(poke) {
  return poke?.chargedMove || null;
}

/** True when every slot is out of PP, so Struggle is the only option. */
function isOutOfPP(poke) {
  return currentMoves(poke).every(m => (m.pp ?? 0) <= 0);
}

/**
 * Runs one Pokemon's action. Mutates both combatants and appends to `log`.
 * Returns { acted, damage, defenderFainted, attackerFainted }.
 */
function performMove(attacker, defender, move, log) {
  const name = battleName(attacker);
  const result = { acted: false, damage: 0, defenderFainted: false, attackerFainted: false };

  if (attacker.currentHp <= 0) return result;

  if (!move || move.isSwitchOnly) return result;

  if (move.isPass) {
    log.push(`⏭️ **${name}** passed the turn.`);
    return result;
  }

  // ── Cannot-move checks, in the order the games apply them ──
  if (attacker.mustRecharge) {
    attacker.mustRecharge = false;
    log.push(`😮‍💨 **${name}** must recharge and can't move!`);
    return result;
  }

  if (attacker.flinched) {
    log.push(`😨 **${name}** flinched and couldn't move!`);
    return result;
  }

  if (attacker.status === "freeze") {
    if (Math.random() < 0.2) {
      attacker.status = null;
      log.push(`🧊 **${name}** thawed out!`);
    } else {
      log.push(`🧊 **${name}** is frozen solid!`);
      return result;
    }
  }

  if (attacker.status === "sleep") {
    attacker.sleepTurns--;
    if (attacker.sleepTurns <= 0) {
      attacker.status = null;
      log.push(`😴 **${name}** woke up!`);
    } else {
      log.push(`😴 **${name}** is fast asleep!`);
      return result;
    }
  }

  if (attacker.status === "paralyze" && Math.random() < 0.25) {
    log.push(`⚡ **${name}** is paralyzed and can't move!`);
    return result;
  }

  // ── PP ──
  let actual = move;
  if ((move.pp ?? 1) <= 0) {
    if (isOutOfPP(attacker)) {
      actual = { ...STRUGGLE };
      log.push(`**${name}** has no moves left and used **Struggle**!`);
    } else {
      log.push(`**${name}** has no PP left for **${move.name}**!`);
      return result;
    }
  } else if (move.pp !== undefined) {
    move.pp--;
  }

  // ── Two-turn charge moves ──
  if (actual.effect?.charge) {
    const alreadyCharging = attacker.chargedMove &&
      (attacker.chargedMove === actual || attacker.chargedMove.name === actual.name);
    if (!alreadyCharging) {
      // Hold the move object itself, not its name: a Pokemon that Gigantamaxes
      // mid-charge swaps its whole move list, and a name lookup would come back
      // empty and silently swallow the charged move.
      attacker.chargedMove = actual;
      log.push(`✨ **${name}** is gathering power for **${actual.name}**!`);
      result.acted = true;
      return result;
    }
    attacker.chargedMove = null;
    // PP was already spent on the charge turn; a two-turn move costs 1, not 2.
    if (move.pp !== undefined) move.pp = Math.min(move.maxPp ?? move.pp + 1, move.pp + 1);
  }

  // ── Confusion ──
  if (attacker.confusedTurns > 0) {
    attacker.confusedTurns--;
    if (attacker.confusedTurns <= 0) {
      log.push(`😵 **${name}** snapped out of its confusion!`);
    } else if (Math.random() < 1 / 3) {
      const selfDmg = Math.max(1, Math.floor((((2 * attacker.level / 5 + 2) * 40 * effStat(attacker, "atk") / effStat(attacker, "def")) / 50) + 2));
      attacker.currentHp = Math.max(0, attacker.currentHp - selfDmg);
      log.push(`😵 **${name}** is confused and hurt itself for **${selfDmg}** damage!`);
      result.attackerFainted = attacker.currentHp <= 0;
      result.acted = true;
      return result;
    } else {
      log.push(`😵 **${name}** is confused...`);
    }
  }

  result.acted = true;

  // ── Protect ──
  if (actual.isProtect || actual.effect?.isProtect) {
    const odds = 1 / Math.pow(2, attacker.protectStreak);
    if (Math.random() < odds) {
      attacker.protecting = true;
      attacker.protectStreak++;
      log.push(`🛡️ **${name}** used **${actual.name}** and braced for impact!`);
    } else {
      attacker.protectStreak = 0;
      log.push(`🛡️ **${name}** used **${actual.name}** — but it failed!`);
    }
    return result;
  }

  const isStatusMove = actual.category === "status" || !(actual.power > 0);

  // ── Accuracy ──
  if (!actual.neverMiss && !attacker.zPowered) {
    const stageDiff = (attacker.stages?.accuracy || 0) - (defender.stages?.evasion || 0);
    const chance = (actual.accuracy || 100) * accuracyStageMultiplier(stageDiff);
    if (Math.random() * 100 > chance) {
      log.push(`**${name}** used **${actual.name}** — but it missed!`);
      attacker.zPowered = false;
      return result;
    }
  }

  // ── Status moves ──
  if (isStatusMove) {
    attacker.zPowered = false;
    log.push(`**${name}** used **${actual.name}**!`);
    const eff = actual.effect || {};
    if (eff.heal) healPoke(attacker, Math.floor(attacker.maxHp * eff.heal), log);
    if (eff.boost) {
      const targetPoke = eff.target === "foe" ? defender : attacker;
      if (targetPoke === defender && defender.protecting) {
        log.push(`   └─ 🛡️ **${battleName(defender)}** protected itself!`);
      } else {
        applyBoost(targetPoke, eff.boost, log);
      }
    }
    if (eff.status) {
      if (defender.protecting) {
        log.push(`   └─ 🛡️ **${battleName(defender)}** protected itself!`);
      } else if (!applyStatus(defender, eff.status, log)) {
        log.push(`   └─ But it had no effect on **${battleName(defender)}**!`);
      }
    }
    return result;
  }

  // ── Damaging moves ──
  const wasZPowered = !!attacker.zPowered;
  if (defender.protecting) {
    if (wasZPowered) {
      attacker.zPowered = false;
      const { damage: fullDamage, effectiveness, isCrit } = computeDamage(attacker, defender, actual);
      const chipDamage = Math.max(1, Math.floor(fullDamage * 0.25));
      defender.currentHp = Math.max(0, defender.currentHp - chipDamage);
      result.damage = chipDamage;
      result.defenderFainted = defender.currentHp <= 0;
      log.push(
        `⚡ **${name}** unleashed its **Z-Power** through the shield!` +
        (isCrit ? " 🎯 A critical hit!" : "") +
        effectivenessText(effectiveness) +
        ` 🛡️ Pierced Protect for **${chipDamage}** damage!`
      );
      log.push(`   └─ ${battleName(defender)}: **${defender.currentHp}**/${defender.maxHp} \`${miniBar(defender.currentHp, defender.maxHp)}\``);
      return result;
    }
    log.push(`**${name}** used **${actual.name}** — 🛡️ **${battleName(defender)}** protected itself!`);
    return result;
  }

  const { damage, effectiveness, isCrit } = computeDamage(attacker, defender, actual);
  attacker.zPowered = false;
  if (effectiveness === 0) {
    log.push(`**${name}** used **${actual.name}**!${effectivenessText(0)}`);
    return result;
  }

  defender.currentHp = Math.max(0, defender.currentHp - damage);
  result.damage = damage;
  result.defenderFainted = defender.currentHp <= 0;

  log.push(
    (wasZPowered ? `⚡ **${name}** unleashed its **Z-Power** and used **${actual.name}**!` : `**${name}** used **${actual.name}**!`) +
    (isCrit ? " 🎯 A critical hit!" : "") +
    effectivenessText(effectiveness) +
    ` Dealt **${damage}** damage!`
  );
  log.push(`   └─ ${battleName(defender)}: **${defender.currentHp}**/${defender.maxHp} \`${miniBar(defender.currentHp, defender.maxHp)}\``);

  // ── Secondary effects ──
  const eff = actual.effect || {};
  if (eff.drain) healPoke(attacker, Math.floor(damage * eff.drain), log, "by draining energy");

  if (eff.recoil) {
    const recoil = Math.max(1, Math.floor(damage * eff.recoil));
    attacker.currentHp = Math.max(0, attacker.currentHp - recoil);
    log.push(`   └─ 💢 **${name}** took **${recoil}** recoil damage!`);
    result.attackerFainted = attacker.currentHp <= 0;
  }

  if (eff.status && defender.currentHp > 0 && Math.random() * 100 < (eff.chance ?? 100)) {
    applyStatus(defender, eff.status, log);
  }

  if (eff.boost && Math.random() * 100 < (eff.chance ?? 100)) {
    const targetPoke = eff.target === "foe" ? defender : attacker;
    if (targetPoke.currentHp > 0) applyBoost(targetPoke, eff.boost, log);
  }

  if (eff.flinch && defender.currentHp > 0 && Math.random() * 100 < (eff.chance ?? 100)) {
    defender.flinched = true;
  }

  if (eff.recharge) {
    attacker.mustRecharge = true;
    log.push(`   └─ ⚡ **${name}** must recharge next turn!`);
  }

  return result;
}

/** Burn / poison / toxic chip damage at the end of a turn. */
function endOfTurnResiduals(poke, log) {
  if (!poke || poke.currentHp <= 0) return false;
  let dmg = 0;
  let label = "";

  if (poke.status === "burn") {
    dmg = Math.max(1, Math.floor(poke.maxHp / 16));
    label = "🔥 burn";
  } else if (poke.status === "poison") {
    dmg = Math.max(1, Math.floor(poke.maxHp / 8));
    label = "☠️ poison";
  } else if (poke.status === "toxic") {
    poke.toxicCounter = Math.min(15, poke.toxicCounter + 1);
    dmg = Math.max(1, Math.floor(poke.maxHp * poke.toxicCounter / 16));
    label = "☠️ toxic";
  }

  if (dmg <= 0) return false;
  poke.currentHp = Math.max(0, poke.currentHp - dmg);
  log.push(`${label}: **${battleName(poke)}** lost **${dmg}** HP! (${poke.currentHp}/${poke.maxHp})`);
  return poke.currentHp <= 0;
}

module.exports = {
  STATUS_INFO, STAT_KEYS, STAT_LABELS, STRUGGLE,
  prepareBattlePokemon, effStat, getSpeed, displayStats,
  battleName, hpBar, miniBar, statusTag, currentMoves,
  applyMega, applyGmax, tickGmax, applyZPower,
  applyStatus, applyBoost, healPoke, statusImmune,
  computeDamage, effectivenessText, critChance,
  firstActorIsA, resetTurnFlags, onSwitchOut, forcedMove, isOutOfPP,
  performMove, endOfTurnResiduals
};
