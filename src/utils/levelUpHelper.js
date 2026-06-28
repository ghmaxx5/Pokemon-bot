const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonByName, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, getTypeEmoji } = require("./helpers");
const { getNewMovesAtLevel } = require("../data/learnsets");

async function levelUpPokemon(userId, pokemonDbId, levelsToAdd, messageChannel) {
  let prefix = "c!";
  if (messageChannel && messageChannel.guild) {
    try {
      const prefixResult = await pool.query(
        "SELECT prefix FROM server_config WHERE guild_id = $1",
        [messageChannel.guild.id]
      );
      if (prefixResult.rows.length > 0) {
        prefix = prefixResult.rows[0].prefix;
      }
    } catch (err) {
      // fallback to c!
    }
  }

  const result = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
  if (result.rows.length === 0) return null;

  const p = result.rows[0];
  if (p.level >= 100) return null;

  const currentLevel = p.level;
  const newLevel = Math.min(100, currentLevel + levelsToAdd);
  const actualAdded = newLevel - currentLevel;
  if (actualAdded <= 0) return null;

  // Update in DB
  await pool.query("UPDATE pokemon SET level = $1, xp = 0 WHERE id = $2", [newLevel, pokemonDbId]);

  const data = getPokemonById(p.pokemon_id);
  if (!data) return null;

  const originalName = p.nickname || capitalize(data.name);

  // Check moves learned in the range of levels added
  const newMoves = [];
  for (let lv = currentLevel + 1; lv <= newLevel; lv++) {
    const movesAtLv = getNewMovesAtLevel(data.types, lv, p.pokemon_id);
    newMoves.push(...movesAtLv);
  }

  let moveText = "";
  if (newMoves.length > 0) {
    moveText =
      "\n\n**New Moves Learned:**\n" +
      newMoves
        .map(
          (m) =>
            `${getTypeEmoji(m.type)} **${m.name}** (${capitalize(m.type)} | Pow: ${m.power} | Acc: ${m.accuracy}%)`,
        )
        .join("\n") +
      `\n\nUse \`${prefix}moves\` to view and equip moves!`;
  }

  const embed = new EmbedBuilder()
    .setTitle("Level Up!")
    .setDescription(
      `Your ${p.shiny ? "✨ " : ""}**${originalName}** grew to **Level ${newLevel}**!${moveText}`,
    )
    .setColor(0x00ff00)
    .setThumbnail(getPokemonImage(p.pokemon_id, p.shiny));

  if (messageChannel) {
    messageChannel.send({ embeds: [embed] }).catch(() => {});
  }

  // Handle evolutions
  let currentData = data;
  let evoChainDone = false;
  let evolvedTarget = null;
  let activeName = originalName;

  while (currentData && !evoChainDone) {
    evoChainDone = true;
    if (currentData.evolutionTo && currentData.evolutionTo.length > 0) {
      for (const evo of currentData.evolutionTo) {
        if (evo.level && newLevel >= evo.level) {
          const evoTarget = getPokemonByName(evo.to);
          if (evoTarget) {
            await pool.query(
              "UPDATE pokemon SET pokemon_id = $1, nickname = NULL WHERE id = $2",
              [evoTarget.id, pokemonDbId]
            );
            await pool.query(
              "INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
              [userId, evoTarget.id]
            );
            evolvedTarget = evoTarget;
            const prevName = activeName;
            activeName = capitalize(evoTarget.name);

            if (messageChannel) {
              const evoEmbed = new EmbedBuilder()
                .setTitle("Congratulations! Your Pokémon evolved!")
                .setDescription(
                  `Your ${p.shiny ? "✨ " : ""}**${prevName}** evolved into **${activeName}**!`,
                )
                .setColor(0x9b59b6)
                .setImage(getPokemonImage(evoTarget.id, p.shiny));

              messageChannel.send({ embeds: [evoEmbed] }).catch(() => {});
            }

            currentData = evoTarget;
            evoChainDone = false;
            break;
          }
        }
      }
    }
  }

  return { newLevel, evolvedTarget };
}

module.exports = { levelUpPokemon };
