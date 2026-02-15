const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage, getAllPokemon } = require("../data/pokemonLoader");
const { capitalize, getTypeEmoji } = require("../utils/helpers");

async function execute(message, args) {
  const userId = message.author.id;

  if (args.length > 0 && !isNaN(args[0])) {
    const pokemonId = parseInt(args[0]);
    const data = getPokemonById(pokemonId);
    if (!data) return message.reply("That Pokemon doesn't exist!");

    const caught = await pool.query("SELECT 1 FROM pokedex WHERE user_id = $1 AND pokemon_id = $2", [userId, pokemonId]);
    const typeStr = data.types.map(t => `${getTypeEmoji(t)} ${capitalize(t)}`).join(" / ");

    const embed = new EmbedBuilder()
      .setTitle(`#${data.id} — ${capitalize(data.name)}`)
      .setDescription(`${data.genus || "Pokemon"}\n${typeStr}`)
      .addFields(
        { name: "Base Stats", value: `HP: ${data.baseStats.hp} | ATK: ${data.baseStats.atk} | DEF: ${data.baseStats.def}\nSpA: ${data.baseStats.spatk} | SpD: ${data.baseStats.spdef} | SPD: ${data.baseStats.spd}`, inline: false },
        { name: "Height", value: `${(data.height / 10).toFixed(1)}m`, inline: true },
        { name: "Weight", value: `${(data.weight / 10).toFixed(1)}kg`, inline: true },
        { name: "Caught", value: caught.rows.length > 0 ? "Yes ✅" : "No ❌", inline: true }
      )
      .setThumbnail(getPokemonImage(data.id))
      .setColor(0xe74c3c);

    if (data.isLegendary) embed.addFields({ name: "Rarity", value: "🌟 Legendary", inline: true });
    if (data.isMythical) embed.addFields({ name: "Rarity", value: "💫 Mythical", inline: true });
    if (data.description) embed.addFields({ name: "Description", value: data.description.substring(0, 1024), inline: false });
    if (data.evolutionTo && data.evolutionTo.length > 0) {
      const evoStr = data.evolutionTo.map(e => {
        const evoData = getAllPokemon();
        let evoName = capitalize(e.to);
        let method = "";
        if (e.level) method = `Level ${e.level}`;
        else if (e.item) method = `Use ${capitalize(e.item.replace(/-/g, " "))}`;
        else method = "Special";
        return `${evoName} (${method})`;
      }).join(", ");
      embed.addFields({ name: "Evolves To", value: evoStr, inline: false });
    }

    return message.channel.send({ embeds: [embed] });
  }

  const dexResult = await pool.query("SELECT COUNT(DISTINCT pokemon_id) as count FROM pokedex WHERE user_id = $1", [userId]);
  const totalCaught = parseInt(dexResult.rows[0].count);
  const totalPokemon = getAllPokemon().size;

  const embed = new EmbedBuilder()
    .setTitle(`${message.author.username}'s Pokedex`)
    .setDescription(
      `You've registered **${totalCaught}/${totalPokemon}** Pokemon in your Pokedex!\n\n` +
      `Completion: **${((totalCaught / totalPokemon) * 100).toFixed(1)}%**\n\n` +
      `Use \`p!dex <number>\` to view a specific Pokemon entry.`
    )
    .setColor(0xe74c3c);

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "dex", aliases: ["pokedex", "d"], description: "View your Pokedex", execute };
