import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { setTwitterUsername, getOrCreateUser } from '../utils/db.js';
import { createSuccessEmbed, createInfoEmbed } from '../utils/embed.js';

export const data = new SlashCommandBuilder()
    .setName('study')
    .setDescription('勉強管理コマンド')
    .addSubcommandGroup(group =>
        group
            .setName('settings')
            .setDescription('各種設定')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('twitter')
                    .setDescription('Twitter(X)のユーザー名を登録します')
                    .addStringOption(option =>
                        option
                            .setName('username')
                            .setDescription('Twitter ID（@以降のユーザー名）')
                            .setRequired(true)
                    )
            )
    );

async function execute(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();

    if (group !== 'settings') return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (subcommand === 'twitter') {
        let username = interaction.options.getString('username');

        // @が含まれている場合は除去
        if (username.startsWith('@')) {
            username = username.substring(1);
        }

        try {
            getOrCreateUser(interaction.user.id);
            setTwitterUsername(interaction.user.id, username);

            const embed = createSuccessEmbed(
                'Twitter設定完了',
                `Twitter(X)のアカウントを \`@${username}\` として登録しました。\n週次レポートにて活動状況が集計されます。`
            );

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Twitter登録エラー:', error);
            const embed = createInfoEmbed(
                'エラー',
                '設定の保存中にエラーが発生しました。'
            );
            await interaction.editReply({ embeds: [embed] });
        }
    }
}

export const settings = { data, execute };
