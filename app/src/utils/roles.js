import { PermissionFlagsBits } from 'discord.js';
import { getWhitelistedChannels } from './db.js';

/**
 * 個人ロール名を生成
 * @param {import('discord.js').User|import('discord.js').GuildMember} user - Discordユーザーまたはメンバー
 * @returns {string} ロール名
 */
export function getPersonalRoleName(user) {
  // 表示名またはユーザー名を使用（最大32文字、Discordのロール名制限）
  const displayName = user.displayName || user.username;
  const roleName = `${displayName}_勉強中`;

  // Discordのロール名は最大100文字だが、見やすさのため32文字に制限
  if (roleName.length > 32) {
    return `${displayName.substring(0, 28)}_勉強中`;
  }

  return roleName;
}

/**
 * Botの権限をチェック
 * @param {import('discord.js').Guild} guild - Discordサーバー
 * @returns {Object} 権限チェック結果
 */
function checkBotPermissions(guild) {
  const botMember = guild.members.me;
  if (!botMember) {
    return { hasPermission: false, reason: 'Botがサーバーに参加していません' };
  }

  const permissions = botMember.permissions;

  if (!permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { hasPermission: false, reason: 'Botに「ロールの管理」権限がありません' };
  }

  // Botのロールの位置を確認（@everyoneより上である必要がある）
  const botHighestRole = botMember.roles.highest;
  const everyoneRole = guild.roles.everyone;

  if (botHighestRole.position <= everyoneRole.position) {
    return { hasPermission: false, reason: 'Botのロールが@everyoneより上に配置されていません' };
  }

  return { hasPermission: true };
}

/**
 * 個人ロールを取得または作成
 * @param {import('discord.js').Guild} guild - Discordサーバー
 * @param {import('discord.js').User|import('discord.js').GuildMember} user - Discordユーザーまたはメンバー
 * @returns {Promise<import('discord.js').Role>} ロール
 * @throws {Error} 権限不足の場合
 */
export async function getOrCreatePersonalRole(guild, user) {
  const roleName = getPersonalRoleName(user);

  // 既存のロールを検索（名前で検索）
  let role = guild.roles.cache.find(r => r.name === roleName);

  if (!role) {
    // 権限チェック
    const permissionCheck = checkBotPermissions(guild);
    if (!permissionCheck.hasPermission) {
      throw new Error(permissionCheck.reason);
    }

    // ロールを作成（デフォルトでは全チャンネルを拒否）
    try {
      // Botの最高位ロールの位置を取得
      const botMember = guild.members.me;
      const botHighestRole = botMember.roles.highest;

      // Botのロールより1つ下に配置（Bot自身より上には設定できないため）
      // ただし1より小さくならないようにする（@everyoneは0）
      const newPosition = Math.max(1, botHighestRole.position - 1);

      role = await guild.roles.create({
        name: roleName,
        mentionable: false,
        reason: 'Sentinel: 個人制限ロールの作成',
        position: newPosition,
        permissions: [] // 権限なし（ViewChannelも含めて全てOFF）
      });
    } catch (error) {
      // position指定でエラーが出た場合（他のBotのロールなどが原因で）、positionなしで再試行
      if (error.code === 50013 || error.code === 50035) {
        console.warn(`ロール位置の指定に失敗しました。デフォルト位置で作成します: ${error.message}`);
        role = await guild.roles.create({
          name: roleName,
          mentionable: false,
          reason: 'Sentinel: 個人制限ロールの作成（位置指定失敗による再試行）',
          permissions: []
        });
      } else {
        if (error.code === 50013) {
          throw new Error('Botにロール作成の権限がありません。Botのロールを@everyoneより上に配置し、「ロールの管理」権限を付与してください。');
        }
        throw error;
      }
    }
  }

  return role;
}

/**
 * 制限対象外チャンネル名のリスト
 */
export const ALLOWED_CHANNEL_NAMES = ['勉強', '本'];

/**
 * 個人掲示板チャンネル名を生成
 * @param {string} userId - DiscordユーザーID
 * @returns {string} チャンネル名
 */
export function getBoardChannelName(userId) {
  return `board_${userId}`;
}

/**
 * 個人掲示板チャンネルを取得または作成
 * @param {import('discord.js').Guild} guild - Discordサーバー
 * @param {string} userId - DiscordユーザーID
 * @param {import('discord.js').Role} personalRole - 個人ロール
 * @returns {Promise<import('discord.js').TextChannel>} チャンネル
 */
export async function getOrCreateBoardChannel(guild, userId, personalRole) {
  const channelName = getBoardChannelName(userId);

  // 既存のチャンネルを検索
  let channel = guild.channels.cache.find(
    c => c.name === channelName && c.type === 0 // Text Channel
  );

  if (!channel) {
    // チャンネルを作成
    channel = await guild.channels.create({
      name: channelName,
      type: 0, // Text Channel
      reason: 'Sentinel: 個人掲示板チャンネルの作成',
      permissionOverwrites: [
        {
          id: guild.id, // @everyone
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: userId, // 該当ユーザー
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        {
          id: guild.members.me.id, // Bot
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
      ],
    });
  }

  return channel;
}

/**
 * 制限対象外チャンネルを取得
 * @param {import('discord.js').Guild} guild - Discordサーバー
 * @param {string} [optionalBoardChannelId] - 学習用として許可するチャンネルID
 * @returns {Array<import('discord.js').GuildChannel>} チャンネル配列
 */
export function getAllowedChannels(guild, optionalBoardChannelId) {
  const channels = [];

  // 1. 固定チャンネル（勉強、本）
  for (const name of ALLOWED_CHANNEL_NAMES) {
    const channel = guild.channels.cache.find(
      c => c.name === name && (c.type === 0 || c.type === 2) // Text or Voice
    );
    if (channel) channels.push(channel);
  }

  // 2. サーバーごとのホワイトリストチャンネル
  try {
    const whitelistedIds = getWhitelistedChannels(guild.id);
    for (const id of whitelistedIds) {
      const channel = guild.channels.cache.get(id);
      if (channel) channels.push(channel);
    }
  } catch (error) {
    console.error('ホワイトリスト取得エラー:', error);
  }

  // 3. ユーザー指定の学習用チャンネル
  if (optionalBoardChannelId) {
    const boardChannel = guild.channels.cache.get(optionalBoardChannelId);
    if (boardChannel) channels.push(boardChannel);
  }

  return channels;
}

/**
 * チャンネルの閲覧権限を設定（制限適用）
 * @param {import('discord.js').GuildChannel} channel - チャンネル
 * @param {import('discord.js').Role} personalRole - 個人ロール
 * @param {boolean} allow - 許可するかどうか
 */
export async function setChannelPermission(channel, personalRole, allow) {
  if (channel.type !== 0 && channel.type !== 2) return; // Text or Voice only

  const permissions = allow
    ? { ViewChannel: true }
    : { ViewChannel: false };

  await channel.permissionOverwrites.edit(personalRole, permissions, {
    reason: 'Sentinel: 制限の適用/解除',
  });
}

/**
 * 許可チャンネルにのみ閲覧権限を設定
 * @param {import('discord.js').Guild} guild - Discordサーバー
 * @param {import('discord.js').Role} personalRole - 個人ロール
 * @param {string} [boardChannelId] - 学習用として許可するチャンネルID
 */
export async function applyRestrictionsToAllChannels(guild, personalRole, boardChannelId) {
  const allowedChannels = getAllowedChannels(guild, boardChannelId);
  const total = allowedChannels.length;

  console.log(`許可チャンネルへの権限設定を開始します。対象数: ${total} (Role: ${personalRole.name})`);

  for (let i = 0; i < total; i++) {
    const channel = allowedChannels[i];
    console.log(`[${i + 1}/${total}] 許可設定: ${channel.name}`);

    try {
      // 許可チャンネルとして明示的に ViewChannel: true を設定
      await setChannelPermission(channel, personalRole, true);
    } catch (error) {
      console.error(`❌ チャンネル ${channel.name} への許可設定失敗:`, error.message);
    }
  }
  console.log('✅ 許可チャンネルの設定が完了しました。');
}

/**
 * 全チャンネルから制限を解除（何もしない）
 * ロール自体をメンバーから外すので、各チャンネルのOverwriteを削除する必要はない。
 * （残っていても無害であり、削除処理のAPI負荷を避けるため）
 * @param {import('discord.js').Guild} guild - Discordサーバー
 * @param {import('discord.js').Role} personalRole - 個人ロール
 */
export async function removeRestrictionsFromAllChannels(guild, personalRole) {
  // 以前は全チャンネルを走査してOverwriteを削除していたが、
  // ロール剥奪運用に変更したため、この処理は不要（軽量化）。
  console.log('制限解除処理: ロール剥奪により自動的に解除されるため、チャンネル操作はスキップします。');
}

/**
 * ホワイトリスト変更時に、現在アクティブな制限ロールの権限を更新
 * @param {import('discord.js').Guild} guild - Discordサーバー
 * @param {string} channelId - 対象チャンネルID
 * @param {boolean} isAllowed - 許可するかどうか（true: add, false: remove）
 */
export async function updatePermissionsForWhitelistedChannel(guild, channelId, isAllowed) {
  // 対象チャンネルを取得
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;

  // 「_勉強中」で終わるロール（制限ロール）を全て取得
  const studyRoles = guild.roles.cache.filter(role => role.name.endsWith('_勉強中'));

  if (studyRoles.size === 0) return;

  console.log(`ホワイトリスト更新に伴い、${studyRoles.size}個のロールの権限を更新します...`);

  for (const role of studyRoles.values()) {
    try {
      await setChannelPermission(channel, role, isAllowed);
    } catch (error) {
      console.warn(`権限更新エラー (${role.name}):`, error.message);
    }
  }
}
