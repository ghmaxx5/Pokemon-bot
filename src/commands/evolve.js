const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonByName, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, totalIV } = require("../utils/helpers");
const { getPokemonIdByPosition } = require("../utils/positionHelper");
const { getPokemonLock } = require("../utils/lockHelper");
const { SHOP_ITEMS } = require("../data/shopItems");

const CHOICE_TIMEOUT = 60_000;

const prettyItem = id => SHOP_ITEMS[id]?.name || capitalize(String(id).replace(/-/g, " "));
const itemEmoji = id => SHOP_ITEMS[id]?.emoji || "🪨";

/** How a branch is triggered, and what still blocks it. */
function classify(evo, pokemon, inventory) {
  const target = getPokemonByName(evo.to);
  if (!target) return null;

  const base = { evo, target, name: capitalize(target.displayName || target.name) };
  const trigger = evo.trigger || (evo.level ? "level-up" : "other");

  if (trigger === "level-up" && evo.level) {
    return pokemon.level >= evo.level
      ? { ...base, kind: "level", ready: true, note: `Lv. ${evo.level} reached` }
      : { ...base, kind: "level", ready: false, note: `needs Lv. ${evo.level} (currently ${pokemon.level})` };
  }

  if (trigger === "use-item" && evo.item) {
    const have = inventory.get(evo.item) || 0;
    return have > 0
      ? { ...base, kind: "item", item: evo.item, ready: true, note: `${itemEmoji(evo.item)} uses your **${prettyItem(evo.item)}**` }
      : { ...base, kind: "item", item: evo.item, ready: false, note: `needs a ${itemEmoji(evo.item)} **${prettyItem(evo.item)}**` };
  }

  if (trigger === "trade") {
    return { ...base, kind: "trade", ready: false, note: "evolves when traded to another trainer" };
  }

  if (trigger === "level-up") {
    // Friendship, time of day, held items, location — not modelled, so it's
    // honest to say so rather than pretend the branch is available.
    return { ...base, kind: "special", ready: false, note: "special condition — not available yet" };
  }

  return { ...base, kind: "special", ready: false, note: `special condition (${trigger.replace(/-/g, " ")}) — not available yet` };
}

async function loadInventory(userId) {
  const res = await pool.query(
    "SELECT item_id, quantity FROM user_inventory WHERE user_id = $1 AND quantity > 0",
    [userId]
  );
  return new Map(res.rows.map(r => [r.item_id, r.quantity]));
}

/**
 * Performs the evolution atomically: the stone is consumed and the species
 * changes in one transaction, so a failure can't eat the item for nothing.
 */
async function commitEvolution(userId, pokemonDbId, target, item) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const owned = await client.query(
      "SELECT id FROM pokemon WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [pokemonDbId, userId]
    );
    if (owned.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "gone" };
    }

    if (item) {
      const used = await client.query(
        "UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2 AND quantity > 0 RETURNING quantity",
        [userId, item]
      );
      if (used.rows.length === 0) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "no-item" };
      }
      await client.query(
        "DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0",
        [userId, item]
      );
    }

    // The nickname is kept — evolving used to silently erase it.
    await client.query("UPDATE pokemon SET pokemon_id = $1 WHERE id = $2", [target.id, pokemonDbId]);
    await client.query(
      "INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [userId, target.id]
    );

    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function resultEmbed(p, fromData, option) {
  const iv = totalIV({ hp: p.iv_hp, atk: p.iv_atk, def: p.iv_def, spatk: p.iv_spatk, spdef: p.iv_spdef, spd: p.iv_spd });
  const fromName = p.nickname || capitalize(fromData.displayName || fromData.name);
  const lines = [
    `${p.shiny ? "✨ " : ""}**${fromName}** evolved into **${option.name}**!`,
    "",
    `**Level:** ${p.level}   **IV:** ${iv}%   **Nature:** ${p.nature ? capitalize(p.nature) : "—"}`
  ];
  if (p.nickname) lines.push(`It kept the nickname **${p.nickname}**.`);
  if (option.item) lines.push(`\n${itemEmoji(option.item)} Your **${prettyItem(option.item)}** was used up.`);

  return new EmbedBuilder()
    .setTitle("🎉 What? Your Pokémon is evolving!")
    .setDescription(lines.join("\n"))
    .setImage(getPokemonImage(option.target.id, p.shiny))
    .setColor(0x9b59b6);
}

async function execute(message, args, spawns, prefix) {
  const userId = message.author.id;

  const user = await pool.query(
    "SELECT selected_pokemon_id FROM users WHERE user_id = $1 AND started = TRUE",
    [userId]
  );
  if (user.rows.length === 0) return message.reply(`You haven't started yet! Use \`${prefix}start\` to begin.`);

  const positional = args.filter(a => !a.startsWith("--"));
  let pokemonDbId;
  let position = null;

  if (positional.length > 0 && /^\d+$/.test(positional[0])) {
    position = parseInt(positional[0], 10);
    pokemonDbId = await getPokemonIdByPosition(userId, position);
    if (!pokemonDbId) return message.reply("You don't have a Pokémon at that position.");
  } else {
    pokemonDbId = user.rows[0].selected_pokemon_id;
  }

  if (!pokemonDbId) {
    return message.reply(`Specify a position — \`${prefix}evolve 3\` — or select a Pokémon with \`${prefix}select\` first.`);
  }

  const result = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
  if (result.rows.length === 0) return message.reply("That Pokémon wasn't found in your collection.");

  const lock = await getPokemonLock(pokemonDbId);
  if (lock) {
    return message.reply(`You can't evolve a Pokémon that is ${lock.label}. Remove it from there first.`);
  }

  const p = result.rows[0];
  const data = getPokemonById(p.pokemon_id);
  if (!data) return message.reply("Pokémon data not found.");

  const displayName = p.nickname || capitalize(data.displayName || data.name);

  if (!data.evolutionTo || data.evolutionTo.length === 0) {
    return message.reply(`**${displayName}** has no further evolutions!`);
  }

  const inventory = await loadInventory(userId);
  const options = data.evolutionTo.map(evo => classify(evo, p, inventory)).filter(Boolean);
  if (options.length === 0) return message.reply("Evolution data error — please report this.");

  const ready = options.filter(o => o.ready);

  if (ready.length === 0) {
    const list = options.map(o => `• **${o.name}** — ${o.note}`).join("\n");
    return message.reply({
      embeds: [new EmbedBuilder()
        .setTitle(`${displayName} can't evolve yet`)
        .setDescription(
          `${list}\n\n` +
          (options.some(o => o.kind === "item")
            ? `Evolution stones are available in \`${prefix}shop evolution\`.`
            : "")
        )
        .setThumbnail(getPokemonImage(p.pokemon_id, p.shiny))
        .setColor(0xe67e22)]
    });
  }

  // ── Single available branch: evolve immediately ──
  if (ready.length === 1) {
    return doEvolve(message, userId, pokemonDbId, p, data, ready[0], prefix);
  }

  // ── Multiple available branches (Eevee, Wurmple, Tyrogue): let them pick ──
  const rows = [];
  for (let i = 0; i < ready.length; i += 5) {
    const row = new ActionRowBuilder();
    ready.slice(i, i + 5).forEach((o, j) => row.addComponents(
      new ButtonBuilder()
        .setCustomId(`evo_${i + j}`)
        .setLabel(o.name.slice(0, 80))
        .setEmoji(o.item ? itemEmoji(o.item) : "✨")
        .setStyle(ButtonStyle.Primary)
    ));
    rows.push(row);
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("evo_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  ));

  const blocked = options.filter(o => !o.ready);
  const prompt = await message.reply({
    embeds: [new EmbedBuilder()
      .setTitle(`${displayName} can evolve into several Pokémon!`)
      .setDescription(
        ready.map(o => `• **${o.name}** — ${o.note}`).join("\n") +
        (blocked.length ? `\n\n*Not available yet:*\n${blocked.map(o => `• ${o.name} — ${o.note}`).join("\n")}` : "") +
        `\n\n⏱️ ${CHOICE_TIMEOUT / 1000} seconds to choose`
      )
      .setThumbnail(getPokemonImage(p.pokemon_id, p.shiny))
      .setColor(0x9b59b6)],
    components: rows
  });

  const collector = prompt.createMessageComponentCollector({
    filter: i => i.user.id === userId && i.customId.startsWith("evo_"),
    time: CHOICE_TIMEOUT,
    max: 1
  });

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "evo_cancel") {
      return interaction.update({
        embeds: [new EmbedBuilder().setDescription("Evolution cancelled.").setColor(0x95a5a6)],
        components: []
      }).catch(() => {});
    }

    const option = ready[parseInt(interaction.customId.replace("evo_", ""), 10)];
    if (!option) return interaction.deferUpdate().catch(() => {});

    await interaction.update({
      embeds: [new EmbedBuilder().setDescription(`Evolving into **${option.name}**…`).setColor(0x9b59b6)],
      components: []
    }).catch(() => {});

    return doEvolve(message, userId, pokemonDbId, p, data, option, prefix);
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      prompt.edit({
        embeds: [new EmbedBuilder().setDescription("⏰ Evolution timed out.").setColor(0x95a5a6)],
        components: []
      }).catch(() => {});
    }
  });
}

async function doEvolve(message, userId, pokemonDbId, p, data, option, prefix) {
  let outcome;
  try {
    outcome = await commitEvolution(userId, pokemonDbId, option.target, option.item);
  } catch (err) {
    console.error("Evolution failed:", err);
    return message.channel.send("Something went wrong while evolving — nothing was changed.");
  }

  if (!outcome.ok) {
    if (outcome.reason === "no-item") {
      return message.channel.send(`You no longer have a ${itemEmoji(option.item)} **${prettyItem(option.item)}**. Buy one in \`${prefix}shop evolution\`.`);
    }
    return message.channel.send("That Pokémon is no longer in your collection.");
  }

  return message.channel.send({ embeds: [resultEmbed(p, data, option)] });
}

module.exports = {
  name: "evolve",
  aliases: ["ev"],
  description: "Evolve a Pokémon (level, stone, or branched evolutions)",
  execute
};
