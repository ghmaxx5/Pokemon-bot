const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage } = require("../data/pokemonLoader");
const { generateIVs, randomNature, totalIV, capitalize } = require("../utils/helpers");

const BASE_SHINY_RATE = 1 / 4096;
const BOOSTED_SHINY_RATE = 1 / 2048;

async function execute(message, args, spawns) {
  const userId = message.author.id;
  const channelId = message.channel.id;

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) {
    return message.reply("You haven't started yet! Use `p!start` to begin your journey.");
  }

  if (!args.length) {
    return message.reply("Please specify the Pokemon name! Usage: `p!catch <name>`");
  }

  const spawn = spawns.get(channelId);
  if (!spawn) {
    return message.reply("There is no wild Pokemon here right now!");
  }

  const guess = args.join(" ").toLowerCase().trim();
  const pokemonInfo = getPokemonById(spawn.pokemonId);
  if (!pokemonInfo) return;

  // Build accepted name variants — spaces, dashes, displayName all accepted
  const addVariants = (set, name) => {
    const n = name.toLowerCase();
    set.add(n);
    set.add(n.replace(/-/g, " "));
    set.add(n.replace(/\s+/g, "-"));
  };
  const acceptedSet = new Set();
  addVariants(acceptedSet, pokemonInfo.name);
  if (pokemonInfo.baseForm) {
    const baseData = getPokemonById(pokemonInfo.baseForm);
    if (baseData) addVariants(acceptedSet, baseData.name);
  }
  if (pokemonInfo.displayName) {
    addVariants(acceptedSet, pokemonInfo.displayName);
    // Also strip parentheses: "holi spirit greninja" from "holi spirit (greninja)"
    const stripped = pokemonInfo.displayName.toLowerCase().replace(/[()]/g, "").replace(/\s+/g, " ").trim();
    addVariants(acceptedSet, stripped);
  }
  const acceptedNames = Array.from(acceptedSet);

  const masterBall = await pool.query(
    "SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = 'master_ball' AND quantity > 0",
    [userId]
  );
  const hasMasterBall = masterBall.rows.length > 0 && masterBall.rows[0].quantity > 0;
  const usingMasterBall = guess === "master ball" || guess === "masterball";

  if (usingMasterBall) {
    if (!hasMasterBall) {
      return message.reply("You don't have a Master Ball! Buy one from the shop with `p!shop buy master ball`.");
    }
    await pool.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = 'master_ball'", [userId]);
    await pool.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = 'master_ball' AND quantity <= 0", [userId]);
  } else if (!acceptedNames.includes(guess)) {
    return message.reply("That is not the right Pokemon!");
  }

  spawns.delete(channelId);

  const shinyCharm = await pool.query(
    "SELECT id, uses_left FROM user_boosts WHERE user_id = $1 AND boost_type = 'shiny_charm' AND uses_left > 0 ORDER BY id LIMIT 1",
    [userId]
  );
  let shinyRate = BASE_SHINY_RATE;
  let usedCharm = false;
  if (shinyCharm.rows.length > 0) {
    shinyRate = BOOSTED_SHINY_RATE;
    usedCharm = true;
    const newUses = shinyCharm.rows[0].uses_left - 1;
    if (newUses <= 0) {
      await pool.query("DELETE FROM user_boosts WHERE id = $1", [shinyCharm.rows[0].id]);
    } else {
      await pool.query("UPDATE user_boosts SET uses_left = $1 WHERE id = $2", [newUses, shinyCharm.rows[0].id]);
    }
  }

  const ivs = spawn.ivs || generateIVs();
  const nature = randomNature();
  // forceShiny from admin spawnwild overrides normal shiny roll
  const shiny = spawn.forceShiny ? true : Math.random() < shinyRate;
  // Event Pokemon are always caught at level 100
  const level = pokemonInfo.isEventPokemon ? 100 : Math.floor(Math.random() * 30) + 1;

  // For event Pokemon auto-equip their signature moves
  let move1 = null, move2 = null, move3 = null, move4 = null;
  let heldItem = null;
  if (pokemonInfo.isEventPokemon) {
    const { getAvailableMoves } = require("../data/learnsets");
    const eventMoves = getAvailableMoves(pokemonInfo.types, 100, pokemonInfo.id);
    move1 = eventMoves[0]?.name || null;
    move2 = eventMoves[1]?.name || null;
    move3 = eventMoves[2]?.name || null;
    move4 = eventMoves[3]?.name || null;
    heldItem = "hand_held_color_pouch";
  }

  const result = await pool.query(
    `INSERT INTO pokemon (user_id, pokemon_id, level, xp, shiny, iv_hp, iv_atk, iv_def, iv_spatk, iv_spdef, iv_spd, nature, original_owner, move1, move2, move3, move4, held_item)
     VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
    [userId, spawn.pokemonId, level, shiny, ivs.hp, ivs.atk, ivs.def, ivs.spatk, ivs.spdef, ivs.spd, nature, userId, move1, move2, move3, move4, heldItem]
  );

  await pool.query(
    "INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [userId, spawn.pokemonId]
  );

  const iv = totalIV(ivs);
  const shinyText = shiny ? "✨ ***SHINY*** ✨ " : "";
  const pokeName = pokemonInfo.displayName || capitalize(pokemonInfo.name);

  let desc = `${message.author} caught a ${shinyText}**Level ${level} ${pokeName}**!\n\n` +
    `**IV:** ${iv}%\n**Nature:** ${nature}`;
  if (pokemonInfo.isEventPokemon) {
    desc += `\n🎨 **Held Item:** Hand-held Color Pouch auto-equipped!`;
    desc += `\n✦ **Moves:** ${[move1,move2,move3,move4].filter(Boolean).join(" | ")}`;
  }
  if (usingMasterBall) desc = `🟣 **Master Ball used!**\n\n` + desc;
  if (usedCharm) desc += `\n✨ *Shiny Charm active (${shinyCharm.rows[0].uses_left - 1} uses left)*`;

  const embed = new EmbedBuilder()
    .setTitle(`${shinyText}${usingMasterBall ? "🟣 " : ""}Congratulations!`)
    .setDescription(desc)
    .setThumbnail(getPokemonImage(spawn.pokemonId, shiny))
    .setColor(shiny ? 0xffd700 : usingMasterBall ? 0x9b59b6 : 0x2ecc71);

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "catch", aliases: ["c"], description: "Catch a wild Pokemon", execute };
