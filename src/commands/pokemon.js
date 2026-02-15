const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById } = require("../data/pokemonLoader");
const { capitalize, totalIV } = require("../utils/helpers");

async function execute(message, args) {
  const userId = message.author.id;

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) {
    return message.reply("You haven't started yet! Use `p!start` to begin.");
  }

  let page = 1;
  let searchName = null;
  let filterType = null;
  let filterShiny = null;
  let filterFavorite = null;
  let filterLegendary = null;
  let filterMythical = null;
  let orderBy = "id ASC";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i].toLowerCase();
    if (arg === "--page" && args[i + 1]) { page = parseInt(args[i + 1]); i++; }
    else if (arg === "--name" && args[i + 1]) { searchName = args[i + 1].toLowerCase(); i++; }
    else if (arg === "--type" && args[i + 1]) { filterType = args[i + 1].toLowerCase(); i++; }
    else if (arg === "--shiny") filterShiny = true;
    else if (arg === "--fav" || arg === "--favorite") filterFavorite = true;
    else if (arg === "--legendary") filterLegendary = true;
    else if (arg === "--mythical") filterMythical = true;
    else if (arg === "--iv") orderBy = "total_iv DESC";
    else if (arg === "--level") orderBy = "level DESC";
    else if (arg === "--name") orderBy = "pokemon_id ASC";
    else if (!isNaN(arg)) page = parseInt(arg);
  }

  let query = `SELECT *, (iv_hp + iv_atk + iv_def + iv_spatk + iv_spdef + iv_spd) as total_iv_raw FROM pokemon WHERE user_id = $1`;
  const params = [userId];
  let paramIdx = 2;

  if (filterShiny) { query += ` AND shiny = TRUE`; }
  if (filterFavorite) { query += ` AND favorite = TRUE`; }

  query += ` ORDER BY ${orderBy}`;

  const result = await pool.query(query, params);
  let pokemonList = result.rows;

  if (searchName) {
    pokemonList = pokemonList.filter(p => {
      const data = getPokemonById(p.pokemon_id);
      return data && data.name.toLowerCase().includes(searchName);
    });
  }
  if (filterType) {
    pokemonList = pokemonList.filter(p => {
      const data = getPokemonById(p.pokemon_id);
      return data && data.types.includes(filterType);
    });
  }
  if (filterLegendary) {
    pokemonList = pokemonList.filter(p => {
      const data = getPokemonById(p.pokemon_id);
      return data && data.isLegendary;
    });
  }
  if (filterMythical) {
    pokemonList = pokemonList.filter(p => {
      const data = getPokemonById(p.pokemon_id);
      return data && data.isMythical;
    });
  }

  if (pokemonList.length === 0) {
    return message.reply("No Pokemon found matching your criteria.");
  }

  const perPage = 20;
  const totalPages = Math.ceil(pokemonList.length / perPage);
  page = Math.max(1, Math.min(page, totalPages));
  const start = (page - 1) * perPage;
  const pageItems = pokemonList.slice(start, start + perPage);

  const selectedId = user.rows[0].selected_pokemon_id;

  let description = "";
  for (const p of pageItems) {
    const data = getPokemonById(p.pokemon_id);
    const name = p.nickname || (data ? capitalize(data.name) : `#${p.pokemon_id}`);
    const shiny = p.shiny ? " ✨" : "";
    const fav = p.favorite ? " ❤️" : "";
    const selected = p.id === selectedId ? " ◀️" : "";
    const iv = ((p.iv_hp + p.iv_atk + p.iv_def + p.iv_spatk + p.iv_spdef + p.iv_spd) / 186 * 100).toFixed(2);
    description += `**${p.id}** — ${shiny}**${name}**${fav} | Lv. ${p.level} | IV: ${iv}%${selected}\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${message.author.username}'s Pokemon`)
    .setDescription(description)
    .setFooter({ text: `Showing ${start + 1}-${Math.min(start + perPage, pokemonList.length)} of ${pokemonList.length} Pokemon | Page ${page}/${totalPages}` })
    .setColor(0x3498db);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("pokemon_prev").setLabel("◀ Previous").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId("pokemon_next").setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
  );

  const reply = await message.reply({ embeds: [embed], components: [row] });

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === userId,
    time: 120000
  });

  let currentPage = page;

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "pokemon_prev") currentPage--;
    else if (interaction.customId === "pokemon_next") currentPage++;

    currentPage = Math.max(1, Math.min(currentPage, totalPages));
    const newStart = (currentPage - 1) * perPage;
    const newItems = pokemonList.slice(newStart, newStart + perPage);

    let newDesc = "";
    for (const p of newItems) {
      const data = getPokemonById(p.pokemon_id);
      const name = p.nickname || (data ? capitalize(data.name) : `#${p.pokemon_id}`);
      const shiny = p.shiny ? " ✨" : "";
      const fav = p.favorite ? " ❤️" : "";
      const selected = p.id === selectedId ? " ◀️" : "";
      const iv = ((p.iv_hp + p.iv_atk + p.iv_def + p.iv_spatk + p.iv_spdef + p.iv_spd) / 186 * 100).toFixed(2);
      newDesc += `**${p.id}** — ${shiny}**${name}**${fav} | Lv. ${p.level} | IV: ${iv}%${selected}\n`;
    }

    embed.setDescription(newDesc);
    embed.setFooter({ text: `Showing ${newStart + 1}-${Math.min(newStart + perPage, pokemonList.length)} of ${pokemonList.length} Pokemon | Page ${currentPage}/${totalPages}` });

    const newRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("pokemon_prev").setLabel("◀ Previous").setStyle(ButtonStyle.Secondary).setDisabled(currentPage <= 1),
      new ButtonBuilder().setCustomId("pokemon_next").setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= totalPages)
    );

    await interaction.update({ embeds: [embed], components: [newRow] });
  });

  collector.on("end", () => {
    reply.edit({ components: [] }).catch(() => {});
  });
}

module.exports = { name: "pokemon", aliases: ["p"], description: "View your Pokemon collection", execute };
