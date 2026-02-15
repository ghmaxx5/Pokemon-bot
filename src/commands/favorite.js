const { pool } = require("../database");
const { getPokemonById } = require("../data/pokemonLoader");
const { capitalize } = require("../utils/helpers");

async function execute(message, args) {
  const userId = message.author.id;

  if (!args.length || isNaN(args[0])) {
    return message.reply("Usage: `p!favorite <pokemon id>`");
  }

  const pokemonDbId = parseInt(args[0]);
  const result = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);

  if (result.rows.length === 0) {
    return message.reply("That Pokemon was not found in your collection.");
  }

  const newFav = !result.rows[0].favorite;
  await pool.query("UPDATE pokemon SET favorite = $1 WHERE id = $2", [newFav, pokemonDbId]);

  const data = getPokemonById(result.rows[0].pokemon_id);
  const name = result.rows[0].nickname || (data ? capitalize(data.name) : `#${result.rows[0].pokemon_id}`);

  message.reply(newFav ? `❤️ **${name}** has been favorited!` : `💔 **${name}** has been unfavorited.`);
}

module.exports = { name: "favorite", aliases: ["fav", "unfavorite", "unfav"], description: "Toggle favorite on a Pokemon", execute };
