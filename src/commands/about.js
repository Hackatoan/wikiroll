import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../database.js';

export default {
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('About WikiRoll — info, links, and stats'),

  async execute(interaction) {
    const guildId = interaction.guildId;

    const totalChars  = db.prepare('SELECT COUNT(*) AS n FROM characters').get().n;
    const guildOwned  = db.prepare('SELECT COUNT(*) AS n FROM ownership WHERE guild_id = ?').get(guildId).n;
    const guildRollers = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM ownership WHERE guild_id = ?').get(guildId).n;

    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle('WikiRoll')
      .setDescription('Collect characters and articles from **Wikipedia + 70+ Fandom wikis**.\nRoll, claim, trade, and build your collection — one wiki page at a time.')
      .addFields(
        {
          name: '📊 Stats',
          value: [
            `**${totalChars.toLocaleString()}** characters in the global pool`,
            `**${guildOwned.toLocaleString()}** claimed in this server`,
            `**${guildRollers.toLocaleString()}** collectors here`,
          ].join('\n'),
          inline: false,
        },
        {
          name: '🔗 Links',
          value: [
            '🌐 [Website](https://wikiroll.hackatoa.com)',
            '➕ [Add to Discord](https://discord.com/api/oauth2/authorize?client_id=1343100226537259018&permissions=126016&scope=bot%20applications.commands)',
            '💻 [GitHub](https://github.com/Hackatoan/wikiroll)',
            '☕ [Buy Me a Coffee](https://buymeacoffee.com/hackatoa)',
          ].join('\n'),
          inline: false,
        },
        {
          name: '⚡ Quick Start',
          value: '`/roll` to roll 10 characters · click a button to claim · `/collection` to view yours',
          inline: false,
        },
      )
      .setFooter({ text: 'Built by Hackatoa · hackatoa.com' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
