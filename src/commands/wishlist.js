import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { stmts } from '../database.js';
import { searchWikipedia, fetchWikiPage, searchFandomWiki, validateFandomWiki, BUILTIN_FANDOMS } from '../wiki.js';
import { buildWishlistEmbeds, buildWishCharEmbed } from '../embeds.js';

// Temporary storage for multi-version wishlist selections (5-min TTL)
export const pendingWishCandidates = new Map();

function titleMatches(query, title) {
  const q = query.toLowerCase();
  const t = title.toLowerCase();
  if (t === q) return true;
  const words = q.split(/\s+/).filter(w => w.length > 2);
  if (!words.length) return true;
  const hits = words.filter(w => t.includes(w));
  return hits.length >= Math.ceil(words.length * 0.75);
}

export default {
  data: new SlashCommandBuilder()
    .setName('wishlist')
    .setDescription('Manage your wishlist — boosted characters and sources appear more in rolls')
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Add a character to your wishlist')
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true))
      .addStringOption(o => o.setName('url').setDescription('Wiki page URL (e.g. https://pixarcars.fandom.com/wiki/Finn_McMissile)').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove a character from your wishlist')
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('view')
      .setDescription('View your wishlisted characters')
    )
    .addSubcommand(s => s
      .setName('addsource')
      .setDescription('Boost a Fandom wiki or keyword — more rolls from that source')
      .addStringOption(o =>
        o.setName('source')
          .setDescription('Fandom wiki URL (https://naruto.fandom.com) OR a keyword like "Star Wars"')
          .setRequired(true)
      )
    )
    .addSubcommand(s => s
      .setName('removesource')
      .setDescription('Remove a boosted source')
      .addStringOption(o => o.setName('source').setDescription('URL or keyword to remove').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('sources')
      .setDescription('View your boosted sources')
    ),

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId  = interaction.user.id;

    // ── View characters ───────────────────────────────────────────────────
    if (sub === 'view') {
      const items = stmts.getUserWishlist.all(userId, guildId);
      return interaction.reply({ embeds: buildWishlistEmbeds(interaction.user, items), ephemeral: true });
    }

    // ── Add character ─────────────────────────────────────────────────────
    if (sub === 'add') {
      await interaction.deferReply({ ephemeral: true });
      const name = interaction.options.getString('name');
      const url  = interaction.options.getString('url');

      // 1. Direct URL — single precise result, no disambiguation needed
      if (url) {
        let char = null;
        try {
          const parsed = new URL(url);
          const isFandom = parsed.hostname.endsWith('.fandom.com');
          if (isFandom) {
            const base  = `${parsed.protocol}//${parsed.hostname}`;
            const title = decodeURIComponent(parsed.pathname.replace(/^\/wiki\//, '').replace(/_/g, ' '));
            char = await fetchWikiPage(title, base);
          } else {
            const title = decodeURIComponent(parsed.pathname.split('/').pop().replace(/_/g, ' '));
            char = await fetchWikiPage(title);
          }
        } catch {}
        if (!char) return interaction.editReply(`❌ Couldn't fetch that page. Double-check the URL and try again.`);
        const row = stmts.upsertChar.get(char);
        stmts.addWish.run(userId, guildId, row.id, char.name);
        return interaction.editReply({ embeds: [buildWishCharEmbed(char)] });
      }

      // 2. Collect ALL matching candidates across every source
      const candidates = [];
      const seen = new Set();

      const addCandidate = (char, fromDb = false) => {
        if (!char || !titleMatches(name, char.name)) return;
        const key = `${char.source}:${char.page_id}`;
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(fromDb ? { ...char, _fromDb: true } : char);
      };

      // Local DB
      const local = stmts.searchChars.all(guildId, `%${name}%`);
      for (const c of local) addCandidate(c, true);

      // Wikipedia + all Fandom wikis in parallel
      const [wikiTitles, ...fandomResults] = await Promise.all([
        searchWikipedia(name),
        ...BUILTIN_FANDOMS.map(base => searchFandomWiki(name, base).catch(() => null)),
      ]);

      if (wikiTitles.length) {
        const wc = await fetchWikiPage(wikiTitles[0]);
        addCandidate(wc);
      }
      for (const r of fandomResults) addCandidate(r);

      if (!candidates.length) {
        return interaction.editReply(`❌ Couldn't find **"${name}"** with confidence. Paste the wiki page URL using the \`url\` option for an exact match.`);
      }

      // Single result: add immediately
      if (candidates.length === 1) {
        const char = candidates[0];
        const charId = char._fromDb ? char.id : stmts.upsertChar.get(char).id;
        stmts.addWish.run(userId, guildId, charId, char.name);
        return interaction.editReply({ embeds: [buildWishCharEmbed(char)] });
      }

      // Multiple results: let user pick
      const storeKey = `${userId}:${guildId}`;
      pendingWishCandidates.set(storeKey, candidates);
      setTimeout(() => pendingWishCandidates.delete(storeKey), 5 * 60 * 1000);

      const options = candidates.slice(0, 24).map((c, i) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.name.slice(0, 100))
          .setDescription(`from ${c.source}`.slice(0, 100))
          .setValue(String(i))
      );
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel('All versions')
          .setDescription(`Add all ${candidates.length} version${candidates.length !== 1 ? 's' : ''} to your wishlist`)
          .setValue('__all__')
      );

      const select = new StringSelectMenuBuilder()
        .setCustomId(`wishpick_${userId}_${guildId}`)
        .setPlaceholder('Choose which version(s) to add…')
        .setMinValues(1)
        .setMaxValues(options.length)
        .addOptions(options);

      return interaction.editReply({
        content: `Found **${candidates.length} versions** of **"${name}"** — pick which to add:`,
        embeds: candidates.slice(0, 10).map((c, i) => buildWishCharEmbed(c, `Option ${i + 1}`)),
        components: [new ActionRowBuilder().addComponents(select)],
      });
    }

    // ── Remove character ──────────────────────────────────────────────────
    if (sub === 'remove') {
      const name   = interaction.options.getString('name');
      const local  = stmts.searchChars.all(guildId, `%${name}%`);
      if (!local.length) return interaction.reply({ content: `**"${name}"** not found.`, ephemeral: true });
      stmts.removeWish.run(userId, guildId, local[0].id);
      return interaction.reply({ content: `Removed **${local[0].name}** from your wishlist.`, ephemeral: true });
    }

    // ── View sources ──────────────────────────────────────────────────────
    if (sub === 'sources') {
      const sources = stmts.getUserWishSources.all(userId, guildId);
      const embed = new EmbedBuilder()
        .setColor(0xFF9800)
        .setTitle(`🎯 ${interaction.user.username}'s Boosted Sources`);

      if (!sources.length) {
        embed.setDescription('*No boosted sources yet.*\n\nUse `/wishlist addsource` with a Fandom wiki URL to add it to the roll pool.');
      } else {
        const fandoms  = sources.filter(s => s.source_type === 'fandom');
        const keywords = sources.filter(s => s.source_type === 'search');
        const lines = [];
        if (fandoms.length)  lines.push('**Fandom Wikis**:', ...fandoms.map(s  => `• ${s.display_name ?? s.source_value}`));
        if (keywords.length) lines.push('', '**Keywords**:', ...keywords.map(s => `• ${s.source_value}`));
        embed.setDescription(lines.join('\n'));
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── Add source ────────────────────────────────────────────────────────
    if (sub === 'addsource') {
      const raw = interaction.options.getString('source').trim();
      let sourceType, sourceValue, displayName;

      const isUrl = raw.startsWith('http://') || raw.startsWith('https://') || raw.includes('.fandom.com');
      if (isUrl) {
        let parsed;
        try {
          parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
        } catch {
          return interaction.reply({ content: '❌ Invalid URL.', ephemeral: true });
        }
        sourceType  = 'fandom';
        sourceValue = `${parsed.protocol}//${parsed.hostname}`;
        displayName = parsed.hostname;
      } else {
        sourceType  = 'search';
        sourceValue = raw;
        displayName = raw;
      }

      if (sourceType === 'fandom') {
        await interaction.deferReply({ ephemeral: true });
        const valid = await validateFandomWiki(sourceValue);
        if (!valid) {
          return interaction.editReply(`❌ \`${displayName}\` doesn't look like a working wiki — couldn't reach its API. Double-check the URL.`);
        }
        stmts.addWishSource.run(userId, guildId, sourceType, sourceValue, displayName);
        return interaction.editReply(`✅ **🌐 Fandom wiki** \`${displayName}\` added and verified!`);
      }

      stmts.addWishSource.run(userId, guildId, sourceType, sourceValue, displayName);
      return interaction.reply({
        content: `✅ **🔍 Keyword** \`${displayName}\` added to your sources!`,
        ephemeral: true,
      });
    }

    // ── Remove source ─────────────────────────────────────────────────────
    if (sub === 'removesource') {
      const raw = interaction.options.getString('source').trim();
      const val = raw.includes('.fandom.com')
        ? (() => { try { const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`); return `${u.protocol}//${u.hostname}`; } catch { return raw; } })()
        : raw;
      stmts.removeWishSource.run(userId, guildId, val);
      return interaction.reply({ content: `Removed \`${val}\` from your boosted sources.`, ephemeral: true });
    }
  },
};
