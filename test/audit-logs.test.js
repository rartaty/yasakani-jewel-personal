'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { analyze, loadProfile, render, parseTime } = require('../src/audit-logs');

const tmp = path.resolve(__dirname, '../.tmp');
fs.mkdirSync(tmp, { recursive: true });
const root = fs.mkdtempSync(path.join(tmp, 'audit-logs-'));
const cli = path.resolve(__dirname, '../bin/yasakani.js');
const run = args => spawnSync(process.execPath, [cli, 'audit', 'logs', ...args], { cwd: root, encoding: 'utf8' });
const rows = values => values.map(value => JSON.stringify(value)).join('\n');
const base = { timestamp: '2026-10-11T00:00:00Z', event: 'login', actor: 'synthetic-user', sourceIp: '198.51.100.1', status: 'success' };
const profile = loadProfile();

try {
  const failures = Array.from({ length: 10 }, (_, i) => ({ ...base, status: 'failure', timestamp: `2026-10-11T00:0${i < 5 ? 4 : 5}:${String(i).padStart(2, '0')}Z` }));
  const content = rows([
    // Reverse input order and cross a fixed 5-minute boundary: sliding window still detects.
    ...failures.reverse(),
    { ...base, event: 'data_read', bytes: 100 * 1024 * 1024, authorization: 'SYNTHETIC-SENSITIVE-VALUE', url: 'https://example.invalid/?sensitive=SYNTHETIC-SENSITIVE-VALUE' },
    { ...base, event: 'role_change' },
  ]);
  const report = analyze(content, profile);
  assert(/^[a-f0-9]{64}$/.test(report.input.decodedContentSha256));
  assert.notStrictEqual(report.input.decodedContentSha256, analyze(content + '\n', profile).input.decodedContentSha256);
  assert.strictEqual(report.counts.reviewed, 12);
  assert.strictEqual(report.candidates, 3);
  const bulk = report.findings.find(finding => finding.ruleId === 'logs.bulk-transfer');
  const change = report.findings.find(finding => finding.ruleId === 'logs.privilege-change');
  assert.strictEqual(bulk.evidence[0].split(':')[0], change.evidence[0].split(':')[0], 'same actor can be correlated across rules without exposing identity');
  assert.strictEqual(bulk.evidence.length, 2, 'one event has one line of evidence');
  assert(report.findings.every(finding => finding.action === 'report' && finding.verification.runtime.status === 'unverified'));
  const outputs = JSON.stringify(report) + render(report);
  for (const sensitive of ['synthetic-user', '198.51.100.1', 'SYNTHETIC-SENSITIVE-VALUE', 'example.invalid']) assert(!outputs.includes(sensitive), `redacts ${sensitive}`);
  assert(render(report).includes('実環境は未確認'));
  assert(render(report).includes('未評価'));

  const quiet = analyze(rows([{ ...base }]), profile);
  assert.strictEqual(quiet.candidates, 0);
  assert(quiet.rules.every(rule => rule.status === 'unverified'), 'no matching event is not a reviewed rule');
  assert(render(quiet).includes('対応ルールの範囲で所見なし'));
  const spread = analyze(rows(Array.from({ length: 10 }, (_, i) => ({ ...base, status: 'failure', timestamp: `2026-10-11T${String(i).padStart(2, '0')}:00:00Z` }))), profile);
  assert.strictEqual(spread.candidates, 0, 'separate windows do not accumulate');
  for (const addresses of [['2001:db8::1', '2001:0db8:0:0:0:0:0:1'], ['198.51.100.1', '::ffff:198.51.100.1']]) {
    const equivalent = analyze(rows(Array.from({ length: 10 }, (_, i) => ({ ...base, status: 'failure', sourceIp: addresses[i % 2] }))), profile);
    assert.strictEqual(equivalent.candidates, 1, 'equivalent IP representations do not split a login group');
  }
  const separate = analyze(rows([
    { ...base, event: 'data_read', bytes: 60 * 1024 * 1024 },
    { ...base, event: 'egress', bytes: 60 * 1024 * 1024 },
  ]), profile);
  assert.strictEqual(separate.candidates, 0, 'read and egress are not double counted');

  const bounded = analyze(content, profile, { since: '2026-10-11T00:04:00Z', until: '2026-10-11T00:05:09Z' });
  assert.strictEqual(bounded.counts.excluded, 2);
  assert.strictEqual(bounded.candidates, 1);
  assert.strictEqual(parseTime('2026-10-11T09:00:00+09:00'), parseTime(base.timestamp));
  for (const invalid of ['2026-02-31T00:00:00Z', '2026-10-11', '2026-10-11T00:00:00', 'today', '2026-10-11T00:00:00+99:00']) assert.strictEqual(parseTime(invalid), null);

  for (const invalid of ['', ' \n', 'SYNTHETIC-SENSITIVE-VALUE', rows([{ ...base, event: 'unknown' }]), rows([{ ...base, status: 'unknown' }]),
    rows([{ ...base, actor: '' }]), rows([{ ...base, timestamp: '2026-02-31T00:00:00Z' }]), rows([{ ...base, status: 'failure', sourceIp: undefined }]),
    rows([{ ...base, event: 'data_read' }]), rows([{ ...base, event: 'data_read', bytes: -1 }]), rows([{ ...base, event: 'data_read', bytes: '100' }]),
    rows([{ ...base }]) + '\n' + 'SYNTHETIC-SENSITIVE-VALUE']) {
    assert.throws(() => analyze(invalid, profile), error => !error.message.includes('SYNTHETIC-SENSITIVE-VALUE'));
  }
  assert.throws(() => analyze(content, profile, { since: '2026-10-12T00:00:00Z' }), /対象期間内/);
  assert.throws(() => analyze(content, profile, { since: '2026-10-12T00:00:00Z', until: base.timestamp }), /対象期間/);

  const log = path.join(root, 'events.jsonl');
  fs.writeFileSync(log, content);
  const json = run([log, '--json']);
  assert.strictEqual(json.status, 1, json.stderr);
  assert.strictEqual(JSON.parse(json.stdout).candidates, 3);
  assert(!json.stdout.includes('synthetic-user'));
  const output = path.join(root, 'review.md');
  assert.strictEqual(run([log, '--output', output]).status, 1);
  assert.strictEqual(fs.readFileSync(output, 'utf8'), render(JSON.parse(json.stdout)).replace(/点検日時: [^\n]+/, fs.readFileSync(output, 'utf8').match(/点検日時: [^\n]+/)[0]));
  const before = fs.readFileSync(output, 'utf8');
  assert.strictEqual(run([log, '--output', output]).status, 2, 'existing report is not overwritten');
  assert.strictEqual(fs.readFileSync(output, 'utf8'), before);
  fs.writeFileSync(log, rows([{ ...base }]));
  assert.strictEqual(run([log]).status, 0);
  fs.writeFileSync(log, rows([{ ...base }]) + '\n' + 'SYNTHETIC-SENSITIVE-VALUE');
  const failed = run([log, '--output', path.join(root, 'failed.md')]);
  assert.strictEqual(failed.status, 2);
  assert.strictEqual(failed.stdout, '');
  assert(!failed.stderr.includes('SYNTHETIC-SENSITIVE-VALUE'));
  assert(!fs.existsSync(path.join(root, 'failed.md')), 'no partial successful report');
  for (const args of [[], ['missing.jsonl'], [log, '--unknown'], [log, '--since'], [log, '--json', '--json']]) assert.strictEqual(run(args).status, 2);
  assert.strictEqual(run([root]).status, 2, 'rejects nonregular files before opening');
  const originalStat = fs.lstatSync;
  const originalOpen = fs.openSync;
  let opened = false;
  try {
    fs.lstatSync = () => ({ isSymbolicLink: () => false, isFile: () => false, size: 0 });
    fs.openSync = () => { opened = true; throw new Error('must not open a FIFO'); };
    assert.throws(() => loadProfile('synthetic-fifo'), /profile/);
    assert.strictEqual(opened, false, 'nonregular input is refused before a potentially blocking open');
    fs.lstatSync = () => ({ isSymbolicLink: () => true });
    assert.throws(() => loadProfile('synthetic-symlink'), /profile/);
    assert.strictEqual(opened, false, 'symlink input is refused before open');
  } finally { fs.lstatSync = originalStat; fs.openSync = originalOpen; }

  const mapped = path.join(root, 'profile.json');
  fs.writeFileSync(mapped, JSON.stringify({ fields: { timestamp: 'time', event: 'operation', actor: 'principal', sourceIp: 'ip', status: 'result', bytes: 'size' },
    events: { export: 'data_read' }, statuses: { ok: 'success' }, thresholds: { dataReadBytes: 100 } }));
  fs.writeFileSync(log, rows([{ time: base.timestamp, operation: 'export', principal: 'SYNTHETIC-SENSITIVE-VALUE', result: 'ok', size: 100 }]));
  const mappedResult = run([log, '--profile', mapped, '--json']);
  assert.strictEqual(mappedResult.status, 1, mappedResult.stderr);
  assert.strictEqual(JSON.parse(mappedResult.stdout).candidates, 1);
  assert(!mappedResult.stdout.includes('SYNTHETIC-SENSITIVE-VALUE'));
  for (const value of [{ thresholds: { dataReadBytes: 0 } }, { thresholds: { typo: 1 } }, { fields: { token: 'authorization' } }, { events: { event: 'unknown' } }, { statuses: { ok: 'maybe' } }, { unknown: 'SYNTHETIC-SENSITIVE-VALUE' }, []]) {
    fs.writeFileSync(mapped, JSON.stringify(value));
    const invalidProfile = run([log, '--profile', mapped]);
    assert.strictEqual(invalidProfile.status, 2);
    assert(!invalidProfile.stderr.includes('SYNTHETIC-SENSITIVE-VALUE'));
  }
  fs.writeFileSync(log, Buffer.from([0xff, 0xff]));
  assert.strictEqual(run([log]).status, 2);
  fs.writeFileSync(log, Buffer.from([0, 1]));
  assert.strictEqual(run([log]).status, 2);
  fs.writeFileSync(log, ' '.repeat(20 * 1024 * 1024 + 1));
  assert.strictEqual(run([log]).status, 2);
  assert.throws(() => analyze(Array.from({ length: 50001 }, () => JSON.stringify(base)).join('\n'), profile), /上限/);
  const manyChanges = analyze(rows(Array.from({ length: 201 }, (_, i) => ({ ...base, event: 'role_change', actor: `synthetic-${i}` }))), profile);
  assert.strictEqual(manyChanges.candidates, 201);
  assert.strictEqual(manyChanges.findings.length, 200);
  assert.strictEqual(manyChanges.omitted, 1);
  console.log('audit logs tests passed (parser, windows, coverage, redaction, CLI, output, profiles, limits)');
} finally {
  assert(root.startsWith(tmp + path.sep), 'cleanup stays inside test workspace');
  fs.rmSync(root, { recursive: true, force: true });
}
