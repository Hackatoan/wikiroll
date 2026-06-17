import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all WikiRoll commands'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle('WikiRoll — Commands')
      .addFields(
        {
          name: '🎲 Rolling & Claiming',
          value: [
            '`/roll` — Roll 10 characters to claim (1hr cooldown)',
            '`/daily` — Free daily roll; 2+ day streak = 2 claims',
            '`/ghostroll` — Test roll without cooldown (bot owner only)',
          ].join('\n'),
        },
        {
          name: '📦 Collection',
          value: [
            '`/collection [user]` — View your (or someone\'s) collection',
            '`/info <name>` — Detailed info on a character',
            '`/search <query>` — See if a character is claimed and by whom',
            '`/remove <name>` — Remove a character from your collection',
            '`/submitimage <name> <url>` — Set a custom image for a character',
          ].join('\n'),
        },
        {
          name: '🤝 Social',
          value: [
            '`/trade <user> <your char> [want]` — Offer a trade or gift a character',
            '`/wishlist` — Manage your wishlist (boosts roll odds)',
            '`/leaderboard` — Top collectors in this server',
          ].join('\n'),
        },
        {
          name: '⚙️ Server Setup',
          value: [
            '`/settings` — View or change server settings',
            '`/source` — Add Fandom wiki sources to roll from',
            '`/setrollchannel` — Restrict /roll to a specific channel (admin only)',
            '`/linkserver` — Share character ownership with another server',
          ].join('\n'),
        },
        {
          name: '🔗 Other',
          value: [
            '`/about` — Stats and links for WikiRoll',
            '`/vote` — Vote on top.gg',
            '`/server` — Join the official community Discord',
          ].join('\n'),
        },
      )
      .setFooter({ text: 'wikiroll.hackatoa.com' });

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
