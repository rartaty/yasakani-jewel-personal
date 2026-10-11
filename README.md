# Yasakani-Jewel-Personal

**AI-Native Security Companion** — 常駐プロセスゼロで、Claude Code / Cursor / GitHub Copilot に多層セキュリティ監査を配線する、個人開発者向けの軽量・オンデマンドなセキュリティ監査ツール。

内閣官房「Project YATA-Shield」や NIST SP 800 シリーズ、経産省ガイドラインのエッセンスを、専属のセキュリティチームを持たない個人開発者が AI を「仮想 CISO」代わりのような簡易的なセキュリティチェックパートナーとなるようなものを目指しています。

> [!IMPORTANT]
> **本ツールは作者個人の学習・実験プロジェクト**として公開しているものであり、**いかなる保証も提供しません**。本ツールの使用によって生じた直接的・間接的損害（データ損失・セキュリティ事故・業務影響等を含むがこれらに限らない）について、作者は**一切の責任を負いません**。利用はすべて**自己責任**でお願いします。
>
> 本ツールは AI を活用したセキュリティ監査の「補助」であり、専門のセキュリティレビュー・ペネトレーションテスト・コンプライアンス監査の代替にはなりません。

---

## 📚 ドキュメント（目的別）

| 目的 | 場所 |
| :--- | :--- |
| **とりあえず動かしたい** |  [🚀 クイックスタート](#-クイックスタート)（1 コマンド導入） |
| **使い方を詳しく知りたい** |  **[取扱説明書 (yasakani_jewel_user_manual.md)](yasakani_jewel_user_manual.md)** — 全体図・インストール・日常操作・コマンド一覧・FAQ |
| **第三者検証時の共有ルール** |  本書 [§🔐 第三者検証時の共有ルール](#-第三者検証時の共有ルール) ／ [取扱説明書 §6](yasakani_jewel_user_manual.md)  |
| **何を防げるか・できるか** | [防衛能力定義書 (yasakani_jewel_capabilities.md)](yasakani_jewel_capabilities.md) |
| **仕様詳細・3次元ポリシー・Gap Defenses** | [システム仕様書 (yasakani_jewel_specification.md)](yasakani_jewel_specification.md) |
| **変更履歴** | [CHANGELOG.md](CHANGELOG.md) |
| **ライセンス** | [LICENSE](LICENSE) (MIT) |

> 第三者検証ルールは、レポートや差分の生共有を避けるためのルールです。事前に必ず目を通してください。

---

## 🚀 クイックスタート

プロジェクトのルートディレクトリで、**1 コマンド**:

```sh
npx github:rartaty/yasakani-jewel-personal init
```

手で配置・コピーするファイルはありません。`init` が以下の **4 層**を環境に応じて自動配線します。

| 層 | トリガー | 内容 |
| :--- | :--- | :--- |
| A. AIチャット連携 | `checkmaga` 入力時 | `.yasakani/` 配置 + 各 AI 設定へポインタ追記 |
| B. git pre-commit | `git commit` 時 | ステージされたファイルの全内容を検査（git リポジトリ時）|
| C. 保存時スキャン | ファイル保存（Ctrl+S）| VS Code / Cursor の Run on Save 連携 |
| D. 手動 | `npx github:rartaty/yasakani-jewel-personal scan` | いつでも実行可能 |

**必要環境**: Node.js 16 以上のみ（Windows / Mac / Linux 共通。`.bat` / PowerShell 不要）。

---

## 💬 コマンド

CLI:

```sh
npx github:rartaty/yasakani-jewel-personal init        # 監査レイヤーを配線
npx github:rartaty/yasakani-jewel-personal init --ci   # GitHub Actions の全体検査も生成
npx github:rartaty/yasakani-jewel-personal scan        # ステージ内容、または変更・未追跡ファイル
npx github:rartaty/yasakani-jewel-personal scan path/to/file.md  # Markdown 指示書・プロンプト断片も確認
npx github:rartaty/yasakani-jewel-personal scan --all  # 既存・未追跡・gitignore対象も検査
npx github:rartaty/yasakani-jewel-personal scan --all src config  # 指定した範囲を全体検査
npx github:rartaty/yasakani-jewel-personal scan --history  # ローカルGitの全reachable履歴を検査
npx github:rartaty/yasakani-jewel-personal scan --staged   # ステージ内容のみ（フック用）
npx github:rartaty/yasakani-jewel-personal audit logs events.jsonl  # 外部ログを一度だけ点検
npx github:rartaty/yasakani-jewel-personal audit logs events.jsonl --profile profile.json --json
npx github:rartaty/yasakani-jewel-personal uninstall   # 配線を除去（ユーザー記述は保持）
```

`init --ci` は `.github/workflows/yasakani-security.yml` を生成します。GitHub の ruleset / branch protection で **Yasakani security scan** を必須チェックに設定してください。既存の workflow が異なる場合は保持し、exit 2 で更新確認を促します。CI は生成時のスキャナを base64 snapshot と SHA-256 で workflow に保持し、runner の一時ディレクトリへ復元して `--all` で検査します。配布元リポジトリの公開・認証は不要で、対象の npm scripts は実行しません。scanner / policy を変更するときは workflow 内の `YASAKANI_SCANNER_B64` / `YASAKANI_SCANNER_SHA256` / `YASAKANI_POLICY_B64` もレビューしてください。base64 は暗号化ではなく、SHA-256 は snapshot の整合性確認です。workflow の変更権限とレビューも管理してください。

フックは worktree とプロジェクト内 `core.hooksPath` に対応し、既存 shell フックの先頭で検査します。外部共有パス・外部へのリンク・非 shell フックは自動変更せず、配線未完了を通知します。ローカルフックの回避に備え、CI の必須チェックも併用してください。`uninstall` は既存フックのユーザー部分と CI workflow を保持します。

`--all` は更新時刻・拡張子に依存せずテキストを検査し、`.git` / `node_modules` / `.yasakani` はディレクトリ探索から除きます。バイナリ資産と lockfile の本文は対象外です。`--history` はローカルにある全参照の到達可能な commit を調べます。未取得のリモート履歴・reflog・submodule の別リポジトリは対象外で、shallow clone はエラーになります。履歴から消した秘密値も残存 commit から検知できるため、漏洩時は値の失効・再発行が必要です。

終了コードは `0` = ブロック対象なし、`1` = 懸念あり、`2` = 検査失敗です。読めないファイル・シンボリックリンク・20 MiB 超のファイルを黙って成功扱いにはしません。`--staged` は index の内容を検査し、ステージが空でも作業ツリーへ切り替えません。公開 prompt の通知が出ても、同じファイルの秘密情報・PII は別途ブロックします。

AI への指示を含む Markdown を検知した場合、Yasakani Jewel はファイルの保存場所と名前から、警告の強さと Git commit の可否を決めます。
prompts/public/** に一致したファイルは「公開用サンプル」として扱い、通知は出しますが commit は止めません。
prompts/private/** に一致したファイルは「非公開の指示書・資産」として扱い、誤って共有しないよう commit を止めます。
*.system-prompt.md は、実際に AI へ渡す system prompt の可能性が高いため、強い警告を出して commit を止めます。
どのルールにも当てはまらない AI への指示を含む Markdown も、ご自身の目でチェックいただいたほうが良いと判断し、安全のため commit を止めます。公開用・非公開用・実運用用のどれに当たるかを確認し、保存場所または .yasakani/prompt-policy.json を調整してください。  
この分類は内容そのものを完全に判定する機能ではありません。利用者がファイルの保存場所と名前で意図を示し、Yasakani Jewel がそれに応じた警告を出す仕組みです。

AI チャット（Claude Code / Cursor / Copilot）:

- `checkmaga` … 強制セキュリティ監査 / 設計先制レビュー
- `whydoubt [ID]` … リスク ID の最悪シナリオを詳細展開
- `incident` … インシデント緊急対応ドラフト生成（経産省「2分類モデル」）

検出されたリスクは `risktaskboard.md` に監査証跡として蓄積されます。

`audit logs` は指定したローカルの UTF-8 JSON Lines を点検し、ログイン失敗の集中、大量取得・外部転送、アカウント作成・再有効化・権限変更を非ブロックの調査候補として出力します。常駐・外部通信・遮断・自動失効は行いません。生ログ、主体、IP、URL、秘密値は結果に出力せず、行番号・UTC 日時・件数から元ログを調べられます。結果は Markdown、`--json` で JSON。`--output` は存在しないファイルにだけ保存し、親ディレクトリは事前に作成してください。ログ点検はリスク管理ボードを自動変更しません。

終了コードは `0` = 提供ログの対応ルールで候補なし、`1` = 調査候補あり、`2` = 検査失敗。空ログ・未知 event・必須項目欠落・部分解析・期間内ログなしを成功扱いしません。実環境は未確認と表示し、該当ログのないルールは未検証にします。対応する入力形式と profile は [取扱説明書の外部ログ点検](yasakani_jewel_user_manual.md#8-外部ログのオンデマンド点検) を参照してください。

---

## 🛡️ 主な防御範囲

シークレット流出 / **Git への個人情報混入（メールアドレス・氏名ラベル・住所・電話番号）** / Markdown 指示書・プロンプト断片（System Prompt / Tool Definitions / network 設定等）の混入と分類漏れ / タイポスクワッティング（Mini Shai-Hulud）/ 暗号・認証ロジックの自作 / API 過剰データ返却 / 環境変数スコープの混同 / Indirect Prompt Injection / コンテナ過剰権限（NIST SP 800-190）/ CI/CD パイプライン改ざん（SLSA / ビルド時バックドア）。

プリフィルターは検知を 2 段階で扱います — **⚠️ 警告**（ハードコード秘密情報・個人情報混入の疑い）は git コミットを中断、**🔍 通知**（依存関係・Dockerfile・CI ワークフローの変更）は中断せず監査を推奨。詳細は [防衛能力定義書](yasakani_jewel_capabilities.md) を参照。

---

スキャナは AI を自動起動しません。意味論的監査は AI チャットで `checkmaga` を実行して行います。prompt injection 対策の指示書は監査を補助しますが、AI の追従や攻撃防止を保証する実行時の強制機構はありません。このリポジトリ自身の CI では fixture 評価と Gitleaks の履歴検査も行います（導入先に生成する workflow は Yasakani の全体検査）。

---

## 📊 品質測定と低信頼 Finding

検査項目は結果と確認範囲を別々に記録します。「設定コードを確認済み」「実環境も確認済み」「実環境は未確認」を、確認日時・対象・根拠とともに明示します。IaC や取り込んだ過去ログだけでは現在の実環境を確認済みにしません。共通 Finding の `verification.code` / `verification.runtime` は、証跡のない入力を未確認として扱います。

開発用に `npm run eval` を用意しています。`test/fixtures/` の true-positive / false-positive 集合に対して、blocking の TP / TN / FP / FN と FP率 / FN率、notice の非ブロックFPを分けて出力します。

低信頼 Finding は破棄せず、`checkmaga` レポートの「調査候補（低信頼・非ブロック）」へ隔離して残す方針です。PRコメント・外部APIフィルタリング・複雑な除外設定は、初期版では入れません。

`checkmaga` レポートでは、同じリスクが複数セクションに出る場合があります。これは、MECE 6 領域 / Gap Defenses / 対象ファイル / 未解決リスク / 修正Diff の各観点で「どこまで見たか」を残すための証跡設計です。確定根拠が弱いものは未解決リスクに混ぜず、調査候補として隔離して人間の確認対象として残します。

---

## 🔐 第三者検証時の共有ルール

友人・同僚・外部協力者のプロジェクトで実験を行う場合、Yasakani Jewel は**相手のPC・相手のローカルリポジトリで実行**してください。`checkmaga-reports/*.md`、`risktaskboard.md`、ターミナルのスクショ、AIチャット履歴、ソースコード差分、`.env`、ログ、設定ファイルをそのまま第三者へ送らないでください。

共有してよいのは、原則として「検出件数」「読みにくかった箇所」「誤検知っぽいカテゴリ」「改善してほしい文言」などのメタ情報だけです。相談に必要な場合は、秘密値・個人情報・顧客名・実ドメイン・IP・アカウントID・ローカルパス・ブランチ名・コミットIDを伏せた redacted 版だけを共有してください。

---

## 📂 リポジトリ構成

| 場所 | 内容 |
| :--- | :--- |
| `bin/` / `src/` / `templates/` / `package.json` / `LICENSE` | npm パッケージ `yasakani-jewel`（配布物本体。リポジトリルートが直接パッケージ） |
| [yasakani_jewel_specification.md](yasakani_jewel_specification.md) | システム仕様書 |
| [yasakani_jewel_capabilities.md](yasakani_jewel_capabilities.md) | 防衛能力定義書 |
| [yasakani_jewel_user_manual.md](yasakani_jewel_user_manual.md) | 究極の取扱説明書（詳細マニュアル）|
| `test-environment/` | 検証用の脆弱性テスト資産 |

---

## 🧭 設計方針

- **常駐デーモンなし** — フック / 保存イベント / 手動のオンデマンド実行のみ。
- **3次元動的ポリシー** — 開発フェーズ × 規模 × アセット重要度でチェック強度をリスクに応じて監査範囲を調整。
- **日常サイレント** — 問題なしの 99% は完全無表示。トークンと画面ノイズをゼロにする。
- **ハイブリッド原則** — AI（確率論）と決定論スキャナを併用し、最終承認は人間が実施（Human-in-the-Loop）。
- **非破壊** — 既存の `CLAUDE.md` 等はマーカー区間の追記のみ。`uninstall` で完全除去可能。

---

## 📦 公開について

公開版には実装コード・合成テスト・利用文書を含めます。ADR、生成された監査レポート、生ログ、個人情報・機密情報は公開対象から除外します。テスト結果の要約と GitHub Actions の成否は公開します。

この公開版は **GitHub 経由で直接導入**できます。今回の更新は GitHub 配布のみで、npm への publish は行っていません:

```sh
npx github:rartaty/yasakani-jewel-personal init
```

---

【参考文献】国内外約70件ほどの資料  
Ex.）  
- [NIST SP 800-218: Secure Software Development Framework (SSDF)](https://csrc.nist.gov/pubs/sp/800/218/final)
- [OWASP Top 10: 2025](https://owasp.org/projects/top-ten)
- [OWASP Top 10 for LLM Applications and Generative AI: 2025](https://genai.owasp.org/llm-top-10/)
- [NIST SP 800-190: Application Container Security Guide](https://csrc.nist.gov/pubs/sp/800/190/final)
- [IPA / JPCERT/CC: 情報セキュリティ早期警戒パートナーシップガイドライン](https://www.ipa.go.jp/security/guide/vuln/partnership_guide.html)
