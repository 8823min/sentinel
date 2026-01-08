import { getDatabase } from '../config/database.js';
import { getActivityByDate, getJSTDateString } from './discordActivity.js';
import { getTwitterActivityByDate } from './twitter.js';
import { createInfoEmbed, createWarningEmbed } from './embed.js';
import { ALLOWED_CHANNEL_NAMES } from './roles.js';

/**
 * 制限中ユーザーの日次レポートを作成・送信
 * @param {import('discord.js').Client} client 
 */
export async function generateDailyReport(client) {
    console.log('📊 日次レポートの生成を開始します...');
    const db = getDatabase();

    // 日付の設定（すべてJST基準で計算）
    const now = new Date();

    // レポート対象日（本日）
    const targetDate = new Date(now);
    const targetDateStr = getJSTDateString(targetDate);

    // 比較対象日（昨日）
    const previousDate = new Date(targetDate);
    previousDate.setDate(previousDate.getDate() - 1);

    console.log(`対象日: ${targetDateStr}`);

    // 対象ユーザーの選定
    // 対象日に制限がかかっていた、または現在制限中のユーザーを取得
    // SQLiteのDATETIMEは文字列比較になるため、JSTとの兼ね合いに注意
    // ここでは status で絞り込む
    const activeUsers = db.prepare(`
    SELECT DISTINCT user_id FROM restrictions 
    WHERE status = 'active' OR status = 'expired'
  `).all();

    if (activeUsers.length === 0) {
        console.log('レポート対象の制限ユーザーがいません。');
        return;
    }

    const reportFields = [];
    const warningFields = [];
    let userCount = 0;

    for (const { user_id } of activeUsers) {
        // ユーザー名取得
        let displayName = `User ${user_id}`;
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

        // Twitter活動の取得
        const targetTwitter = getTwitterActivityByDate(user_id, targetDate);
        const prevTwitter = getTwitterActivityByDate(user_id, previousDate);
        const twitterCount = targetTwitter ? targetTwitter.tweet_count : 0;
        const prevTwitterCount = prevTwitter ? prevTwitter.tweet_count : 0;
        const twitterDiff = twitterCount - prevTwitterCount;

        // 活動があった場合、または現在アクティブな制限ユーザーのみレポートに追加
        if (targetCount > 0 || previousCount > 0 || twitterCount > 0) {
            userCount++;
            const emoji = diff > 0 ? '📈' : (diff < 0 ? '📉' : '➡️');
            const twitterEmoji = twitterDiff > 0 ? '🐦📈' : (twitterDiff < 0 ? '🐦📉' : '🐦➡️');

            let value = `【Discord】\n本日: **${targetCount}**回 / 昨日: ${previousCount}回 (差: ${diff >= 0 ? '+' : ''}${diff})`;
            if (targetTwitter || prevTwitter) {
                value += `\n【Twitter】\n本日: **${twitterCount}**回 / 昨日: ${prevTwitterCount}回 (差: ${twitterDiff >= 0 ? '+' : ''}${twitterDiff})`;
            }

            reportFields.push({
                name: `${emoji} ${displayName}`,
                value: value,
                inline: true
            });

            // 警告判定
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
          `).run(user_id, targetDateStr, `投稿数増加: ${diff}回 (${previousCount} -> ${targetCount})`);
                } catch (error) {
                    console.error(`警告記録エラー (${user_id}):`, error);
                }
            }
        }
    }

    if (userCount === 0) {
        console.log('集計対象の活動（メッセージ送信）がありませんでした。');
        // 活動がない場合でも、レポートを送信するかどうかは運用次第
        // ここでは、ユーザーが「何も送っていない」という安心感のため、空でも送信するか検討
        // 要件的には「無いなら送信しない」でも良いが、テスト中は送信されると分かりやすい
    }

    // 環境変数からターゲットギルドIDを取得
    const TARGET_GUILD_ID = process.env.DISCORD_GUILD_ID;

    if (!TARGET_GUILD_ID) {
        console.warn('⚠️ DISCORD_GUILD_ID が設定されていないため、レポートの送信先を特定できません。');
        return;
    }

    const guild = client.guilds.cache.get(TARGET_GUILD_ID);

    if (!guild) {
        console.warn(`⚠️ ターゲットギルド (${TARGET_GUILD_ID}) が見つかりませんでした。Botが参加しているか確認してください。`);
        return;
    }

    // 1. 「勉強」チャンネルを探す
    // 2. なければホワイトリストに入っているチャンネルの最初の1つ
    // 3. なければ権限のある最初のテキストチャンネル
    let channel = guild.channels.cache.find(c => c.name === ALLOWED_CHANNEL_NAMES[0] && c.type === 0);

    if (!channel) {
        channel = guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me).has('SendMessages'));
    }

    if (channel) {
        try {
            // 日次レポートEmbed
            if (reportFields.length > 0) {
                const reportEmbed = createInfoEmbed(
                    `📊 日次活動レポート (${targetDateStr})`,
                    '制限中ユーザーの投稿数集計結果です。'
                );
                reportEmbed.addFields(reportFields);
                await channel.send({ embeds: [reportEmbed] });
            } else if (userCount === 0 && activeUsers.length > 0) {
                // 全員活動ゼロの場合の通知
                const emptyEmbed = createInfoEmbed(
                    `📊 日次活動レポート (${targetDateStr})`,
                    '対象ユーザーの本日の活動はありませんでした。素晴らしい集中力です！'
                );
                await channel.send({ embeds: [emptyEmbed] });
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
            console.log(`✅ [${guild.name}] にレポートを送信しました: #${channel.name}`);
        } catch (error) {
            console.error(`❌ [${guild.name}] へのレポート送信に失敗しました:`, error);
        }
    } else {
        console.warn(`⚠️ [${guild.name}] 送信先のチャンネルが見つかりませんでした。`);
    }
}
