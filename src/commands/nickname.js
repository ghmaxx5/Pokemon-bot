const { pool } = require("../database");
const { getPokemonById } = require("../data/pokemonLoader");
const { capitalize } = require("../utils/helpers");

async function execute(message, args, spawns, prefix) {
  const userId = message.author.id;

  if (args.length < 1) {
    return message.reply(`Usage: \`${prefix}nickname <pokemon number> [new name]\` or \`${prefix}nickname <pokemon number> reset\``);
  }

  const position = parseInt(args[0]);
  if (isNaN(position)) return message.reply("Please provide a valid Pokemon position number.");

  const { getPokemonIdByPosition } = require("../utils/positionHelper");
  const pokemonDbId = await getPokemonIdByPosition(userId, position);
  if (!pokemonDbId) {
    return message.reply("That Pokemon was not found in your collection.");
  }

  const result = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
  if (result.rows.length === 0) {
    return message.reply("That Pokemon was not found in your collection.");
  }

  const data = getPokemonById(result.rows[0].pokemon_id);
  const originalName = data ? capitalize(data.name) : `#${result.rows[0].pokemon_id}`;

  if (args.length === 1 || args[1].toLowerCase() === "reset") {
    await pool.query("UPDATE pokemon SET nickname = NULL WHERE id = $1", [pokemonDbId]);
    return message.reply(`Nickname for **${originalName}** has been reset.`);
  }

  const nickname = args.slice(1).join(" ").substring(0, 30);
  await pool.query("UPDATE pokemon SET nickname = $1 WHERE id = $2", [nickname, pokemonDbId]);
  message.reply(`**${originalName}** is now nicknamed **${nickname}**!`);
}

module.exports = { name: "nickname", aliases: ["nick", "nn"], description: "Set a nickname for your Pokemon", execute };
