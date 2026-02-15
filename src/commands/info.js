const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, totalIV, getTypeEmoji, getStatBar, xpForLevel } = require("../utils/helpers");

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

  const embed = new EmbedBuilder()
    .setTitle(`${shinyText}${pokeName}${favText}`)
    .setDescription(`**${data.genus || "Pokemon"}** — ${typeStr}`)
    .addFields(
      { name: "Level", value: `${p.level}`, inline: true },
      { name: "XP", value: `${p.xp}/${xpNeeded}`, inline: true },
      { name: "Nature", value: `${p.nature}`, inline: true },
      { name: "Total IV", value: `${iv}%`, inline: true },
      { name: "ID", value: `${p.id}`, inline: true },
      { name: "Shiny", value: p.shiny ? "Yes ✨" : "No", inline: true },
      { name: "\u200B", value: "**Individual Values (IVs)**", inline: false },
      { name: "HP", value: `${getStatBar(p.iv_hp)} ${p.iv_hp}/31`, inline: false },
      { name: "Attack", value: `${getStatBar(p.iv_atk)} ${p.iv_atk}/31`, inline: false },
      { name: "Defense", value: `${getStatBar(p.iv_def)} ${p.iv_def}/31`, inline: false },
      { name: "Sp. Atk", value: `${getStatBar(p.iv_spatk)} ${p.iv_spatk}/31`, inline: false },
      { name: "Sp. Def", value: `${getStatBar(p.iv_spdef)} ${p.iv_spdef}/31`, inline: false },
      { name: "Speed", value: `${getStatBar(p.iv_spd)} ${p.iv_spd}/31`, inline: false }
    )
    .setThumbnail(getPokemonImage(p.pokemon_id, p.shiny))
    .setColor(p.shiny ? 0xffd700 : 0x3498db)
    .setFooter({ text: `Pokemon #${p.pokemon_id} | Base Stats: HP ${data.baseStats.hp} / ATK ${data.baseStats.atk} / DEF ${data.baseStats.def} / SpA ${data.baseStats.spatk} / SpD ${data.baseStats.spdef} / SPD ${data.baseStats.spd}` });

  if (data.description) {
    embed.addFields({ name: "Pokedex Entry", value: data.description.substring(0, 1024), inline: false });
  }

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "info", aliases: ["i"], description: "View detailed info about a Pokemon", execute };
