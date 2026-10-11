'use strict';

const assert = require('assert');
const {
  CATEGORIES,
  normalizeFinding,
  mergeFindings,
  formatFalsePositiveLikelihood,
  normalizeVerification,
  formatVerification,
} = require('../src/findings');

const normalized = normalizeFinding({
  category: CATEGORIES.PII,
  ruleId: 'pii.email',
  title: 'Email address in git diff',
  location: { path: 'src/example.js', line: 12 },
  severity: 'high',
  action: 'block',
  falsePositiveLikelihood: 'low',
  evidence: '[email]',
  sources: 'prefilter',
});

assert.strictEqual(normalized.category, CATEGORIES.PII);
assert.strictEqual(normalized.location.path, 'src/example.js');
assert.strictEqual(normalized.location.line, 12);
assert.deepStrictEqual(normalized.evidence, ['[email]']);
assert.deepStrictEqual(normalized.sources, ['prefilter']);

const fallback = normalizeFinding({
  category: 'UNKNOWN',
  severity: 'urgent',
  action: 'drop',
  falsePositiveLikelihood: 'certain',
});

assert.strictEqual(fallback.category, CATEGORIES.OTHER);
assert.strictEqual(fallback.severity, 'medium');
assert.strictEqual(fallback.action, 'report');
assert.strictEqual(fallback.falsePositiveLikelihood, 'unknown');

const merged = mergeFindings([
  {
    category: CATEGORIES.SECRET,
    ruleId: 'secret.keyword',
    title: 'Hardcoded secret',
    location: { path: 'src/app.js', line: 4 },
    severity: 'medium',
    action: 'warn',
    falsePositiveLikelihood: 'high',
    evidence: 'keyword',
    sources: 'prefilter',
  },
  {
    category: CATEGORIES.SECRET,
    ruleId: 'secret.keyword',
    title: 'Hardcoded secret',
    location: { path: 'src/app.js', line: 4 },
    severity: 'critical',
    action: 'block',
    falsePositiveLikelihood: 'low',
    evidence: 'entropy',
    sources: 'manual-review',
  },
]);

assert.strictEqual(merged.length, 1);
assert.strictEqual(merged[0].severity, 'critical');
assert.strictEqual(merged[0].action, 'block');
assert.strictEqual(merged[0].falsePositiveLikelihood, 'low');
assert.deepStrictEqual(merged[0].evidence, ['keyword', 'entropy']);
assert.deepStrictEqual(merged[0].sources, ['prefilter', 'manual-review']);

const reportOnly = mergeFindings([
  {
    category: CATEGORIES.DATA_EXPOSURE,
    ruleId: 'data.possible-overexposure',
    title: 'Possible excessive response',
    location: 'src/controller.js',
    severity: 'medium',
    action: 'report',
    falsePositiveLikelihood: 'high',
  },
]);

assert.strictEqual(reportOnly.length, 1);
assert.strictEqual(reportOnly[0].action, 'report');
assert.strictEqual(
  formatFalsePositiveLikelihood(reportOnly[0].falsePositiveLikelihood),
  'high false-positive likelihood; report-only investigation candidate'
);

const codeReview = { status: 'verified', kind: 'config-review', scope: 'storage.tf',
  checkedAt: '2026-10-11T00:00:00Z', evidence: ['public access disabled in configuration'] };
const liveReview = { status: 'verified', kind: 'live-config', scope: 'staging storage',
  checkedAt: '2026-10-11T01:00:00Z', evidence: ['read-only configuration query'] };
assert.strictEqual(fallback.verification.runtime.status, 'unverified');
assert.strictEqual(formatVerification({ code: codeReview }), '設定コードを確認済み／実環境は未確認');
assert.strictEqual(formatVerification({ code: codeReview, runtime: liveReview }), '設定コードを確認済み／実環境も確認済み');
assert.strictEqual(formatVerification({ runtime: liveReview }), '設定コードは未確認／実環境を確認済み');
for (const patch of [{ kind: 'imported-log' }, { evidence: [] }, { scope: '' },
  { checkedAt: '2026-02-31T00:00:00Z' }, { checkedAt: 'yesterday' }, { status: 'unverified' }]) {
  assert.strictEqual(normalizeVerification({ runtime: { ...liveReview, ...patch } }).runtime.status, 'unverified');
}
const finding = { category: CATEGORIES.DATA_EXPOSURE, title: 'Storage access', location: 'storage.tf' };
const observations = mergeFindings([
  { ...finding, verification: { code: codeReview } },
  { ...finding, verification: { runtime: liveReview } },
]);
assert.strictEqual(observations.length, 2, 'different evidence does not promote verification on merge');
assert(observations.every(item => !(item.verification.code.status === 'verified' && item.verification.runtime.status === 'verified')));
assert.strictEqual(mergeFindings([
  { ...finding, verification: { code: codeReview } },
  { ...finding, verification: { code: codeReview }, severity: 'high' },
]).length, 1, 'identical scoped evidence still merges');

console.log('findings tests passed');
