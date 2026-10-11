# 🔮 Yasakani Jewel (八尺瓊の宝玉) - 究極の取扱説明書（User Manual）

本取扱説明書は、個人開発者のPCや開発スピードに負荷をかけない「常駐プロセス・ゼロ」かつ「設計先制型」の自律セキュリティ監査ツール **Yasakani Jewel** を、あなたが120%使いこなすための公式マニュアルです。

> [!TIP]
> この取扱説明書は、プロジェクトの一番上の階層、またはドキュメント管理フォルダに保管し、いつでも参照できるように手元に置いておいてください。

> [!NOTE]
> **本書はマニュアル本体です。** 目的別の文書案内（仕様書 / 防衛能力 / 第三者検証ルール）はプロジェクトの [README.md](README.md) §📚 にまとまっています。「何を防げるか」「仕様」「変更履歴」を素早く知りたい場合は、まず README の目的別テーブルを参照してください。

---

## 🗺️ 1. Yasakani Jewel の全体ビジョン（概要フロー）

Yasakani Jewel は、ただコードを検査するだけの静的解析ツールではありません。
「1行もコードを書く前のアイデア段階」からあなたに伴走し、リスクを先制防御する**双方向型ガードレール・システム**です。

```mermaid
flowchart TD
    %% ユーザーおよびAIのアクション
    subgraph 開発者のアクション [👤 開発者のアクション]
        A0["設計・構想のアイデア相談<br>『○○という機能を作りたい』"]
        A1["ソースコードの記述・変更"]
        A2["手動強制監査の実行<br>『 checkmaga 』"]
        A3["想定インシデント詳細の要求<br>『 whydoubt ID 』"]
    end

    %% 設計先制シミュレータ
    subgraph ShiftLeft ["🛡️ 設計先制シミュレータ (Shift-Left)"]
        direction TB
        S1["1行もコードを書く前に<br>将来のインシデント&泥臭い手続きを推測"]
        S2["先制フェイル・セーフ設計の提案<br>(最初からセキュアに作る)"]
        S1 --> S2
    end

    %% システムの心臓部
    subgraph Engine ["🔮 Yasakani Jewel の頭脳 (3次元ポリシー)"]
        direction TB
        E1["① 開発フェーズ<br>(設計 ↔ 仮運用 ↔ 本番)"]
        E2["② 開発規模感<br>(S ↔ M ↔ L クラス)"]
        E3["③ 取扱アセット<br>(通常 ↔ 個人情報 ↔ 金融)"]
        
        E1 & E2 & E3 --> E_Calc["状況に合わせた<br>『引き算・足し算』の決定"]
    end

    %% 双方向ガードレール
    subgraph Guardrails ["🛡️ 双方向ガードレール & 制御"]
        direction TB
        G1{"AI自身が書く場合"} -->|バイパスなし| G2["『スキャンしますか？ (Y/N)』を毎回確認"]
        G3{"人間が書く場合"} -->|出力直前| G4["裏でスペルミス・タイポ含め<br>網羅的にスキャン"]
        
        G2 & G4 -->|各フェーズごとに個別に| G_Off["OFF (無効化) に設定可能"]
    end

    %% アウトプットのハイブリッド制御
    subgraph Output ["📊 アウトプット (ハイブリッド制御)"]
        direction TB
        O1{"監査の結果は？"}
        O1 -->|日常: 問題なし| O_Silent["🔇 完全無表示 (サイレント)<br>ノイズ & トークン消費『ゼロ』"]
        O1 -->|日常: 警告あり| O_Slim["⚠️ 最小限Diffコードのみ表示<br>(コピペ用Before/Afterコード)"]
        O1 -->|checkmaga 実行時| O_Full["📑 フルスペック詳細レポート<br>(合格項目・改善案・最悪の被害)"]
    end

    %% 課題管理と証跡
    subgraph Ledger ["📋 課題管理 & 証跡保存"]
        L1[("risktaskboard.md<br>(リスクタスクボード)")]
    end

    %% つながりの定義
    A0 -->|設計アイデアの入力| ShiftLeft
    ShiftLeft -->|フェイル・セーフを意識して| A1
    
    A1 --> Engine
    A2 -->|自動チェックOFFでも強制起動| O_Full
    A3 -->|インシデント詳細を展開| O_Full
    
    Engine --> Guardrails
    Guardrails --> O1
    
    O_Slim -->|新規リスク検知| L1
    O_Full -->|新規リスク検知| L1
    A1 -->|修正完了をAIが検知| L1 -->|ステータスを【解決済】に更新・証跡保存| L1
```

---

## 🛠️ 2. インストール

Yasakani Jewel は npm パッケージとして配布されます。プロジェクトのルートディレクトリで、以下の **1 コマンド**を実行するだけで導入が完了します（手で配置・コピーするファイルはありません）。

```sh
npx github:rartaty/yasakani-jewel-personal init
```

GitHub Actions で全体検査も行う場合は `npx github:rartaty/yasakani-jewel-personal init --ci` を実行します。生成された `.github/workflows/yasakani-security.yml` をレビューし、GitHub の ruleset / branch protection で **Yasakani security scan** を必須に設定してください。検査器は生成時の base64 snapshot と SHA-256 を workflow に含め、runner の一時ディレクトリで復元します。配布元が非公開でも認証なしで実行でき、対象リポジトリの npm scripts は実行しません。

CI の policy は生成時の snapshot（`YASAKANI_POLICY_B64`）です。policy や検査器を更新するときは workflow 内の snapshot と hash もレビューしてください。base64 は暗号化ではなく、SHA-256 は整合性確認です。異なる既存 workflow は自動上書きしません。`uninstall` 後も CI workflow は残します。非公開リポジトリで必須チェック設定が利用できるかは GitHub の契約にも依存します。

`init` が自動で配置・配線するもの:

```text
[あなたのプロジェクトルート]
 ├── .yasakani/
 │    ├── yasakani-jewel.md   <-- AI 指示書（Claude の脳）
 │    ├── .yasakanirc         <-- 3次元ポリシー設定 (JSON)
 │    ├── prompt-policy.json  <-- AI prompt Markdown の公開/非公開分類
 │    └── scan.js             <-- プリフィルター・スキャナ
 ├── CLAUDE.md / GEMINI.md / AGENTS.md / .cursorrules /
 │   .github/copilot-instructions.md   <-- 各 AI 設定へポインタを「追記」（既存内容は保持）
 ├── .git/hooks/pre-commit    <-- git フック（git リポジトリの場合のみ）
 └── .vscode/settings.json    <-- 保存時スキャン設定（VS Code / Cursor）
```

> [!NOTE]
> 必要環境は **Node.js 16 以上**のみ（`npx` は Node に同梱）。`.bat` や PowerShell は不要で、Windows / Mac / Linux 共通で動作します。配線を除去したい場合は `npx github:rartaty/yasakani-jewel-personal uninstall` を実行してください。

---

## 🏃 3. 日常の操作手順（基本ワークフロー）

### 3.1 多層自動トリガー（環境に応じて自動配線）

Yasakani Jewel は「保存の瞬間」だけに頼らず、**4つの層**で監査をかけます。
プロジェクトルートで `npx github:rartaty/yasakani-jewel-personal init` を一度実行するだけで、
あなたの環境で使える層が **自動で配線** されます（追加の手動インストール不要）。

| 層 | トリガー | 必要なもの |
|---|---|---|
| **A. AIチャット連携** | AI（Claude/Cursor/Copilot）がコードを生成・変更する瞬間 | なし（指示書ポインタを各 AI 設定へ自動追記） |
| **B. git pre-commit** | `git commit` 実行時 | git リポジトリ（フックを自動設置） |
| **C. 保存時スキャン** | エディタでファイル保存（Ctrl+S） | VS Code / Cursor（Run on Save 拡張を自動インストール） |
| **D. 手動** | `checkmaga` 入力 / `npx github:rartaty/yasakani-jewel-personal scan` 実行 | なし（いつでも使える） |

* **git 連携プロジェクト** → A+B+C+D すべて。
* **git 非連携プロジェクト** → A+C+D（B のみ非対応）。
* **VS Code/Cursor 以外のエディタ** → A+D（+ git なら B）。

> [!NOTE]
> 「保存の瞬間」に処理を走らせるには、OS／エディタ仕様上どうしても
> 「保存イベントを監視する誰か」が必要です。Yasakani Jewel は常駐デーモンを
> 一切持たない方針のため、その役を Run on Save 拡張（層C）または git フック
> （層B）に委ねています。どちらも `npx github:rartaty/yasakani-jewel-personal init` が自動で配線します。

> [!TIP]
> 層B（コミット時）でリスクが見つかると、秘密情報が履歴に入る前に
> **コミットを中断**します。検知内容または検査失敗を修正して再実行してください。worktree とプロジェクト内 `core.hooksPath` に対応し、既存 shell フックの先頭で検査します。非 shell フックや外部共有パス・外部へのリンクは保持して配線未完了を通知します。ローカルフックは回避できるため、CI の必須チェックも併用してください。

---

### 3.2 【手動】手動でローカルチェックを行う場合
コミット前や、任意のタイミングで手動でチェックしたい場合は、ターミナルで以下を叩くだけです。

```sh
npx github:rartaty/yasakani-jewel-personal scan
```

既存ファイルや `.gitignore` 対象を含めて確認するには `npx github:rartaty/yasakani-jewel-personal scan --all`、指定範囲だけなら `scan --all src config` を使います。`.git` / `node_modules` / `.yasakani` の探索、バイナリ資産、lockfile 本文は対象外です。過去の commit に残る秘密情報は `scan --history` で検査できます（ローカル全参照の reachable commit。shallow clone は不可、未取得のリモート履歴・reflog・submodule は別途検査）。

フック用の `scan --staged` は実際の index 内容だけを検査します。終了コードは `0`（ブロック対象なし）、`1`（懸念あり）、`2`（読み取り・設定等の検査失敗）です。存在しない指定ファイル、シンボリックリンク、20 MiB 超ファイルは検査失敗になります。

特定ファイルだけを確認したい場合は、パスを指定できます。git リポジトリ内でも、明示指定されたファイルを直接スキャンします。

```sh
npx github:rartaty/yasakani-jewel-personal scan path/to/file.md
```

> [!NOTE]
> **「何も警告が出ない（正常）」が最強の状態です。**
> プリフィルターはブロック対象が見つからなければ沈黙します。検査時間は対象量に依存し、無警告でも安全性の証明にはなりません。AI の自動起動は行わず、詳細監査は AI チャットで `checkmaga` を実行してください。
> ハードコード秘密情報に加え、メールアドレス・日本の電話番号・郵便番号・住所らしき文字列・`氏名` / `名前` / `address` / `email` / `phone` 等のラベル付き個人情報も検知し、Git への混入をコミット前に止めます。
> Markdown (`.md` / `.mdx`) では、通常の長文による高エントロピー誤検知を抑えつつ、`System Prompt`、`Tool Definitions`、`network_configuration`、`filesystem_configuration`、`Ignore previous instructions`、`{antml:...}` などの AI 指示書・プロンプト断片を検知します。
> AI への指示を含む Markdown は、`.yasakani/prompt-policy.json` に従って置き場所ごとに扱います。既定では、`prompts/public/**` は公開用サンプルとして通知だけを出し、commit は止めません。`prompts/private/**` と `private/**/system-prompt.md` は非公開ファイルとして commit を止めます。`*.system-prompt.md` は実運用の system prompt の可能性が高いため、強い警告を出して commit を止めます。どの分類にも当てはまらない場合も、誤って公開しないよう commit を止めます。ファイルを公開用・非公開用・実運用 prompt のいずれかの場所へ移動するか、policy にルールを追加してから再実行してください。git hook / CI は入力待ちをせず、必要な対応を警告として表示します。

---

## 💬 4. AIチャットでの特殊コマンド一覧（ハイブリッドコマンド）

AIチャット（Claude / Cursor / Copilotなど）の対話画面で以下のコマンドを入力することで、Yasakani Jewel の監査機能が直接起動します。

> [!IMPORTANT]
> **【Claude Code (CLI) をお使いの皆様へ】**
> Claude Codeの対話画面（CLI）において `/checkmaga` などのスラッシュ付きコマンドを入力すると、**Claude Code CLI 自体のビルトインシステムコマンドとしてパースされ、エラーになってしまいAI（Yasakani Jewel）まで届きません。**
> そのため、**「スラッシュをつけないプレーンテキスト（例：`checkmaga`）」**で入力してください。Yasakani Jewel は、スラッシュなしのテキストでも完全に同じようにコマンドを検知する「ハイブリッド仕様」に最適化されています。

> [!TIP]
> **💡 コマンド入力時のコツ（ファイル名部分一致による誤認防止）**
> プロジェクトルートに `checkmaga-search.csv` などの `checkmaga` というキーワードが含まれるファイルが存在する場合、Claude Code CLI で単に `checkmaga` と打つと、CLI側のシステムが「そのファイルを操作（中身の読み書きなど）したいのだろう」と勘違いし、空ファイル読み込みエラー等のバグを引き起こすことがあります。
> これを完全に回避するために、以下のいずれかの方法で入力することを強く推奨します。
> * **平仮名で入力する**: `ちぇくまが`
> * **プレフィックスを付与する**: `yasakani checkmaga`
> 
> Yasakani Jewel のAI頭脳は、これら平仮名表記やプレフィックス付きの呼び出しに対しても、完全に同一の「手動強制監査コマンド」として最優先で自律解釈するよう徹底教育されています。

### 🔮 ① 全体強制監査・設計先制相談: `checkmaga` (または `/checkmaga` / `ちぇくまが` / `yasakani checkmaga`)
最もよく使う中核コマンドです。開発の進行状況（フェーズ）によって、自動的に挙動が最適化されます。

* **【まだコードを書いていない「設計・モック段階」】**
  * **相談方法**: `checkmaga 〇〇という機能（例：Stripe決済連携）を作りたい` と入力。
  * **AIの挙動**: 「設計先制シミュレータ」が起動。将来発生し得る最悪のセキュリティインシデント（例：決済API爆死による高額請求など）を予測し、最初から安全に作るための**「最小限のセキュアひな形Before/Afterコード」**をその場に提示します。
* **【すでにコードを実装している段階】**
  * **スキャン方法**: `checkmaga` とだけ入力。
  * **AIの挙動**: 日常のサイレントモードを例外的に解除し、出典ガイドの **MECE 構造（3レイヤー × 2状態 = 6領域）＋ 10 項目の Gap Defenses** を網羅した詳細レポートを生成します。
  * **【ローカル監査証跡として保存】** レポートは Markdown ファイル `checkmaga-reports/YYYYMMDDTHHMMSS-checkmaga.md` として**必ず保存**されます。検出されたリスクだけでなく、検査した全項目（問題なし項目も `✅ 検査済`、対象外も `N/A — 理由`）が列挙され、「ここまで何を確認したか」が後から辿れます。**git 管理対象外がデフォルト**（`.gitignore` 済）— ローカル保管のみで、リモートには push されません。
  * **【低信頼 Finding】** 確定根拠が弱い項目は捨てず、コミットブロックや PR コメントではなく、レポートの「調査候補（低信頼・非ブロック）」に隔離して残します。
  * **【重複して見える記載】** 同じリスクが複数セクションに出る場合があります。これは MECE 6 領域 / Gap Defenses / 対象ファイル / 未解決リスク / 修正Diff の各観点で確認証跡を残すためであり、レポート末尾にその出力方針を明記します。
  * **【スコープ宣言】** レポート最終セクションに **OSI 参照モデル別カバレッジ** が付き、本ツールでカバーできない領域（L1〜L4 / 物理 / 人的 / 運用 / AI 自身の堅牢性 等）を率直に開示します。「何を見ていないか」が利用者にとっても明確になります。
  * **チャット側の出力**: 生成されたレポートファイルへのリンクと、検出された未解決リスクの Before/After Diff のみ。長文の重複は出力されません。

---

### 🔍 ② リスク因果の追及: `whydoubt [リスクID]` (または `/whydoubt [リスクID]`)
日常の警告時に表示されるリスクID（例: `RTB-001`）について、その背景を深く知るためのコマンドです。

* **入力例**: `whydoubt RTB-001`
* **AIの挙動**:
  日常の画面ノイズを極小化するために普段は隠されている、**「最悪のインシデントシナリオ」**と、それに伴う**「泥臭い復旧手続き（各種サポートとの英語での交渉、全トークンの無効化ロール手順等）」**を赤裸々にシミュレーションして解説します。

---

### 🚨 ③ インシデント緊急対応: `incident` (または `/incident`)
万が一、APIキーが流出したり、不審な通信（ハッキング）を発見したなどのトラブル時に使用します。

* **入力例**: `incident`
* **AIの挙動**:
  経産省「サイバー攻撃被害に係る情報の共有・公表等に関するガイダンス」に準拠した**「2分類モデル」の報告用日本語ドラフト**を即座に自動生成します。
  1. **① 攻撃情報の「共有」ドラフト**: 個人情報を含まず、速やかにIPAやJPCERT/CCに報告するためのテクニカルデータ。
  2. **② 被害内容の「公表」ドラフト**: ユーザー保護・お詫び・公式リリース用のメールテンプレート。
  3. **③ 物理的初動チェックリスト**: パニック状態を抑え、数分以内に実行すべき「APIキー即時ロール、サーバープロセス遮断」などの応急処置手順。

---

## 📋 5. リスクタスクボード (`risktaskboard.md`) の見方

リスクが検出されると、プロジェクトルートに `risktaskboard.md` が作成されます。これは単なるバグ管理表ではなく、**「あなたの安全な開発を証明する監査証跡（歴史）」**です。

### 🎮 ゲーム感覚で解決していくルール
* **[未解決] のタスク**:
  AIから提示された `Before/After Diff` コードをコピーして、あなたのソースコードを修正してください。
* **[解決済] への移動**:
  コードを修正すると、AIはそれを自動で検知し、タスクを削除するのではなく **「解決日時」と「解決方法」を追記して [解決済] の履歴に自動移動**させます。
* **メリット**:
  開発が進むほど、安全を証明する客観的なログ（監査証跡）が蓄積され、ゲームのクエストをクリアしたような達成感を得られます。

---

## 🔐 6. 第三者検証・フレンド環境での共有ルール

フレンドや外部協力者のプロジェクトで Yasakani Jewel を検証する場合は、**検証対象プロジェクトの持ち主のPCでローカル実行**してください。Yasakani Jewel は初期版では外部 API や PR コメントを使わない設計ですが、レポートやスクショを人間が共有すると、そこから機密が漏れる可能性があります。

### 共有してはいけないもの

- `checkmaga-reports/*.md` の生ファイル
- `risktaskboard.md` の生ファイル
- ターミナル出力やエディタ画面のスクショ
- AIチャット履歴
- ソースコード、git diff、パッチ、コミットURL
- `.env`、秘密鍵、APIキー、設定ファイル、エラーログ
- 実ユーザー名、顧客名、取引先名、メールアドレス、電話番号、住所
- 実ドメイン、IPアドレス、クラウドアカウントID、バケット名、DB名、ローカルパス、ブランチ名、コミットID

### 共有してよいもの

- 検出件数（例: `FAIL 2 / WARN 5 / 調査候補 3`）
- 誤検知っぽいカテゴリ（例: `PII`, `CI/CD`, `Dockerfile`）
- レポートで読みにくかったセクション名
- どの説明が分かりづらかったか
- 実値を伏せた redacted 版の最小抜粋

### redacted 版を作るときのルール

- 値は `[secret]`, `[email]`, `[phone]`, `[customer]`, `[domain]`, `[ip]`, `[path]`, `[account-id]` のように置換する。
- コード全体ではなく、相談に必要な数行だけに絞る。
- 伏せた後でもプロジェクトや顧客を推測できる情報が残っていないか確認する。
- 判断に迷う場合は、共有せず「カテゴリ・件数・困った点」だけを伝える。

---

## ❓ 7. よくある質問 (FAQ)

#### Q1. 日常にチェックを一時的にバイパス（ON / OFF）したい場合は？
設定ファイル `.yasakani/.yasakanirc` の `"bypass_permission"` 内の各フェーズ（`design`, `staging`, `production`）を `true` に書き換えることで、個別にバイパスできます。
> [!WARNING]
> セキュリティの死角を防ぐため、すべてのフェーズを一括で `true`（全面バイパス）にすることはできません。必ず個別に設定してください。

#### Q2. バイパスがONのときにAIに警告されます。消せますか？
自動確認の戻し忘れ（ゾンビ化）を防ぐため、バイパスがONの間は、AIの回答の末尾に「⚠️注意: バイパスがONになっています」という小さなサイレント警告が自動付与されます。設定を `false` に戻すことでこの警告は消えます。

#### Q3. 日常で警告が出たとき、どうやって修正すればいい？
AIは長文の解説を省き、コピペでそのまま置換できる **Before/After Diffコード** をピンポイントで提示します。
```diff
- 脆弱なコード（Before）
+ 安全なコード（After）
```
この「After」のコードをそのまま対象ファイルにコピー＆ペーストするだけで、セキュリティ修正は一瞬で完了します。

---

🔮 **Yasakani Jewel は、あなたの開発スピードを邪魔することなく、見えない盾となって資産とコードを守り続けます。**
何か困ったことや、インシデントの不安がある時は、いつでもチャットで `checkmaga` と話しかけてください！

## 8. 外部ログのオンデマンド点検

外部の監視ツールからエクスポートしたローカルログを、一度だけ点検できます。Zero Daemon を維持し、監視ツールへの接続・通信遮断・鍵失効は実行しません。

```sh
npx github:rartaty/yasakani-jewel-personal audit logs events.jsonl
npx github:rartaty/yasakani-jewel-personal audit logs events.jsonl --since 2026-09-11T00:00:00+09:00 --until 2026-10-11T23:59:59+09:00
npx github:rartaty/yasakani-jewel-personal audit logs events.jsonl --profile profile.json --json
npx github:rartaty/yasakani-jewel-personal audit logs events.jsonl --output checkmaga-reports/log-review.md
```

入力は **通常ファイルの UTF-8 JSON Lines（1行1 JSON object、最大20 MiB／50,000レコード）**。最後のコマンドは保存先の親ディレクトリを先に作成してください。既存ファイルを上書きしません。出力はローカル証跡として扱い、第三者へ生共有しないでください。導入先では保存先を Git 管理外にすることも確認してください。

### 入力形式

```json
{"timestamp":"2026-10-11T09:00:00+09:00","event":"login","actor":"synthetic-actor","sourceIp":"198.51.100.1","status":"failure"}
{"timestamp":"2026-10-11T09:01:00+09:00","event":"data_read","actor":"synthetic-actor","status":"success","bytes":104857600}
{"timestamp":"2026-10-11T09:02:00+09:00","event":"role_change","actor":"synthetic-actor","status":"success"}
```

上記は架空の例。timestamp は timezone 付き ISO 日時、event／actor／status は全レコードで必須。actor は操作主体の識別子。event は login／data_read／egress／account_create／account_enable／role_change、status は success／failure。login の failure には有効な IPv4／IPv6 の sourceIp が必要。data_read／egress の success には非負の整数 bytes が必要で、不明な値を0で埋めないでください。提供した sourceIp／bytes の形式は他の event でも検査します。余分な raw payload・URL 等は分析・出力に使用しません。

異なる製品のログは平坦な field と event／status の対応を profile JSON で指定できます。ネストされた JSON、CSV、syslog、EDR 独自形式は直接対応していません。ローカルで正規化してから渡してください。

```json
{
  "fields": {"timestamp":"time","event":"operation","actor":"principal","sourceIp":"ip","status":"result","bytes":"size"},
  "events": {"export":"data_read","permission_update":"role_change"},
  "statuses": {"ok":"success","denied":"failure"},
  "thresholds": {"windowSeconds":300,"loginFailures":10,"dataReadCount":1000,"dataReadBytes":104857600}
}
```

profile は通常の UTF-8 JSON ファイル（最大1 MiB）。指定した値は既定の対応に追加・上書きされます。fields の key、対応先 event／status、thresholds の名前は上記のものだけを受け付けます。threshold は正の整数。スクリプトや外部取得は実行しません。

### 判定と確認範囲

- 同じ送信元から、既定で300秒以内に10件以上のログイン失敗。
- 同じ主体・同じ event で、300秒以内に1,000件以上または100 MiB以上の取得／転送。data_read と egress は分けて数える。
- 成功したアカウント作成・再有効化・権限変更。承認済みか元ログで確認する候補であり、通常の操作も含む。

判定窓は入力順に依存しない sliding window。閾値判定は主体／送信元ごとに最初の到達を1候補として出し、権限変更は同じ主体・event をまとめます。候補は最大200件を表示し、総数と省略数を明示します。元の主体・IP は今回だけの対象番号に置き換え、行番号・UTC 日時を記録します。

IPv6 の省略表記や IPv4-mapped IPv6 は正規化して同じ送信元として数えます。scope ID 付き IPv6 は対応外です。再現性のため入力テキスト（UTF-8 デコード・BOM 除去後）と解決済み profile の SHA-256 を記録します。hash はログの真正性を証明しません。

全体の確認範囲は「提供ログを点検済み／設定コードは未確認／実環境は未確認」。ルールに該当するログがなければ、そのルールは「未検証」。候補が0件でも、対応ルールの範囲で所見がなかったという意味で、漏洩なし・環境全体の安全を証明しません。ログの真正性・完全性・欠落や通常時との比較も未検証です。

期間指定は両端を含み、期間外レコードも形式を検査して除外件数を記録します。途中に不正行があれば全体を exit 2 とし、部分的な成功レポートは出しません。空ログ・全件期間外・不明形式・読取失敗も exit 2。exit 1 は調査候補、exit 0 は候補なし。stdout はレポート、stderr は生の値を含めない検査失敗の説明です。

調査候補の妥当性を元ログ・通常利用・承認記録と照合し、異常が確認された場合は担当者へ連絡して証拠保全と対象サービス側の対応へ進めてください。
