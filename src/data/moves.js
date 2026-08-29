// ── Move table ────────────────────────────────────────────────────────
// Buckets are keyed by type, and every move carries its own `type` so it
// keeps that type no matter which Pokemon learns it. (Moves used to be
// re-typed to the holder's primary type, which made Fire Punch a Water move
// on a Blastoise.)
//
// Fields:
//   power      0 for status moves
//   accuracy   percent; `neverMiss: true` bypasses the check entirely
//   category   "physical" | "special" | "status"
//   pp         base PP; battles use max PP
//   priority   move order bracket, default 0
//   effect     optional secondary effect, see EFFECT SHAPES below
//
// EFFECT SHAPES
//   { status: "burn"|"poison"|"toxic"|"paralyze"|"freeze"|"sleep"|"confuse", chance }
//   { boost: { atk: 1, ... }, target: "self"|"foe", chance }
//   { heal: 0.5 }                     fraction of max HP restored
//   { drain: 0.5 }                    fraction of damage dealt healed back
//   { recoil: 0.25 }                  fraction of damage dealt taken back
//   { doubleIf: "status"|"poisoned" }  power doubles under that condition
//   { highCrit: true }                +1 crit stage
//   { recharge: true }                caller must skip the next turn
//   { charge: true }                  charges one turn, hits the next
//   { isProtect: true }               blocks the incoming move this turn
//   { defensiveStat: "def" }          special move that hits physical Defense
//   { useTargetAttack: true }         uses the target's Attack stat

const MOVES = {
  normal: [
    { name: "Tackle",       type: "normal", power: 40,  accuracy: 100, category: "physical", pp: 35 },
    { name: "Quick Attack", type: "normal", power: 40,  accuracy: 100, category: "physical", pp: 30, priority: 1 },
    { name: "Swift",        type: "normal", power: 60,  accuracy: 100, category: "special",  pp: 20, neverMiss: true },
    { name: "Slam",         type: "normal", power: 80,  accuracy: 75,  category: "physical", pp: 20 },
    { name: "Body Slam",    type: "normal", power: 85,  accuracy: 100, category: "physical", pp: 15, effect: { status: "paralyze", chance: 30 } },
    { name: "Take Down",    type: "normal", power: 90,  accuracy: 85,  category: "physical", pp: 20, effect: { recoil: 0.25 } },
    { name: "Hyper Beam",   type: "normal", power: 150, accuracy: 90,  category: "special",  pp: 5,  effect: { recharge: true } },
    { name: "Giga Impact",  type: "normal", power: 150, accuracy: 90,  category: "physical", pp: 5,  effect: { recharge: true } },
    { name: "Swords Dance", type: "normal", power: 0,   accuracy: 100, category: "status",   pp: 20, effect: { boost: { atk: 2 }, target: "self" } },
    { name: "Agility",      type: "normal", power: 0,   accuracy: 100, category: "status",   pp: 30, effect: { boost: { spd: 2 }, target: "self" } },
    { name: "Recover",      type: "normal", power: 0,   accuracy: 100, category: "status",   pp: 10, effect: { heal: 0.5 } }
  ],
  fire: [
    { name: "Ember",        type: "fire", power: 40,  accuracy: 100, category: "special",  pp: 25, effect: { status: "burn", chance: 10 } },
    { name: "Flame Charge", type: "fire", power: 50,  accuracy: 100, category: "physical", pp: 20, effect: { boost: { spd: 1 }, target: "self", chance: 100 } },
    { name: "Fire Punch",   type: "fire", power: 75,  accuracy: 100, category: "physical", pp: 15, effect: { status: "burn", chance: 10 } },
    { name: "Flamethrower", type: "fire", power: 90,  accuracy: 100, category: "special",  pp: 15, effect: { status: "burn", chance: 10 } },
    { name: "Heat Wave",    type: "fire", power: 95,  accuracy: 90,  category: "special",  pp: 10, effect: { status: "burn", chance: 10 } },
    { name: "Fire Blast",   type: "fire", power: 110, accuracy: 85,  category: "special",  pp: 5,  effect: { status: "burn", chance: 10 } },
    { name: "Overheat",     type: "fire", power: 130, accuracy: 90,  category: "special",  pp: 5,  effect: { boost: { spatk: -2 }, target: "self", chance: 100 } },
    { name: "Will-O-Wisp",  type: "fire", power: 0,   accuracy: 85,  category: "status",   pp: 15, effect: { status: "burn", chance: 100 } }
  ],
  water: [
    { name: "Water Gun",  type: "water", power: 40,  accuracy: 100, category: "special",  pp: 25 },
    { name: "Waterfall",  type: "water", power: 80,  accuracy: 100, category: "physical", pp: 15 },
    { name: "Scald",      type: "water", power: 80,  accuracy: 100, category: "special",  pp: 15, effect: { status: "burn", chance: 30 } },
    { name: "Surf",       type: "water", power: 90,  accuracy: 100, category: "special",  pp: 15 },
    { name: "Aqua Tail",  type: "water", power: 90,  accuracy: 90,  category: "physical", pp: 10 },
    { name: "Hydro Pump", type: "water", power: 110, accuracy: 80,  category: "special",  pp: 5 },
    { name: "Aqua Ring",  type: "water", power: 0,   accuracy: 100, category: "status",   pp: 20, effect: { heal: 0.5 } }
  ],
  grass: [
    { name: "Vine Whip",   type: "grass", power: 45,  accuracy: 100, category: "physical", pp: 25 },
    { name: "Razor Leaf",  type: "grass", power: 55,  accuracy: 95,  category: "physical", pp: 25, effect: { highCrit: true } },
    { name: "Giga Drain",  type: "grass", power: 75,  accuracy: 100, category: "special",  pp: 10, effect: { drain: 0.5 } },
    { name: "Leaf Blade",  type: "grass", power: 90,  accuracy: 100, category: "physical", pp: 15, effect: { highCrit: true } },
    { name: "Energy Ball", type: "grass", power: 90,  accuracy: 100, category: "special",  pp: 10, effect: { boost: { spdef: -1 }, target: "foe", chance: 10 } },
    { name: "Solar Beam",  type: "grass", power: 120, accuracy: 100, category: "special",  pp: 10, effect: { charge: true } },
    { name: "Synthesis",   type: "grass", power: 0,   accuracy: 100, category: "status",   pp: 5,  effect: { heal: 0.5 } }
  ],
  electric: [
    { name: "Thunder Shock", type: "electric", power: 40,  accuracy: 100, category: "special",  pp: 30, effect: { status: "paralyze", chance: 10 } },
    { name: "Discharge",     type: "electric", power: 80,  accuracy: 100, category: "special",  pp: 15, effect: { status: "paralyze", chance: 30 } },
    { name: "Thunderbolt",   type: "electric", power: 90,  accuracy: 100, category: "special",  pp: 15, effect: { status: "paralyze", chance: 10 } },
    { name: "Wild Charge",   type: "electric", power: 90,  accuracy: 100, category: "physical", pp: 15, effect: { recoil: 0.25 } },
    { name: "Thunder",       type: "electric", power: 110, accuracy: 70,  category: "special",  pp: 10, effect: { status: "paralyze", chance: 30 } },
    { name: "Volt Tackle",   type: "electric", power: 120, accuracy: 100, category: "physical", pp: 15, effect: { recoil: 0.33 } },
    { name: "Thunder Wave",  type: "electric", power: 0,   accuracy: 90,  category: "status",   pp: 20, effect: { status: "paralyze", chance: 100 } }
  ],
  ice: [
    { name: "Ice Shard", type: "ice", power: 40,  accuracy: 100, category: "physical", pp: 30, priority: 1 },
    { name: "Icy Wind",  type: "ice", power: 55,  accuracy: 95,  category: "special",  pp: 15, effect: { boost: { spd: -1 }, target: "foe", chance: 100 } },
    { name: "Avalanche", type: "ice", power: 60,  accuracy: 100, category: "physical", pp: 10, priority: -4 },
    { name: "Ice Punch", type: "ice", power: 75,  accuracy: 100, category: "physical", pp: 15, effect: { status: "freeze", chance: 10 } },
    { name: "Ice Beam",  type: "ice", power: 90,  accuracy: 100, category: "special",  pp: 10, effect: { status: "freeze", chance: 10 } },
    { name: "Blizzard",  type: "ice", power: 110, accuracy: 70,  category: "special",  pp: 5,  effect: { status: "freeze", chance: 10 } }
  ],
  fighting: [
    { name: "Karate Chop",   type: "fighting", power: 50,  accuracy: 100, category: "physical", pp: 25, effect: { highCrit: true } },
    { name: "Brick Break",   type: "fighting", power: 75,  accuracy: 100, category: "physical", pp: 15 },
    { name: "Aura Sphere",   type: "fighting", power: 80,  accuracy: 100, category: "special",  pp: 20, neverMiss: true },
    { name: "Dynamic Punch", type: "fighting", power: 100, accuracy: 50,  category: "physical", pp: 5,  effect: { status: "confuse", chance: 100 } },
    { name: "Close Combat",  type: "fighting", power: 120, accuracy: 100, category: "physical", pp: 5,  effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 } },
    { name: "Focus Blast",   type: "fighting", power: 120, accuracy: 70,  category: "special",  pp: 5,  effect: { boost: { spdef: -1 }, target: "foe", chance: 10 } },
    { name: "Bulk Up",       type: "fighting", power: 0,   accuracy: 100, category: "status",   pp: 20, effect: { boost: { atk: 1, def: 1 }, target: "self" } }
  ],
  poison: [
    { name: "Poison Sting", type: "poison", power: 15,  accuracy: 100, category: "physical", pp: 35, effect: { status: "poison", chance: 30 } },
    { name: "Venoshock",    type: "poison", power: 65,  accuracy: 100, category: "special",  pp: 10, effect: { doubleIf: "poisoned" } },
    { name: "Poison Jab",   type: "poison", power: 80,  accuracy: 100, category: "physical", pp: 20, effect: { status: "poison", chance: 30 } },
    { name: "Sludge Bomb",  type: "poison", power: 90,  accuracy: 100, category: "special",  pp: 10, effect: { status: "poison", chance: 30 } },
    { name: "Gunk Shot",    type: "poison", power: 120, accuracy: 80,  category: "physical", pp: 5,  effect: { status: "poison", chance: 30 } },
    { name: "Toxic",        type: "poison", power: 0,   accuracy: 90,  category: "status",   pp: 10, effect: { status: "toxic", chance: 100 } }
  ],
  ground: [
    { name: "Mud Slap",    type: "ground", power: 20,  accuracy: 100, category: "special",  pp: 10, effect: { boost: { accuracy: -1 }, target: "foe", chance: 100 } },
    { name: "Bulldoze",    type: "ground", power: 60,  accuracy: 100, category: "physical", pp: 20, effect: { boost: { spd: -1 }, target: "foe", chance: 100 } },
    { name: "Drill Run",   type: "ground", power: 80,  accuracy: 95,  category: "physical", pp: 10, effect: { highCrit: true } },
    { name: "Earth Power", type: "ground", power: 90,  accuracy: 100, category: "special",  pp: 10, effect: { boost: { spdef: -1 }, target: "foe", chance: 10 } },
    { name: "Earthquake",  type: "ground", power: 100, accuracy: 100, category: "physical", pp: 10 }
  ],
  flying: [
    { name: "Gust",           type: "flying", power: 40,  accuracy: 100, category: "special",  pp: 35 },
    { name: "Aerial Ace",     type: "flying", power: 60,  accuracy: 100, category: "physical", pp: 20, neverMiss: true },
    { name: "Air Slash",      type: "flying", power: 75,  accuracy: 95,  category: "special",  pp: 15 },
    { name: "Hurricane",      type: "flying", power: 110, accuracy: 70,  category: "special",  pp: 10, effect: { status: "confuse", chance: 30 } },
    { name: "Brave Bird",     type: "flying", power: 120, accuracy: 100, category: "physical", pp: 15, effect: { recoil: 0.33 } },
    { name: "Dragon Ascent",  type: "flying", power: 120, accuracy: 100, category: "physical", pp: 5,  effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 } },
    { name: "Roost",          type: "flying", power: 0,   accuracy: 100, category: "status",   pp: 10, effect: { heal: 0.5 } }
  ],
  psychic: [
    { name: "Confusion",        type: "psychic", power: 50,  accuracy: 100, category: "special",  pp: 25, effect: { status: "confuse", chance: 10 } },
    { name: "Psyshock",         type: "psychic", power: 80,  accuracy: 100, category: "special",  pp: 10, effect: { defensiveStat: "def" } },
    { name: "Zen Headbutt",     type: "psychic", power: 80,  accuracy: 90,  category: "physical", pp: 15 },
    { name: "Psychic",          type: "psychic", power: 90,  accuracy: 100, category: "special",  pp: 10, effect: { boost: { spdef: -1 }, target: "foe", chance: 10 } },
    { name: "Chromatic Burst",  type: "psychic", power: 95,  accuracy: 100, category: "special",  pp: 10, isSignature: true },
    { name: "Future Sight",     type: "psychic", power: 120, accuracy: 100, category: "special",  pp: 10 },
    { name: "Calm Mind",        type: "psychic", power: 0,   accuracy: 100, category: "status",   pp: 20, effect: { boost: { spatk: 1, spdef: 1 }, target: "self" } },
    { name: "Amnesia",          type: "psychic", power: 0,   accuracy: 100, category: "status",   pp: 20, effect: { boost: { spdef: 2 }, target: "self" } }
  ],
  bug: [
    { name: "Signal Beam",  type: "bug", power: 75,  accuracy: 100, category: "special",  pp: 15, effect: { status: "confuse", chance: 10 } },
    { name: "Bug Bite",     type: "bug", power: 60,  accuracy: 100, category: "physical", pp: 20 },
    { name: "X-Scissor",    type: "bug", power: 80,  accuracy: 100, category: "physical", pp: 15 },
    { name: "Bug Buzz",     type: "bug", power: 90,  accuracy: 100, category: "special",  pp: 10, effect: { boost: { spdef: -1 }, target: "foe", chance: 10 } },
    { name: "Megahorn",     type: "bug", power: 120, accuracy: 85,  category: "physical", pp: 10 },
    { name: "Quiver Dance", type: "bug", power: 0,   accuracy: 100, category: "status",   pp: 20, effect: { boost: { spatk: 1, spdef: 1, spd: 1 }, target: "self" } }
  ],
  rock: [
    { name: "Rock Throw",  type: "rock", power: 50,  accuracy: 90, category: "physical", pp: 15 },
    { name: "Rock Slide",  type: "rock", power: 75,  accuracy: 90, category: "physical", pp: 10 },
    { name: "Power Gem",   type: "rock", power: 80,  accuracy: 100, category: "special", pp: 20 },
    { name: "Stone Edge",  type: "rock", power: 100, accuracy: 80, category: "physical", pp: 5, effect: { highCrit: true } },
    { name: "Head Smash",  type: "rock", power: 150, accuracy: 80, category: "physical", pp: 5, effect: { recoil: 0.5 } },
    { name: "Rock Polish", type: "rock", power: 0,   accuracy: 100, category: "status",  pp: 20, effect: { boost: { spd: 2 }, target: "self" } }
  ],
  ghost: [
    { name: "Lick",           type: "ghost", power: 30, accuracy: 100, category: "physical", pp: 30, effect: { status: "paralyze", chance: 30 } },
    { name: "Hex",            type: "ghost", power: 65, accuracy: 100, category: "special",  pp: 10, effect: { doubleIf: "status" } },
    { name: "Shadow Claw",    type: "ghost", power: 70, accuracy: 100, category: "physical", pp: 15, effect: { highCrit: true } },
    { name: "Shadow Ball",    type: "ghost", power: 80, accuracy: 100, category: "special",  pp: 15, effect: { boost: { spdef: -1 }, target: "foe", chance: 20 } },
    { name: "Phantom Force",  type: "ghost", power: 90, accuracy: 100, category: "physical", pp: 10 },
    { name: "Confuse Ray",    type: "ghost", power: 0,  accuracy: 100, category: "status",   pp: 10, effect: { status: "confuse", chance: 100 } }
  ],
  dragon: [
    { name: "Dragon Breath", type: "dragon", power: 60,  accuracy: 100, category: "special",  pp: 20, effect: { status: "paralyze", chance: 30 } },
    { name: "Dragon Claw",   type: "dragon", power: 80,  accuracy: 100, category: "physical", pp: 15 },
    { name: "Dragon Pulse",  type: "dragon", power: 85,  accuracy: 100, category: "special",  pp: 10 },
    { name: "Outrage",       type: "dragon", power: 120, accuracy: 100, category: "physical", pp: 10, effect: { status: "confuse", chance: 100, target: "self" } },
    { name: "Draco Meteor",  type: "dragon", power: 130, accuracy: 90,  category: "special",  pp: 5,  effect: { boost: { spatk: -2 }, target: "self", chance: 100 } },
    { name: "Eternabeam",    type: "dragon", power: 160, accuracy: 90,  category: "special",  pp: 5,  effect: { recharge: true } },
    { name: "Dragon Dance",  type: "dragon", power: 0,   accuracy: 100, category: "status",   pp: 20, effect: { boost: { atk: 1, spd: 1 }, target: "self" } }
  ],
  dark: [
    { name: "Bite",        type: "dark", power: 60, accuracy: 100, category: "physical", pp: 25 },
    { name: "Night Slash", type: "dark", power: 70, accuracy: 100, category: "physical", pp: 15, effect: { highCrit: true } },
    { name: "Dark Pulse",  type: "dark", power: 80, accuracy: 100, category: "special",  pp: 15, effect: { status: "confuse", chance: 20 } },
    { name: "Crunch",      type: "dark", power: 80, accuracy: 100, category: "physical", pp: 15, effect: { boost: { def: -1 }, target: "foe", chance: 20 } },
    { name: "Foul Play",   type: "dark", power: 95, accuracy: 100, category: "physical", pp: 15, effect: { useTargetAttack: true } },
    { name: "Nasty Plot",  type: "dark", power: 0,  accuracy: 100, category: "status",   pp: 20, effect: { boost: { spatk: 2 }, target: "self" } }
  ],
  steel: [
    { name: "Metal Claw",    type: "steel", power: 50,  accuracy: 95,  category: "physical", pp: 35, effect: { boost: { atk: 1 }, target: "self", chance: 10 } },
    { name: "Flash Cannon",  type: "steel", power: 80,  accuracy: 100, category: "special",  pp: 10, effect: { boost: { spdef: -1 }, target: "foe", chance: 10 } },
    { name: "Iron Head",     type: "steel", power: 80,  accuracy: 100, category: "physical", pp: 15 },
    { name: "Meteor Mash",   type: "steel", power: 90,  accuracy: 90,  category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 } },
    { name: "Iron Tail",     type: "steel", power: 100, accuracy: 75,  category: "physical", pp: 15, effect: { boost: { def: -1 }, target: "foe", chance: 30 } },
    { name: "Iron Defense",  type: "steel", power: 0,   accuracy: 100, category: "status",   pp: 15, effect: { boost: { def: 2 }, target: "self" } }
  ],
  fairy: [
    { name: "Fairy Wind",     type: "fairy", power: 40, accuracy: 100, category: "special",  pp: 30 },
    { name: "Draining Kiss",  type: "fairy", power: 50, accuracy: 100, category: "special",  pp: 10, effect: { drain: 0.75 } },
    { name: "Dazzling Gleam", type: "fairy", power: 80, accuracy: 100, category: "special",  pp: 10 },
    { name: "Play Rough",     type: "fairy", power: 90, accuracy: 90,  category: "physical", pp: 10, effect: { boost: { atk: -1 }, target: "foe", chance: 10 } },
    { name: "Moonblast",      type: "fairy", power: 95, accuracy: 100, category: "special",  pp: 15, effect: { boost: { spatk: -1 }, target: "foe", chance: 30 } },
    { name: "Moonlight",      type: "fairy", power: 0,  accuracy: 100, category: "status",   pp: 5,  effect: { heal: 0.5 } }
  ],

  // ── Event / Signature move pool ──────────────────────────────
  // These only appear via POKEMON_SPECIFIC_MOVES overrides
  event: [
    { name: "Coloursplash",     type: "fairy", power: 100, accuracy: 100, category: "special",  pp: 10 },
    { name: "Powder Bomb",      type: "water", power: 90,  accuracy: 100, category: "physical", pp: 10, effect: { status: "poison", chance: 30 } },
    { name: "Vibrant Wave",     type: "fairy", power: 80,  accuracy: 90,  category: "special",  pp: 15, effect: { status: "confuse", chance: 20 } },
    { name: "Prismatic Shield", type: "water", power: 0,   accuracy: 100, category: "status",   pp: 10, effect: { isProtect: true }, isProtect: true }
  ]
};

// Flat name → move lookup so commands can resolve a stored move name without
// knowing its type. Built once at require time.
const MOVE_INDEX = new Map();
for (const bucket of Object.values(MOVES)) {
  for (const move of bucket) {
    if (!MOVE_INDEX.has(move.name.toLowerCase())) {
      MOVE_INDEX.set(move.name.toLowerCase(), move);
    }
  }
}

/** Look a move up by name, case- and punctuation-insensitively. */
function getMoveByName(name) {
  if (!name) return null;
  const key = String(name).toLowerCase().trim();
  return MOVE_INDEX.get(key)
    || MOVE_INDEX.get(key.replace(/[-_\s]+/g, " "))
    || null;
}

/** True when the move deals damage. */
function isDamaging(move) {
  return !!move && move.category !== "status" && move.power > 0;
}

/**
 * Builds a sensible 4-move set for a wild/AI Pokemon.
 * Guarantees at least three damaging moves so a low-level Pokemon can never
 * end up with a set it cannot attack with.
 */
function getMovesForPokemon(types, level) {
  const pool = [];
  const seen = new Set();
  const add = (m) => {
    if (m && !seen.has(m.name)) { seen.add(m.name); pool.push(m); }
  };

  for (const type of types) {
    for (const m of MOVES[type] || []) add(m);
  }
  for (const m of MOVES.normal.slice(0, 3)) add(m);

  const damaging = pool.filter(isDamaging);
  // Power ceiling scales with level so a level-5 Pokemon isn't swinging Hyper Beam.
  const ceiling = level * 2 + 25;
  let eligible = damaging.filter(m => m.power <= ceiling);
  if (eligible.length < 3) eligible = damaging.slice().sort((a, b) => a.power - b.power);
  if (eligible.length === 0) eligible = [MOVES.normal[0]];

  const shuffled = eligible.slice().sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(3, shuffled.length)).map(m => ({ ...m }));

  // Fourth slot: a status move if one is available, otherwise another attack.
  const statusPool = pool.filter(m => m.category === "status");
  const extra = statusPool.length && Math.random() < 0.5
    ? statusPool[Math.floor(Math.random() * statusPool.length)]
    : shuffled.find(m => !selected.some(s => s.name === m.name));
  if (extra) selected.push({ ...extra });

  return selected.slice(0, 4);
}

/**
 * Resolves the four stored move names into full move objects.
 * Empty slots are filled with the strongest legal moves available so a
 * partially-configured Pokemon is still battle-viable.
 */
function getEquippedMoves(moveNames, types, level, pokemonId = null) {
  const { getAvailableMoves } = require("./learnsets");
  const available = getAvailableMoves(types, level, pokemonId);
  const equipped = [];

  for (const name of moveNames) {
    if (!name) continue;
    const found = available.find(m => m.name === name) || getMoveByName(name);
    if (found && !equipped.some(e => e.name === found.name)) {
      equipped.push({ ...found });
    }
  }

  if (equipped.length === 0) return getMovesForPokemon(types, level);

  // Fill remaining slots with the best damaging options, then anything left.
  const filler = available
    .filter(m => !equipped.some(e => e.name === m.name))
    .sort((a, b) => {
      const ad = isDamaging(a) ? 1 : 0;
      const bd = isDamaging(b) ? 1 : 0;
      if (ad !== bd) return bd - ad;
      return b.power - a.power;
    });

  for (const m of filler) {
    if (equipped.length >= 4) break;
    equipped.push({ ...m });
  }

  return equipped.slice(0, 4);
}

module.exports = { MOVES, MOVE_INDEX, getMoveByName, isDamaging, getMovesForPokemon, getEquippedMoves };
