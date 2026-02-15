const { MOVES } = require("./moves");

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

function getAvailableMoves(types, level) {
  const learnset = generateLearnset(types);
  return learnset.filter(m => m.learnLevel <= level);
}

function getNewMovesAtLevel(types, level) {
  const learnset = generateLearnset(types);
  return learnset.filter(m => m.learnLevel === level);
}

module.exports = { generateLearnset, getAvailableMoves, getNewMovesAtLevel };
