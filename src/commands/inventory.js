const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");
const { SHOP_ITEMS } = require("../data/shopItems");
const { getPokemonById } = require("../data/pokemonLoader");
const { capitalize } = require("../utils/helpers");

async function execute(message, args) {
  const userId = message.author.id;

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) return message.reply("You haven't started yet! Use `start` to begin.");

  const inv = await pool.query("SELECT * FROM user_inventory WHERE user_id = $1 AND quantity > 0 ORDER BY item_id", [userId]);
  const heldPokemon = await pool.query("SELECT id, pokemon_id, nickname, held_item FROM pokemon WHERE user_id = $1 AND held_item IS NOT NULL ORDER BY id", [userId]);

  const embed = new EmbedBuilder()
    .setTitle(`🎒 ${message.author.username}'s Backpack`)
    .setColor(0x9b59b6);

  let bagItems = "";
  if (inv.rows.length === 0) {
    bagItems = "Your backpack is empty!";
  } else {
    for (const row of inv.rows) {
      const item = SHOP_ITEMS[row.item_id];
      if (item) {
        bagItems += `${item.emoji} **${item.name}** x${row.quantity}\n`;
      }
    }
  }

  embed.addFields({ name: "📦 Items", value: bagItems || "None", inline: false });

  if (heldPokemon.rows.length > 0) {
    let heldStr = "";
    for (const p of heldPokemon.rows) {
      const data = getPokemonById(p.pokemon_id);
      const name = p.nickname || (data ? capitalize(data.name) : `#${p.pokemon_id}`);
      const item = SHOP_ITEMS[p.held_item];
      const itemDisplay = item ? `${item.emoji} ${item.name}` : p.held_item;
      heldStr += `**#${p.id}** ${name} → ${itemDisplay}\n`;
    }
    embed.addFields({ name: "🔗 Held by Pokemon", value: heldStr, inline: false });
  }

  embed.setFooter({ text: "shop hold <item> <number> | shop unhold <number>" });

  return message.channel.send({ embeds: [embed] });
}

module.exports = { name: "inventory", aliases: ["inv", "bag", "backpack"], description: "View your item backpack", execute };
