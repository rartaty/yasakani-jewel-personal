# 📋 Yasakani Jewel Risk Task Board (リスク管理ボード)

> [!NOTE]
> 本ファイルは Yasakani Jewel (AIセキュリティ監査スキル) が検出したリスクを追跡・管理するための自律タスクボードです。
> AI CLI (Claude Code 等) で `/checkmaga` を実行すると、プロジェクト内のセキュリティリスクが自動でスキャンされ、このボードが更新されます。

---

## 🚦 Bypass Status
* **Bypass Status**: `[DESIGN: OFF, STAGING: OFF, PRODUCTION: OFF]`
  *(⚠️注意: バイパスがONになっている場合、実装に進む前に必ずOFFに戻してください)*

---

## 🚨 Active Risks (未解決のリスク)

| ID | 重大度 | 状態 | 検出日 | 対象 | 内容 | 対応方針 |
|---|---|---|---|---|---|---|
| YJ-TB-010 | P2 | 未対応・検知範囲を確認 | 2026-10-11 | src/scan.js | 架空値による detectContent helper 確認で複数行 password、JSON full_name、JSON instructions、日本語だけの未分類 Markdown prompt は block 0 件。既存 heuristic には検知範囲の不足が残る。 | 再現 fixture と誤検知評価を追加する修正候補。専門 secret scanner の併用も検討。合成入力で確認した検知範囲であり、検知補強は未実施。 |

---

## 履歴 (解決済みのリスク)

解決されたリスクはここに監査証跡（履歴）として記録され、安全 of 証明となります。
| ID | 重大度 | 状態 | 検出日 | 解決日 | 対象 | 解決内容 | 検証 |
|---|---|---|---|---|---|---|---|
| YJ-TB-008 | P2 | 解決済み | 2026-10-11 | 2026-10-11 | src/scan.js | --all / --history / --staged を追加。ステージ検査は index blob を読み、ファイル名は NUL 区切りで取得。読み取り失敗を exit 2 とし、fixture 評価も CLI 共通検知経路へ統一。 | npm test、npm run eval。古い ignored ファイル、未追跡ソース、削除後の履歴、UTF-16、検査失敗を実 CLI で確認。 |
| YJ-TB-007 | P1 | 解決済み | 2026-10-11 | 2026-10-11 | src/scan.js | dotenv の非引用値、JSON キー、コメント、package.json を検査。private / system prompt パスを内容に依存せずブロックし、値のログ出力を抑制。 | npm test（CLI の staged / explicit 回帰テスト）、npm run eval。 |
| YJ-TB-001 | P1 | 解決済み | 2026-06-14 | 2026-06-14 | `src/scan.js` | `isScannableFile()` を追加し、`.env` / `.env.*` / 通常拡張子を手動スキャン・保存時スキャンで統一判定するよう修正。 | `npm test`、`npm run eval`、`node bin/yasakani.js scan .tmp/scan-env-check/.env` で検知を確認。 |
| YJ-TB-002 | P1 | 解決済み | 2026-06-14 | 2026-06-14 | `src/init.js` | 既存 `emeraldwalk.runonsave.commands` を保持し、Yasakani command が未登録の場合だけ追加。再実行時の重複追加を防止。 | `test/init-uninstall.test.js` で既存 command 保持・二重追加なしを確認。 |
| YJ-TB-003 | P1 | 解決済み | 2026-06-14 | 2026-06-14 | `src/uninstall.js` | uninstall 時に Yasakani command のみ削除し、ユーザー既存 Run on Save command は残すよう修正。 | `test/init-uninstall.test.js` でユーザー command が残ることを確認。 |
| YJ-TB-004 | P2 | 解決済み | 2026-06-14 | 2026-06-14 | `src/init.js` | macOS/Linux の CLI 検出を `spawnSync('command', ['-v'])` 依存から PATH 探索へ変更。Windows の `.cmd` / `.exe` / `.bat` 検出と既知インストール先探索も維持。 | `node --check src/init.js`、`node test/init-uninstall.test.js`、`npm test` で POSIX/Windows 注入テストを確認。 |
| YJ-TB-005 | P2 | 解決済み | 2026-06-14 | 2026-06-14 | `src/scan.js` | `prompt-policy.json` をコピー後scanner同階層、または `process.cwd()` から親方向に探索して `.yasakani/prompt-policy.json` を読むよう修正。 | `node --check src/scan.js`、`node test/scan.test.js`、`npm test` でサブディレクトリ実行時のroot policy適用を確認。 |
| YJ-TB-006 | P3 | 解決済み | 2026-06-14 | 2026-06-14 | `test/eval-fixtures.js` | fixture評価の出力を blocking metrics と notice metrics に分離し、noticeをblocking FP/FNに混ぜない意味を明確化。READMEの説明も同期。 | `node --check test/eval-fixtures.js`、`npm run eval`、`npm test` で出力と回帰を確認。 |

---

## Activity Log

| 日付 | 内容 |
|---|---|
| 2026-10-11 | 公開版を更新。秘密情報・PII・prompt 検査、全体・履歴・ステージ検査、Git フック、CI 生成、確認範囲の証跡、外部ログのオンデマンド点検を同期。ADR・生成レポート・生ログ・作業用ファイル・非公開版の履歴と運用記録は持ち込まない。個人版の README 編集を保持し、CI の fixture 評価・Gitleaks 追加はユーザー承認済み。既存文書の別プロジェクト名・監査結果・保存先も公開用要約へ整理。実装・テスト・CI の47ファイルは検証済みの元実装と同一。audit-logs／findings と23 fixtures の評価を確認し、blocking FP/FN 0。公開候補の Gitleaks 検査は検出0件。 |
