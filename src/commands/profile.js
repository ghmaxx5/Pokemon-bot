const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage, getAllPokemon } = require("../data/pokemonLoader");
const { capitalize, totalIV, getTypeEmoji } = require("../utils/helpers");

async function execute(message, args) {
  const target = message.mentions.users.first() || message.author;
  const userId = target.id;

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) {
    return message.reply(target.id === message.author.id ? "You haven't started yet! Use `c!start` to begin." : "That user hasn't started yet.");
  }

  const u = user.rows[0];

  const [pokemonCount, shinyCount, legendaryCount, mythicalCount, dexCount, selectedPoke, totalPokemon, favCount, topIV, inventory] = await Promise.all([
    pool.query("SELECT COUNT(*) as count FROM pokemon WHERE user_id = $1", [userId]),
    pool.query("SELECT COUNT(*) as count FROM pokemon WHERE user_id = $1 AND shiny = TRUE", [userId]),
    pool.query("SELECT p.pokemon_id FROM pokemon p WHERE p.user_id = $1", [userId]).then(r => {
      return r.rows.filter(p => { const d = getPokemonById(p.pokemon_id); return d && d.isLegendary; }).length;
    }),
    pool.query("SELECT p.pokemon_id FROM pokemon p WHERE p.user_id = $1", [userId]).then(r => {
      return r.rows.filter(p => { const d = getPokemonById(p.pokemon_id); return d && d.isMythical; }).length;
    }),
    pool.query("SELECT COUNT(DISTINCT pokemon_id) as count FROM pokedex WHERE user_id = $1", [userId]),
    u.selected_pokemon_id ? pool.query("SELECT * FROM pokemon WHERE id = $1", [u.selected_pokemon_id]) : { rows: [] },
    getAllPokemon(),
    pool.query("SELECT COUNT(*) as count FROM pokemon WHERE user_id = $1 AND favorite = TRUE", [userId]),
    pool.query("SELECT *, (iv_hp + iv_atk + iv_def + iv_spatk + iv_spdef + iv_spd) as total_iv FROM pokemon WHERE user_id = $1 ORDER BY total_iv DESC LIMIT 1", [userId]),
    pool.query("SELECT * FROM user_inventory WHERE user_id = $1 AND quantity > 0", [userId])
  ]);

  const totalCount = parseInt(pokemonCount.rows[0].count);
  const shinies = parseInt(shinyCount.rows[0].count);
  const dex = parseInt(dexCount.rows[0].count);
  const favs = parseInt(favCount.rows[0].count);
  const totalDex = totalPokemon.size;

  const daysSinceJoin = Math.floor((Date.now() - new Date(u.created_at).getTime()) / 86400000);

  let selectedInfo = "None selected";
  let thumbnail = null;
  if (selectedPoke.rows.length > 0) {
    const sp = selectedPoke.rows[0];
    const spData = getPokemonById(sp.pokemon_id);
    if (spData) {
      const spName = sp.nickname || capitalize(spData.name);
      const spIV = totalIV({ hp: sp.iv_hp, atk: sp.iv_atk, def: sp.iv_def, spatk: sp.iv_spatk, spdef: sp.iv_spdef, spd: sp.iv_spd });
      const typeStr = spData.types.map(t => getTypeEmoji(t)).join(" ");
      const heldStr = sp.held_item ? ` | 🎒 ${sp.held_item === 'mega_stone' ? '💎 Mega Stone' : '💍 G-Max Ring'}` : "";
      selectedInfo = `${sp.shiny ? "✨ " : ""}**${spName}** ${typeStr}\nLv. ${sp.level} | IV: ${spIV}% | ${sp.nature}${heldStr}`;
      thumbnail = getPokemonImage(sp.pokemon_id, sp.shiny);
    }
  }

  let bestPokeStr = "None";
  if (topIV.rows.length > 0) {
    const bp = topIV.rows[0];
    const bpData = getPokemonById(bp.pokemon_id);
    if (bpData) {
      const bpIV = totalIV({ hp: bp.iv_hp, atk: bp.iv_atk, def: bp.iv_def, spatk: bp.iv_spatk, spdef: bp.iv_spdef, spd: bp.iv_spd });
      bestPokeStr = `${bp.shiny ? "✨ " : ""}**${bp.nickname || capitalize(bpData.name)}** (${bpIV}% IV)`;
    }
  }

  let inventoryStr = "";
  if (inventory.rows.length > 0) {
    const { SHOP_ITEMS } = require("../data/shopItems");
    inventoryStr = inventory.rows.map(r => {
      const item = SHOP_ITEMS[r.item_id];
      return item ? `${item.emoji} ${item.name} x${r.quantity}` : "";
    }).filter(Boolean).join(" | ");
  }

  const embed = new EmbedBuilder()
    .setTitle(`${target.username}'s Trainer Profile`)
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎮 **Trainer Info**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      { name: "💰 Balance", value: `**${u.balance.toLocaleString()}** Cybercoins`, inline: true },
      { name: "📅 Joined", value: `${daysSinceJoin} days ago`, inline: true },
      { name: "📦 Total Pokemon", value: `**${totalCount}**`, inline: true },
      { name: "✨ Shinies", value: `**${shinies}**`, inline: true },
      { name: "🌟 Legendaries", value: `**${legendaryCount}**`, inline: true },
      { name: "💫 Mythicals", value: `**${mythicalCount}**`, inline: true },
      { name: "📖 Pokedex", value: `**${dex}/${totalDex}** (${((dex / totalDex) * 100).toFixed(1)}%)`, inline: true },
      { name: "❤️ Favorites", value: `**${favs}**`, inline: true },
      { name: "🏆 Best Pokemon", value: bestPokeStr, inline: true },
      { name: "\u200B", value: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⚔️ **Selected Pokemon**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, inline: false },
      { name: "\u200B", value: selectedInfo, inline: false }
    )
    .setColor(0x2f3136);

  if (inventoryStr) {
    embed.addFields({ name: "🎒 Inventory", value: inventoryStr, inline: false });
  }

  if (thumbnail) embed.setThumbnail(thumbnail);
  embed.setFooter({ text: `Trainer ID: ${userId}` });

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "profile", aliases: ["prof", "trainer", "me"], description: "View your trainer profile", execute };
