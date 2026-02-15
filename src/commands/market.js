const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, totalIV } = require("../utils/helpers");

async function execute(message, args) {
  const userId = message.author.id;

  if (!args.length) {
    return showListings(message, 1);
  }

  const subcommand = args[0].toLowerCase();

  if (subcommand === "list" || subcommand === "add") {
    if (args.length < 3) return message.reply("Usage: `p!market list <pokemon id> <price>`");
    const pokemonDbId = parseInt(args[1]);
    const price = parseInt(args[2]);

    if (isNaN(pokemonDbId) || isNaN(price) || price < 1) {
      return message.reply("Invalid Pokemon ID or price.");
    }
    if (price > 10000000) return message.reply("Maximum listing price is 10,000,000 credits.");

    const poke = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
    if (poke.rows.length === 0) return message.reply("You don't own that Pokemon.");
    if (poke.rows[0].favorite) return message.reply("You can't list a favorited Pokemon!");

    const user = await pool.query("SELECT selected_pokemon_id FROM users WHERE user_id = $1", [userId]);
    if (user.rows[0].selected_pokemon_id === pokemonDbId) {
      return message.reply("You can't list your selected Pokemon! Select a different one first.");
    }

    const existing = await pool.query("SELECT 1 FROM market_listings WHERE pokemon_db_id = $1", [pokemonDbId]);
    if (existing.rows.length > 0) return message.reply("That Pokemon is already listed on the market.");

    await pool.query(
      "INSERT INTO market_listings (seller_id, pokemon_db_id, price) VALUES ($1, $2, $3)",
      [userId, pokemonDbId, price]
    );

    const data = getPokemonById(poke.rows[0].pokemon_id);
    const name = poke.rows[0].nickname || (data ? capitalize(data.name) : `#${poke.rows[0].pokemon_id}`);
    return message.reply(`Listed **${name}** on the market for **${price.toLocaleString()}** credits!`);
  }

  if (subcommand === "buy") {
    if (!args[1] || isNaN(args[1])) return message.reply("Usage: `p!market buy <listing id>`");
    const listingId = parseInt(args[1]);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const listing = await client.query(
        "SELECT ml.*, p.pokemon_id, p.nickname, p.level, p.shiny FROM market_listings ml JOIN pokemon p ON ml.pokemon_db_id = p.id WHERE ml.id = $1 FOR UPDATE",
        [listingId]
      );
      if (listing.rows.length === 0) { await client.query("ROLLBACK"); return message.reply("That listing doesn't exist or was already bought."); }
      const l = listing.rows[0];
      if (l.seller_id === userId) { await client.query("ROLLBACK"); return message.reply("You can't buy your own listing!"); }

      const buyer = await client.query("SELECT balance FROM users WHERE user_id = $1 FOR UPDATE", [userId]);
      if (buyer.rows.length === 0) { await client.query("ROLLBACK"); return message.reply("You haven't started yet!"); }
      if (buyer.rows[0].balance < l.price) { await client.query("ROLLBACK"); return message.reply("You don't have enough credits!"); }

      await client.query("UPDATE users SET balance = balance - $1 WHERE user_id = $2", [l.price, userId]);
      await client.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [l.price, l.seller_id]);
      await client.query("UPDATE pokemon SET user_id = $1 WHERE id = $2", [userId, l.pokemon_db_id]);
      await client.query("DELETE FROM market_listings WHERE id = $1", [listingId]);
      await client.query("COMMIT");

      const data = getPokemonById(l.pokemon_id);
      const name = l.nickname || (data ? capitalize(data.name) : `#${l.pokemon_id}`);
      message.reply(`You bought **${name}** for **${l.price.toLocaleString()}** credits!`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      message.reply("Purchase failed. Please try again.");
    } finally {
      client.release();
    }
    return;
  }

  if (subcommand === "remove" || subcommand === "unlist") {
    if (!args[1] || isNaN(args[1])) return message.reply("Usage: `p!market remove <listing id>`");
    const listingId = parseInt(args[1]);

    const listing = await pool.query("SELECT * FROM market_listings WHERE id = $1 AND seller_id = $2", [listingId, userId]);
    if (listing.rows.length === 0) return message.reply("That listing doesn't exist or isn't yours.");

    await pool.query("DELETE FROM market_listings WHERE id = $1", [listingId]);
    return message.reply("Listing removed from market.");
  }

  if (subcommand === "search") {
    const query = args.slice(1).join(" ").toLowerCase();
    return showListings(message, 1, query);
  }

  if (!isNaN(subcommand)) {
    return showListings(message, parseInt(subcommand));
  }

  return showListings(message, 1);
}

async function showListings(message, page = 1, search = null) {
  let query = `
    SELECT ml.id as listing_id, ml.price, ml.listed_at, ml.seller_id,
           p.id as pokemon_db_id, p.pokemon_id, p.nickname, p.level, p.shiny,
           p.iv_hp, p.iv_atk, p.iv_def, p.iv_spatk, p.iv_spdef, p.iv_spd
    FROM market_listings ml
    JOIN pokemon p ON ml.pokemon_db_id = p.id
    ORDER BY ml.listed_at DESC
  `;
  const result = await pool.query(query);
  let listings = result.rows;

  if (search) {
    listings = listings.filter(l => {
      const data = getPokemonById(l.pokemon_id);
      return data && data.name.toLowerCase().includes(search);
    });
  }

  if (listings.length === 0) {
    return message.reply("No listings found on the market.");
  }

  const perPage = 15;
  const totalPages = Math.ceil(listings.length / perPage);
  page = Math.max(1, Math.min(page, totalPages));
  const start = (page - 1) * perPage;
  const pageItems = listings.slice(start, start + perPage);

  let description = "";
  for (const l of pageItems) {
    const data = getPokemonById(l.pokemon_id);
    const name = l.nickname || (data ? capitalize(data.name) : `#${l.pokemon_id}`);
    const shiny = l.shiny ? " ✨" : "";
    const iv = ((l.iv_hp + l.iv_atk + l.iv_def + l.iv_spatk + l.iv_spdef + l.iv_spd) / 186 * 100).toFixed(2);
    description += `**#${l.listing_id}** — ${shiny}**${name}** | Lv. ${l.level} | IV: ${iv}% | **${l.price.toLocaleString()}** credits\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle("Pokemon Market")
    .setDescription(description)
    .setFooter({ text: `Page ${page}/${totalPages} | ${listings.length} total listings | Use p!market buy <id> to purchase` })
    .setColor(0xf39c12);

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "market", aliases: ["m", "shop"], description: "Buy and sell Pokemon on the market", execute };
