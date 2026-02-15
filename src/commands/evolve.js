const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonByName, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, totalIV } = require("../utils/helpers");

async function execute(message, args) {
  const userId = message.author.id;

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) return message.reply("You haven't started yet!");

  let pokemonDbId;
  if (args.length > 0 && !isNaN(args[0])) {
    pokemonDbId = parseInt(args[0]);
  } else {
    pokemonDbId = user.rows[0].selected_pokemon_id;
  }

  if (!pokemonDbId) return message.reply("Please specify a Pokemon ID or select one first.");

  const result = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
  if (result.rows.length === 0) return message.reply("That Pokemon was not found in your collection.");

  const p = result.rows[0];
  const data = getPokemonById(p.pokemon_id);
  if (!data) return message.reply("Pokemon data not found.");

  if (!data.evolutionTo || data.evolutionTo.length === 0) {
    return message.reply(`**${capitalize(data.name)}** cannot evolve!`);
  }

  const evolution = data.evolutionTo[0];
  const evoTarget = getPokemonByName(evolution.to);
  if (!evoTarget) return message.reply("Evolution data error.");

  if (evolution.level && p.level < evolution.level) {
    return message.reply(`**${capitalize(data.name)}** needs to be Level ${evolution.level} to evolve! (Currently Level ${p.level})`);
  }

  if (evolution.item) {
    return message.reply(`**${capitalize(data.name)}** needs a **${capitalize(evolution.item.replace(/-/g, " "))}** to evolve. Use \`p!evolve ${pokemonDbId} --confirm\` if you have one. (Item evolution is automatic for now)`);
  }

  const confirmed = args.includes("--confirm") || !evolution.item;
  if (evolution.level || confirmed) {
    await pool.query("UPDATE pokemon SET pokemon_id = $1, nickname = NULL WHERE id = $2", [evoTarget.id, pokemonDbId]);
    await pool.query("INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, evoTarget.id]);

    const iv = totalIV({ hp: p.iv_hp, atk: p.iv_atk, def: p.iv_def, spatk: p.iv_spatk, spdef: p.iv_spdef, spd: p.iv_spd });

    const embed = new EmbedBuilder()
      .setTitle("Congratulations! Your Pokemon evolved!")
      .setDescription(
        `**${capitalize(data.name)}** evolved into **${capitalize(evoTarget.name)}**!\n\n` +
        `**Level:** ${p.level}\n**IV:** ${iv}%`
      )
      .setThumbnail(getPokemonImage(evoTarget.id, p.shiny))
      .setColor(0x9b59b6);

    return message.channel.send({ embeds: [embed] });
  }
}

module.exports = { name: "evolve", aliases: ["ev"], description: "Evolve your Pokemon", execute };
