const MEGA_POKEMON = {
  3: { name: "Mega Venusaur", types: ["grass", "poison"], statBoost: { hp: 0, atk: 20, def: 20, spatk: 22, spdef: 20, spd: 0 } },
  6: { name: "Mega Charizard X", types: ["fire", "dragon"], statBoost: { hp: 0, atk: 46, def: 33, spatk: -13, spdef: 0, spd: 0 } },
  9: { name: "Mega Blastoise", types: ["water"], statBoost: { hp: 0, atk: -10, def: 20, spatk: 55, spdef: 20, spd: -10 } },
  15: { name: "Mega Beedrill", types: ["bug", "poison"], statBoost: { hp: 0, atk: 60, def: -20, spatk: 0, spdef: -20, spd: 80 } },
  18: { name: "Mega Pidgeot", types: ["normal", "flying"], statBoost: { hp: 0, atk: -10, def: 0, spatk: 65, spdef: 0, spd: 46 } },
  65: { name: "Mega Alakazam", types: ["psychic"], statBoost: { hp: 0, atk: -5, def: 0, spatk: 40, spdef: 0, spd: 65 } },
  80: { name: "Mega Slowbro", types: ["water", "psychic"], statBoost: { hp: 0, atk: 10, def: 70, spatk: 20, spdef: 0, spd: 0 } },
  94: { name: "Mega Gengar", types: ["ghost", "poison"], statBoost: { hp: 0, atk: 0, def: 0, spatk: 40, spdef: 0, spd: 60 } },
  115: { name: "Mega Kangaskhan", types: ["normal"], statBoost: { hp: 0, atk: 30, def: 20, spatk: 0, spdef: 20, spd: 30 } },
  127: { name: "Mega Pinsir", types: ["bug", "flying"], statBoost: { hp: 0, atk: 30, def: 10, spatk: 0, spdef: 10, spd: 50 } },
  130: { name: "Mega Gyarados", types: ["water", "dark"], statBoost: { hp: 0, atk: 25, def: 30, spatk: -40, spdef: 30, spd: 11 } },
  142: { name: "Mega Aerodactyl", types: ["rock", "flying"], statBoost: { hp: 0, atk: 35, def: 25, spatk: 0, spdef: 15, spd: 25 } },
  150: { name: "Mega Mewtwo X", types: ["psychic", "fighting"], statBoost: { hp: 0, atk: 80, def: 10, spatk: -44, spdef: 0, spd: 30 } },
  181: { name: "Mega Ampharos", types: ["electric", "dragon"], statBoost: { hp: 0, atk: 10, def: 20, spatk: 40, spdef: 20, spd: -10 } },
  212: { name: "Mega Scizor", types: ["bug", "steel"], statBoost: { hp: 0, atk: 40, def: 20, spatk: 0, spdef: 20, spd: 20 } },
  214: { name: "Mega Heracross", types: ["bug", "fighting"], statBoost: { hp: 0, atk: 40, def: 20, spatk: -40, spdef: 20, spd: 10 } },
  229: { name: "Mega Houndoom", types: ["dark", "fire"], statBoost: { hp: 0, atk: 10, def: 0, spatk: 50, spdef: 10, spd: 30 } },
  248: { name: "Mega Tyranitar", types: ["rock", "dark"], statBoost: { hp: 0, atk: 30, def: 30, spatk: 0, spdef: 20, spd: 20 } },
  254: { name: "Mega Sceptile", types: ["grass", "dragon"], statBoost: { hp: 0, atk: 10, def: 10, spatk: 45, spdef: 10, spd: 45 } },
  257: { name: "Mega Blaziken", types: ["fire", "fighting"], statBoost: { hp: 0, atk: 40, def: 10, spatk: 10, spdef: 10, spd: 20 } },
  260: { name: "Mega Swampert", types: ["water", "ground"], statBoost: { hp: 0, atk: 40, def: 20, spatk: 0, spdef: 20, spd: 20 } },
  282: { name: "Mega Gardevoir", types: ["psychic", "fairy"], statBoost: { hp: 0, atk: -10, def: 0, spatk: 45, spdef: 20, spd: 40 } },
  302: { name: "Mega Sableye", types: ["dark", "ghost"], statBoost: { hp: 0, atk: -10, def: 65, spatk: 20, spdef: 65, spd: -40 } },
  303: { name: "Mega Mawile", types: ["steel", "fairy"], statBoost: { hp: 0, atk: 60, def: 40, spatk: 0, spdef: 0, spd: 0 } },
  306: { name: "Mega Aggron", types: ["steel"], statBoost: { hp: 0, atk: 30, def: 50, spatk: 0, spdef: 20, spd: 0 } },
  308: { name: "Mega Medicham", types: ["fighting", "psychic"], statBoost: { hp: 0, atk: 40, def: 15, spatk: 10, spdef: 15, spd: 20 } },
  310: { name: "Mega Manectric", types: ["electric"], statBoost: { hp: 0, atk: -30, def: 10, spatk: 45, spdef: 10, spd: 45 } },
  319: { name: "Mega Sharpedo", types: ["water", "dark"], statBoost: { hp: 0, atk: 30, def: 10, spatk: 30, spdef: 10, spd: 30 } },
  323: { name: "Mega Camerupt", types: ["fire", "ground"], statBoost: { hp: 0, atk: 20, def: 20, spatk: 45, spdef: 20, spd: -25 } },
  334: { name: "Mega Altaria", types: ["dragon", "fairy"], statBoost: { hp: 0, atk: 40, def: 20, spatk: 0, spdef: 25, spd: 15 } },
  354: { name: "Mega Banette", types: ["ghost"], statBoost: { hp: 0, atk: 50, def: 20, spatk: -10, spdef: 20, spd: 20 } },
  359: { name: "Mega Absol", types: ["dark"], statBoost: { hp: 0, atk: 20, def: 0, spatk: 40, spdef: 0, spd: 40 } },
  362: { name: "Mega Glalie", types: ["ice"], statBoost: { hp: 0, atk: 40, def: 20, spatk: 40, spdef: 20, spd: -20 } },
  373: { name: "Mega Salamence", types: ["dragon", "flying"], statBoost: { hp: 0, atk: 15, def: 40, spatk: 30, spdef: 0, spd: 20 } },
  376: { name: "Mega Metagross", types: ["steel", "psychic"], statBoost: { hp: 0, atk: 30, def: 0, spatk: 30, spdef: 0, spd: 40 } },
  380: { name: "Mega Latias", types: ["dragon", "psychic"], statBoost: { hp: 0, atk: 0, def: 30, spatk: 30, spdef: 30, spd: 10 } },
  381: { name: "Mega Latios", types: ["dragon", "psychic"], statBoost: { hp: 0, atk: 10, def: 20, spatk: 40, spdef: 20, spd: 10 } },
  384: { name: "Mega Rayquaza", types: ["dragon", "flying"], statBoost: { hp: 0, atk: 30, def: 10, spatk: 30, spdef: 10, spd: 20 } },
  428: { name: "Mega Lopunny", types: ["normal", "fighting"], statBoost: { hp: 0, atk: 60, def: -14, spatk: -14, spdef: -6, spd: 60 } },
  445: { name: "Mega Garchomp", types: ["dragon", "ground"], statBoost: { hp: 0, atk: 40, def: 0, spatk: 40, spdef: 0, spd: -10 } },
  448: { name: "Mega Lucario", types: ["fighting", "steel"], statBoost: { hp: 0, atk: 35, def: 18, spatk: 25, spdef: 18, spd: 22 } },
  460: { name: "Mega Abomasnow", types: ["grass", "ice"], statBoost: { hp: 0, atk: 40, def: 30, spatk: 40, spdef: 20, spd: -30 } },
  475: { name: "Mega Gallade", types: ["psychic", "fighting"], statBoost: { hp: 0, atk: 40, def: 18, spatk: -10, spdef: 25, spd: 30 } },
  531: { name: "Mega Audino", types: ["normal", "fairy"], statBoost: { hp: 0, atk: -20, def: 40, spatk: 10, spdef: 40, spd: -30 } },
  719: { name: "Mega Diancie", types: ["rock", "fairy"], statBoost: { hp: 0, atk: 60, def: -40, spatk: 60, spdef: -40, spd: 60 } }
};

const PRIMAL_POKEMON = {
  382: { name: "Primal Kyogre", types: ["water"], statBoost: { hp: 0, atk: 30, def: 20, spatk: 50, spdef: 20, spd: -10 } },
  383: { name: "Primal Groudon", types: ["ground", "fire"], statBoost: { hp: 0, atk: 50, def: 20, spatk: 30, spdef: 20, spd: -10 } }
};

const GMAX_POKEMON = {
  3: {
    name: "Gigantamax Venusaur",
    gmaxMoves: [
      { name: "G-Max Vine Lash", power: 130, accuracy: 95, type: "grass" },
      { name: "Max Ooze", power: 110, accuracy: 100, type: "poison" },
      { name: "Max Quake", power: 100, accuracy: 90, type: "ground" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  6: {
    name: "Gigantamax Charizard",
    gmaxMoves: [
      { name: "G-Max Wildfire", power: 130, accuracy: 95, type: "fire" },
      { name: "Max Airstream", power: 120, accuracy: 90, type: "flying" },
      { name: "Max Wyrmwind", power: 110, accuracy: 90, type: "dragon" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  9: {
    name: "Gigantamax Blastoise",
    gmaxMoves: [
      { name: "G-Max Cannonade", power: 130, accuracy: 95, type: "water" },
      { name: "Max Hailstorm", power: 110, accuracy: 90, type: "ice" },
      { name: "Max Steelspike", power: 100, accuracy: 90, type: "steel" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  12: {
    name: "Gigantamax Butterfree",
    gmaxMoves: [
      { name: "G-Max Befuddle", power: 110, accuracy: 95, type: "bug" },
      { name: "Max Airstream", power: 100, accuracy: 90, type: "flying" },
      { name: "Max Mindstorm", power: 100, accuracy: 90, type: "psychic" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  25: {
    name: "Gigantamax Pikachu",
    gmaxMoves: [
      { name: "G-Max Volt Crash", power: 130, accuracy: 95, type: "electric" },
      { name: "Max Strike", power: 110, accuracy: 90, type: "normal" },
      { name: "Max Steelspike", power: 90, accuracy: 90, type: "steel" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  52: {
    name: "Gigantamax Meowth",
    gmaxMoves: [
      { name: "G-Max Gold Rush", power: 110, accuracy: 95, type: "normal" },
      { name: "Max Darkness", power: 100, accuracy: 90, type: "dark" },
      { name: "Max Knuckle", power: 90, accuracy: 90, type: "fighting" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  68: {
    name: "Gigantamax Machamp",
    gmaxMoves: [
      { name: "G-Max Chi Strike", power: 130, accuracy: 95, type: "fighting" },
      { name: "Max Rockfall", power: 110, accuracy: 90, type: "rock" },
      { name: "Max Darkness", power: 100, accuracy: 90, type: "dark" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  94: {
    name: "Gigantamax Gengar",
    gmaxMoves: [
      { name: "G-Max Terror", power: 130, accuracy: 95, type: "ghost" },
      { name: "Max Ooze", power: 110, accuracy: 90, type: "poison" },
      { name: "Max Darkness", power: 100, accuracy: 90, type: "dark" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  99: {
    name: "Gigantamax Kingler",
    gmaxMoves: [
      { name: "G-Max Foam Burst", power: 130, accuracy: 95, type: "water" },
      { name: "Max Rockfall", power: 110, accuracy: 90, type: "rock" },
      { name: "Max Quake", power: 100, accuracy: 90, type: "ground" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  131: {
    name: "Gigantamax Lapras",
    gmaxMoves: [
      { name: "G-Max Resonance", power: 130, accuracy: 95, type: "ice" },
      { name: "Max Geyser", power: 120, accuracy: 90, type: "water" },
      { name: "Max Lightning", power: 100, accuracy: 90, type: "electric" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  133: {
    name: "Gigantamax Eevee",
    gmaxMoves: [
      { name: "G-Max Cuddle", power: 110, accuracy: 95, type: "normal" },
      { name: "Max Starfall", power: 90, accuracy: 90, type: "fairy" },
      { name: "Max Darkness", power: 90, accuracy: 90, type: "dark" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  143: {
    name: "Gigantamax Snorlax",
    gmaxMoves: [
      { name: "G-Max Replenish", power: 130, accuracy: 95, type: "normal" },
      { name: "Max Quake", power: 110, accuracy: 90, type: "ground" },
      { name: "Max Darkness", power: 100, accuracy: 90, type: "dark" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  569: {
    name: "Gigantamax Garbodor",
    gmaxMoves: [
      { name: "G-Max Malodor", power: 130, accuracy: 95, type: "poison" },
      { name: "Max Quake", power: 110, accuracy: 90, type: "ground" },
      { name: "Max Darkness", power: 100, accuracy: 90, type: "dark" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  809: {
    name: "Gigantamax Melmetal",
    gmaxMoves: [
      { name: "G-Max Meltdown", power: 130, accuracy: 95, type: "steel" },
      { name: "Max Lightning", power: 110, accuracy: 90, type: "electric" },
      { name: "Max Quake", power: 100, accuracy: 90, type: "ground" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  812: {
    name: "Gigantamax Rillaboom",
    gmaxMoves: [
      { name: "G-Max Drum Solo", power: 160, accuracy: 95, type: "grass" },
      { name: "Max Quake", power: 120, accuracy: 90, type: "ground" },
      { name: "Max Knuckle", power: 100, accuracy: 90, type: "fighting" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  815: {
    name: "Gigantamax Cinderace",
    gmaxMoves: [
      { name: "G-Max Fireball", power: 160, accuracy: 95, type: "fire" },
      { name: "Max Knuckle", power: 120, accuracy: 90, type: "fighting" },
      { name: "Max Airstream", power: 100, accuracy: 90, type: "flying" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  818: {
    name: "Gigantamax Inteleon",
    gmaxMoves: [
      { name: "G-Max Hydrosnipe", power: 160, accuracy: 95, type: "water" },
      { name: "Max Hailstorm", power: 120, accuracy: 90, type: "ice" },
      { name: "Max Darkness", power: 100, accuracy: 90, type: "dark" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  823: {
    name: "Gigantamax Corviknight",
    gmaxMoves: [
      { name: "G-Max Wind Rage", power: 130, accuracy: 95, type: "flying" },
      { name: "Max Steelspike", power: 120, accuracy: 90, type: "steel" },
      { name: "Max Darkness", power: 100, accuracy: 90, type: "dark" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  826: {
    name: "Gigantamax Orbeetle",
    gmaxMoves: [
      { name: "G-Max Gravitas", power: 130, accuracy: 95, type: "psychic" },
      { name: "Max Flutterby", power: 110, accuracy: 90, type: "bug" },
      { name: "Max Starfall", power: 100, accuracy: 90, type: "fairy" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  834: {
    name: "Gigantamax Drednaw",
    gmaxMoves: [
      { name: "G-Max Stonesurge", power: 130, accuracy: 95, type: "water" },
      { name: "Max Rockfall", power: 120, accuracy: 90, type: "rock" },
      { name: "Max Quake", power: 100, accuracy: 90, type: "ground" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  839: {
    name: "Gigantamax Coalossal",
    gmaxMoves: [
      { name: "G-Max Volcalith", power: 130, accuracy: 95, type: "rock" },
      { name: "Max Flare", power: 120, accuracy: 90, type: "fire" },
      { name: "Max Quake", power: 100, accuracy: 90, type: "ground" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  841: {
    name: "Gigantamax Flapple",
    gmaxMoves: [
      { name: "G-Max Tartness", power: 130, accuracy: 95, type: "grass" },
      { name: "Max Airstream", power: 110, accuracy: 90, type: "flying" },
      { name: "Max Wyrmwind", power: 100, accuracy: 90, type: "dragon" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  842: {
    name: "Gigantamax Appletun",
    gmaxMoves: [
      { name: "G-Max Sweetness", power: 130, accuracy: 95, type: "grass" },
      { name: "Max Wyrmwind", power: 110, accuracy: 90, type: "dragon" },
      { name: "Max Quake", power: 100, accuracy: 90, type: "ground" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  844: {
    name: "Gigantamax Sandaconda",
    gmaxMoves: [
      { name: "G-Max Sandblast", power: 130, accuracy: 95, type: "ground" },
      { name: "Max Rockfall", power: 120, accuracy: 90, type: "rock" },
      { name: "Max Steelspike", power: 100, accuracy: 90, type: "steel" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  849: {
    name: "Gigantamax Toxtricity",
    gmaxMoves: [
      { name: "G-Max Stun Shock", power: 130, accuracy: 95, type: "electric" },
      { name: "Max Ooze", power: 120, accuracy: 90, type: "poison" },
      { name: "Max Strike", power: 100, accuracy: 90, type: "normal" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  851: {
    name: "Gigantamax Centiskorch",
    gmaxMoves: [
      { name: "G-Max Centiferno", power: 130, accuracy: 95, type: "fire" },
      { name: "Max Flutterby", power: 110, accuracy: 90, type: "bug" },
      { name: "Max Ooze", power: 100, accuracy: 90, type: "poison" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  858: {
    name: "Gigantamax Hatterene",
    gmaxMoves: [
      { name: "G-Max Smite", power: 130, accuracy: 95, type: "fairy" },
      { name: "Max Mindstorm", power: 120, accuracy: 90, type: "psychic" },
      { name: "Max Darkness", power: 100, accuracy: 90, type: "dark" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  861: {
    name: "Gigantamax Grimmsnarl",
    gmaxMoves: [
      { name: "G-Max Snooze", power: 130, accuracy: 95, type: "dark" },
      { name: "Max Starfall", power: 120, accuracy: 90, type: "fairy" },
      { name: "Max Knuckle", power: 100, accuracy: 90, type: "fighting" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  869: {
    name: "Gigantamax Alcremie",
    gmaxMoves: [
      { name: "G-Max Finale", power: 130, accuracy: 95, type: "fairy" },
      { name: "Max Mindstorm", power: 110, accuracy: 90, type: "psychic" },
      { name: "Max Starfall", power: 100, accuracy: 90, type: "fairy" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  879: {
    name: "Gigantamax Copperajah",
    gmaxMoves: [
      { name: "G-Max Steelsurge", power: 130, accuracy: 95, type: "steel" },
      { name: "Max Quake", power: 120, accuracy: 90, type: "ground" },
      { name: "Max Rockfall", power: 100, accuracy: 90, type: "rock" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  884: {
    name: "Gigantamax Duraludon",
    gmaxMoves: [
      { name: "G-Max Depletion", power: 130, accuracy: 95, type: "dragon" },
      { name: "Max Steelspike", power: 120, accuracy: 90, type: "steel" },
      { name: "Max Darkness", power: 100, accuracy: 90, type: "dark" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  },
  892: {
    name: "Gigantamax Urshifu",
    gmaxMoves: [
      { name: "G-Max One Blow", power: 160, accuracy: 95, type: "dark" },
      { name: "Max Knuckle", power: 130, accuracy: 90, type: "fighting" },
      { name: "Max Airstream", power: 110, accuracy: 90, type: "flying" },
      { name: "Max Guard", power: 0, accuracy: 100, type: "normal", isProtect: true }
    ]
  }
};

function canMegaEvolve(pokemonId) {
  return MEGA_POKEMON[pokemonId] || PRIMAL_POKEMON[pokemonId] || null;
}

function canGmax(pokemonId) {
  return GMAX_POKEMON[pokemonId] || null;
}

function getMegaData(pokemonId) {
  if (PRIMAL_POKEMON[pokemonId]) return { ...PRIMAL_POKEMON[pokemonId], isPrimal: true };
  if (MEGA_POKEMON[pokemonId]) return { ...MEGA_POKEMON[pokemonId], isPrimal: false };
  return null;
}

function getGmaxData(pokemonId) {
  return GMAX_POKEMON[pokemonId] || null;
}

function getGmaxMoves(pokemonId) {
  const data = GMAX_POKEMON[pokemonId];
  if (!data || !data.gmaxMoves) return null;
  return data.gmaxMoves;
}

module.exports = { MEGA_POKEMON, PRIMAL_POKEMON, GMAX_POKEMON, canMegaEvolve, canGmax, getMegaData, getGmaxData, getGmaxMoves };
