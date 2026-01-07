import { getDatabase } from '../config/database.js';
import { getJSTDateString } from './discordActivity.js';

/**
 * ユーザーのTwitter活動を記録
 * @param {string} userId - DiscordユーザーID
 * @param {number} tweetCount - ツイート数
 * @param {Date} date - 対象日
 */
export function recordTwitterActivity(userId, tweetCount, date = new Date()) {
    const db = getDatabase();
    const activityDate = getJSTDateString(date);

    db.prepare(`
    INSERT INTO twitter_activity (user_id, activity_date, tweet_count)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, activity_date) DO UPDATE SET
    tweet_count = excluded.tweet_count,
    updated_at = CURRENT_TIMESTAMP
  `).run(userId, activityDate, tweetCount);
}

/**
 * Nitter経由でツイート数を取得（簡易実装）
 * @param {string} username - Twitterユーザー名
 * @returns {Promise<number|null>} ツイート数（取得失敗時はnull）
 */
export async function fetchDailyTweetCount(username) {
    // Nitterインスタンスのリスト（安定しているものを優先）
    const instances = [
        'https://nitter.poast.org',
        'https://nitter.privacydev.net',
        'https://nitter.no-logs.com'
    ];

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const targetDateStr = getJSTDateString(yesterday);

    // 注意: RSSからは「その日に何件投稿したか」の正確な数値を取得するのは限界がある
    // (最新20件程度しか入っていないため)
    // 本来はスクレイピングや専用APIが必要だが、要件に合わせた「Nitter経由」のプロトタイプ実装

    for (const instance of instances) {
        try {
            const response = await fetch(`${instance}/${username}/rss`, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            if (!response.ok) continue;

            const xml = await response.text();

            // <pubDate>要素を抽出して日付をカウント
            // 例: <pubDate>Tue, 07 Jan 2026 12:34:56 GMT</pubDate>
            const items = xml.split('<item>');
            let count = 0;

            for (let i = 1; i < items.length; i++) {
                const pubDateMatch = items[i].match(/<pubDate>(.*?)<\/pubDate>/);
                if (pubDateMatch) {
                    const pubDate = new Date(pubDateMatch[1]);
                    if (getJSTDateString(pubDate) === targetDateStr) {
                        count++;
                    }
                }
            }

            console.log(`[Twitter] @${username} の ${targetDateStr} の活動数: ${count} (Instance: ${instance})`);
            return count;
        } catch (error) {
            console.warn(`[Twitter] インスタンス ${instance} での取得失敗:`, error.message);
        }
    }

    return null;
}

/**
 * 全ユーザーのTwitter活動を更新
 */
export async function updateAllTwitterActivity() {
    const db = getDatabase();
    const users = db.prepare('SELECT user_id, twitter_username FROM users WHERE twitter_username IS NOT NULL').all();

    console.log(`[Twitter] ${users.length} 件のアカウント集計を開始します...`);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    for (const user of users) {
        const count = await fetchDailyTweetCount(user.twitter_username);
        if (count !== null) {
            recordTwitterActivity(user.user_id, count, yesterday);
        } else {
            console.warn(`[Twitter] @${user.twitter_username} のデータ取得に失敗しました。`);
        }
        // インスタンスへの負荷軽減のため少し待機
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

/**
 * 指定日のTwitter活動データを取得
 * @param {string} userId - DiscordユーザーID
 * @param {Date} date - 日付
 * @returns {Object|null} 活動データ
 */
export function getTwitterActivityByDate(userId, date) {
    const db = getDatabase();
    const dateStr = getJSTDateString(date);

    return db.prepare(`
    SELECT * FROM twitter_activity
    WHERE user_id = ? AND activity_date = ?
  `).get(userId, dateStr);
}
