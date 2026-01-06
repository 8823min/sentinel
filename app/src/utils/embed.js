import { EmbedBuilder } from 'discord.js';

/**
 * Embedの色定義
 */
export const EmbedColors = {
  INFO: 0x3498db,    // 青（通知）
  WARNING: 0xe74c3c, // 赤（警告）
  SUCCESS: 0x2ecc71, // 緑（正常）
};

/**
 * 統一されたEmbedを作成
 * @param {Object} options - Embedオプション
 * @param {string} options.title - タイトル
 * @param {string} options.description - 説明
 * @param {number} options.color - 色（EmbedColorsから選択）
 * @param {Array} options.fields - フィールド配列（オプション）
 * @returns {EmbedBuilder} Embedインスタンス
 */
export function createEmbed({ title, description, color, fields = [] }) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: 'sentinel' });
  
  if (fields.length > 0) {
    embed.addFields(fields);
  }
  
  return embed;
}

/**
 * 通知用Embed（青）
 */
export function createInfoEmbed(title, description, fields = []) {
  return createEmbed({ title, description, color: EmbedColors.INFO, fields });
}

/**
 * 警告用Embed（赤）
 */
export function createWarningEmbed(title, description, fields = []) {
  return createEmbed({ title, description, color: EmbedColors.WARNING, fields });
}

/**
 * 正常用Embed（緑）
 */
export function createSuccessEmbed(title, description, fields = []) {
  return createEmbed({ title, description, color: EmbedColors.SUCCESS, fields });
}

