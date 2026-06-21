const { pool } = require("../database");
const { getPokemonById } = require("../data/pokemonLoader");
const { capitalize } = require("../utils/helpers");

async function execute(message, args, spawns, prefix) {
  const userId = message.author.id;

  if (!args.length) {
    return message.reply(`Usage: \`${prefix}order <pokemon id> <new number>\`\nReorder a Pokemon in your collection.`);
  }

  return message.reply(`Use \`${prefix}pokemon --iv\` to sort by IV, \`${prefix}pokemon --level\` to sort by level.`);
}

module.exports = { name: "order", aliases: ["reorder", "sort"], description: "Sort your Pokemon collection", execute };
