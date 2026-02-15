const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonByName, getPokemonImage, getAllPokemon, searchPokemon } = require("../data/pokemonLoader");
const { canMegaEvolve, canGmax, getMegaData, getGmaxData } = require("../data/mega");
const { capitalize, getTypeEmoji } = require("../utils/helpers");

function getRegion(id) {
  if (id <= 151) return "Kanto";
  if (id <= 251) return "Johto";
  if (id <= 386) return "Hoenn";
  if (id <= 493) return "Sinnoh";
  if (id <= 649) return "Unova";
  if (id <= 721) return "Kalos";
  if (id <= 809) return "Alola";
  if (id <= 905) return "Galar";
  return "Paldea";
}

function buildEvoFromMap() {
  const allPokemon = getAllPokemon();
  const evoFrom = {};
  for (const [id, p] of allPokemon) {
    if (p.evolutionTo && p.evolutionTo.length > 0) {
      for (const e of p.evolutionTo) {
        const target = Array.from(allPokemon.values()).find(x => x.name === e.to);
        if (target) {
          evoFrom[target.id] = { fromName: p.name, fromId: p.id, method: e };
        }
      }
    }
  }
  return evoFrom;
}

function getFullEvoChain(pokemonId) {
  const allPokemon = getAllPokemon();
  const evoFrom = buildEvoFromMap();

  let baseId = pokemonId;
  while (evoFrom[baseId]) {
    baseId = evoFrom[baseId].fromId;
  }

  const chain = [];
  function traverse(id) {
    const p = getPokemonById(id);
    if (!p) return;
    chain.push(p);
    if (p.evolutionTo) {
      for (const e of p.evolutionTo) {
        const target = Array.from(allPokemon.values()).find(x => x.name === e.to);
        if (target) traverse(target.id);
      }
    }
  }
  traverse(baseId);
  return chain;
}

function formatEvoMethod(evo) {
  if (evo.level) return `Lv.${evo.level}`;
  if (evo.item) return capitalize(evo.item.replace(/-/g, " "));
  return "Special";
}

function buildMainEmbed(data, userId, caught) {
  const typeStr = data.types.map(t => `${getTypeEmoji(t)} ${capitalize(t)}`).join(" / ");
  const region = getRegion(data.id);

  const embed = new EmbedBuilder()
    .setTitle(`#${data.id} — ${capitalize(data.name)}`)
    .setDescription(`${data.genus || "Pokémon"}\n**Type:** ${typeStr}\n**Region:** ${region}`)
    .addFields(
      { name: "Base Stats", value: `HP: ${data.baseStats.hp} | ATK: ${data.baseStats.atk} | DEF: ${data.baseStats.def}\nSpA: ${data.baseStats.spatk} | SpD: ${data.baseStats.spdef} | SPD: ${data.baseStats.spd}`, inline: false },
      { name: "Height", value: `${(data.height / 10).toFixed(1)}m`, inline: true },
      { name: "Weight", value: `${(data.weight / 10).toFixed(1)}kg`, inline: true },
      { name: "Caught", value: caught ? "Yes ✅" : "No ❌", inline: true }
    )
    .setImage(getPokemonImage(data.id))
    .setColor(0xe74c3c);

  if (data.isLegendary) embed.addFields({ name: "Rarity", value: "🌟 Legendary", inline: true });
  if (data.isMythical) embed.addFields({ name: "Rarity", value: "💫 Mythical", inline: true });
  if (data.description) embed.addFields({ name: "Description", value: data.description.substring(0, 1024), inline: false });

  return embed;
}

function buildShinyEmbed(data, caught) {
  const typeStr = data.types.map(t => `${getTypeEmoji(t)} ${capitalize(t)}`).join(" / ");
  const region = getRegion(data.id);

  const embed = new EmbedBuilder()
    .setTitle(`#${data.id} — ✨ Shiny ${capitalize(data.name)}`)
    .setDescription(`${data.genus || "Pokémon"}\n**Type:** ${typeStr}\n**Region:** ${region}`)
    .addFields(
      { name: "Base Stats", value: `HP: ${data.baseStats.hp} | ATK: ${data.baseStats.atk} | DEF: ${data.baseStats.def}\nSpA: ${data.baseStats.spatk} | SpD: ${data.baseStats.spdef} | SPD: ${data.baseStats.spd}`, inline: false },
      { name: "Shiny Rate", value: "1/4096 (1/2048 with Shiny Charm)", inline: true },
      { name: "Caught", value: caught ? "Yes ✅" : "No ❌", inline: true }
    )
    .setImage(getPokemonImage(data.id, true))
    .setColor(0xf1c40f)
    .setFooter({ text: "✨ Shiny Form" });

  return embed;
}

function getFormName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/\s+/g, "-");
}

function buildMegaEmbed(data, megaData) {
  const typeStr = megaData.types.map(t => `${getTypeEmoji(t)} ${capitalize(t)}`).join(" / ");

  const boostStr = Object.entries(megaData.statBoost)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${k.toUpperCase()}: ${v > 0 ? "+" : ""}${v}`)
    .join(" | ");

  const label = megaData.isPrimal ? "Primal Reversion" : "Mega Evolution";
  let formSuffix = megaData.isPrimal ? "-primal" : "-mega";
  const megaNameLower = megaData.name.toLowerCase();
  if (megaNameLower.includes(" x")) formSuffix = "-mega-x";
  else if (megaNameLower.includes(" y")) formSuffix = "-mega-y";
  const megaImage = `https://img.pokemondb.net/artwork/large/${getFormName(data.name)}${formSuffix}.jpg`;

  const embed = new EmbedBuilder()
    .setTitle(`#${data.id} — ${megaData.name}`)
    .setDescription(`${label}\n**Type:** ${typeStr}`)
    .addFields(
      { name: "Base Stats", value: `HP: ${data.baseStats.hp} | ATK: ${data.baseStats.atk} | DEF: ${data.baseStats.def}\nSpA: ${data.baseStats.spatk} | SpD: ${data.baseStats.spdef} | SPD: ${data.baseStats.spd}`, inline: false },
      { name: "Stat Boosts", value: boostStr || "None", inline: false },
      { name: "Requires", value: megaData.isPrimal ? "Primal Orb" : "Mega Stone", inline: true }
    )
    .setImage(megaImage)
    .setColor(0x9b59b6)
    .setFooter({ text: `🔮 ${label}` });

  return embed;
}

function buildGmaxEmbed(data, gmaxData) {
  const movesStr = gmaxData.gmaxMoves
    .map(m => `${getTypeEmoji(m.type)} **${m.name}** — Power: ${m.power || "—"} | Acc: ${m.accuracy}%`)
    .join("\n");

  const gmaxImage = `https://img.pokemondb.net/artwork/large/${getFormName(data.name)}-gigantamax.jpg`;

  const embed = new EmbedBuilder()
    .setTitle(`#${data.id} — ${gmaxData.name}`)
    .setDescription(`Gigantamax Form\n**Duration:** 3 turns | **HP:** 1.5x`)
    .addFields(
      { name: "G-Max Moves", value: movesStr, inline: false },
      { name: "Requires", value: "G-Max Ring (held item)", inline: true }
    )
    .setImage(gmaxImage)
    .setColor(0xe91e63)
    .setFooter({ text: "💥 Gigantamax Form" });

  return embed;
}

function buildEvolutionEmbed(data) {
  const chain = getFullEvoChain(data.id);
  const allPokemon = getAllPokemon();

  let evoStr = "";
  const seen = new Set();

  function buildChainStr(id, depth = 0) {
    const p = getPokemonById(id);
    if (!p || seen.has(id)) return;
    seen.add(id);

    const indent = depth > 0 ? "　".repeat(depth) + "↳ " : "";
    const highlight = id === data.id ? "**" : "";
    evoStr += `${indent}${highlight}#${p.id} ${capitalize(p.name)}${highlight}\n`;

    if (p.evolutionTo) {
      for (const e of p.evolutionTo) {
        const target = Array.from(allPokemon.values()).find(x => x.name === e.to);
        if (target) {
          const method = formatEvoMethod(e);
          evoStr += `${"　".repeat(depth + 1)}*(${method})*\n`;
          buildChainStr(target.id, depth + 1);
        }
      }
    }
  }

  let baseId = data.id;
  const evoFrom = buildEvoFromMap();
  while (evoFrom[baseId]) {
    baseId = evoFrom[baseId].fromId;
  }
  buildChainStr(baseId);

  if (!evoStr || chain.length <= 1) {
    evoStr = `#${data.id} ${capitalize(data.name)} does not evolve.`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`#${data.id} — ${capitalize(data.name)} — Evolution Chain`)
    .setDescription(evoStr.substring(0, 4000))
    .setThumbnail(getPokemonImage(data.id))
    .setColor(0x2ecc71)
    .setFooter({ text: "🔄 Evolution Chain" });

  return embed;
}

function buildButtons(data, activeView) {
  const megaData = canMegaEvolve(data.id);
  const gmaxData = canGmax(data.id);

  const row = new ActionRowBuilder();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`dex_normal_${data.id}`)
      .setLabel("Normal")
      .setEmoji("📋")
      .setStyle(activeView === "normal" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(activeView === "normal")
  );

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`dex_shiny_${data.id}`)
      .setLabel("Shiny")
      .setEmoji("✨")
      .setStyle(activeView === "shiny" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(activeView === "shiny")
  );

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`dex_evolution_${data.id}`)
      .setLabel("Evolution")
      .setEmoji("🔄")
      .setStyle(activeView === "evolution" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(activeView === "evolution")
  );

  if (megaData) {
    const label = megaData.isPrimal ? "Primal" : "Mega";
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`dex_mega_${data.id}`)
        .setLabel(label)
        .setEmoji("🔮")
        .setStyle(activeView === "mega" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(activeView === "mega")
    );
  }

  if (gmaxData) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`dex_gmax_${data.id}`)
        .setLabel("G-Max")
        .setEmoji("💥")
        .setStyle(activeView === "gmax" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(activeView === "gmax")
    );
  }

  return row;
}

async function execute(message, args) {
  const userId = message.author.id;

  if (args.length === 0) {
    const dexResult = await pool.query("SELECT COUNT(DISTINCT pokemon_id) as count FROM pokedex WHERE user_id = $1", [userId]);
    const totalCaught = parseInt(dexResult.rows[0].count);
    const totalPokemon = getAllPokemon().size;

    const embed = new EmbedBuilder()
      .setTitle(`${message.author.username}'s Pokédex`)
      .setDescription(
        `You've registered **${totalCaught}/${totalPokemon}** Pokémon in your Pokédex!\n\n` +
        `Completion: **${((totalCaught / totalPokemon) * 100).toFixed(1)}%**\n\n` +
        `Use \`p!dex <name>\` to view a Pokémon entry.\nExample: \`p!dex charizard\``
      )
      .setColor(0xe74c3c);

    return message.channel.send({ embeds: [embed] });
  }

  const query = args.join(" ").toLowerCase();

  let data = null;
  if (!isNaN(query)) {
    data = getPokemonById(parseInt(query));
  }
  if (!data) {
    data = getPokemonByName(query);
  }
  if (!data) {
    const results = searchPokemon(query);
    if (results.length === 1) {
      data = results[0];
    } else if (results.length > 1) {
      const list = results.slice(0, 10).map(p => `#${p.id} ${capitalize(p.name)}`).join("\n");
      const embed = new EmbedBuilder()
        .setTitle("Multiple Pokémon Found")
        .setDescription(`Did you mean one of these?\n\n${list}\n\nUse \`p!dex <exact name>\` to view one.`)
        .setColor(0xf39c12);
      return message.channel.send({ embeds: [embed] });
    }
  }

  if (!data) return message.reply("That Pokémon doesn't exist! Use `p!dex <name>` (e.g. `p!dex pikachu`).");

  const caught = await pool.query("SELECT 1 FROM pokedex WHERE user_id = $1 AND pokemon_id = $2", [userId, data.id]);
  const hasCaught = caught.rows.length > 0;

  const embed = buildMainEmbed(data, userId, hasCaught);
  const row = buildButtons(data, "normal");

  const msg = await message.channel.send({ embeds: [embed], components: [row] });

  const collector = msg.createMessageComponentCollector({
    filter: (i) => i.user.id === userId,
    time: 120000
  });

  collector.on("collect", async (interaction) => {
    const [, view, idStr] = interaction.customId.split("_");
    const pokemonId = parseInt(idStr);
    const pData = getPokemonById(pokemonId);
    if (!pData) return;

    let newEmbed;
    switch (view) {
      case "normal":
        newEmbed = buildMainEmbed(pData, userId, hasCaught);
        break;
      case "shiny":
        newEmbed = buildShinyEmbed(pData, hasCaught);
        break;
      case "mega":
        const megaInfo = getMegaData(pData.id);
        if (megaInfo) {
          newEmbed = buildMegaEmbed(pData, megaInfo);
        } else {
          newEmbed = buildMainEmbed(pData, userId, hasCaught);
        }
        break;
      case "gmax":
        const gmaxInfo = getGmaxData(pData.id);
        if (gmaxInfo) {
          newEmbed = buildGmaxEmbed(pData, gmaxInfo);
        } else {
          newEmbed = buildMainEmbed(pData, userId, hasCaught);
        }
        break;
      case "evolution":
        newEmbed = buildEvolutionEmbed(pData);
        break;
      default:
        newEmbed = buildMainEmbed(pData, userId, hasCaught);
    }

    const newRow = buildButtons(pData, view);
    await interaction.update({ embeds: [newEmbed], components: [newRow] });
  });

  collector.on("end", async () => {
    try {
      const disabledRow = buildButtons(data, "none");
      disabledRow.components.forEach(btn => btn.setDisabled(true));
      await msg.edit({ components: [disabledRow] });
    } catch (e) {}
  });
}

module.exports = { name: "dex", aliases: ["pokedex", "d"], description: "View Pokédex entry by name", execute };
