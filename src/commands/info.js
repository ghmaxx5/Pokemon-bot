const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, totalIV, getTypeEmoji, getStatBar, xpForLevel } = require("../utils/helpers");
const { canMegaEvolve, canGmax, getMegaData, getGmaxData } = require("../data/mega");
const { getAvailableMoves } = require("../data/learnsets");

function getRegion(pokemonId) {
  if (pokemonId <= 151) return { name: "Kanto", gen: 1 };
  if (pokemonId <= 251) return { name: "Johto", gen: 2 };
  if (pokemonId <= 386) return { name: "Hoenn", gen: 3 };
  if (pokemonId <= 493) return { name: "Sinnoh", gen: 4 };
  if (pokemonId <= 649) return { name: "Unova", gen: 5 };
  if (pokemonId <= 721) return { name: "Kalos", gen: 6 };
  if (pokemonId <= 809) return { name: "Alola", gen: 7 };
  if (pokemonId <= 905) return { name: "Galar", gen: 8 };
  return { name: "Paldea", gen: 9 };
}

async function buildEmbed(p, data, position, total) {
  const iv = totalIV({ hp: p.iv_hp, atk: p.iv_atk, def: p.iv_def, spatk: p.iv_spatk, spdef: p.iv_spdef, spd: p.iv_spd });
  const xpNeeded = xpForLevel(p.level);
  const shinyText = p.shiny ? "✨ " : "";
  const favText = p.favorite ? " ❤️" : "";
  const pokeName = p.nickname || capitalize(data.displayName || data.name);

  const typeStr = data.types.map(t => `${getTypeEmoji(t)} ${capitalize(t)}`).join(" | ");
  const region = data.region ? { name: data.region, gen: "?" } : getRegion(p.pokemon_id);

  const xpPct = Math.round((p.xp / xpNeeded) * 20);
  const xpBar = "█".repeat(xpPct) + "░".repeat(20 - xpPct);

  let heldItemStr = "None";
  if (p.held_item === "mega_stone") heldItemStr = "💎 Mega Stone";
  else if (p.held_item === "gmax_ring") heldItemStr = "💍 Gigantamax Ring";
  else if (p.held_item === "hand_held_color_pouch") heldItemStr = "🎨 Hand-held Color Pouch *(bound)*";

  const megaData = getMegaData(p.pokemon_id);
  const gmaxData = getGmaxData(p.pokemon_id);
  let compatStr = "";
  if (megaData) compatStr += `💎 **${megaData.isPrimal ? "Primal Reversion" : "Mega Evolution"}:** ${megaData.name}\n`;
  if (gmaxData) compatStr += `💍 **Gigantamax:** ${gmaxData.name}\n`;

  const equippedMoves = [p.move1, p.move2, p.move3, p.move4].filter(Boolean);
  let moveStr = "No moves equipped — use `p!moves` to equip";
  if (equippedMoves.length > 0) {
    const available = getAvailableMoves(data.types, p.level, p.pokemon_id);
    moveStr = equippedMoves.map(name => {
      const m = available.find(a => a.name === name);
      const emoji = m ? getTypeEmoji(m.type) : "❓";
      return `${emoji} **${name}**${m ? ` — ${m.power || "—"}pw / ${m.accuracy}%` : ""}`;
    }).join("\n");
  }

  const bsTotal = data.baseStats.hp + data.baseStats.atk + data.baseStats.def +
                  data.baseStats.spatk + data.baseStats.spdef + data.baseStats.spd;

  const embed = new EmbedBuilder()
    .setTitle(`${shinyText}${pokeName}${favText}`)
    .setDescription(
      `**${data.genus || "Pokémon"}**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `**Type:** ${typeStr}\n` +
      `**Region:** 🌍 ${typeof region === "object" ? `${region.name}${region.gen !== "?" ? ` (Gen ${region.gen})` : ""}` : region}\n` +
      `**Pokédex #:** ${p.pokemon_id}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .addFields(
      { name: "📊 Level",       value: `**${p.level}** / 100`,       inline: true },
      { name: "⭐ Total IV",    value: `**${iv}%**`,                  inline: true },
      { name: "🎭 Nature",      value: p.nature,                      inline: true },
      { name: "📈 Experience",  value: `\`[${xpBar}]\` ${p.xp}/${xpNeeded}`, inline: false },
      { name: "🆔 ID",          value: `${p.id}`,                     inline: true },
      { name: "🎒 Held Item",   value: heldItemStr,                   inline: true },
      { name: "✨ Shiny",       value: p.shiny ? "Yes ✨" : "No",     inline: true },
      { name: "⚔️ Equipped Moves", value: moveStr,                    inline: false },
      { name: "\u200B",         value: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n**Individual Values (IVs)**", inline: false },
      { name: "HP",     value: `\`${getStatBar(p.iv_hp)}\` **${p.iv_hp}**/31`,     inline: true },
      { name: "Attack", value: `\`${getStatBar(p.iv_atk)}\` **${p.iv_atk}**/31`,   inline: true },
      { name: "Defense",value: `\`${getStatBar(p.iv_def)}\` **${p.iv_def}**/31`,   inline: true },
      { name: "Sp. Atk",value: `\`${getStatBar(p.iv_spatk)}\` **${p.iv_spatk}**/31`, inline: true },
      { name: "Sp. Def",value: `\`${getStatBar(p.iv_spdef)}\` **${p.iv_spdef}**/31`, inline: true },
      { name: "Speed",  value: `\`${getStatBar(p.iv_spd)}\` **${p.iv_spd}**/31`,   inline: true }
    )
    .setImage(getPokemonImage(p.pokemon_id, p.shiny))
    .setColor(p.shiny ? 0xffd700 : 0x2f3136)
    .setFooter({ text: `Pokémon ${position} of ${total}  •  #${p.pokemon_id} | BST: ${bsTotal} | HP ${data.baseStats.hp} / ATK ${data.baseStats.atk} / DEF ${data.baseStats.def} / SpA ${data.baseStats.spatk} / SpD ${data.baseStats.spdef} / SPD ${data.baseStats.spd}` });

  if (compatStr) embed.addFields({ name: "⚡ Battle Transformations", value: compatStr, inline: false });
  if (data.description) embed.addFields({ name: "📖 Pokédex Entry", value: data.description.substring(0, 1024), inline: false });

  return embed;
}

function buildRow(position, total, pokemonDbId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`info_prev_${pokemonDbId}`)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(position <= 1),
    new ButtonBuilder()
      .setCustomId(`info_pos`)
      .setLabel(`${position} / ${total}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`info_next_${pokemonDbId}`)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(position >= total)
  );
}

async function execute(message, args) {
  const userId = message.author.id;

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) return message.reply("You haven't started yet! Use `p!start` to begin.");

  // Get full ordered list of user's pokemon IDs
  const allPokemon = await pool.query(
    "SELECT id FROM pokemon WHERE user_id = $1 ORDER BY id ASC",
    [userId]
  );
  if (allPokemon.rows.length === 0) return message.reply("You don't have any Pokémon!");

  const pokemonIds = allPokemon.rows.map(r => r.id);
  const total = pokemonIds.length;

  // Determine starting pokemon
  let startId;
  if (args.length > 0 && args[0].toLowerCase() === "latest") {
    startId = pokemonIds[pokemonIds.length - 1];
  } else if (args.length > 0 && !isNaN(args[0])) {
    startId = parseInt(args[0]);
    // If the number is a list position (1-based), convert it
    if (!pokemonIds.includes(startId) && startId >= 1 && startId <= total) {
      startId = pokemonIds[startId - 1];
    }
  } else {
    startId = user.rows[0].selected_pokemon_id || pokemonIds[0];
  }

  let currentIndex = pokemonIds.indexOf(startId);
  if (currentIndex === -1) currentIndex = 0;

  async function fetchAndBuild(index) {
    const dbId = pokemonIds[index];
    const result = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [dbId, userId]);
    if (result.rows.length === 0) return null;
    const p = result.rows[0];
    const data = getPokemonById(p.pokemon_id);
    if (!data) return null;
    return { p, data, dbId };
  }

  const initial = await fetchAndBuild(currentIndex);
  if (!initial) return message.reply("Pokémon not found in your collection.");

  const embed = await buildEmbed(initial.p, initial.data, currentIndex + 1, total);
  const row = buildRow(currentIndex + 1, total, initial.dbId);

  const msg = await message.channel.send({ embeds: [embed], components: [row] });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === userId,
    time: 120000
  });

  collector.on("collect", async interaction => {
    const [, dir] = interaction.customId.split("_");

    if (dir === "prev" && currentIndex > 0) currentIndex--;
    else if (dir === "next" && currentIndex < total - 1) currentIndex++;
    else { await interaction.deferUpdate(); return; }

    const entry = await fetchAndBuild(currentIndex);
    if (!entry) { await interaction.deferUpdate(); return; }

    const newEmbed = await buildEmbed(entry.p, entry.data, currentIndex + 1, total);
    const newRow = buildRow(currentIndex + 1, total, entry.dbId);
    await interaction.update({ embeds: [newEmbed], components: [newRow] });
  });

  collector.on("end", async () => {
    try {
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ip").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId("ic").setLabel(`${currentIndex + 1} / ${total}`).setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId("in").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(true)
      );
      await msg.edit({ components: [disabledRow] });
    } catch {}
  });
}

module.exports = { name: "info", aliases: ["i"], description: "View detailed info about a Pokemon", execute };
