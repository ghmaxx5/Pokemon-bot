const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { initDatabase, pool } = require("./src/database");
const { loadPokemonData, getPokemonById, getRandomPokemon, getPokemonImage } = require("./src/data/pokemonLoader");
const { xpForLevel, capitalize, getTypeEmoji } = require("./src/utils/helpers");
const { getNewMovesAtLevel } = require("./src/data/learnsets");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const commands = new Collection();
const aliases = new Collection();
const spawns = new Map();
const messageCounts = new Map();

const DEFAULT_PREFIX = "p!";
const SPAWN_THRESHOLD = 15;
const SPAWN_COOLDOWN = 30000;
const spawnCooldowns = new Map();
const xpCooldowns = new Map();
const XP_COOLDOWN = 10000;

const commandFiles = fs.readdirSync(path.join(__dirname, "src/commands")).filter(f => f.endsWith(".js"));
for (const file of commandFiles) {
  const cmd = require(`./src/commands/${file}`);
  commands.set(cmd.name, cmd);
  if (cmd.aliases) {
    for (const alias of cmd.aliases) {
      aliases.set(alias, cmd.name);
    }
  }
}

console.log(`Loaded ${commands.size} commands`);

async function getPrefix(guildId) {
  try {
    const result = await pool.query("SELECT prefix FROM server_config WHERE guild_id = $1", [guildId]);
    return result.rows.length > 0 ? result.rows[0].prefix : DEFAULT_PREFIX;
  } catch {
    return DEFAULT_PREFIX;
  }
}

async function getSpawnChannel(guildId) {
  try {
    const result = await pool.query("SELECT spawn_channel_id FROM server_config WHERE guild_id = $1", [guildId]);
    return result.rows.length > 0 ? result.rows[0].spawn_channel_id : null;
  } catch {
    return null;
  }
}

client.once("ready", async () => {
  console.log(`Bot is online as ${client.user.tag}`);
  loadPokemonData();
  await initDatabase();
  console.log("Pokemon data loaded and database initialized");

  client.user.setPresence({
    activities: [{ name: "p!help | Catch Pokemon!", type: 3 }],
    status: "online"
  });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  try {
    await handleXP(message);
    await handleSpawning(message);

    const prefix = await getPrefix(message.guild.id);
    if (!message.content.toLowerCase().startsWith(prefix.toLowerCase())) return;

    const content = message.content.slice(prefix.length).trim();
    const args = content.split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command = commands.get(commandName) || commands.get(aliases.get(commandName));
    if (!command) return;

    await command.execute(message, args, spawns);
  } catch (error) {
    console.error(`Error executing command:`, error);
    message.reply("An error occurred while executing that command.").catch(() => {});
  }
});

async function handleXP(message) {
  try {
    const lastXP = xpCooldowns.get(message.author.id) || 0;
    if (Date.now() - lastXP < XP_COOLDOWN) return;
    xpCooldowns.set(message.author.id, Date.now());

    const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [message.author.id]);
    if (user.rows.length === 0 || !user.rows[0].selected_pokemon_id) return;

    let xpGain = Math.floor(Math.random() * 10) + 5;

    const xpBoost = await pool.query(
      "SELECT id FROM user_boosts WHERE user_id = $1 AND boost_type = 'xp_boost' AND expires_at > NOW() LIMIT 1",
      [message.author.id]
    );
    if (xpBoost.rows.length > 0) {
      xpGain *= 2;
    }

    const result = await pool.query(
      "UPDATE pokemon SET xp = xp + $1 WHERE id = $2 RETURNING *",
      [xpGain, user.rows[0].selected_pokemon_id]
    );

    if (result.rows.length === 0) return;
    const p = result.rows[0];
    const xpNeeded = xpForLevel(p.level);

    if (p.xp >= xpNeeded && p.level < 100) {
      const newLevel = p.level + 1;
      await pool.query("UPDATE pokemon SET level = $1, xp = 0 WHERE id = $2", [newLevel, p.id]);

      let currentPokemonId = p.pokemon_id;
      const data = getPokemonById(currentPokemonId);
      const name = p.nickname || (data ? capitalize(data.name) : `#${currentPokemonId}`);

      const newMoves = data ? getNewMovesAtLevel(data.types, newLevel) : [];
      let moveText = "";
      if (newMoves.length > 0) {
        moveText = "\n\n**New Moves Learned:**\n" +
          newMoves.map(m => `${getTypeEmoji(m.type)} **${m.name}** (${capitalize(m.type)} | Pow: ${m.power} | Acc: ${m.accuracy}%)`).join("\n") +
          "\n\nUse `p!moves` to view and equip moves!";
      }

      const embed = new EmbedBuilder()
        .setTitle("Level Up!")
        .setDescription(`Your ${p.shiny ? "✨ " : ""}**${name}** grew to **Level ${newLevel}**!${moveText}`)
        .setColor(0x00ff00)
        .setThumbnail(getPokemonImage(currentPokemonId, p.shiny));

      message.channel.send({ embeds: [embed] }).catch(() => {});

      if (data && data.evolutionTo && data.evolutionTo.length > 0) {
        const evo = data.evolutionTo[0];
        if (evo.level && newLevel >= evo.level) {
          const { getPokemonByName } = require("./src/data/pokemonLoader");
          const evoTarget = getPokemonByName(evo.to);
          if (evoTarget) {
            await pool.query("UPDATE pokemon SET pokemon_id = $1, nickname = NULL WHERE id = $2", [evoTarget.id, p.id]);
            await pool.query("INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [message.author.id, evoTarget.id]);

            const evoEmbed = new EmbedBuilder()
              .setTitle("Congratulations! Your Pokémon evolved!")
              .setDescription(
                `Your ${p.shiny ? "✨ " : ""}**${name}** evolved into **${capitalize(evoTarget.name)}**!`
              )
              .setColor(0x9b59b6)
              .setImage(getPokemonImage(evoTarget.id, p.shiny));

            message.channel.send({ embeds: [evoEmbed] }).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    // silently fail XP handling
  }
}

async function handleSpawning(message) {
  const channelId = message.channel.id;
  const guildId = message.guild.id;

  const spawnChannel = await getSpawnChannel(guildId);
  if (spawnChannel && spawnChannel !== channelId) return;

  const lastSpawn = spawnCooldowns.get(channelId) || 0;
  if (Date.now() - lastSpawn < SPAWN_COOLDOWN) return;

  const count = (messageCounts.get(channelId) || 0) + 1;
  messageCounts.set(channelId, count);

  if (count >= SPAWN_THRESHOLD) {
    messageCounts.set(channelId, 0);

    const pokemon = getRandomPokemon();
    if (!pokemon) return;

    spawns.set(channelId, { pokemonId: pokemon.id, spawnedAt: Date.now() });
    spawnCooldowns.set(channelId, Date.now());

    const image = getPokemonImage(pokemon.id);

    const embed = new EmbedBuilder()
      .setTitle("A wild Pokemon has appeared!")
      .setDescription("Guess the Pokemon and type `p!catch <name>` to catch it!")
      .setImage(image)
      .setColor(0xff6600)
      .setFooter({ text: "Use p!hint for a hint!" });

    message.channel.send({ embeds: [embed] }).catch(() => {});

    setTimeout(() => {
      if (spawns.has(channelId) && spawns.get(channelId).pokemonId === pokemon.id) {
        spawns.delete(channelId);
        const data = getPokemonById(pokemon.id);
        message.channel.send(`The wild **${data ? capitalize(data.name) : "Pokemon"}** fled!`).catch(() => {});
      }
    }, 120000);
  }
}

client.login(process.env.TOKEN);
