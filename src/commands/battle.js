const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, totalIV } = require("../utils/helpers");
const { getMovesForPokemon } = require("../data/moves");
const { getEffectiveness } = require("../data/types");
const { getMegaData, getGmaxData, getGmaxMoves } = require("../data/mega");

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

function hpBar(current, max) {
  const pct = Math.max(0, current / max);
  const filled = Math.round(pct * 20);
  let barChar, barEmpty;
  if (pct > 0.5) { barChar = "🟩"; }
  else if (pct > 0.2) { barChar = "🟨"; }
  else { barChar = "🟥"; }
  return `${barChar} \`[${"█".repeat(filled)}${"░".repeat(20 - filled)}]\` **${current}**/${max} HP`;
}

function getPokeImage(poke) {
  const id = poke.pokemon_id;
  if (poke.gmaxed) {
    return `https://img.pokemondb.net/artwork/large/${getFormName(poke.data.name)}-gigantamax.jpg`;
  }
  if (poke.megaEvolved) {
    if (poke.megaData?.isPrimal) {
      return `https://img.pokemondb.net/artwork/large/${getFormName(poke.data.name)}-primal.jpg`;
    }
    return `https://img.pokemondb.net/artwork/large/${getFormName(poke.data.name)}-mega.jpg`;
  }
  return getPokemonImage(id, poke.shiny);
}

function getFormName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/\s+/g, "-");
}

function getCurrentMoves(poke) {
  if (poke.gmaxed && poke.gmaxData?.gmaxMoves) {
    return poke.gmaxData.gmaxMoves;
  }
  return poke.moves;
}

function buildBattleEmbed(battle, actionLog) {
  const p1 = battle.p1;
  const p2 = battle.p2;
  const p1Name = getBattleName(p1);
  const p2Name = getBattleName(p2);

  const isP1Turn = battle.turn === battle.challenger;
  const attacker = isP1Turn ? p1 : p2;

  let statusLines = "";
  if (p1.megaEvolved) statusLines += `💎 ${p1Name} is Mega Evolved!\n`;
  if (p1.gmaxed) statusLines += `💍 ${p1Name} is Gigantamaxed! (${p1.gmaxTurns} turns left)\n`;
  if (p2.megaEvolved) statusLines += `💎 ${p2Name} is Mega Evolved!\n`;
  if (p2.gmaxed) statusLines += `💍 ${p2Name} is Gigantamaxed! (${p2.gmaxTurns} turns left)\n`;

  const p1Types = (p1.activeTypes || p1.data.types).map(t => capitalize(t)).join("/");
  const p2Types = (p2.activeTypes || p2.data.types).map(t => capitalize(t)).join("/");

  const embed = new EmbedBuilder()
    .setTitle("⚔️ Pokemon Battle!")
    .setDescription(
      `**${p1Name}** [${p1Types}] (Lv. ${p1.level})\n` +
      `${hpBar(p1.currentHp, p1.maxHp)}\n\n` +
      `⚡ **VS** ⚡\n\n` +
      `**${p2Name}** [${p2Types}] (Lv. ${p2.level})\n` +
      `${hpBar(p2.currentHp, p2.maxHp)}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      (statusLines ? `${statusLines}\n` : "") +
      (actionLog ? `📋 ${actionLog}\n\n` : "\n") +
      `<@${battle.turn}>'s turn! Choose your move:`
    )
    .setColor(0xe74c3c)
    .setThumbnail(getPokeImage(attacker))
    .setFooter({ text: "60 seconds to choose • Moves show: Name (Power/Accuracy)" });

  return embed;
}

function buildMoveButtons(poke, prefix = "battle_move") {
  const moves = getCurrentMoves(poke);
  const row = new ActionRowBuilder();
  for (let i = 0; i < Math.min(moves.length, 4); i++) {
    const move = moves[i];
    const label = move.isProtect
      ? `${move.name} (Block)`
      : `${move.name} (${move.power}/${move.accuracy || 100})`;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}_${i}`)
        .setLabel(label.substring(0, 80))
        .setStyle(move.isProtect ? ButtonStyle.Secondary : ButtonStyle.Primary)
    );
  }
  return row;
}

async function execute(message, args) {
  const userId = message.author.id;
  const channelId = message.channel.id;

  if (!args.length) {
    return message.reply(
      "**⚔️ Battle Commands:**\n" +
      "`p!battle @user` - Challenge a trainer\n" +
      "`p!battle ai` - Fight an AI opponent\n" +
      "`p!battle accept` / `p!battle decline`"
    );
  }

  if (args[0].toLowerCase() === "accept") {
    const battle = activeBattles.get(channelId);
    if (!battle || battle.status !== "pending") return message.reply("No pending battle in this channel.");
    if (battle.opponent !== userId) return message.reply("This challenge isn't for you!");
    battle.status = "active";
    battle.turn = battle.challenger;
    return startBattleTurn(message, battle, channelId, "Battle begins!");
  }

  if (args[0].toLowerCase() === "decline" || args[0].toLowerCase() === "cancel") {
    const battle = activeBattles.get(channelId);
    if (!battle) return message.reply("No active battle in this channel.");
    if (battle.challenger !== userId && battle.opponent !== userId) return message.reply("This isn't your battle.");
    activeBattles.delete(channelId);
    return message.reply("Battle cancelled.");
  }

  if (args[0].toLowerCase() === "ai" || args[0].toLowerCase() === "npc" || args[0].toLowerCase() === "cpu") {
    return startAIBattle(message, userId, channelId);
  }

  const mentioned = message.mentions.users.first();
  if (!mentioned) return message.reply("Please mention a user to battle or use `p!battle ai`!");
  if (mentioned.id === userId) return message.reply("You can't battle yourself! Try `p!battle ai` instead.");
  if (mentioned.bot) return message.reply("You can't battle a bot! Try `p!battle ai` instead.");
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

  const battle = createBattleState(p1.rows[0], p2.rows[0], userId, mentioned.id);
  activeBattles.set(channelId, battle);

  const name1 = getBattleName(battle.p1);
  const name2 = getBattleName(battle.p2);
  const megaInfo1 = battle.p1.canMega ? " 💎" : (battle.p1.canGmax ? " 💍" : "");
  const megaInfo2 = battle.p2.canMega ? " 💎" : (battle.p2.canGmax ? " 💍" : "");

  const embed = new EmbedBuilder()
    .setTitle("⚔️ Battle Challenge!")
    .setDescription(
      `${message.author} challenges ${mentioned} to a battle!\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${p1.rows[0].shiny ? "✨ " : ""}**${name1}**${megaInfo1} (Lv. ${p1.rows[0].level}) — HP: ${battle.p1.maxHp}\n` +
      `vs\n` +
      `${p2.rows[0].shiny ? "✨ " : ""}**${name2}**${megaInfo2} (Lv. ${p2.rows[0].level}) — HP: ${battle.p2.maxHp}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${mentioned}, use \`p!battle accept\` to accept or \`p!battle decline\` to decline.`
    )
    .setColor(0xe74c3c)
    .setThumbnail(getPokemonImage(p1.rows[0].pokemon_id, p1.rows[0].shiny))
    .setImage(getPokemonImage(p2.rows[0].pokemon_id, p2.rows[0].shiny))
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

function createBattleState(p1Row, p2Row, challengerId, opponentId) {
  const data1 = getPokemonById(p1Row.pokemon_id);
  const data2 = getPokemonById(p2Row.pokemon_id);

  const hp1 = calcHP(data1.baseStats.hp, p1Row.iv_hp, p1Row.level);
  const hp2 = calcHP(data2.baseStats.hp, p2Row.iv_hp, p2Row.level);

  const p1HeldItem = p1Row.held_item;
  const p2HeldItem = p2Row.held_item;

  const p1CanMega = p1HeldItem === "mega_stone" && getMegaData(p1Row.pokemon_id);
  const p1CanGmax = p1HeldItem === "gmax_ring" && getGmaxData(p1Row.pokemon_id);
  const p2CanMega = p2HeldItem === "mega_stone" && getMegaData(p2Row.pokemon_id);
  const p2CanGmax = p2HeldItem === "gmax_ring" && getGmaxData(p2Row.pokemon_id);

  return {
    challenger: challengerId,
    opponent: opponentId,
    status: "pending",
    turn: null,
    isAI: false,
    p1: {
      ...p1Row, data: data1, maxHp: hp1, currentHp: hp1,
      moves: getMovesForPokemon(data1.types, p1Row.level),
      canMega: !!p1CanMega, canGmax: !!p1CanGmax,
      megaEvolved: false, gmaxed: false, gmaxTurns: 0,
      megaData: p1CanMega ? getMegaData(p1Row.pokemon_id) : null,
      gmaxData: p1CanGmax ? getGmaxData(p1Row.pokemon_id) : null,
      activeTypes: [...data1.types],
      statBoosts: { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 },
      baseMaxHp: hp1
    },
    p2: {
      ...p2Row, data: data2, maxHp: hp2, currentHp: hp2,
      moves: getMovesForPokemon(data2.types, p2Row.level),
      canMega: !!p2CanMega, canGmax: !!p2CanGmax,
      megaEvolved: false, gmaxed: false, gmaxTurns: 0,
      megaData: p2CanMega ? getMegaData(p2Row.pokemon_id) : null,
      gmaxData: p2CanGmax ? getGmaxData(p2Row.pokemon_id) : null,
      activeTypes: [...data2.types],
      statBoosts: { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 },
      baseMaxHp: hp2
    }
  };
}

async function startAIBattle(message, userId, channelId) {
  if (activeBattles.has(channelId)) return message.reply("There's already a battle in this channel!");

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) return message.reply("You haven't started yet!");
  if (!user.rows[0].selected_pokemon_id) return message.reply("You need to select a Pokemon first! Use `p!select <id>`.");

  const p1 = await pool.query("SELECT * FROM pokemon WHERE id = $1", [user.rows[0].selected_pokemon_id]);
  if (p1.rows.length === 0) return message.reply("Selected Pokemon not found.");

  const p1Data = getPokemonById(p1.rows[0].pokemon_id);
  const playerLevel = p1.rows[0].level;

  const aiLevel = Math.max(5, playerLevel + Math.floor(Math.random() * 11) - 5);

  const { generateIVs, randomNature } = require("../utils/helpers");
  const totalPokemon = 1025;
  let aiPokemonId;
  let aiData;
  let attempts = 0;
  do {
    aiPokemonId = Math.floor(Math.random() * totalPokemon) + 1;
    aiData = getPokemonById(aiPokemonId);
    attempts++;
  } while ((!aiData || !aiData.baseStats) && attempts < 50);

  if (!aiData) return message.reply("Failed to generate AI opponent. Try again!");

  const aiIVs = generateIVs();
  const aiNature = randomNature();
  const aiShiny = Math.random() < 0.01;

  const aiRow = {
    id: -1,
    user_id: "AI_TRAINER",
    pokemon_id: aiPokemonId,
    level: aiLevel,
    shiny: aiShiny,
    iv_hp: aiIVs.hp,
    iv_atk: aiIVs.atk,
    iv_def: aiIVs.def,
    iv_spatk: aiIVs.spatk,
    iv_spdef: aiIVs.spdef,
    iv_spd: aiIVs.spd,
    nature: aiNature,
    nickname: null,
    held_item: null,
    favorite: false
  };

  const aiCanGmax = getGmaxData(aiPokemonId);
  const aiCanMega = getMegaData(aiPokemonId);
  if (aiCanGmax && Math.random() < 0.4) {
    aiRow.held_item = "gmax_ring";
  } else if (aiCanMega && Math.random() < 0.4) {
    aiRow.held_item = "mega_stone";
  }

  const battle = createBattleState(p1.rows[0], aiRow, userId, "AI_TRAINER");
  battle.status = "active";
  battle.turn = userId;
  battle.isAI = true;
  battle.aiDifficulty = Math.min(1, playerLevel / 100 + 0.2);

  activeBattles.set(channelId, battle);

  const aiName = getBattleName(battle.p2);
  const p1Name = getBattleName(battle.p1);

  const embed = new EmbedBuilder()
    .setTitle("🤖 AI Battle Initiated!")
    .setDescription(
      `A wild AI Trainer appears with their **${aiName}**!\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${p1.rows[0].shiny ? "✨ " : ""}**${p1Name}** (Lv. ${p1.rows[0].level}) — HP: ${battle.p1.maxHp}\n` +
      `vs\n` +
      `${aiShiny ? "✨ " : ""}🤖 **${aiName}** (Lv. ${aiLevel}) — HP: ${battle.p2.maxHp}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setColor(0x9b59b6)
    .setThumbnail(getPokemonImage(p1.rows[0].pokemon_id, p1.rows[0].shiny))
    .setImage(getPokemonImage(aiPokemonId, aiShiny));

  await message.channel.send({ embeds: [embed] });

  await new Promise(r => setTimeout(r, 1500));
  return startBattleTurn(message, battle, channelId, "AI Battle begins! Choose your move!");
}

async function startBattleTurn(message, battle, channelId, actionLog) {
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
      const name = attacker.nickname || capitalize(attacker.data.name);
      actionLog = `${actionLog ? actionLog + "\n" : ""}💍 **${name}**'s Gigantamax wore off! Moves reverted to normal.`;
    }
  }

  if (battle.isAI && battle.turn === "AI_TRAINER") {
    return executeAITurn(message, battle, channelId, attacker, defender, isP1Turn, actionLog);
  }

  const embed = buildBattleEmbed(battle, actionLog);
  const moveRow = buildMoveButtons(attacker, "battle_move");
  const rows = [moveRow];

  const canMegaNow = attacker.canMega && !attacker.megaEvolved && !attacker.gmaxed;
  const canGmaxNow = attacker.canGmax && !attacker.gmaxed && !attacker.megaEvolved;

  if (canMegaNow || canGmaxNow) {
    const transformRow = new ActionRowBuilder();
    if (canMegaNow) {
      const label = attacker.megaData?.isPrimal ? "⚡ Primal Reversion" : "⚡ Mega Evolve";
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
          .setLabel("⚡ Gigantamax")
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
      transformText = `💎 **${attacker.nickname || capitalize(attacker.data.name)}** ${transformName} into **${megaData.name}**!`;

      const moveSelectEmbed = buildBattleEmbed(battle, transformText + "\n\nNow choose your move:");
      moveSelectEmbed.setThumbnail(getPokeImage(attacker));
      const newMoveRow = buildMoveButtons(attacker, "battle_tmove");
      await interaction.update({ embeds: [moveSelectEmbed], components: [newMoveRow] });

      const moveCollector = reply.createMessageComponentCollector({
        filter: (i2) => i2.user.id === battle.turn,
        time: 60000, max: 1
      });

      moveCollector.on("collect", async (moveInteraction) => {
        const moveIdx = parseInt(moveInteraction.customId.replace("battle_tmove_", ""));
        const moves = getCurrentMoves(attacker);
        const move = moves[moveIdx] || attacker.moves[0];
        await executeBattleMove(moveInteraction, battle, channelId, attacker, defender, move, isP1Turn, message, transformText);
      });

      moveCollector.on("end", (collected) => {
        if (collected.size === 0) {
          const move = getCurrentMoves(attacker)[0] || attacker.moves[0];
          executeBattleMove(null, battle, channelId, attacker, defender, move, isP1Turn, message, transformText);
        }
      });
      return;
    }

    if (customId === "battle_gmax") {
      const gmaxData = attacker.gmaxData;
      attacker.gmaxed = true;
      attacker.canGmax = false;
      attacker.gmaxTurns = 3;
      attacker.currentHp = Math.floor(attacker.currentHp * 1.5);
      attacker.maxHp = Math.floor(attacker.maxHp * 1.5);

      transformText = `💍 **${attacker.nickname || capitalize(attacker.data.name)}** Gigantamaxed into **${gmaxData.name}**!\nAll moves replaced with G-Max moves for 3 turns!`;

      const moveSelectEmbed = buildBattleEmbed(battle, transformText + "\n\nChoose your G-Max move:");
      moveSelectEmbed.setThumbnail(getPokeImage(attacker));
      const newMoveRow = buildMoveButtons(attacker, "battle_tmove");
      await interaction.update({ embeds: [moveSelectEmbed], components: [newMoveRow] });

      const moveCollector = reply.createMessageComponentCollector({
        filter: (i2) => i2.user.id === battle.turn,
        time: 60000, max: 1
      });

      moveCollector.on("collect", async (moveInteraction) => {
        const moveIdx = parseInt(moveInteraction.customId.replace("battle_tmove_", ""));
        const moves = getCurrentMoves(attacker);
        const move = moves[moveIdx] || moves[0];
        await executeBattleMove(moveInteraction, battle, channelId, attacker, defender, move, isP1Turn, message, transformText);
      });

      moveCollector.on("end", (collected) => {
        if (collected.size === 0) {
          const moves = getCurrentMoves(attacker);
          executeBattleMove(null, battle, channelId, attacker, defender, moves[0], isP1Turn, message, transformText);
        }
      });
      return;
    }

    const moveIdx = parseInt(customId.replace("battle_move_", ""));
    const moves = getCurrentMoves(attacker);
    const move = moves[moveIdx] || moves[0];
    await executeBattleMove(interaction, battle, channelId, attacker, defender, move, isP1Turn, message, "");
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      activeBattles.delete(channelId);
      reply.edit({ content: "Battle timed out! No move selected.", components: [] }).catch(() => {});
    }
  });
}

async function executeAITurn(message, battle, channelId, attacker, defender, isP1Turn, prevLog) {
  const moves = getCurrentMoves(attacker);
  const difficulty = battle.aiDifficulty || 0.5;

  let transformText = "";
  if (attacker.canGmax && !attacker.gmaxed && !attacker.megaEvolved && Math.random() < 0.6) {
    const gmaxData = attacker.gmaxData;
    attacker.gmaxed = true;
    attacker.canGmax = false;
    attacker.gmaxTurns = 3;
    attacker.currentHp = Math.floor(attacker.currentHp * 1.5);
    attacker.maxHp = Math.floor(attacker.maxHp * 1.5);
    transformText = `💍 🤖 **${attacker.nickname || capitalize(attacker.data.name)}** Gigantamaxed into **${gmaxData.name}**!`;
  } else if (attacker.canMega && !attacker.megaEvolved && !attacker.gmaxed && Math.random() < 0.6) {
    const megaData = attacker.megaData;
    attacker.megaEvolved = true;
    attacker.canMega = false;
    attacker.activeTypes = megaData.types || attacker.activeTypes;
    attacker.statBoosts = megaData.statBoost;
    const transformName = megaData.isPrimal ? "underwent Primal Reversion" : "Mega Evolved";
    transformText = `💎 🤖 **${attacker.nickname || capitalize(attacker.data.name)}** ${transformName} into **${megaData.name}**!`;
  }

  const currentMoves = getCurrentMoves(attacker);
  let chosenMove;

  if (Math.random() < difficulty) {
    let bestMove = currentMoves[0];
    let bestScore = -1;

    for (const move of currentMoves) {
      if (move.isProtect) continue;
      const moveType = move.type || attacker.activeTypes[0] || "normal";
      const effectiveness = getEffectiveness(moveType, defender.activeTypes || defender.data.types);
      const stab = (attacker.activeTypes || attacker.data.types).includes(moveType);
      const score = move.power * effectiveness * (stab ? 1.5 : 1) * ((move.accuracy || 100) / 100);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    chosenMove = bestMove;
  } else {
    const validMoves = currentMoves.filter(m => !m.isProtect);
    chosenMove = validMoves[Math.floor(Math.random() * validMoves.length)] || currentMoves[0];
  }

  const prefix = transformText ? transformText + "\n" : "";
  await executeBattleMove(null, battle, channelId, attacker, defender, chosenMove, isP1Turn, message, prefix);
}

async function executeBattleMove(interaction, battle, channelId, attacker, defender, move, isP1Turn, message, prefixText) {
  const attackerName = getBattleName(attacker);
  const defenderName = getBattleName(defender);

  if (move.isProtect) {
    const resultText = `🛡️ **${attackerName}** used **${move.name}**! Protected from the next attack!`;
    battle.turn = battle.turn === battle.challenger ? battle.opponent : battle.challenger;

    const embed = buildBattleEmbed(battle, `${prefixText}${resultText}`);
    embed.setThumbnail(getPokeImage(attacker));

    if (interaction) {
      await interaction.update({ embeds: [embed], components: [] });
    } else {
      await message.channel.send({ embeds: [embed] });
    }
    return startBattleTurn(message, battle, channelId, `${attackerName} is protecting!`);
  }

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
    if (effectiveness > 1) effectText = "💥 It's super effective! ";
    else if (effectiveness < 1 && effectiveness > 0) effectText = "😐 It's not very effective... ";
    else if (effectiveness === 0) { effectText = "❌ It had no effect! "; damage = 0; }
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
    const loserPoke = winner === battle.challenger ? battle.p2 : battle.p1;
    const winnerName = getBattleName(winnerPoke);
    const loserName = getBattleName(loserPoke);

    const isAIWin = winner === "AI_TRAINER";
    const isAILoss = loser === "AI_TRAINER";

    const reward = Math.floor(Math.random() * 300) + 150;
    const xpGain = Math.floor(Math.random() * 50) + 30;

    if (!isAIWin) {
      await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [reward, winner]);
      await pool.query("UPDATE pokemon SET xp = xp + $1 WHERE id = $2", [xpGain, winnerPoke.id]);
    }
    if (!isAILoss && !isAIWin) {
      const xpLoser = Math.floor(xpGain / 3);
      await pool.query("UPDATE pokemon SET xp = xp + $1 WHERE id = $2", [xpLoser, loserPoke.id]);
    }
    if (battle.isAI && !isAIWin) {
      const aiBonus = Math.floor(Math.random() * 100) + 50;
      await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [aiBonus, winner]);
    }

    const endEmbed = new EmbedBuilder()
      .setTitle("⚔️ Battle Over!")
      .setDescription(
        `${prefixText}${resultText}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${getBattleName(battle.p1)} — ${battle.p1.currentHp}/${battle.p1.maxHp} HP\n` +
        `${getBattleName(battle.p2)} — ${battle.p2.currentHp}/${battle.p2.maxHp} HP\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🏆 **${winnerName}** wins the battle!\n` +
        (isAIWin
          ? `The AI Trainer was victorious! Better luck next time!`
          : `<@${winner}> earned **${reward}** Cybercoins and **${xpGain}** XP!` +
            (battle.isAI ? `\n🤖 AI Battle Bonus: **+${Math.floor(Math.random() * 100) + 50}** Cybercoins!` : ""))
      )
      .setColor(0x2ecc71)
      .setThumbnail(getPokeImage(winnerPoke))
      .setImage(getPokeImage(loserPoke));

    activeBattles.delete(channelId);
    if (interaction) {
      return interaction.update({ embeds: [endEmbed], components: [] });
    } else {
      return message.channel.send({ embeds: [endEmbed] });
    }
  }

  battle.turn = battle.turn === battle.challenger ? battle.opponent : battle.challenger;

  if (interaction) {
    await interaction.update({ embeds: [{ description: `${prefixText}${resultText}`, color: 0xff9900 }], components: [] });
  } else {
    await message.channel.send({ embeds: [{ description: `${prefixText}${resultText}`, color: 0xff9900 }] });
  }

  await new Promise(r => setTimeout(r, battle.isAI ? 1500 : 500));
  startBattleTurn(message, battle, channelId, resultText);
}

module.exports = { name: "battle", aliases: ["duel", "fight"], description: "Battle another trainer or AI", execute };
