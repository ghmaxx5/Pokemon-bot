// ── Collection querying ───────────────────────────────────────────────
// One place to fetch, filter, and sort a trainer's Pokémon.
//
// The important invariant: a Pokémon's *position* is its rank in `id ASC`
// order and nothing else. Sorting the display used to renumber the list, so
// `c!pokemon --iv` showed position 1 for the best Pokémon while
// `c!release 1` resolved position 1 against `id ASC` and deleted a different
// one. Position is now computed once from the canonical order and carried
// through every filter and sort.

const { pool } = require("../database");
const { getPokemonById } = require("../data/pokemonLoader");
const { getRarity, TIERS } = require("../data/rarity");
const { totalIV } = require("./helpers");

const SORTS = {
  default:  { label: "Collection order", cmp: (a, b) => a.id - b.id },
  iv:       { label: "IV (highest first)", cmp: (a, b) => b._iv - a._iv || a.id - b.id },
  ivasc:    { label: "IV (lowest first)", cmp: (a, b) => a._iv - b._iv || a.id - b.id },
  level:    { label: "Level (highest first)", cmp: (a, b) => b.level - a.level || a.id - b.id },
  levelasc: { label: "Level (lowest first)", cmp: (a, b) => a.level - b.level || a.id - b.id },
  pokedex:  { label: "Pokédex number", cmp: (a, b) => a.pokemon_id - b.pokemon_id || a.id - b.id },
  name:     { label: "Name (A–Z)", cmp: (a, b) => a._name.localeCompare(b._name) || a.id - b.id },
  recent:   { label: "Most recently caught", cmp: (a, b) => b.id - a.id }
};

const SORT_ALIASES = {
  "": "default", id: "default", order: "default", collection: "default",
  iv: "iv", ivs: "iv", "iv-desc": "iv", "iv-asc": "ivasc", ivasc: "ivasc", lowiv: "ivasc",
  level: "level", lvl: "level", "level-asc": "levelasc", levelasc: "levelasc", lowlevel: "levelasc",
  dex: "pokedex", pokedex: "pokedex", number: "pokedex",
  name: "name", alphabetical: "name", az: "name",
  recent: "recent", newest: "recent", latest: "recent"
};

/** Every Pokémon the trainer owns, in canonical order, with display fields. */
async function fetchCollection(userId) {
  const res = await pool.query(
    "SELECT * FROM pokemon WHERE user_id = $1 ORDER BY id ASC",
    [userId]
  );

  return res.rows.map((p, i) => {
    const data = getPokemonById(p.pokemon_id);
    const speciesName = data ? (data.displayName || data.name) : `#${p.pokemon_id}`;
    return Object.assign(p, {
      // `position` is stable: it never changes when the display is re-sorted.
      position: i + 1,
      _data: data,
      _species: speciesName,
      _name: (p.nickname || speciesName).toLowerCase(),
      _iv: totalIV({ hp: p.iv_hp, atk: p.iv_atk, def: p.iv_def, spatk: p.iv_spatk, spdef: p.iv_spdef, spd: p.iv_spd }),
      _rarity: data ? getRarity(data) : "common"
    });
  });
}

/**
 * Parses the shared collection flags.
 * @returns {{ page, sort, filters, unknown: string[] }}
 */
function parseCollectionArgs(args) {
  let page = 1;
  let sort = null;
  const filters = {};
  const unknown = [];

  const takeValue = (i) => {
    const next = args[i + 1];
    return next && !next.startsWith("--") ? next : null;
  };

  for (let i = 0; i < args.length; i++) {
    const arg = String(args[i]).toLowerCase();

    if (arg === "--page" || arg === "-p") {
      const v = takeValue(i);
      if (v) { page = parseInt(v, 10) || 1; i++; }
    } else if (arg === "--name" || arg === "--search" || arg === "-n") {
      const v = takeValue(i);
      // `--name` with a value searches; bare `--name` sorts alphabetically.
      if (v) { filters.name = v.toLowerCase(); i++; } else sort = "name";
    } else if (arg === "--type" || arg === "-t") {
      const v = takeValue(i);
      if (v) { filters.type = v.toLowerCase(); i++; }
    } else if (arg === "--nature") {
      const v = takeValue(i);
      if (v) { filters.nature = v.toLowerCase(); i++; }
    } else if (arg === "--rarity") {
      const v = takeValue(i);
      if (v) { filters.rarity = v.toLowerCase().replace(/[\s-]/g, "_"); i++; }
    } else if (arg === "--sort" || arg === "-s") {
      const v = takeValue(i);
      if (v) { sort = SORT_ALIASES[v.toLowerCase()] || null; i++; }
    } else if (arg === "--minlevel" || arg === "--minlvl") {
      const v = takeValue(i);
      if (v) { filters.minLevel = parseInt(v, 10); i++; }
    } else if (arg === "--maxlevel" || arg === "--maxlvl") {
      const v = takeValue(i);
      if (v) { filters.maxLevel = parseInt(v, 10); i++; }
    } else if (arg === "--miniv") {
      const v = takeValue(i);
      if (v) { filters.minIv = parseFloat(v); i++; }
    } else if (arg === "--maxiv") {
      const v = takeValue(i);
      if (v) { filters.maxIv = parseFloat(v); i++; }
    } else if (arg === "--shiny") filters.shiny = true;
    else if (arg === "--fav" || arg === "--favorite") filters.favorite = true;
    else if (arg === "--legendary") filters.legendary = true;
    else if (arg === "--mythical") filters.mythical = true;
    else if (arg === "--holding" || arg === "--held") filters.holding = true;
    else if (arg === "--mega") filters.mega = true;
    else if (arg === "--iv") sort = "iv";
    else if (arg === "--level" || arg === "--lvl") sort = "level";
    else if (arg === "--dex" || arg === "--pokedex") sort = "pokedex";
    else if (arg === "--recent") sort = "recent";
    else if (/^\d+$/.test(arg)) page = parseInt(arg, 10);
    else unknown.push(args[i]);
  }

  return { page: Math.max(1, page), sort, filters, unknown };
}

function applyFilters(rows, f = {}) {
  return rows.filter(p => {
    if (f.shiny && !p.shiny) return false;
    if (f.favorite && !p.favorite) return false;
    if (f.holding && !p.held_item) return false;
    if (f.name && !p._name.includes(f.name) && !p._species.toLowerCase().includes(f.name)) return false;
    if (f.nature && (p.nature || "").toLowerCase() !== f.nature) return false;
    if (f.rarity && p._rarity !== f.rarity) return false;
    if (f.minLevel != null && !isNaN(f.minLevel) && p.level < f.minLevel) return false;
    if (f.maxLevel != null && !isNaN(f.maxLevel) && p.level > f.maxLevel) return false;
    if (f.minIv != null && !isNaN(f.minIv) && p._iv < f.minIv) return false;
    if (f.maxIv != null && !isNaN(f.maxIv) && p._iv > f.maxIv) return false;
    if (f.type && !(p._data?.types || []).includes(f.type)) return false;
    if (f.legendary && !p._data?.isLegendary) return false;
    if (f.mythical && !p._data?.isMythical) return false;
    if (f.mega) {
      const { canMegaEvolve, canGmax } = require("../data/mega");
      if (!canMegaEvolve(p.pokemon_id) && !canGmax(p.pokemon_id)) return false;
    }
    return true;
  });
}

function applySort(rows, sort) {
  const spec = SORTS[sort] || SORTS.default;
  return rows.slice().sort(spec.cmp);
}

function sortLabel(sort) {
  return (SORTS[sort] || SORTS.default).label;
}

/** One-line summary of the active filters, for the embed footer. */
function describeFilters(f = {}) {
  const parts = [];
  if (f.name) parts.push(`name~"${f.name}"`);
  if (f.type) parts.push(`type:${f.type}`);
  if (f.nature) parts.push(`nature:${f.nature}`);
  if (f.rarity) parts.push(`rarity:${TIERS[f.rarity]?.label || f.rarity}`);
  if (f.shiny) parts.push("shiny");
  if (f.favorite) parts.push("favorite");
  if (f.holding) parts.push("holding an item");
  if (f.legendary) parts.push("legendary");
  if (f.mythical) parts.push("mythical");
  if (f.mega) parts.push("mega/gmax capable");
  if (f.minLevel != null && !isNaN(f.minLevel)) parts.push(`lvl≥${f.minLevel}`);
  if (f.maxLevel != null && !isNaN(f.maxLevel)) parts.push(`lvl≤${f.maxLevel}`);
  if (f.minIv != null && !isNaN(f.minIv)) parts.push(`IV≥${f.minIv}%`);
  if (f.maxIv != null && !isNaN(f.maxIv)) parts.push(`IV≤${f.maxIv}%`);
  return parts.join(", ");
}

/** The trainer's saved default sort from `c!order`. */
async function getUserSort(userId) {
  try {
    const res = await pool.query("SELECT list_sort FROM user_settings WHERE user_id = $1", [userId]);
    const value = res.rows[0]?.list_sort;
    return SORTS[value] ? value : "default";
  } catch (err) {
    return "default";
  }
}

async function setUserSort(userId, sort) {
  const key = SORTS[sort] ? sort : "default";
  await pool.query(
    `INSERT INTO user_settings (user_id, list_sort) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET list_sort = EXCLUDED.list_sort`,
    [userId, key]
  );
  return key;
}

module.exports = {
  SORTS, SORT_ALIASES,
  fetchCollection, parseCollectionArgs, applyFilters, applySort, sortLabel, describeFilters,
  getUserSort, setUserSort
};
