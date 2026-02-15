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
  const ids = Array.from(pokemonData.keys());
  const id = ids[Math.floor(Math.random() * ids.length)];
  return pokemonData.get(id);
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
  if (shiny) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${id}.png`;
  }
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

module.exports = {
  loadPokemonData, getPokemonById, getPokemonByName,
  getRandomPokemon, searchPokemon, getAllPokemon, getPokemonImage
};
