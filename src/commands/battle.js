const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, totalIV } = require("../utils/helpers");
const { getMovesForPokemon } = require("../data/moves");
const { getEffectiveness } = require("../data/types");

const activeBattles = new Map();

function calcHP(baseHP, ivHP, level) {
  return Math.floor(((2 * baseHP + ivHP) * level / 100) + level + 10);
}

function calcStat(baseStat, iv, level) {
  return Math.floor(((2 * baseStat + iv) * level / 100) + 5);
}

function calcDamage(level, power, attack, defense, effectiveness) {
  const base = Math.floor((((2 * level / 5 + 2) * power * attack / defense) / 50) + 2);
  const random = (Math.random() * 0.15 + 0.85);
  return Math.max(1, Math.floor(base * effectiveness * random));
}

async function execute(message, args) {
  const userId = message.author.id;
  const channelId = message.channel.id;

  if (!args.length) {
    return message.reply("Usage: `p!battle @user` to challenge someone to a battle!");
  }

  if (args[0].toLowerCase() === "accept") {
    const battle = activeBattles.get(channelId);
    if (!battle || battle.status !== "pending") return message.reply("No pending battle in this channel.");
    if (battle.opponent !== userId) return message.reply("This challenge isn't for you!");

    battle.status = "active";
    battle.turn = battle.challenger;
    return startBattleTurn(message, battle, channelId);
  }

  if (args[0].toLowerCase() === "decline" || args[0].toLowerCase() === "cancel") {
    const battle = activeBattles.get(channelId);
    if (!battle) return message.reply("No active battle in this channel.");
    if (battle.challenger !== userId && battle.opponent !== userId) return message.reply("This isn't your battle.");
    activeBattles.delete(channelId);
    return message.reply("Battle cancelled.");
  }

  const mentioned = message.mentions.users.first();
  if (!mentioned) return message.reply("Please mention a user to battle!");
  if (mentioned.id === userId) return message.reply("You can't battle yourself!");
  if (mentioned.bot) return message.reply("You can't battle a bot!");

  if (activeBattles.has(channelId)) return message.reply("There's already a battle in this channel!");

  const user1 = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  const user2 = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [mentioned.id]);
  if (user1.rows.length === 0) return message.reply("You haven't started yet!");
  if (user2.rows.length === 0) return message.reply("That user hasn't started yet!");

  if (!user1.rows[0].selected_pokemon_id) return message.reply("You need to select a Pokemon first! Use `p!select <id>`.");
  if (!user2.rows[0].selected_pokemon_id) return message.reply("Your opponent needs to select a Pokemon first!");

  const p1 = await pool.query("SELECT * FROM pokemon WHERE id = $1", [user1.rows[0].selected_pokemon_id]);
  const p2 = await pool.query("SELECT * FROM pokemon WHERE id = $1", [user2.rows[0].selected_pokemon_id]);
  if (p1.rows.length === 0 || p2.rows.length === 0) return message.reply("Selected Pokemon not found.");

  const data1 = getPokemonById(p1.rows[0].pokemon_id);
  const data2 = getPokemonById(p2.rows[0].pokemon_id);
  if (!data1 || !data2) return message.reply("Pokemon data error.");

  const hp1 = calcHP(data1.baseStats.hp, p1.rows[0].iv_hp, p1.rows[0].level);
  const hp2 = calcHP(data2.baseStats.hp, p2.rows[0].iv_hp, p2.rows[0].level);

  const battle = {
    challenger: userId,
    opponent: mentioned.id,
    status: "pending",
    turn: null,
    p1: { ...p1.rows[0], data: data1, maxHp: hp1, currentHp: hp1, moves: getMovesForPokemon(data1.types, p1.rows[0].level) },
    p2: { ...p2.rows[0], data: data2, maxHp: hp2, currentHp: hp2, moves: getMovesForPokemon(data2.types, p2.rows[0].level) }
  };

  activeBattles.set(channelId, battle);

  const name1 = p1.rows[0].nickname || capitalize(data1.name);
  const name2 = p2.rows[0].nickname || capitalize(data2.name);

  const embed = new EmbedBuilder()
    .setTitle("Battle Challenge!")
    .setDescription(
      `${message.author} challenges ${mentioned} to a battle!\n\n` +
      `**${name1}** (Lv. ${p1.rows[0].level}) vs **${name2}** (Lv. ${p2.rows[0].level})\n\n` +
      `${mentioned}, use \`p!battle accept\` to accept or \`p!battle decline\` to decline.`
    )
    .setColor(0xe74c3c);

  message.channel.send({ embeds: [embed] });

  setTimeout(() => {
    const b = activeBattles.get(channelId);
    if (b && b.status === "pending") {
      activeBattles.delete(channelId);
      message.channel.send("Battle challenge timed out.").catch(() => {});
    }
  }, 60000);
}

async function startBattleTurn(message, battle, channelId) {
  const isP1Turn = battle.turn === battle.challenger;
  const attacker = isP1Turn ? battle.p1 : battle.p2;
  const defender = isP1Turn ? battle.p2 : battle.p1;
  const attackerName = attacker.nickname || capitalize(attacker.data.name);
  const defenderName = defender.nickname || capitalize(defender.data.name);

  const hpBar = (current, max) => {
    const pct = current / max;
    const filled = Math.round(pct * 20);
    return `${"█".repeat(filled)}${"░".repeat(20 - filled)} ${current}/${max}`;
  };

  const embed = new EmbedBuilder()
    .setTitle("Pokemon Battle!")
    .setDescription(
      `**${attackerName}** ${attacker.shiny ? "✨" : ""} (Lv. ${attacker.level})\n` +
      `HP: ${hpBar(battle.p1.currentHp, battle.p1.maxHp)}\n\n` +
      `**VS**\n\n` +
      `**${defenderName}** ${defender.shiny ? "✨" : ""} (Lv. ${defender.level})\n` +
      `HP: ${hpBar(battle.p2.currentHp, battle.p2.maxHp)}\n\n` +
      `<@${battle.turn}>'s turn! Choose a move:`
    )
    .setColor(0xe74c3c);

  const rows = [];
  const row = new ActionRowBuilder();
  for (let i = 0; i < attacker.moves.length; i++) {
    const move = attacker.moves[i];
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_move_${i}`)
        .setLabel(`${move.name} (${move.power})`)
        .setStyle(ButtonStyle.Primary)
    );
  }
  rows.push(row);

  const reply = await message.channel.send({ embeds: [embed], components: rows });

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === battle.turn,
    time: 60000,
    max: 1
  });

  collector.on("collect", async (interaction) => {
    const moveIdx = parseInt(interaction.customId.replace("battle_move_", ""));
    const move = attacker.moves[moveIdx];

    const atkStat = calcStat(attacker.data.baseStats.atk, attacker.iv_atk, attacker.level);
    const defStat = calcStat(defender.data.baseStats.def, defender.iv_def, defender.level);
    const effectiveness = getEffectiveness(move.type, defender.data.types);

    const hit = Math.random() * 100 <= move.accuracy;
    let damage = 0;
    let effectText = "";

    if (hit) {
      damage = calcDamage(attacker.level, move.power, atkStat, defStat, effectiveness);
      if (effectiveness > 1) effectText = "It's super effective! ";
      else if (effectiveness < 1 && effectiveness > 0) effectText = "It's not very effective... ";
      else if (effectiveness === 0) { effectText = "It had no effect! "; damage = 0; }
    }

    if (isP1Turn) battle.p2.currentHp = Math.max(0, battle.p2.currentHp - damage);
    else battle.p1.currentHp = Math.max(0, battle.p1.currentHp - damage);

    const resultText = hit
      ? `**${attackerName}** used **${move.name}**! ${effectText}Dealt **${damage}** damage!`
      : `**${attackerName}** used **${move.name}** but it missed!`;

    if (battle.p1.currentHp <= 0 || battle.p2.currentHp <= 0) {
      const winner = battle.p1.currentHp > 0 ? battle.challenger : battle.opponent;
      const loser = winner === battle.challenger ? battle.opponent : battle.challenger;
      const winnerPoke = winner === battle.challenger ? battle.p1 : battle.p2;
      const winnerName = winnerPoke.nickname || capitalize(winnerPoke.data.name);

      const reward = Math.floor(Math.random() * 200) + 100;
      await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [reward, winner]);

      const xpGain = Math.floor(Math.random() * 50) + 30;
      await pool.query("UPDATE pokemon SET xp = xp + $1 WHERE id = $2", [xpGain, winnerPoke.id]);

      const endEmbed = new EmbedBuilder()
        .setTitle("Battle Over!")
        .setDescription(
          `${resultText}\n\n` +
          `**${winnerName}** wins! <@${winner}> earned **${reward}** credits and **${xpGain}** XP!`
        )
        .setColor(0x00ff00);

      activeBattles.delete(channelId);
      return interaction.update({ embeds: [endEmbed], components: [] });
    }

    battle.turn = battle.turn === battle.challenger ? battle.opponent : battle.challenger;

    const turnEmbed = new EmbedBuilder()
      .setTitle("Pokemon Battle!")
      .setDescription(resultText)
      .setColor(0xff9900);

    await interaction.update({ embeds: [turnEmbed], components: [] });
    startBattleTurn(message, battle, channelId);
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      activeBattles.delete(channelId);
      reply.edit({ content: "Battle timed out!", components: [] }).catch(() => {});
    }
  });
}

module.exports = { name: "battle", aliases: ["duel", "fight"], description: "Battle another trainer", execute };
