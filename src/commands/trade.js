const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById } = require("../data/pokemonLoader");
const { capitalize, totalIV } = require("../utils/helpers");

const activeTrades = new Map();

async function execute(message, args) {
  const userId = message.author.id;

  if (!args.length) {
    return message.reply("Usage:\n`p!trade @user` - Start a trade\n`p!trade add <pokemon id>` - Add Pokemon to trade\n`p!trade remove <pokemon id>` - Remove Pokemon from trade\n`p!trade confirm` - Confirm the trade\n`p!trade cancel` - Cancel the trade");
  }

  const subcommand = args[0].toLowerCase();

  if (subcommand === "cancel") {
    for (const [key, trade] of activeTrades) {
      if (trade.user1 === userId || trade.user2 === userId) {
        activeTrades.delete(key);
        return message.reply("Trade cancelled.");
      }
    }
    return message.reply("You don't have an active trade.");
  }

  if (subcommand === "add") {
    if (!args[1] || isNaN(args[1])) return message.reply("Usage: `p!trade add <pokemon id>`");
    const pokemonDbId = parseInt(args[1]);

    let trade = null;
    let tradeKey = null;
    for (const [key, t] of activeTrades) {
      if (t.user1 === userId || t.user2 === userId) { trade = t; tradeKey = key; break; }
    }
    if (!trade) return message.reply("You don't have an active trade! Start one with `p!trade @user`.");

    const poke = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
    if (poke.rows.length === 0) return message.reply("You don't own that Pokemon.");
    if (poke.rows[0].favorite) return message.reply("You can't trade a favorited Pokemon!");

    const side = trade.user1 === userId ? trade.offers1 : trade.offers2;
    if (side.find(p => p === pokemonDbId)) return message.reply("That Pokemon is already in the trade.");
    side.push(pokemonDbId);

    trade.user1_confirmed = false;
    trade.user2_confirmed = false;

    const data = getPokemonById(poke.rows[0].pokemon_id);
    const name = poke.rows[0].nickname || (data ? capitalize(data.name) : `#${poke.rows[0].pokemon_id}`);
    return message.reply(`Added **${name}** to the trade.`);
  }

  if (subcommand === "remove") {
    if (!args[1] || isNaN(args[1])) return message.reply("Usage: `p!trade remove <pokemon id>`");
    const pokemonDbId = parseInt(args[1]);

    let trade = null;
    for (const [key, t] of activeTrades) {
      if (t.user1 === userId || t.user2 === userId) { trade = t; break; }
    }
    if (!trade) return message.reply("You don't have an active trade!");

    const side = trade.user1 === userId ? trade.offers1 : trade.offers2;
    const idx = side.indexOf(pokemonDbId);
    if (idx === -1) return message.reply("That Pokemon is not in the trade.");
    side.splice(idx, 1);

    trade.user1_confirmed = false;
    trade.user2_confirmed = false;
    return message.reply("Removed from trade.");
  }

  if (subcommand === "info") {
    let trade = null;
    for (const [key, t] of activeTrades) {
      if (t.user1 === userId || t.user2 === userId) { trade = t; break; }
    }
    if (!trade) return message.reply("You don't have an active trade!");

    const formatOffer = async (offers) => {
      if (offers.length === 0) return "Nothing yet";
      const lines = [];
      for (const id of offers) {
        const r = await pool.query("SELECT * FROM pokemon WHERE id = $1", [id]);
        if (r.rows.length > 0) {
          const p = r.rows[0];
          const data = getPokemonById(p.pokemon_id);
          const name = p.nickname || (data ? capitalize(data.name) : `#${p.pokemon_id}`);
          const iv = totalIV({ hp: p.iv_hp, atk: p.iv_atk, def: p.iv_def, spatk: p.iv_spatk, spdef: p.iv_spdef, spd: p.iv_spd });
          lines.push(`${p.shiny ? "✨ " : ""}**${name}** | Lv. ${p.level} | IV: ${iv}%`);
        }
      }
      return lines.join("\n");
    };

    const embed = new EmbedBuilder()
      .setTitle("Trade Details")
      .addFields(
        { name: `<@${trade.user1}>'s Offer`, value: await formatOffer(trade.offers1), inline: true },
        { name: `<@${trade.user2}>'s Offer`, value: await formatOffer(trade.offers2), inline: true },
        { name: "Status", value: `${trade.user1_confirmed ? "✅" : "❌"} <@${trade.user1}>\n${trade.user2_confirmed ? "✅" : "❌"} <@${trade.user2}>` }
      )
      .setColor(0x9b59b6);

    return message.channel.send({ embeds: [embed] });
  }

  if (subcommand === "confirm") {
    let trade = null;
    let tradeKey = null;
    for (const [key, t] of activeTrades) {
      if (t.user1 === userId || t.user2 === userId) { trade = t; tradeKey = key; break; }
    }
    if (!trade) return message.reply("You don't have an active trade!");

    if (trade.user1 === userId) trade.user1_confirmed = true;
    else trade.user2_confirmed = true;

    if (trade.user1_confirmed && trade.user2_confirmed) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const id of trade.offers1) {
          const check = await client.query("SELECT user_id, favorite FROM pokemon WHERE id = $1 FOR UPDATE", [id]);
          if (check.rows.length === 0 || check.rows[0].user_id !== trade.user1 || check.rows[0].favorite) {
            await client.query("ROLLBACK");
            activeTrades.delete(tradeKey);
            return message.reply("Trade failed: a Pokemon is no longer available or is favorited.");
          }
          await client.query("UPDATE pokemon SET user_id = $1 WHERE id = $2", [trade.user2, id]);
        }
        for (const id of trade.offers2) {
          const check = await client.query("SELECT user_id, favorite FROM pokemon WHERE id = $1 FOR UPDATE", [id]);
          if (check.rows.length === 0 || check.rows[0].user_id !== trade.user2 || check.rows[0].favorite) {
            await client.query("ROLLBACK");
            activeTrades.delete(tradeKey);
            return message.reply("Trade failed: a Pokemon is no longer available or is favorited.");
          }
          await client.query("UPDATE pokemon SET user_id = $1 WHERE id = $2", [trade.user1, id]);
        }
        await client.query("COMMIT");
        activeTrades.delete(tradeKey);
        return message.channel.send("Trade completed successfully! Both parties have received their Pokemon.");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        return message.reply("Trade failed. Please try again.");
      } finally {
        client.release();
      }
    } else {
      return message.reply("You have confirmed the trade. Waiting for the other person to confirm.");
    }
  }

  const mentioned = message.mentions.users.first();
  if (!mentioned) return message.reply("Please mention a user to trade with!");
  if (mentioned.id === userId) return message.reply("You can't trade with yourself!");
  if (mentioned.bot) return message.reply("You can't trade with a bot!");

  for (const [key, t] of activeTrades) {
    if (t.user1 === userId || t.user2 === userId) {
      return message.reply("You already have an active trade! Cancel it first with `p!trade cancel`.");
    }
  }

  const tradeKey = `${userId}-${mentioned.id}`;
  activeTrades.set(tradeKey, {
    user1: userId,
    user2: mentioned.id,
    offers1: [],
    offers2: [],
    user1_confirmed: false,
    user2_confirmed: false
  });

  const embed = new EmbedBuilder()
    .setTitle("Trade Started!")
    .setDescription(
      `${message.author} wants to trade with ${mentioned}!\n\n` +
      `Use \`p!trade add <pokemon id>\` to add Pokemon\n` +
      `Use \`p!trade remove <pokemon id>\` to remove Pokemon\n` +
      `Use \`p!trade info\` to see current offers\n` +
      `Use \`p!trade confirm\` when ready\n` +
      `Use \`p!trade cancel\` to cancel`
    )
    .setColor(0x9b59b6);

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "trade", aliases: ["t"], description: "Trade Pokemon with another user", execute };
