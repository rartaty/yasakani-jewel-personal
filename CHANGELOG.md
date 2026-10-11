# Changelog

形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠し、バージョンは [Semantic Versioning](https://semver.org/spec/v2.0.0.html) に従います。

## [Unreleased]

- 固定 SHA を電話番号・郵便番号と誤判定しないよう境界条件を修正。環境変数を含む実行時パスは静的な各要素の entropy を検査する。

### Added

- 共通 Finding にコード／実環境の確認範囲を追加。証跡不足や取り込んだ過去ログを実環境確認済みにしない。
- `audit logs` を追加。JSON Lines の一回点検、profile による形式対応、期間指定、Markdown／JSON 出力、新規ファイルへの保存に対応。
- ログイン失敗の集中、大量取得・転送、アカウント・権限変更を調査候補として報告。生ログ・主体・IP・秘密値を出力せず、未検証と解析失敗を明示する。

- 生成 CI の検査器を SHA-256 付き snapshot として埋め込み、配布元が非公開でも認証なしで実行可能にした。

- `init --ci` による全体検査 workflow の生成、worktree / project hooksPath の配線、既存 shell フックより前の staged 検査を追加。検査器不在・配線未完了は失敗として扱う。
- 自己 CI に fixture 評価と固定版 Gitleaks の履歴検査を追加。AI の自動起動・prompt injection 防止の保証について説明を実装に合わせた。

- `scan --all [path...]`、`--history`、`--staged` を追加。index blob の全内容と NUL 区切りのファイル名を読み、古い ignored ファイル・除去後の履歴・作業ツリーとの差異を検証する CLI テストを追加。
- **Git への個人情報混入防止（PII Leak Prevention）**
  - 決定論プリフィルターでメールアドレス、日本の電話番号、郵便番号、住所らしき文字列、ラベル付き個人情報（`氏名` / `名前` / `address` / `email` / `phone` 等）を検知
  - 検知時は秘密情報と同じくコミットを中断
  - レポート記録時は `[email]` / `[phone]` / `[address]` 等にマスクし、監査証跡自体が二次漏洩源にならない方針を追加
- **`checkmaga` 監査レポートの Markdown ファイル出力**
  - `checkmaga-reports/YYYYMMDDTHHMMSS-checkmaga.md` に必ず保存される（**ローカル監査証跡・`.gitignore` 対象**）
  - MECE 6 領域 × 10 項目 Gap Defenses の **全項目を網羅列挙**（検出された懸念だけでなく `✅ 検査済 — 問題なし` および `N/A — <理由>` も明示）
  - チャット側はレポートへのリンク＋ Before/After Diff のみ（重複出力なし）
- **OSI 参照モデル別カバレッジ宣言** をレポート最終セクションに追加
  - L1〜L7 各層について本ツールでの対応状況を ✅/△/⚠️/❌ で明示
  - 「本ツールでカバーできないこと」（稼働中挙動・物理・人的・AI 自身の堅牢性・外部監査効力 等）を率直に開示
- **Finding 正規化ユーティリティ** (`src/findings.js`)
  - Finding のカテゴリ、重大度、アクション、誤検知可能性を同じ形に揃える土台を追加
  - 重複 Finding はレポート生成前に統合できるようにしつつ、検出段階では捨てない設計にした
- **FP/FN 測定基盤** (`npm run eval`)
  - `test/fixtures/` の true-positive / false-positive 集合に対して TP / TN / FP / FN と FP率 / FN率を出力
  - 初期fixtures上での確認を自動化し、感覚ではなく測定対象を増やして改善する方針を追加
- **Markdown 指示書・プロンプト断片検知**
  - `.md` / `.mdx` を明示ファイルスキャン対象に追加
  - `System Prompt`、`Tool Definitions`、`network_configuration`、`filesystem_configuration`、`Ignore previous instructions`、`{antml:...}` 等を検知
  - git リポジトリ内でも `npx yasakani-jewel scan path/to/file.md` で指定ファイルを直接スキャン可能に変更
- **AI prompt Markdown policy**
  - `.yasakani/prompt-policy.json` を追加し、`prompts/public/**` は通知、`prompts/private/**` / `private/**/system-prompt.md` は commit 禁止、`*.system-prompt.md` は強警告、未分類は分類案内付き停止に分類
  - `init` で既存設定を保持しながら prompt policy を配置
- **ADR-007**
  - 低信頼 Finding を捨てないローカル証跡設計を記録
  - PRコメント・外部APIフィルタリング・複雑な除外設定を初期版では後回しにする判断を明文化
- `checkmaga` レポートテンプレートに **調査候補（低信頼・非ブロック）** セクションを追加
- `checkmaga` レポート末尾に **重複・調査候補の出力方針** を追加
  - 同じリスクが複数セクションに出る理由を「観点別の確認証跡」として説明
  - 調査候補、誤検知可能性ラベル、外部送信しない方針の読み方を明記
- **第三者検証用の共有ルール**
  - README / 取扱説明書 / 指示書 / 仕様書に、フレンド環境での検証時に共有してはいけないもの・共有可能なメタ情報・redacted 版の作り方を追加
- 指示書 §7.1 にレポートファイルの定型テンプレート（8 セクション）を追加
- `.gitignore` に `checkmaga-reports/` を追記

### Changed

- dotenv の引用符なし秘密値、JSON の秘密キー、コメント、package.json 内の秘密情報を検査。private / system prompt パスはマーカーの有無に関係なくブロックし、PII・秘密値の警告をマスク。
- 仕様書 §6 / 取扱説明書 §4 を Markdown レポート出力仕様＋ OSI カバレッジ宣言に同期
- 低信頼 Finding は confidence score で断定せず、誤検知可能性ラベル付きの調査候補としてローカルレポートに残す方針に変更

## [1.0.0] - 2026-05-25

### Added

- **npm CLI 配布** (`yasakani-jewel`) — プロジェクトルートで 1 コマンドで導入
  - 現在の公開版の導入先: `npx github:rartaty/yasakani-jewel-personal init`（GitHub 経由）
  - `npx yasakani-jewel init`（npm 公開後）
- **多層トリガー** A〜D
  - A. AIチャット連携（`CLAUDE.md` 等にポインタを追記）
  - B. git pre-commit フック（git リポジトリの場合）
  - C. 保存時スキャン（VS Code / Cursor の Run on Save 連携）
  - D. 手動 (`yasakani scan`)
- **AI 指示書（システム指示書）**
  - 3次元動的ポリシー（フェーズ × 規模 × アセット重要度）
  - 9 項目の Gap Defenses（§3.1〜3.9）
    - §3.1 Indirect Prompt Injection 防御
    - §3.2 サプライチェーン汚染（Mini Shai-Hulud）
    - §3.3 暗号・認証ロジック自作の禁止
    - §3.4 API 過剰データ返却の排除
    - §3.5 環境変数スコープ分離
    - §3.6 バイパスゾンビ化の防止
    - §3.7 コンテナ最小権限化（NIST SP 800-190）
    - §3.8 CI/CD パイプライン完全性（SLSA）
    - §3.9 運用面の死角への助言
  - MECE 6 領域監査フレームワーク（3 レイヤー × 2 状態）
  - ハイブリッド原則（決定論 + AI + Human-in-the-Loop）
- **プリフィルタ（決定論スキャナ）**
  - 語境界マッチ + 文字列リテラル同居条件で誤発火を抑制
  - 2 段階の重大度: ⚠️ 警告（コミット中断）/ 🔍 通知（非ブロック）
  - 依存関係 / `Dockerfile` / CI ワークフロー変更を通知
  - クリーン時は完全サイレント
- **コマンド** `checkmaga` / `whydoubt [ID]` / `incident`
- **JSONC + BOM 付き `settings.json`** のマージ対応（非破壊）
- **`uninstall`** によるマーカー区間のみの除去（ユーザー記述は保持）
- **ドキュメント一式**: README / specification / capabilities / ADR / user_manual / implementation_plan / task / walkthrough
- **MIT ライセンス**
- **GitHub Actions CI**（Node 16 / 18 / 20 / 22 でテスト実行）
- **単体テスト** (`npm test` — `findKeyword` の挙動を 10 ケースで検証)
