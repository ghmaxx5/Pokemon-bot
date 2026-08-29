const E = require("./battleEngine");
const { getEffectiveness } = require("../data/types");

/**
 * The AI trainer's brain.
 *
 * The old AI was a coin-flip: it scored moves with a rough power x effectiveness
 * proxy, Mega Evolved on a 55% roll, and switched out on a 40% roll whenever it
 * dropped below a quarter HP. It also read the player's exact stats, so it was
 * simultaneously omniscient and bad.
 *
 * This one plays like a person:
 *
 *   1. It does the real damage maths — the same formula the engine resolves with,
 *      minus the dice, so a plan doesn't change because a roll changed.
 *   2. It is NOT omniscient. It sees what a player sees: species, level, the HP
 *      bar, stat changes, status, and moves it has actually watched you use. It
 *      assumes average IVs and a neutral nature until damage tells it otherwise.
 *   3. It counts turns-to-KO in both directions and checks who moves first, so it
 *      knows when it is winning a race and when it is losing one.
 *   4. It scores its bench, pays for the free turn a switch costs, and refuses to
 *      switch something into a hit that would kill it.
 *   5. It times status, setup, Protect and PP instead of firing them at random.
 *   6. It spends its one-shot resources — Mega, Gigantamax, Z-Move — on purpose.
 *   7. It keeps a plan between turns and makes deliberate mistakes below max skill.
 */

// The engine's damage roll spans 0.85–1.00; its mean is what a player intuits.
const AVG_ROLL = 0.925;
// What the AI assumes about stats it cannot see: average IVs, neutral nature.
const ASSUMED_IV = 15;
// A switch hands over a free turn. Expressed as a fraction of max HP.
const SWITCH_COST = 0.22;
// A switch sacrifices one full turn of tempo in race calculations.
const SWITCH_TEMPO = 1.0;
// Below this HP fraction the AI starts looking for an exit.
const DANGER_HP = 0.35;

const PLANS = { RACING: "racing", SETUP: "setting-up", STALLING: "stalling", PIVOTING: "pivoting" };

// ── state ────────────────────────────────────────────────────────────────────

/**
 * Lazily attaches the AI's memory to the battle. Everything it has learned lives
 * here, so it survives across turns without leaking between battles.
 */
function stateFor(battle) {
  if (!battle.ai) {
    battle.ai = {
      // 0..1. 1 = always plays its best read; lower makes honest mistakes.
      skill: battle.aiDifficulty ?? 0.85,
      plan: PLANS.RACING,
      beliefs: new Map(),
      lastSwitchTurn: -99,
      switchCount: 0,
      lastMoveName: null,
      repeatCount: 0
    };
  }
  return battle.ai;
}

function beliefKey(poke) {
  return `${poke?.id ?? "x"}:${poke?.pokemon_id ?? "x"}`;
}

function belief(ai, poke) {
  const key = beliefKey(poke);
  let b = ai.beliefs.get(key);
  if (!b) {
    b = {
      seenMoves: [],       // move objects the AI has actually watched land
      biggestHit: 0,       // worst damage this Pokemon has dealt, as raw HP
      atkBias: 1,          // calibration from observed damage vs prediction
      revealedPhysical: false,
      revealedSpecial: false
    };
    ai.beliefs.set(key, b);
  }
  return b;
}

/**
 * Records a move the AI saw the opponent use. Call this once a turn resolves —
 * knowledge the AI gains must come from here, never from reading the row.
 */
function observeMove(battle, poke, move) {
  if (!battle?.isAI || !poke || !move) return;
  const b = belief(stateFor(battle), poke);
  if (!b.seenMoves.some(m => m.name === move.name)) b.seenMoves.push(move);
  if (move.category === "special") b.revealedSpecial = true;
  else if (move.category === "physical") b.revealedPhysical = true;
}

/**
 * Records damage the AI actually took, and nudges its estimate of the attacker.
 *
 * This is how the AI learns it is facing an unusually strong Pokemon without ever
 * being told the IVs: it predicted 40, it took 55, so it revises upward.
 */
function observeDamage(battle, attacker, defender, move, damage) {
  if (!battle?.isAI || !attacker || !damage) return;
  const ai = stateFor(battle);
  const b = belief(ai, attacker);
  b.biggestHit = Math.max(b.biggestHit, damage);

  const predicted = expectedDamage(proxyOf(attacker, b), defender, move);
  if (predicted > 0) {
    const ratio = damage / predicted;
    // Move a fifth of the way toward what was observed, and keep it sane.
    b.atkBias = Math.max(0.6, Math.min(1.7, b.atkBias + (ratio - b.atkBias) * 0.2));
  }
}

/**
 * The one hook `battle.js` needs: fold a resolved action into the AI's beliefs.
 *
 * Only the player's side teaches it anything — it already knows its own team. A
 * switch teaches it nothing, so it is skipped.
 */
function observe(battle, attacker, defender, move, result) {
  if (!battle?.isAI || !attacker || !move) return;
  if (move.isSwitchOnly) return;
  if ((battle.p2Team || []).includes(attacker)) return;

  observeMove(battle, attacker, move);
  if (result?.damage > 0) observeDamage(battle, attacker, defender, move, result.damage);
}

// ── the belief model ─────────────────────────────────────────────────────────

/**
 * The opponent as the AI believes it to be.
 *
 * Everything visible in a real battle is kept exactly: species, level, types, HP,
 * stat stages, status, form. Everything hidden is replaced by an average, then
 * scaled by whatever the AI has calibrated from observed damage.
 */
function proxyOf(poke, b) {
  return {
    ...poke,
    iv_hp: ASSUMED_IV, iv_atk: ASSUMED_IV, iv_def: ASSUMED_IV,
    iv_spatk: ASSUMED_IV, iv_spdef: ASSUMED_IV, iv_spd: ASSUMED_IV,
    nature: null,
    _atkBias: b?.atkBias ?? 1
  };
}

function believed(ai, poke) {
  return proxyOf(poke, belief(ai, poke));
}

// ── damage maths ─────────────────────────────────────────────────────────────

/**
 * Mirrors `E.computeDamage` with the dice removed: the average roll, and the crit
 * chance folded in as expectation rather than rolled.
 *
 * Deterministic on purpose. An AI that re-rolled its own estimate every turn
 * would flip-flop between plans for no reason the player could read.
 */
function expectedDamage(attacker, defender, move) {
  if (!move || !(move.power > 0)) return 0;

  const category = move.category === "special" ? "special" : "physical";
  const atkKey = category === "special" ? "spatk" : "atk";
  const defKey = move.effect?.defensiveStat || (category === "special" ? "spdef" : "def");

  const moveType = move.type || "normal";
  const effectiveness = getEffectiveness(moveType, defender.activeTypes || defender.data.types);
  if (effectiveness === 0) return 0;

  const attackSource = move.effect?.useTargetAttack ? defender : attacker;
  const atkStat = E.effStat(attackSource, atkKey) * (attackSource._atkBias || 1);
  const defStat = E.effStat(defender, defKey);

  let power = move.power;
  if (move.effect?.doubleIf === "status" && defender.status) power *= 2;
  if (move.effect?.doubleIf === "poisoned" && (defender.status === "poison" || defender.status === "toxic")) power *= 2;

  const stab = (attacker.activeTypes || attacker.data.types).includes(moveType) ? 1.5 : 1;
  const base = Math.floor((((2 * attacker.level / 5 + 2) * power * atkStat / Math.max(1, defStat)) / 50) + 2);

  let damage = base * effectiveness * stab;

  // Crits as expectation, not as a roll.
  const crit = E.critChance(move);
  damage *= 1 + crit * 0.5;

  if (attacker.gmaxed) damage *= 1.3;
  if (attacker.heldItem === "hand_held_color_pouch" && (moveType === "fairy" || moveType === "water")) damage *= 1.2;
  damage *= AVG_ROLL;

  const hits = move.effect?.hits || 1;
  return Math.max(1, Math.floor(damage * hits));
}

/** Damage weighted by accuracy — what the move is actually worth per turn. */
function damagePerTurn(attacker, defender, move) {
  const acc = move.neverMiss ? 1 : (move.accuracy ?? 100) / 100;
  return expectedDamage(attacker, defender, move) * acc;
}

/** Turns to KO, accuracy included. Infinity when the move cannot get there. */
function turnsToKO(attacker, defender, move) {
  const dpt = damagePerTurn(attacker, defender, move);
  if (dpt <= 0) return Infinity;
  return Math.ceil(defender.currentHp / dpt);
}

// ── reading the opponent ─────────────────────────────────────────────────────

/**
 * The threat the AI *believes* it is facing.
 *
 * If it has watched the opponent attack, it uses those moves. If it hasn't, it
 * assumes one generic 80-power STAB hit off the opponent's better attacking stat
 * — the same guess a player makes on turn one.
 */
function threatFrom(ai, foe, self) {
  const b = belief(ai, foe);
  const proxy = proxyOf(foe, b);
  const candidates = [];

  for (const move of b.seenMoves) {
    if (move.power > 0) candidates.push(move);
  }

  if (!candidates.length) {
    const physical = E.effStat(proxy, "atk") >= E.effStat(proxy, "spatk");
    for (const type of proxy.activeTypes || proxy.data.types) {
      candidates.push({
        name: `assumed ${type}`, type, power: 80, accuracy: 100,
        category: physical ? "physical" : "special"
      });
    }
  }

  let worst = { move: null, damage: 0 };
  for (const move of candidates) {
    const damage = damagePerTurn(proxy, self, move);
    if (damage > worst.damage) worst = { move, damage };
  }

  // Never underestimate below what has already been felt.
  worst.damage = Math.max(worst.damage, b.biggestHit * 0.9);
  worst.turnsToKO = worst.damage > 0 ? Math.ceil(self.currentHp / worst.damage) : Infinity;
  return worst;
}

/** True when `self` gets the first action against `foe` with these moves. */
function movesFirst(self, selfMove, foe, foeMove) {
  const selfPrio = selfMove?.priority || 0;
  const foePrio = foeMove?.priority || 0;
  if (selfPrio !== foePrio) return selfPrio > foePrio;
  return E.getSpeed(self) >= E.getSpeed(foe);
}

// ── scoring one move ─────────────────────────────────────────────────────────

/**
 * What inflicting a status on the foe is worth, in HP units. 0 means "no effect",
 * which the caller turns into a negative score.
 */
function statusWorth(ai, self, foe, status, ctx) {
  if (foe.status) return 0;
  if (status === "confuse") return foe.confusedTurns > 0 ? 0 : foe.maxHp * 0.28;
  if (E.statusImmune(foe, status)) return 0;

  // A burn on something that attacks physically is worth far more than on a
  // special attacker, whose Attack the burn never touches.
  const foeProxy = believed(ai, foe);
  const physical = E.effStat(foeProxy, "atk") >= E.effStat(foeProxy, "spatk");

  switch (status) {
    case "burn":     return physical ? foe.maxHp * 0.42 : foe.maxHp * 0.12;
    case "paralyze": return ctx.outspeeds ? foe.maxHp * 0.2 : foe.maxHp * 0.42;
    case "sleep":
    case "freeze":   return foe.maxHp * 0.5;
    case "toxic":    return ctx.threat.turnsToKO >= 3 ? foe.maxHp * 0.4 : foe.maxHp * 0.18;
    case "poison":   return foe.maxHp * 0.26;
    default:         return foe.maxHp * 0.25;
  }
}

/**
 * What a stat change is worth. `effect.target === "foe"` is a debuff on the
 * opponent — the engine routes it that way — everything else buffs the user.
 */
function boostWorth(self, foe, effect, ctx) {
  const debuff = effect.target === "foe";
  const subject = debuff ? foe : self;

  // Stages that would actually move. The ladder clamps at ±6, and past ±4 the
  // returns are small enough that spending a turn on them is a mistake.
  let stages = 0;
  for (const [key, delta] of Object.entries(effect.boost)) {
    const at = subject.stages?.[key] || 0;
    if (delta > 0 && at >= 4) continue;
    if (delta < 0 && at <= -4) continue;
    stages += Math.abs(delta);
  }
  if (stages <= 0) return 0;

  if (debuff) {
    // Dropping the foe's stats still pays while the AI is behind, so it is only
    // gated on being about to die.
    if (ctx.threat.turnsToKO <= 1) return 0;
    return foe.maxHp * 0.11 * stages;
  }

  // Setup only pays if it survives long enough to cash in.
  if (ctx.threat.turnsToKO <= 2) return 0;
  if (self.currentHp / self.maxHp < 0.55) return 0;
  return foe.maxHp * 0.14 * stages;
}

/**
 * What a move is worth this turn, in HP-ish units so damage and utility compare.
 */
function scoreMove(ai, self, foe, move, ctx) {
  if (!move) return -Infinity;

  const effect = move.effect || {};
  const foeMaxHp = Math.max(1, foe.maxHp);

  // ── Protect ──
  if (move.isProtect || effect.isProtect) {
    // The engine makes a second consecutive Protect unreliable, and stalling only
    // pays when something is ticking on the other side.
    if (self.protectStreak > 0) return -20;
    const foeRotting = foe.status === "burn" || foe.status === "poison" || foe.status === "toxic";
    if (ctx.threat.damage >= self.currentHp) return foeMaxHp * 0.35; // it survives the turn
    if (foeRotting && ai.plan === PLANS.STALLING) return foeMaxHp * 0.22;
    if (self.gmaxed && self.gmaxTurns <= 1) return -10; // don't waste the last Gmax turn
    return foeMaxHp * 0.05;
  }

  // ── status / support ──
  if (move.category === "status" || !(move.power > 0)) {
    if (effect.heal) {
      const missing = 1 - self.currentHp / self.maxHp;
      // Healing into a hit that out-damages the heal is a wasted turn.
      if (ctx.threat.damage >= self.maxHp * (effect.heal + 0.1)) return -5;
      return missing > 0.45 ? self.maxHp * effect.heal * 1.1 : -5;
    }

    // `effect.status` on a status move always lands on the opponent — the engine
    // only routes `effect.boost` by `effect.target`.
    if (effect.status) {
      let worth = statusWorth(ai, self, foe, effect.status, ctx);
      if (worth <= 0) return -10;
      worth *= (effect.chance ?? 100) / 100;
      // Pointless if the foe is dying to the AI's attack this turn anyway.
      if (ctx.bestKO) worth *= 0.15;
      // Pointless if the AI is about to die.
      if (ctx.threat.turnsToKO <= 1) worth *= 0.25;
      return worth;
    }

    if (effect.boost) {
      const worth = boostWorth(self, foe, effect, ctx);
      if (worth <= 0) return -8;
      return worth * ((effect.chance ?? 100) / 100);
    }

    return 1;
  }

  // ── attacking ──
  const damage = damagePerTurn(self, foe, move);
  if (damage <= 0) return -5;

  let score = Math.min(damage, foe.currentHp);

  // A guaranteed KO this turn beats everything else on the board.
  const kills = expectedDamage(self, foe, move) >= foe.currentHp;
  if (kills) {
    const acc = move.neverMiss ? 1 : (move.accuracy ?? 100) / 100;
    score += foeMaxHp * 0.6 * acc;
    // Prefer the reliable KO over the flashy one, and save PP on the big move.
    score -= (1 - acc) * foeMaxHp * 0.5;
    score += (move.pp ?? 0) > 6 ? 2 : 0;
  }

  // Charge moves give up a turn; only worth it if the AI can afford one.
  if (effect.charge && ctx.threat.turnsToKO <= 2) score *= 0.35;
  // Recoil is real damage to itself.
  if (effect.recoil) score -= damage * effect.recoil * 1.2;
  // Draining moves pay part of it back, but only up to what is missing.
  if (effect.drain) score += Math.min(damage * effect.drain, self.maxHp - self.currentHp) * 0.8;
  // Recharge turns are a full free turn for the opponent.
  if (effect.recharge && !kills) score *= 0.6;
  // Don't burn the last PP of a coverage move on something it doesn't need.
  if ((move.pp ?? 0) <= 1 && !kills) score *= 0.8;

  // Secondary effects. The engine rolls these against `effect.chance`, so they
  // are worth their chance and no more — and nothing when the target is dying.
  if (!kills) {
    const chance = (effect.chance ?? 100) / 100;
    if (effect.status) score += statusWorth(ai, self, foe, effect.status, ctx) * chance * 0.6;
    if (effect.boost) score += boostWorth(self, foe, effect, ctx) * chance * 0.6;
    // Flinch is worth most when the AI already moves first.
    if (effect.flinch && ctx.outspeeds) score += foe.maxHp * 0.12 * chance;
  }

  return score;
}

// ── switching ────────────────────────────────────────────────────────────────

/**
 * The race margin of a matchup, in turns. Positive means this Pokemon wins:
 * it survives more turns than it needs to knock the foe out.
 *
 * Turns are the right unit here. Comparing raw damage numbers across two
 * different Pokemon with different HP pools says nothing about who wins.
 */
function matchupMargin(ai, self, foe) {
  const out = bestAttack(ai, self, foe);
  const inc = threatFrom(ai, foe, self);

  const toKill = out.damage > 0 ? Math.ceil(foe.currentHp / out.damage) : 99;
  const toDie = inc.damage > 0 ? Math.ceil(self.currentHp / inc.damage) : 99;

  let margin = Math.max(-6, Math.min(6, toDie - toKill));
  // On a tie, moving first wins the race outright.
  if (toDie === toKill && movesFirst(self, out.move, foe, inc.move)) margin += 0.5;
  return margin;
}

/**
 * How much better than staying in a benched Pokemon would be, in turns.
 *
 * The free turn a switch gives away is modelled the way it actually happens: the
 * incoming Pokemon arrives having already eaten one hit. That makes "never switch
 * into a predicted KO" fall out of the maths instead of needing a special case.
 */
function scoreSwitch(ai, battle, candidate, foe, ctx) {
  const inc = threatFrom(ai, foe, candidate);

  // It would be knocked out on the way in. Never.
  if (inc.damage >= candidate.currentHp) return -Infinity;

  const arriving = { ...candidate, currentHp: candidate.currentHp - inc.damage };
  if (!bestAttack(ai, arriving, foe).move) return -Infinity; // nothing to hit with

  // Losing a turn of tempo, plus a mild preference for pivoting on health.
  return matchupMargin(ai, arriving, foe)
    - SWITCH_TEMPO
    + (candidate.currentHp / candidate.maxHp) * 0.5;
}

/** The AI's best attacking option against a target, by expected damage per turn. */
function bestAttack(ai, self, foe) {
  const usable = E.currentMoves(self).filter(m => (m.pp ?? 0) > 0 && m.power > 0);
  let best = { move: null, damage: 0 };
  for (const move of usable) {
    const damage = damagePerTurn(self, foe, move);
    if (damage > best.damage) best = { move, damage };
  }
  return best;
}

// ── one-shot resources ───────────────────────────────────────────────────────

/**
 * Whether to spend Mega / Gigantamax / a Z-Move this turn.
 *
 * These are once-per-battle in this bot, so the AI treats them as a person would:
 * a Mega is worth most on something that is going to stay on the field, a
 * Gigantamax wants either its full three turns or to be the thing that survives,
 * and a Z-Move exists to turn a near-KO into a KO.
 */
function chooseTransform(ai, self, foe, ctx) {
  const hpFrac = self.currentHp / self.maxHp;
  const dying = ctx.threat.turnsToKO <= 1;

  // Z-Move: the finisher. Only when the normal best move does not already kill.
  if (self.canZMove && !self.zUsed && !ctx.bestKO) {
    const boosted = ctx.best.damage * 1.6; // matches the engine's Z multiplier
    if (boosted >= foe.currentHp) return "z";
    // Or as a last swing if it is about to be knocked out anyway.
    if (dying && boosted >= foe.currentHp * 0.7) return "z";
  }

  if (self.canGmax && !self.gmaxed && !self.megaEvolved) {
    // Gigantamax raises max HP, so it is also an escape from a lethal hit.
    if (dying && hpFrac > 0.12) return "gmax";
    // Otherwise wait for a Pokemon healthy enough to bank all three turns.
    if (hpFrac > 0.6 && ctx.threat.turnsToKO >= 3) return "gmax";
  }

  if (self.canMega && !self.megaEvolved && !self.gmaxed) {
    // A Mega is permanent for the battle, so spend it early on something staying in.
    if (hpFrac > 0.45 && ctx.threat.turnsToKO >= 2) return "mega";
    if (dying && hpFrac > 0.25) return "mega"; // stat jump may outrun the KO
  }

  return null;
}

// ── the decision ─────────────────────────────────────────────────────────────

/**
 * Decides whether the AI switches, and whether it spends a one-shot resource.
 *
 * Deliberately does **not** pick the move — call `chooseMove` after applying the
 * transform, so the move is scored off the body it will actually be used by.
 *
 * @param {object} battle the live battle
 * @param {object} self   the AI's active Pokemon (read fresh — it changes mid-turn)
 * @param {object} foe    the opponent's active Pokemon
 * @returns {{action: "switch"|"move", switchTo: object|null,
 *            transform: "mega"|"gmax"|"z"|null, plan: string, reason: string}}
 */
function decide(battle, self, foe) {
  const ai = stateFor(battle);
  const turn = battle.turnNumber || 1;

  const foeBelief = believed(ai, foe);
  const threat = threatFrom(ai, foe, self);
  const best = bestAttack(ai, self, foeBelief);
  const bestKO = best.move ? expectedDamage(self, foeBelief, best.move) >= foeBelief.currentHp : false;
  const outspeeds = movesFirst(self, best.move, foeBelief, threat.move);

  const ctx = { threat, best, bestKO, outspeeds };

  // ── plan ──
  // Carried between turns so the AI reads as having an intention, rather than
  // re-deciding its personality every time it is asked.
  if (bestKO && (outspeeds || threat.turnsToKO > 1)) ai.plan = PLANS.RACING;
  else if (threat.turnsToKO <= 1 && self.currentHp / self.maxHp < DANGER_HP) ai.plan = PLANS.PIVOTING;
  else if (threat.turnsToKO >= 4 && !bestKO) ai.plan = PLANS.SETUP;
  else if (foe.status && threat.turnsToKO >= 3) ai.plan = PLANS.STALLING;
  else ai.plan = PLANS.RACING;

  // ── switching ──
  const bench = (battle.p2Team || []).filter(p => p.currentHp > 0 && p !== self);
  let switchTo = null;

  // Anti-ping-pong: no switching two turns running, and never when it can just win.
  const switchAllowed = bench.length > 0
    && turn - ai.lastSwitchTurn >= 2
    && !bestKO;

  if (switchAllowed) {
    const stayScore = best.damage - threat.damage;
    let bestSwitch = { poke: null, score: -Infinity };
    for (const candidate of bench) {
      const score = scoreSwitch(ai, battle, candidate, foeBelief, ctx);
      if (score > bestSwitch.score) bestSwitch = { poke: candidate, score };
    }
    // Only pivot on a clear improvement — a marginal one is worse than the free turn.
    if (bestSwitch.poke && bestSwitch.score > stayScore + self.maxHp * 0.1) {
      switchTo = bestSwitch.poke;
    }
  }

  // Human error: at less than full skill the AI sometimes stays in when it should
  // pivot, which is the most common mistake a real player makes.
  if (switchTo && Math.random() > ai.skill) switchTo = null;

  if (switchTo) {
    ai.lastSwitchTurn = turn;
    ai.switchCount++;
    ai.plan = PLANS.PIVOTING;
    return { action: "switch", switchTo, transform: null, plan: ai.plan, reason: "better matchup on the bench" };
  }

  return {
    action: "move",
    switchTo: null,
    transform: chooseTransform(ai, self, foeBelief, ctx),
    plan: ai.plan,
    reason: bestKO ? "going for the knockout" : ai.plan
  };
}

/**
 * Picks the move, and nothing else.
 *
 * Split out from `decide` on purpose: this must be called **after** a transform is
 * applied. Gigantamax replaces the entire move list, and a Mega changes types and
 * stats — a move chosen before either would be scored off the wrong body, and a
 * pre-Gmax move object isn't even in the list whose PP the engine decrements.
 */
function chooseMove(battle, self, foe) {
  const ai = stateFor(battle);
  const foeBelief = believed(ai, foe);
  const threat = threatFrom(ai, foe, self);
  const best = bestAttack(ai, self, foeBelief);
  const bestKO = best.move ? expectedDamage(self, foeBelief, best.move) >= foeBelief.currentHp : false;
  const ctx = { threat, best, bestKO, outspeeds: movesFirst(self, best.move, foeBelief, threat.move) };

  const usable = E.currentMoves(self).filter(m => (m.pp ?? 0) > 0);
  if (!usable.length) return { ...E.STRUGGLE };

  const ranked = usable
    .map(move => ({ move, score: scoreMove(ai, self, foeBelief, move, ctx) }))
    .sort((a, b) => b.score - a.score);

  let choice = ranked[0];

  // Human error, part two: pick the second-best instead of the best. Never when
  // the best move is a kill — nobody misses a free knockout.
  if (ranked.length > 1 && !bestKO && Math.random() > ai.skill) {
    choice = ranked[1];
  }

  // Anti-loop: a move spammed three turns running gets passed over once, so the
  // AI can't lock itself into a move the opponent has answered.
  if (choice.move.name === ai.lastMoveName) {
    ai.repeatCount++;
    if (ai.repeatCount >= 3 && ranked.length > 1 && !bestKO) {
      choice = ranked[1];
      ai.repeatCount = 0;
    }
  } else {
    ai.repeatCount = 0;
  }
  ai.lastMoveName = choice.move.name;

  return choice.move;
}

module.exports = {
  decide, chooseMove, observe, stateFor, observeMove, observeDamage,
  expectedDamage, damagePerTurn, turnsToKO, threatFrom, bestAttack,
  scoreMove, scoreSwitch, statusWorth, boostWorth, chooseTransform,
  believed, movesFirst,
  PLANS, AVG_ROLL, ASSUMED_IV
};
