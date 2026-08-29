const { MOVES } = require("./moves");

// ── Pokémon-specific extra moves (by pokemon_id) ──
// These are added on top of the type-generated learnset
const POKEMON_SPECIFIC_MOVES = {

  // ── Holi Spirit Greninja (Event) ─────────────────────────────
  // Fixed moveset — always these 4 regardless of level
  10658: [
    { name: "Coloursplash",     power: 100, accuracy: 100, type: "fairy",  category: "special",  pp: 10, learnLevel: 1 },
    { name: "Powder Bomb",      power: 90,  accuracy: 100, type: "water",  category: "physical", pp: 10, learnLevel: 1, effect: { status: "poison", chance: 30 } },
    { name: "Vibrant Wave",     power: 80,  accuracy: 90,  type: "fairy",  category: "special",  pp: 15, learnLevel: 1, effect: { status: "confuse", chance: 20 } },
    { name: "Prismatic Shield", power: 0,   accuracy: 100, type: "water",  category: "status",   pp: 10, learnLevel: 1, isProtect: true, effect: { isProtect: true } }
  ],

  // ── Eternatus ─────────────────────────────────────────────────
  // Eternabeam is its signature — only available to Eternatus
  // Learns at level 84 (official learn level)
  890: [
    { name: "Eternabeam", power: 160, accuracy: 90, type: "dragon", category: "special", pp: 5, learnLevel: 84, effect: { recharge: true } }
  ],

  // ══════════════════════════════════════════════════════════════
  //  DRAGON ASCENT  –  Flying / 120 power / 100 acc
  //  Rayquaza's signature. Learned by legendary/godly dragons.
  // ══════════════════════════════════════════════════════════════

  384: [ // Rayquaza — learns at 90 (signature move)
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 90 }
  ],
  149: [ // Dragonite — dragon/flying, earns it at 85
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 85 }
  ],
  373: [ // Salamence — dragon/flying, 85
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 85 }
  ],
  635: [ // Hydreigon — dark/dragon, 88
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 88 }
  ],
  445: [ // Garchomp — dragon/ground, 88
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 88 }
  ],
  612: [ // Haxorus — pure dragon, 85
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 85 }
  ],
  330: [ // Flygon — ground/dragon, 82
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 82 }
  ],
  643: [ // Reshiram — dragon/fire legendary, 90
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 90 }
  ],
  644: [ // Zekrom — dragon/electric legendary, 90
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 90 }
  ],
  483: [ // Dialga — steel/dragon legendary, 88
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 88 }
  ],
  484: [ // Palkia — water/dragon legendary, 88
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 88 }
  ],
  706: [ // Goodra — pure dragon, 82
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 82 }
  ],
  784: [ // Kommo-o — dragon/fighting, 85
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 85 }
  ],
  884: [ // Duraludon — steel/dragon, 85
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", category: "physical", pp: 5, effect: { boost: { def: -1, spdef: -1 }, target: "self", chance: 100 }, learnLevel: 85 }
  ],

  // ══════════════════════════════════════════════════════════════
  //  METEOR MASH  –  Steel / 90 power / 90 acc
  //  Lucario's & elite steel-types' signature power move.
  // ══════════════════════════════════════════════════════════════

  448: [ // Lucario — fighting/steel, 72
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 }, learnLevel: 72 }
  ],
  376: [ // Metagross — steel/psychic, 78 (signature Pokémon of this move)
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 }, learnLevel: 78 }
  ],
  375: [ // Metang — evolves into Metagross, 65
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 }, learnLevel: 65 }
  ],
  374: [ // Beldum — baby form, 55
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 }, learnLevel: 55 }
  ],
  212: [ // Scizor — bug/steel, 70
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 }, learnLevel: 70 }
  ],
  530: [ // Excadrill — ground/steel, 70
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 }, learnLevel: 70 }
  ],
  681: [ // Aegislash-shield — steel/ghost, 75
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 }, learnLevel: 75 }
  ],
  625: [ // Bisharp — dark/steel, 72
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 }, learnLevel: 72 }
  ],
  983: [ // Kingambit — dark/steel (Bisharp evolution), 78
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 }, learnLevel: 78 }
  ],
  638: [ // Cobalion — steel/fighting legendary, 75
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 }, learnLevel: 75 }
  ],
  379: [ // Registeel — pure steel legendary, 80
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 }, learnLevel: 80 }
  ],
  791: [ // Solgaleo — psychic/steel legendary, 82
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 }, learnLevel: 82 }
  ],
  809: [ // Melmetal — steel, 80
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", category: "physical", pp: 10, effect: { boost: { atk: 1 }, target: "self", chance: 20 }, learnLevel: 80 }
  ]
};

// Learnsets are derived purely from a Pokemon's type list, so the same list
// is requested over and over (dex pages, battle setup, level-ups). Memoize by
// type signature — this turns a hot O(n) rebuild into a map lookup.
const learnsetCache = new Map();

function generateLearnset(types) {
  const key = (types || []).join("/");
  const cached = learnsetCache.get(key);
  if (cached) return cached.map(m => ({ ...m }));

  const learnset = [];
  const addedMoves = new Set();

  const normalMoves = MOVES.normal || [];
  for (let i = 0; i < normalMoves.length; i++) {
    const move = normalMoves[i];
    if (addedMoves.has(move.name)) continue;
    const learnLevel = getLearnLevel(move, i, normalMoves.length);
    learnset.push({ ...move, learnLevel });
    addedMoves.add(move.name);
  }

  for (const type of types) {
    const typeMoves = MOVES[type];
    if (!typeMoves) continue;
    for (let i = 0; i < typeMoves.length; i++) {
      const move = typeMoves[i];
      if (addedMoves.has(move.name)) continue;
      const learnLevel = getLearnLevel(move, i, typeMoves.length);
      learnset.push({ ...move, learnLevel });
      addedMoves.add(move.name);
    }
  }

  const coverageTypes = getCoverageTypes(types);
  for (const cType of coverageTypes) {
    const typeMoves = MOVES[cType];
    if (!typeMoves) continue;
    const midToHigh = typeMoves.filter(m => m.power >= 60);
    for (let i = 0; i < Math.min(2, midToHigh.length); i++) {
      const move = midToHigh[i];
      if (addedMoves.has(move.name)) continue;
      const learnLevel = Math.min(100, 50 + i * 15 + Math.floor(move.power / 10));
      learnset.push({ ...move, learnLevel });
      addedMoves.add(move.name);
    }
  }

  learnset.sort((a, b) => a.learnLevel - b.learnLevel || a.name.localeCompare(b.name));
  learnsetCache.set(key, learnset);
  return learnset.map(m => ({ ...m }));
}

// Learn level is derived from raw power so stronger moves come later.
// Status moves have no power, so they're spread across the early-mid game
// instead of all landing at level 1.
function getLearnLevel(move, index, totalInType) {
  const power = move.power || 0;
  if (move.category === "status") return Math.max(8, 12 + index * 6);
  if (power <= 40) return Math.max(1, 1 + index * 3);
  if (power <= 60) return Math.max(5, 10 + index * 5);
  if (power <= 80) return Math.max(15, 25 + index * 5);
  if (power <= 100) return Math.max(30, 40 + index * 8);
  if (power <= 120) return Math.max(50, 55 + index * 10);
  return Math.min(100, 65 + index * 10);
}

function getCoverageTypes(types) {
  const coverageMap = {
    fire: ["ground", "rock"],
    water: ["ice", "ground"],
    grass: ["poison", "ground"],
    electric: ["ice", "steel"],
    ice: ["water", "ground"],
    fighting: ["rock", "steel"],
    poison: ["ground", "dark"],
    ground: ["rock", "steel"],
    flying: ["steel", "normal"],
    psychic: ["fairy", "fighting"],
    bug: ["poison", "flying"],
    rock: ["ground", "fighting"],
    ghost: ["dark", "poison"],
    dragon: ["fire", "ice"],
    dark: ["fighting", "ghost"],
    steel: ["rock", "ground"],
    fairy: ["psychic", "steel"],
    normal: ["fighting"]
  };

  const coverage = new Set();
  for (const t of types) {
    const c = coverageMap[t];
    if (c) c.forEach(ct => { if (!types.includes(ct)) coverage.add(ct); });
  }
  return Array.from(coverage).slice(0, 2);
}

function getAvailableMoves(types, level, pokemonId = null) {
  // Event Pokémon with fixed movesets — return ONLY their signature moves
  // BUT also merge in the base form's full learnset so user can replace slots
  if (pokemonId && POKEMON_SPECIFIC_MOVES[pokemonId]) {
    const specific = POKEMON_SPECIFIC_MOVES[pokemonId];
    const isFixedMoveset = specific.every(m => m.learnLevel <= 1);
    if (isFixedMoveset) {
      // Load base form moves if this pokemon has a baseForm
      const { getPokemonById } = require("./pokemonLoader");
      const eventPoke = getPokemonById(pokemonId);
      let baseMoves = [];
      if (eventPoke && eventPoke.baseForm) {
        const baseData = getPokemonById(eventPoke.baseForm);
        if (baseData) {
          // Generate full learnset for base form
          const baseLearnset = generateLearnset(baseData.types);
          // Also include base form specific moves (e.g. Aerial Ace for Greninja)
          if (POKEMON_SPECIFIC_MOVES[eventPoke.baseForm]) {
            for (const m of POKEMON_SPECIFIC_MOVES[eventPoke.baseForm]) {
              if (!baseLearnset.some(b => b.name === m.name)) baseLearnset.push(m);
            }
          }
          baseMoves = baseLearnset.filter(m => m.learnLevel <= level);
        }
      }
      // Signature moves first, then base form moves (deduped)
      const sigNames = new Set(specific.map(m => m.name));
      const merged = [
        ...specific.map(m => ({ ...m })),
        ...baseMoves.filter(m => !sigNames.has(m.name))
      ];
      return merged;
    }
  }

  const learnset = generateLearnset(types);

  // Merge in Pokémon-specific moves — override learnLevel if already in learnset
  if (pokemonId && POKEMON_SPECIFIC_MOVES[pokemonId]) {
    for (const override of POKEMON_SPECIFIC_MOVES[pokemonId]) {
      const existing = learnset.find(m => m.name === override.name);
      if (existing) {
        // Update the learnLevel to the specific override value
        existing.learnLevel = override.learnLevel;
        // Copy any extra flags (neverMiss etc.)
        Object.assign(existing, override);
      } else {
        learnset.push({ ...override });
      }
    }
    learnset.sort((a, b) => a.learnLevel - b.learnLevel);
  }

  return learnset.filter(m => m.learnLevel <= level);
}

function getNewMovesAtLevel(types, level, pokemonId = null) {
  const learnset = generateLearnset(types);

  if (pokemonId && POKEMON_SPECIFIC_MOVES[pokemonId]) {
    for (const override of POKEMON_SPECIFIC_MOVES[pokemonId]) {
      const existing = learnset.find(m => m.name === override.name);
      if (existing) {
        existing.learnLevel = override.learnLevel;
        Object.assign(existing, override);
      } else {
        learnset.push({ ...override });
      }
    }
  }

  return learnset.filter(m => m.learnLevel === level);
}

module.exports = { generateLearnset, getAvailableMoves, getNewMovesAtLevel };
