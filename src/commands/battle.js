const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, totalIV } = require("../utils/helpers");
const { getMovesForPokemon } = require("../data/moves");
const { getEffectiveness } = require("../data/types");
const { getMegaData, getGmaxData } = require("../data/mega");

const activeBattles = new Map();

function calcHP(baseHP, ivHP, level) {
  return Math.floor(((2 * baseHP + ivHP) * level / 100) + level + 10);
}

function calcStat(baseStat, iv, level, boost = 0) {
  return Math.floor(((2 * (baseStat + boost) + iv) * level / 100) + 5);
}

function calcDamage(level, power, attack, defense, effectiveness, stab = false) {
  const base = Math.floor((((2 * level / 5 + 2) * power * attack / defense) / 50) + 2);
  const stabMult = stab ? 1.5 : 1;
  const random = (Math.random() * 0.15 + 0.85);
  return Math.max(1, Math.floor(base * effectiveness * stabMult * random));
}

async function execute(message, args) {
  const userId = message.author.id;
  const channelId = message.channel.id;

  if (!args.length) {
    return message.reply("Usage: `p!battle @user` to challenge someone!\n`p!battle accept` / `p!battle decline`");
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

  const p1HeldItem = p1.rows[0].held_item;
  const p2HeldItem = p2.rows[0].held_item;

  const p1CanMega = p1HeldItem === "mega_stone" && getMegaData(p1.rows[0].pokemon_id);
  const p1CanGmax = p1HeldItem === "gmax_ring" && getGmaxData(p1.rows[0].pokemon_id);
  const p2CanMega = p2HeldItem === "mega_stone" && getMegaData(p2.rows[0].pokemon_id);
  const p2CanGmax = p2HeldItem === "gmax_ring" && getGmaxData(p2.rows[0].pokemon_id);

  const battle = {
    challenger: userId,
    opponent: mentioned.id,
    status: "pending",
    turn: null,
    p1: {
      ...p1.rows[0], data: data1, maxHp: hp1, currentHp: hp1,
      moves: getMovesForPokemon(data1.types, p1.rows[0].level),
      canMega: !!p1CanMega, canGmax: !!p1CanGmax,
      megaEvolved: false, gmaxed: false, gmaxTurns: 0,
      megaData: p1CanMega ? getMegaData(p1.rows[0].pokemon_id) : null,
      gmaxData: p1CanGmax ? getGmaxData(p1.rows[0].pokemon_id) : null,
      activeTypes: [...data1.types],
      statBoosts: { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 },
      baseMaxHp: hp1
    },
    p2: {
      ...p2.rows[0], data: data2, maxHp: hp2, currentHp: hp2,
      moves: getMovesForPokemon(data2.types, p2.rows[0].level),
      canMega: !!p2CanMega, canGmax: !!p2CanGmax,
      megaEvolved: false, gmaxed: false, gmaxTurns: 0,
      megaData: p2CanMega ? getMegaData(p2.rows[0].pokemon_id) : null,
      gmaxData: p2CanGmax ? getGmaxData(p2.rows[0].pokemon_id) : null,
      activeTypes: [...data2.types],
      statBoosts: { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 },
      baseMaxHp: hp2
    }
  };

  activeBattles.set(channelId, battle);

  const name1 = p1.rows[0].nickname || capitalize(data1.name);
  const name2 = p2.rows[0].nickname || capitalize(data2.name);

  const megaInfo1 = p1CanMega ? " 💎" : (p1CanGmax ? " 💍" : "");
  const megaInfo2 = p2CanMega ? " 💎" : (p2CanGmax ? " 💍" : "");

  const embed = new EmbedBuilder()
    .setTitle("⚔️ Battle Challenge!")
    .setDescription(
      `${message.author} challenges ${mentioned} to a battle!\n\n` +
      `${p1.rows[0].shiny ? "✨ " : ""}**${name1}**${megaInfo1} (Lv. ${p1.rows[0].level})\n` +
      `vs\n` +
      `${p2.rows[0].shiny ? "✨ " : ""}**${name2}**${megaInfo2} (Lv. ${p2.rows[0].level})\n\n` +
      `${mentioned}, use \`p!battle accept\` to accept or \`p!battle decline\` to decline.`
    )
    .setColor(0xe74c3c)
    .setFooter({ text: "Battle will expire in 60 seconds" });

  message.channel.send({ embeds: [embed] });

  setTimeout(() => {
    const b = activeBattles.get(channelId);
    if (b && b.status === "pending") {
      activeBattles.delete(channelId);
      message.channel.send("Battle challenge timed out.").catch(() => {});
    }
  }, 60000);
}

function getBattleName(poke) {
  let prefix = "";
  if (poke.megaEvolved) {
    prefix = poke.megaData?.isPrimal ? "Primal " : "Mega ";
  } else if (poke.gmaxed) {
    prefix = "G-Max ";
  }
  const shiny = poke.shiny ? "✨ " : "";
  return `${shiny}${prefix}${poke.nickname || capitalize(poke.data.name)}`;
}

async function startBattleTurn(message, battle, channelId) {
  const isP1Turn = battle.turn === battle.challenger;
  const attacker = isP1Turn ? battle.p1 : battle.p2;
  const defender = isP1Turn ? battle.p2 : battle.p1;

  if (attacker.gmaxed) {
    attacker.gmaxTurns--;
    if (attacker.gmaxTurns <= 0) {
      attacker.gmaxed = false;
      attacker.activeTypes = [...attacker.data.types];
      attacker.statBoosts = { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 };
      const hpRatio = attacker.currentHp / attacker.maxHp;
      attacker.maxHp = attacker.baseMaxHp;
      attacker.currentHp = Math.max(1, Math.floor(hpRatio * attacker.baseMaxHp));
    }
  }

  const attackerName = getBattleName(attacker);
  const defenderName = getBattleName(defender);

  const hpBar = (current, max) => {
    const pct = Math.max(0, current / max);
    const filled = Math.round(pct * 20);
    const color = pct > 0.5 ? "🟩" : pct > 0.2 ? "🟨" : "🟥";
    return `${color} ${"█".repeat(filled)}${"░".repeat(20 - filled)} ${current}/${max}`;
  };

  let statusLine = "";
  if (attacker.megaEvolved) statusLine += `💎 ${attackerName} is Mega Evolved!\n`;
  if (attacker.gmaxed) statusLine += `💍 ${attackerName} is Gigantamaxed! (${attacker.gmaxTurns} turns left)\n`;
  if (defender.megaEvolved) statusLine += `💎 ${defenderName} is Mega Evolved!\n`;
  if (defender.gmaxed) statusLine += `💍 ${defenderName} is Gigantamaxed! (${defender.gmaxTurns} turns left)\n`;

  const embed = new EmbedBuilder()
    .setTitle("⚔️ Pokemon Battle!")
    .setDescription(
      `**${getBattleName(battle.p1)}** (Lv. ${battle.p1.level})\n` +
      `${hpBar(battle.p1.currentHp, battle.p1.maxHp)}\n\n` +
      `**VS**\n\n` +
      `**${getBattleName(battle.p2)}** (Lv. ${battle.p2.level})\n` +
      `${hpBar(battle.p2.currentHp, battle.p2.maxHp)}\n\n` +
      (statusLine ? `${statusLine}\n` : "") +
      `<@${battle.turn}>'s turn! Choose your action:`
    )
    .setColor(0xe74c3c)
    .setFooter({ text: "60 seconds to choose a move" });

  const moveRow = new ActionRowBuilder();
  for (let i = 0; i < Math.min(attacker.moves.length, 4); i++) {
    const move = attacker.moves[i];
    moveRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_move_${i}`)
        .setLabel(`${move.name} (${move.power})`)
        .setStyle(ButtonStyle.Primary)
    );
  }

  const rows = [moveRow];

  const canMegaNow = attacker.canMega && !attacker.megaEvolved && !attacker.gmaxed;
  const canGmaxNow = attacker.canGmax && !attacker.gmaxed && !attacker.megaEvolved;

  if (canMegaNow || canGmaxNow) {
    const transformRow = new ActionRowBuilder();
    if (canMegaNow) {
      const label = attacker.megaData?.isPrimal ? "Primal Reversion + Move" : "Mega Evolve + Move";
      transformRow.addComponents(
        new ButtonBuilder()
          .setCustomId("battle_mega")
          .setLabel(label)
          .setEmoji("💎")
          .setStyle(ButtonStyle.Danger)
      );
    }
    if (canGmaxNow) {
      transformRow.addComponents(
        new ButtonBuilder()
          .setCustomId("battle_gmax")
          .setLabel("Gigantamax + Move")
          .setEmoji("💍")
          .setStyle(ButtonStyle.Danger)
      );
    }
    rows.push(transformRow);
  }

  const reply = await message.channel.send({ embeds: [embed], components: rows });

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === battle.turn,
    time: 60000,
    max: 1
  });

  collector.on("collect", async (interaction) => {
    const customId = interaction.customId;
    let transformText = "";
    let selectingMoveAfterTransform = false;

    if (customId === "battle_mega") {
      const megaData = attacker.megaData;
      attacker.megaEvolved = true;
      attacker.canMega = false;
      attacker.activeTypes = megaData.types || attacker.activeTypes;
      attacker.statBoosts = megaData.statBoost;

      const newMaxHp = attacker.maxHp + Math.floor(megaData.statBoost.hp * attacker.level / 100);
      if (newMaxHp > attacker.maxHp) {
        attacker.currentHp += (newMaxHp - attacker.maxHp);
        attacker.maxHp = newMaxHp;
      }

      const transformName = megaData.isPrimal ? "underwent Primal Reversion" : "Mega Evolved";
      transformText = `💎 **${attacker.nickname || capitalize(attacker.data.name)}** ${transformName} into **${megaData.name}**!\n\n`;
      selectingMoveAfterTransform = true;
    } else if (customId === "battle_gmax") {
      const gmaxData = attacker.gmaxData;
      attacker.gmaxed = true;
      attacker.canGmax = false;
      attacker.gmaxTurns = 3;

      attacker.currentHp = Math.floor(attacker.currentHp * 1.5);
      attacker.maxHp = Math.floor(attacker.maxHp * 1.5);

      transformText = `💍 **${attacker.nickname || capitalize(attacker.data.name)}** Gigantamaxed into **${gmaxData.name}**!\n\n`;
      selectingMoveAfterTransform = true;
    }

    if (selectingMoveAfterTransform) {
      const moveSelectEmbed = new EmbedBuilder()
        .setTitle("⚔️ Choose your move!")
        .setDescription(transformText + "Now select a move to use:")
        .setColor(0xff6600);

      const newMoveRow = new ActionRowBuilder();
      const movesToShow = attacker.gmaxed && attacker.gmaxData?.gmaxMove
        ? [attacker.gmaxData.gmaxMove, ...attacker.moves.slice(1)]
        : attacker.moves;

      for (let i = 0; i < Math.min(movesToShow.length, 4); i++) {
        const move = movesToShow[i];
        newMoveRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`battle_tmove_${i}`)
            .setLabel(`${move.name} (${move.power})`)
            .setStyle(ButtonStyle.Primary)
        );
      }

      await interaction.update({ embeds: [moveSelectEmbed], components: [newMoveRow] });

      const moveCollector = reply.createMessageComponentCollector({
        filter: (i2) => i2.user.id === battle.turn,
        time: 60000,
        max: 1
      });

      moveCollector.on("collect", async (moveInteraction) => {
        const moveIdx = parseInt(moveInteraction.customId.replace("battle_tmove_", ""));
        const movesToUse = attacker.gmaxed && attacker.gmaxData?.gmaxMove
          ? [attacker.gmaxData.gmaxMove, ...attacker.moves.slice(1)]
          : attacker.moves;
        const move = movesToUse[moveIdx] || attacker.moves[0];
        await executeBattleMove(moveInteraction, battle, channelId, attacker, defender, move, isP1Turn, message, transformText);
      });

      moveCollector.on("end", (collected) => {
        if (collected.size === 0) {
          const move = attacker.moves[0];
          executeBattleMove(null, battle, channelId, attacker, defender, move, isP1Turn, message, transformText);
        }
      });
      return;
    }

    const moveIdx = parseInt(customId.replace("battle_move_", ""));
    const move = attacker.moves[moveIdx];
    await executeBattleMove(interaction, battle, channelId, attacker, defender, move, isP1Turn, message, "");
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      activeBattles.delete(channelId);
      reply.edit({ content: "Battle timed out! No move selected.", components: [] }).catch(() => {});
    }
  });
}

async function executeBattleMove(interaction, battle, channelId, attacker, defender, move, isP1Turn, message, prefixText) {
  const attackerName = getBattleName(attacker);
  const defenderName = getBattleName(defender);

  const atkBoost = attacker.statBoosts?.atk || 0;
  const defBoost = defender.statBoosts?.def || 0;
  const spatkBoost = attacker.statBoosts?.spatk || 0;
  const spdefBoost = defender.statBoosts?.spdef || 0;

  const atkStat = calcStat(attacker.data.baseStats.atk, attacker.iv_atk, attacker.level, atkBoost);
  const defStat = calcStat(defender.data.baseStats.def, defender.iv_def, defender.level, defBoost);

  const moveType = move.type || attacker.activeTypes[0] || "normal";
  const effectiveness = getEffectiveness(moveType, defender.activeTypes || defender.data.types);
  const stab = (attacker.activeTypes || attacker.data.types).includes(moveType);

  const hit = Math.random() * 100 <= (move.accuracy || 100);
  let damage = 0;
  let effectText = "";

  if (hit) {
    damage = calcDamage(attacker.level, move.power, atkStat, defStat, effectiveness, stab);
    if (attacker.gmaxed) damage = Math.floor(damage * 1.3);
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
    const winnerPoke = winner === battle.challenger ? battle.p1 : battle.p2;
    const winnerName = getBattleName(winnerPoke);

    const reward = Math.floor(Math.random() * 300) + 150;
    await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [reward, winner]);

    const xpGain = Math.floor(Math.random() * 50) + 30;
    await pool.query("UPDATE pokemon SET xp = xp + $1 WHERE id = $2", [xpGain, winnerPoke.id]);

    const endEmbed = new EmbedBuilder()
      .setTitle("⚔️ Battle Over!")
      .setDescription(
        `${prefixText}${resultText}\n\n` +
        `🏆 **${winnerName}** wins!\n` +
        `<@${winner}> earned **${reward}** Cybercoins and **${xpGain}** XP!`
      )
      .setColor(0x2ecc71)
      .setThumbnail(getPokemonImage(winnerPoke.pokemon_id, winnerPoke.shiny));

    activeBattles.delete(channelId);
    if (interaction) {
      return interaction.update({ embeds: [endEmbed], components: [] });
    } else {
      return message.channel.send({ embeds: [endEmbed] });
    }
  }

  battle.turn = battle.turn === battle.challenger ? battle.opponent : battle.challenger;

  const turnEmbed = new EmbedBuilder()
    .setDescription(`${prefixText}${resultText}`)
    .setColor(0xff9900);

  if (interaction) {
    await interaction.update({ embeds: [turnEmbed], components: [] });
  } else {
    await message.channel.send({ embeds: [turnEmbed] });
  }

  startBattleTurn(message, battle, channelId);
}

module.exports = { name: "battle", aliases: ["duel", "fight"], description: "Battle another trainer", execute };
