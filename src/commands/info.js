const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, totalIV, getTypeEmoji, getStatBar, xpForLevel } = require("../utils/helpers");
const { canMegaEvolve, canGmax, getMegaData, getGmaxData } = require("../data/mega");

async function execute(message, args) {
  const userId = message.author.id;

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) {
    return message.reply("You haven't started yet! Use `p!start` to begin.");
  }

  let pokemonDbId;
  if (args.length > 0 && args[0].toLowerCase() === "latest") {
    const result = await pool.query("SELECT id FROM pokemon WHERE user_id = $1 ORDER BY id DESC LIMIT 1", [userId]);
    if (result.rows.length === 0) return message.reply("You don't have any Pokemon!");
    pokemonDbId = result.rows[0].id;
  } else if (args.length > 0 && !isNaN(args[0])) {
    pokemonDbId = parseInt(args[0]);
  } else {
    pokemonDbId = user.rows[0].selected_pokemon_id;
  }

  if (!pokemonDbId) {
    return message.reply("Please specify a Pokemon ID or select one with `p!select <id>`.");
  }

  const result = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
  if (result.rows.length === 0) {
    return message.reply("That Pokemon was not found in your collection.");
  }

  const p = result.rows[0];
  const data = getPokemonById(p.pokemon_id);
  if (!data) return message.reply("Pokemon data not found.");

  const iv = totalIV({ hp: p.iv_hp, atk: p.iv_atk, def: p.iv_def, spatk: p.iv_spatk, spdef: p.iv_spdef, spd: p.iv_spd });
  const xpNeeded = xpForLevel(p.level);
  const shinyText = p.shiny ? " ✨" : "";
  const favText = p.favorite ? " ❤️" : "";
  const pokeName = p.nickname || capitalize(data.name);

  const typeStr = data.types.map(t => `${getTypeEmoji(t)} ${capitalize(t)}`).join(" / ");

  const xpPct = Math.round((p.xp / xpNeeded) * 20);
  const xpBar = "█".repeat(xpPct) + "░".repeat(20 - xpPct);

  let heldItemStr = "None";
  if (p.held_item === "mega_stone") heldItemStr = "💎 Mega Stone";
  else if (p.held_item === "gmax_ring") heldItemStr = "💍 Gigantamax Ring";

  const megaData = getMegaData(p.pokemon_id);
  const gmaxData = getGmaxData(p.pokemon_id);

  let compatStr = "";
  if (megaData) {
    const megaLabel = megaData.isPrimal ? "Primal Reversion" : "Mega Evolution";
    compatStr += `💎 **${megaLabel}:** ${megaData.name}\n`;
  }
  if (gmaxData) {
    compatStr += `💍 **Gigantamax:** ${gmaxData.name}\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${shinyText} ${pokeName} ${favText}`)
    .setDescription(
      `**${data.genus || "Pokemon"}** — ${typeStr}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      { name: "📊 Level", value: `**${p.level}** / 100`, inline: true },
      { name: "⭐ Total IV", value: `**${iv}%**`, inline: true },
      { name: "🎭 Nature", value: `${p.nature}`, inline: true },
      { name: "📈 Experience", value: `${xpBar} ${p.xp}/${xpNeeded}`, inline: false },
      { name: "🆔 ID", value: `${p.id}`, inline: true },
      { name: "🎒 Held Item", value: heldItemStr, inline: true },
      { name: "✨ Shiny", value: p.shiny ? "Yes" : "No", inline: true },
      { name: "\u200B", value: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n**Individual Values (IVs)**`, inline: false },
      { name: "HP", value: `\`${getStatBar(p.iv_hp)}\` **${p.iv_hp}**/31`, inline: false },
      { name: "Attack", value: `\`${getStatBar(p.iv_atk)}\` **${p.iv_atk}**/31`, inline: false },
      { name: "Defense", value: `\`${getStatBar(p.iv_def)}\` **${p.iv_def}**/31`, inline: false },
      { name: "Sp. Atk", value: `\`${getStatBar(p.iv_spatk)}\` **${p.iv_spatk}**/31`, inline: false },
      { name: "Sp. Def", value: `\`${getStatBar(p.iv_spdef)}\` **${p.iv_spdef}**/31`, inline: false },
      { name: "Speed", value: `\`${getStatBar(p.iv_spd)}\` **${p.iv_spd}**/31`, inline: false }
    )
    .setThumbnail(getPokemonImage(p.pokemon_id, p.shiny))
    .setColor(p.shiny ? 0xffd700 : 0x2f3136);

  if (compatStr) {
    embed.addFields({ name: "⚡ Battle Transformations", value: compatStr, inline: false });
  }

  if (data.description) {
    embed.addFields({ name: "📖 Pokedex Entry", value: data.description.substring(0, 1024), inline: false });
  }

  const bsTotal = data.baseStats.hp + data.baseStats.atk + data.baseStats.def + data.baseStats.spatk + data.baseStats.spdef + data.baseStats.spd;
  embed.setFooter({ text: `#${p.pokemon_id} | BST: ${bsTotal} | HP ${data.baseStats.hp} / ATK ${data.baseStats.atk} / DEF ${data.baseStats.def} / SpA ${data.baseStats.spatk} / SpD ${data.baseStats.spdef} / SPD ${data.baseStats.spd}` });

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "info", aliases: ["i"], description: "View detailed info about a Pokemon", execute };
