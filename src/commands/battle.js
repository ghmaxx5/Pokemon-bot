const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage, getRandomPokemon } = require("../data/pokemonLoader");
const { capitalize, totalIV, generateIVs, randomNature } = require("../utils/helpers");
const { getEffectiveness } = require("../data/types");
const { getMegaData, getGmaxData } = require("../data/mega");
const { generateBattleImage } = require("../utils/battleImage");
const { bestSpriteUrl, spriteCandidates } = require("../utils/formSprite");
const { prefetch } = require("../utils/spriteCache");
const S = require("../utils/scene");
const E = require("../utils/battleEngine");
const AI = require("../utils/battleAI");

const CHOICE_TIMEOUT = 60_000;
const SWITCH_TIMEOUT = 30_000;
const ACCEPT_TIMEOUT = 60_000;
const SELECT_TIMEOUT = 90_000;
// Hard cap so a stall-vs-stall matchup can't run forever.
const MAX_TURNS = 60;
// A battle whose collectors all died silently would otherwise keep the channel
// and both trainers locked out for good.
const IDLE_LIMIT = 10 * 60 * 1000;

const activeBattles = new Map(); // channelId -> battle
const battlingUsers = new Map(); // userId    -> channelId

// ── Registry ──────────────────────────────────────────────────────────

function registerBattle(battle) {
  activeBattles.set(battle.channelId, battle);
  battle.lastActivity = Date.now();
  battlingUsers.set(battle.challenger, battle.channelId);
  if (battle.opponent && battle.opponent !== "AI_TRAINER") {
    battlingUsers.set(battle.opponent, battle.channelId);
  }
  prepareScene(battle);
}

/**
 * Locks the arena in for the whole battle and warms every sprite it can need.
 *
 * The scene is chosen once, not per turn — deriving it from whoever is currently
 * active would swap the background on every switch. Mega and Gigantamax artwork
 * is prefetched here too, so the turn a form change actually happens the new
 * model is already in the cache and the frame doesn't stall or fall back to the
 * base sprite.
 */
function prepareScene(battle) {
  const teams = [battle.p1Team, battle.p2Team].filter(Array.isArray);
  const roster = teams.flat();
  const lead = battle.p1Active || roster[0];

  if (!battle.sceneKey) {
    battle.sceneKey = S.sceneForTypes(lead?.activeTypes || lead?.data?.types || []);
    battle.sceneSeed = S.seedFrom(battle.channelId, battle.sceneKey);
  }

  const urls = [];
  for (const poke of roster) {
    if (!poke) continue;
    urls.push(...spriteCandidates(poke));
    // The form the engine would grant if this Pokemon transforms mid-battle.
    if (poke.canMega) urls.push(...spriteCandidates({ ...poke, megaEvolved: true }));
    if (poke.canGmax) urls.push(...spriteCandidates({ ...poke, gmaxed: true }));
  }
  prefetch(urls);
}

function cleanupBattle(channelId) {
  const battle = activeBattles.get(channelId);
  if (!battle) return;
  activeBattles.delete(channelId);
  for (const [userId, cid] of battlingUsers) {
    if (cid === channelId) battlingUsers.delete(userId);
  }
}

function busyChannel(userId) {
  const cid = battlingUsers.get(userId);
  if (cid && activeBattles.has(cid)) return cid;
  if (cid) battlingUsers.delete(userId);
  return null;
}

/** A thrown error used to brick the channel forever — now it just ends the battle. */
async function abortBattle(battle, err, reason) {
  if (err) console.error("Battle aborted:", err);
  const channel = battle?.channel;
  cleanupBattle(battle?.channelId);
  if (!channel) return;
  await channel.send({
    embeds: [new EmbedBuilder()
      .setTitle("⚠️ Battle Ended")
      .setDescription(reason || "Something went wrong while resolving the turn, so the battle was cancelled. No rewards were given.")
      .setColor(0xe74c3c)]
  }).catch(() => {});
}

const idleSweep = setInterval(() => {
  const now = Date.now();
  for (const [channelId, battle] of activeBattles) {
    if (now - (battle.lastActivity || 0) > IDLE_LIMIT) {
      abortBattle(battle, null, "This battle was inactive for too long and has been cancelled.");
    }
  }
}, 60_000);
if (idleSweep.unref) idleSweep.unref();

// ── Presentation ──────────────────────────────────────────────────────

function getFormName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/\s+/g, "-");
}

/**
 * Sprite URL for embeds that can't await a load (thumbnails, the fallback image).
 * Mega / Gigantamax artwork is resolved by formSprite.js, which maps each form to
 * a transparent PNG — the old guess at a pokemondb `.jpg` gave a white box on the
 * battle scene, and 404'd outright for the X/Y megas.
 */
function getPokeImage(poke) {
  return bestSpriteUrl(poke) || getPokemonImage(poke.pokemon_id, poke.shiny);
}

/**
 * Everything the field renderer needs about one combatant. The whole candidate
 * chain is passed so a form with missing artwork falls back to the base sprite
 * inside the renderer instead of blanking the frame.
 */
function fieldSide(poke, dots) {
  return {
    currentHp: poke.currentHp,
    maxHp: poke.maxHp,
    displayName: E.battleName(poke),
    level: poke.level,
    teamDots: dots,
    types: poke.activeTypes || poke.data.types,
    status: poke.status,
    confusedTurns: poke.confusedTurns,
    stages: poke.stages,
    shiny: poke.shiny,
    megaEvolved: poke.megaEvolved,
    isPrimal: !!poke.megaData?.isPrimal,
    gmaxed: poke.gmaxed,
    gmaxTurns: poke.gmaxTurns,
    zPowered: !!poke.zPowered,
    protecting: poke.protecting,
    charging: !!poke.chargedMove,
    mustRecharge: poke.mustRecharge,
    spriteUrls: spriteCandidates(poke)
  };
}

function teamDots(team) {
  return team.map(p => p.currentHp > 0);
}

function sideLabel(battle, side) {
  if (side === 2 && battle.isAI) return "🤖 AI Trainer";
  return `<@${side === 1 ? battle.challenger : battle.opponent}>`;
}

/** The shared field view: canvas image plus whatever happened last turn. */
async function buildFieldEmbed(battle, actionLog) {
  const p1 = battle.p1Active;
  const p2 = battle.p2Active;
  const p1Name = E.battleName(p1);
  const p2Name = E.battleName(p2);

  const banner = [];
  if (p1.megaEvolved) banner.push(`💎 ${p1Name} is Mega Evolved!`);
  if (p1.gmaxed) banner.push(`💍 ${p1Name} is Gigantamaxed! (${p1.gmaxTurns} turn${p1.gmaxTurns === 1 ? "" : "s"} left)`);
  if (p2.megaEvolved) banner.push(`💎 ${p2Name} is Mega Evolved!`);
  if (p2.gmaxed) banner.push(`💍 ${p2Name} is Gigantamaxed! (${p2.gmaxTurns} turn${p2.gmaxTurns === 1 ? "" : "s"} left)`);

  const p1Tag = E.statusTag(p1);
  const p2Tag = E.statusTag(p2);
  const condition = [];
  if (p1Tag) condition.push(`${p1Name} — ${p1Tag}`);
  if (p2Tag) condition.push(`${p2Name} — ${p2Tag}`);

  let imageUrl = getPokeImage(p2);
  let attachment = null;
  try {
    const buffer = await generateBattleImage(
      fieldSide(p1, battle.is3v3 ? teamDots(battle.p1Team) : null),
      fieldSide(p2, battle.is3v3 ? teamDots(battle.p2Team) : null),
      getPokeImage(p1),
      getPokeImage(p2),
      { turn: battle.turnNumber || 1, sceneKey: battle.sceneKey, seed: battle.sceneSeed }
    );
    attachment = new AttachmentBuilder(buffer, { name: "battle.png" });
    imageUrl = "attachment://battle.png";
  } catch (err) {
    console.error("Battle image generation failed:", err);
  }

  const p1Types = (p1.activeTypes || p1.data.types).map(capitalize).join("/");
  const p2Types = (p2.activeTypes || p2.data.types).map(capitalize).join("/");

  const description = [
    banner.length ? banner.join("\n") : null,
    actionLog && actionLog.trim() ? actionLog.trim() : null,
    condition.length ? `\n**Conditions**\n${condition.join("\n")}` : null
  ].filter(Boolean).join("\n\n") || "⚔️ Battle in progress!";

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Pokémon Battle — Turn ${battle.turnNumber || 1}`)
    .setDescription(description.slice(0, 4000))
    .setColor(battle.isAI ? 0x9b59b6 : 0xe74c3c)
    .setImage(imageUrl)
    .setFooter({ text: `${p1Name} [${p1Types}] vs ${p2Name} [${p2Types}]` });

  return { embed, attachment };
}

async function sendField(battle, actionLog) {
  const { embed, attachment } = await buildFieldEmbed(battle, actionLog);
  const opts = { embeds: [embed], components: [] };
  if (attachment) opts.files = [attachment];
  return battle.channel.send(opts);
}

/** Per-player move selector. Shows PP and greys out empty slots. */
function buildMoveRow(poke, prefix) {
  const row = new ActionRowBuilder();
  const moves = E.currentMoves(poke);

  if (E.isOutOfPP(poke)) {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`${prefix}_struggle`)
      .setLabel("Struggle (no PP left)")
      .setStyle(ButtonStyle.Danger));
    return row;
  }

  for (let i = 0; i < Math.min(moves.length, 4); i++) {
    const move = moves[i];
    const isStatus = move.category === "status" || !(move.power > 0);
    const label = isStatus
      ? `${move.name} · ${move.pp}/${move.maxPp} PP`
      : `${move.name} · ${move.power} · ${move.pp}/${move.maxPp} PP`;
    row.addComponents(new ButtonBuilder()
      .setCustomId(`${prefix}_move_${i}`)
      .setLabel(label.slice(0, 80))
      .setStyle(isStatus ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled((move.pp ?? 0) <= 0));
  }
  return row;
}

function buildActionRows(battle, poke, prefix, { allowSwitch = true } = {}) {
  const rows = [buildMoveRow(poke, prefix)];

  const canMega = poke.canMega && !poke.megaEvolved && !poke.gmaxed;
  const canGmax = poke.canGmax && !poke.gmaxed && !poke.megaEvolved;
  const canZMove = poke.canZMove && !poke.zUsed && !poke.zPowered;
  const team = battle.p1Team.includes(poke) ? battle.p1Team : battle.p2Team;
  const canSwitch = allowSwitch && battle.is3v3 && team.some(p => p.currentHp > 0 && p !== poke);

  const row = new ActionRowBuilder();
  if (canMega) {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`${prefix}_mega`)
      .setLabel(poke.megaData?.isPrimal ? "Primal Reversion" : "Mega Evolve")
      .setEmoji("💎").setStyle(ButtonStyle.Danger));
  }
  if (canGmax) {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`${prefix}_gmax`).setLabel("Gigantamax")
      .setEmoji("💍").setStyle(ButtonStyle.Danger));
  }
  if (canZMove) {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`${prefix}_zmove`).setLabel("Z-Power")
      .setEmoji("⚡").setStyle(ButtonStyle.Danger));
  }
  if (canSwitch) {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`${prefix}_switch`).setLabel("Switch")
      .setEmoji("🔄").setStyle(ButtonStyle.Secondary));
  }
  row.addComponents(new ButtonBuilder()
    .setCustomId(`${prefix}_pass`).setLabel("Pass")
    .setEmoji("⏭️").setStyle(ButtonStyle.Secondary));
  rows.push(row);

  return rows;
}

function buildChooseEmbed(battle, side, note) {
  const poke = side === 1 ? battle.p1Active : battle.p2Active;
  const name = E.battleName(poke);
  const types = (poke.activeTypes || poke.data.types).map(capitalize).join("/");
  const tag = E.statusTag(poke);

  const lines = [];
  if (poke.megaEvolved) lines.push(`💎 ${name} is Mega Evolved!`);
  if (poke.gmaxed) lines.push(`💍 ${name} is Gigantamaxed! (${poke.gmaxTurns} left)`);
  if (lines.length) lines.push("");

  lines.push(`**${name}** [${types}] — Lv. ${poke.level}`);
  lines.push(E.hpBar(poke.currentHp, poke.maxHp));
  if (tag) lines.push(`Condition: ${tag}`);
  lines.push("");
  lines.push(note || "Pick your action below — your opponent is choosing at the same time.");
  lines.push(`\n⏱️ ${CHOICE_TIMEOUT / 1000} seconds to choose`);

  return new EmbedBuilder()
    .setTitle("⚔️ Choose Your Action")
    .setDescription(lines.join("\n"))
    .setColor(0x3498db)
    .setThumbnail(getPokeImage(poke))
    .setFooter({ text: "Buttons show: Move · Power · PP" });
}

const lockedEmbed = (text, color = 0x2ecc71) =>
  new EmbedBuilder().setDescription(text).setColor(color);

// ── Choice helpers ────────────────────────────────────────────────────

/** A Pokemon locked into recharging or a charge move doesn't get to choose. */
function forcedChoice(poke) {
  if (poke.mustRecharge) return { name: "Recharge", isForced: true };
  const charging = E.forcedMove(poke);
  if (charging) return charging;
  return null;
}

/** What to use when a trainer never pressed a button. */
function timeoutChoice(poke) {
  const moves = E.currentMoves(poke).filter(m => (m.pp ?? 0) > 0);
  if (!moves.length) return { ...E.STRUGGLE };
  return moves.find(m => m.category !== "status" && m.power > 0) || moves[0];
}

function resolveMoveFromCustomId(poke, customId, prefix) {
  if (customId === `${prefix}_struggle`) return { ...E.STRUGGLE };
  const index = parseInt(customId.replace(`${prefix}_move_`, ""), 10);
  const moves = E.currentMoves(poke);
  return moves[index] || timeoutChoice(poke);
}

// ── Command entry ─────────────────────────────────────────────────────

async function execute(message, args, spawns, prefix) {
  const userId = message.author.id;
  const channelId = message.channel.id;
  const mentioned = message.mentions.users.first();
  const sub = (args[0] || "").toLowerCase();

  if (!args.length) {
    return message.reply(
      "**⚔️ Battle Commands**\n" +
      `\`${prefix}battle @user\` — challenge a trainer to a 3v3\n` +
      `\`${prefix}battle ai\` — fight an AI trainer (3v3)\n` +
      `\`${prefix}battle quit\` — forfeit the battle in this channel\n\n` +
      "Battles use real Pokémon mechanics: physical/special split, natures, " +
      "STAB, type matchups, criticals, PP, move priority and status conditions."
    );
  }

  if (sub === "quit" || sub === "forfeit" || sub === "ff") {
    return handleForfeit(message, userId, channelId);
  }

  if (sub === "ai" || sub === "npc" || sub === "cpu") {
    return startAIBattle(message, userId, channelId);
  }

  if (!mentioned) return message.reply(`Please mention a trainer to battle, or use \`${prefix}battle ai\`.`);
  if (mentioned.id === userId) return message.reply(`You can't battle yourself! Try \`${prefix}battle ai\`.`);
  if (mentioned.bot) return message.reply(`You can't battle a bot! Try \`${prefix}battle ai\`.`);
  if (activeBattles.has(channelId)) return message.reply("There's already a battle running in this channel!");

  const busySelf = busyChannel(userId);
  if (busySelf) return message.reply(`You're already in a battle in <#${busySelf}>!`);
  const busyFoe = busyChannel(mentioned.id);
  if (busyFoe) return message.reply(`${mentioned.username} is already in a battle in <#${busyFoe}>!`);

  const [user1, user2] = await Promise.all([
    pool.query("SELECT 1 FROM users WHERE user_id = $1 AND started = TRUE", [userId]),
    pool.query("SELECT 1 FROM users WHERE user_id = $1 AND started = TRUE", [mentioned.id])
  ]);
  if (user1.rows.length === 0) return message.reply(`You haven't started yet! Use \`${prefix}start\`.`);
  if (user2.rows.length === 0) return message.reply("That trainer hasn't started yet!");

  const [p1Pokemon, p2Pokemon] = await Promise.all([
    pool.query("SELECT * FROM pokemon WHERE user_id = $1 ORDER BY level DESC, id ASC LIMIT 25", [userId]),
    pool.query("SELECT * FROM pokemon WHERE user_id = $1 ORDER BY level DESC, id ASC LIMIT 25", [mentioned.id])
  ]);
  if (p1Pokemon.rows.length < 1) return message.reply("You need at least 1 Pokémon to battle!");
  if (p2Pokemon.rows.length < 1) return message.reply("Your opponent needs at least 1 Pokémon to battle!");

  const battle = {
    challenger: userId,
    opponent: mentioned.id,
    status: "pending",
    channelId,
    channel: message.channel,
    is3v3: true,
    p1Team: [], p2Team: [],
    p1Active: null, p2Active: null,
    p1Selection: [], p2Selection: [],
    p1Pokemon: p1Pokemon.rows,
    p2Pokemon: p2Pokemon.rows,
    turnNumber: 0,
    isAI: false
  };
  registerBattle(battle);

  const challengeEmbed = new EmbedBuilder()
    .setTitle("⚔️ Battle Challenge!")
    .setDescription(
      `${message.author} challenges ${mentioned} to a **3v3 Pokémon Battle**!\n\n` +
      "Each trainer picks 3 Pokémon. Picks stay hidden from the opponent.\n" +
      "Both trainers choose their move at the same time each turn."
    )
    .setColor(0xe74c3c)
    .setFooter({ text: `Challenge expires in ${ACCEPT_TIMEOUT / 1000} seconds` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("battle_accept").setLabel("Accept").setEmoji("⚔️").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("battle_decline").setLabel("Decline").setEmoji("❌").setStyle(ButtonStyle.Danger)
  );

  const challengeMsg = await message.channel.send({ content: `${mentioned}`, embeds: [challengeEmbed], components: [row] });

  const collector = challengeMsg.createMessageComponentCollector({
    filter: i => i.user.id === mentioned.id,
    time: ACCEPT_TIMEOUT,
    max: 1
  });

  collector.on("collect", async (interaction) => {
    if (interaction.customId === "battle_decline") {
      cleanupBattle(channelId);
      return interaction.update({
        embeds: [new EmbedBuilder().setTitle("❌ Challenge Declined").setColor(0x95a5a6)],
        components: []
      }).catch(() => {});
    }

    await interaction.update({
      embeds: [new EmbedBuilder()
        .setTitle("⚔️ Challenge Accepted!")
        .setDescription("Both trainers — select your team below. You can pick at the same time.")
        .setColor(0x2ecc71)],
      components: []
    }).catch(() => {});

    battle.status = "selecting";
    battle.lastActivity = Date.now();

    try {
      // Both selectors go up at once — the old code made the opponent wait for
      // the challenger to finish before they could even see their list.
      await Promise.all([
        collectTeamSelection(message, battle, userId, p1Pokemon.rows, "p1Selection", "Challenger"),
        collectTeamSelection(message, battle, mentioned.id, p2Pokemon.rows, "p2Selection", "Opponent")
      ]);
      await startBattle(message, battle);
    } catch (err) {
      await abortBattle(battle, err);
    }
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      cleanupBattle(channelId);
      challengeMsg.edit({
        embeds: [new EmbedBuilder().setTitle("⏰ Challenge Expired").setColor(0x95a5a6)],
        components: []
      }).catch(() => {});
    }
  });
}

async function handleForfeit(message, userId, channelId) {
  const battle = activeBattles.get(channelId);
  if (!battle) return message.reply("There's no active battle in this channel!");

  const isChallenger = userId === battle.challenger;
  const isOpponent = userId === battle.opponent;
  if (!isChallenger && !isOpponent) return message.reply("You're not part of the battle in this channel!");

  if (battle.status !== "active") {
    cleanupBattle(channelId);
    return message.reply("Battle cancelled.");
  }

  battle.forfeitedBy = userId;
  return finishBattle(battle, isChallenger ? 2 : 1, `🏳️ <@${userId}> forfeited the battle!`, { forfeit: true });
}

// ── Team selection ────────────────────────────────────────────────────

async function collectTeamSelection(message, battle, playerId, pokemonRows, selectionKey, label) {
  const maxPicks = Math.min(3, pokemonRows.length);
  const roster = pokemonRows.slice(0, 25);

  const options = roster.map((p, i) => {
    const data = getPokemonById(p.pokemon_id);
    const name = p.nickname || (data ? capitalize(data.name) : `#${p.pokemon_id}`);
    const iv = totalIV({ hp: p.iv_hp, atk: p.iv_atk, def: p.iv_def, spatk: p.iv_spatk, spdef: p.iv_spdef, spd: p.iv_spd });
    return {
      label: `${i + 1}. ${p.shiny ? "✨ " : ""}${name}`.slice(0, 100),
      value: String(p.id),
      description: `Lv. ${p.level} · IV ${iv}% · ${p.nature || "—"}`.slice(0, 100)
    };
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`teamsel_${playerId}`)
    .setPlaceholder(`Pick exactly ${maxPicks} Pokémon`)
    .setMinValues(maxPicks)
    .setMaxValues(maxPicks)
    .addOptions(options);

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Select Your Team — ${label}`)
    .setDescription(
      `<@${playerId}>, choose **${maxPicks}** Pokémon from the menu below.\n` +
      "Your opponent cannot see your picks.\n\n" +
      roster.slice(0, 15).map((p, i) => {
        const data = getPokemonById(p.pokemon_id);
        const name = p.nickname || (data ? capitalize(data.name) : `#${p.pokemon_id}`);
        return `\`${i + 1}.\` ${p.shiny ? "✨ " : ""}**${name}** — Lv. ${p.level}`;
      }).join("\n") +
      (roster.length > 15 ? `\n…and ${roster.length - 15} more in the menu` : "")
    )
    .setColor(0x3498db)
    .setFooter({ text: `${SELECT_TIMEOUT / 1000}s to pick — your strongest ${maxPicks} are used if you time out` });

  const selectMsg = await battle.channel.send({
    content: `<@${playerId}>`,
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  });

  return new Promise((resolve) => {
    let settled = false;
    const collector = selectMsg.createMessageComponentCollector({
      filter: i => i.user.id === playerId && i.customId === `teamsel_${playerId}`,
      time: SELECT_TIMEOUT,
      max: 1
    });

    collector.on("collect", async (interaction) => {
      const ids = interaction.values.map(v => parseInt(v, 10)).filter(id => roster.some(p => p.id === id));
      if (ids.length === 0) {
        await interaction.reply({ content: "Those Pokémon aren't in your roster — try again.", ephemeral: true }).catch(() => {});
        return;
      }
      battle[selectionKey] = ids;
      battle.lastActivity = Date.now();
      settled = true;
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle("✅ Team Locked In")
          .setDescription(`<@${playerId}> selected ${ids.length} Pokémon.`)
          .setColor(0x2ecc71)],
        components: []
      }).catch(() => {});
      resolve();
    });

    collector.on("end", () => {
      if (settled) return;
      battle[selectionKey] = roster.slice(0, maxPicks).map(p => p.id);
      selectMsg.edit({
        embeds: [new EmbedBuilder()
          .setTitle("⏰ Time's Up")
          .setDescription(`<@${playerId}>'s team was auto-filled with their strongest ${maxPicks}.`)
          .setColor(0xe67e22)],
        components: []
      }).catch(() => {});
      resolve();
    });
  });
}

/** Loads the picked rows, verifying ownership, in the order they were picked. */
async function loadTeam(userId, ids) {
  if (!ids.length) return [];
  const res = await pool.query(
    "SELECT * FROM pokemon WHERE id = ANY($1::int[]) AND user_id = $2",
    [ids, userId]
  );
  const byId = new Map(res.rows.map(r => [r.id, r]));
  return ids
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(row => {
      const data = getPokemonById(row.pokemon_id);
      return data ? E.prepareBattlePokemon(row, data) : null;
    })
    .filter(Boolean);
}

async function startBattle(message, battle) {
  if (!activeBattles.has(battle.channelId)) return;
  if (battle.status === "active") return;
  battle.status = "active";

  battle.p1Team = await loadTeam(battle.challenger, battle.p1Selection);
  battle.p2Team = battle.isAI
    ? battle.aiTeamData.map(a => E.prepareBattlePokemon(a.row, a.data))
    : await loadTeam(battle.opponent, battle.p2Selection);

  if (battle.p1Team.length === 0 || battle.p2Team.length === 0) {
    return abortBattle(battle, null, "Battle cancelled — couldn't load the selected Pokémon.");
  }

  battle.p1Active = battle.p1Team[0];
  battle.p2Active = battle.p2Team[0];

  // registerBattle ran before the teams existed, so the arena and the sprite
  // warm-up are settled now that they do.
  prepareScene(battle);

  const p1Names = battle.p1Team.map(p => `${E.battleName(p)} (Lv. ${p.level})`).join(", ");
  const p2Names = battle.p2Team.map(p => `${battle.isAI ? "🤖 " : ""}${E.battleName(p)} (Lv. ${p.level})`).join(", ");

  await battle.channel.send({
    embeds: [new EmbedBuilder()
      .setTitle(battle.isAI ? "⚔️ 3v3 AI Battle Begins!" : "⚔️ 3v3 Battle Begins!")
      .setDescription(
        `**${sideLabel(battle, 1)}'s team**\n${p1Names}\n\n` +
        `**${sideLabel(battle, 2)}'s team**\n${p2Names}\n\n` +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
        `**${E.battleName(battle.p1Active)}** and **${E.battleName(battle.p2Active)}** take the field!`
      )
      .setColor(battle.isAI ? 0x9b59b6 : 0xe74c3c)]
  });

  await sleep(1500);
  return beginTurn(battle, null);
}

// ── AI ────────────────────────────────────────────────────────────────

/**
 * AI Pokemon now come from the same rarity-weighted pool as wild spawns, so a
 * random opponent is usually an ordinary species instead of a coin-flip
 * chance at a box legendary.
 */
function generateAIPokemon(playerLevel) {
  const data = getRandomPokemon();
  if (!data || !data.baseStats) return null;

  const level = Math.max(5, Math.min(100, playerLevel + Math.floor(Math.random() * 11) - 5));
  const ivs = generateIVs();
  const id = -(Math.floor(Math.random() * 1_000_000) + 1);

  const row = {
    id, user_id: "AI_TRAINER", pokemon_id: data.id,
    level, shiny: Math.random() < 0.01,
    iv_hp: ivs.hp, iv_atk: ivs.atk, iv_def: ivs.def,
    iv_spatk: ivs.spatk, iv_spdef: ivs.spdef, iv_spd: ivs.spd,
    nature: randomNature(), nickname: null, held_item: null, favorite: false,
    move1: null, move2: null, move3: null, move4: null
  };

  if (getGmaxData(data.id) && Math.random() < 0.35) row.held_item = "gmax_ring";
  else if (getMegaData(data.id) && Math.random() < 0.35) row.held_item = "mega_stone";
  else if (Math.random() < 0.30) row.held_item = "z_ring";

  return { row, data };
}

async function startAIBattle(message, userId, channelId) {
  if (activeBattles.has(channelId)) return message.reply("There's already a battle running in this channel!");
  const busy = busyChannel(userId);
  if (busy) return message.reply(`You're already in a battle in <#${busy}>!`);

  const user = await pool.query("SELECT 1 FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) return message.reply("You haven't started yet!");

  const p1Pokemon = await pool.query("SELECT * FROM pokemon WHERE user_id = $1 ORDER BY level DESC, id ASC LIMIT 25", [userId]);
  if (p1Pokemon.rows.length < 1) return message.reply("You need at least 1 Pokémon to battle!");

  const top = p1Pokemon.rows.slice(0, 3);
  const avgLevel = Math.round(top.reduce((s, p) => s + p.level, 0) / top.length);

  const aiTeamData = [];
  for (let i = 0; i < 3 && aiTeamData.length < 3; i++) {
    const ai = generateAIPokemon(avgLevel);
    if (ai) aiTeamData.push(ai);
  }
  if (aiTeamData.length === 0) return message.reply("Failed to generate an AI opponent — try again!");

  const battle = {
    challenger: userId,
    opponent: "AI_TRAINER",
    status: "selecting",
    channelId,
    channel: message.channel,
    is3v3: true,
    p1Team: [], p2Team: [],
    p1Active: null, p2Active: null,
    p1Selection: [], p2Selection: [],
    p1Pokemon: p1Pokemon.rows,
    p2Pokemon: [],
    turnNumber: 0,
    isAI: true,
    aiTeamData,
    aiDifficulty: Math.min(0.95, avgLevel / 120 + 0.35)
  };
  registerBattle(battle);

  const aiNames = aiTeamData
    .map(a => `${a.row.shiny ? "✨ " : ""}🤖 ${capitalize(a.data.name)} (Lv. ${a.row.level})`)
    .join(", ");

  await message.channel.send({
    embeds: [new EmbedBuilder()
      .setTitle("🤖 AI Trainer Challenge!")
      .setDescription(
        `An AI Trainer appears with **${aiTeamData.length} Pokémon**!\n\n` +
        `🤖 ${aiNames}\n\n` +
        "Select your team below."
      )
      .setColor(0x9b59b6)
      .setFooter({ text: "3v3 — same rules as PvP" })]
  });

  try {
    await collectTeamSelection(message, battle, userId, p1Pokemon.rows, "p1Selection", "Your Team");
    battle.p2Selection = aiTeamData.map(a => a.row.id);
    await startBattle(message, battle);
  } catch (err) {
    await abortBattle(battle, err);
  }
}

function scoreMove(attacker, defender, move) {
  if (!move) return -1;
  if (move.isProtect || move.effect?.isProtect) return 12;

  if (move.category === "status" || !(move.power > 0)) {
    const eff = move.effect || {};
    // Healing is worth a lot when hurt, boosts are worth a little when healthy.
    if (eff.heal) return attacker.currentHp / attacker.maxHp < 0.5 ? 90 : 5;
    if (eff.status && !defender.status) return 55;
    if (eff.boost) return 35;
    return 10;
  }

  const type = move.type || "normal";
  const eff = getEffectiveness(type, defender.activeTypes || defender.data.types);
  if (eff === 0) return 0;

  const atkKey = move.category === "special" ? "spatk" : "atk";
  const defKey = move.effect?.defensiveStat || (move.category === "special" ? "spdef" : "def");
  const ratio = E.effStat(attacker, atkKey) / Math.max(1, E.effStat(defender, defKey));
  const stab = (attacker.activeTypes || attacker.data.types).includes(type) ? 1.5 : 1;

  return move.power * eff * stab * ratio * ((move.accuracy || 100) / 100);
}

function pickAIMove(battle, attacker, defender) {
  const usable = E.currentMoves(attacker).filter(m => (m.pp ?? 0) > 0);
  if (!usable.length) return { ...E.STRUGGLE };

  const difficulty = battle.aiDifficulty ?? 0.5;
  if (Math.random() >= difficulty) {
    const random = usable.filter(m => !(m.isProtect || m.effect?.isProtect));
    return random[Math.floor(Math.random() * random.length)] || usable[0];
  }

  let best = usable[0];
  let bestScore = -Infinity;
  for (const move of usable) {
    const score = scoreMove(attacker, defender, move);
    if (score > bestScore) { bestScore = score; best = move; }
  }
  return best;
}

// ── Turn loop ─────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function beginTurn(battle, actionLog) {
  if (!activeBattles.has(battle.channelId)) return;
  battle.lastActivity = Date.now();
  battle.turnNumber = (battle.turnNumber || 0) + 1;

  try {
    if (actionLog) {
      await sendField(battle, actionLog);
      await sleep(1200);
    }

    if (battle.turnNumber > MAX_TURNS) {
      return finishBattle(battle, judgeOnHp(battle), `⏳ The battle reached the ${MAX_TURNS}-turn limit!`, { timeLimit: true });
    }

    E.resetTurnFlags(battle.p1Active);
    E.resetTurnFlags(battle.p2Active);

    if (battle.isAI) return collectTurnAI(battle);
    return collectTurnPvP(battle);
  } catch (err) {
    return abortBattle(battle, err);
  }
}

/** Whoever has more remaining team HP takes a time-limit win; equal is a draw. */
function judgeOnHp(battle) {
  const total = team => team.reduce((s, p) => s + p.currentHp / p.maxHp, 0);
  const a = total(battle.p1Team);
  const b = total(battle.p2Team);
  if (Math.abs(a - b) < 0.01) return null;
  return a > b ? 1 : 2;
}

async function collectTurnPvP(battle) {
  const p1 = battle.p1Active;
  const p2 = battle.p2Active;

  const state = {
    p1Choice: forcedChoice(p1),
    p2Choice: forcedChoice(p2),
    p1Transform: "",
    p2Transform: "",
    resolved: false
  };

  const fieldEmbed = await buildFieldEmbed(battle, null);
  fieldEmbed.embed
    .setTitle(`⚔️ Turn ${battle.turnNumber} — choose your move!`)
    .setDescription(
      `<@${battle.challenger}> vs <@${battle.opponent}>\n` +
      "Both trainers pick at the same time. Your choice stays hidden until both are locked in.\n\n" +
      `⏱️ ${CHOICE_TIMEOUT / 1000} seconds`
    );
  const fieldOpts = {
    content: `<@${battle.challenger}> <@${battle.opponent}>`,
    embeds: [fieldEmbed.embed],
    components: []
  };
  if (fieldEmbed.attachment) fieldOpts.files = [fieldEmbed.attachment];
  await battle.channel.send(fieldOpts);

  async function tryResolve() {
    if (state.resolved) return;
    if (!state.p1Choice || !state.p2Choice) return;
    state.resolved = true;
    await resolveTurn(battle, state);
  }

  const messages = {};

  for (const side of [1, 2]) {
    const poke = side === 1 ? p1 : p2;
    const playerId = side === 1 ? battle.challenger : battle.opponent;
    const prefix = side === 1 ? "p1mv" : "p2mv";
    const preset = side === 1 ? state.p1Choice : state.p2Choice;

    if (preset) {
      // Locked into recharging or a charge move — no choice to make.
      await battle.channel.send({
        embeds: [lockedEmbed(
          `<@${playerId}> — **${E.battleName(poke)}** is locked into **${preset.name}** this turn.`,
          0xe67e22
        )]
      });
      continue;
    }

    messages[side] = await battle.channel.send({
      content: `<@${playerId}> — your action:`,
      embeds: [buildChooseEmbed(battle, side, null)],
      components: buildActionRows(battle, poke, prefix)
    });
  }

  await tryResolve();
  if (state.resolved) return;

  for (const side of [1, 2]) {
    const msg = messages[side];
    if (!msg) continue;
    attachChoiceCollector(battle, state, side, msg, tryResolve);
  }
}

/** Wires up one player's buttons: move / pass / switch / mega / gmax. */
function attachChoiceCollector(battle, state, side, msg, tryResolve) {
  const prefix = side === 1 ? "p1mv" : "p2mv";
  const playerId = side === 1 ? battle.challenger : battle.opponent;
  const poke = side === 1 ? battle.p1Active : battle.p2Active;
  const setChoice = (choice) => { if (side === 1) state.p1Choice = choice; else state.p2Choice = choice; };
  const setTransform = (text) => { if (side === 1) state.p1Transform = text; else state.p2Transform = text; };
  const getChoice = () => (side === 1 ? state.p1Choice : state.p2Choice);

  const lockIn = async (interaction, text, color) => {
    battle.lastActivity = Date.now();
    await interaction.update({ embeds: [lockedEmbed(text, color)], components: [] }).catch(() => {});
  };

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === playerId && i.customId.startsWith(`${prefix}_`),
    time: CHOICE_TIMEOUT
  });

  collector.on("collect", async (interaction) => {
    const id = interaction.customId;
    try {
      if (getChoice()) {
        return interaction.reply({ content: "You've already locked in this turn.", ephemeral: true }).catch(() => {});
      }

      // ── Pass ──
      if (id === `${prefix}_pass`) {
        setChoice({ isPass: true, name: "Pass" });
        await lockIn(interaction, "⏭️ Passing this turn — waiting for your opponent…", 0x95a5a6);
        collector.stop("chosen");
        return tryResolve();
      }

      // ── Switch ──
      if (id === `${prefix}_switch`) {
        const team = side === 1 ? battle.p1Team : battle.p2Team;
        const bench = team.filter(p => p.currentHp > 0 && p !== poke);
        const row = new ActionRowBuilder();
        bench.forEach((p, i) => row.addComponents(new ButtonBuilder()
          .setCustomId(`${prefix}_sw_${i}`)
          .setLabel(`${E.battleName(p)} · ${p.currentHp}/${p.maxHp} HP`.slice(0, 80))
          .setStyle(ButtonStyle.Primary)));
        row.addComponents(new ButtonBuilder()
          .setCustomId(`${prefix}_swback`).setLabel("Back").setStyle(ButtonStyle.Secondary));

        await interaction.update({
          embeds: [buildChooseEmbed(battle, side, "Choose who to send in:")],
          components: [row]
        }).catch(() => {});
        return;
      }

      if (id === `${prefix}_swback`) {
        await interaction.update({
          embeds: [buildChooseEmbed(battle, side, null)],
          components: buildActionRows(battle, poke, prefix)
        }).catch(() => {});
        return;
      }

      if (id.startsWith(`${prefix}_sw_`)) {
        const team = side === 1 ? battle.p1Team : battle.p2Team;
        const bench = team.filter(p => p.currentHp > 0 && p !== poke);
        const target = bench[parseInt(id.replace(`${prefix}_sw_`, ""), 10)];
        if (!target) return interaction.deferUpdate().catch(() => {});

        E.onSwitchOut(poke);
        if (side === 1) battle.p1Active = target; else battle.p2Active = target;
        setTransform(`🔄 **${E.battleName(poke)}** was withdrawn — **${E.battleName(target)}** takes the field!`);
        setChoice({ isSwitchOnly: true, name: "Switch" });
        await lockIn(interaction, "✅ Switch locked in — waiting for your opponent…");
        collector.stop("chosen");
        return tryResolve();
      }

      // ── Mega / Gigantamax / Z-Power: transform now, then still pick a move ──
      if (id === `${prefix}_mega` || id === `${prefix}_gmax` || id === `${prefix}_zmove`) {
        let text;
        if (id === `${prefix}_mega`) {
          const kind = E.applyMega(poke);
          text = `💎 **${E.battleName(poke)}** triggered ${kind}!`;
        } else if (id === `${prefix}_gmax`) {
          const form = E.applyGmax(poke);
          text = `💍 **${E.battleName(poke)}** Gigantamaxed into **${form}**! G-Max moves active for 3 turns.`;
        } else {
          E.applyZPower(poke);
          text = `⚡ **${E.battleName(poke)}** gathered **Z-Power**! Its next attack will hit with overwhelming force.`;
        }
        setTransform(text);
        battle.lastActivity = Date.now();
        await interaction.update({
          embeds: [buildChooseEmbed(battle, side, `${text}\n\n**Now choose your move:**`)],
          components: [buildMoveRow(poke, prefix)]
        }).catch(() => {});
        return;
      }

      // ── Move ──
      if (id.startsWith(`${prefix}_move_`) || id === `${prefix}_struggle`) {
        setChoice(resolveMoveFromCustomId(poke, id, prefix));
        await lockIn(interaction, "✅ Move locked in — waiting for your opponent…");
        collector.stop("chosen");
        return tryResolve();
      }
    } catch (err) {
      console.error("Battle choice handler failed:", err);
      await interaction.deferUpdate().catch(() => {});
    }
  });

  collector.on("end", async (_c, reason) => {
    if (reason === "chosen" || getChoice()) return;
    setChoice(timeoutChoice(poke));
    await msg.edit({
      embeds: [lockedEmbed("⏰ Out of time — a move was chosen automatically.", 0xe67e22)],
      components: []
    }).catch(() => {});
    tryResolve();
  });
}

async function collectTurnAI(battle) {
  const p1 = battle.p1Active;
  const p2 = battle.p2Active;

  const state = {
    p1Choice: forcedChoice(p1),
    p2Choice: null,
    p1Transform: "",
    p2Transform: "",
    resolved: false
  };

  // ── AI decides: transform, switch out when outclassed, or attack ──
  // The whole decision lives in src/utils/battleAI.js. It plays off a belief model
  // instead of reading the player's row, counts turns-to-KO both ways, and times
  // its one-shot Mega / Gmax deliberately. See HANDOVER.md §6.1.
  //
  // If any of that throws, the turn falls back to the original coin-flip AI below
  // rather than killing the battle — there is no test suite standing behind this.
  state.p2Choice = forcedChoice(p2);
  if (!state.p2Choice) {
    let plan = null;
    try {
      plan = AI.decide(battle, p2, p1);
    } catch (err) {
      console.error("Battle AI decision failed, using the fallback:", err);
    }

    if (plan && plan.action === "switch" && plan.switchTo) {
      const target = plan.switchTo;
      E.onSwitchOut(p2);
      battle.p2Active = target;
      state.p2Transform = `🔄 🤖 The AI withdrew **${E.battleName(p2)}** and sent out **${E.battleName(target)}**!`;
      state.p2Choice = { isSwitchOnly: true, name: "Switch" };
    } else if (plan) {
      if (plan.transform === "gmax") {
        const form = E.applyGmax(p2);
        state.p2Transform = `💍 🤖 **${E.battleName(p2)}** Gigantamaxed into **${form}**!`;
      } else if (plan.transform === "mega") {
        const kind = E.applyMega(p2);
        state.p2Transform = `💎 🤖 **${E.battleName(p2)}** triggered ${kind}!`;
      } else if (plan.transform === "z") {
        E.applyZPower(p2);
        state.p2Transform = `⚡ 🤖 **${E.battleName(p2)}** gathered **Z-Power**!`;
      }
      // Picked after the transform on purpose: Gigantamax swaps the entire move
      // list, and a Mega changes types and stats, so scoring must see the new body.
      try {
        state.p2Choice = AI.chooseMove(battle, battle.p2Active, p1);
      } catch (err) {
        console.error("Battle AI move choice failed, using the fallback:", err);
        state.p2Choice = pickAIMove(battle, battle.p2Active, p1);
      }
    } else {
      // Fallback: the original behaviour, unchanged.
      const bench = battle.p2Team.filter(p => p.currentHp > 0 && p !== p2);
      const hurt = p2.currentHp / p2.maxHp < 0.25;
      if (bench.length && hurt && Math.random() < 0.4) {
        const target = bench.reduce((best, p) => (p.currentHp / p.maxHp > best.currentHp / best.maxHp ? p : best), bench[0]);
        E.onSwitchOut(p2);
        battle.p2Active = target;
        state.p2Transform = `🔄 🤖 The AI withdrew **${E.battleName(p2)}** and sent out **${E.battleName(target)}**!`;
        state.p2Choice = { isSwitchOnly: true, name: "Switch" };
      } else {
        if (p2.canGmax && !p2.gmaxed && !p2.megaEvolved && Math.random() < 0.55) {
          const form = E.applyGmax(p2);
          state.p2Transform = `💍 🤖 **${E.battleName(p2)}** Gigantamaxed into **${form}**!`;
        } else if (p2.canMega && !p2.megaEvolved && !p2.gmaxed && Math.random() < 0.55) {
          const kind = E.applyMega(p2);
          state.p2Transform = `💎 🤖 **${E.battleName(p2)}** triggered ${kind}!`;
        }
        state.p2Choice = pickAIMove(battle, battle.p2Active, p1);
      }
    }
  }

  const fieldEmbed = await buildFieldEmbed(battle, null);
  fieldEmbed.embed
    .setTitle(`⚔️ Turn ${battle.turnNumber} — choose your move!`)
    .setDescription(`<@${battle.challenger}> — the AI has locked in its move.\n\n⏱️ ${CHOICE_TIMEOUT / 1000} seconds`);
  const fieldOpts = { embeds: [fieldEmbed.embed], components: [] };
  if (fieldEmbed.attachment) fieldOpts.files = [fieldEmbed.attachment];
  await battle.channel.send(fieldOpts);

  async function tryResolve() {
    if (state.resolved) return;
    if (!state.p1Choice || !state.p2Choice) return;
    state.resolved = true;
    await resolveTurn(battle, state);
  }

  if (state.p1Choice) {
    await battle.channel.send({
      embeds: [lockedEmbed(
        `<@${battle.challenger}> — **${E.battleName(p1)}** is locked into **${state.p1Choice.name}** this turn.`,
        0xe67e22
      )]
    });
    return tryResolve();
  }

  const msg = await battle.channel.send({
    content: `<@${battle.challenger}> — your action:`,
    embeds: [buildChooseEmbed(battle, 1, "🤖 The AI has chosen. Pick your action!")],
    components: buildActionRows(battle, p1, "p1mv")
  });

  attachChoiceCollector(battle, state, 1, msg, tryResolve);
}

// ── Resolution ────────────────────────────────────────────────────────

async function resolveTurn(battle, state) {
  try {
    if (!activeBattles.has(battle.channelId)) return;
    battle.lastActivity = Date.now();

    // Read the *current* actives. Switching used to reassign battle.p1Active
    // while resolution still used the pre-switch closure, so the opponent's
    // move hit the Pokemon that had already left the field.
    const p1 = battle.p1Active;
    const p2 = battle.p2Active;
    const { p1Choice, p2Choice, p1Transform, p2Transform } = state;

    const p1First = E.firstActorIsA(p1, p1Choice, p2, p2Choice);
    const lines = [];

    for (const text of p1First ? [p1Transform, p2Transform] : [p2Transform, p1Transform]) {
      if (text) lines.push(text);
    }
    if (lines.length) lines.push("");

    const p1Speed = E.getSpeed(p1);
    const p2Speed = E.getSpeed(p2);
    const fast = p1First ? p1 : p2;
    const slow = p1First ? p2 : p1;
    const fastMove = p1First ? p1Choice : p2Choice;
    const slowMove = p1First ? p2Choice : p1Choice;
    const fastPrio = fastMove?.priority || 0;
    const slowPrio = slowMove?.priority || 0;

    if (fastPrio !== slowPrio) {
      lines.push(`⚡ **${E.battleName(fast)}** moves first with a priority move!`);
    } else {
      lines.push(`⚡ **${E.battleName(fast)}** is faster (${p1First ? p1Speed : p2Speed} vs ${p1First ? p2Speed : p1Speed} Spd)`);
    }
    lines.push("");

    const firstLog = [];
    const firstResult = E.performMove(fast, slow, fastMove, firstLog);
    if (firstLog.length) lines.push(firstLog.map((l, i) => (i === 0 ? `🔹 ${l}` : l)).join("\n"));
    // The AI only learns about the player from what it just watched happen.
    AI.observe(battle, fast, slow, fastMove, firstResult);

    if (slow.currentHp > 0 && fast.currentHp > 0) {
      const secondLog = [];
      const secondResult = E.performMove(slow, fast, slowMove, secondLog);
      if (secondLog.length) {
        lines.push("");
        lines.push(secondLog.map((l, i) => (i === 0 ? `🔸 ${l}` : l)).join("\n"));
      }
      AI.observe(battle, slow, fast, slowMove, secondResult);
    } else if (slow.currentHp <= 0) {
      lines.push("");
      lines.push(`🔸 **${E.battleName(slow)}** couldn't move!`);
    }

    // ── End of turn: chip damage, then Gigantamax timers ──
    const residualLog = [];
    for (const poke of p1First ? [p1, p2] : [p2, p1]) {
      E.endOfTurnResiduals(poke, residualLog);
    }
    if (residualLog.length) {
      lines.push("");
      lines.push(residualLog.join("\n"));
    }

    const gmaxLog = [];
    for (const poke of [p1, p2]) {
      const worn = E.tickGmax(poke);
      if (worn) gmaxLog.push(worn);
    }
    if (gmaxLog.length) {
      lines.push("");
      lines.push(gmaxLog.join("\n"));
    }

    const actionLog = lines.filter(l => l !== undefined).join("\n").trim();

    const p1Down = p1.currentHp <= 0;
    const p2Down = p2.currentHp <= 0;

    if (!p1Down && !p2Down) {
      await sleep(battle.isAI ? 1200 : 700);
      return beginTurn(battle, actionLog);
    }

    // ── Faints ──
    const faintLines = [];
    if (p1Down) faintLines.push(`💀 **${E.battleName(p1)}** fainted!`);
    if (p2Down) faintLines.push(`💀 **${E.battleName(p2)}** fainted!`);
    const faintLog = `${actionLog}\n\n${faintLines.join("\n")}`;

    await sendField(battle, faintLog);
    await sleep(1200);

    const p1Alive = battle.p1Team.some(p => p.currentHp > 0);
    const p2Alive = battle.p2Team.some(p => p.currentHp > 0);

    if (!p1Alive && !p2Alive) {
      // A mutual wipe used to be paid out as a win for the challenger.
      return finishBattle(battle, null, "💀 Both trainers are out of usable Pokémon — it's a draw!");
    }
    if (!p1Alive) return finishBattle(battle, 2, `🏆 ${sideLabel(battle, 2)} defeated every one of ${sideLabel(battle, 1)}'s Pokémon!`);
    if (!p2Alive) return finishBattle(battle, 1, `🏆 ${sideLabel(battle, 1)} defeated every one of ${sideLabel(battle, 2)}'s Pokémon!`);

    // Both sides still have Pokemon — replace each fainted slot. The old code
    // only ever handled one side, so a double KO left the loser's dead Pokemon
    // on the field.
    const entryLines = [];
    if (p1Down) {
      E.onSwitchOut(p1);
      const line = await promptReplacement(battle, 1);
      if (!activeBattles.has(battle.channelId)) return;
      if (line) entryLines.push(line);
    }
    if (p2Down) {
      E.onSwitchOut(p2);
      const line = await promptReplacement(battle, 2);
      if (!activeBattles.has(battle.channelId)) return;
      if (line) entryLines.push(line);
    }

    await sleep(600);
    return beginTurn(battle, entryLines.join("\n") || null);
  } catch (err) {
    return abortBattle(battle, err);
  }
}

/** Asks a trainer for their next Pokemon (AI picks the healthiest itself). */
function promptReplacement(battle, side) {
  const team = side === 1 ? battle.p1Team : battle.p2Team;
  const ownerId = side === 1 ? battle.challenger : battle.opponent;
  const bench = team.filter(p => p.currentHp > 0);

  const setActive = (poke) => {
    if (side === 1) battle.p1Active = poke; else battle.p2Active = poke;
  };

  if (!bench.length) return Promise.resolve(null);

  if (battle.isAI && ownerId === "AI_TRAINER") {
    const next = bench.reduce((best, p) => (p.currentHp / p.maxHp > best.currentHp / best.maxHp ? p : best), bench[0]);
    setActive(next);
    return Promise.resolve(`🤖 The AI sent out **${E.battleName(next)}**!`);
  }

  if (bench.length === 1) {
    setActive(bench[0]);
    return Promise.resolve(`🔄 <@${ownerId}> sent out **${E.battleName(bench[0])}**!`);
  }

  return new Promise(async (resolve) => {
    const row = new ActionRowBuilder();
    bench.forEach((p, i) => row.addComponents(new ButtonBuilder()
      .setCustomId(`faintsw_${side}_${i}`)
      .setLabel(`${E.battleName(p)} · Lv.${p.level} · ${p.currentHp}/${p.maxHp} HP`.slice(0, 80))
      .setStyle(ButtonStyle.Primary)));

    const msg = await battle.channel.send({
      content: `<@${ownerId}>`,
      embeds: [new EmbedBuilder()
        .setTitle("💀 Your Pokémon fainted!")
        .setDescription(`<@${ownerId}>, choose who to send in next.\n\n⏱️ ${SWITCH_TIMEOUT / 1000} seconds`)
        .setColor(0xe74c3c)],
      components: [row]
    }).catch(() => null);

    if (!msg) {
      setActive(bench[0]);
      return resolve(`🔄 **${E.battleName(bench[0])}** entered the battle!`);
    }

    let settled = false;
    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === ownerId && i.customId.startsWith(`faintsw_${side}_`),
      time: SWITCH_TIMEOUT,
      max: 1
    });

    collector.on("collect", async (interaction) => {
      const next = bench[parseInt(interaction.customId.replace(`faintsw_${side}_`, ""), 10)];
      if (!next) return interaction.deferUpdate().catch(() => {});
      settled = true;
      battle.lastActivity = Date.now();
      setActive(next);
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setTitle("🔄 Go!")
          .setDescription(`**${E.battleName(next)}** entered the battle!`)
          .setColor(0x3498db)],
        components: []
      }).catch(() => {});
      resolve(`🔄 <@${ownerId}> sent out **${E.battleName(next)}**!`);
    });

    collector.on("end", () => {
      if (settled) return;
      const next = bench.reduce((best, p) => (p.currentHp / p.maxHp > best.currentHp / best.maxHp ? p : best), bench[0]);
      setActive(next);
      msg.edit({
        embeds: [new EmbedBuilder()
          .setTitle("⏰ Time's Up")
          .setDescription(`**${E.battleName(next)}** was sent out automatically.`)
          .setColor(0xe67e22)],
        components: []
      }).catch(() => {});
      resolve(`🔄 **${E.battleName(next)}** was sent out automatically!`);
    });
  });
}

// ── Rewards ───────────────────────────────────────────────────────────

const REWARDS = {
  win:      { coinsMin: 150, coinsMax: 450, xpMin: 30, xpMax: 80 },
  aiBonus:  { min: 50, max: 150 },
  forfeit:  { coins: 200, xp: 30 },
  draw:     { coins: 100, xp: 20 }
};

const randBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Adds XP to every Pokemon on a side, levelling up (and evolving) as needed. */
async function awardTeamXp(battle, side, xp) {
  const ownerId = side === 1 ? battle.challenger : battle.opponent;
  if (ownerId === "AI_TRAINER" || xp <= 0) return;
  const team = side === 1 ? battle.p1Team : battle.p2Team;
  const { addXp } = require("../utils/levelUpHelper");

  for (const poke of team) {
    if (poke.id <= 0) continue; // AI Pokemon use negative synthetic ids
    try {
      await addXp(ownerId, poke.id, xp, battle.channel);
    } catch (err) {
      console.error(`Failed to award XP to pokemon ${poke.id}:`, err);
    }
  }
}

async function finishBattle(battle, winnerSide, headline, opts = {}) {
  const channelId = battle.channelId;
  cleanupBattle(channelId);

  const isDraw = winnerSide === null;
  const winnerId = winnerSide === 1 ? battle.challenger : winnerSide === 2 ? battle.opponent : null;
  const loserSide = winnerSide === 1 ? 2 : winnerSide === 2 ? 1 : null;
  const loserId = loserSide === 1 ? battle.challenger : loserSide === 2 ? battle.opponent : null;
  const aiWon = winnerId === "AI_TRAINER";

  const detail = [];

  try {
    if (isDraw) {
      const { coins, xp } = REWARDS.draw;
      for (const side of [1, 2]) {
        const owner = side === 1 ? battle.challenger : battle.opponent;
        if (owner === "AI_TRAINER") continue;
        await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [coins, owner]);
        await awardTeamXp(battle, side, xp);
      }
      detail.push(`🤝 Both trainers earned **${coins}** Cybercoins and **${xp}** XP per Pokémon.`);
    } else if (aiWon) {
      detail.push("🤖 The AI Trainer was victorious! No rewards this time — try again!");
      if (loserSide) await awardTeamXp(battle, loserSide, REWARDS.forfeit.xp);
    } else {
      const coins = opts.forfeit ? REWARDS.forfeit.coins : randBetween(REWARDS.win.coinsMin, REWARDS.win.coinsMax);
      const xp = opts.forfeit ? REWARDS.forfeit.xp : randBetween(REWARDS.win.xpMin, REWARDS.win.xpMax);
      // The AI bonus used to be paid with one random roll and displayed with a
      // second one, so the number shown never matched the coins received.
      const aiBonus = battle.isAI ? randBetween(REWARDS.aiBonus.min, REWARDS.aiBonus.max) : 0;

      await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [coins + aiBonus, winnerId]);
      await awardTeamXp(battle, winnerSide, xp);
      if (loserId && loserId !== "AI_TRAINER") await awardTeamXp(battle, loserSide, Math.max(1, Math.floor(xp / 3)));

      detail.push(`<@${winnerId}> earned **${coins}** Cybercoins and **${xp}** XP per Pokémon.`);
      if (aiBonus) detail.push(`🤖 AI Battle Bonus: **+${aiBonus}** Cybercoins!`);
      if (loserId && loserId !== "AI_TRAINER") {
        detail.push(`<@${loserId}>'s team gained **${Math.max(1, Math.floor(xp / 3))}** XP each for the effort.`);
      }
    }
  } catch (err) {
    console.error("Failed to pay out battle rewards:", err);
    detail.push("⚠️ Rewards couldn't be saved — please contact an admin.");
  }

  const winnerPoke = winnerSide === 1 ? battle.p1Active : winnerSide === 2 ? battle.p2Active : null;

  const embed = new EmbedBuilder()
    .setTitle(isDraw ? "🤝 Battle Drawn!" : "🏆 Battle Over!")
    .setDescription(`${headline}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${detail.join("\n")}`)
    .setColor(isDraw ? 0x95a5a6 : 0x2ecc71)
    .setFooter({ text: `${battle.turnNumber || 0} turns fought` });

  if (winnerPoke) embed.setThumbnail(getPokeImage(winnerPoke));

  return battle.channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  name: "battle",
  aliases: ["duel", "fight"],
  description: "Battle another trainer or an AI trainer (3v3)",
  execute
};
