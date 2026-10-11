'use strict';

const CATEGORIES = Object.freeze({
  SECRET: 'YJ-SECRET',
  PII: 'YJ-PII',
  SUPPLY_CHAIN: 'YJ-SUPPLY-CHAIN',
  CONTAINER: 'YJ-CONTAINER',
  CI_CD: 'YJ-CI-CD',
  PROMPT_INJECTION: 'YJ-PROMPT-INJECTION',
  AUTHZ: 'YJ-AUTHZ',
  DATA_EXPOSURE: 'YJ-DATA-EXPOSURE',
  FINANCIAL_SAFETY: 'YJ-FINANCIAL-SAFETY',
  INCIDENT: 'YJ-INCIDENT',
  OTHER: 'YJ-OTHER',
});

const SEVERITY_ORDER = Object.freeze({
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});

const ACTION_ORDER = Object.freeze({
  report: 0,
  warn: 1,
  block: 2,
});

const FALSE_POSITIVE_ORDER = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  unknown: 3,
});

function asString(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

function normalizeEnum(value, order, fallback) {
  const key = asString(value, fallback).toLowerCase();
  return Object.prototype.hasOwnProperty.call(order, key) ? key : fallback;
}

function normalizeLocation(location) {
  if (typeof location === 'string') {
    return { path: location, line: null, column: null };
  }
  if (!location || typeof location !== 'object') {
    return { path: 'unknown', line: null, column: null };
  }
  return {
    path: asString(location.path, 'unknown'),
    line: Number.isInteger(location.line) && location.line > 0 ? location.line : null,
    column: Number.isInteger(location.column) && location.column > 0 ? location.column : null,
  };
}

// Verification is a dated, scoped assertion from a checker, not a severity label.
// Imported logs cannot establish the current state of a live environment.
function normalizeVerification(input) {
  const source = input && typeof input === 'object' ? input : {};
  const result = {};
  for (const area of ['code', 'runtime']) {
    const item = source[area] && typeof source[area] === 'object' ? source[area] : {};
    const scope = asString(item.scope, '');
    const evidence = asArray(item.evidence).filter(value => value.trim());
    const allowedKinds = area === 'code' ? ['source-review', 'config-review'] : ['live-config', 'live-test'];
    const kind = allowedKinds.includes(item.kind) ? item.kind : null;
    const checkedAt = asString(item.checkedAt, '');
    const date = new Date(checkedAt);
    const validDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(checkedAt)
      && Number.isFinite(date.getTime())
      && date.toISOString().replace('.000Z', 'Z') === checkedAt.replace('.000Z', 'Z');
    const verified = item.status === 'verified' && kind && scope && evidence.length && validDate;
    result[area] = verified
      ? { status: 'verified', kind, scope, checkedAt: date.toISOString(), evidence }
      : { status: 'unverified', kind: null, scope: '', checkedAt: null, evidence: [] };
  }
  return result;
}

function formatVerification(input) {
  const verification = normalizeVerification(input);
  const code = verification.code.status === 'verified';
  const runtime = verification.runtime.status === 'verified';
  if (code && runtime) return '設定コードを確認済み／実環境も確認済み';
  if (code) return '設定コードを確認済み／実環境は未確認';
  if (runtime) return '設定コードは未確認／実環境を確認済み';
  return '設定コードは未確認／実環境は未確認';
}

function normalizeFinding(input) {
  const source = input && typeof input === 'object' ? input : {};
  const category = Object.values(CATEGORIES).includes(source.category) ? source.category : CATEGORIES.OTHER;
  const ruleId = asString(source.ruleId, category);
  const title = asString(source.title, ruleId);
  const location = normalizeLocation(source.location);
  const severity = normalizeEnum(source.severity, SEVERITY_ORDER, 'medium');
  const action = normalizeEnum(source.action, ACTION_ORDER, 'report');
  const falsePositiveLikelihood = normalizeEnum(
    source.falsePositiveLikelihood,
    FALSE_POSITIVE_ORDER,
    'unknown'
  );

  return {
    category,
    ruleId,
    title,
    location,
    severity,
    action,
    falsePositiveLikelihood,
    evidence: asArray(source.evidence),
    sources: asArray(source.sources),
    remediation: asString(source.remediation, ''),
    metadata: source.metadata && typeof source.metadata === 'object' ? { ...source.metadata } : {},
    verification: normalizeVerification(source.verification),
  };
}

function preferByOrder(left, right, order, direction) {
  const leftScore = order[left];
  const rightScore = order[right];
  if (direction === 'min') return leftScore <= rightScore ? left : right;
  return leftScore >= rightScore ? left : right;
}

function mergeUnique(left, right) {
  return Array.from(new Set([...(left || []), ...(right || [])]));
}

function findingKey(finding) {
  const loc = finding.location;
  return [
    finding.category,
    finding.ruleId,
    loc.path,
    loc.line === null ? '' : loc.line,
    loc.column === null ? '' : loc.column,
    finding.title,
    // Do not merge observations with different dates/scopes into broader coverage.
    JSON.stringify(finding.verification),
  ].join('|');
}

function mergeFindings(findings) {
  const merged = new Map();
  for (const item of findings || []) {
    const next = normalizeFinding(item);
    const key = findingKey(next);
    if (!merged.has(key)) {
      merged.set(key, next);
      continue;
    }

    const current = merged.get(key);
    current.severity = preferByOrder(current.severity, next.severity, SEVERITY_ORDER, 'max');
    current.action = preferByOrder(current.action, next.action, ACTION_ORDER, 'max');
    current.falsePositiveLikelihood = preferByOrder(
      current.falsePositiveLikelihood,
      next.falsePositiveLikelihood,
      FALSE_POSITIVE_ORDER,
      'min'
    );
    current.evidence = mergeUnique(current.evidence, next.evidence);
    current.sources = mergeUnique(current.sources, next.sources);
    if (!current.remediation && next.remediation) current.remediation = next.remediation;
    current.metadata = { ...current.metadata, ...next.metadata };
  }
  return Array.from(merged.values());
}

function formatFalsePositiveLikelihood(value) {
  const normalized = normalizeEnum(value, FALSE_POSITIVE_ORDER, 'unknown');
  switch (normalized) {
    case 'low':
      return 'low false-positive likelihood';
    case 'medium':
      return 'medium false-positive likelihood';
    case 'high':
      return 'high false-positive likelihood; report-only investigation candidate';
    default:
      return 'unknown false-positive likelihood; report-only investigation candidate';
  }
}

module.exports = {
  CATEGORIES,
  normalizeFinding,
  mergeFindings,
  formatFalsePositiveLikelihood,
  normalizeVerification,
  formatVerification,
};
