const fs = require("fs");
const path = require("path");

let pokemonData = null;
let pokemonByName = null;

function loadPokemonData() {
  if (pokemonData) return pokemonData;
  const raw = fs.readFileSync(path.join(__dirname, "pokemon.json"), "utf8");
  const list = JSON.parse(raw);
  pokemonData = new Map();
  pokemonByName = new Map();
  for (const p of list) {
    pokemonData.set(p.id, p);
    const nameLower = p.name.toLowerCase();
    // Index canonical name (dashes)
    pokemonByName.set(nameLower, p);
    // Index with spaces instead of dashes
    pokemonByName.set(nameLower.replace(/-/g, " "), p);
    // Index displayName variants if present
    if (p.displayName) {
      const dl = p.displayName.toLowerCase();
      pokemonByName.set(dl, p);
      pokemonByName.set(dl.replace(/-/g, " "), p);
      // Strip parentheses: "holi spirit greninja" from "holi spirit (greninja)"
      const stripped = dl.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
      pokemonByName.set(stripped, p);
    }
  }
  return pokemonData;
}

function getPokemonById(id) {
  if (!pokemonData) loadPokemonData();
  return pokemonData.get(id);
}

function getPokemonByName(name) {
  if (!pokemonByName) loadPokemonData();
  const n = name.toLowerCase().trim();
  // Try direct, then space→dash, then dash→space
  return pokemonByName.get(n)
    || pokemonByName.get(n.replace(/\s+/g, "-"))
    || pokemonByName.get(n.replace(/-/g, " "))
    || undefined;
}

function getRandomPokemon() {
  if (!pokemonData) loadPokemonData();
  // Exclude event-only pokemon from normal spawns
  const ids = Array.from(pokemonData.keys()).filter(id => {
    const p = pokemonData.get(id);
    return !p.isEventPokemon;
  });
  const id = ids[Math.floor(Math.random() * ids.length)];
  return pokemonData.get(id);
}

function getRandomEventPokemon() {
  if (!pokemonData) loadPokemonData();
  const eventPokemon = Array.from(pokemonData.values()).filter(p => p.isEventPokemon && p.isCatchable !== false);
  if (eventPokemon.length === 0) return null;
  return eventPokemon[Math.floor(Math.random() * eventPokemon.length)];
}

function searchPokemon(query) {
  if (!pokemonByName) loadPokemonData();
  const q = query.toLowerCase();
  const seen = new Set();
  const results = [];
  for (const [name, data] of pokemonByName) {
    if (name.includes(q) && !seen.has(data.id)) {
      seen.add(data.id);
      results.push(data);
    }
  }
  return results;
}

function getAllPokemon() {
  if (!pokemonData) loadPokemonData();
  return pokemonData;
}

function getPokemonImage(id, shiny = false) {
  const p = pokemonData ? pokemonData.get(id) : null;
  // Use custom image URL if set (event/form Pokemon)
  if (p) {
    if (shiny && p.imageUrlShiny) return p.imageUrlShiny;
    if (p.imageUrl) return p.imageUrl;
  }
  const imageId = (p && p.baseForm) ? p.baseForm : id;
  if (shiny) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${imageId}.png`;
  }
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${imageId}.png`;
}

module.exports = {
  loadPokemonData, getPokemonById, getPokemonByName,
  getRandomPokemon, getRandomEventPokemon, searchPokemon, getAllPokemon, getPokemonImage
};
