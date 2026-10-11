'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { normalizeFinding, CATEGORIES, formatVerification } = require('./findings');

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_RECORDS = 50000;
const EVENTS = ['login', 'data_read', 'egress', 'account_create', 'account_enable', 'role_change'];
const FIELDS = ['timestamp', 'event', 'actor', 'sourceIp', 'status', 'bytes'];
const DEFAULT_THRESHOLDS = { windowSeconds: 300, loginFailures: 10, dataReadCount: 1000, dataReadBytes: 100 * 1024 * 1024 };

function fail(message) { throw new Error(message); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }

function readLocal(file, limit) {
  let fd;
  try {
    const before = fs.lstatSync(file);
    if (before.isSymbolicLink()) fail('入力にシンボリックリンクは使用できません。');
    if (!before.isFile() || before.size > limit) fail('入力はサイズ上限内の通常ファイルにしてください。');
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit || before.dev !== stat.dev || before.ino !== stat.ino) fail('入力はサイズ上限内の同じ通常ファイルにしてください。');
    const buffer = fs.readFileSync(fd);
    if (buffer.length > limit || buffer.includes(0)) fail('入力サイズまたはテキスト形式が不正です。');
    // Reject invalid UTF-8 instead of silently replacing bytes.
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch (error) {
    if (error.message.startsWith('入力')) throw error;
    fail('入力を読み取れません。通常の UTF-8 ファイルを確認してください。');
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function parseTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const offset = /([+-])(\d{2}):(\d{2})$/.exec(value);
  const minutes = offset ? (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1) : 0;
  if (offset && (Number(offset[2]) > 23 || Number(offset[3]) > 59)) return null;
  if (new Date(time + minutes * 60000).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  return time;
}

function loadProfile(file) {
  let input = {};
  if (file) {
    try { input = JSON.parse(readLocal(file, 1024 * 1024)); }
    catch (_) { fail('profile を読み取れません。通常の UTF-8 JSON を確認してください。'); }
  }
  if (!isObject(input) || Object.keys(input).some(key => !['fields', 'events', 'statuses', 'thresholds'].includes(key))) fail('profile の項目が不正です。');
  const profile = { fields: Object.fromEntries(FIELDS.map(key => [key, key])), events: Object.fromEntries(EVENTS.map(key => [key, key])),
    statuses: { success: 'success', failure: 'failure' }, thresholds: { ...DEFAULT_THRESHOLDS } };
  for (const group of ['fields', 'events', 'statuses', 'thresholds']) {
    if (!own(input, group)) continue;
    if (!isObject(input[group])) fail('profile の項目が不正です。');
    for (const [key, value] of Object.entries(input[group])) {
      if (group === 'fields' && (!FIELDS.includes(key) || typeof value !== 'string' || !value || value.length > 128)) fail('profile の fields が不正です。');
      if (group === 'events' && (!key || key.length > 128 || !EVENTS.includes(value))) fail('profile の events が不正です。');
      if (group === 'statuses' && (!key || key.length > 128 || !['success', 'failure'].includes(value))) fail('profile の statuses が不正です。');
      if (group === 'thresholds' && (!own(DEFAULT_THRESHOLDS, key) || !Number.isSafeInteger(value) || value < 1 || value > 1e12)) fail('profile の thresholds が不正です。');
    }
    profile[group] = Object.assign(Object.create(null), profile[group], input[group]);
  }
  return profile;
}

function normalizeRecord(raw, profile, line) {
  const invalid = () => fail(`ログ ${line} 行目: 必須項目、日時、event、status または値の形式が不正です。`);
  if (!isObject(raw)) invalid();
  const get = key => own(raw, profile.fields[key]) ? raw[profile.fields[key]] : undefined;
  const timestamp = parseTime(get('timestamp'));
  const eventKey = get('event');
  const statusKey = get('status');
  const event = typeof eventKey === 'string' && own(profile.events, eventKey) ? profile.events[eventKey] : null;
  const status = (typeof statusKey === 'string' || typeof statusKey === 'number') && own(profile.statuses, String(statusKey)) ? profile.statuses[String(statusKey)] : null;
  const actor = get('actor');
  let sourceIp = get('sourceIp');
  if (timestamp === null || !event || !status || typeof actor !== 'string' || !actor.trim() || actor.length > 256) invalid();
  if (sourceIp !== undefined && (typeof sourceIp !== 'string' || !net.isIP(sourceIp))) invalid();
  if (sourceIp !== undefined && net.isIP(sourceIp) === 6) {
    try { sourceIp = new URL(`http://[${sourceIp}]/`).hostname.slice(1, -1); }
    catch (_) { invalid(); }
    const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(sourceIp);
    if (mapped) {
      const high = parseInt(mapped[1], 16);
      const low = parseInt(mapped[2], 16);
      sourceIp = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }
  }
  if (event === 'login' && status === 'failure' && sourceIp === undefined) invalid();
  const bytes = get('bytes');
  if (bytes !== undefined && (!Number.isSafeInteger(bytes) || bytes < 0)) invalid();
  if (['data_read', 'egress'].includes(event) && status === 'success' && bytes === undefined) invalid();
  return { timestamp, event, status, actor, sourceIp, bytes: bytes || 0, line };
}

function analyze(content, profile, options = {}) {
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_BYTES) fail('入力サイズまたはテキスト形式が不正です。');
  const records = [];
  let total = 0;
  let excluded = 0;
  let blank = 0;
  const since = options.since === undefined ? -Infinity : parseTime(options.since);
  const until = options.until === undefined ? Infinity : parseTime(options.until);
  if (since === null || until === null || since > until) fail('対象期間は timezone 付き ISO 日時で開始から終了の順に指定してください。');
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) { blank++; continue; }
    if (++total > MAX_RECORDS) fail('ログ件数が上限を超えました。');
    let raw;
    try { raw = JSON.parse(lines[i]); } catch (_) { fail(`ログ ${i + 1} 行目: JSON Lines として解析できません。`); }
    const record = normalizeRecord(raw, profile, i + 1);
    if (record.timestamp < since || record.timestamp > until) excluded++;
    else records.push(record);
  }
  if (!total) fail('ログが空のため点検できません。');
  if (!records.length) fail('対象期間内のログがないため点検できません。');
  records.sort((a, b) => a.timestamp - b.timestamp || a.line - b.line);
  const candidates = [];
  const groups = new Map();
  const labels = new Map();
  const label = key => { if (!labels.has(key)) labels.set(key, `対象${labels.size + 1}`); return labels.get(key); };
  const eligible = { 'logs.login-failures': 0, 'logs.bulk-transfer': 0, 'logs.privilege-change': 0 };
  const changes = new Map();
  const thresholds = profile.thresholds;
  for (const record of records) {
    if (record.status === 'success' && ['account_create', 'account_enable', 'role_change'].includes(record.event)) {
      eligible['logs.privilege-change']++;
      const key = JSON.stringify([record.event, record.actor]);
      if (!changes.has(key)) changes.set(key, { ruleId: 'logs.privilege-change', title: 'アカウント作成・再有効化・権限変更の確認', records: [], count: 0, target: label(JSON.stringify(['actor', record.actor])), event: record.event });
      const change = changes.get(key);
      change.count++;
      if (change.records.length < 3) change.records.push(record);
      continue;
    }
    const failedLogin = record.event === 'login' && record.status === 'failure';
    const transfer = ['data_read', 'egress'].includes(record.event) && record.status === 'success';
    if (!failedLogin && !transfer) continue;
    const ruleId = failedLogin ? 'logs.login-failures' : 'logs.bulk-transfer';
    eligible[ruleId]++;
    const key = JSON.stringify([ruleId, record.event, failedLogin ? record.sourceIp : record.actor]);
    if (!groups.has(key)) groups.set(key, { queue: [], head: 0, bytes: 0, found: false,
      target: label(JSON.stringify(failedLogin ? ['source', record.sourceIp] : ['actor', record.actor])) });
    const group = groups.get(key);
    // A single candidate per group suffices; retain no growing queue after detection.
    if (group.found) continue;
    group.queue.push(record);
    group.bytes += record.bytes;
    while (group.queue[group.head].timestamp < record.timestamp - thresholds.windowSeconds * 1000) {
      group.bytes -= group.queue[group.head++].bytes;
    }
    const count = group.queue.length - group.head;
    const exceeded = failedLogin ? count >= thresholds.loginFailures : count >= thresholds.dataReadCount || group.bytes >= thresholds.dataReadBytes;
    if (exceeded) {
      candidates.push({ ruleId, title: failedLogin ? 'ログイン失敗の集中' : '短時間の大量取得・外部転送', target: group.target, count, bytes: failedLogin ? undefined : group.bytes,
        records: count === 1 ? [record] : [group.queue[group.head], record] });
      group.found = true;
      group.queue = [];
    }
  }
  candidates.push(...changes.values());
  const findings = candidates.slice(0, 200).map(item => normalizeFinding({
    category: CATEGORIES.INCIDENT, ruleId: item.ruleId, title: item.title, location: { path: '入力ログ', line: item.records[0].line },
    severity: 'medium', action: 'report', falsePositiveLikelihood: 'unknown',
    evidence: [`${item.target}: ${item.count} 件${item.bytes === undefined ? '' : ` / ${item.bytes} bytes`}${item.event ? ` / ${item.event}` : ''}`,
      ...item.records.map(record => `行 ${record.line} / ${new Date(record.timestamp).toISOString()}`)],
    sources: ['提供された JSON Lines ログ'], remediation: item.ruleId === 'logs.privilege-change'
      ? '承認済みの操作か、変更の対象と担当者を元ログで照合してください。'
      : '元ログと通常時の利用状況を比較し、主体・送信元・操作の妥当性を確認してください。異常が確認できた場合は担当者へ連絡し、証拠保全と対象サービスでの失効・隔離を検討してください。',
  }));
  return { checkedAt: new Date().toISOString(), input: { format: 'UTF-8 JSON Lines',
    decodedContentSha256: crypto.createHash('sha256').update(content).digest('hex'),
    profileSha256: crypto.createHash('sha256').update(JSON.stringify(profile)).digest('hex') },
    counts: { total, parsed: total, reviewed: records.length, excluded, blank },
    period: { first: new Date(records[0].timestamp).toISOString(), last: new Date(records[records.length - 1].timestamp).toISOString(),
      since: Number.isFinite(since) ? new Date(since).toISOString() : null, until: Number.isFinite(until) ? new Date(until).toISOString() : null },
    thresholds: { ...thresholds }, rules: Object.entries(eligible).map(([ruleId, count]) => ({ ruleId, eligible: count, status: count ? 'reviewed' : 'unverified' })),
    findings, candidates: candidates.length, omitted: Math.max(0, candidates.length - findings.length),
    verification: normalizeFinding({}).verification };
}

function render(report) {
  const rows = ['# Yasakani 外部ログ点検', '', `点検日時: ${report.checkedAt}`, `確認範囲: 提供ログを点検済み。${formatVerification(report.verification)}`, '',
    report.candidates ? `調査候補: ${report.candidates} 件（表示 ${report.findings.length} 件、省略 ${report.omitted} 件）` : '提供ログの対応ルールの範囲で所見なし。',
    'ログの完全性・真正性や現在の実環境、漏洩の有無は未検証です。', '',
    `入力: ${report.input.format} / デコード後テキスト SHA-256: ${report.input.decodedContentSha256}`,
    `profile SHA-256: ${report.input.profileSha256}`, '',
    `読取 ${report.counts.total} / 解析 ${report.counts.parsed} / 対象期間内 ${report.counts.reviewed} / 期間外 ${report.counts.excluded} / 空行 ${report.counts.blank}`,
    `ログ日時範囲 (UTC): ${report.period.first} ～ ${report.period.last}`,
    `指定期間 (UTC、両端含む): ${report.period.since || '指定なし'} ～ ${report.period.until || '指定なし'}`, '',
    `判定窓: ${report.thresholds.windowSeconds} 秒 / login 失敗: ${report.thresholds.loginFailures} 件 / 取得・転送: ${report.thresholds.dataReadCount} 件または ${report.thresholds.dataReadBytes} bytes`, '',
    '| ルール | 対象件数 | 確認状態 |', '|---|---|---|',
    ...report.rules.map(rule => `| ${rule.ruleId} | ${rule.eligible} | ${rule.status === 'reviewed' ? '提供ログを点検済み' : '未検証（該当ログなし）'} |`), '',
    '## 調査候補（非ブロック）', '',
  ];
  for (const finding of report.findings) rows.push(`### ${finding.title}`, '', `確認範囲: ${formatVerification(finding.verification)}`, '誤検知可能性: 未評価。侵害を断定する所見ではありません。',
    ...finding.evidence.map(item => `- ${item}`), '', finding.remediation, '');
  rows.push('## 対象外・未検証', '', '継続監視・通信遮断・鍵失効・MFA 登録状態・現在の公開設定・API 認可・脆弱性管理・ログの欠落・通常時の基準との比較は未検証です。',
    'アカウント・IP・URL・秘密値・生ログはレポートへ出力しません。対象番号は今回の点検内だけで有効です。調査は行番号と日時から元ログで行ってください。',
    'OSI: L1～L4 と実時間の通信監視は対象外。提供ログの対応 event の事後点検に限ります。', '');
  return rows.join('\n');
}

function saveReport(file, content) {
  let fd;
  try {
    const parent = path.dirname(path.resolve(file));
    if (fs.realpathSync(parent) !== parent) fail('保存先の親ディレクトリにリンクは使用できません。');
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, content, 'utf8');
  } catch (_) { fail('レポートを保存できません。既存ファイル・リンク・保存先ディレクトリを確認してください。'); }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

function run(args) {
  try {
    const options = {};
    let input;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (['--profile', '--since', '--until', '--output'].includes(arg)) {
        const key = arg.slice(2);
        if (own(options, key) || !args[i + 1] || args[i + 1].startsWith('--')) fail('オプションの値または指定回数が不正です。');
        options[key] = args[++i];
      } else if (arg === '--json' && !options.json) options.json = true;
      else if (arg.startsWith('-') || input !== undefined) fail('不明または重複した引数です。');
      else input = arg;
    }
    if (!input) fail('audit logs に JSON Lines ファイルを指定してください。');
    const report = analyze(readLocal(input, MAX_BYTES), loadProfile(options.profile), options);
    const output = options.json ? JSON.stringify(report, null, 2) + '\n' : render(report);
    if (options.output) saveReport(options.output, output);
    console.log(output);
    process.exitCode = report.candidates ? 1 : 0;
  } catch (error) { console.error(`[Yasakani ログ点検] 検査失敗: ${error.message}`); process.exitCode = 2; }
}

module.exports = { run, analyze, loadProfile, render, parseTime };
