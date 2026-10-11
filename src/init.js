'use strict';

/**
 * 🔮 Yasakani Jewel - init コマンド
 *
 * カレントディレクトリ (プロジェクトルート) に監査レイヤーを配線する。
 *   層A: .yasakani/ 配置 + AI ツール設定へのポインタ追記
 *   層B: git pre-commit フック
 *   層C: VS Code / Cursor 保存時スキャン
 *
 * 非破壊方針: 既存ファイルはマーカー区間の追記のみ。settings.json は
 * コメント・整形を保持したテキスト挿入でマージする。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createHash } = require('crypto');
const { stripJsonComments } = require('./jsonc');
const { resolveHookPath, mergeHook } = require('./git-hooks');

const MARKER_START = '<!-- >>> YASAKANI JEWEL v1';

const PKG_ROOT = path.join(__dirname, '..');
const TEMPLATES = path.join(PKG_ROOT, 'templates');

// AI ツール設定ファイル (プロジェクトルートからの相対パス)
const AI_TARGETS = [
  'CLAUDE.md',
  'GEMINI.md',
  'AGENTS.md',
  '.cursorrules',
  path.join('.github', 'copilot-instructions.md'),
];

const YASAKANI_RUN_ON_SAVE_COMMAND = {
  match: '(^|[\\\\/])\\.env(?:\\..*)?$|\\.(js|ts|py|json|env|yml|yaml|md|mdx)$',
  cmd: 'node "${workspaceFolder}/.yasakani/scan.js" "${file}"',
};

function isYasakaniRunOnSaveCommand(command) {
  return Boolean(command && typeof command.cmd === 'string' && command.cmd.includes('.yasakani/scan.js'));
}

function hasYasakaniRunOnSave(runOnSave) {
  return Boolean(runOnSave && Array.isArray(runOnSave.commands) && runOnSave.commands.some(isYasakaniRunOnSaveCommand));
}

function isCurrentYasakaniRunOnSaveCommand(command) {
  return Boolean(
    command &&
    command.cmd === YASAKANI_RUN_ON_SAVE_COMMAND.cmd &&
    command.match === YASAKANI_RUN_ON_SAVE_COMMAND.match
  );
}

function hasCurrentYasakaniRunOnSave(runOnSave) {
  return Boolean(runOnSave && Array.isArray(runOnSave.commands) && runOnSave.commands.some(isCurrentYasakaniRunOnSaveCommand));
}

function mergeRunOnSave(runOnSave) {
  const merged = runOnSave && typeof runOnSave === 'object' && !Array.isArray(runOnSave)
    ? Object.assign({}, runOnSave)
    : {};
  const commands = [];
  let hasYasakani = false;
  for (const command of Array.isArray(merged.commands) ? merged.commands : []) {
    if (isYasakaniRunOnSaveCommand(command)) {
      if (!hasYasakani) {
        commands.push(YASAKANI_RUN_ON_SAVE_COMMAND);
        hasYasakani = true;
      }
    } else {
      commands.push(command);
    }
  }
  if (!hasYasakani) {
    commands.push(YASAKANI_RUN_ON_SAVE_COMMAND);
  }
  merged.commands = commands;
  return merged;
}

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch (e) { return null; }
}
function writeSafe(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

// --- 層A-1: .yasakani/ に指示書・設定・スキャナを配置 ---
function placeYasakaniDir(root) {
  console.log('[層A] .yasakani/ 配置');
  const dir = path.join(root, '.yasakani');
  fs.mkdirSync(dir, { recursive: true });

  // 指示書とスキャナは CLI 管理ファイル -> 常に最新へ更新
  fs.copyFileSync(path.join(TEMPLATES, 'yasakani-jewel.md'), path.join(dir, 'yasakani-jewel.md'));
  fs.copyFileSync(path.join(PKG_ROOT, 'src', 'scan.js'), path.join(dir, 'scan.js'));
  console.log('  [更新] .yasakani/yasakani-jewel.md, .yasakani/scan.js');

  // .yasakanirc はユーザー設定 -> 既存があれば保持
  const rcPath = path.join(dir, '.yasakanirc');
  if (readSafe(rcPath) === null) {
    fs.copyFileSync(path.join(TEMPLATES, 'yasakanirc'), rcPath);
    console.log('  [新規作成] .yasakani/.yasakanirc');
  } else {
    console.log('  [保持]     .yasakani/.yasakanirc (既存設定)');
  }

  const promptPolicyPath = path.join(dir, 'prompt-policy.json');
  if (readSafe(promptPolicyPath) === null) {
    fs.copyFileSync(path.join(TEMPLATES, 'prompt-policy.json'), promptPolicyPath);
    console.log('  [新規作成] .yasakani/prompt-policy.json');
  } else {
    console.log('  [保持]     .yasakani/prompt-policy.json (既存設定)');
  }
}

// --- 層A-2: AI ツール設定へポインタを追記 ---
function wireAiConfigs(root) {
  console.log('[層A] AI ツール設定へのポインタ追記');
  const block = readSafe(path.join(TEMPLATES, 'pointer.txt')).replace(/\s+$/, '') + '\n';
  for (const rel of AI_TARGETS) {
    const p = path.join(root, rel);
    const existing = readSafe(p);
    if (existing === null) {
      writeSafe(p, block);
      console.log(`  [新規作成] ${rel}`);
    } else if (existing.includes(MARKER_START)) {
      console.log(`  [配線済み] ${rel}`);
    } else {
      const sep = existing.endsWith('\n') ? '\n' : '\n\n';
      writeSafe(p, existing + sep + block);
      console.log(`  [追記]     ${rel}`);
    }
  }
}

// --- 層B: git pre-commit フック ---
function wireGitHook(root) {
  console.log('[層B] git pre-commit フック');
  let hookPath;
  try { hookPath = resolveHookPath(root); }
  catch (e) { console.log(`  [警告] ${e.message}`); return false; }
  if (!hookPath) {
    console.log('  [スキップ] git リポジトリではありません (層A/C/手動でカバー)');
    return true;
  }
  const tpl = readSafe(path.join(TEMPLATES, 'pre-commit')).replace(/\r\n/g, '\n');
  const existing = readSafe(hookPath);
  let merged;
  try { merged = mergeHook(existing, tpl); }
  catch (e) { console.log(`  [警告] ${e.message}`); return false; }
  if (merged !== existing) {
    writeSafe(hookPath, merged);
    console.log(`  [更新] ${hookPath} (既存フックの前に検査)`);
  }
  fs.chmodSync(hookPath, 0o755);
  return true;
}

function wireCi(root) {
  console.log('[層E] GitHub Actions セキュリティ検査');
  const target = path.join(root, '.github', 'workflows', 'yasakani-security.yml');
  const template = readSafe(path.join(TEMPLATES, 'security-scan.yml'));
  const policy = readSafe(path.join(root, '.yasakani', 'prompt-policy.json'));
  JSON.parse(policy); // 不正 policy で生成しない
  // 配布元が private でも導入先の token を要求せず実行できる。
  const scanner = fs.readFileSync(path.join(PKG_ROOT, 'src', 'scan.js'));
  const workflow = template
    .replace('__PROMPT_POLICY_BASE64__', Buffer.from(policy).toString('base64'))
    .replace('__SCANNER_BASE64__', scanner.toString('base64'))
    .replace('__SCANNER_SHA256__', createHash('sha256').update(scanner).digest('hex'));
  const existing = readSafe(target);
  if (existing !== null && existing !== workflow) {
    console.log('  [警告] 既存の yasakani-security.yml は保持しました。policy と固定検査器の更新を確認してください。');
    return false;
  }
  if (existing === null) writeSafe(target, workflow);
  console.log(`  [配線] ${target}`);
  console.log('  GitHub の ruleset / branch protection で Yasakani security scan を必須チェックに設定してください。');
  return true;
}

// --- 層C: VS Code / Cursor 保存時スキャン ---
function wireVscode(root) {
  console.log('[層C] VS Code / Cursor 保存時スキャン');
  const settingsPath = path.join(root, '.vscode', 'settings.json');
  const runOnSave = mergeRunOnSave(null);
  const raw = readSafe(settingsPath);

  if (raw === null) {
    writeSafe(settingsPath, JSON.stringify({ 'emeraldwalk.runonsave': runOnSave }, null, 2) + '\n');
    console.log('  [新規作成] .vscode/settings.json');
  } else {
    let parsed = null;
    try { parsed = JSON.parse(stripJsonComments(raw)); }
    catch (e) { parsed = null; }

    if (parsed && hasCurrentYasakaniRunOnSave(parsed['emeraldwalk.runonsave'])) {
      console.log('  [配線済み] .vscode/settings.json');
    } else if (parsed && Object.keys(parsed).length > 0 && raw.indexOf('{') >= 0) {
      const mergedRunOnSave = mergeRunOnSave(parsed['emeraldwalk.runonsave']);
      if (Object.prototype.hasOwnProperty.call(parsed, 'emeraldwalk.runonsave')) {
        parsed['emeraldwalk.runonsave'] = mergedRunOnSave;
        writeSafe(settingsPath, JSON.stringify(parsed, null, 2) + '\n');
        console.log('  [merge]    .vscode/settings.json');
      } else {
        // 既存の本文・コメントを保持したまま、開き波括弧の直後へテキスト挿入
        const inject = '  "emeraldwalk.runonsave": ' +
          JSON.stringify(mergedRunOnSave, null, 2).replace(/\n/g, '\n  ') + ',';
        const idx = raw.indexOf('{');
        const merged = raw.slice(0, idx + 1) + '\n' + inject + raw.slice(idx + 1);
        writeSafe(settingsPath, merged);
        console.log('  [追記]     .vscode/settings.json (既存設定・コメントを保持)');
      }
    } else if (parsed) {
      // 空オブジェクト等は丸ごと生成し直す
      writeSafe(settingsPath, JSON.stringify(
        Object.assign({}, parsed, { 'emeraldwalk.runonsave': runOnSave }), null, 2) + '\n');
      console.log('  [新規作成] .vscode/settings.json');
    } else {
      console.log('  [警告] .vscode/settings.json を JSON として解釈できません。手動設定が必要です。');
    }
  }
  installRunOnSaveExtension();
}

// VS Code / Cursor の CLI を探す。Windows では Code.exe ではなく
// code.cmd を使わないと --install-extension が通らない。
function splitPathList(value, platform) {
  return String(value || '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
}

function findInPath(name, options) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const suffixes = platform === 'win32' ? ['.cmd', '.exe', '.bat'] : [''];

  for (const dir of splitPathList(env.PATH, platform)) {
    for (const suffix of suffixes) {
      const candidate = path.join(dir, name + suffix);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function findEditorCli(name, options) {
  const opts = options || {};
  const platform = opts.platform || process.platform;
  const env = opts.env || process.env;
  const existsSync = opts.existsSync || fs.existsSync;

  const fromPath = findInPath(name, { platform, env, existsSync });
  if (fromPath) return fromPath;
  if (platform !== 'win32') return null;

  const cands = name === 'code'
    ? [path.join(env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'),
       path.join(env.ProgramFiles || '', 'Microsoft VS Code', 'bin', 'code.cmd')]
    : [path.join(env.LOCALAPPDATA || '', 'Programs', 'cursor', 'resources', 'app', 'bin', 'cursor.cmd')];
  for (const c of cands) {
    if (existsSync(c)) return c;
  }
  return null;
}

function installRunOnSaveExtension() {
  const extId = 'emeraldwalk.RunOnSave';
  let done = false;
  for (const name of ['code', 'cursor']) {
    const cli = findEditorCli(name);
    if (!cli) continue;
    try {
      // 引数は全て固定文字列 (ユーザー入力なし)。単一文字列で渡し DEP0190 を回避。
      const r = spawnSync(`"${cli}" --install-extension ${extId}`, { shell: true, stdio: 'ignore' });
      if (r && r.status === 0) {
        console.log(`  [拡張インストール] ${name} -> ${extId}`);
        done = true;
      }
    } catch (e) { /* 無視 */ }
  }
  if (!done) {
    console.log('  [スキップ] code/cursor の CLI 未検出。');
    console.log(`             保存時スキャンには VS Code 拡張 "${extId}" の手動インストールが必要です。`);
  }
}

function run(args = []) {
  if (args.some(arg => arg !== '--ci') || args.length > 1) throw new Error('init のオプションは --ci のみです。');
  const root = process.cwd();
  console.log('\n🔮 Yasakani Jewel - init');
  console.log(`対象プロジェクト: ${root}\n`);

  placeYasakaniDir(root);
  wireAiConfigs(root);
  const hooked = wireGitHook(root);
  wireVscode(root);
  const ci = args.includes('--ci') ? wireCi(root) : true;

  if (!hooked || !ci) {
    console.log('\n⚠️ 配線が一部未完了です。上記の警告を確認してください。');
    process.exitCode = 2;
  } else console.log('\n✅ 配線完了。AI ツールを再起動すると有効になります。');
  console.log('   AI チャットで「checkmaga」と入力すると監査が起動します。\n');
}

module.exports = { run, wireGitHook, wireCi, hasYasakaniRunOnSave, hasCurrentYasakaniRunOnSave, mergeRunOnSave, findEditorCli };
