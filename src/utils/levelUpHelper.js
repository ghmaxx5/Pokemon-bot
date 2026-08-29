const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonByName, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, getTypeEmoji, xpForLevel } = require("./helpers");
const { getNewMovesAtLevel } = require("../data/learnsets");
const { getPokemonLock } = require("./lockHelper");

const prefixCache = new Map();
const PREFIX_TTL = 5 * 60 * 1000;

async function getPrefix(messageChannel) {
  const guildId = messageChannel?.guild?.id;
  if (!guildId) return "c!";

  const cached = prefixCache.get(guildId);
  if (cached && Date.now() - cached.at < PREFIX_TTL) return cached.prefix;

  let prefix = "c!";
  try {
    const res = await pool.query("SELECT prefix FROM server_config WHERE guild_id = $1", [guildId]);
    if (res.rows.length > 0 && res.rows[0].prefix) prefix = res.rows[0].prefix;
  } catch (err) {
    // fall back to the default
  }
  prefixCache.set(guildId, { prefix, at: Date.now() });
  return prefix;
}

/**
 * Adds XP and levels up as many times as the XP covers.
 *
 * Levelling used to zero the XP bar, so every level threw away the overflow
 * and a big XP award could only ever grant a single level. Overflow now
 * carries into the next level, and one award can chain several level-ups.
 *
 * @returns {Promise<null | { previousLevel, newLevel, levelsGained, xp, evolvedTarget }>}
 */
async function addXp(userId, pokemonDbId, amount, messageChannel) {
  if (!(amount > 0)) return null;

  const client = await pool.connect();
  let state = null;
  try {
    await client.query("BEGIN");
    const res = await client.query(
      "SELECT * FROM pokemon WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [pokemonDbId, userId]
    );
    if (res.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const p = res.rows[0];
    if (p.level >= 100) {
      await client.query("ROLLBACK");
      return null;
    }

    let level = p.level;
    let xp = (p.xp || 0) + amount;
    while (level < 100 && xp >= xpForLevel(level)) {
      xp -= xpForLevel(level);
      level++;
    }
    if (level >= 100) xp = 0;

    await client.query("UPDATE pokemon SET level = $1, xp = $2 WHERE id = $3", [level, xp, pokemonDbId]);
    await client.query("COMMIT");

    state = { row: p, previousLevel: p.level, newLevel: level, levelsGained: level - p.level, xp };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  if (state.levelsGained <= 0) {
    return { ...state, evolvedTarget: null };
  }

  const evolvedTarget = await announceLevelUp(userId, pokemonDbId, state, messageChannel);
  return { ...state, evolvedTarget };
}

/**
 * Grants whole levels directly (Rare Candy, admin tools) without touching the
 * XP bar — progress toward the next level is preserved rather than wiped.
 *
 * @returns {Promise<null | { newLevel, evolvedTarget }>}
 */
async function levelUpPokemon(userId, pokemonDbId, levelsToAdd, messageChannel) {
  if (!(levelsToAdd > 0)) return null;

  const client = await pool.connect();
  let state = null;
  try {
    await client.query("BEGIN");
    const res = await client.query(
      "SELECT * FROM pokemon WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [pokemonDbId, userId]
    );
    if (res.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const p = res.rows[0];
    if (p.level >= 100) {
      await client.query("ROLLBACK");
      return null;
    }

    const newLevel = Math.min(100, p.level + levelsToAdd);
    if (newLevel <= p.level) {
      await client.query("ROLLBACK");
      return null;
    }

    // Cap the bar rather than clearing it: a Pokemon sitting on 400/450 XP
    // shouldn't lose that progress because it ate a Rare Candy.
    const cap = newLevel >= 100 ? 0 : Math.max(0, xpForLevel(newLevel) - 1);
    const xp = Math.min(p.xp || 0, cap);

    await client.query("UPDATE pokemon SET level = $1, xp = $2 WHERE id = $3", [newLevel, xp, pokemonDbId]);
    await client.query("COMMIT");

    state = { row: p, previousLevel: p.level, newLevel, levelsGained: newLevel - p.level, xp };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const evolvedTarget = await announceLevelUp(userId, pokemonDbId, state, messageChannel);
  return { newLevel: state.newLevel, evolvedTarget };
}

/** Posts the level-up embed, then walks the level-up evolution chain. */
async function announceLevelUp(userId, pokemonDbId, state, messageChannel) {
  const { row: p, previousLevel, newLevel } = state;
  const data = getPokemonById(p.pokemon_id);
  if (!data) return null;

  const prefix = await getPrefix(messageChannel);
  const displayName = p.nickname || capitalize(data.displayName || data.name);

  const newMoves = [];
  const seen = new Set();
  for (let lv = previousLevel + 1; lv <= newLevel; lv++) {
    for (const move of getNewMovesAtLevel(data.types, lv, p.pokemon_id)) {
      if (seen.has(move.name)) continue;
      seen.add(move.name);
      newMoves.push(move);
    }
  }

  let moveText = "";
  if (newMoves.length > 0) {
    const shown = newMoves.slice(0, 8);
    moveText =
      "\n\n**New Moves Learned**\n" +
      shown.map(m => `${getTypeEmoji(m.type)} **${m.name}** — ${capitalize(m.type)} · ${m.power || "—"} pow · ${m.accuracy}% acc`).join("\n") +
      (newMoves.length > shown.length ? `\n…and ${newMoves.length - shown.length} more` : "") +
      `\n\nUse \`${prefix}moves\` to equip them!`;
  }

  const gained = newLevel - previousLevel;
  if (messageChannel) {
    const embed = new EmbedBuilder()
      .setTitle(gained > 1 ? `⬆️ Level Up ×${gained}!` : "⬆️ Level Up!")
      .setDescription(
        `Your ${p.shiny ? "✨ " : ""}**${displayName}** grew from **Lv. ${previousLevel}** to **Lv. ${newLevel}**!${moveText}`
      )
      .setColor(0x2ecc71)
      .setThumbnail(getPokemonImage(p.pokemon_id, p.shiny));
    messageChannel.send({ embeds: [embed] }).catch(() => {});
  }

  return evolveChain(userId, pokemonDbId, p, data, newLevel, messageChannel);
}

/**
 * Follows the level-up evolution chain as far as the new level allows.
 * Item- and trade-triggered branches are deliberately skipped here; those
 * belong to `c!evolve` and to trading.
 */
async function evolveChain(userId, pokemonDbId, row, data, level, messageChannel) {
  // Never mutate a Pokémon that someone else has a claim on — the buyer of a
  // market listing (or a trade partner) agreed to a specific Pokémon.
  const lock = await getPokemonLock(pokemonDbId);
  if (lock) return null;

  let currentData = data;
  let evolvedTarget = null;
  let activeName = row.nickname || capitalize(data.displayName || data.name);
  let guard = 0;

  while (currentData && guard++ < 10) {
    const candidates = (currentData.evolutionTo || []).filter(
      evo => !evo.item &&
        (evo.trigger === "level-up" || !evo.trigger) &&
        evo.level && level >= evo.level
    );
    if (candidates.length === 0) break;

    // Wurmple and Tyrogue branch at a single level — pick one so both
    // outcomes are actually reachable instead of always taking branch 0.
    const evo = candidates[Math.floor(Math.random() * candidates.length)];
    const evoTarget = getPokemonByName(evo.to);
    if (!evoTarget) break;

    try {
      // The nickname used to be wiped on every evolution.
      await pool.query("UPDATE pokemon SET pokemon_id = $1 WHERE id = $2", [evoTarget.id, pokemonDbId]);
      await pool.query(
        "INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, evoTarget.id]
      );
    } catch (err) {
      console.error("Evolution update failed:", err);
      break;
    }

    const previousName = activeName;
    evolvedTarget = evoTarget;
    // A nicknamed Pokémon keeps its nickname, so only the species label changes.
    activeName = row.nickname || capitalize(evoTarget.displayName || evoTarget.name);

    if (messageChannel) {
      const evoEmbed = new EmbedBuilder()
        .setTitle("🎉 What? Your Pokémon is evolving!")
        .setDescription(
          `Your ${row.shiny ? "✨ " : ""}**${previousName}** evolved into **${capitalize(evoTarget.displayName || evoTarget.name)}**!` +
          (row.nickname ? `\n\nIt kept the nickname **${row.nickname}**.` : "")
        )
        .setColor(0x9b59b6)
        .setImage(getPokemonImage(evoTarget.id, row.shiny));
      messageChannel.send({ embeds: [evoEmbed] }).catch(() => {});
    }

    currentData = evoTarget;
  }

  return evolvedTarget;
}

module.exports = { addXp, levelUpPokemon, evolveChain };
