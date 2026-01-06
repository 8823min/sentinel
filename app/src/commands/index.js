import { setup } from './setup.js';
import { start } from './start.js';
import { stop } from './stop.js';
import { status } from './status.js';

// すべてのコマンドをエクスポート
export const commands = [
  { data: setup.data, execute: setup.execute },
  { data: start.data, execute: start.execute },
  { data: stop.data, execute: stop.execute },
  { data: status.data, execute: status.execute },
];

