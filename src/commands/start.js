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
      "First, choose your region!\n\n" +
      Object.entries(STARTER_REGIONS).map(([key, region]) =>
        `**${region.name}**: ${region.starters.map(s => s.name).join(", ")}`
      ).join("\n")
    )
    .setColor(0xe74c3c)
    .setFooter({ text: "Step 1: Select a region" });

  const regionOptions = Object.entries(STARTER_REGIONS).map(([key, region]) => ({
    label: region.name,
    description: `Starters: ${region.starters.map(s => s.name).join(", ")}`,
    value: `region_${key}`
  }));

  const regionRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("region_select")
      .setPlaceholder("Choose your region!")
      .addOptions(regionOptions)
  );

  const reply = await message.reply({ embeds: [embed], components: [regionRow] });

  const regionCollector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === userId && i.customId === "region_select",
    time: 60000,
    max: 1
  });

  regionCollector.on("collect", async (regionInteraction) => {
    const regionKey = regionInteraction.values[0].replace("region_", "");
    const region = STARTER_REGIONS[regionKey];

    const starterEmbed = new EmbedBuilder()
      .setTitle(`${region.name} Region Starters`)
      .setDescription(`Choose your starter Pokemon from **${region.name}**!`)
      .setColor(0x3498db)
      .setFooter({ text: "Step 2: Select your starter" });

    const starterOptions = region.starters.map(s => ({
      label: s.name,
      description: `${region.name} starter - Pokemon #${s.id}`,
      value: `starter_${s.id}`
    }));

    const starterRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("starter_select")
        .setPlaceholder("Choose your starter!")
        .addOptions(starterOptions)
    );

    await regionInteraction.update({ embeds: [starterEmbed], components: [starterRow] });

    const starterCollector = reply.createMessageComponentCollector({
      filter: (i) => i.user.id === userId && i.customId === "starter_select",
      time: 60000,
      max: 1
    });

    starterCollector.on("collect", async (interaction) => {
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
      await pool.query("INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, pokemonId]);

      const { getPokemonById } = require("../data/pokemonLoader");
      const pokemonInfo = getPokemonById(pokemonId);
      const iv = totalIV(ivs);

      const confirmEmbed = new EmbedBuilder()
        .setTitle("Congratulations, Trainer!")
        .setDescription(
          `You chose **${pokemonInfo ? pokemonInfo.name.charAt(0).toUpperCase() + pokemonInfo.name.slice(1) : `Pokemon #${pokemonId}`}** as your starter!\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `**Level:** 5\n**IV:** ${iv}%\n**Nature:** ${nature}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `You also received **1,000** Cybercoins to start with!\n\n` +
          `Use \`p!pokemon\` to view your collection.\nUse \`p!profile\` to see your trainer card.\nUse \`p!help\` to see all available commands.`
        )
        .setThumbnail(getPokemonImage(pokemonId))
        .setColor(0x2ecc71);

      await interaction.update({ embeds: [confirmEmbed], components: [] });
    });
  });

  regionCollector.on("end", (collected) => {
    if (collected.size === 0) {
      reply.edit({ components: [], content: "Starter selection timed out. Use `p!start` again." }).catch(() => {});
    }
  });
}

module.exports = { name: "start", description: "Start your Pokemon journey", execute };
