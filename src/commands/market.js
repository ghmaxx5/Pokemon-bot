const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage, getAllPokemon } = require("../data/pokemonLoader");
const { capitalize, totalIV } = require("../utils/helpers");
const { getPokemonIdByPosition } = require("../utils/positionHelper");
const { getRarityInfo } = require("../data/rarity");

const PER_PAGE = 12;
const PAGE_TIMEOUT = 3 * 60 * 1000;
const MAX_PRICE = 10_000_000;

const IV_SUM = "(p.iv_hp + p.iv_atk + p.iv_def + p.iv_spatk + p.iv_spdef + p.iv_spd)";

const SORTS = {
  recent:   { label: "Newest first",     sql: "ml.listed_at DESC" },
  oldest:   { label: "Oldest first",     sql: "ml.listed_at ASC" },
  price:    { label: "Cheapest first",   sql: "ml.price ASC" },
  pricedesc:{ label: "Priciest first",   sql: "ml.price DESC" },
  iv:       { label: "Highest IV first", sql: `${IV_SUM} DESC` },
  ivasc:    { label: "Lowest IV first",  sql: `${IV_SUM} ASC` },
  level:    { label: "Highest level",    sql: "p.level DESC" },
  levelasc: { label: "Lowest level",     sql: "p.level ASC" },
  dex:      { label: "Pokédex number",   sql: "p.pokemon_id ASC" }
};

const SORT_ALIASES = {
  new: "recent", newest: "recent", latest: "recent",
  old: "oldest",
  cheap: "price", cheapest: "price", lowprice: "price", priceasc: "price",
  expensive: "pricedesc", pricey: "pricedesc", highprice: "pricedesc",
  bestiv: "iv", highiv: "iv", lowiv: "ivasc", "iv-asc": "ivasc",
  lvl: "level", highlevel: "level", lowlevel: "levelasc", "level-asc": "levelasc",
  pokedex: "dex", number: "dex"
};

// getAllPokemon() returns a Map keyed by id, so it has to be materialised
// before it can be filtered. Cached because the dex never changes at runtime.
let speciesCache = null;
function allSpecies() {
  if (!speciesCache) speciesCache = [...getAllPokemon().values()];
  return speciesCache;
}

/** Resolves a free-text species query to pokemon_ids so filtering happens in SQL. */
function speciesIdsMatching(term) {
  const needle = term.toLowerCase().trim();
  if (!needle) return null;
  const ids = [];
  for (const p of allSpecies()) {
    const name = String(p.name || "").toLowerCase();
    const display = String(p.displayName || "").toLowerCase();
    if (name.includes(needle) || display.includes(needle)) ids.push(p.id);
  }
  return ids;
}

function speciesIdsWhere(predicate) {
  return allSpecies().filter(predicate).map(p => p.id);
}

/**
 * Parses market filters. Every old invocation still works: a bare number is a
 * page, `search <term>` is a name filter, and no args means page 1 unfiltered.
 */
function parseFilters(args) {
  const f = { page: 1, sort: "recent", nameTerm: null, mine: false, sellerId: null, unknown: [] };
  const rest = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const lower = a.toLowerCase();
    const takeValue = () => (i + 1 < args.length && !args[i + 1].startsWith("-") ? args[++i] : null);
    const num = () => {
      const v = takeValue();
      return v !== null && /^\d+$/.test(v.replace(/[,_]/g, "")) ? parseInt(v.replace(/[,_]/g, ""), 10) : null;
    };

    switch (lower) {
      case "--page": case "-p": { const v = num(); if (v) f.page = v; continue; }
      case "--name": case "--search": case "-n": { const v = takeValue(); if (v) f.nameTerm = v; continue; }
      case "--type": case "-t": { const v = takeValue(); if (v) f.type = v.toLowerCase(); continue; }
      case "--sort": case "-s": { const v = takeValue(); if (v) f.sortRaw = v.toLowerCase(); continue; }
      case "--minlevel": case "--minlvl": { const v = num(); if (v !== null) f.minLevel = v; continue; }
      case "--maxlevel": case "--maxlvl": { const v = num(); if (v !== null) f.maxLevel = v; continue; }
      case "--miniv": { const v = num(); if (v !== null) f.minIv = v; continue; }
      case "--maxiv": { const v = num(); if (v !== null) f.maxIv = v; continue; }
      case "--minprice": case "--min": { const v = num(); if (v !== null) f.minPrice = v; continue; }
      case "--maxprice": case "--max": { const v = num(); if (v !== null) f.maxPrice = v; continue; }
      case "--shiny": f.shiny = true; continue;
      case "--legendary": f.legendary = true; continue;
      case "--mythical": f.mythical = true; continue;
      case "--mine": case "--own": f.mine = true; continue;
      // Bare sort flags, mirroring `c!pokemon`.
      case "--iv": f.sortRaw = "iv"; continue;
      case "--level": case "--lvl": f.sortRaw = "level"; continue;
      case "--price": f.sortRaw = "price"; continue;
      case "--recent": f.sortRaw = "recent"; continue;
      case "--cheap": f.sortRaw = "price"; continue;
      default:
        if (lower.startsWith("--")) { f.unknown.push(a); continue; }
        rest.push(a);
    }
  }

  // Leftover words: a lone number is a page, anything else is a name search.
  const words = [];
  for (const r of rest) {
    if (/^\d+$/.test(r)) f.page = parseInt(r, 10);
    else words.push(r);
  }
  if (words.length && !f.nameTerm) f.nameTerm = words.join(" ");

  if (f.sortRaw) f.sort = SORTS[f.sortRaw] ? f.sortRaw : (SORT_ALIASES[f.sortRaw] || "recent");
  if (f.page < 1) f.page = 1;
  return f;
}

/** Builds the WHERE clause and params. Filtering and paging both happen in SQL. */
function buildWhere(f, viewerId) {
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace("$?", `$${params.length}`)); };

  if (f.mine) add("ml.seller_id = $?", viewerId);
  if (f.sellerId) add("ml.seller_id = $?", f.sellerId);
  if (f.shiny) where.push("p.shiny = TRUE");
  if (f.minLevel !== undefined) add("p.level >= $?", f.minLevel);
  if (f.maxLevel !== undefined) add("p.level <= $?", f.maxLevel);
  if (f.minPrice !== undefined) add("ml.price >= $?", f.minPrice);
  if (f.maxPrice !== undefined) add("ml.price <= $?", f.maxPrice);
  // IVs are stored per-stat, so the percentage filter converts to a raw sum.
  if (f.minIv !== undefined) add(`${IV_SUM} >= $?`, Math.round((f.minIv / 100) * 186));
  if (f.maxIv !== undefined) add(`${IV_SUM} <= $?`, Math.round((f.maxIv / 100) * 186));

  // Species-level predicates aren't columns, so they resolve to an id list.
  const idSets = [];
  if (f.nameTerm) idSets.push(speciesIdsMatching(f.nameTerm) || []);
  if (f.type) idSets.push(speciesIdsWhere(p => (p.types || []).some(t => String(t).toLowerCase() === f.type)));
  if (f.legendary) idSets.push(speciesIdsWhere(p => p.isLegendary));
  if (f.mythical) idSets.push(speciesIdsWhere(p => p.isMythical));

  if (idSets.length > 0) {
    let ids = idSets[0];
    for (let i = 1; i < idSets.length; i++) {
      const next = new Set(idSets[i]);
      ids = ids.filter(id => next.has(id));
    }
    if (ids.length === 0) return { sql: "WHERE FALSE", params: [], empty: true };
    add("p.pokemon_id = ANY($?::int[])", ids);
  }

  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params, empty: false };
}

async function fetchPage(f, viewerId, page) {
  const { sql: whereSql, params } = buildWhere(f, viewerId);

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM market_listings ml JOIN pokemon p ON ml.pokemon_db_id = p.id ${whereSql}`,
    params
  );
  const total = countRes.rows[0].n;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  // LIMIT/OFFSET instead of pulling the whole table into Node on every call.
  const rowsRes = await pool.query(
    `SELECT ml.id AS listing_id, ml.price, ml.listed_at, ml.seller_id,
            p.id AS pokemon_db_id, p.pokemon_id, p.nickname, p.level, p.shiny, p.nature,
            p.iv_hp, p.iv_atk, p.iv_def, p.iv_spatk, p.iv_spdef, p.iv_spd
     FROM market_listings ml
     JOIN pokemon p ON ml.pokemon_db_id = p.id
     ${whereSql}
     ORDER BY ${SORTS[f.sort].sql}, ml.id DESC
     LIMIT ${PER_PAGE} OFFSET ${(safePage - 1) * PER_PAGE}`,
    params
  );

  return { rows: rowsRes.rows, total, totalPages, page: safePage };
}

function describeFilters(f) {
  const bits = [];
  if (f.mine) bits.push("your listings");
  if (f.nameTerm) bits.push(`name ~ "${f.nameTerm}"`);
  if (f.type) bits.push(`${capitalize(f.type)} type`);
  if (f.shiny) bits.push("shiny");
  if (f.legendary) bits.push("legendary");
  if (f.mythical) bits.push("mythical");
  if (f.minLevel !== undefined) bits.push(`Lv ≥ ${f.minLevel}`);
  if (f.maxLevel !== undefined) bits.push(`Lv ≤ ${f.maxLevel}`);
  if (f.minIv !== undefined) bits.push(`IV ≥ ${f.minIv}%`);
  if (f.maxIv !== undefined) bits.push(`IV ≤ ${f.maxIv}%`);
  if (f.minPrice !== undefined) bits.push(`≥ ${f.minPrice.toLocaleString()}`);
  if (f.maxPrice !== undefined) bits.push(`≤ ${f.maxPrice.toLocaleString()}`);
  return bits;
}

function listingLine(l) {
  const data = getPokemonById(l.pokemon_id);
  const name = l.nickname || (data ? capitalize(data.displayName || data.name) : `#${l.pokemon_id}`);
  const iv = totalIV({ hp: l.iv_hp, atk: l.iv_atk, def: l.iv_def, spatk: l.iv_spatk, spdef: l.iv_spdef, spd: l.iv_spd });
  const tier = data ? getRarityInfo(data) : null;
  return `\`#${String(l.listing_id).padStart(5)}\` ${tier ? tier.emoji : "⚪"} ${l.shiny ? "✨" : ""}**${name}** · Lv ${l.level} · IV ${iv}% · 🪙 **${l.price.toLocaleString()}**`;
}

function buildEmbed(f, result, prefix) {
  if (result.rows.length === 0) {
    const filters = describeFilters(f);
    return new EmbedBuilder()
      .setTitle("🏪 Pokémon Market")
      .setDescription(
        filters.length
          ? `No listings match: ${filters.join(" · ")}.\n\nTry \`${prefix}market\` with no filters.`
          : `The market is empty. List something with \`${prefix}market list <position> <price>\`.`
      )
      .setColor(0xf39c12);
  }

  const filters = describeFilters(f);
  return new EmbedBuilder()
    .setTitle("🏪 Pokémon Market")
    .setDescription(
      (filters.length ? `**Filters:** ${filters.join(" · ")}\n\n` : "") +
      result.rows.map(listingLine).join("\n") +
      `\n\nBuy with \`${prefix}market buy <id>\` · details with \`${prefix}market info <id>\``
    )
    .setFooter({ text: `Page ${result.page}/${result.totalPages} · ${result.total} listing${result.total === 1 ? "" : "s"} · Sorted by ${SORTS[f.sort].label}` })
    .setColor(0xf39c12);
}

function buildRow(result) {
  if (result.totalPages <= 1) return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("mk_first").setLabel("«").setStyle(ButtonStyle.Secondary).setDisabled(result.page === 1),
    new ButtonBuilder().setCustomId("mk_prev").setLabel("◀ Prev").setStyle(ButtonStyle.Primary).setDisabled(result.page === 1),
    new ButtonBuilder().setCustomId("mk_page").setLabel(`${result.page}/${result.totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId("mk_next").setLabel("Next ▶").setStyle(ButtonStyle.Primary).setDisabled(result.page === result.totalPages),
    new ButtonBuilder().setCustomId("mk_last").setLabel("»").setStyle(ButtonStyle.Secondary).setDisabled(result.page === result.totalPages)
  )];
}

async function showListings(message, f, prefix) {
  const viewerId = message.author.id;
  let result = await fetchPage(f, viewerId, f.page);

  const sent = await message.channel.send({
    embeds: [buildEmbed(f, result, prefix)],
    components: buildRow(result)
  });

  if (result.totalPages <= 1) return;

  const collector = sent.createMessageComponentCollector({
    filter: i => i.customId.startsWith("mk_"),
    time: PAGE_TIMEOUT
  });

  collector.on("collect", async (interaction) => {
    if (interaction.user.id !== viewerId) {
      return interaction.reply({ content: "Run your own `market` to browse.", ephemeral: true }).catch(() => {});
    }

    const target =
      interaction.customId === "mk_first" ? 1 :
      interaction.customId === "mk_last" ? result.totalPages :
      interaction.customId === "mk_prev" ? result.page - 1 :
      result.page + 1;

    // Re-query rather than paging a stale snapshot: listings appear and sell
    // while someone is browsing.
    result = await fetchPage(f, viewerId, target);
    await interaction.update({
      embeds: [buildEmbed(f, result, prefix)],
      components: buildRow(result)
    }).catch(() => {});
  });

  collector.on("end", () => { sent.edit({ components: [] }).catch(() => {}); });
}

async function showListingInfo(message, listingId, prefix) {
  const res = await pool.query(
    `SELECT ml.id AS listing_id, ml.price, ml.listed_at, ml.seller_id, p.*
     FROM market_listings ml JOIN pokemon p ON ml.pokemon_db_id = p.id WHERE ml.id = $1`,
    [listingId]
  );
  if (res.rows.length === 0) return message.reply("That listing doesn't exist or was already bought.");

  const l = res.rows[0];
  const data = getPokemonById(l.pokemon_id);
  const name = l.nickname || (data ? capitalize(data.displayName || data.name) : `#${l.pokemon_id}`);
  const tier = data ? getRarityInfo(data) : null;
  const iv = totalIV({ hp: l.iv_hp, atk: l.iv_atk, def: l.iv_def, spatk: l.iv_spatk, spdef: l.iv_spdef, spd: l.iv_spd });

  return message.channel.send({
    embeds: [new EmbedBuilder()
      .setTitle(`${l.shiny ? "✨ " : ""}${name} — 🪙 ${l.price.toLocaleString()}`)
      .setDescription(
        `**Listing:** \`#${l.listing_id}\`   **Seller:** <@${l.seller_id}>\n` +
        `**Species:** ${data ? capitalize(data.displayName || data.name) : `#${l.pokemon_id}`}` +
        (tier ? `   ${tier.emoji} ${tier.label}` : "") + "\n" +
        `**Level:** ${l.level}   **Total IV:** ${iv}%   **Nature:** ${l.nature ? capitalize(l.nature) : "—"}\n\n` +
        `**IVs** — HP ${l.iv_hp} · Atk ${l.iv_atk} · Def ${l.iv_def} · SpA ${l.iv_spatk} · SpD ${l.iv_spdef} · Spe ${l.iv_spd}\n\n` +
        `Buy it with \`${prefix}market buy ${l.listing_id}\`.`
      )
      .setThumbnail(getPokemonImage(l.pokemon_id, l.shiny))
      .setColor(tier ? tier.color : 0xf39c12)]
  });
}

async function doList(message, args, prefix) {
  const userId = message.author.id;
  if (args.length < 3) return message.reply(`Usage: \`${prefix}market list <position> <price>\``);

  const rawPos = args[1];
  const rawPrice = String(args[2]).replace(/[,_]/g, "");
  if (!/^\d+$/.test(rawPos) || !/^\d+$/.test(rawPrice)) {
    return message.reply(`Usage: \`${prefix}market list <position> <price>\` — both must be whole numbers.`);
  }

  const position = parseInt(rawPos, 10);
  const price = parseInt(rawPrice, 10);
  if (price < 1) return message.reply("The price must be at least 1 Cybercoin.");
  if (price > MAX_PRICE) return message.reply(`Maximum listing price is ${MAX_PRICE.toLocaleString()} Cybercoins.`);

  const pokemonDbId = await getPokemonIdByPosition(userId, position);
  if (!pokemonDbId) return message.reply("You don't have a Pokémon at that position.");

  const { isPokemonInActiveTrade } = require("./trade");
  if (isPokemonInActiveTrade(pokemonDbId)) {
    return message.reply("That Pokémon is part of an active trade. Remove it from the trade first.");
  }

  // Locking the row closes the window where two `market list` calls raced;
  // the unique index on pokemon_db_id is the second line of defence.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const poke = await client.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2 FOR UPDATE", [pokemonDbId, userId]);
    if (poke.rows.length === 0) { await client.query("ROLLBACK"); return message.reply("You don't own that Pokémon."); }
    const p = poke.rows[0];
    if (p.favorite) { await client.query("ROLLBACK"); return message.reply(`That Pokémon is favorited. Unfavorite it with \`${prefix}unfav ${position}\` first.`); }

    const user = await client.query("SELECT selected_pokemon_id FROM users WHERE user_id = $1", [userId]);
    if (user.rows[0]?.selected_pokemon_id === pokemonDbId) {
      await client.query("ROLLBACK");
      return message.reply(`That's your selected Pokémon. Pick another with \`${prefix}select <position>\` first.`);
    }

    const existing = await client.query("SELECT id FROM market_listings WHERE pokemon_db_id = $1", [pokemonDbId]);
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return message.reply(`That Pokémon is already listed as \`#${existing.rows[0].id}\`.`);
    }

    const inserted = await client.query(
      "INSERT INTO market_listings (seller_id, pokemon_db_id, price) VALUES ($1, $2, $3) RETURNING id",
      [userId, pokemonDbId, price]
    );
    await client.query("COMMIT");

    const data = getPokemonById(p.pokemon_id);
    const name = p.nickname || (data ? capitalize(data.displayName || data.name) : `#${p.pokemon_id}`);
    const iv = totalIV({ hp: p.iv_hp, atk: p.iv_atk, def: p.iv_def, spatk: p.iv_spatk, spdef: p.iv_spdef, spd: p.iv_spd });

    return message.reply({
      embeds: [new EmbedBuilder()
        .setTitle("🏪 Listed on the Market")
        .setDescription(
          `${p.shiny ? "✨ " : ""}**${name}** · Lv ${p.level} · IV ${iv}%\n\n` +
          `**Price:** 🪙 ${price.toLocaleString()}\n**Listing ID:** \`#${inserted.rows[0].id}\`\n\n` +
          `Unlist it any time with \`${prefix}market unlist ${inserted.rows[0].id}\`.`
        )
        .setThumbnail(getPokemonImage(p.pokemon_id, p.shiny))
        .setColor(0x2ecc71)]
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Market listing failed:", err);
    if (err.code === "23505" || err.code === "23P01") {
      return message.reply("That Pokémon is already listed on the market.");
    }
    return message.reply("Couldn't list that Pokémon — nothing was changed.");
  } finally {
    client.release();
  }
}

async function doBuy(message, args, prefix) {
  const userId = message.author.id;
  const raw = String(args[1] || "").replace(/^#/, "");
  if (!/^\d+$/.test(raw)) return message.reply(`Usage: \`${prefix}market buy <listing id>\``);
  const listingId = parseInt(raw, 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const listing = await client.query(
      `SELECT ml.*, p.pokemon_id, p.nickname, p.level, p.shiny,
              p.iv_hp, p.iv_atk, p.iv_def, p.iv_spatk, p.iv_spdef, p.iv_spd,
              p.user_id AS current_owner
       FROM market_listings ml JOIN pokemon p ON ml.pokemon_db_id = p.id
       WHERE ml.id = $1 FOR UPDATE`,
      [listingId]
    );
    if (listing.rows.length === 0) { await client.query("ROLLBACK"); return message.reply("That listing doesn't exist or was already bought."); }

    const l = listing.rows[0];
    if (l.seller_id === userId) { await client.query("ROLLBACK"); return message.reply(`That's your own listing. Remove it with \`${prefix}market unlist ${listingId}\`.`); }

    if (l.current_owner !== l.seller_id) {
      await client.query("DELETE FROM market_listings WHERE id = $1", [listingId]);
      await client.query("COMMIT");
      return message.reply("That listing is no longer valid — the seller no longer owns the Pokémon. It has been removed.");
    }

    const buyer = await client.query("SELECT balance FROM users WHERE user_id = $1 AND started = TRUE FOR UPDATE", [userId]);
    if (buyer.rows.length === 0) { await client.query("ROLLBACK"); return message.reply(`You haven't started yet! Use \`${prefix}start\`.`); }
    if (buyer.rows[0].balance < l.price) {
      await client.query("ROLLBACK");
      return message.reply(`You need 🪙 **${l.price.toLocaleString()}** but only have 🪙 **${buyer.rows[0].balance.toLocaleString()}**.`);
    }

    await client.query("UPDATE users SET balance = balance - $1 WHERE user_id = $2", [l.price, userId]);
    await client.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [l.price, l.seller_id]);
    // The favorite flag belonged to the seller, so it's cleared on transfer.
    await client.query("UPDATE pokemon SET user_id = $1, favorite = FALSE WHERE id = $2", [userId, l.pokemon_db_id]);
    // The buyer's Pokédex used to miss species obtained through the market.
    await client.query(
      "INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [userId, l.pokemon_id]
    );
    // A seller who re-selected the Pokémon after listing it would otherwise be
    // left pointing at a Pokémon they no longer own.
    await client.query(
      `UPDATE users SET selected_pokemon_id = (
         SELECT id FROM pokemon WHERE user_id = $1 ORDER BY id ASC LIMIT 1
       ) WHERE user_id = $1 AND selected_pokemon_id = $2`,
      [l.seller_id, l.pokemon_db_id]
    );
    await client.query("DELETE FROM market_listings WHERE id = $1", [listingId]);
    await client.query("COMMIT");

    const data = getPokemonById(l.pokemon_id);
    const name = l.nickname || (data ? capitalize(data.displayName || data.name) : `#${l.pokemon_id}`);
    const iv = totalIV({ hp: l.iv_hp, atk: l.iv_atk, def: l.iv_def, spatk: l.iv_spatk, spdef: l.iv_spdef, spd: l.iv_spd });

    return message.reply({
      embeds: [new EmbedBuilder()
        .setTitle("🛒 Purchase Complete")
        .setDescription(
          `You bought ${l.shiny ? "✨ " : ""}**${name}** · Lv ${l.level} · IV ${iv}%\n\n` +
          `**Paid:** 🪙 ${l.price.toLocaleString()} to <@${l.seller_id}>\n` +
          `It's now at the end of your collection — see it with \`${prefix}pokemon --recent\`.`
        )
        .setThumbnail(getPokemonImage(l.pokemon_id, l.shiny))
        .setColor(0x2ecc71)]
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Market purchase failed:", err);
    return message.reply("The purchase failed — no coins were spent.");
  } finally {
    client.release();
  }
}

async function doUnlist(message, args, prefix) {
  const userId = message.author.id;
  const raw = String(args[1] || "").replace(/^#/, "");
  if (!/^\d+$/.test(raw)) return message.reply(`Usage: \`${prefix}market unlist <listing id>\` — see yours with \`${prefix}market --mine\`.`);
  const listingId = parseInt(raw, 10);

  const deleted = await pool.query(
    `DELETE FROM market_listings WHERE id = $1 AND seller_id = $2
     RETURNING pokemon_db_id, price`,
    [listingId, userId]
  );
  if (deleted.rows.length === 0) return message.reply("That listing doesn't exist or isn't yours.");

  const poke = await pool.query("SELECT pokemon_id, nickname, shiny FROM pokemon WHERE id = $1", [deleted.rows[0].pokemon_db_id]);
  const p = poke.rows[0];
  const data = p ? getPokemonById(p.pokemon_id) : null;
  const name = p?.nickname || (data ? capitalize(data.displayName || data.name) : "Your Pokémon");

  return message.reply(`🏪 **${name}** was removed from the market.`);
}

async function execute(message, args, spawns, prefix) {
  const sub = (args[0] || "").toLowerCase();

  if (sub === "help") {
    return message.reply({
      embeds: [new EmbedBuilder()
        .setTitle("🏪 Market")
        .setDescription(
          `\`${prefix}market\` — browse the newest listings\n` +
          `\`${prefix}market <page>\` — jump to a page\n` +
          `\`${prefix}market search <name>\` — find a species\n` +
          `\`${prefix}market info <id>\` — full details for a listing\n` +
          `\`${prefix}market list <position> <price>\` — put one up for sale\n` +
          `\`${prefix}market buy <id>\` — purchase a listing\n` +
          `\`${prefix}market unlist <id>\` — take yours back down\n` +
          `\`${prefix}market mine\` — your own listings\n\n` +
          "**Filters** — combine freely\n" +
          "`--name <text>` `--type <type>` `--shiny` `--legendary` `--mythical`\n" +
          "`--minlevel N` `--maxlevel N` `--miniv N` `--maxiv N`\n" +
          "`--minprice N` `--maxprice N` `--mine` `--page N`\n\n" +
          "**Sorts** — `--sort <option>`\n" +
          Object.entries(SORTS).map(([k, v]) => `\`${k}\` — ${v.label}`).join("\n") + "\n\n" +
          `**Example:** \`${prefix}market --type dragon --miniv 80 --sort price\``
        )
        .setColor(0xf39c12)]
    });
  }

  if (sub === "list" || sub === "add" || sub === "sell") return doList(message, args, prefix);
  if (sub === "buy" || sub === "purchase") return doBuy(message, args, prefix);
  if (sub === "remove" || sub === "unlist" || sub === "delist") return doUnlist(message, args, prefix);

  if (sub === "info" || sub === "view" || sub === "show") {
    const raw = String(args[1] || "").replace(/^#/, "");
    if (!/^\d+$/.test(raw)) return message.reply(`Usage: \`${prefix}market info <listing id>\``);
    return showListingInfo(message, parseInt(raw, 10), prefix);
  }

  // `market search <term>` keeps working exactly as before.
  if (sub === "search" || sub === "find") {
    const f = parseFilters(args.slice(1));
    if (!f.nameTerm && !describeFilters(f).length) return message.reply(`Usage: \`${prefix}market search <name>\``);
    return showListings(message, f, prefix);
  }

  if (sub === "mine" || sub === "my" || sub === "listings") {
    const f = parseFilters(args.slice(1));
    f.mine = true;
    return showListings(message, f, prefix);
  }

  const f = parseFilters(args);
  if (f.unknown.length) {
    return message.reply(`Unknown option \`${f.unknown[0]}\`. See \`${prefix}market help\`.`);
  }
  return showListings(message, f, prefix);
}

module.exports = { name: "market", aliases: ["m"], description: "Buy and sell Pokémon on the market", execute };
