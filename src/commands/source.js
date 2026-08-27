import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { stmts } from '../database.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('source')
    .setDescription('Manage Fandom wiki sources for rolling')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Add a Fandom wiki as a roll source')
      .addStringOption(o => o.setName('url').setDescription('Wiki base URL (e.g. https://naruto.fandom.com)').setRequired(true))
      .addStringOption(o => o.setName('name').setDescription('Friendly label').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove a wiki source')
      .addStringOption(o => o.setName('url').setDescription('Wiki URL to remove').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('list')
      .setDescription('List all active wiki sources')
    ),

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'list') {
      const sources = stmts.getSources.all(guildId);
      const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle(t(guildId, 'source.title'))
        .setDescription(
          sources.length
            ? sources.map(s => t(guildId, 'source.line', { name: s.wiki_name ?? s.wiki_url, url: s.wiki_url })).join('\n')
            : t(guildId, 'source.none')
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const rawUrl = interaction.options.getString('url');
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return interaction.reply({ content: t(guildId, 'source.invalidUrl'), ephemeral: true });
    }
    const cleanUrl = `${parsed.protocol}//${parsed.hostname}`;

    if (sub === 'add') {
      const name = interaction.options.getString('name') ?? parsed.hostname;
      stmts.addSource.run(guildId, cleanUrl, name, interaction.user.id);
      return interaction.reply({ content: t(guildId, 'source.added', { name, url: cleanUrl }) });
    }

    if (sub === 'remove') {
      stmts.removeSource.run(guildId, cleanUrl);
      return interaction.reply({ content: t(guildId, 'source.removed', { url: cleanUrl }), ephemeral: true });
    }
  },
};
