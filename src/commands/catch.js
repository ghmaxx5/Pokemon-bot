const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage } = require("../data/pokemonLoader");
const { generateIVs, randomNature, totalIV, capitalize } = require("../utils/helpers");

const BASE_SHINY_RATE = 1 / 4096;
const BOOSTED_SHINY_RATE = 1 / 2048;

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

  const masterBall = await pool.query(
    "SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = 'master_ball' AND quantity > 0",
    [userId]
  );
  const hasMasterBall = masterBall.rows.length > 0 && masterBall.rows[0].quantity > 0;
  const usingMasterBall = guess === "master ball" || guess === "masterball";

  if (usingMasterBall) {
    if (!hasMasterBall) {
      return message.reply("You don't have a Master Ball! Buy one from the shop with `p!shop buy master ball`.");
    }
    await pool.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = 'master_ball'", [userId]);
    await pool.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = 'master_ball' AND quantity <= 0", [userId]);
  } else if (guess !== pokemonInfo.name.toLowerCase()) {
    return message.reply("That is not the right Pokemon!");
  }

  spawns.delete(channelId);

  const shinyCharm = await pool.query(
    "SELECT id, uses_left FROM user_boosts WHERE user_id = $1 AND boost_type = 'shiny_charm' AND uses_left > 0 ORDER BY id LIMIT 1",
    [userId]
  );
  let shinyRate = BASE_SHINY_RATE;
  let usedCharm = false;
  if (shinyCharm.rows.length > 0) {
    shinyRate = BOOSTED_SHINY_RATE;
    usedCharm = true;
    const newUses = shinyCharm.rows[0].uses_left - 1;
    if (newUses <= 0) {
      await pool.query("DELETE FROM user_boosts WHERE id = $1", [shinyCharm.rows[0].id]);
    } else {
      await pool.query("UPDATE user_boosts SET uses_left = $1 WHERE id = $2", [newUses, shinyCharm.rows[0].id]);
    }
  }

  const ivs = generateIVs();
  const nature = randomNature();
  const shiny = Math.random() < shinyRate;
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

  let desc = `${message.author} caught a ${shinyText}**Level ${level} ${pokeName}**!\n\n` +
    `**IV:** ${iv}%\n**Nature:** ${nature}`;
  if (usingMasterBall) desc = `🟣 **Master Ball used!**\n\n` + desc;
  if (usedCharm) desc += `\n✨ *Shiny Charm active (${shinyCharm.rows[0].uses_left - 1} uses left)*`;

  const embed = new EmbedBuilder()
    .setTitle(`${shinyText}${usingMasterBall ? "🟣 " : ""}Congratulations!`)
    .setDescription(desc)
    .setThumbnail(getPokemonImage(spawn.pokemonId, shiny))
    .setColor(shiny ? 0xffd700 : usingMasterBall ? 0x9b59b6 : 0x2ecc71);

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "catch", aliases: ["c"], description: "Catch a wild Pokemon", execute };
