const { loadPokemonData, getPokemonByName } = require("./src/data/pokemonLoader");
loadPokemonData();
const E = require("./src/utils/battleEngine");
const AI = require("./src/utils/battleAI");
const { getMovesForPokemon } = require("./src/data/moves");

let nid = 1;
function mk(name, level, held) {
  const data = getPokemonByName(name);
  if (!data) throw new Error("no species " + name);
  const pool = getMovesForPokemon(data.types, level, data.id).map(m => m.name);
  const picks = pool.slice(0, 4);
  const row = {
    id: nid++, pokemon_id: data.id, level, nickname: null, shiny: false, nature: "hardy",
    iv_hp: 20, iv_atk: 20, iv_def: 20, iv_spatk: 20, iv_spdef: 20, iv_spd: 20,
    move1: picks[0], move2: picks[1], move3: picks[2], move4: picks[3],
    held_item: held || null
  };
  return E.prepareBattlePokemon(row, data);
}

function run(playerNames, aiNames, label, heldForAi) {
  const player = playerNames.map(n => mk(n, 50));
  // The lead optionally holds a Mega Stone, exactly as the shop grants it, so the
  // one-shot resource timing is actually exercised.
  const ai = aiNames.map((n, i) => mk(n, 50, heldForAi && i === 0 ? heldForAi : null));

  const b = {
    channelId: "probe", isAI: true, is3v3: true, turnNumber: 0,
    p1Team: player, p2Team: ai, p1Active: player[0], p2Active: ai[0],
    aiDifficulty: 0.95
  };

  let switched = 0, transformed = 0, faints = 0;
  const log = [];
  for (let turn = 1; turn <= 60; turn++) {
    b.turnNumber = turn;
    const p1 = b.p1Active, p2 = b.p2Active;
    if (!p1 || !p2) break;
    E.resetTurnFlags(p1); E.resetTurnFlags(p2);

    // Player baseline: greedy highest-expected-damage. A decent human.
    const pMoves = E.currentMoves(p1).filter(m => (m.pp ?? 0) > 0);
    let pMove = pMoves[0], bestD = -1;
    for (const m of pMoves) {
      const d = AI.damagePerTurn(p1, p2, m);
      if (d > bestD) { bestD = d; pMove = m; }
    }

    const plan = AI.decide(b, p2, p1);
    let aiMove;
    if (plan.action === "switch" && plan.switchTo) {
      E.onSwitchOut(p2);
      b.p2Active = plan.switchTo;
      switched++;
      log.push(`T${turn} switch ${E.battleName(p2)} -> ${E.battleName(plan.switchTo)} [${plan.plan}]`);
      aiMove = { isSwitchOnly: true, name: "Switch" };
    } else {
      if (plan.transform === "gmax") { E.applyGmax(p2); transformed++; log.push(`T${turn} GMAX ${E.battleName(p2)} (hp ${p2.currentHp}/${p2.maxHp})`); }
      else if (plan.transform === "mega") { E.applyMega(p2); transformed++; log.push(`T${turn} MEGA ${E.battleName(p2)} (hp ${p2.currentHp}/${p2.maxHp})`); }
      aiMove = AI.chooseMove(b, b.p2Active, p1);
    }

    const cur2 = b.p2Active;
    const first = E.firstActorIsA(p1, pMove, cur2, aiMove);
    const order = first ? [[p1, cur2, pMove], [cur2, p1, aiMove]] : [[cur2, p1, aiMove], [p1, cur2, pMove]];
    for (const [atk, def, mv] of order) {
      if (atk.currentHp <= 0 || def.currentHp <= 0) continue;
      const out = [];
      const res = E.performMove(atk, def, mv, out);
      AI.observe(b, atk, def, mv, res);
    }
    for (const p of [p1, cur2]) { E.endOfTurnResiduals(p, []); E.tickGmax(p); }

    if (p1.currentHp <= 0) { faints++; b.p1Active = b.p1Team.find(p => p.currentHp > 0) || null; }
    if (cur2.currentHp <= 0) { faints++; b.p2Active = b.p2Team.find(p => p.currentHp > 0) || null; }
    if (!b.p1Active || !b.p2Active) break;
  }

  const st = AI.stateFor(b);
  const alive1 = b.p1Team.filter(p => p.currentHp > 0).length;
  const alive2 = b.p2Team.filter(p => p.currentHp > 0).length;
  console.log(`\n=== ${label} ===`);
  console.log(log.slice(0, 12).join("\n") || "(no switches or transforms)");
  console.log(`switches ${switched} | transforms ${transformed} | faints ${faints} | player alive ${alive1} | ai alive ${alive2} | plan ${st.plan}`);
  for (const [k, v] of st.beliefs) {
    console.log(`  belief ${k}: seen [${v.seenMoves.map(m => m.name).join(", ") || "none"}] biggestHit ${v.biggestHit} atkBias ${v.atkBias.toFixed(3)}`);
  }
  return { alive1, alive2, switched, transformed };
}

// 1. Lopsided lead with a counter on the bench — does it pivot?
run(["charizard", "blastoise", "venusaur"], ["venusaur", "blastoise", "pikachu"], "AI leads into a bad matchup");

// 2. Mega timing.
run(["blastoise", "venusaur", "pikachu"], ["charizard", "gyarados", "alakazam"], "AI lead holds a Mega Stone", "mega_stone");

// 3. Mirror match, 30 runs — win rate of the new AI against the greedy baseline.
let wins = 0, losses = 0, draws = 0;
for (let i = 0; i < 30; i++) {
  const r = run(["gyarados", "arcanine", "machamp"], ["gyarados", "arcanine", "machamp"], `mirror ${i + 1}`);
  if (r.alive2 > r.alive1) wins++;
  else if (r.alive2 < r.alive1) losses++;
  else draws++;
}
console.log(`\n=== mirror match, 30 runs vs a greedy best-damage player ===`);
console.log(`AI wins ${wins} | losses ${losses} | draws ${draws}`);
