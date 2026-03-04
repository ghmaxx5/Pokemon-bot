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
    pokemonByName.set(p.name.toLowerCase(), p);
  }
  return pokemonData;
}

function getPokemonById(id) {
  if (!pokemonData) loadPokemonData();
  return pokemonData.get(id);
}

function getPokemonByName(name) {
  if (!pokemonByName) loadPokemonData();
  return pokemonByName.get(name.toLowerCase());
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
  const results = [];
  for (const [name, data] of pokemonByName) {
    if (name.includes(query.toLowerCase())) results.push(data);
  }
  return results;
}

function getAllPokemon() {
  if (!pokemonData) loadPokemonData();
  return pokemonData;
}

function getPokemonImage(id, shiny = false) {
  // Event pokemon use their base form's image from PokeAPI
  const p = pokemonData ? pokemonData.get(id) : null;
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
