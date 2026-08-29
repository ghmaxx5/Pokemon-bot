const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { capitalize } = require("../utils/helpers");
const { TIERS } = require("../data/rarity");
const C = require("../utils/collection");

const PER_PAGE = 20;
const COLLECTOR_TIMEOUT = 180_000;

function renderPage(rows, page, totalPages) {
  const start = (page - 1) * PER_PAGE;
  return rows.slice(start, start + PER_PAGE);
}

function buildDescription(items, selectedId) {
  if (items.length === 0) return "*Nothing on this page.*";
  return items.map(p => {
    const name = p.nickname || capitalize(p._species);
    const shiny = p.shiny ? "✨ " : "";
    const fav = p.favorite ? " ❤️" : "";
    const held = p.held_item ? " 🎒" : "";
    const selected = p.id === selectedId ? " ◀️" : "";
    const tier = TIERS[p._rarity];
    const rarity = tier && p._rarity !== "common" ? ` ${tier.emoji}` : "";
    // `p.position` is the id-ASC position, so it's the number every other
    // command (info / release / trade / market) accepts.
    return `\`${String(p.position).padStart(4)}\` ${shiny}**${name}**${fav}${held}${rarity} · Lv. ${p.level} · IV ${p._iv}%${selected}`;
  }).join("\n");
}

function buildRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("pk_first").setLabel("«").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId("pk_prev").setLabel("◀ Prev").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId("pk_page").setLabel(`${page} / ${totalPages}`).setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId("pk_next").setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages),
    new ButtonBuilder().setCustomId("pk_last").setLabel("»").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
  );
}

async function execute(message, args, spawns, prefix) {
  const userId = message.author.id;

  const user = await pool.query(
    "SELECT selected_pokemon_id FROM users WHERE user_id = $1 AND started = TRUE",
    [userId]
  );
  if (user.rows.length === 0) {
    return message.reply(`You haven't started yet! Use \`${prefix}start\` to begin.`);
  }
  const selectedId = user.rows[0].selected_pokemon_id;

  const { page: requestedPage, sort, filters, unknown } = C.parseCollectionArgs(args);
  // A bare word is treated as a name search, so `c!pokemon pikachu` works.
  if (!filters.name && unknown.length > 0) filters.name = unknown.join(" ").toLowerCase();

  const activeSort = sort || (await C.getUserSort(userId));

  const all = await C.fetchCollection(userId);
  if (all.length === 0) {
    return message.reply(`You don't have any Pokémon yet! Catch some, or use \`${prefix}start\`.`);
  }

  const rows = C.applySort(C.applyFilters(all, filters), activeSort);
  if (rows.length === 0) {
    const desc = C.describeFilters(filters);
    return message.reply(`No Pokémon matched${desc ? ` \`${desc}\`` : " your filters"}. You own **${all.length}**.`);
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  let page = Math.min(requestedPage, totalPages);

  const filterText = C.describeFilters(filters);
  const embed = new EmbedBuilder()
    .setTitle(`${message.author.username}'s Pokémon`)
    .setDescription(buildDescription(renderPage(rows, page, totalPages), selectedId))
    .setColor(0x3498db)
    .setFooter({
      text: [
        `${rows.length}${rows.length !== all.length ? ` of ${all.length}` : ""} Pokémon`,
        `sorted by ${C.sortLabel(activeSort)}`,
        filterText ? `filtered: ${filterText}` : null,
        `page ${page}/${totalPages}`
      ].filter(Boolean).join(" • ")
    });

  const reply = await message.reply({
    embeds: [embed],
    components: totalPages > 1 ? [buildRow(page, totalPages)] : []
  });

  if (totalPages <= 1) return;

  const collector = reply.createMessageComponentCollector({
    filter: i => i.customId.startsWith("pk_"),
    time: COLLECTOR_TIMEOUT
  });

  collector.on("collect", async (interaction) => {
    if (interaction.user.id !== userId) {
      return interaction.reply({ content: "This isn't your collection — run the command yourself!", ephemeral: true }).catch(() => {});
    }

    if (interaction.customId === "pk_first") page = 1;
    else if (interaction.customId === "pk_prev") page = Math.max(1, page - 1);
    else if (interaction.customId === "pk_next") page = Math.min(totalPages, page + 1);
    else if (interaction.customId === "pk_last") page = totalPages;

    embed.setDescription(buildDescription(renderPage(rows, page, totalPages), selectedId));
    embed.setFooter({
      text: [
        `${rows.length}${rows.length !== all.length ? ` of ${all.length}` : ""} Pokémon`,
        `sorted by ${C.sortLabel(activeSort)}`,
        filterText ? `filtered: ${filterText}` : null,
        `page ${page}/${totalPages}`
      ].filter(Boolean).join(" • ")
    });

    await interaction.update({ embeds: [embed], components: [buildRow(page, totalPages)] }).catch(() => {});
  });

  collector.on("end", () => {
    reply.edit({ components: [] }).catch(() => {});
  });
}

module.exports = {
  name: "pokemon",
  aliases: ["p", "pk", "list"],
  description: "View your Pokémon collection with filters and sorting",
  execute
};
