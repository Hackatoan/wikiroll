import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

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

export function buildClaimButtons(rollId, count, claimedIndices = new Set()) {
  const rows = [];
  for (let row = 0; row < 2; row++) {
    const ar = new ActionRowBuilder();
    for (let col = 0; col < 5; col++) {
      const idx = row * 5 + col;
      if (idx >= count) break;
      if (claimedIndices.has(idx)) continue;
      ar.addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_${rollId}_${idx}`)
          .setLabel(String(idx + 1))
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🎯')
      );
    }
    if (ar.components.length) rows.push(ar);
  }
  return rows;
}

export function buildCollectionEmbed(user, chars, page = 1) {
  const perPage = 12;
  const start = (page - 1) * perPage;
  const slice = chars.slice(start, start + perPage);
  const totalPages = Math.max(1, Math.ceil(chars.length / perPage));

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: `${user.username}'s Collection`, iconURL: user.displayAvatarURL() })
    .setFooter({ text: `Page ${page}/${totalPages} · ${chars.length} total` });

  if (!slice.length) {
    embed.setDescription('*No characters yet — use `/roll` to get started!*');
  } else {
    const lines = slice.map((c, i) => {
      const idx = start + i + 1;
      const src = sourceIcon(c.source);
      return `**${idx}.** [${c.name}](${c.wiki_url || 'https://en.wikipedia.org'}) ${src}`;
    });
    embed.setDescription(lines.join('\n'));
  }
  return embed;
}

export function buildSearchEmbed(chars, query) {
  const embed = new EmbedBuilder()
    .setColor(0x00BCD4)
    .setTitle(`🔍 Search: "${query}"`)
    .setFooter({ text: `${chars.length} result${chars.length !== 1 ? 's' : ''}` });

  if (!chars.length) {
    embed.setDescription('No characters found. Try a different name.');
    return embed;
  }

  const lines = chars.map(c => {
    const owner = c.owner_id ? `<@${c.owner_id}>` : '*(unclaimed)*';
    return `[**${c.name}**](${c.wiki_url || '#'}) — ${owner} ${sourceIcon(c.source)}`;
  });
  embed.setDescription(lines.join('\n'));
  return embed;
}

export function buildCharInfoEmbed(char, ownerId = null) {
  const img = char.user_image || char.image_url;
  const embed = new EmbedBuilder()
    .setColor(ownerId ? 0x57F287 : 0x607D8B)
    .setTitle(char.name)
    .setURL(char.wiki_url || null)
    .addFields(
      { name: 'Owner', value: ownerId ? `<@${ownerId}>` : 'Unclaimed', inline: true },
      { name: 'Source', value: `${sourceIcon(char.source)} ${char.source}`, inline: true }
    )
    .setFooter({ text: char.wiki_url || '' });

  if (char.description) embed.setDescription(char.description);
  if (img) embed.setImage(img);
  return embed;
}

export function buildTradeEmbed(initiatorTag, targetTag, offerChar, requestChar = null) {
  const isGift = !requestChar;
  const desc = isGift
    ? `**${initiatorTag}** is gifting a character to **${targetTag}**!\n\n` +
      `**Gift →** [${offerChar.name}](${offerChar.wiki_url || '#'})\n\n` +
      `*Accept or decline within 10 minutes.*`
    : `**${initiatorTag}** wants to trade with **${targetTag}**\n\n` +
      `**Offering →** [${offerChar.name}](${offerChar.wiki_url || '#'})\n` +
      `**Requesting ←** [${requestChar.name}](${requestChar.wiki_url || '#'})\n\n` +
      `*Accept or decline within 10 minutes.*`;
  return new EmbedBuilder()
    .setColor(isGift ? 0x57F287 : 0xFEE75C)
    .setTitle(isGift ? '🎁 Gift Offer' : '🔄 Trade Offer')
    .setDescription(desc);
}

export function buildSettingsEmbed(settings) {
  return new EmbedBuilder()
    .setColor(0x9C27B0)
    .setTitle('⚙️ WikiRoll Server Settings')
    .addFields(
      { name: '⏱ Roll Cooldown', value: `${settings.roll_cooldown_minutes} minutes`, inline: true },
      { name: '⌛ Claim Window', value: `${settings.claim_window_minutes} minutes`, inline: true },
      { name: '📢 Notify Channel', value: settings.notify_channel ? `<#${settings.notify_channel}>` : 'None', inline: true }
    );
}

export function buildWishlistEmbed(user, items) {
  const embed = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle(`⭐ ${user.username}'s Wishlist`);

  if (!items.length) {
    embed.setDescription('*Empty wishlist. Use `/wishlist add <name>` to add characters!*');
  } else {
    embed.setDescription(items.map(w => `• **${w.display_name}**`).join('\n'));
  }
  return embed;
}
