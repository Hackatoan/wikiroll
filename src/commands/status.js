import { SlashCommandBuilder, ActivityType } from 'discord.js';

const TYPES = {
  watching:   ActivityType.Watching,
  playing:    ActivityType.Playing,
  listening:  ActivityType.Listening,
  competing:  ActivityType.Competing,
};

export default {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription("Set the bot's presence (owner only)")
    .addStringOption(o => o.setName('text').setDescription('Status text').setRequired(true))
    .addStringOption(o =>
      o.setName('type').setDescription('Activity type')
        .addChoices(
          { name: 'Watching',  value: 'watching'  },
          { name: 'Playing',   value: 'playing'   },
          { name: 'Listening', value: 'listening' },
          { name: 'Competing', value: 'competing' },
        )
    )
    .addStringOption(o =>
      o.setName('presence').setDescription('Online status')
        .addChoices(
          { name: 'Online',          value: 'online'    },
          { name: 'Idle',            value: 'idle'      },
          { name: 'Do Not Disturb',  value: 'dnd'       },
          { name: 'Invisible',       value: 'invisible' },
        )
    ),

  async execute(interaction) {
    const app = interaction.client.application;
    if (!app.owner) await app.fetch();
    const ownerId = app.owner?.id ?? app.owner?.ownerId;

    if (!ownerId || interaction.user.id !== ownerId) {
      return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
    }

    const text     = interaction.options.getString('text');
    const type     = interaction.options.getString('type')     ?? 'watching';
    const presence = interaction.options.getString('presence') ?? 'online';

    interaction.client.user.setPresence({
      status: presence,
      activities: [{ name: text, type: TYPES[type] }],
    });

    return interaction.reply({
      content: `✅ **${type} ${text}** · ${presence}`,
      ephemeral: true,
    });
  },
};
