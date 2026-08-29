const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonByName, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, totalIV } = require("../utils/helpers");
const { getPokemonIdByPosition } = require("../utils/positionHelper");

const INVITE_TIMEOUT = 60 * 1000;       // how long an unanswered invite stands
const IDLE_TIMEOUT = 10 * 60 * 1000;    // an accepted trade with no activity
const MAX_PER_SIDE = 12;

// tradeId -> trade. `tradeByUser` is the index: the old code scanned the whole
// map on every subcommand, and a trade that was never cancelled leaked forever
// and locked both trainers out of trading again.
const activeTrades = new Map();
const tradeByUser = new Map();
let tradeSeq = 0;

function tradeFor(userId) {
  const id = tradeByUser.get(userId);
  if (!id) return null;
  const trade = activeTrades.get(id);
  if (!trade) {
    tradeByUser.delete(userId);
    return null;
  }
  return trade;
}

function dropTrade(trade) {
  if (!trade) return;
  activeTrades.delete(trade.id);
  if (tradeByUser.get(trade.user1) === trade.id) tradeByUser.delete(trade.user1);
  if (tradeByUser.get(trade.user2) === trade.id) tradeByUser.delete(trade.user2);
}

function touch(trade) {
  trade.lastActivity = Date.now();
}

/** Any edit invalidates both confirmations — nobody confirms a moving target. */
function resetConfirms(trade) {
  trade.confirmed1 = false;
  trade.confirmed2 = false;
}

function sideOf(trade, userId) {
  return trade.user1 === userId ? trade.side1 : trade.side2;
}

function otherUser(trade, userId) {
  return trade.user1 === userId ? trade.user2 : trade.user1;
}

// Expired trades used to sit in memory forever. Sweep them and tell the channel,
// so a forgotten trade can't permanently block either trainer.
setInterval(() => {
  const now = Date.now();
  for (const trade of [...activeTrades.values()]) {
    if (trade.status === "settling") continue;
    const limit = trade.status === "pending" ? INVITE_TIMEOUT : IDLE_TIMEOUT;
    if (now - trade.lastActivity < limit) continue;

    dropTrade(trade);
    trade.channel?.send({
      embeds: [new EmbedBuilder()
        .setTitle("⏰ Trade Expired")
        .setDescription(
          trade.status === "pending"
            ? `<@${trade.user2}> didn't respond, so the trade with <@${trade.user1}> was cancelled.`
            : `The trade between <@${trade.user1}> and <@${trade.user2}> expired after ${IDLE_TIMEOUT / 60000} minutes of inactivity. Nothing was exchanged.`
        )
        .setColor(0x95a5a6)]
    }).catch(() => {});
  }
}, 30_000).unref();

// ── rendering ────────────────────────────────────────────────────────────────

/** One batched query instead of one per Pokémon. */
async function describeSide(trade, userId) {
  const side = sideOf(trade, userId);
  const parts = [];

  if (side.pokemon.length > 0) {
    const res = await pool.query(
      "SELECT * FROM pokemon WHERE id = ANY($1::int[]) AND user_id = $2",
      [side.pokemon, userId]
    );
    const byId = new Map(res.rows.map(r => [r.id, r]));
    for (const id of side.pokemon) {
      const p = byId.get(id);
      if (!p) {
        parts.push("⚠️ *a Pokémon is no longer available*");
        continue;
      }
      const data = getPokemonById(p.pokemon_id);
      const name = p.nickname || (data ? capitalize(data.displayName || data.name) : `#${p.pokemon_id}`);
      const iv = totalIV({ hp: p.iv_hp, atk: p.iv_atk, def: p.iv_def, spatk: p.iv_spatk, spdef: p.iv_spdef, spd: p.iv_spd });
      parts.push(`${p.shiny ? "✨ " : ""}**${name}** · Lv. ${p.level} · IV ${iv}%`);
    }
  }

  if (side.coins > 0) parts.push(`🪙 **${side.coins.toLocaleString()}** Cybercoins`);
  if (parts.length === 0) return "*Nothing offered yet*";
  return parts.join("\n").slice(0, 1024);
}

async function tradeEmbed(trade, prefix, note) {
  const [a, b] = await Promise.all([
    describeSide(trade, trade.user1),
    describeSide(trade, trade.user2)
  ]);

  return new EmbedBuilder()
    .setTitle("🔄 Trade")
    .setDescription(
      (note ? `${note}\n\n` : "") +
      `Add with \`${prefix}trade add <position>\`, offer coins with \`${prefix}trade coins <amount>\`, ` +
      `then \`${prefix}trade confirm\`. Either trainer can \`${prefix}trade cancel\`.`
    )
    .addFields(
      { name: `${trade.confirmed1 ? "✅" : "⬜"} ${trade.name1}`, value: a, inline: true },
      { name: `${trade.confirmed2 ? "✅" : "⬜"} ${trade.name2}`, value: b, inline: true }
    )
    .setFooter({ text: `Expires after ${IDLE_TIMEOUT / 60000} min of inactivity` })
    .setColor(trade.confirmed1 && trade.confirmed2 ? 0x2ecc71 : 0x9b59b6);
}

// ── settlement ───────────────────────────────────────────────────────────────

/**
 * Trade evolutions (Kadabra → Alakazam and 23 others) only ever happen here.
 * Applied inside the same transaction as the transfer so a failure can't leave
 * a half-evolved Pokémon behind.
 */
function tradeEvolutionFor(pokemonId) {
  const data = getPokemonById(pokemonId);
  if (!data) return null;
  const candidates = (data.evolutionTo || []).filter(e => e.trigger === "trade" && !e.item);
  if (candidates.length === 0) return null;
  // Clamperl splits into Huntail and Gorebyss — pick one so both are reachable.
  const evo = candidates[Math.floor(Math.random() * candidates.length)];
  const target = getPokemonByName(evo.to);
  return target ? { from: data, to: target } : null;
}

/**
 * Moves both sides at once, re-verifying ownership, favorite status, and market
 * listings *inside* the transaction. The old version never re-checked market
 * listings, so a Pokémon could be traded away while still listed for sale.
 */
async function settle(trade) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const evolutions = [];

    for (const [owner, receiver, side] of [
      [trade.user1, trade.user2, trade.side1],
      [trade.user2, trade.user1, trade.side2]
    ]) {
      if (side.pokemon.length > 0) {
        const res = await client.query(
          "SELECT id, user_id, pokemon_id, nickname, shiny, favorite FROM pokemon WHERE id = ANY($1::int[]) FOR UPDATE",
          [side.pokemon]
        );
        if (res.rows.length !== side.pokemon.length) {
          await client.query("ROLLBACK");
          return { ok: false, reason: "A Pokémon in the trade no longer exists." };
        }
        for (const row of res.rows) {
          if (row.user_id !== owner) {
            await client.query("ROLLBACK");
            return { ok: false, reason: `<@${owner}> no longer owns every Pokémon they offered.` };
          }
          if (row.favorite) {
            await client.query("ROLLBACK");
            return { ok: false, reason: "A favorited Pokémon can't be traded." };
          }
        }

        const listed = await client.query(
          "SELECT pokemon_db_id FROM market_listings WHERE pokemon_db_id = ANY($1::int[])",
          [side.pokemon]
        );
        if (listed.rows.length > 0) {
          await client.query("ROLLBACK");
          return { ok: false, reason: "A Pokémon in the trade is listed on the market. Unlist it first." };
        }

        await client.query(
          "UPDATE pokemon SET user_id = $1 WHERE id = ANY($2::int[])",
          [receiver, side.pokemon]
        );

        for (const row of res.rows) {
          const evo = tradeEvolutionFor(row.pokemon_id);
          const finalId = evo ? evo.to.id : row.pokemon_id;
          if (evo) {
            // The nickname is deliberately preserved.
            await client.query("UPDATE pokemon SET pokemon_id = $1 WHERE id = $2", [finalId, row.id]);
            evolutions.push({ receiver, row, evo });
          }
          await client.query(
            "INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [receiver, finalId]
          );
        }

        // A traded-away Pokémon must not stay selected — every other command
        // would then act on a Pokémon the user no longer owns.
        await client.query(
          `UPDATE users SET selected_pokemon_id = (
             SELECT id FROM pokemon WHERE user_id = $1 ORDER BY id ASC LIMIT 1
           ) WHERE user_id = $1 AND selected_pokemon_id = ANY($2::int[])`,
          [owner, side.pokemon]
        );
      }

      if (side.coins > 0) {
        const bal = await client.query(
          "SELECT balance FROM users WHERE user_id = $1 FOR UPDATE",
          [owner]
        );
        if (bal.rows.length === 0 || bal.rows[0].balance < side.coins) {
          await client.query("ROLLBACK");
          return { ok: false, reason: `<@${owner}> can no longer afford the coins they offered.` };
        }
        await client.query("UPDATE users SET balance = balance - $1 WHERE user_id = $2", [side.coins, owner]);
        await client.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [side.coins, receiver]);
      }
    }

    await client.query("COMMIT");
    return { ok: true, evolutions };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Trade settlement failed:", err);
    return { ok: false, reason: "Something went wrong — nothing was exchanged." };
  } finally {
    client.release();
  }
}

async function runSettlement(trade, message) {
  // Guard against both trainers confirming at the same instant and settling twice.
  if (trade.status === "settling") return;
  trade.status = "settling";

  const result = await settle(trade);
  dropTrade(trade);

  const channel = trade.channel || message.channel;

  if (!result.ok) {
    return channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("❌ Trade Failed")
        .setDescription(`${result.reason}\n\nThe trade was cancelled and nothing changed hands.`)
        .setColor(0xe74c3c)]
    }).catch(() => {});
  }

  const summary = [];
  if (trade.side1.pokemon.length || trade.side1.coins) {
    summary.push(`**${trade.name1}** → ${trade.side1.pokemon.length} Pokémon` +
      (trade.side1.coins ? ` + 🪙 ${trade.side1.coins.toLocaleString()}` : ""));
  }
  if (trade.side2.pokemon.length || trade.side2.coins) {
    summary.push(`**${trade.name2}** → ${trade.side2.pokemon.length} Pokémon` +
      (trade.side2.coins ? ` + 🪙 ${trade.side2.coins.toLocaleString()}` : ""));
  }

  await channel.send({
    embeds: [new EmbedBuilder()
      .setTitle("✅ Trade Complete")
      .setDescription(
        `<@${trade.user1}> and <@${trade.user2}> completed their trade!\n\n${summary.join("\n") || "Nothing was exchanged."}`
      )
      .setColor(0x2ecc71)]
  }).catch(() => {});

  for (const { receiver, row, evo } of result.evolutions) {
    const before = row.nickname || capitalize(evo.from.displayName || evo.from.name);
    await channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("🎉 What? Your Pokémon is evolving!")
        .setDescription(
          `<@${receiver}>'s ${row.shiny ? "✨ " : ""}**${before}** evolved into ` +
          `**${capitalize(evo.to.displayName || evo.to.name)}** on trade!` +
          (row.nickname ? `\n\nIt kept the nickname **${row.nickname}**.` : "")
        )
        .setImage(getPokemonImage(evo.to.id, row.shiny))
        .setColor(0x9b59b6)]
    }).catch(() => {});
  }
}

// ── command ──────────────────────────────────────────────────────────────────

async function execute(message, args, spawns, prefix) {
  const userId = message.author.id;
  const sub = (args[0] || "").toLowerCase();

  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder()
        .setTitle("🔄 Trading")
        .setDescription(
          `\`${prefix}trade @user\` — invite someone to trade\n` +
          `\`${prefix}trade accept\` / \`${prefix}trade decline\` — answer an invite\n` +
          `\`${prefix}trade add <position>\` — offer a Pokémon\n` +
          `\`${prefix}trade remove <position>\` — take one back\n` +
          `\`${prefix}trade coins <amount>\` — offer Cybercoins (\`0\` to clear)\n` +
          `\`${prefix}trade info\` — show the current offers\n` +
          `\`${prefix}trade confirm\` — lock in your side\n` +
          `\`${prefix}trade cancel\` — call it off\n\n` +
          `Favorited and market-listed Pokémon can't be traded. Invites expire after ` +
          `${INVITE_TIMEOUT / 1000}s, and an idle trade expires after ${IDLE_TIMEOUT / 60000} minutes.`
        )
        .setColor(0x9b59b6)]
    });
  }

  // ── cancel ──
  if (sub === "cancel" || sub === "decline") {
    const trade = tradeFor(userId);
    if (!trade) return message.reply("You don't have an active trade.");
    if (trade.status === "settling") return message.reply("That trade is already being completed.");

    const declining = trade.status === "pending" && userId === trade.user2;
    dropTrade(trade);
    return message.reply({
      embeds: [new EmbedBuilder()
        .setDescription(
          declining
            ? `You declined the trade with <@${trade.user1}>.`
            : `Trade between <@${trade.user1}> and <@${trade.user2}> cancelled. Nothing was exchanged.`
        )
        .setColor(0x95a5a6)]
    });
  }

  // ── accept ──
  if (sub === "accept") {
    const trade = tradeFor(userId);
    if (!trade) return message.reply("You have no trade invite to accept.");
    if (trade.status !== "pending") return message.reply("That trade is already underway.");
    if (userId !== trade.user2) return message.reply("You're the one who sent the invite — wait for them to accept.");

    trade.status = "open";
    touch(trade);
    return message.channel.send({ embeds: [await tradeEmbed(trade, prefix, `<@${userId}> accepted the trade!`)] });
  }

  const trade = tradeFor(userId);

  if (["add", "remove", "coins", "money", "cash", "info", "confirm"].includes(sub)) {
    if (!trade) return message.reply(`You don't have an active trade. Start one with \`${prefix}trade @user\`.`);
    if (trade.status === "pending") {
      return message.reply(
        userId === trade.user2
          ? `Accept the invite first with \`${prefix}trade accept\`.`
          : `Waiting for <@${trade.user2}> to accept. They have ${Math.max(0, Math.ceil((INVITE_TIMEOUT - (Date.now() - trade.lastActivity)) / 1000))}s.`
      );
    }
    if (trade.status === "settling") return message.reply("That trade is already being completed.");
  }

  // ── add ──
  if (sub === "add") {
    const raw = args[1];
    if (!raw || !/^\d+$/.test(raw)) return message.reply(`Usage: \`${prefix}trade add <position>\``);

    const side = sideOf(trade, userId);
    if (side.pokemon.length >= MAX_PER_SIDE) {
      return message.reply(`You can only offer up to ${MAX_PER_SIDE} Pokémon at once.`);
    }

    const pokemonDbId = await getPokemonIdByPosition(userId, parseInt(raw, 10));
    if (!pokemonDbId) return message.reply("You don't have a Pokémon at that position.");

    const poke = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
    if (poke.rows.length === 0) return message.reply("You don't own that Pokémon.");
    if (poke.rows[0].favorite) return message.reply(`That Pokémon is favorited. Unfavorite it with \`${prefix}unfav ${raw}\` first.`);

    const listed = await pool.query("SELECT 1 FROM market_listings WHERE pokemon_db_id = $1", [pokemonDbId]);
    if (listed.rows.length > 0) return message.reply("That Pokémon is listed on the market. Unlist it first.");

    if (side.pokemon.includes(pokemonDbId)) return message.reply("That Pokémon is already in the trade.");
    side.pokemon.push(pokemonDbId);
    resetConfirms(trade);
    touch(trade);

    const data = getPokemonById(poke.rows[0].pokemon_id);
    const name = poke.rows[0].nickname || (data ? capitalize(data.displayName || data.name) : `#${poke.rows[0].pokemon_id}`);
    return message.channel.send({
      embeds: [await tradeEmbed(trade, prefix, `➕ <@${userId}> added **${name}**. Both confirmations were reset.`)]
    });
  }

  // ── remove ──
  if (sub === "remove") {
    const raw = args[1];
    if (!raw || !/^\d+$/.test(raw)) return message.reply(`Usage: \`${prefix}trade remove <position>\``);

    const side = sideOf(trade, userId);
    const pokemonDbId = await getPokemonIdByPosition(userId, parseInt(raw, 10));

    // Fall back to matching the raw id: releasing something else mid-trade
    // shifts positions, and the old code then refused to remove anything.
    const idx = pokemonDbId !== null && side.pokemon.indexOf(pokemonDbId) !== -1
      ? side.pokemon.indexOf(pokemonDbId)
      : side.pokemon.indexOf(parseInt(raw, 10));

    if (idx === -1) return message.reply("That Pokémon isn't in the trade.");
    side.pokemon.splice(idx, 1);
    resetConfirms(trade);
    touch(trade);

    return message.channel.send({
      embeds: [await tradeEmbed(trade, prefix, `➖ <@${userId}> removed a Pokémon. Both confirmations were reset.`)]
    });
  }

  // ── coins ──
  if (sub === "coins" || sub === "money" || sub === "cash") {
    const raw = (args[1] || "").replace(/[,_]/g, "");
    if (!/^\d+$/.test(raw)) return message.reply(`Usage: \`${prefix}trade coins <amount>\` (use \`0\` to clear your offer)`);

    const amount = parseInt(raw, 10);
    if (!Number.isSafeInteger(amount)) return message.reply("That's not a valid amount.");

    const bal = await pool.query("SELECT balance FROM users WHERE user_id = $1", [userId]);
    const balance = bal.rows[0]?.balance ?? 0;
    if (amount > balance) {
      return message.reply(`You only have 🪙 **${balance.toLocaleString()}** Cybercoins.`);
    }

    sideOf(trade, userId).coins = amount;
    resetConfirms(trade);
    touch(trade);

    return message.channel.send({
      embeds: [await tradeEmbed(trade, prefix,
        amount === 0
          ? `<@${userId}> cleared their coin offer. Both confirmations were reset.`
          : `🪙 <@${userId}> offered **${amount.toLocaleString()}** Cybercoins. Both confirmations were reset.`)]
    });
  }

  // ── info ──
  if (sub === "info" || sub === "view" || sub === "show") {
    touch(trade);
    return message.channel.send({ embeds: [await tradeEmbed(trade, prefix)] });
  }

  // ── confirm ──
  if (sub === "confirm") {
    const side1 = trade.side1, side2 = trade.side2;
    if (side1.pokemon.length + side1.coins === 0 && side2.pokemon.length + side2.coins === 0) {
      return message.reply("There's nothing in the trade yet.");
    }

    if (trade.user1 === userId) trade.confirmed1 = true;
    else trade.confirmed2 = true;
    touch(trade);

    if (!(trade.confirmed1 && trade.confirmed2)) {
      return message.channel.send({
        embeds: [await tradeEmbed(trade, prefix, `✅ <@${userId}> confirmed. Waiting on <@${otherUser(trade, userId)}>.`)]
      });
    }

    return runSettlement(trade, message);
  }

  // ── new trade: c!trade @user ──
  const mentioned = message.mentions.users.first();
  if (!mentioned) {
    return message.reply(`Unknown option \`${args[0]}\`. Run \`${prefix}trade\` to see the commands.`);
  }
  if (mentioned.id === userId) return message.reply("You can't trade with yourself!");
  if (mentioned.bot) return message.reply("You can't trade with a bot!");

  const mine = tradeFor(userId);
  if (mine) return message.reply(`You already have an active trade. Cancel it first with \`${prefix}trade cancel\`.`);
  const theirs = tradeFor(mentioned.id);
  if (theirs) return message.reply(`**${mentioned.username}** is already in a trade. They must finish or cancel it first.`);

  const started = await pool.query(
    "SELECT user_id FROM users WHERE user_id = ANY($1::text[]) AND started = TRUE",
    [[userId, mentioned.id]]
  );
  const startedIds = new Set(started.rows.map(r => r.user_id));
  if (!startedIds.has(userId)) return message.reply(`You haven't started yet! Use \`${prefix}start\`.`);
  if (!startedIds.has(mentioned.id)) return message.reply(`**${mentioned.username}** hasn't started their journey yet.`);

  const newTrade = {
    id: `trade_${++tradeSeq}`,
    user1: userId,
    user2: mentioned.id,
    name1: message.author.username,
    name2: mentioned.username,
    side1: { pokemon: [], coins: 0 },
    side2: { pokemon: [], coins: 0 },
    confirmed1: false,
    confirmed2: false,
    status: "pending",
    channel: message.channel,
    lastActivity: Date.now()
  };
  activeTrades.set(newTrade.id, newTrade);
  tradeByUser.set(userId, newTrade.id);
  tradeByUser.set(mentioned.id, newTrade.id);

  // The invite needs an answer. It used to bind the other trainer instantly,
  // which locked them out of trading with anyone else without their consent.
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("trade_accept").setLabel("Accept").setEmoji("🔄").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("trade_decline").setLabel("Decline").setEmoji("❌").setStyle(ButtonStyle.Danger)
  );

  const invite = await message.channel.send({
    content: `${mentioned}`,
    embeds: [new EmbedBuilder()
      .setTitle("🔄 Trade Invite")
      .setDescription(
        `**${message.author.username}** wants to trade with **${mentioned.username}**!\n\n` +
        `${mentioned}, press **Accept** or run \`${prefix}trade accept\`.\n` +
        `⏱️ Expires in ${INVITE_TIMEOUT / 1000} seconds.`
      )
      .setColor(0x9b59b6)],
    components: [row]
  });

  const collector = invite.createMessageComponentCollector({
    filter: i => (i.user.id === mentioned.id || i.user.id === userId) && i.customId.startsWith("trade_"),
    time: INVITE_TIMEOUT
  });

  collector.on("collect", async (interaction) => {
    if (!activeTrades.has(newTrade.id)) {
      collector.stop();
      return interaction.reply({ content: "That trade is no longer active.", ephemeral: true }).catch(() => {});
    }

    if (interaction.customId === "trade_decline") {
      // The inviter may withdraw their own offer with the same button.
      const byInviter = interaction.user.id === userId;
      dropTrade(newTrade);
      collector.stop();
      return interaction.update({
        embeds: [new EmbedBuilder()
          .setDescription(byInviter
            ? `**${message.author.username}** withdrew the trade invite.`
            : `**${mentioned.username}** declined the trade.`)
          .setColor(0x95a5a6)],
        components: []
      }).catch(() => {});
    }

    if (interaction.user.id !== mentioned.id) {
      return interaction.reply({ content: "Only the invited trainer can accept.", ephemeral: true }).catch(() => {});
    }

    newTrade.status = "open";
    touch(newTrade);
    collector.stop();

    await interaction.update({
      embeds: [new EmbedBuilder()
        .setTitle("🔄 Trade Accepted")
        .setDescription(`**${mentioned.username}** accepted the trade!`)
        .setColor(0x2ecc71)],
      components: []
    }).catch(() => {});

    return message.channel.send({ embeds: [await tradeEmbed(newTrade, prefix)] }).catch(() => {});
  });

  collector.on("end", () => {
    // The sweeper posts the expiry notice; just clear the buttons here.
    if (activeTrades.get(newTrade.id)?.status === "pending") {
      invite.edit({ components: [] }).catch(() => {});
    }
  });
}

/** Used by lockHelper so market/evolve/release can refuse a Pokémon mid-trade. */
function isPokemonInActiveTrade(pokemonDbId) {
  const id = Number(pokemonDbId);
  for (const trade of activeTrades.values()) {
    if (trade.side1.pokemon.includes(id) || trade.side2.pokemon.includes(id)) return true;
  }
  return false;
}

module.exports = {
  name: "trade",
  aliases: ["t"],
  description: "Trade Pokémon and coins with another trainer",
  execute,
  isPokemonInActiveTrade
};
