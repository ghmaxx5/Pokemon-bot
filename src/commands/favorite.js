const { pool } = require("../database");
const { getPokemonById } = require("../data/pokemonLoader");
const { capitalize } = require("../utils/helpers");
const { getPokemonIdByPosition } = require("../utils/positionHelper");

async function execute(message, args, spawns, prefix) {
  const userId = message.author.id;
  const invokedAs = (message.content.slice(prefix.length).trim().split(/\s+/)[0] || "").toLowerCase();

  const user = await pool.query(
    "SELECT selected_pokemon_id FROM users WHERE user_id = $1 AND started = TRUE",
    [userId]
  );
  if (user.rows.length === 0) return message.reply(`You haven't started yet! Use \`${prefix}start\`.`);

  let pokemonDbId;
  if (args.length > 0 && /^\d+$/.test(args[0])) {
    // These are collection positions, not raw database ids — passing the raw id
    // meant the command only worked by accident for the very first trainer.
    pokemonDbId = await getPokemonIdByPosition(userId, args[0]);
    if (!pokemonDbId) {
      // Fall back to a raw database id so anyone used to the old behaviour
      // (and any saved id from `c!info`) still works.
      const raw = await pool.query(
        "SELECT id FROM pokemon WHERE id = $1 AND user_id = $2",
        [parseInt(args[0], 10), userId]
      );
      if (raw.rows.length === 0) return message.reply("You don't have a Pokémon at that position.");
      pokemonDbId = raw.rows[0].id;
    }
  } else if (args.length === 0) {
    pokemonDbId = user.rows[0].selected_pokemon_id;
    if (!pokemonDbId) return message.reply(`Usage: \`${prefix}favorite <position>\` — or select a Pokémon first.`);
  } else {
    return message.reply(`Usage: \`${prefix}favorite <position>\` (see \`${prefix}pokemon\`)`);
  }

  const result = await pool.query(
    "SELECT * FROM pokemon WHERE id = $1 AND user_id = $2",
    [pokemonDbId, userId]
  );
  if (result.rows.length === 0) return message.reply("That Pokémon wasn't found in your collection.");

  const p = result.rows[0];
  // `c!unfav` should always unfavorite, `c!fav` should always favorite, and a
  // bare `c!favorite` toggles.
  const newFav = ["unfav", "unfavorite"].includes(invokedAs) ? false
    : ["fav", "favorite"].includes(invokedAs) && p.favorite ? false
    : !p.favorite;

  if (newFav === p.favorite) {
    const data = getPokemonById(p.pokemon_id);
    const name = p.nickname || (data ? capitalize(data.displayName || data.name) : `#${p.pokemon_id}`);
    return message.reply(newFav ? `**${name}** is already favorited.` : `**${name}** isn't favorited.`);
  }

  await pool.query("UPDATE pokemon SET favorite = $1 WHERE id = $2 AND user_id = $3", [newFav, pokemonDbId, userId]);

  const data = getPokemonById(p.pokemon_id);
  const name = p.nickname || (data ? capitalize(data.displayName || data.name) : `#${p.pokemon_id}`);

  return message.reply(
    newFav
      ? `❤️ ${p.shiny ? "✨ " : ""}**${name}** has been favorited!`
      : `💔 ${p.shiny ? "✨ " : ""}**${name}** has been unfavorited.`
  );
}

module.exports = {
  name: "favorite",
  aliases: ["fav", "unfavorite", "unfav"],
  description: "Toggle favorite on a Pokémon",
  execute
};
