const NATURES = [
  "Adamant", "Bashful", "Bold", "Brave", "Calm",
  "Careful", "Docile", "Gentle", "Hardy", "Hasty",
  "Impish", "Jolly", "Lax", "Lonely", "Mild",
  "Modest", "Naive", "Naughty", "Quiet", "Quirky",
  "Rash", "Relaxed", "Sassy", "Serious", "Timid"
];

function randomNature() {
  return NATURES[Math.floor(Math.random() * NATURES.length)];
}

function randomIV() {
  return Math.floor(Math.random() * 32);
}

function generateIVs() {
  return {
    hp: randomIV(),
    atk: randomIV(),
    def: randomIV(),
    spatk: randomIV(),
    spdef: randomIV(),
    spd: randomIV()
  };
}

function totalIV(ivs) {
  const sum = ivs.hp + ivs.atk + ivs.def + ivs.spatk + ivs.spdef + ivs.spd;
  return ((sum / 186) * 100).toFixed(2);
}

function capitalize(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function formatPokemonName(pokemon, pokemonData) {
  const data = pokemonData.get(pokemon.pokemon_id);
  const name = pokemon.nickname || (data ? capitalize(data.name) : `#${pokemon.pokemon_id}`);
  const shinyPrefix = pokemon.shiny ? "✨ " : "";
  return `${shinyPrefix}${name}`;
}

function xpForLevel(level) {
  return Math.floor(level * level * 1.5 + 50);
}

function getTypeEmoji(type) {
  const emojis = {
    normal: "⚪", fire: "🔥", water: "💧", grass: "🌿",
    electric: "⚡", ice: "❄️", fighting: "🥊", poison: "☠️",
    ground: "🌍", flying: "🦅", psychic: "🔮", bug: "🐛",
    rock: "🪨", ghost: "👻", dragon: "🐉", dark: "🌑",
    steel: "⚙️", fairy: "🧚"
  };
  return emojis[type] || "❓";
}

function getStatBar(value, max = 31) {
  const filled = Math.round((value / max) * 15);
  const empty = 15 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

function paginate(array, page, perPage = 20) {
  const start = (page - 1) * perPage;
  const end = start + perPage;
  return {
    items: array.slice(start, end),
    page,
    totalPages: Math.ceil(array.length / perPage),
    total: array.length
  };
}

module.exports = {
  NATURES, randomNature, randomIV, generateIVs, totalIV,
  capitalize, formatPokemonName, xpForLevel, getTypeEmoji,
  getStatBar, paginate
};
