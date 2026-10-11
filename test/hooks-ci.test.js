'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const init = require('../src/init');
const uninstall = require('../src/uninstall');
const { resolveHookPath, mergeHook } = require('../src/git-hooks');
const pkg = path.resolve(__dirname, '..');
const tmp = path.join(pkg, '.tmp');
fs.mkdirSync(tmp, { recursive: true });
const root = fs.mkdtempSync(path.join(tmp, 'hooks-ci-'));
const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString('utf8');
const commit = () => spawnSync('git', ['commit', '-qm', 'test'], { cwd: root, encoding: 'utf8' });
const write = (file, content) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
};

try {
  git(['init', '-q']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'user.email', 'test@example.invalid']);
  git(['config', 'core.hooksPath', '.hooks']);
  const hook = write('.hooks/pre-commit', '#!/bin/sh\n# user hook\nexit 0\n');
  const scanner = write('.yasakani/scan.js', fs.readFileSync(path.join(pkg, 'src/scan.js')));
  write('.yasakani/prompt-policy.json', fs.readFileSync(path.join(pkg, 'templates/prompt-policy.json')));
  assert.strictEqual(resolveHookPath(root), hook, 'respects project hooksPath');
  assert.strictEqual(init.wireGitHook(root), true);
  const once = fs.readFileSync(hook, 'utf8');
  assert(once.indexOf('node "$SCANNER" --staged') < once.indexOf('exit 0'), 'runs before early exit');
  assert.strictEqual(init.wireGitHook(root), true);
  assert.strictEqual(fs.readFileSync(hook, 'utf8'), once, 'reinit is idempotent');

  write('app.js', 'const password = "demo-demo";\n');
  git(['add', 'app.js']);
  assert.notStrictEqual(commit().status, 0, 'real Git hook rejects staged secret');
  write('app.js', 'const value = 1;\n');
  git(['add', 'app.js']);
  const allowed = commit();
  assert.strictEqual(allowed.status, 0, `real Git hook allows clean stage: ${allowed.stdout} ${allowed.stderr}`);
  fs.unlinkSync(scanner);
  write('app.js', 'const value = 2;\n');
  git(['add', 'app.js']);
  assert.notStrictEqual(commit().status, 0, 'missing scanner fails closed');
  fs.writeFileSync(scanner, fs.readFileSync(path.join(pkg, 'src/scan.js')));

  fs.writeFileSync(hook, '#!/usr/bin/env node\nprocess.exit(0);\n');
  const nodeHook = fs.readFileSync(hook, 'utf8');
  assert.strictEqual(init.wireGitHook(root), false, 'unsupported hook is reported');
  assert.strictEqual(fs.readFileSync(hook, 'utf8'), nodeHook, 'unsupported hook stays unchanged');
  fs.writeFileSync(hook, once);

  const oldHook = '#!/bin/sh\nexit 0\n' + fs.readFileSync(path.join(pkg, 'templates/pre-commit'), 'utf8').replace(/^#![^\n]*\n/, '');
  const upgraded = mergeHook(oldHook, fs.readFileSync(path.join(pkg, 'templates/pre-commit'), 'utf8'));
  assert(upgraded.indexOf('node "$SCANNER" --staged') < upgraded.indexOf('exit 0'), 'old appended block moves before early exit');
  assert.strictEqual((upgraded.match(/>>> YASAKANI JEWEL/g) || []).length, 1);

  git(['config', 'core.hooksPath', path.join(tmp, 'external-hooks')]);
  assert.throws(() => resolveHookPath(root), /外部/);
  git(['config', 'core.hooksPath', '.hooks']);

  const external = fs.mkdtempSync(path.join(tmp, 'shared-hooks-'));
  try {
    fs.symlinkSync(external, path.join(root, '.linked-hooks'), process.platform === 'win32' ? 'junction' : 'dir');
    git(['config', 'core.hooksPath', '.linked-hooks']);
    assert.throws(() => resolveHookPath(root), /外部/);
  } finally {
    git(['config', 'core.hooksPath', '.hooks']);
    fs.rmSync(path.join(root, '.linked-hooks'), { recursive: true, force: true });
    assert(external.startsWith(tmp + path.sep));
    fs.rmSync(external, { recursive: true, force: true });
  }

  // .git ファイルの worktree でも有効な共有 hook を解決する。
  const worktree = path.join(root, 'worktree');
  git(['worktree', 'add', '--detach', worktree, 'HEAD']);
  assert(fs.statSync(path.join(worktree, '.git')).isFile());
  const worktreeHook = resolveHookPath(worktree);
  assert.strictEqual(worktreeHook, path.join(worktree, '.hooks', 'pre-commit'), 'relative hooksPath follows worktree');
  assert.strictEqual(init.wireGitHook(worktree), true, 'worktree wiring succeeds');
  git(['config', '--unset', 'core.hooksPath']);
  assert.strictEqual(resolveHookPath(worktree), path.join(root, '.git', 'hooks', 'pre-commit'), 'worktree resolves default shared hook');
  git(['config', 'core.hooksPath', '.hooks']);

  assert.strictEqual(init.wireCi(root), true, 'CI is generated');
  const workflow = path.join(root, '.github/workflows/yasakani-security.yml');
  const yaml = fs.readFileSync(workflow, 'utf8');
  assert.strictEqual(init.wireCi(root), true, 'identical CI is idempotent');
  const encoded = yaml.match(/YASAKANI_POLICY_B64: (\S+)/)[1];
  assert.deepStrictEqual(JSON.parse(Buffer.from(encoded, 'base64').toString()), JSON.parse(fs.readFileSync(path.join(root, '.yasakani/prompt-policy.json'))), 'CI preserves custom policy snapshot');
  assert(yaml.includes('--all') && !yaml.includes('npm install') && !yaml.includes('__PROMPT_POLICY_BASE64__'));
  const scannerEncoded = yaml.match(/YASAKANI_SCANNER_B64: (\S+)/)[1];
  const scannerHash = yaml.match(/YASAKANI_SCANNER_SHA256: (\S+)/)[1];
  assert.deepStrictEqual(Buffer.from(scannerEncoded, 'base64'), fs.readFileSync(path.join(pkg, 'src/scan.js')), 'workflow embeds exact reviewed scanner');

  // 本番 workflow の policy 適用スクリプトを実行し、全体検査の成功・停止を確認。
  const site = path.join(root, 'site');
  fs.mkdirSync(site);
  fs.mkdirSync(path.join(site, '.github/workflows'), { recursive: true });
  fs.writeFileSync(path.join(site, '.github/workflows/yasakani-security.yml'), yaml);
  const scripts = [...yaml.matchAll(/node -e '([^\n]+)'/g)].map(match => match[1]);
  const runtime = path.join(root, 'runtime');
  fs.mkdirSync(runtime);
  const environmentFile = path.join(runtime, 'github-env');
  const scannerEnv = { ...process.env, RUNNER_TEMP: runtime, GITHUB_ENV: environmentFile, YASAKANI_SCANNER_B64: scannerEncoded, YASAKANI_SCANNER_SHA256: scannerHash };
  const restored = spawnSync(process.execPath, ['-e', scripts[0]], { cwd: site, encoding: 'utf8', env: scannerEnv });
  assert.strictEqual(restored.status, 0, restored.stderr);
  const deployedScanner = fs.readFileSync(environmentFile, 'utf8').trim().slice('YASAKANI_SCANNER='.length);
  assert(deployedScanner.startsWith(runtime + path.sep), 'scanner is outside target checkout');
  assert.strictEqual(spawnSync(process.execPath, ['-e', scripts[0]], { cwd: site, env: {...scannerEnv, YASAKANI_SCANNER_SHA256: '0'.repeat(64)}, stdio: 'pipe' }).status, 1, 'snapshot mismatch fails closed');
  const script = scripts[1];
  const applied = spawnSync(process.execPath, ['-e', script], { cwd: site, encoding: 'utf8', env: { ...process.env, YASAKANI_POLICY_B64: encoded } });
  assert.strictEqual(applied.status, 0, applied.stderr);
  fs.writeFileSync(path.join(site, '.yasakani/prompt-policy.json'), '{}');
  assert.strictEqual(spawnSync(process.execPath, ['-e', script], { cwd: site, env: { ...process.env, YASAKANI_POLICY_B64: encoded } }).status, 0, 'tracked policy is replaced by reviewed snapshot');
  assert.strictEqual(fs.readFileSync(path.join(site, '.yasakani/prompt-policy.json'), 'utf8'), Buffer.from(encoded, 'base64').toString());
  const scanSite = () => spawnSync(process.execPath, [deployedScanner, '--all'], { cwd: site, encoding: 'utf8' });
  const clean = scanSite();
  assert.strictEqual(clean.status, 0, `generated workflow scans clean: ${clean.stdout} ${clean.stderr}`);
  fs.writeFileSync(path.join(site, '.env'), 'PASSWORD=demo-demo\n');
  assert.strictEqual(scanSite().status, 1, 'CI full scan rejects a secret');
  fs.writeFileSync(workflow, yaml + '# user customization\n');
  assert.strictEqual(init.wireCi(root), false, 'custom workflow is never overwritten');
  assert(fs.readFileSync(workflow, 'utf8').endsWith('# user customization\n'));
  const previous = process.cwd();
  try { process.chdir(root); uninstall.run(); } finally { process.chdir(previous); }
  assert.strictEqual(fs.readFileSync(hook, 'utf8'), '#!/bin/sh\n# user hook\nexit 0\n', 'uninstall preserves user hook at hooksPath');
  assert(fs.existsSync(workflow), 'uninstall preserves reviewed CI');
  console.log('Git hooks and generated CI regressions passed');
} finally {
  assert(root.startsWith(tmp + path.sep));
  fs.rmSync(root, { recursive: true, force: true });
}
