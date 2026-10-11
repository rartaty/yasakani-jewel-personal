'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const cli = path.resolve(__dirname, '../bin/yasakani.js');
const tmp = path.resolve(__dirname, '../.tmp');
fs.mkdirSync(tmp, { recursive: true });
const root = fs.mkdtempSync(path.join(tmp, 'scan-modes-'));
const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString('utf8');
const run = (args, cwd = root) => spawnSync(process.execPath, [cli, 'scan', ...args], {
  cwd, encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: tmp },
});
function expect(args, status, message, cwd) {
  const result = run(args, cwd);
  assert.strictEqual(result.status, status, `${message}: ${result.stdout} ${result.stderr}`);
}
function write(file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

try {
  git(['init', '-q']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'user.email', 'test@example.invalid']);
  write('.gitignore', '.env\n');
  write('safe.js', 'const value = 1;\n');
  git(['add', '.']);
  expect(['--staged'], 0, 'clean staged files');
  git(['commit', '-qm', 'baseline']);
  expect(['--all'], 0, 'clean full scan');
  expect(['--history'], 0, 'clean history');

  const ignored = write('.env', 'PASSWORD=demo-demo\n');
  fs.utimesSync(ignored, new Date(0), new Date(0));
  expect(['--all'], 1, 'old ignored secret is included');
  fs.unlinkSync(ignored);
  const untracked = write('untracked.jsx', 'const password = "demo-demo";\n');
  expect([], 1, 'default scan includes untracked source with any extension');
  expect(['--staged'], 0, 'staged scan ignores untracked source');
  fs.unlinkSync(untracked);

  write('safe.js', 'const password = "demo-demo";\n');
  git(['add', 'safe.js']);
  write('safe.js', 'const value = 1;\n');
  expect(['--staged'], 1, 'scans index rather than clean worktree');
  expect(['safe.js'], 0, 'explicit scan reads clean worktree');
  git(['add', 'safe.js']);
  write('safe.js', 'const password = "demo-demo";\n');
  expect(['--staged'], 0, 'empty index does not fall back to worktree');
  expect([], 1, 'default scans tracked unstaged content');
  git(['add', 'safe.js']);
  git(['commit', '-qm', 'synthetic secret']);
  write('safe.js', 'const value = 1;\n');
  git(['add', 'safe.js']);
  git(['commit', '-qm', 'remove synthetic secret']);
  expect(['--all'], 0, 'clean current tree');
  expect(['--history'], 1, 'removed secret remains in history');

  const utf16 = write('utf16.env', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('PASSWORD=demo-demo\n', 'utf16le')]));
  expect(['utf16.env'], 1, 'UTF-16 secret is inspected');
  fs.unlinkSync(utf16);
  write('binary.env', Buffer.from([0, 1, 2]));
  expect(['binary.env'], 2, 'binary source cannot be passed as clean');
  fs.unlinkSync(path.join(root, 'binary.env'));

  write('prompts/public/example.md', '# Public System Prompt\nconst password = "demo-demo";\n');
  expect(['prompts/public/example.md'], 1, 'public notice never suppresses secret finding');
  expect(['--all', 'missing'], 2, 'missing full scan target fails');
  expect(['missing.js'], 2, 'missing explicit file fails');
  expect(['--unknown'], 2, 'unknown option fails');
  expect(['--staged', 'safe.js'], 2, 'invalid option combination fails');
  const oid = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: 'safe.js\n' }).toString('utf8').trim();
  git(['update-index', '--add', '--cacheinfo', `120000,${oid},safe.js`]);
  expect(['--staged'], 2, 'type change to symlink is not ignored');
  git(['add', 'safe.js']);
  write('.yasakani/prompt-policy.json', '{not JSON}');
  expect(['safe.js'], 2, 'malformed policy fails closed');
  fs.unlinkSync(path.join(root, '.yasakani/prompt-policy.json'));
  const nongit = fs.mkdtempSync(path.join(tmp, 'nongit-'));
  try {
    expect(['--staged'], 2, 'staged mode requires a repository', nongit);
    expect(['--history'], 2, 'history mode requires a repository', nongit);
  } finally {
    assert(nongit.startsWith(tmp + path.sep));
    fs.rmSync(nongit, { recursive: true, force: true });
  }
  console.log('scan modes: full / index / history / error regressions passed');
} finally {
  assert(root.startsWith(tmp + path.sep), 'cleanup stays inside test workspace');
  fs.rmSync(root, { recursive: true, force: true });
}
