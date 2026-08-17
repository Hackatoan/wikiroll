import axios from 'axios';
import { getWikiWeightMap, setWikiWeight } from './database.js';

const UA = 'WikiRoll Discord Bot/1.0 (contact@hackatoa.com)';

const http = axios.create({
  timeout: 8000,
  headers: { 'User-Agent': UA },
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Built-in Fandom wikis ─────────────────────────────────────────────────

export const BUILTIN_FANDOMS = [
  // Anime / Manga
  'https://naruto.fandom.com',
  'https://onepiece.fandom.com',
  'https://dragonball.fandom.com',
  'https://bleach.fandom.com',
  'https://fairytail.fandom.com',
  'https://attackontitan.fandom.com',
  'https://myheroacademia.fandom.com',
  'https://hunterxhunter.fandom.com',
  'https://fma.fandom.com',
  'https://tokyoghoul.fandom.com',
  'https://swordartonline.fandom.com',
  'https://rezero.fandom.com',
  'https://onepunchman.fandom.com',
  'https://kimetsu-no-yaiba.fandom.com',
  'https://jujutsu-kaisen.fandom.com',
  'https://blackclover.fandom.com',
  'https://haikyuu.fandom.com',
  'https://boruto.fandom.com',
  'https://gintama.fandom.com',
  'https://toriko.fandom.com',
  'https://saintseiya.fandom.com',
  'https://shugochara.fandom.com',
  'https://yugioh.fandom.com',
  // Video Games
  'https://pokemon.fandom.com',
  'https://zelda.fandom.com',
  'https://mario.fandom.com',
  'https://sonic.fandom.com',
  'https://kingdomhearts.fandom.com',
  'https://halo.fandom.com',
  'https://destiny.fandom.com',
  'https://warframe.fandom.com',
  'https://wowpedia.fandom.com',
  'https://assassinscreed.fandom.com',
  'https://gta.fandom.com',
  'https://reddead.fandom.com',
  'https://cyberpunk.fandom.com',
  'https://residentevil.fandom.com',
  'https://devilmaycry.fandom.com',
  'https://monsterhunter.fandom.com',
  'https://eldenring.fandom.com',
  'https://godofwar.fandom.com',
  'https://horizon.fandom.com',
  'https://thelastofus.fandom.com',
  'https://crashbandicoot.fandom.com',
  'https://spyro.fandom.com',
  'https://splatoon.fandom.com',
  'https://animalcrossing.fandom.com',
  'https://supersmashbros.fandom.com',
  'https://kirby.fandom.com',
  'https://metroid.fandom.com',
  'https://castlevania.fandom.com',
  'https://metalgear.fandom.com',
  'https://silenthill.fandom.com',
  'https://tekken.fandom.com',
  'https://cuphead.fandom.com',
  'https://hollowknight.fandom.com',
  'https://fortnite.fandom.com',
  'https://apexlegends.fandom.com',
  'https://valorant.fandom.com',
  'https://teamfortress.fandom.com',
  'https://left4dead.fandom.com',
  'https://half-life.fandom.com',
  'https://doom.fandom.com',
  'https://bioshock.fandom.com',
  'https://baldursgate.fandom.com',
  'https://sims.fandom.com',
  'https://ageofempires.fandom.com',
  'https://starcraft.fandom.com',
  'https://hearthstone.fandom.com',
  'https://hades.fandom.com',
  'https://terraria.fandom.com',
  'https://dontstarve.fandom.com',
  'https://danganronpa.fandom.com',
  'https://aceattorney.fandom.com',
  'https://nier.fandom.com',
  'https://yakuza.fandom.com',
  'https://megaman.fandom.com',
  'https://rainbowsix.fandom.com',
  'https://farcry.fandom.com',
  'https://deltarune.fandom.com',
  'https://roblox.fandom.com',
  'https://leagueoflegends.fandom.com',
  'https://finalfantasy.fandom.com',
  'https://elderscrolls.fandom.com',
  'https://fallout.fandom.com',
  'https://masseffect.fandom.com',
  'https://genshin-impact.fandom.com',
  'https://darksouls.fandom.com',
  'https://undertale.fandom.com',
  'https://fireemblem.fandom.com',
  'https://megamitensei.fandom.com',
  'https://streetfighter.fandom.com',
  'https://mortalkombat.fandom.com',
  'https://overwatch.fandom.com',
  'https://minecraft.fandom.com',
  'https://stardewvalley.fandom.com',
  'https://xenoblade.fandom.com',
  'https://pathofexile.fandom.com',
  'https://diablo.fandom.com',
  'https://deadbydaylight.fandom.com',
  'https://honkaiimpact3.fandom.com',
  'https://battlerite.fandom.com',
  'https://tales-of.fandom.com',
  'https://dragonage.fandom.com',
  'https://borderlands.fandom.com',
  // Anime (additional)
  'https://jojo.fandom.com',
  'https://evangelion.fandom.com',
  'https://codegeass.fandom.com',
  'https://deathnote.fandom.com',
  'https://sailormoon.fandom.com',
  'https://cowboybebop.fandom.com',
  'https://tensura.fandom.com',
  'https://konosuba.fandom.com',
  'https://chainsaw-man.fandom.com',
  'https://gurrenlagann.fandom.com',
  'https://madoka.fandom.com',
  'https://inuyasha.fandom.com',
  'https://ouran.fandom.com',
  'https://fruitsbasket.fandom.com',
  'https://ninjago.fandom.com',
  // Western Animation / Comics
  'https://dc.fandom.com',
  'https://marvel.fandom.com',
  'https://avatar.fandom.com',
  'https://steven-universe.fandom.com',
  'https://gravityfalls.fandom.com',
  'https://adventuretime.fandom.com',
  'https://mlp.fandom.com',
  'https://rwby.fandom.com',
  'https://amphibia.fandom.com',
  'https://theowlhouse.fandom.com',
  'https://theloudhouse.fandom.com',
  'https://ben10.fandom.com',
  'https://dannyphantom.fandom.com',
  'https://teentitans.fandom.com',
  // Movies
  'https://indianajones.fandom.com',
  'https://backtothefuture.fandom.com',
  'https://jurassicpark.fandom.com',
  'https://avp.fandom.com',
  'https://terminator.fandom.com',
  'https://matrix.fandom.com',
  'https://pirates.fandom.com',
  'https://ghostbusters.fandom.com',
  'https://howtotrainyourdragon.fandom.com',
  'https://shrek.fandom.com',
  'https://kungfupanda.fandom.com',
  'https://despicableme.fandom.com',
  'https://narnia.fandom.com',
  'https://hisdarkmaterials.fandom.com',
  'https://darkcrystal.fandom.com',
  'https://coraline.fandom.com',
  'https://powerrangers.fandom.com',
  'https://jamesbond.fandom.com',
  'https://dune.fandom.com',
  // TV
  'https://walkingdead.fandom.com',
  'https://tardis.fandom.com',
  'https://supernatural.fandom.com',
  'https://buffy.fandom.com',
  'https://firefly.fandom.com',
  'https://lostpedia.fandom.com',
  'https://rickandmorty.fandom.com',
  'https://southpark.fandom.com',
  'https://familyguy.fandom.com',
  'https://futurama.fandom.com',
  'https://simpsons.fandom.com',
  'https://bobs-burgers.fandom.com',
  'https://archer.fandom.com',
  'https://bojackhorseman.fandom.com',
  'https://amazon-invincible.fandom.com',
  'https://the-boys.fandom.com',
  'https://arrow.fandom.com',
  'https://smallville.fandom.com',
  'https://lucifer.fandom.com',
  'https://westworld.fandom.com',
  'https://vikings.fandom.com',
  'https://twinpeaks.fandom.com',
  'https://stargate.fandom.com',
  'https://dark-netflix.fandom.com',
  'https://dexter.fandom.com',
  'https://theoffice.fandom.com',
  'https://americandad.fandom.com',
  'https://bakerstreet.fandom.com',
  'https://heroes.fandom.com',
  'https://fringe.fandom.com',
  'https://x-files.fandom.com',
  'https://babylon5.fandom.com',
  'https://farscape.fandom.com',
  // TV / Movies / Books
  'https://harrypotter.fandom.com',
  'https://starwars.fandom.com',
  'https://gameofthrones.fandom.com',
  'https://lotr.fandom.com',
  'https://memory-alpha.fandom.com',
  'https://witcher.fandom.com',
  'https://breakingbad.fandom.com',
  'https://strangerthings.fandom.com',
  'https://criticalrole.fandom.com',
  'https://riordan.fandom.com',
  'https://inheritance.fandom.com',
  'https://warriors.fandom.com',
  'https://warhammer40k.fandom.com',
  'https://dungeons.fandom.com',
  'https://transformers.fandom.com',
  'https://villains.fandom.com',
  // Disney / Pixar
  'https://disney.fandom.com',
  'https://pixar.fandom.com',
  'https://pixarcars.fandom.com',
  'https://monstersinc.fandom.com',
  'https://insideout.fandom.com',
  'https://coco-movie.fandom.com',
  'https://frozen.fandom.com',
  'https://zootopia.fandom.com',
  'https://bighero6.fandom.com',
  'https://wreckitralph.fandom.com',
  'https://tangled.fandom.com',
  'https://liloandstitch.fandom.com',
  'https://lionking.fandom.com',
  'https://moana.fandom.com',
  'https://encanto.fandom.com',
  'https://findingdory.fandom.com',
  // Independent MediaWiki instances
  'https://consumerrights.wiki',
];

// ── Helpers ───────────────────────────────────────────────────────────────

async function queryWiki(params, base = 'https://en.wikipedia.org/w/api.php') {
  const res = await http.get(base, { params: { format: 'json', ...params } });
  return res.data;
}

function isListLike(title) {
  if (!title) return true;
  const raw = title.trim();
  const t = raw.toLowerCase();
  return (
    // bare years / numeric-only titles (e.g. "1987", "2020")
    /^\d{3,4}$/.test(raw) ||
    // wiki namespaces that aren't real content pages
    /^(category|template|file|user|forum|board|help|module|mediawiki|portal|project|thread|talk|blog):/i.test(raw) ||
    // list / index / glossary style pages
    t.startsWith('list of ') ||
    t.startsWith('lists of ') ||
    t.startsWith('index of ') ||
    /^(list|lists|index|timeline|glossary|gallery|outline) (of|in) /i.test(raw) ||
    /^characters (of|in) /i.test(raw) ||
    // roster / list pages whose title ends in "... characters"
    /\b(minor|recurring|background|supporting|secondary|unnamed|generic|nameless|miscellaneous|list of|non-?player|non-?playable) characters?\b/i.test(raw) ||
    /^characters$/i.test(raw) ||
    // NPC / generic non-player entries
    /\bnpcs?\b/i.test(raw) ||
    /non-?play(er|able) character/i.test(t) ||
    t.includes('(disambiguation)') ||
    // non-character subpages
    /\/(gallery|image[_ ]gallery|relationships|history|trivia|navigation|techniques|abilities|quotes|synopsis|appearances|merchandise|plot|transcript|credits)/.test(t) ||
    // episode / chapter / media entries, not characters
    /\((episode|chapter|volume|season|arc|album|song|single|soundtrack|film|movie|novel|manga|anime|series|game|video game|location|place|weapon|item|band)\b[^)]*\)/i.test(raw) ||
    /^(episode|chapter|volume|season|book|part) \d+/i.test(raw)
  );
}

// ── Size-weighted wiki pool ────────────────────────────────────────────────
// A roll picks 10 DISTINCT wikis, but each wiki's odds of being picked are
// weighted by its article count so bigger / more popular franchises show up
// proportionally more often — approximating "one uniform pool of all pages"
// without materialising millions of pages. Weights are clamped so mega-wikis
// don't dominate every roll and tiny wikis stay reachable. Wikipedia is pinned
// to a modest fixed weight so its full-random (often non-character) articles
// stay about as rare as before. Tune the constants below to taste.
const WIKI_WEIGHT_MIN     = 500;
const WIKI_WEIGHT_CAP     = 40000;
const WIKI_WEIGHT_DEFAULT = 6000;               // used until a wiki's size is cached
const WIKIPEDIA_WEIGHT    = 6000;               // pinned; ignores WP's true ~7M articles
const WIKI_STATS_TTL      = 30 * 24 * 60 * 60;  // refresh cached sizes ~monthly

function clampWeight(articles) {
  if (!articles || articles < 0) return WIKI_WEIGHT_DEFAULT;
  return Math.min(Math.max(Math.round(articles), WIKI_WEIGHT_MIN), WIKI_WEIGHT_CAP);
}

// Weighted sampling WITHOUT replacement → k distinct wiki URLs.
function weightedSampleDistinct(entries, k) {
  const pool = entries.map(e => ({ url: e.url, w: Math.max(e.weight || WIKI_WEIGHT_DEFAULT, 1) }));
  const chosen = [];
  while (chosen.length < k && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    chosen.push(pool[idx].url);
    pool.splice(idx, 1);
  }
  return chosen;
}

// Fetch a wiki's article count via the MediaWiki siteinfo API.
async function fetchWikiSize(base) {
  const api = base.includes('wikipedia.org')
    ? 'https://en.wikipedia.org/w/api.php'
    : `${base}/api.php`;
  try {
    const data = await queryWiki({ action: 'query', meta: 'siteinfo', siprop: 'statistics' }, api);
    return data.query?.statistics?.articles ?? null;
  } catch {
    return null;
  }
}

// Background: refresh cached article-count weights for built-in + guild wikis.
// Fire-and-forget on startup; throttled so we stay a good API citizen.
export async function refreshWikiWeights(extraSources = []) {
  const now    = Math.floor(Date.now() / 1000);
  const cached = getWikiWeightMap();
  const targets = [...new Set([...BUILTIN_FANDOMS, ...extraSources])];
  let refreshed = 0;
  for (const url of targets) {
    const entry = cached.get(url);
    if (entry && (now - entry.fetched_at) < WIKI_STATS_TTL) continue;
    const size = await fetchWikiSize(url);
    if (size != null) {
      setWikiWeight(url, clampWeight(size));
      refreshed++;
    }
    await sleep(300);
  }
  if (refreshed) console.log(`[wiki] refreshed size weights for ${refreshed} wikis`);
}

function formatPage(page, source, baseUrl) {
  if (!page || page.missing !== undefined || (page.pageid !== undefined && page.pageid < 0)) return null;
  if (isListLike(page.title)) return null;
  const desc = page.extract
    ? page.extract.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 280)
    : null;
  // Skip disambiguation pages (extract will say "may refer to")
  if (desc && /^\S+ may refer to:/i.test(desc)) return null;
  // Skip generic NPC / non-character entries by how they describe themselves
  // (catches NPCs whose title doesn't literally say "NPC"). Deliberately does
  // NOT filter plain "minor character" to avoid dropping real named characters.
  if (desc && (
    /\bis an? npc\b/i.test(desc) ||
    /\bis an? (non-?player|non-?playable|generic|unnamed|nameless|background|one-?off|one-?time|filler|placeholder) character/i.test(desc) ||
    /\bis an? (unnamed|generic|nameless|background) (enemy|character|npc)/i.test(desc)
  )) return null;
  return {
    name: page.title,
    page_id: String(page.pageid),
    description: desc,
    wiki_url: page.fullurl || `${baseUrl}/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    image_url: page.thumbnail?.source ?? null,
    source,
  };
}

// ── Wikipedia batch random (1 API call → up to 10 articles) ──────────────

async function fetchRandomWikipedia(limit = 10) {
  try {
    const data = await queryWiki({
      action: 'query',
      generator: 'random',
      grnnamespace: 0,
      grnlimit: Math.min(limit, 10),
      prop: 'extracts|pageimages|info',
      exintro: 1,
      explaintext: 1,
      pithumbsize: 500,
      inprop: 'url',
    });
    const pages = Object.values(data.query?.pages ?? {});
    return pages.map(p => formatPage(p, 'wikipedia', 'https://en.wikipedia.org')).filter(Boolean);
  } catch (e) {
    console.error('[wiki] Wikipedia batch random error:', e.message);
    return [];
  }
}

// ── Fandom: get one random character page ────────────────────────────────

async function fetchOneFandomChar(wikiBase) {
  const domain = new URL(wikiBase).hostname;
  const api = `${wikiBase}/api.php`;
  try {
    let title = null;

    // Prefer pages from Category:Characters for actual character bias.
    // Sample a large slice, drop obvious non-character (list/gallery/etc.)
    // titles, then pick randomly from what remains.
    try {
      const catData = await queryWiki({
        action: 'query',
        list: 'categorymembers',
        cmtitle: 'Category:Characters',
        cmlimit: 500,
        cmtype: 'page',
        cmnamespace: 0,
      }, api);
      const members = (catData.query?.categorymembers ?? [])
        .map(m => m.title)
        .filter(tt => !isListLike(tt));
      if (members.length > 0) {
        title = members[Math.floor(Math.random() * members.length)];
      }
    } catch {}

    // Fallback: sample a few truly-random pages and take the first that
    // isn't an obvious non-character page.
    if (!title) {
      const rand = await queryWiki({ action: 'query', list: 'random', rnnamespace: 0, rnlimit: 6 }, api);
      const cands = (rand.query?.random ?? []).map(p => p.title).filter(tt => !isListLike(tt));
      title = cands[0] ?? rand.query?.random?.[0]?.title ?? null;
    }

    if (!title) return null;

    await sleep(150);

    const detail = await queryWiki({
      action: 'query',
      titles: title,
      prop: 'extracts|pageimages|info',
      exintro: 1,
      explaintext: 1,
      pithumbsize: 500,
      inprop: 'url',
      redirects: 1,
    }, api);

    const page = Object.values(detail.query?.pages ?? {})[0];
    return formatPage(page, domain, wikiBase);
  } catch {
    return null;
  }
}

// ── Wikipedia keyword search → random result ─────────────────────────────

async function fetchWikipediaSearch(term) {
  try {
    const data = await queryWiki({
      action: 'query',
      list: 'search',
      srsearch: term,
      srlimit: 10,
      srnamespace: 0,
    });
    const results = data.query?.search ?? [];
    if (!results.length) return null;
    const pick = results[Math.floor(Math.random() * Math.min(results.length, 5))];
    await sleep(100);
    const detail = await queryWiki({
      action: 'query',
      titles: pick.title,
      prop: 'extracts|pageimages|info',
      exintro: 1,
      explaintext: 1,
      pithumbsize: 500,
      inprop: 'url',
      redirects: 1,
    });
    const page = Object.values(detail.query?.pages ?? {})[0];
    return formatPage(page, 'wikipedia', 'https://en.wikipedia.org');
  } catch {
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string[]}  opts.guildSources   - guild-added Fandom wiki URLs
 * @param {object[]}  opts.wishedChars    - DB character rows from guild wishlists
 * @param {object[]}  opts.wishedSources  - [{source_type, source_value}] from wishlist_sources
 */
const WIKIPEDIA = 'https://en.wikipedia.org';

export async function fetchTenCharacters({ guildSources = [], wishedChars = [] } = {}) {
  const seen  = new Set();
  const chars = [];

  // ── Step 1: ~2% chance to slot in ONE wishlisted character (~1 per 50 rolls) ──
  const shuffledWished = [...wishedChars].sort(() => Math.random() - 0.5);
  if (shuffledWished.length > 0 && Math.random() < 0.02) {
    const c = shuffledWished[0];
    seen.add(`${c.source}:${c.page_id}`);
    chars.push(c);
  }

  // ── Step 2: weighted flat pool — 10 DISTINCT wikis, weighted by size ──
  // Bigger franchises get proportionally higher odds (see weighting notes
  // above). Wikipedia is pinned to a modest fixed weight. We pick a few extra
  // wikis as a buffer so filtered-out junk pages can be backfilled to 10.
  const weightMap  = getWikiWeightMap();
  const weightFor  = url => (url === WIKIPEDIA
    ? WIKIPEDIA_WEIGHT
    : (weightMap.get(url)?.weight ?? WIKI_WEIGHT_DEFAULT));
  const poolEntries = [WIKIPEDIA, ...BUILTIN_FANDOMS, ...guildSources]
    .map(url => ({ url, weight: weightFor(url) }));
  const slots  = 10 - chars.length;
  const picked = weightedSampleDistinct(poolEntries, slots + 5);

  // ── Step 3: parallel fetch ────────────────────────────────────────────
  const tasks = picked.map(base =>
    base === WIKIPEDIA ? fetchRandomWikipedia(1) : fetchOneFandomChar(base)
  );

  const results = await Promise.allSettled(tasks);

  for (const r of results) {
    if (chars.length >= 10) break;
    if (r.status !== 'fulfilled' || !r.value) continue;
    const items = Array.isArray(r.value) ? r.value : [r.value];
    for (const c of items) {
      if (chars.length >= 10) break;
      const key = `${c.source}:${c.page_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        chars.push(c);
      }
    }
  }

  return chars.slice(0, 10);
}

// ── Search ────────────────────────────────────────────────────────────────

export async function searchWikipedia(query) {
  try {
    const data = await queryWiki({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: 5,
      srnamespace: 0,
    });
    return (data.query?.search ?? []).map(r => r.title);
  } catch {
    return [];
  }
}

// Check a wiki base URL is reachable and has a working API
export async function validateFandomWiki(base) {
  try {
    const api = base.includes('wikipedia.org')
      ? 'https://en.wikipedia.org/w/api.php'
      : `${base}/api.php`;
    const data = await queryWiki({ action: 'query', list: 'random', rnnamespace: 0, rnlimit: 1 }, api);
    return Array.isArray(data.query?.random) && data.query.random.length > 0;
  } catch {
    return false;
  }
}

// Search a specific Fandom wiki for a character by name
export async function searchFandomWiki(query, fandomBase) {
  const api = `${fandomBase}/api.php`;
  const source = new URL(fandomBase).hostname;
  try {
    const data = await queryWiki({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: 5,
      srnamespace: 0,
    }, api);
    const results = data.query?.search ?? [];
    if (!results.length) return null;
    await sleep(100);
    const detail = await queryWiki({
      action: 'query',
      titles: results[0].title,
      prop: 'extracts|pageimages|info',
      exintro: 1,
      explaintext: 1,
      pithumbsize: 500,
      inprop: 'url',
      redirects: 1,
    }, api);
    const page = Object.values(detail.query?.pages ?? {})[0];
    return formatPage(page, source, fandomBase);
  } catch {
    return null;
  }
}

export async function fetchWikiPage(title, fandomBase = null) {
  const base = fandomBase ? `${fandomBase}/api.php` : 'https://en.wikipedia.org/w/api.php';
  const source = fandomBase ? new URL(fandomBase).hostname : 'wikipedia';
  const baseUrl = fandomBase ?? 'https://en.wikipedia.org';
  try {
    const data = await queryWiki({
      action: 'query',
      titles: title,
      prop: 'extracts|pageimages|info',
      exintro: 1,
      explaintext: 1,
      pithumbsize: 500,
      inprop: 'url',
      redirects: 1,
    }, base);
    const page = Object.values(data.query?.pages ?? {})[0];
    return formatPage(page, source, baseUrl);
  } catch {
    return null;
  }
}
