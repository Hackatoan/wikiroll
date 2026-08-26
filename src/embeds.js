import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { t } from './i18n.js';

const PALETTE = [
  0x5865F2, 0xEB459E, 0xFEE75C, 0x57F287, 0xED4245,
  0xFF7043, 0x9C27B0, 0x00BCD4, 0x4CAF50, 0xFF9800,
];

const SOURCE_ICON = {
  wikipedia: '📖',
};
function sourceIcon(source) {
  return SOURCE_ICON[source] ?? '🌐';
}

export function buildRollEmbeds(characters, ownedIndices = new Set()) {
  return characters.map((c, i) => {
    const img = c.user_image || c.image_url;
    const owned = ownedIndices.has(i);
    const embed = new EmbedBuilder()
      .setColor(owned ? 0x57F287 : PALETTE[i % PALETTE.length])
      .setTitle(`${owned ? '✅ ' : ''}${i + 1}. ${c.name}`)
      .setURL(c.wiki_url || null)
      .setFooter({ text: `${sourceIcon(c.source)} ${c.source}` });

    if (c.description) {
      embed.setDescription(
        c.description.length > 220 ? c.description.slice(0, 220) + '…' : c.description
      );
    }

    if (img) embed.setThumbnail(img);
    return embed;
  });
}

export function buildClaimSelect(rollId, characters, claimedIndices = new Set(), gid) {
  const options = characters
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => !claimedIndices.has(i))
    .map(({ c, i }) => ({
      label: `${i + 1}. ${c.name}`.slice(0, 100),
      description: c.source?.slice(0, 100) ?? undefined,
      value: String(i),
      emoji: '🎯',
    }));

  if (!options.length) return [];

  const select = new StringSelectMenuBuilder()
    .setCustomId(`claimselect_${rollId}`)
    .setPlaceholder(t(gid, 'embed.claimPlaceholder'))
    .addOptions(options);

  return [new ActionRowBuilder().addComponents(select)];
}

export function buildCollectionEmbed(user, chars, page = 1, gid) {
  const perPage = 12;
  const start = (page - 1) * perPage;
  const slice = chars.slice(start, start + perPage);
  const totalPages = Math.max(1, Math.ceil(chars.length / perPage));

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: t(gid, 'embed.collectionTitle', { user: user.username }), iconURL: user.displayAvatarURL() })
    .setFooter({ text: t(gid, 'embed.pageFooter', { page, total: totalPages, count: chars.length }) });

  if (!slice.length) {
    embed.setDescription(t(gid, 'embed.collectionEmpty'));
  } else {
    const lines = slice.map((c, i) => {
      const idx = start + i + 1;
      const src = sourceIcon(c.source);
      return `**${idx}.** [${c.name}](${c.wiki_url || 'https://en.wikipedia.org'}) ${src}`;
    });
    embed.setDescription(lines.join('\n'));
    const thumb = slice.find(c => c.user_image || c.image_url);
    if (thumb) embed.setThumbnail(thumb.user_image || thumb.image_url);
  }
  return embed;
}

export function buildSearchEmbed(chars, query, gid) {
  const embed = new EmbedBuilder()
    .setColor(0x00BCD4)
    .setTitle(t(gid, 'embed.searchTitle', { query }))
    .setFooter({ text: t(gid, 'embed.resultCount', { count: chars.length }) });

  if (!chars.length) {
    embed.setDescription(t(gid, 'embed.searchNone'));
    return embed;
  }

  const lines = chars.map(c => {
    const owner = c.owner_id ? `<@${c.owner_id}>` : `*${t(gid, 'embed.unclaimed')}*`;
    return `[**${c.name}**](${c.wiki_url || '#'}) — ${owner} ${sourceIcon(c.source)}`;
  });
  embed.setDescription(lines.join('\n'));
  return embed;
}

export function buildCharInfoEmbed(char, ownerId = null, gid) {
  const img = char.user_image || char.image_url;
  const embed = new EmbedBuilder()
    .setColor(ownerId ? 0x57F287 : 0x607D8B)
    .setTitle(char.name)
    .setURL(char.wiki_url || null)
    .addFields(
      { name: t(gid, 'embed.owner'), value: ownerId ? `<@${ownerId}>` : t(gid, 'embed.unclaimed'), inline: true },
      { name: t(gid, 'embed.source'), value: `${sourceIcon(char.source)} ${char.source}`, inline: true }
    )
    .setFooter({ text: char.wiki_url || '' });

  if (char.description) embed.setDescription(char.description);
  if (img) embed.setImage(img);
  return embed;
}

export function buildTradeEmbed(initiatorTag, targetTag, offerChar, requestChar = null, gid) {
  const isGift = !requestChar;
  const desc = isGift
    ? t(gid, 'embed.tradeGiftDesc', {
        initiator: initiatorTag, target: targetTag,
        offer: `[${offerChar.name}](${offerChar.wiki_url || '#'})`,
      })
    : t(gid, 'embed.tradeDesc', {
        initiator: initiatorTag, target: targetTag,
        offer: `[${offerChar.name}](${offerChar.wiki_url || '#'})`,
        request: `[${requestChar.name}](${requestChar.wiki_url || '#'})`,
      });
  return new EmbedBuilder()
    .setColor(isGift ? 0x57F287 : 0xFEE75C)
    .setTitle(isGift ? t(gid, 'embed.giftTitle') : t(gid, 'embed.tradeTitle'))
    .setDescription(desc);
}

export function buildSettingsEmbed(settings, gid) {
  return new EmbedBuilder()
    .setColor(0x9C27B0)
    .setTitle(t(gid, 'embed.settingsTitle'))
    .addFields(
      { name: t(gid, 'embed.rollCooldown'), value: t(gid, 'embed.minutes', { n: settings.roll_cooldown_minutes }), inline: true },
      { name: t(gid, 'embed.claimWindow'), value: t(gid, 'embed.minutes', { n: settings.claim_window_minutes }), inline: true },
      { name: t(gid, 'embed.notifyChannel'), value: settings.notify_channel ? `<#${settings.notify_channel}>` : t(gid, 'embed.none'), inline: true },
      { name: t(gid, 'embed.timezone'), value: settings.timezone || 'America/Los_Angeles', inline: true }
    );
}

export function buildWishlistEmbeds(user, items, gid) {
  if (!items.length) {
    return [new EmbedBuilder()
      .setColor(0xFFA500)
      .setAuthor({ name: t(gid, 'embed.wishlistTitle', { user: user.username }), iconURL: user.displayAvatarURL() })
      .setDescription(t(gid, 'embed.wishlistEmpty'))
    ];
  }
  return items.slice(0, 10).map((w, i) => {
    const e = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle(w.display_name)
      .setFooter({ text: w.source ? `${sourceIcon(w.source)} ${w.source}` : '' });
    if (i === 0) e.setAuthor({ name: t(gid, 'embed.wishlistTitleCount', { user: user.username, count: items.length }), iconURL: user.displayAvatarURL() });
    if (w.wiki_url) e.setURL(w.wiki_url);
    if (w.image_url) e.setThumbnail(w.image_url);
    return e;
  });
}

export function buildWishCharEmbed(char, footerNote, gid) {
  const note = footerNote || t(gid, 'embed.addedToWishlist');
  const e = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle(char.name ?? char.display_name)
    .setFooter({ text: `⭐ ${note} · ${sourceIcon(char.source)} ${char.source}` });
  if (char.wiki_url) e.setURL(char.wiki_url);
  if (char.image_url) e.setThumbnail(char.image_url);
  if (char.description) e.setDescription(char.description.slice(0, 220) + (char.description.length > 220 ? '…' : ''));
  return e;
}
