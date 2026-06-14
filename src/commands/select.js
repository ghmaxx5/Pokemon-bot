const { pool } = require("../database");
const { getPokemonById } = require("../data/pokemonLoader");
const { capitalize } = require("../utils/helpers");
const { getPokemonIdByPosition } = require("../utils/positionHelper");

async function execute(message, args) {
  const userId = message.author.id;

  if (!args.length || isNaN(args[0])) {
    return message.reply("Usage: `c!select <pokemon number>`");
  }

  const position = parseInt(args[0]);
  const pokemonDbId = await getPokemonIdByPosition(userId, position);
  if (!pokemonDbId) {
    return message.reply("That Pokemon was not found in your collection.");
  }

  const result = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);

  await pool.query("UPDATE users SET selected_pokemon_id = $1 WHERE user_id = $2", [pokemonDbId, userId]);

  const p = result.rows[0];
  const data = getPokemonById(p.pokemon_id);
  const name = p.nickname || (data ? capitalize(data.name) : `#${p.pokemon_id}`);
  const shiny = p.shiny ? "✨ " : "";

  message.reply(`Selected ${shiny}**${name}** (Level ${p.level}) as your active Pokemon!`);
}

module.exports = { name: "select", aliases: ["s"], description: "Select your active Pokemon", execute };
