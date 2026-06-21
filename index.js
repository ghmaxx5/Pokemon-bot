const { AsyncLocalStorage } = require("async_hooks");
const asyncLocalStorage = new AsyncLocalStorage();
global.asyncLocalStorage = asyncLocalStorage;

const discordJS = require("discord.js");
const OriginalEmbedBuilder = discordJS.EmbedBuilder;

class PatchedEmbedBuilder extends OriginalEmbedBuilder {
  constructor(data) {
    super(data);
    const store = asyncLocalStorage.getStore();
    if (store && store.requester) {
      this._requester = store.requester;
    }
  }
}

const originalToJSON = OriginalEmbedBuilder.prototype.toJSON;
PatchedEmbedBuilder.prototype.toJSON = function() {
  const data = originalToJSON.call(this);
  const requester = this._requester;
  if (requester) {
    const requesterText = `Requested by ${requester.username}`;
    const currentFooter = data.footer?.text || "";
    if (!currentFooter.includes(requesterText)) {
      const newFooter = currentFooter 
        ? `${currentFooter} • ${requesterText}` 
        : requesterText;
      data.footer = {
        text: newFooter,
        icon_url: requester.displayAvatarURL({ dynamic: true })
      };
    }
    data.timestamp = new Date().toISOString();
  }
  return data;
};

discordJS.EmbedBuilder = PatchedEmbedBuilder;

const {
  Client,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
} = discordJS;
const fs = require("fs");
const path = require("path");
const http = require("http");
const { initDatabase, pool } = require("./src/database");
const {
  loadPokemonData,
  getPokemonById,
  getRandomPokemon,
  getRandomEventPokemon,
  getPokemonImage,
} = require("./src/data/pokemonLoader");
const { xpForLevel, capitalize, getTypeEmoji } = require("./src/utils/helpers");
const { getNewMovesAtLevel } = require("./src/data/learnsets");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});
http.createServer((req, res) => {
  res.write("Cybermon is alive!");
  res.end();
}).listen(8080);

const commands = new Collection();
const aliases = new Collection();
const spawns = new Map();
const messageCounts = new Map();

const DEFAULT_PREFIX = "c!";
const SPAWN_THRESHOLD = 15;
const SPAWN_COOLDOWN = 30000;
const spawnCooldowns = new Map();
const xpCooldowns = new Map();
const XP_COOLDOWN = 10000;

const commandFiles = fs
  .readdirSync(path.join(__dirname, "src/commands"))
  .filter((f) => f.endsWith(".js"));
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
    const result = await pool.query(
      "SELECT prefix FROM server_config WHERE guild_id = $1",
      [guildId],
    );
    return result.rows.length > 0 ? result.rows[0].prefix : DEFAULT_PREFIX;
  } catch {
    return DEFAULT_PREFIX;
  }
}

async function getSpawnChannels(guildId) {
  try {
    // First check new multi-channel table
    const multi = await pool.query(
      "SELECT channel_id FROM spawn_channels WHERE guild_id = $1",
      [guildId]
    );
    if (multi.rows.length > 0) {
      return multi.rows.map(r => r.channel_id);
    }
    // Fall back to legacy single spawn_channel_id in server_config
    const legacy = await pool.query(
      "SELECT spawn_channel_id FROM server_config WHERE guild_id = $1",
      [guildId]
    );
    if (legacy.rows.length > 0 && legacy.rows[0].spawn_channel_id) {
      return [legacy.rows[0].spawn_channel_id];
    }
    return []; // empty = all channels
  } catch {
    return [];
  }
}

client.once("ready", async () => {
  console.log(`Bot is online as ${client.user.tag}`);
  loadPokemonData();
  await initDatabase();
  console.log("Pokemon data loaded and database initialized");

  client.user.setPresence({
    activities: [{ name: "c!help | Catch Pokemon!", type: 3 }],
    status: "online",
  });
});

// Admin wild spawn — registers Pokemon in spawns map so anyone can c!catch it
client.on("adminWildSpawn", (channelId, pokemonId) => {
  spawns.set(channelId, { pokemonId, spawnedAt: Date.now() });
  // Auto-despawn after 5 minutes if uncaught
  setTimeout(() => {
    if (spawns.has(channelId) && spawns.get(channelId).pokemonId === pokemonId) {
      spawns.delete(channelId);
    }
  }, 5 * 60 * 1000);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  try {
    await handleXP(message);
    await handleSpawning(message);

    const contentLower = message.content.toLowerCase().trim();
    if (/^(r|are)\s+we\s+de(d|ad)[\s\?\!\.]*$/i.test(contentLower)) {
      const responses = [
        "Yes, we are ded. Totally ded — all of us are dead! 💀",
        "Totally ded. No heartbeat, no nothing. We are completely dead! 🪦",
        "Yup, we are absolutely dead. All of us. Dead as a doornail! 💀",
        "Yes we are ded totally ded - all of us are dead! ☠️",
        "We are 100% dead. RIP to all of us. 💀",
        "Dead. Gone. Ceased to exist. All of us. 🪦",
        "yes we are ded totally ded - all of us are dead!",
        "bro we are so ded. dead as hell. all of us.",
        "honestly... yeah. we are ded. completely ded. 🪦",
        "pretty sure we are dead. 100% ded.",
        "yeah, RIP. we ded"
      ];
      const response = responses[Math.floor(Math.random() * responses.length)];
      message.channel.sendTyping().catch(() => {});
      const delay = 1000 + Math.floor(Math.random() * 1500); // 1.0s to 2.5s dynamic delay
      setTimeout(() => {
        message.reply(response).catch(() => {});
      }, delay);
      return;
    }

    const prefix = await getPrefix(message.guild.id);
    if (!message.content.toLowerCase().startsWith(prefix.toLowerCase())) return;

    const content = message.content.slice(prefix.length).trim();
    const args = content.split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command =
      commands.get(commandName) || commands.get(aliases.get(commandName));
    if (!command) return;

    await asyncLocalStorage.run({ requester: message.author }, async () => {
      await command.execute(message, args, spawns, prefix);
    });
  } catch (error) {
    console.error(`Error executing command:`, error);
    message
      .reply("An error occurred while executing that command.")
      .catch(() => {});
  }
});

async function handleXP(message) {
  try {
    const lastXP = xpCooldowns.get(message.author.id) || 0;
    if (Date.now() - lastXP < XP_COOLDOWN) return;
    xpCooldowns.set(message.author.id, Date.now());

    const user = await pool.query(
      "SELECT * FROM users WHERE user_id = $1 AND started = TRUE",
      [message.author.id],
    );
    if (user.rows.length === 0 || !user.rows[0].selected_pokemon_id) return;

    let xpGain = Math.floor(Math.random() * 10) + 5;

    const xpBoost = await pool.query(
      "SELECT id FROM user_boosts WHERE user_id = $1 AND boost_type = 'xp_boost' AND expires_at > NOW() LIMIT 1",
      [message.author.id],
    );
    if (xpBoost.rows.length > 0) {
      xpGain *= 2;
    }

    const result = await pool.query(
      "UPDATE pokemon SET xp = xp + $1 WHERE id = $2 RETURNING *",
      [xpGain, user.rows[0].selected_pokemon_id],
    );

    if (result.rows.length === 0) return;
    const p = result.rows[0];
    const xpNeeded = xpForLevel(p.level);

    if (p.xp >= xpNeeded && p.level < 100) {
      const { levelUpPokemon } = require("./src/utils/levelUpHelper");
      await levelUpPokemon(message.author.id, p.id, 1, message.channel);
    }
  } catch (err) {
    // silently fail XP handling
  }
}


async function handleSpawning(message) {
  const guildId = message.guild.id;
  const prefix = await getPrefix(guildId);

  // Count messages per GUILD — chatting in ANY channel counts toward spawn
  const guildCount = (messageCounts.get(guildId) || 0) + 1;
  messageCounts.set(guildId, guildCount);
  if (guildCount < SPAWN_THRESHOLD) return;
  messageCounts.set(guildId, 0);

  // Cooldown per guild
  const lastSpawn = spawnCooldowns.get(guildId) || 0;
  if (Date.now() - lastSpawn < SPAWN_COOLDOWN) return;
  spawnCooldowns.set(guildId, Date.now());

  // Get configured spawn channels
  const spawnChannelIds = await getSpawnChannels(guildId);
  let targetChannels = [];
  if (spawnChannelIds.length === 0) {
    targetChannels = [message.channel];
  } else {
    for (const chId of spawnChannelIds) {
      const ch = message.guild.channels.cache.get(chId);
      if (ch) targetChannels.push(ch);
    }
    if (targetChannels.length === 0) targetChannels = [message.channel];
  }

  // 2% chance for event Pokemon
  let pokemon = null;
  if (Math.random() < 0.02) pokemon = getRandomEventPokemon();
  if (!pokemon) pokemon = getRandomPokemon();
  if (!pokemon) return;

  const isEvent = pokemon.isEventPokemon;
  const image = getPokemonImage(pokemon.id);
  const displayName = pokemon.displayName || capitalize(pokemon.name);

  const embed = new EmbedBuilder()
    .setTitle(isEvent ? "🎊 A special Event Pokémon has appeared!" : "A wild Pokémon has appeared!")
    .setDescription(
      isEvent
        ? `A rare **${displayName}** appeared during the **${pokemon.eventName || "Special Event"}**!\nType \`${prefix}catch greninja\` to catch it!`
        : `Guess the Pokémon and type \`${prefix}catch <n>\` to catch it!`
    )
    .setImage(image)
    .setColor(isEvent ? 0xf72585 : 0xff6600)
    .setFooter({ text: isEvent ? "🎨 Event spawn — extra rare!" : `Use ${prefix}hint for a hint!` });

  for (const ch of targetChannels) {
    // Each channel gets its OWN random pokemon
    let chPokemon = null;
    if (Math.random() < 0.02) chPokemon = getRandomEventPokemon();
    if (!chPokemon) chPokemon = getRandomPokemon();
    if (!chPokemon) continue;

    const chIsEvent = chPokemon.isEventPokemon;
    const chImage = getPokemonImage(chPokemon.id); // always normal image in wild spawn
    const chDisplayName = chPokemon.displayName || capitalize(chPokemon.name);

    const chEmbed = new EmbedBuilder()
      .setTitle(chIsEvent ? "🎊 A special Event Pokemon has appeared!" : "A wild Pokemon has appeared!")
      .setDescription(
        chIsEvent
          ? `A rare **${chDisplayName}** appeared during the **${chPokemon.eventName || "Special Event"}**!\nType \`${prefix}catch ${chPokemon.name.replace(/-/g, " ")}\` to catch it!`
          : `Guess the Pokemon and type \`${prefix}catch <n>\` to catch it!`
      )
      .setImage(chImage)
      .setColor(chIsEvent ? 0xf72585 : 0xff6600)
      .setFooter({ text: chIsEvent ? "🎨 Event spawn — extra rare!" : `Use ${prefix}hint for a hint!` });

    spawns.set(ch.id, { pokemonId: chPokemon.id, spawnedAt: Date.now() });
    ch.send({ embeds: [chEmbed] }).catch(() => {});
    setTimeout(() => {
      if (spawns.has(ch.id) && spawns.get(ch.id).pokemonId === chPokemon.id) {
        spawns.delete(ch.id);
        ch.send(`The wild **${chDisplayName}** fled!`).catch(() => {});
      }
    }, 120000);
  }
}


client.login(process.env.TOKEN);
