const { pool } = require("../database");
const { getPokemonById } = require("../data/pokemonLoader");
const { capitalize } = require("../utils/helpers");

async function execute(message, args) {
  const userId = message.author.id;

  if (!args.length) {
    return message.reply("Usage: `p!order <pokemon id> <new number>`\nReorder a Pokemon in your collection.");
  }

  return message.reply("Use `p!pokemon --iv` to sort by IV, `p!pokemon --level` to sort by level.");
}

module.exports = { name: "order", aliases: ["reorder", "sort"], description: "Sort your Pokemon collection", execute };
