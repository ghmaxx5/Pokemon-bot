const MOVES = {
  normal: [
    { name: "Tackle", power: 40, accuracy: 100 },
    { name: "Quick Attack", power: 40, accuracy: 100 },
    { name: "Slam", power: 80, accuracy: 75 },
    { name: "Hyper Beam", power: 150, accuracy: 90 },
    { name: "Body Slam", power: 85, accuracy: 100 },
    { name: "Take Down", power: 90, accuracy: 85 },
    { name: "Swift", power: 60, accuracy: 100 },
    { name: "Giga Impact", power: 150, accuracy: 90 }
  ],
  fire: [
    { name: "Ember", power: 40, accuracy: 100 },
    { name: "Flamethrower", power: 90, accuracy: 100 },
    { name: "Fire Blast", power: 110, accuracy: 85 },
    { name: "Fire Punch", power: 75, accuracy: 100 },
    { name: "Heat Wave", power: 95, accuracy: 90 },
    { name: "Overheat", power: 130, accuracy: 90 },
    { name: "Flame Charge", power: 50, accuracy: 100 }
  ],
  water: [
    { name: "Water Gun", power: 40, accuracy: 100 },
    { name: "Surf", power: 90, accuracy: 100 },
    { name: "Hydro Pump", power: 110, accuracy: 80 },
    { name: "Aqua Tail", power: 90, accuracy: 90 },
    { name: "Waterfall", power: 80, accuracy: 100 },
    { name: "Scald", power: 80, accuracy: 100 }
  ],
  grass: [
    { name: "Vine Whip", power: 45, accuracy: 100 },
    { name: "Razor Leaf", power: 55, accuracy: 95 },
    { name: "Solar Beam", power: 120, accuracy: 100 },
    { name: "Leaf Blade", power: 90, accuracy: 100 },
    { name: "Energy Ball", power: 90, accuracy: 100 },
    { name: "Giga Drain", power: 75, accuracy: 100 }
  ],
  electric: [
    { name: "Thunder Shock", power: 40, accuracy: 100 },
    { name: "Thunderbolt", power: 90, accuracy: 100 },
    { name: "Thunder", power: 110, accuracy: 70 },
    { name: "Volt Tackle", power: 120, accuracy: 100 },
    { name: "Discharge", power: 80, accuracy: 100 },
    { name: "Wild Charge", power: 90, accuracy: 100 }
  ],
  ice: [
    { name: "Ice Shard", power: 40, accuracy: 100 },
    { name: "Ice Beam", power: 90, accuracy: 100 },
    { name: "Blizzard", power: 110, accuracy: 70 },
    { name: "Ice Punch", power: 75, accuracy: 100 },
    { name: "Avalanche", power: 60, accuracy: 100 }
  ],
  fighting: [
    { name: "Karate Chop", power: 50, accuracy: 100 },
    { name: "Close Combat", power: 120, accuracy: 100 },
    { name: "Aura Sphere", power: 80, accuracy: 100 },
    { name: "Focus Blast", power: 120, accuracy: 70 },
    { name: "Brick Break", power: 75, accuracy: 100 },
    { name: "Dynamic Punch", power: 100, accuracy: 50 }
  ],
  poison: [
    { name: "Poison Sting", power: 15, accuracy: 100 },
    { name: "Sludge Bomb", power: 90, accuracy: 100 },
    { name: "Poison Jab", power: 80, accuracy: 100 },
    { name: "Gunk Shot", power: 120, accuracy: 80 },
    { name: "Venoshock", power: 65, accuracy: 100 }
  ],
  ground: [
    { name: "Mud Slap", power: 20, accuracy: 100 },
    { name: "Earthquake", power: 100, accuracy: 100 },
    { name: "Earth Power", power: 90, accuracy: 100 },
    { name: "Drill Run", power: 80, accuracy: 95 },
    { name: "Bulldoze", power: 60, accuracy: 100 }
  ],
  flying: [
    { name: "Gust", power: 40, accuracy: 100 },
    { name: "Air Slash", power: 75, accuracy: 95 },
    { name: "Brave Bird", power: 120, accuracy: 100 },
    { name: "Hurricane", power: 110, accuracy: 70 },
    { name: "Aerial Ace", power: 60, accuracy: 100, neverMiss: true },
    { name: "Dragon Ascent", power: 120, accuracy: 100, neverMiss: false }
  ],
  psychic: [
    { name: "Confusion", power: 50, accuracy: 100 },
    { name: "Psychic", power: 90, accuracy: 100 },
    { name: "Psyshock", power: 80, accuracy: 100 },
    { name: "Future Sight", power: 120, accuracy: 100 },
    { name: "Zen Headbutt", power: 80, accuracy: 90 }
  ],
  bug: [
    { name: "Bug Bite", power: 60, accuracy: 100 },
    { name: "X-Scissor", power: 80, accuracy: 100 },
    { name: "Bug Buzz", power: 90, accuracy: 100 },
    { name: "Megahorn", power: 120, accuracy: 85 },
    { name: "Signal Beam", power: 75, accuracy: 100 }
  ],
  rock: [
    { name: "Rock Throw", power: 50, accuracy: 90 },
    { name: "Stone Edge", power: 100, accuracy: 80 },
    { name: "Rock Slide", power: 75, accuracy: 90 },
    { name: "Power Gem", power: 80, accuracy: 100 },
    { name: "Head Smash", power: 150, accuracy: 80 }
  ],
  ghost: [
    { name: "Lick", power: 30, accuracy: 100 },
    { name: "Shadow Ball", power: 80, accuracy: 100 },
    { name: "Shadow Claw", power: 70, accuracy: 100 },
    { name: "Phantom Force", power: 90, accuracy: 100 },
    { name: "Hex", power: 65, accuracy: 100 }
  ],
  dragon: [
    { name: "Dragon Breath", power: 60, accuracy: 100 },
    { name: "Dragon Claw", power: 80, accuracy: 100 },
    { name: "Dragon Pulse", power: 85, accuracy: 100 },
    { name: "Outrage", power: 120, accuracy: 100 },
    { name: "Draco Meteor", power: 130, accuracy: 90 }
  ],
  dark: [
    { name: "Bite", power: 60, accuracy: 100 },
    { name: "Dark Pulse", power: 80, accuracy: 100 },
    { name: "Crunch", power: 80, accuracy: 100 },
    { name: "Night Slash", power: 70, accuracy: 100 },
    { name: "Foul Play", power: 95, accuracy: 100 }
  ],
  steel: [
    { name: "Metal Claw", power: 50, accuracy: 95 },
    { name: "Iron Tail", power: 100, accuracy: 75 },
    { name: "Flash Cannon", power: 80, accuracy: 100 },
    { name: "Iron Head", power: 80, accuracy: 100 },
    { name: "Meteor Mash", power: 90, accuracy: 90 }
  ],
  fairy: [
    { name: "Fairy Wind", power: 40, accuracy: 100 },
    { name: "Dazzling Gleam", power: 80, accuracy: 100 },
    { name: "Moonblast", power: 95, accuracy: 100 },
    { name: "Play Rough", power: 90, accuracy: 90 },
    { name: "Draining Kiss", power: 50, accuracy: 100 }
  ]
};

function getMovesForPokemon(types, level) {
  const availableMoves = [];
  for (const type of types) {
    if (MOVES[type]) availableMoves.push(...MOVES[type]);
  }
  if (MOVES.normal) availableMoves.push(...MOVES.normal.slice(0, 3));

  const maxMoves = Math.min(4, availableMoves.length);
  const levelMoves = availableMoves.filter(m => m.power <= level * 2 + 20);
  const pool = levelMoves.length >= maxMoves ? levelMoves : availableMoves;

  const selected = [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (let i = 0; i < maxMoves && i < shuffled.length; i++) {
    selected.push({ ...shuffled[i], type: types[0] || 'normal' });
  }
  return selected;
}

function getEquippedMoves(moveNames, types, level, pokemonId = null) {
  const { getAvailableMoves } = require("./learnsets");
  const available = getAvailableMoves(types, level, pokemonId);
  const equipped = [];

  for (const name of moveNames) {
    if (!name) continue;
    const found = available.find(m => m.name === name);
    if (found) {
      equipped.push({ ...found });
    }
  }

  if (equipped.length === 0) {
    return getMovesForPokemon(types, level);
  }

  while (equipped.length < 4 && available.length > equipped.length) {
    const next = available.find(m => !equipped.some(e => e.name === m.name));
    if (next) equipped.push({ ...next });
    else break;
  }

  return equipped.slice(0, 4);
}

module.exports = { MOVES, getMovesForPokemon, getEquippedMoves };
