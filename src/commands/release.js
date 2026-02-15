const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById } = require("../data/pokemonLoader");
const { capitalize } = require("../utils/helpers");

async function execute(message, args) {
  const userId = message.author.id;

  if (!args.length || isNaN(args[0])) {
    return message.reply("Usage: `p!release <pokemon id>`");
  }

  const pokemonDbId = parseInt(args[0]);
  const result = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);

  if (result.rows.length === 0) {
    return message.reply("That Pokemon was not found in your collection.");
  }

  if (result.rows[0].favorite) {
    return message.reply("You cannot release a favorited Pokemon! Unfavorite it first.");
  }

  const user = await pool.query("SELECT selected_pokemon_id FROM users WHERE user_id = $1", [userId]);
  if (user.rows[0].selected_pokemon_id === pokemonDbId) {
    return message.reply("You cannot release your selected Pokemon! Select a different one first.");
  }

  const p = result.rows[0];
  const data = getPokemonById(p.pokemon_id);
  const name = p.nickname || (data ? capitalize(data.name) : `#${p.pokemon_id}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("release_confirm").setLabel("Confirm Release").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("release_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );

  const embed = new EmbedBuilder()
    .setTitle("Release Pokemon?")
    .setDescription(`Are you sure you want to release **${name}** (Level ${p.level})?\nThis action cannot be undone!`)
    .setColor(0xff0000);

  const reply = await message.reply({ embeds: [embed], components: [row] });

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === userId,
    time: 30000,
    max: 1
  });

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "release_confirm") {
      await pool.query("DELETE FROM pokemon WHERE id = $1", [pokemonDbId]);
      await interaction.update({
        embeds: [new EmbedBuilder().setDescription(`**${name}** has been released. Goodbye! 👋`).setColor(0xff0000)],
        components: []
      });
    } else {
      await interaction.update({
        embeds: [new EmbedBuilder().setDescription("Release cancelled.").setColor(0x00ff00)],
        components: []
      });
    }
  });
}

module.exports = { name: "release", aliases: ["rel"], description: "Release a Pokemon", execute };
