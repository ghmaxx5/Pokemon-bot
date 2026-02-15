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
  3: { name: "Gigantamax Venusaur", gmaxMove: { name: "G-Max Vine Lash", power: 130, type: "grass" } },
  6: { name: "Gigantamax Charizard", gmaxMove: { name: "G-Max Wildfire", power: 130, type: "fire" } },
  9: { name: "Gigantamax Blastoise", gmaxMove: { name: "G-Max Cannonade", power: 130, type: "water" } },
  12: { name: "Gigantamax Butterfree", gmaxMove: { name: "G-Max Befuddle", power: 110, type: "bug" } },
  25: { name: "Gigantamax Pikachu", gmaxMove: { name: "G-Max Volt Crash", power: 130, type: "electric" } },
  52: { name: "Gigantamax Meowth", gmaxMove: { name: "G-Max Gold Rush", power: 110, type: "normal" } },
  68: { name: "Gigantamax Machamp", gmaxMove: { name: "G-Max Chi Strike", power: 130, type: "fighting" } },
  94: { name: "Gigantamax Gengar", gmaxMove: { name: "G-Max Terror", power: 130, type: "ghost" } },
  99: { name: "Gigantamax Kingler", gmaxMove: { name: "G-Max Foam Burst", power: 130, type: "water" } },
  131: { name: "Gigantamax Lapras", gmaxMove: { name: "G-Max Resonance", power: 130, type: "ice" } },
  133: { name: "Gigantamax Eevee", gmaxMove: { name: "G-Max Cuddle", power: 110, type: "normal" } },
  143: { name: "Gigantamax Snorlax", gmaxMove: { name: "G-Max Replenish", power: 130, type: "normal" } },
  569: { name: "Gigantamax Garbodor", gmaxMove: { name: "G-Max Malodor", power: 130, type: "poison" } },
  809: { name: "Gigantamax Melmetal", gmaxMove: { name: "G-Max Meltdown", power: 130, type: "steel" } },
  812: { name: "Gigantamax Rillaboom", gmaxMove: { name: "G-Max Drum Solo", power: 160, type: "grass" } },
  815: { name: "Gigantamax Cinderace", gmaxMove: { name: "G-Max Fireball", power: 160, type: "fire" } },
  818: { name: "Gigantamax Inteleon", gmaxMove: { name: "G-Max Hydrosnipe", power: 160, type: "water" } },
  823: { name: "Gigantamax Corviknight", gmaxMove: { name: "G-Max Wind Rage", power: 130, type: "flying" } },
  826: { name: "Gigantamax Orbeetle", gmaxMove: { name: "G-Max Gravitas", power: 130, type: "psychic" } },
  834: { name: "Gigantamax Drednaw", gmaxMove: { name: "G-Max Stonesurge", power: 130, type: "water" } },
  839: { name: "Gigantamax Coalossal", gmaxMove: { name: "G-Max Volcalith", power: 130, type: "rock" } },
  841: { name: "Gigantamax Flapple", gmaxMove: { name: "G-Max Tartness", power: 130, type: "grass" } },
  842: { name: "Gigantamax Appletun", gmaxMove: { name: "G-Max Sweetness", power: 130, type: "grass" } },
  844: { name: "Gigantamax Sandaconda", gmaxMove: { name: "G-Max Sandblast", power: 130, type: "ground" } },
  849: { name: "Gigantamax Toxtricity", gmaxMove: { name: "G-Max Stun Shock", power: 130, type: "electric" } },
  851: { name: "Gigantamax Centiskorch", gmaxMove: { name: "G-Max Centiferno", power: 130, type: "fire" } },
  858: { name: "Gigantamax Hatterene", gmaxMove: { name: "G-Max Smite", power: 130, type: "fairy" } },
  861: { name: "Gigantamax Grimmsnarl", gmaxMove: { name: "G-Max Snooze", power: 130, type: "dark" } },
  869: { name: "Gigantamax Alcremie", gmaxMove: { name: "G-Max Finale", power: 130, type: "fairy" } },
  879: { name: "Gigantamax Copperajah", gmaxMove: { name: "G-Max Steelsurge", power: 130, type: "steel" } },
  884: { name: "Gigantamax Duraludon", gmaxMove: { name: "G-Max Depletion", power: 130, type: "dragon" } },
  892: { name: "Gigantamax Urshifu", gmaxMove: { name: "G-Max One Blow", power: 160, type: "dark" } }
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

module.exports = { MEGA_POKEMON, PRIMAL_POKEMON, GMAX_POKEMON, canMegaEvolve, canGmax, getMegaData, getGmaxData };
