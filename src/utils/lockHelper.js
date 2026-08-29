// ── Pokémon locks ─────────────────────────────────────────────────────
// A Pokémon that is listed on the market or staked in an open trade must not
// be released, evolved, or otherwise mutated out from under the other party.
// Every command that changes identity or ownership goes through here.

const { pool } = require("../database");

/**
 * @returns {Promise<null | { reason: "market" | "trade", label: string }>}
 */
async function getPokemonLock(pokemonDbId) {
  if (!pokemonDbId) return null;

  try {
    const listed = await pool.query(
      "SELECT 1 FROM market_listings WHERE pokemon_db_id = $1 LIMIT 1",
      [pokemonDbId]
    );
    if (listed.rows.length > 0) {
      return { reason: "market", label: "listed on the market" };
    }
  } catch (err) {
    console.error("Market lock check failed:", err);
  }

  try {
    // Required lazily: trade.js pulls in this module too.
    const { isPokemonInActiveTrade } = require("../commands/trade");
    if (typeof isPokemonInActiveTrade === "function" && isPokemonInActiveTrade(pokemonDbId)) {
      return { reason: "trade", label: "part of an active trade" };
    }
  } catch (err) {
    console.error("Trade lock check failed:", err);
  }

  return null;
}

async function isPokemonLocked(pokemonDbId) {
  return (await getPokemonLock(pokemonDbId)) !== null;
}

module.exports = { getPokemonLock, isPokemonLocked };
