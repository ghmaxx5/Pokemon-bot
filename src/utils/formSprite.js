const { getPokemonImage } = require("../data/pokemonLoader");
const { getSprite } = require("./spriteCache");

/**
 * Battle sprite resolution, including Mega / Primal / Gigantamax forms.
 *
 * Battles used to guess a form's artwork from the species name:
 *   https://img.pokemondb.net/artwork/large/<name>-mega.jpg
 * which was wrong three ways. Charizard and Mewtwo megas are "-mega-x"/"-mega-y"
 * so those 404'd; it used the species name rather than the form name; and
 * pokemondb artwork is a JPG with a solid white background, which shows up as a
 * white box once it is drawn over a battle scene.
 *
 * Every form in src/data/mega.js is instead mapped to its PokeAPI alternate-form
 * id, which serves transparent official artwork from the same source as the base
 * sprites — so a Mega and a non-Mega on the same field match in style.
 * All 80 ids below were verified to return 200.
 */

const ARTWORK_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/";

// dex id -> PokeAPI form id for the Mega / Primal form this bot grants.
// Where a species has two megas (Charizard, Mewtwo) this matches whichever one
// src/data/mega.js actually defines — currently the X forms.
const MEGA_ART = {
  3: 10033, 6: 10034, 9: 10036, 15: 10090, 18: 10073, 65: 10037, 80: 10071,
  94: 10038, 115: 10039, 127: 10040, 130: 10041, 142: 10042, 150: 10043,
  181: 10045, 212: 10046, 214: 10047, 229: 10048, 248: 10049, 254: 10065,
  257: 10050, 260: 10064, 282: 10051, 302: 10066, 303: 10052, 306: 10053,
  308: 10054, 310: 10055, 319: 10070, 323: 10087, 334: 10067, 354: 10056,
  359: 10057, 362: 10074, 373: 10089, 376: 10076, 380: 10062, 381: 10063,
  382: 10077, 383: 10078, 384: 10079, 428: 10088, 445: 10058, 448: 10059,
  460: 10060, 475: 10068, 531: 10069, 719: 10075
};

// dex id -> PokeAPI form id for the Gigantamax form. 890 is Eternamax rather
// than a G-Max, which is the form this bot's Eternatus takes.
const GMAX_ART = {
  3: 10195, 6: 10196, 9: 10197, 12: 10198, 25: 10199, 52: 10200, 68: 10201,
  94: 10202, 99: 10203, 131: 10204, 133: 10205, 143: 10206, 569: 10207,
  809: 10208, 812: 10209, 815: 10210, 818: 10211, 823: 10212, 826: 10213,
  834: 10214, 839: 10215, 841: 10216, 842: 10217, 844: 10218, 849: 10219,
  851: 10220, 858: 10221, 861: 10222, 869: 10223, 879: 10224, 884: 10225,
  890: 10190, 892: 10226
};

function artworkUrl(formId) {
  return `${ARTWORK_BASE}${formId}.png`;
}

/** Slug used by pokemondb, kept only as a last-resort fallback. */
function dbSlug(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Ordered list of sprite URLs to try for a battle combatant.
 *
 * The chain always ends at the plain species sprite, so a form whose artwork is
 * unavailable degrades to the base Pokemon rather than to an empty frame.
 *
 * @param {object} poke a battle combatant (needs pokemon_id, data, shiny, and
 *                      the megaEvolved / gmaxed flags the engine sets)
 */
function spriteCandidates(poke) {
  if (!poke) return [];
  const urls = [];
  const dexId = poke.pokemon_id;

  if (poke.gmaxed) {
    // An explicit URL in mega.js wins — that's the escape hatch for custom art.
    if (poke.gmaxData?.gmaxImageUrl) urls.push(poke.gmaxData.gmaxImageUrl);
    if (GMAX_ART[dexId]) urls.push(artworkUrl(GMAX_ART[dexId]));
    if (poke.data?.name) urls.push(`https://img.pokemondb.net/artwork/large/${dbSlug(poke.data.name)}-gigantamax.jpg`);
  } else if (poke.megaEvolved) {
    if (poke.megaData?.imageUrl) urls.push(poke.megaData.imageUrl);
    if (MEGA_ART[dexId]) urls.push(artworkUrl(MEGA_ART[dexId]));
    // Derive the slug from the FORM name ("Mega Charizard X" -> charizard-mega-x)
    // rather than the species name, which is what the old code got wrong.
    if (poke.megaData?.name) {
      const parts = dbSlug(poke.megaData.name).split("-");
      const kind = parts[0]; // "mega" | "primal"
      const rest = parts.slice(1);
      if (rest.length) {
        const tail = rest.length > 1 ? `-${rest.slice(1).join("-")}` : "";
        urls.push(`https://img.pokemondb.net/artwork/large/${rest[0]}-${kind}${tail}.jpg`);
      }
    }
  }

  urls.push(getPokemonImage(dexId, !!poke.shiny));
  return urls.filter(Boolean);
}

/** The URL a form *should* use, for embed thumbnails that can't await a load. */
function bestSpriteUrl(poke) {
  const [first] = spriteCandidates(poke);
  return first || null;
}

/**
 * Loads the first candidate that actually decodes.
 *
 * Failures are remembered by spriteCache, so a form with no artwork costs one
 * failed request per five minutes rather than one per battle turn.
 *
 * @returns {Promise<{image: import("@napi-rs/canvas").Image|null, url: string|null}>}
 */
async function loadBattleSprite(poke) {
  for (const url of spriteCandidates(poke)) {
    const image = await getSprite(url);
    if (image) return { image, url };
  }
  return { image: null, url: null };
}

/** True when this Pokemon has real form artwork available (not a name guess). */
function hasFormArtwork(poke) {
  if (!poke) return false;
  if (poke.gmaxed) return !!(poke.gmaxData?.gmaxImageUrl || GMAX_ART[poke.pokemon_id]);
  if (poke.megaEvolved) return !!(poke.megaData?.imageUrl || MEGA_ART[poke.pokemon_id]);
  return true;
}

module.exports = {
  MEGA_ART, GMAX_ART, ARTWORK_BASE,
  artworkUrl, spriteCandidates, bestSpriteUrl, loadBattleSprite, hasFormArtwork
};
