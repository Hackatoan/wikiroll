import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { stmts } from '../database.js';
import { searchWikipedia, fetchWikiPage } from '../wiki.js';
import { buildWishlistEmbed } from '../embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('wishlist')
    .setDescription('Manage your wishlist — boosted characters and sources appear more in rolls')
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Add a character to your wishlist (they\'ll appear in rolls more often)')
      .addStringOption(o => o.setName('name').setDescription('Character name').setRequired(true))
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
      return interaction.reply({ embeds: [buildWishlistEmbed(interaction.user, items)], ephemeral: true });
    }

    // ── Add character ─────────────────────────────────────────────────────
    if (sub === 'add') {
      await interaction.deferReply({ ephemeral: true });
      const name = interaction.options.getString('name');

      let charId = null, charName = name;
      const local = stmts.searchChars.all(guildId, `%${name}%`);
      if (local.length) {
        charId = local[0].id; charName = local[0].name;
      } else {
        const titles = await searchWikipedia(name);
        if (titles.length) {
          const char = await fetchWikiPage(titles[0]);
          if (char) {
            const row = stmts.upsertChar.get(char);
            charId = row.id; charName = char.name;
          }
        }
      }
      if (!charId) return interaction.editReply(`Character **"${name}"** not found.`);
      stmts.addWish.run(userId, guildId, charId, charName);
      return interaction.editReply(`⭐ Added **${charName}** to your wishlist! They'll appear in rolls more often and you'll be DM'd when claimed.`);
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
        embed.setDescription('*No boosted sources yet.*\n\nUse `/wishlist addsource` with a Fandom wiki URL or keyword to get more of those characters in your rolls!');
      } else {
        const fandoms  = sources.filter(s => s.source_type === 'fandom');
        const keywords = sources.filter(s => s.source_type === 'search');
        const lines = [];
        if (fandoms.length)  lines.push('**Fandom Wikis** (3× roll weight):', ...fandoms.map(s  => `• ${s.display_name ?? s.source_value}`));
        if (keywords.length) lines.push('', '**Keywords** (Wikipedia search boost):', ...keywords.map(s => `• ${s.source_value}`));
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

      stmts.addWishSource.run(userId, guildId, sourceType, sourceValue, displayName);
      const typeLabel = sourceType === 'fandom' ? '🌐 Fandom wiki' : '🔍 Keyword';
      return interaction.reply({
        content: `✅ **${typeLabel}** \`${displayName}\` added to your boosted sources! Characters from this source are **3× more likely** to appear in your server's rolls.`,
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
