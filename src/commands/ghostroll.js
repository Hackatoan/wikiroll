import { SlashCommandBuilder } from 'discord.js';
import { stmts, getSettings } from '../database.js';
import { fetchTenCharacters } from '../wiki.js';
import { buildRollEmbeds, buildClaimButtons } from '../embeds.js';

async function isOwner(interaction) {
  const app = await interaction.client.application.fetch();
  const owner = app.owner;
  if (!owner) return false;
  if (owner.id) return owner.id === interaction.user.id;
  // team
  return owner.members?.some(m => m.user.id === interaction.user.id) ?? false;
}

export default {
  data: new SlashCommandBuilder()
    .setName('ghostroll')
    .setDescription('(Owner only) Test a roll without consuming your cooldown.'),

  async execute(interaction) {
    if (!await isOwner(interaction)) {
      return interaction.reply({ content: '❌ Owner only.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const guildId = interaction.guildId;
    const userId  = interaction.user.id;
    const now     = Math.floor(Date.now() / 1000);
    const settings = getSettings(guildId);

    const guildSources  = stmts.getSources.all(guildId).map(s => s.wiki_url);
    const wishedChars   = stmts.getGuildWishChars.all(guildId);
    const wishedSources = stmts.getGuildWishSources.all(guildId);

    const rawChars = await fetchTenCharacters({ guildSources, wishedChars, wishedSources });
    if (!rawChars.length) return interaction.editReply('❌ Failed to fetch characters.');

    const chars = [];
    for (const raw of rawChars) {
      try {
        if (raw.id) {
          chars.push(raw);
        } else {
          const row = stmts.upsertChar.get(raw);
          chars.push({ ...raw, id: row.id });
        }
      } catch {}
    }
    if (!chars.length) return interaction.editReply('❌ Failed to save characters.');

    const claimWindowSecs = settings.claim_window_minutes * 60;
    const expiresAt = now + claimWindowSecs;

    const roll = stmts.createRoll.run({
      guild_id: guildId,
      channel_id: interaction.channelId,
      user_id: userId,
      message_id: null,
      character_ids: JSON.stringify(chars.map(c => c.id)),
      expires_at: expiresAt,
    });
    const rollId = roll.lastInsertRowid;
    // No cooldown set — ghost roll doesn't consume rate limit

    const embeds     = buildRollEmbeds(chars);
    const components = buildClaimButtons(rollId, chars.length);
    const mins = settings.claim_window_minutes;

    const msg = await interaction.editReply({
      content: `👻 **Ghost roll** — visible only to you. Claims work normally. Expires in **${mins}m**.`,
      embeds,
      components,
    });

    stmts.setRollMessageId.run(msg.id, rollId);

    setTimeout(async () => {
      try { await msg.edit({ content: '👻 *(ghost roll expired)*', embeds, components: [] }); } catch {}
    }, claimWindowSecs * 1000);
  },
};
