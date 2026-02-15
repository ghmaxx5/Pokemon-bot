const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage } = require("../data/pokemonLoader");
const { generateIVs, randomNature, totalIV, capitalize } = require("../utils/helpers");

const SHINY_RATE = 1 / 4096;

async function execute(message, args, spawns) {
  const userId = message.author.id;
  const channelId = message.channel.id;

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) {
    return message.reply("You haven't started yet! Use `p!start` to begin your journey.");
  }

  if (!args.length) {
    return message.reply("Please specify the Pokemon name! Usage: `p!catch <name>`");
  }

  const spawn = spawns.get(channelId);
  if (!spawn) {
    return message.reply("There is no wild Pokemon here right now!");
  }

  const guess = args.join(" ").toLowerCase().trim();
  const pokemonInfo = getPokemonById(spawn.pokemonId);

  if (!pokemonInfo) return;

  if (guess !== pokemonInfo.name.toLowerCase()) {
    return message.reply("That is not the right Pokemon!");
  }

  spawns.delete(channelId);

  const ivs = generateIVs();
  const nature = randomNature();
  const shiny = Math.random() < SHINY_RATE;
  const level = Math.floor(Math.random() * 30) + 1;

  const result = await pool.query(
    `INSERT INTO pokemon (user_id, pokemon_id, level, xp, shiny, iv_hp, iv_atk, iv_def, iv_spatk, iv_spdef, iv_spd, nature, original_owner)
     VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [userId, spawn.pokemonId, level, shiny, ivs.hp, ivs.atk, ivs.def, ivs.spatk, ivs.spdef, ivs.spd, nature, userId]
  );

  await pool.query(
    "INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [userId, spawn.pokemonId]
  );

  const iv = totalIV(ivs);
  const shinyText = shiny ? "✨ ***SHINY*** ✨ " : "";
  const pokeName = capitalize(pokemonInfo.name);

  const embed = new EmbedBuilder()
    .setTitle(`${shinyText}Congratulations!`)
    .setDescription(
      `${message.author} caught a ${shinyText}**Level ${level} ${pokeName}**!\n\n` +
      `**IV:** ${iv}%\n**Nature:** ${nature}`
    )
    .setThumbnail(getPokemonImage(spawn.pokemonId, shiny))
    .setColor(shiny ? 0xffd700 : 0x00ff00);

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "catch", aliases: ["c"], description: "Catch a wild Pokemon", execute };
