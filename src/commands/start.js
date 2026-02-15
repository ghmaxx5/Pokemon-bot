const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { pool } = require("../database");
const { STARTER_REGIONS } = require("../data/starters");
const { getPokemonImage } = require("../data/pokemonLoader");
const { generateIVs, randomNature, totalIV } = require("../utils/helpers");

async function execute(message, args) {
  const userId = message.author.id;

  const existing = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);
  if (existing.rows.length > 0 && existing.rows[0].started) {
    return message.reply("You have already started your journey! Use `p!pokemon` to view your collection.");
  }

  const embed = new EmbedBuilder()
    .setTitle("Welcome to the world of Pokemon!")
    .setDescription(
      "Choose your region to pick a starter Pokemon!\n\n" +
      Object.entries(STARTER_REGIONS).map(([key, region]) =>
        `**${region.name}**: ${region.starters.map(s => s.name).join(", ")}`
      ).join("\n")
    )
    .setColor(0xff0000);

  const options = [];
  for (const [key, region] of Object.entries(STARTER_REGIONS)) {
    for (const starter of region.starters) {
      options.push({
        label: starter.name,
        description: `${region.name} region starter`,
        value: `starter_${starter.id}`
      });
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("starter_select")
      .setPlaceholder("Choose your starter Pokemon!")
      .addOptions(options.slice(0, 25))
  );

  const reply = await message.reply({ embeds: [embed], components: [row] });

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === userId,
    time: 60000,
    max: 1
  });

  collector.on("collect", async (interaction) => {
    const pokemonId = parseInt(interaction.values[0].replace("starter_", ""));
    const ivs = generateIVs();
    const nature = randomNature();

    await pool.query(
      `INSERT INTO users (user_id, username, started, balance) VALUES ($1, $2, TRUE, 1000)
       ON CONFLICT (user_id) DO UPDATE SET started = TRUE, balance = 1000`,
      [userId, message.author.username]
    );

    const result = await pool.query(
      `INSERT INTO pokemon (user_id, pokemon_id, level, xp, shiny, iv_hp, iv_atk, iv_def, iv_spatk, iv_spdef, iv_spd, nature, original_owner)
       VALUES ($1, $2, 5, 0, FALSE, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [userId, pokemonId, ivs.hp, ivs.atk, ivs.def, ivs.spatk, ivs.spdef, ivs.spd, nature, userId]
    );

    await pool.query("UPDATE users SET selected_pokemon_id = $1 WHERE user_id = $2", [result.rows[0].id, userId]);

    await pool.query(
      "INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [userId, pokemonId]
    );

    const { getPokemonById } = require("../data/pokemonLoader");
    const pokemonInfo = getPokemonById(pokemonId);
    const iv = totalIV(ivs);

    const confirmEmbed = new EmbedBuilder()
      .setTitle(`Congratulations!`)
      .setDescription(
        `You chose **${pokemonInfo ? pokemonInfo.name.charAt(0).toUpperCase() + pokemonInfo.name.slice(1) : `Pokemon #${pokemonId}`}** as your starter!\n\n` +
        `**Level:** 5\n**IV:** ${iv}%\n**Nature:** ${nature}\n\n` +
        `You also received **1,000** credits to start with!\n\n` +
        `Use \`p!pokemon\` to view your collection.\nUse \`p!help\` to see all available commands.`
      )
      .setThumbnail(getPokemonImage(pokemonId))
      .setColor(0x00ff00);

    await interaction.update({ embeds: [confirmEmbed], components: [] });
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      reply.edit({ components: [], content: "Starter selection timed out. Use `p!start` again." });
    }
  });
}

module.exports = { name: "start", description: "Start your Pokemon journey", execute };
