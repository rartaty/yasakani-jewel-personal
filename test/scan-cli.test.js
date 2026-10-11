'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const scan = require('../src/scan');

const cli = path.resolve(__dirname, '../bin/yasakani.js');
const tmp = path.resolve(__dirname, '../.tmp');
fs.mkdirSync(tmp, { recursive: true });
const root = fs.mkdtempSync(path.join(tmp, 'scan-cli-'));
const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
const run = args => spawnSync(process.execPath, [cli, 'scan', ...args], { cwd: root, encoding: 'utf8' });
let previous;

try {
  git(['init', '-q']);
  const cases = [
    ['.env', 'PASSWORD=demo-demo\n', 1],
    ['.env.local', 'API_KEY=demo-demo\n', 1],
    ['config.json', '{"password":"demo-demo"}\n', 1],
    ['config.yml', 'password: demo-demo\n', 1],
    ['config.yml', '- password: demo-demo\n', 1],
    ['.env', '# PASSWORD=demo-demo\n', 1],
    ['.env', 'PASSWORD=null-demo\n', 1],
    ['.env', "PASSWORD='$LOCAL_VALUE'\n", 1],
    ['comment.js', '// const password = "demo-demo";\n', 1],
    ['package.json', '{"password":"demo-demo"}\n', 1],
    ['prompts/private/agent.md', 'あなたは社内専用の監査担当です。\n', 1],
    ['prompts/private/empty.md', '', 1],
    ['prompts/private/agent.txt', '社内専用\n', 1],
    ['agent.system-prompt.md', '社内専用\n', 1],
    ['prompts/public/agent.system-prompt.md', '社内専用\n', 1],
    ['日本語.md', '# Agent System Prompt\n', 1],
    ['prompts/public/example.md', '# Public System Prompt\n', 0],
    ['.env', 'PASSWORD=${LOCAL_VALUE}\n', 0],
    ['.env', 'PASSWORD="${LOCAL_VALUE}"\n', 0],
    ['.env', 'PASSWORD=""\n', 0],
    ['.env', 'PASSWORD=null\n', 0],
    ['safe.js', 'const authorName = "Jane";\n', 0],
  ];
  for (const [file, content, status] of cases) {
    if (previous && fs.existsSync(path.join(root, previous))) fs.unlinkSync(path.join(root, previous));
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    git(['add', '-A']);
    const staged = run([]);
    assert.strictEqual(staged.status, status, `staged ${file}: ${staged.stdout} ${staged.stderr}`);
    // private path は拡張子に関係なく検査する。
    const explicit = run([file]);
    assert.strictEqual(explicit.status, status, `file ${file}: ${explicit.stdout} ${explicit.stderr}`);
    previous = file;
  }
  assert(!scan.findPii('氏名: 架空太郎').includes('架空太郎'), 'does not print a labeled name');
  const entropy = scan.findHighEntropyLiteral('const k = "aB3dE5gH7jK9mN2pQ4rS6tU8vW";');
  assert(entropy && !entropy.includes('aB3dE'), 'does not print a secret prefix');
  console.log(`scan CLI regressions passed (${cases.length} staged + explicit cases)`);
} finally {
  assert(root.startsWith(tmp + path.sep), 'cleanup stays inside test workspace');
  fs.rmSync(root, { recursive: true, force: true });
}
