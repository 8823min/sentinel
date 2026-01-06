import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { addWhitelistedChannel, removeWhitelistedChannel, getWhitelistedChannels } from '../utils/db.js';
import { createSuccessEmbed, createWarningEmbed, createInfoEmbed } from '../utils/embed.js';
import { updatePermissionsForWhitelistedChannel } from '../utils/roles.js';

export const data = new SlashCommandBuilder()
    .setName('study')
    .setDescription('勉強管理コマンド')
    .addSubcommand(subcommand =>
        subcommand
            .setName('whitelist')
            .setDescription('制限中も閲覧可能なチャンネルを管理（管理者のみ）')
            .addStringOption(option =>
                option
                    .setName('action')
                    .setDescription('アクション')
                    .setRequired(true)
                    .addChoices(
                        { name: '追加', value: 'add' },
                        { name: '削除', value: 'remove' },
                        { name: '一覧', value: 'list' }
                    )
            )
            .addChannelOption(option =>
                option
                    .setName('target_channel')
                    .setDescription('対象チャンネル（追加・削除時）')
                    .setRequired(false)
            )
    );

async function execute(interaction) {
    if (interaction.options.getSubcommand() !== 'whitelist') {
        return;
    }

    // 権限チェック
    const allowedUserId = '1265259424340250625';
    const hasAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const isAllowedUser = interaction.user.id === allowedUserId;

    if (!hasAdmin && !isAllowedUser) {
        const embed = createWarningEmbed(
            '権限不足',
            'このコマンドは管理者、または許可されたユーザーのみが実行できます。'
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
    }

    const action = interaction.options.getString('action');
    const targetChannel = interaction.options.getChannel('target_channel');
    const guildId = interaction.guild.id;

    if ((action === 'add' || action === 'remove') && !targetChannel) {
        const embed = createWarningEmbed(
            'エラー',
            'チャンネルを指定してください。'
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        if (action === 'add') {
            const success = addWhitelistedChannel(guildId, targetChannel.id);
            if (success) {
                const embed = createSuccessEmbed(
                    'ホワイトリスト追加',
                    `<#${targetChannel.id}> をホワイトリストに追加しました。\n制限中もこのチャンネルは閲覧可能になります。`
                );
                await interaction.editReply({ embeds: [embed] });

                // 即時反映
                await updatePermissionsForWhitelistedChannel(interaction.guild, targetChannel.id, true);
            } else {
                const embed = createWarningEmbed(
                    'エラー',
                    `<#${targetChannel.id}> は既にホワイトリストに登録されています。`
                );
                await interaction.editReply({ embeds: [embed] });
            }
        } else if (action === 'remove') {
            const success = removeWhitelistedChannel(guildId, targetChannel.id);
            if (success) {
                const embed = createSuccessEmbed(
                    'ホワイトリスト削除',
                    `<#${targetChannel.id}> をホワイトリストから削除しました。`
                );
                await interaction.editReply({ embeds: [embed] });

                // 即時反映
                await updatePermissionsForWhitelistedChannel(interaction.guild, targetChannel.id, false);
            } else {
                const embed = createWarningEmbed(
                    'エラー',
                    `<#${targetChannel.id}> はホワイトリストに登録されていません。`
                );
                await interaction.editReply({ embeds: [embed] });
            }
        } else if (action === 'list') {
            const channelIds = getWhitelistedChannels(guildId);

            let description = '制限中も閲覧可能なチャンネル一覧：\n\n';
            if (channelIds.length === 0) {
                description += '登録されているチャンネルはありません。';
            } else {
                description += channelIds.map(id => `<#${id}>`).join('\n');
            }

            const embed = createInfoEmbed(
                'ホワイトリスト一覧',
                description
            );
            await interaction.editReply({ embeds: [embed] });
        }
    } catch (error) {
        console.error('ホワイトリスト操作エラー:', error);
        const embed = createWarningEmbed(
            'エラー',
            '処理中にエラーが発生しました。'
        );
        await interaction.editReply({ embeds: [embed] });
    }
}

export const whitelist = { data, execute };
