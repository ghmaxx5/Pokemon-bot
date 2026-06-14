const { pool } = require("../database");

async function getPokemonIdByPosition(userId, position) {
  const pos = parseInt(position);
  if (isNaN(pos) || pos < 1) return null;

  const result = await pool.query(
    "SELECT id FROM pokemon WHERE user_id = $1 ORDER BY id ASC",
    [userId]
  );
  if (pos > result.rows.length) return null;
  return result.rows[pos - 1].id;
}

module.exports = { getPokemonIdByPosition };
