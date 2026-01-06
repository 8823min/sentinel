import { SlashCommandBuilder } from 'discord.js';
import { getOrCreateUser, createRestriction, getActiveRestriction } from '../utils/db.js';
import { getOrCreatePersonalRole, applyRestrictionsToAllChannels } from '../utils/roles.js';
import { createSuccessEmbed, createWarningEmbed } from '../utils/embed.js';

export const data = new SlashCommandBuilder()
  .setName('study')
  .setDescription('勉強管理コマンド')
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('制限を開始')
      .addStringOption(option =>
        option
          .setName('duration')
          .setDescription('勉強時間を選択')
          .setRequired(true)
          .addChoices(
            { name: '1分(テスト用)', value: '60' },
            { name: '30分', value: '1800' },
            { name: '1時間', value: '3600' },
            { name: '2時間', value: '7200' },
            { name: '12時間', value: '43200' },
            { name: '1日', value: '86400' },
            { name: '2日', value: '172800' },
            { name: '3日', value: '259200' },
            { name: '1週間', value: '604800' },
            { name: '1か月', value: '2592000' },
            { name: '半年', value: '15768000' },
            { name: '1年', value: '31536000' }
          )
      )
  );

async function execute(interaction) {
  if (interaction.options.getSubcommand() !== 'start') {
    return;
  }

  await interaction.deferReply();

  const userId = interaction.user.id;
  const guild = interaction.guild;
  const durationSeconds = parseInt(interaction.options.getString('duration'));

  try {
    // 終了日時を計算（現在時刻 + 選択された時間）
    const now = new Date();
    const endDatetime = new Date(now.getTime() + durationSeconds * 1000);

    // 既存のアクティブな制限をチェック
    const existing = getActiveRestriction(userId);
    if (existing) {
      const embed = createWarningEmbed(
        '制限中',
        '既に制限が設定されています。先に `/study stop` で解除してください。'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ユーザーを登録・取得
    const user = getOrCreateUser(userId);

    // セットアップ確認
    if (!user.board_channel_id) {
      const embed = createWarningEmbed(
        'セットアップ未完了',
        '学習用チャンネルが設定されていません。先に `/study setup channel:` でチャンネルを設定してください。'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ユーザーを取得
    const member = await guild.members.fetch(userId);
    const botMember = guild.members.me;

    // デバッグログ：権限関係の確認
    console.log(`[DEBUG] Permission Check for User: ${member.user.tag} (${member.id})`);
    console.log(`[DEBUG] Bot: ${botMember.user.tag}, Highest Role Pos: ${botMember.roles.highest.position}`);
    console.log(`[DEBUG] User Highest Role Pos: ${member.roles.highest.position}`);
    console.log(`[DEBUG] Member Manageable: ${member.manageable}`);

    // ガード：Botがユーザーを管理できない場合（相手が上位ロール持ちなど）
    if (!member.manageable) {
      const embed = createWarningEmbed(
        '権限エラー',
        'Botのロールがあなたのロールより下位にあるため、制限を開始できません。\nサーバー管理者に連絡して、Sentinalのロールをリストの一番上に移動してもらってください。'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // 個人ロールを取得または作成
    const personalRole = await getOrCreatePersonalRole(guild, member.user);

    console.log(`[DEBUG] Personal Role: ${personalRole.name}, Pos: ${personalRole.position}`);

    if (personalRole.position >= botMember.roles.highest.position) {
      console.warn(`[WARN] Personal role is higher than bot role! Role: ${personalRole.position}, Bot: ${botMember.roles.highest.position}`);
      const embed = createWarningEmbed(
        'ロール設定エラー',
        '「勉強中」ロールの位置がBotより上位にあるため操作できません。\n管理者に連絡してください。'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ロール保存と剥奪の準備
    const botHighestRole = botMember.roles.highest;

    // 保存対象のロール（Botが操作可能なもののみ）
    // @everyone, Managed, Botより上位のロールは除外
    const manageableRoles = member.roles.cache.filter(role =>
      role.id !== guild.id &&
      !role.managed &&
      role.position < botHighestRole.position &&
      role.id !== personalRole.id
    );

    const originalRoleIds = manageableRoles.map(r => r.id);

    // 制限を作成（元のロールリストを保存）
    const restriction = createRestriction(userId, null, endDatetime.toISOString(), originalRoleIds);

    // 操作可能なロールを剥奪（Botより上位やManagedロールには手を出さないことでエラー回避）
    if (manageableRoles.size > 0) {
      await member.roles.remove(manageableRoles, 'Sentinel: 制限開始（既存ロール剥奪）');
    }

    // 勉強用ロールを付与
    await member.roles.add(personalRole, 'Sentinel: 制限開始');

    // 全チャンネルに制限を適用
    // （管理者権限を持つロールが剥奪されていれば、これで正しく見えなくなるはず）
    await applyRestrictionsToAllChannels(guild, personalRole, user.board_channel_id);

    const embed = createSuccessEmbed(
      '制限開始',
      '学習制限を開始しました。',
      [
        { name: '終了日時', value: formatDateTime(endDatetime), inline: true },
        { name: '状態', value: restriction.status === 'active' ? '制限中' : '開始待ち', inline: true },
        { name: '許可チャンネル', value: `<#${user.board_channel_id}>`, inline: true },
      ]
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('制限開始エラー:', error);

    const embed = createWarningEmbed(
      'エラー',
      '制限の開始中にエラーが発生しました。Botに必要な権限があるか確認してください。'
    );

    await interaction.editReply({ embeds: [embed] });
  }
}

export const start = { data, execute };

/**
 * 日時をフォーマット
 * @param {Date} date - 日時
 * @returns {string} フォーマットされた文字列
 */
function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

