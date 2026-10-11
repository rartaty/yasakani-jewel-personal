'use strict';

/**
 * 🔮 Yasakani Jewel - Security Pre-Filter Scanner (Zero Daemon / Zero Dependency)
 *
 * Git 差分または変更ファイルから「AI 監査が必要な兆候」のみをコンマ秒で検知する。
 * `yasakani scan` から呼ばれるほか、init により各プロジェクトの
 * `.yasakani/scan.js` へコピーされ、git フック・保存時スキャンから直接実行される。
 *
 * 出力方針: クリーン時は完全サイレント。懸念検知時のみ警告を出し exit 1。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 識別子の構成単語 (camelCase / snake_case 分割後) と完全一致で照合するキーワード。
// 部分一致 ("author" が "auth" に当たる等) による誤検知を避けるための分類。
const WORD_KEYWORDS = ['secret', 'password', 'passwd', 'token', 'authorization', 'bearer', 'credential'];

// 区切り文字込みで十分に具体的な句。行内の部分一致で照合してよい。
const PHRASE_KEYWORDS = ['api_key', 'apikey', 'api-key', 'private_key', 'privatekey', 'secret_key', 'access_key', 'process.env'];

const PII_LABEL_PATTERN = /(?:^|[^A-Za-z0-9_])(?:氏名|名前|本名|住所|所在地|連絡先|電話番号|携帯番号|メールアドレス|メール|email|e-mail|mail|address|full[_-]?name|real[_-]?name|phone|tel|mobile)\s*[:=：]\s*(["'`])?[^"'`\s,;{}[\]]{2,}/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const JP_PHONE_PATTERN = /(?<![A-Za-z0-9])(?:\+81[-\s]?)?(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}|0[789]0[-\s]?\d{4}[-\s]?\d{4})(?![A-Za-z0-9])/;
const JP_POSTAL_PATTERN = /(?<![A-Za-z0-9])〒?\s*\d{3}-?\d{4}(?![A-Za-z0-9])/;
const JP_ADDRESS_PATTERN = /(?:都|道|府|県).{0,30}(?:市|区|町|村).{0,40}(?:丁目|番地|番|号|[0-9０-９]-[0-9０-９])/;

const SCAN_EXTS = ['.js', '.ts', '.py', '.json', '.env', '.yml', '.yaml', '.md', '.mdx'];
const SKIP_DIRS = ['node_modules', '.git', '.yasakani'];

const PROMPT_INSTRUCTION_PATTERNS = [
  [/^#\s+.*\b(?:system|developer)\s+prompt\b/i, 'AI system/developer prompt 形式の Markdown'],
  [/^#{1,3}\s*(?:Tool Definitions|Identity Preamble|User Context|available_skills|network_configuration|filesystem_configuration)\b/i, 'AI 実行環境・ツール定義らしきセクション'],
  [/\b(?:SYSTEM OVERRIDE|Ignore previous instructions?|ignore (?:all )?(?:previous|prior) (?:instructions|rules)|do not follow (?:previous|prior) instructions)\b/i, 'プロンプトインジェクション指示'],
  [/\{antml:[A-Za-z_]+\}/, 'Claude 内部ブロック風マーカー'],
  [/\/mnt\/skills\/(?:public|private|examples)\//i, '実行環境の skill パスらしき記述'],
  [/\bAllowed Domains:\s*.+/i, 'ネットワーク許可ドメイン設定らしき記述'],
  [/api\.anthropic\.com\/v1\/messages/i, 'Anthropic API 呼び出し例を含むプロンプト断片'],
];

const DEFAULT_PROMPT_POLICY = {
  public_notice: ['prompts/public/**', '**/prompts/public/**'],
  private_block: [
    'prompts/private/**',
    '**/prompts/private/**',
    'private/system-prompt.md',
    'private/**/system-prompt.md',
    '**/private/system-prompt.md',
    '**/private/**/system-prompt.md',
  ],
  system_prompt_block: ['**/*.system-prompt.md'],
  unknown_prompt: 'block',
};

// シャノン・エントロピー (ランダムなシークレット文字列の検知用)
function calculateEntropy(str) {
  const len = str.length;
  if (len === 0) return 0;
  const freq = {};
  for (let i = 0; i < len; i++) freq[str[i]] = (freq[str[i]] || 0) + 1;
  let entropy = 0;
  for (const ch in freq) {
    const p = freq[ch] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// 行を識別子の構成単語へ分解する。
// 英数字以外で分割し、さらに camelCase 境界で分割して小文字化する。
// 例: 'const authToken = ...' -> ['const', 'auth', 'token']
function splitToWords(line) {
  const out = [];
  for (const tok of line.split(/[^A-Za-z0-9]+/)) {
    if (!tok) continue;
    for (const part of tok.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ')) {
      if (part) out.push(part.toLowerCase());
    }
  }
  return out;
}

// キーワード検知。
// 「セキュリティ・キーワードが、文字列リテラルと同一行に在る」場合のみ検知する。
// 単なる識別子の行 (`function getToken(){}`) や、リテラル内にだけ語が在る行
// (`console.log("...password...")`) を誤検知しないため、キーワードはリテラル本体を
// 伏せた「コード部分」に対して照合する。ハードコードされた秘密情報の検出が狙い。
function keywordInCode(code) {
  const lower = code.toLowerCase();
  for (const ph of PHRASE_KEYWORDS) {
    if (lower.includes(ph)) return ph;
  }
  const words = new Set(splitToWords(code));
  return WORD_KEYWORDS.find(kw => words.has(kw)) || null;
}

function findKeyword(line, file) {
  // dotenv / YAML の引用符なし scalar。環境変数参照と空値は秘密値ではない。
  if (isEnvFile(file) || /\.(?:env|ya?ml)$/i.test(file || '')) {
    const assignment = line.match(/^(?:(?:#|\/\/|\*)\s*)?(?:-\s*)?(?:export\s+)?([A-Za-z_][\w.-]*)\s*[:=]\s*(.+)$/);
    if (assignment) {
      const value = assignment[2].trim();
      const keyword = keywordInCode(assignment[1]);
      if (keyword) {
        const reference = '(?:\\$[A-Za-z_][A-Za-z0-9_]*|\\$\\{[A-Za-z_][A-Za-z0-9_]*\\})';
        if (/^#/.test(value) || /^(?:null|~)\s*(?:#.*)?$/i.test(value) ||
            new RegExp(`^(?:${reference}|"${reference}")\\s*(?:#.*)?$`).test(value) ||
            /^["'`]\s*["'`]\s*(?:#.*)?$/.test(value)) return null;
        return keyword;
      }
    }
  }
  const literals = line.match(/(["'`])(.*?)\1/g);
  if (!literals) return null; // 文字列リテラルが無い行はキーワード単独では検知しない
  // JSON / object の引用符付きキーは残し、値だけを伏せる。
  const code = line.replace(/(["'`])(.*?)\1/g, (literal, quote, body, offset) =>
    /^\s*:/.test(line.slice(offset + literal.length)) ? body : quote + quote);
  return keywordInCode(code);
}

// 高エントロピー文字列 (APIキー等) の検知
function findHighEntropyLiteral(line) {
  const literals = line.match(/(["'`])(.*?)\1/g);
  if (!literals) return null;
  for (const lit of literals) {
    const raw = lit.slice(1, -1);
    if (/\s/.test(raw)) continue;
    if (/[^\x20-\x7E]/.test(raw)) continue;
    // shell の変数から導出したパスは静的な各パス要素を検査する。
    // 変数名＋区切りのエントロピーで一括誤検知しない。
    const candidates = /^\$(?:[A-Za-z_]\w*|\{[A-Za-z_]\w*\})\//.test(raw)
      ? raw.split('/').slice(1) : [raw];
    for (const candidate of candidates) {
      if (candidate.length < 16) continue;
      const e = calculateEntropy(candidate);
      if (e > 3.8) {
        return `極めてランダムな文字列 (シークレットの疑い): [redacted] (ランダム度 ${e.toFixed(2)})`;
      }
    }
  }
  return null;
}

function maskPiiSample(sample) {
  return sample
    .replace(EMAIL_PATTERN, '[email]')
    .replace(JP_PHONE_PATTERN, '[phone]')
    .replace(JP_POSTAL_PATTERN, '[postal]')
    .replace(JP_ADDRESS_PATTERN, '[address]')
    .replace(/(["'`]).*?\1/g, '$1[value]$1');
}

function findPii(line) {
  const email = line.match(EMAIL_PATTERN);
  if (email) return `個人情報の可能性: メールアドレス ${maskPiiSample(email[0])}`;

  const phone = line.match(JP_PHONE_PATTERN);
  if (phone) return `個人情報の可能性: 電話番号 ${maskPiiSample(phone[0])}`;

  const postal = line.match(JP_POSTAL_PATTERN);
  if (postal) return `個人情報の可能性: 郵便番号 ${maskPiiSample(postal[0])}`;

  const address = line.match(JP_ADDRESS_PATTERN);
  if (address) return `個人情報の可能性: 住所 ${maskPiiSample(address[0])}`;

  const labeled = line.match(PII_LABEL_PATTERN);
  if (labeled) return '個人情報の可能性: ラベル付き個人情報 [value]';

  return null;
}

function isMarkdownFile(file) {
  return ['.md', '.mdx'].includes(path.extname(file || '').toLowerCase());
}

function isEnvFile(file) {
  const base = path.basename(file || '').toLowerCase();
  return base === '.env' || base.startsWith('.env.');
}

function isScannableFile(file) {
  return isEnvFile(file) || SCAN_EXTS.includes(path.extname(file || '').toLowerCase());
}

function stripMarkdownInlineCode(line) {
  return line.replace(/`[^`\n]*`/g, '');
}

function normalizePolicyPath(file) {
  if (!file) return '';
  let p = String(file);
  try {
    const resolved = path.resolve(file);
    const policyPath = getPromptPolicyPath();
    const root = policyPath && path.basename(path.dirname(policyPath)) === '.yasakani'
      ? path.dirname(path.dirname(policyPath)) : process.cwd();
    const rel = path.relative(root, resolved);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) p = rel;
  } catch (e) {
    // Keep the original path when resolution is not possible.
  }
  return p.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function escapeRegexChar(ch) {
  return /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

function globToRegExp(pattern) {
  const p = String(pattern || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  let out = '^';
  for (let i = 0; i < p.length;) {
    if (p.startsWith('**/', i)) {
      out += '(?:.*/)?';
      i += 3;
    } else if (p.startsWith('/**/', i)) {
      out += '(?:/.*)?/';
      i += 4;
    } else if (p.startsWith('/**', i) && i + 3 === p.length) {
      out += '(?:/.*)?';
      i += 3;
    } else if (p.startsWith('**', i)) {
      out += '.*';
      i += 2;
    } else if (p[i] === '*') {
      out += '[^/]*';
      i++;
    } else if (p[i] === '?') {
      out += '[^/]';
      i++;
    } else {
      out += escapeRegexChar(p[i]);
      i++;
    }
  }
  return new RegExp(out + '$');
}

function matchesAnyPolicyPath(file, patterns) {
  const target = normalizePolicyPath(file);
  return (patterns || []).some(pattern => globToRegExp(pattern).test(target));
}

function arrayOrDefault(value, fallback) {
  return Array.isArray(value) ? value.filter(v => typeof v === 'string' && v.trim()) : fallback;
}

function findPromptPolicyPath(startDir) {
  let dir;
  try { dir = path.resolve(startDir || process.cwd()); }
  catch (e) { return null; }

  while (true) {
    const candidate = path.join(dir, '.yasakani', 'prompt-policy.json');
    if (fs.existsSync(candidate)) return candidate;

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function getPromptPolicyPath() {
  const localPolicyPath = path.join(__dirname, 'prompt-policy.json');
  if (fs.existsSync(localPolicyPath)) return localPolicyPath;
  return findPromptPolicyPath(process.cwd());
}

function loadPromptPolicy() {
  const policyPath = getPromptPolicyPath();
  if (!policyPath) return DEFAULT_PROMPT_POLICY;
  const raw = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid prompt policy');
  for (const key of ['public_notice', 'publicNotice', 'private_block', 'privateBlock', 'system_prompt_block', 'systemPromptBlock']) {
    if (raw[key] !== undefined && (!Array.isArray(raw[key]) || raw[key].some(v => typeof v !== 'string' || !v.trim()))) throw new Error('Invalid prompt path rule');
  }
  for (const key of ['unknown_prompt', 'unknownPrompt']) {
    if (raw[key] !== undefined && !['block', 'notice'].includes(raw[key])) throw new Error('Invalid prompt action');
  }
  return {
    public_notice: arrayOrDefault(raw.public_notice || raw.publicNotice, DEFAULT_PROMPT_POLICY.public_notice),
    private_block: arrayOrDefault(raw.private_block || raw.privateBlock, DEFAULT_PROMPT_POLICY.private_block),
    system_prompt_block: arrayOrDefault(raw.system_prompt_block || raw.systemPromptBlock, DEFAULT_PROMPT_POLICY.system_prompt_block),
    unknown_prompt: raw.unknown_prompt === 'notice' || raw.unknownPrompt === 'notice' ? 'notice' : 'block',
  };
}

function findPromptInstructionReason(line, file) {
  if (file && !isMarkdownFile(file)) return null;
  const target = isMarkdownFile(file) ? stripMarkdownInlineCode(line) : line;
  for (const [pattern, reason] of PROMPT_INSTRUCTION_PATTERNS) {
    if (pattern.test(target)) return reason;
  }
  return null;
}

function classifyPromptInstructionRisk(line, file) {
  const reason = findPromptInstructionReason(line, file);
  const policy = loadPromptPolicy();
  const displayPath = normalizePolicyPath(file) || '(unknown path)';
  const base = `AI指示書/プロンプト断片の可能性: ${reason || '非公開・実運用 prompt の指定パス'}`;

  if (matchesAnyPolicyPath(file, policy.private_block)) {
    return {
      action: 'block',
      category: 'private',
      message: `${base}。private prompt policy に一致 (${displayPath})。非公開前提のため commit 禁止です。`,
    };
  }
  if (matchesAnyPolicyPath(file, policy.system_prompt_block)) {
    return {
      action: 'block',
      category: 'system-prompt',
      message: `${base}。*.system-prompt.md policy に一致 (${displayPath})。実プロンプトの可能性が高いため強警告です。`,
    };
  }

  if (!reason) return null;
  if (matchesAnyPolicyPath(file, policy.public_notice)) {
    return {
      action: 'notice',
      category: 'public',
      message: `${base}。public prompt policy に一致 (${displayPath})。公開サンプル扱いのため通知のみです。秘密情報・内部制約・実運用 tool schema が残っていないか確認してください。`,
    };
  }

  const unknownMessage = `${base}。未分類の AI prompt Markdown (${displayPath})。これは公開サンプルですか、private 資産ですか、実 system prompt ですか？ 公開サンプルなら prompts/public/、非公開なら prompts/private/、実プロンプトなら *.system-prompt.md に分類してください。`;
  return {
    action: policy.unknown_prompt === 'notice' ? 'notice' : 'block',
    category: 'unclassified',
    message: unknownMessage,
  };
}

function findPromptInstructionRisk(line, file) {
  const classified = classifyPromptInstructionRisk(line, file);
  return classified ? classified.message : null;
}

// 警告を出力して exit 1。クリーン時はこの関数を呼ばず、サイレントに exit 0 する。
function warn(reason, mode) {
  const tag = mode ? `プレフィルター (${mode})` : 'プレフィルター';
  console.log('\n======================================================');
  console.log(`⚠️  [Yasakani Jewel ${tag}] 警告を検知しました！`);
  console.log(`👉 原因: ${reason}`);
  console.log('======================================================');
  console.log('💡 AI (Claude 等) との対話で、この警告が出たことを伝えてスキャンしてください。\n');
  process.exit(1);
}

// 通知。コミットはブロックしない (exit しない)。監査が推奨されるファイル種別の
// 変更 (依存関係 / Dockerfile / CI ワークフロー等) に使う。
function notice(reason) {
  console.log(`\n🔍 [Yasakani Jewel] ${reason}`);
  console.log('   -> checkmaga での監査、または AI への相談を推奨します。');
}

const MAX_BYTES = 20 * 1024 * 1024;
const LOCKFILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

// CLI と fixture 評価の共通検知経路。通知があっても同じ行の秘密値を検査する。
function detectContent(content, file) {
  const findings = [];
  const pathRisk = classifyPromptInstructionRisk('', file);
  if (pathRisk) return [{ ...pathRisk, rule: 'prompt', line: 0, detail: pathRisk.message }];
  if (LOCKFILES.includes(path.basename(file))) return findings;
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const prompt = classifyPromptInstructionRisk(line, file);
    if (prompt) findings.push({ ...prompt, rule: 'prompt', line: i + 1, detail: prompt.message });
    const pii = findPii(line);
    const keyword = findKeyword(line, file);
    const entropy = isMarkdownFile(file) ? null : findHighEntropyLiteral(line);
    const detail = pii || (keyword ? `キーワード "${keyword}" と秘密値らしき値を検知。` : entropy);
    if (detail) findings.push({ action: 'block', rule: pii ? 'pii' : keyword ? 'keyword' : 'entropy', line: i + 1, detail });
  }
  return findings;
}

function scanError(reason) {
  console.error(`[Yasakani Jewel] 検査を完了できません: ${reason}`);
  process.exit(2);
}

function gitRead(args, cwd, encoding = 'utf8') {
  return execFileSync('git', args, { cwd, encoding, maxBuffer: MAX_BYTES, stdio: ['ignore', 'pipe', 'pipe'] });
}

function inspectBuffer(buffer, file, mode) {
  const pathRisk = classifyPromptInstructionRisk('', file);
  if (pathRisk) warn(pathRisk.message, mode);
  const base = path.basename(file);
  if (base === 'package.json' || LOCKFILES.includes(base)) notice(`依存関係ファイル ${JSON.stringify(file)} — サプライチェーン監査を推奨。`);
  if (base === 'Dockerfile' || /^(?:docker-)?compose\.ya?ml$/i.test(base)) notice(`コンテナ定義 ${JSON.stringify(file)} — コンテナ監査を推奨。`);
  if (file.replace(/\\/g, '/').includes('.github/workflows/')) notice(`CI 定義 ${JSON.stringify(file)} — パイプライン監査を推奨。`);
  // UTF-16 BOM のテキストも検査。その他の binary はソース拡張子なら検査失敗とする。
  let content;
  if (buffer[0] === 0xff && buffer[1] === 0xfe) content = buffer.subarray(2).toString('utf16le');
  else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    if (swapped.length % 2) scanError('UTF-16 テキストを解釈できません。');
    content = swapped.swap16().toString('utf16le');
  } else if (buffer.includes(0)) {
    if (isScannableFile(file)) scanError(`テキストとして検査できません: ${JSON.stringify(file)}`);
    return;
  } else content = buffer.toString('utf8');
  for (const finding of detectContent(content, file)) {
    const detail = `${JSON.stringify(file)} ${finding.line} 行目: ${finding.detail}`;
    if (finding.action === 'notice') notice(detail);
    else warn(detail, mode);
  }
}

function scanFile(file) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) scanError(`シンボリックリンクは検査できません: ${JSON.stringify(file)}`);
  if (!stat.isFile()) scanError(`ファイルではありません: ${JSON.stringify(file)}`);
  if (stat.size > MAX_BYTES) scanError(`20 MiB を超えるファイル: ${JSON.stringify(file)}`);
  inspectBuffer(fs.readFileSync(file), file, 'ファイル');
}

function runAllScan(targets) {
  const walk = file => {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) scanError(`シンボリックリンクは検査できません: ${JSON.stringify(file)}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) {
        if (!SKIP_DIRS.includes(name)) walk(path.join(file, name));
      }
    } else scanFile(file);
  };
  for (const target of targets.length ? targets : [process.cwd()]) walk(path.resolve(target));
}

function runGitScan(stagedOnly) {
  let root;
  try { root = gitRead(['rev-parse', '--show-toplevel'], process.cwd()).trim(); }
  catch (e) {
    if (stagedOnly) scanError('Git リポジトリを確認できません。');
    return runAllScan([]);
  }
  const staged = gitRead(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRTU', '--no-renames', '--'], root).split('\0').filter(Boolean);
  if (stagedOnly || staged.length) {
    for (const file of staged) {
      const entry = gitRead(['ls-files', '--stage', '-z', '--', file], root).split('\0')[0];
      if (!entry.startsWith('100')) scanError(`通常ファイル以外の index entry: ${JSON.stringify(file)}`);
      inspectBuffer(gitRead(['show', `:${file}`], root, null), path.join(root, file), 'ステージ');
    }
  } else {
    const changed = gitRead(['diff', '--name-only', '-z', '--diff-filter=ACMRTU', '--no-renames', '--'], root);
    const untracked = gitRead(['ls-files', '--others', '--exclude-standard', '-z'], root);
    for (const file of new Set((changed + untracked).split('\0').filter(Boolean))) scanFile(path.join(root, file));
  }
}

function runHistoryScan() {
  const root = gitRead(['rev-parse', '--show-toplevel'], process.cwd()).trim();
  if (gitRead(['rev-parse', '--is-shallow-repository'], root).trim() === 'true') scanError('shallow clone では全履歴を検査できません。fetch-depth: 0 が必要です。');
  const commits = gitRead(['rev-list', '--all'], root).trim().split('\n').filter(Boolean);
  const seen = new Set();
  for (const commit of commits) {
    const entries = gitRead(['ls-tree', '-r', '-z', '--full-tree', commit], root).split('\0').filter(Boolean);
    for (const entry of entries) {
      const tab = entry.indexOf('\t');
      const [mode, type, oid] = entry.slice(0, tab).split(' ');
      const file = path.join(root, entry.slice(tab + 1));
      const pathRisk = classifyPromptInstructionRisk('', file);
      if (pathRisk) warn(pathRisk.message, '履歴');
      if (type !== 'blob') continue; // submodule の履歴は別リポジトリ
      if (mode !== '100644' && mode !== '100755') scanError('履歴に通常ファイル以外の blob があります。');
      // 内容とパス分類を両方保持。同じ blob の別パスで分類を失わない。
      const key = `${oid}:${file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      inspectBuffer(gitRead(['cat-file', 'blob', oid], root, null), file, '履歴');
    }
  }
}

function run(args) {
  args = args || process.argv.slice(2);
  try {
    if (args[0] === '--all') {
      if (args.slice(1).some(arg => arg.startsWith('--'))) scanError('不明なオプションです。');
      runAllScan(args.slice(1));
    } else if (args[0] === '--history' || args[0] === '--staged') {
      if (args.length !== 1) scanError('このモードはファイル指定と併用できません。');
      if (args[0] === '--history') runHistoryScan();
      else runGitScan(true);
    } else if (args.length) {
      if (args.some(arg => arg.startsWith('--'))) scanError('不明なオプションです。');
      args.forEach(scanFile);
    } else runGitScan(false);
  } catch (e) {
    // Git / FS の生エラーには対象の内容が混ざり得るため出力しない。
    scanError('Git またはファイルの読み取りに失敗しました。');
  }
}

module.exports = { run, detectContent, findKeyword, findPii, findPromptInstructionRisk, classifyPromptInstructionRisk, findHighEntropyLiteral, splitToWords, calculateEntropy, isScannableFile, findPromptPolicyPath, getPromptPolicyPath };

if (require.main === module) run();
