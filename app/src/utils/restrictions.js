import { getDatabase } from '../config/database.js';
import { getPersonalRoleName, applyRestrictionsToAllChannels, removeRestrictionsFromAllChannels, ALLOWED_CHANNEL_NAMES } from './roles.js';
import { createSuccessEmbed } from './embed.js';

/**
 * 制限状態を自動更新
 * scheduled → active（開始日時が過ぎた場合）
 * active → expired（終了日時が過ぎた場合）
 */
export async function updateRestrictionStatuses(client) {
  const db = getDatabase();
  const now = new Date().toISOString();

  // scheduled → active（開始日時が過ぎたもの）
  const scheduledToActive = db.prepare(`
    SELECT r.*, u.board_channel_id 
    FROM restrictions r
    LEFT JOIN users u ON r.user_id = u.user_id
    WHERE r.status = 'scheduled' 
    AND r.start_datetime IS NOT NULL 
    AND r.start_datetime <= ?
  `).all(now);

  let activatedCount = 0;

  for (const restriction of scheduledToActive) {
    let success = false;

    // ロールを付与して制限を適用
    try {
      // 全ギルドをループしてユーザーを探す
      // ※本来はrestrictionにguild_idを持たせるべきだが、現在はユーザーIDのみ
      for (const guild of client.guilds.cache.values()) {
        const member = await guild.members.fetch(restriction.user_id).catch(() => null);
        if (member) {
          const roleName = getPersonalRoleName(member.user);
          const personalRole = await guild.roles.fetch().then(roles => roles.find(r => r.name === roleName));
          // fetchしないとキャッシュにない可能性がある

          if (personalRole) {
            await member.roles.add(personalRole, 'Sentinel: 制限開始（自動）');
            // board_channel_id を渡す
            await applyRestrictionsToAllChannels(guild, personalRole, restriction.board_channel_id);
            console.log(`制限を自動開始: ユーザー ${restriction.user_id} (Guild: ${guild.name})`);
            success = true; // 少なくとも1つのギルドで適用できれば成功とみなす

            // 通知を送信
            const notificationChannel = guild.channels.cache.find(c => c.name === ALLOWED_CHANNEL_NAMES[0] && c.type === 0);
            if (notificationChannel) {
              const embed = createSuccessEmbed(
                '制限開始',
                `<@${member.id}> さんの学習制限が自動的に開始されました。`
              );
              await notificationChannel.send({
                content: `<@${member.id}>`,
                embeds: [embed]
              });
            }
          } else {
            // ロールがない場合は作成を試みるなどが必要だが、
            // startコマンドで作成されているはずなので、ここではログのみ
            console.warn(`制限開始ロールが見つかりません: ${roleName} (User: ${restriction.user_id})`);
          }
        }
      }
    } catch (error) {
      console.error(`制限自動開始エラー（ユーザー ${restriction.user_id}）:`, error.message);
    }

    // 成功した場合、またはユーザーが見つからない場合も（無限ループ防止のため）ステータス更新
    // ただしAPIエラーなどで一時的に失敗した場合はリトライさせたいが、
    // ここでは安全のため「処理を試みたら」更新する方針とするか、成功時のみにするか。
    // ユーザーが抜けている場合などは永久に失敗するので、更新してしまうのが安全。

    db.prepare(`
      UPDATE restrictions 
      SET status = 'active', updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(restriction.id);
    activatedCount++;
  }

  // active → expired（終了日時が過ぎたもの）
  const activeToExpired = db.prepare(`
    SELECT r.*, u.board_channel_id 
    FROM restrictions r
    LEFT JOIN users u ON r.user_id = u.user_id
    WHERE r.status = 'active' 
    AND r.end_datetime <= ?
  `).all(now);

  let expiredCount = 0;

  for (const restriction of activeToExpired) {
    // ロールを剥奪して制限を解除
    try {
      for (const guild of client.guilds.cache.values()) {
        const member = await guild.members.fetch(restriction.user_id).catch(() => null);

        // メンバーがいなくてもロールの掃除は必要かもしれないが、
        // 個人ロールはメンバーに紐づく名前なので、メンバーが見つからないとロール名も特定できない（厳密にはID保存すべき）
        // ここではメンバーがいる場合のみ処理
        if (member) {
          const roleName = getPersonalRoleName(member.user);
          const personalRole = guild.roles.cache.find(r => r.name === roleName);

          if (personalRole) {
            await removeRestrictionsFromAllChannels(guild, personalRole);

            // ロール復元
            if (restriction.original_roles) {
              try {
                const originalRoleIds = JSON.parse(restriction.original_roles);
                const botMember = guild.members.me;
                const botHighestRole = botMember.roles.highest;

                // 操作不能なロール（Botより上位、Managed、@everyone）は維持
                const unmanageableRoles = member.roles.cache.filter(role =>
                  role.position >= botHighestRole.position || role.managed || role.id === guild.id
                ).map(r => r.id);

                // 復元ロールと操作不能ロールを結合し、個人ロールを除外
                const finalRoles = [...new Set([...unmanageableRoles, ...originalRoleIds])].filter(id => id !== personalRole.id);

                await member.roles.set(finalRoles, 'Sentinel: 制限終了（ロール復元）');
              } catch (e) {
                console.error('ロール復元エラー:', e);
                await member.roles.remove(personalRole, 'Sentinel: 制限終了（復元失敗のため削除のみ）');
              }
            } else {
              await member.roles.remove(personalRole, 'Sentinel: 制限終了（自動）');
            }
            console.log(`制限を自動終了: ユーザー ${restriction.user_id} (Guild: ${guild.name})`);

            // 通知を送信
            const notificationChannel = guild.channels.cache.find(c => c.name === ALLOWED_CHANNEL_NAMES[0] && c.type === 0);
            if (notificationChannel) {
              const embed = createSuccessEmbed(
                '制限終了',
                `<@${member.id}> さんの学習制限時間が終了しました！\nお疲れ様でした。`
              );
              await notificationChannel.send({
                content: `<@${member.id}>`,
                embeds: [embed]
              });
            }

            // 2. 個人チャンネルへの通知
            if (restriction.board_channel_id) {
              const personalChannel = guild.channels.cache.get(restriction.board_channel_id);
              if (personalChannel) {
                const embed = createSuccessEmbed(
                  'おかえりなさい！',
                  '制限が解除されました。'
                );
                await personalChannel.send({
                  content: `<@${member.id}>`,
                  embeds: [embed]
                });
              }
            }
          }
        } else {
          // メンバーが見つからない場合、ギルドからロールだけ探して消す処理が必要かも？
          // 現状の仕様では名前依存なので難しい。
          // ユーザーがサーバーから抜けたと判断し、DB更新は行う。
        }
      }
    } catch (error) {
      console.error(`制限自動終了エラー（ユーザー ${restriction.user_id}）:`, error.message);
      // APIエラー等の場合、ここでcontinueすると次回リトライされるが、
      // 致命的なエラーでループし続けるのを防ぐため、一旦更新してしまう。
    }

    db.prepare(`
      UPDATE restrictions 
      SET status = 'expired', updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(restriction.id);
    expiredCount++;
  }

  return {
    scheduledToActive: activatedCount,
    activeToExpired: expiredCount,
  };
}

