const { MOVES } = require("./moves");

// ── Pokémon-specific extra moves (by pokemon_id) ──
// These are added on top of the type-generated learnset
const POKEMON_SPECIFIC_MOVES = {
  // ── Greninja ──────────────────────────────────────────────────
  658: [
    { name: "Aerial Ace", power: 60, accuracy: 100, type: "flying", learnLevel: 80, neverMiss: true }
  ],

  // ══════════════════════════════════════════════════════════════
  //  DRAGON ASCENT  –  Flying / 120 power / 100 acc
  //  Rayquaza's signature. Learned by legendary/godly dragons.
  // ══════════════════════════════════════════════════════════════

  384: [ // Rayquaza — learns at 90 (signature move)
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 90 }
  ],
  149: [ // Dragonite — dragon/flying, earns it at 85
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 85 }
  ],
  373: [ // Salamence — dragon/flying, 85
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 85 }
  ],
  635: [ // Hydreigon — dark/dragon, 88
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 88 }
  ],
  445: [ // Garchomp — dragon/ground, 88
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 88 }
  ],
  612: [ // Haxorus — pure dragon, 85
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 85 }
  ],
  330: [ // Flygon — ground/dragon, 82
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 82 }
  ],
  643: [ // Reshiram — dragon/fire legendary, 90
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 90 }
  ],
  644: [ // Zekrom — dragon/electric legendary, 90
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 90 }
  ],
  483: [ // Dialga — steel/dragon legendary, 88
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 88 }
  ],
  484: [ // Palkia — water/dragon legendary, 88
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 88 }
  ],
  706: [ // Goodra — pure dragon, 82
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 82 }
  ],
  784: [ // Kommo-o — dragon/fighting, 85
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 85 }
  ],
  884: [ // Duraludon — steel/dragon, 85
    { name: "Dragon Ascent", power: 120, accuracy: 100, type: "flying", learnLevel: 85 }
  ],

  // ══════════════════════════════════════════════════════════════
  //  METEOR MASH  –  Steel / 90 power / 90 acc
  //  Lucario's & elite steel-types' signature power move.
  // ══════════════════════════════════════════════════════════════

  448: [ // Lucario — fighting/steel, 72
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", learnLevel: 72 }
  ],
  376: [ // Metagross — steel/psychic, 78 (signature Pokémon of this move)
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", learnLevel: 78 }
  ],
  375: [ // Metang — evolves into Metagross, 65
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", learnLevel: 65 }
  ],
  374: [ // Beldum — baby form, 55
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", learnLevel: 55 }
  ],
  212: [ // Scizor — bug/steel, 70
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", learnLevel: 70 }
  ],
  530: [ // Excadrill — ground/steel, 70
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", learnLevel: 70 }
  ],
  681: [ // Aegislash-shield — steel/ghost, 75
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", learnLevel: 75 }
  ],
  625: [ // Bisharp — dark/steel, 72
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", learnLevel: 72 }
  ],
  983: [ // Kingambit — dark/steel (Bisharp evolution), 78
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", learnLevel: 78 }
  ],
  638: [ // Cobalion — steel/fighting legendary, 75
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", learnLevel: 75 }
  ],
  379: [ // Registeel — pure steel legendary, 80
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", learnLevel: 80 }
  ],
  791: [ // Solgaleo — psychic/steel legendary, 82
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", learnLevel: 82 }
  ],
  809: [ // Melmetal — steel, 80
    { name: "Meteor Mash", power: 90, accuracy: 90, type: "steel", learnLevel: 80 }
  ]
};

function generateLearnset(types) {
  const learnset = [];
  const addedMoves = new Set();

  const normalMoves = MOVES.normal || [];
  for (let i = 0; i < normalMoves.length; i++) {
    const move = normalMoves[i];
    if (addedMoves.has(move.name)) continue;
    const learnLevel = getLearnLevel(move.power, i, normalMoves.length);
    learnset.push({ ...move, type: "normal", learnLevel });
    addedMoves.add(move.name);
  }

  for (const type of types) {
    const typeMoves = MOVES[type];
    if (!typeMoves) continue;
    for (let i = 0; i < typeMoves.length; i++) {
      const move = typeMoves[i];
      if (addedMoves.has(move.name)) continue;
      const learnLevel = getLearnLevel(move.power, i, typeMoves.length);
      learnset.push({ ...move, type, learnLevel });
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
      learnset.push({ ...move, type: cType, learnLevel });
      addedMoves.add(move.name);
    }
  }

  learnset.sort((a, b) => a.learnLevel - b.learnLevel);
  return learnset;
}

function getLearnLevel(power, index, totalInType) {
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
