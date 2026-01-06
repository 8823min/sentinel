import { getDatabase } from '../config/database.js';
import { getActivityByDate } from './discordActivity.js';
import { createInfoEmbed, createWarningEmbed } from './embed.js';
import { ALLOWED_CHANNEL_NAMES } from './roles.js';

/**
 * 制限中ユーザーの日次レポートを作成・送信
 * @param {import('discord.js').Client} client 
 */
export async function generateDailyReport(client) {
    const db = getDatabase();

    // 日付の設定
    // レポート対象日（昨日）
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1);

    // 比較対象日（一昨日）
    const previousDate = new Date(targetDate);
    previousDate.setDate(previousDate.getDate() - 1);

    // 対象ユーザーの選定
    // 現在制限中のユーザー、または対象日に制限がかかっていたユーザー
    // 簡易的に active なユーザーと、対象日に end_datetime があるユーザーを取得
    const startOfTargetDate = new Date(targetDate);
    startOfTargetDate.setHours(0, 0, 0, 0);

    const activeUsers = db.prepare(`
    SELECT DISTINCT user_id FROM restrictions 
    WHERE status = 'active'
    OR (status = 'expired' AND end_datetime >= ?)
  `).all(startOfTargetDate.toISOString());

    if (activeUsers.length === 0) return;

    const reportFields = [];
    const warningFields = [];
    let userCount = 0;

    for (const { user_id } of activeUsers) {
        // ユーザー名取得
        let displayName = `User ${user_id}`;
        let userMention = `<@${user_id}>`;
        try {
            const user = await client.users.fetch(user_id);
            displayName = user.username;
        } catch (e) {
            // 取得失敗時はID表示
        }

        const targetActivity = getActivityByDate(user_id, targetDate);
        const previousActivity = getActivityByDate(user_id, previousDate);

        const targetCount = targetActivity ? targetActivity.message_count : 0;
        const previousCount = previousActivity ? previousActivity.message_count : 0;
        const diff = targetCount - previousCount;

        // レポートに追加
        if (targetCount > 0 || previousCount > 0) {
            userCount++;
            const emoji = diff > 0 ? '📈' : (diff < 0 ? '📉' : '➡️');
            const value = `昨日: **${targetCount}**回\n一昨日: ${previousCount}回\n差分: ${diff >= 0 ? '+' : ''}${diff}`;

            reportFields.push({
                name: `${emoji} ${displayName}`,
                value: value,
                inline: true
            });

            // 警告判定（増加しており、かつ昨日ある程度の活動（例えば5回以上）があった場合）
            // 1回2回の微増で警告するのは厳しいかもしれないが、要望は「増えていたら警告」
            if (diff > 0) {
                warningFields.push({
                    name: `${displayName}`,
                    value: `投稿数が前日より **${diff}回** 増加しています！気を引き締めましょう。`,
                    inline: true
                });

                // 警告をDBに記録
                try {
                    db.prepare(`
            INSERT INTO warnings (user_id, warning_type, warning_date, details)
            VALUES (?, 'activity_increase', ?, ?)
          `).run(user_id, targetDate.toISOString().split('T')[0], `投稿数増加: ${diff}回 (${previousCount} -> ${targetCount})`);
                } catch (error) {
                    console.error('警告記録エラー:', error);
                }
            }
        }
    }

    if (userCount === 0) return;

    // 全ギルドの「勉強」チャンネルに送信
    // または、Sentinalが導入されているメインサーバーのみに送信する設計か
    // 現状は全ギルドを回して送信する
    for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.find(c => c.name === ALLOWED_CHANNEL_NAMES[0] && c.type === 0);
        if (channel) {
            // 日次レポートEmbed
            if (reportFields.length > 0) {
                // Embedの制限（Field25個）を考慮すべきだが、プロトタイプなので一旦そのまま
                // 必要なら分割ロジックを入れる
                const reportEmbed = createInfoEmbed(
                    `📊 日次活動レポート (${targetDate.toLocaleDateString()})`,
                    '制限中ユーザーの投稿数集計結果です。'
                );
                reportEmbed.addFields(reportFields);
                await channel.send({ embeds: [reportEmbed] });
            }

            // 警告Embed
            if (warningFields.length > 0) {
                const warningEmbed = createWarningEmbed(
                    '⚠️ 活動量増加の警告',
                    '以下のユーザーは前日に比べて投稿数が増加しています。'
                );
                warningEmbed.addFields(warningFields);
                await channel.send({ embeds: [warningEmbed] });
            }
        }
    }
}
