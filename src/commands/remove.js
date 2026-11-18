import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { stmts, getUserCollectionCrossGuild } from '../database.js';
import { nameChoices } from '../embeds.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove (divorce) a character from your collection')
    .addStringOption(o =>
      o.setName('name').setDescription('Character name').setRequired(true).setAutocomplete(true)
    ),

  // Suggest only characters the user owns in this server (what /remove can act on)
  async autocomplete(interaction) {
    const q = interaction.options.getFocused().toLowerCase();
    const owned = getUserCollectionCrossGuild([interaction.guildId], interaction.user.id);
    await interaction.respond(nameChoices(owned.filter(c => c.name?.toLowerCase().includes(q))));
  },

  async execute(interaction) {
    const query   = interaction.options.getString('name');
    const guildId = interaction.guildId;
    const userId  = interaction.user.id;

    const results = stmts.searchChars.all(guildId, `%${query}%`);
    let owned     = results.filter(c => c.owner_id === userId);
    // An exact name match (e.g. picked from autocomplete) wins over partial matches
    const exact   = owned.filter(c => c.name.toLowerCase() === query.toLowerCase());
    if (exact.length === 1) owned = exact;

    if (!owned.length) {
      return interaction.reply({
        content: t(guildId, 'remove.noOwn', { q: query }),
        ephemeral: true,
      });
    }

    if (owned.length > 1) {
      const list = owned.slice(0, 8).map((c, i) => `${i + 1}. ${c.name}`).join('\n');
      return interaction.reply({
        content: t(guildId, 'remove.multiple', { list }),
        ephemeral: true,
      });
    }

    const char = owned[0];
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`remove_confirm_${char.id}_${userId}`).setLabel(t(guildId, 'btn.confirm')).setStyle(ButtonStyle.Danger).setEmoji('💔'),
      new ButtonBuilder().setCustomId(`remove_cancel_${char.id}_${userId}`).setLabel(t(guildId, 'btn.cancel')).setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({
      content: t(guildId, 'remove.confirmPrompt', { char: char.name }),
      components: [row],
      ephemeral: true,
    });
  },
};
