import axios from 'axios';

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
  'https://fullmetalalchemist.fandom.com',
  'https://tokyoghoul.fandom.com',
  'https://swordartonline.fandom.com',
  'https://re-zero.fandom.com',
  'https://one-punch-man.fandom.com',
  'https://demonslayer.fandom.com',
  'https://jujutsu-kaisen.fandom.com',
  'https://blackclover.fandom.com',
  'https://haikyuu.fandom.com',
  'https://boruto.fandom.com',
  'https://gintama.fandom.com',
  'https://toriko.fandom.com',
  'https://saintseiya.fandom.com',
  'https://shugo-chara.fandom.com',
  'https://yugioh.fandom.com',
  // Video Games
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
  'https://honkai-impact-3rd.fandom.com',
  'https://battlerite.fandom.com',
  'https://tales-of-graces.fandom.com',
  'https://dragonage.fandom.com',
  'https://borderlands.fandom.com',
  // Western Animation / Comics
  'https://dc.fandom.com',
  'https://marvel.fandom.com',
  'https://avatar.fandom.com',
  'https://steven-universe.fandom.com',
  'https://gravity-falls.fandom.com',
  'https://adventuretime.fandom.com',
  'https://mlp.fandom.com',
  'https://rwby.fandom.com',
  'https://amphibia.fandom.com',
  'https://the-owl-house.fandom.com',
  'https://theloudhouse.fandom.com',
  'https://ben10.fandom.com',
  'https://dannyphantom.fandom.com',
  'https://teen-titans.fandom.com',
  // TV / Movies / Books
  'https://harrypotter.fandom.com',
  'https://starwars.fandom.com',
  'https://gameofthrones.fandom.com',
  'https://lotr.fandom.com',
  'https://startrek.fandom.com',
  'https://thewitcher.fandom.com',
  'https://breaking-bad.fandom.com',
  'https://stranger-things.fandom.com',
  'https://critical-role.fandom.com',
  'https://percyjackson.fandom.com',
  'https://eragon.fandom.com',
  'https://warrior-cats.fandom.com',
  'https://warhammer40k.fandom.com',
  'https://dungeons-and-dragons.fandom.com',
  'https://transformers.fandom.com',
  'https://villains.fandom.com',
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
  const t = title.toLowerCase();
  return (
    t.startsWith('list of ') ||
    t.startsWith('lists of ') ||
    t.startsWith('index of ') ||
    t.includes('(disambiguation)') ||
    t.includes('/gallery') ||
    t.includes('/relationships') ||
    t.includes('/history') ||
    t.includes('/trivia') ||
    t.includes('/navigation') ||
    t.includes('/techniques') ||
    t.includes('/abilities') ||
    /^characters (of|in) /i.test(title)
  );
}

function formatPage(page, source, baseUrl) {
  if (!page || page.missing !== undefined || (page.pageid !== undefined && page.pageid < 0)) return null;
  if (isListLike(page.title)) return null;
  const desc = page.extract
    ? page.extract.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 280)
    : null;
  // Skip disambiguation pages (extract will say "may refer to")
  if (desc && /^\S+ may refer to:/i.test(desc)) return null;
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

    // Prefer pages from Category:Characters for actual character bias
    try {
      const catData = await queryWiki({
        action: 'query',
        list: 'categorymembers',
        cmtitle: 'Category:Characters',
        cmlimit: 50,
        cmtype: 'page',
        cmnamespace: 0,
      }, api);
      const members = catData.query?.categorymembers ?? [];
      if (members.length > 0) {
        title = members[Math.floor(Math.random() * members.length)].title;
      }
    } catch {}

    // Fallback: truly random page
    if (!title) {
      const rand = await queryWiki({ action: 'query', list: 'random', rnnamespace: 0, rnlimit: 1 }, api);
      title = rand.query?.random?.[0]?.title;
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
export async function fetchTenCharacters({ guildSources = [], wishedChars = [], wishedSources = [] } = {}) {
  const seen  = new Set();
  const chars = [];

  // ── Step 1: ~2% chance to slot in ONE wishlisted character (~1 per 50 rolls) ──
  const shuffledWished = [...wishedChars].sort(() => Math.random() - 0.5);
  if (shuffledWished.length > 0 && Math.random() < 0.02) {
    const c = shuffledWished[0];
    const key = `${c.source}:${c.page_id}`;
    seen.add(key);
    chars.push(c);
  }

  // ── Step 2: build weighted Fandom pool ────────────────────────────────
  // Wishlist sources appear 3× to increase their pull weight
  const wishedFandoms  = wishedSources.filter(s => s.source_type === 'fandom').map(s => s.source_value);
  const wishedKeywords = wishedSources.filter(s => s.source_type === 'search').map(s => s.source_value);

  const fandomPool = [
    ...wishedFandoms, ...wishedFandoms, ...wishedFandoms, // 3× boost
    ...BUILTIN_FANDOMS,
    ...guildSources,
  ];

  // Pick 8 Fandom wikis from weighted pool (deduped after shuffle)
  const shuffledPool = fandomPool.sort(() => Math.random() - 0.5);
  const picked = [];
  const usedBases = new Set();
  for (const base of shuffledPool) {
    if (usedBases.has(base)) continue;
    usedBases.add(base);
    picked.push(base);
    if (picked.length >= 8) break;
  }

  // ── Step 3: parallel fetch ────────────────────────────────────────────
  const remainingSlots = 10 - chars.length;
  const wikiSlots      = Math.max(2, remainingSlots - picked.length); // at least 2 Wikipedia slots

  const tasks = [
    fetchRandomWikipedia(wikiSlots + 2),
    ...picked.map(base => fetchOneFandomChar(base)),
    ...wishedKeywords.slice(0, 3).map(kw => fetchWikipediaSearch(kw)),
  ];

  const results = await Promise.allSettled(tasks);
  const [wikiResult, ...otherResults] = results;

  // Fandom + keyword results first (character bias)
  for (const r of otherResults) {
    if (chars.length >= 10) break;
    if (r.status === 'fulfilled' && r.value) {
      const c = r.value;
      const key = `${c.source}:${c.page_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        chars.push(c);
      }
    }
  }

  // Fill remaining with Wikipedia
  if (wikiResult.status === 'fulfilled') {
    for (const c of wikiResult.value) {
      if (chars.length >= 10) break;
      const key = `wiki:${c.page_id}`;
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
