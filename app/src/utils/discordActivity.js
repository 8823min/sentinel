import { getDatabase } from '../config/database.js';

/**
 * Discord活動を記録（1日1回まで）
 * @param {string} userId - DiscordユーザーID
 * @param {Date} date - 活動日（デフォルト: 今日）
 * @returns {boolean} 記録されたかどうか（既に記録済みの場合はfalse）
 */
export function recordDiscordActivity(userId, date = null) {
  const db = getDatabase();

  // 日付を取得（YYYY-MM-DD形式）
  const activityDate = date
    ? date.toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  // 既に記録されているかチェック
  const existing = db.prepare(`
    SELECT * FROM discord_activity 
    WHERE user_id = ? AND activity_date = ?
  `).get(userId, activityDate);

  if (existing) {
    // カウントを更新
    db.prepare(`
      UPDATE discord_activity 
      SET message_count = message_count + 1, has_activity = 1
      WHERE id = ?
    `).run(existing.id);

    // 既に活動済みフラグが立っていたら false を返す（ログ抑制のため）
    return existing.has_activity === 0;
  }

  // 新規レコード作成
  db.prepare(`
    INSERT INTO discord_activity (user_id, activity_date, has_activity, message_count)
    VALUES (?, ?, 1, 1)
  `).run(userId, activityDate);

  return true;
}

/**
 * 指定日のDiscord活動データを取得
 * @param {string} userId - DiscordユーザーID
 * @param {Date} date - 日付
 * @returns {Object|null} 活動データ
 */
export function getActivityByDate(userId, date) {
  const db = getDatabase();
  const dateStr = date.toISOString().split('T')[0];

  return db.prepare(`
    SELECT * FROM discord_activity
    WHERE user_id = ? AND activity_date = ?
  `).get(userId, dateStr);
}

/**
 * 指定期間のDiscord活動日数を取得
 * @param {string} userId - DiscordユーザーID
 * @param {Date} startDate - 開始日
 * @param {Date} endDate - 終了日
 * @returns {number} 活動日数（0〜期間日数）
 */
export function getDiscordActivityCount(userId, startDate, endDate) {
  const db = getDatabase();

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  const result = db.prepare(`
    SELECT COUNT(*) as count 
    FROM discord_activity 
    WHERE user_id = ? 
    AND activity_date >= ? 
    AND activity_date <= ?
    AND has_activity = 1
  `).get(userId, startDateStr, endDateStr);

  return result.count || 0;
}

/**
 * 週次のDiscord活動日数を取得
 * @param {string} userId - DiscordユーザーID
 * @param {Date} weekStartDate - 週の開始日（日曜日）
 * @returns {number} 活動日数（0〜7）
 */
export function getWeeklyDiscordActivity(userId, weekStartDate) {
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 6);

  return getDiscordActivityCount(userId, weekStartDate, weekEndDate);
}

/**
 * 今日のDiscord活動をチェック
 * @param {string} userId - DiscordユーザーID
 * @returns {boolean} 今日活動があったかどうか
 */
export function hasTodayActivity(userId) {
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];

  const result = db.prepare(`
    SELECT has_activity 
    FROM discord_activity 
    WHERE user_id = ? AND activity_date = ?
  `).get(userId, today);

  return result && result.has_activity === 1;
}

