'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const START = '# >>> YASAKANI JEWEL v1 (pre-commit) >>>';
const END = '# <<< YASAKANI JEWEL v1 (pre-commit) <<<';

function resolveHookPath(root) {
  // 親プロジェクトを誤って配線しない。.git は worktree のファイルも許可。
  if (!fs.existsSync(path.join(root, '.git'))) return null;
  const read = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const hook = path.resolve(root, read(['rev-parse', '--git-path', 'hooks/pre-commit']));
  const common = path.resolve(root, read(['rev-parse', '--git-common-dir']));
  const insideRoot = !path.relative(root, hook).startsWith('..') && !path.isAbsolute(path.relative(root, hook));
  const standard = hook === path.join(common, 'hooks', 'pre-commit');
  // 外部の global hooksPath は他のリポジトリにも作用するため変更しない。
  if (!insideRoot && !standard) throw new Error('共有・外部の hooksPath は変更できません。プロジェクト内の hooksPath を設定してください。');
  // 文字列上は内側でも、symlink / junction が外部へ向く場合は変更しない。
  let ancestor = hook;
  const suffix = [];
  while (true) {
    try {
      const stat = fs.lstatSync(ancestor);
      if (ancestor === hook && stat.isSymbolicLink()) throw new Error('pre-commit のシンボリックリンクは変更できません。');
      break;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      suffix.unshift(path.basename(ancestor));
      ancestor = path.dirname(ancestor);
    }
  }
  const actual = path.join(fs.realpathSync(ancestor), ...suffix);
  const relative = path.relative(fs.realpathSync(root), actual);
  const actualInside = relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
  const actualStandard = actual === path.join(fs.realpathSync(common), 'hooks', 'pre-commit');
  if (!actualInside && !actualStandard) throw new Error('外部へ向く hooksPath のリンクは変更できません。');
  return hook;
}

function mergeHook(existing, template) {
  const text = String(existing || '').replace(/\r\n/g, '\n');
  const first = text.split('\n')[0];
  if (first.startsWith('#!') && !/^#!\s*(?:\/\S+\/(?:ba|da|k|z)?sh|\/usr\/bin\/env\s+(?:ba|da|k|z)?sh)\s*$/.test(first)) {
    throw new Error('既存の非 shell フックは自動変更できません。shell wrapper での手動連携が必要です。');
  }
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`${escape(START)}[\\s\\S]*?${escape(END)}[^\\n]*\\n?`, 'g');
  const cleaned = text.replace(block, '');
  const shebang = cleaned.startsWith('#!') ? cleaned.split('\n')[0] : '#!/bin/sh';
  const body = cleaned.startsWith('#!') ? cleaned.slice(shebang.length).replace(/^\n/, '') : cleaned;
  const managed = template.replace(/\r\n/g, '\n').replace(/^#![^\n]*\n/, '').trimEnd();
  return `${shebang}\n${managed}\n${body}`;
}

module.exports = { resolveHookPath, mergeHook };
