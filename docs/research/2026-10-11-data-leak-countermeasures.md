# 直近1か月の情報漏洩事例と Yasakani の対応可能性

調査日: 2026-10-11（Asia/Tokyo）

対象期間: 2026-09-11〜2026-10-11 に公表・更新された情報。国内の一次資料を中心とする代表事例調査であり、全世界の被害件数の集計ではない。公表日と発生日、確定漏洩と漏洩の可能性を区別した。

実装照合は 2026-10-11 の機能追加前の状態を基準とする。以下は調査時点の設計提案。公開版で追加したログ点検と確認範囲の機能は、現在の取扱説明書 §8 を参照。

## 結論

有効性を優先するなら、**利用製品の脆弱性管理、API の認可テスト、管理機能・資格情報の権限と公開範囲の縮小**を追加する。現行の秘密情報・PII 検知だけでは、稼働中サービスから情報を取得される経路を十分に検証できない。

Yasakani に「決まった検査を実行して根拠付きの結果をまとめる」機能を追加することは可能。軽量スキャナは維持し、専門検査器を任意の独立ジョブとして連携する方式を推奨する。API テストは導入先ごとの権限仕様が必要。VPN の実機更新や資格情報失効、通信遮断は、管理対象システムで実施する運用対策となる。

## 期間内の一次資料で確認した事例

| 公表・更新 | 事例／資料 | 確認された内容 | 対策への示唆（本調査の判断） |
|---|---|---|---|
| 2026-09-11 | [デジタル庁 GSS](https://www.digital.go.jp/news/2026-0911-01) | VPN の脆弱性を利用した侵入。保守担当アカウントから大量ファイルへアクセスし、約24.6万件の個人情報が漏洩した可能性。検知は2026-06-25、侵入原因判明・遮断は2026-07-09。 | アプリの依存だけでなく接続機器も棚卸し。保守権限の縮小、アクセス監査、失効と遮断の準備が必要。 |
| 2026-09-18 | [JGC Digital](https://jgc-digital.com/topics/topics-3049/) | BI ツール Metabase の脆弱性を悪用。2026-09-16 に異常検知し、顧客情報の取得を確認。対象は合計約6万アカウントで、人数とは異なる。 | 管理・分析ツールも保護対象。公開文に CVE は示されておらず、特定 CVE を原因と断定しない。 |
| 2026-09-25 更新（初報2026-09-16） | [Gyazo 第2報](https://help.gyazo.com/Notice%20Regarding%20Unauthorized%20Access%20to%20Gyazo%20%28September%2025%2C%202026%29-6ab648b661f85ecc9543375f) | ユーザー情報と画像メタデータの流出。以前に削除された画像のメタデータ約1.74億件も対象。件数は画像ファイルの流出件数を意味しない。影響した OAuth 認証情報は失効済み。 | 保持するメタデータと共有設定も点検。画面での削除だけで保存終了を確認したことにしない。 |
| 2026-10-08 公開／2026-10-09 更新 | [JPCERT/CC 注意喚起](https://www.jpcert.or.jp/at/2026/at260030.html) | 既知の脆弱性探索、管理・内部 API の悪用、他システムで盗まれた API キーの利用、Web シェル設置を報告。同一原因による一連の事件とは断定していない。 | API、管理ツール、機器、運用まで複数の経路を確認する必要がある。 |

2026-10-09 の [IPA の注意喚起](https://www.ipa.go.jp/security/security-alert/2026/alert20261009.html) は、外部公開アプリ・利用サービス・アカウント・保有データの点検を求めている。これを、導入先の棚卸しと証跡をまとめる入口にできる。

## 有効な対策と実行方法

以下は、上記の被害経路と公式の対策資料を踏まえた実装上の判断。各機能の追加自体で漏洩防止を保証するものではない。

| 優先度 | 対策と実施内容 | Yasakani の現在 | 追加可能な機能／制約 |
|---|---|---|---|
| 高 | 製品・バージョン・公開先・管理者の棚卸し、既知の脆弱性の照合、修正済み版への更新 | package／lockfile の変更通知のみ。SBOM／CVE 照合は未実装。 | lockfile・SBOM・コンテナの専門検査器と連携。VPN／BI／SaaS は別の資産台帳も入力する。機器や SaaS の状態はソースだけでは判定できない。 |
| 高 | 全 API の認可。利用者AがBのデータを読めない、一般利用者が管理操作できない、無認証・不正トークンを拒否するテスト | AI 指示書の監査項目。決定的な API テスト機能はない。 | OpenAPI＋権限表＋専用テストアカウントで、許可／拒否双方の回帰テストを実行。対象ごとの期待結果が必要。正規表現だけでは証明できない。 |
| 高 | 管理画面・BI・ストレージの公開範囲を縮小。IAM 最小権限、不要な管理機能を非公開にする | CI／Docker 変更は通知のみ。公開設定の意味的検査はない。 | IaC・CI の構造化ルール検査を任意連携。実環境との差分は read-only cloud API 等の別監査が必要。 |
| 高 | 秘密情報を commit させない。流出済みの鍵は失効・再発行し、履歴と利用ログも調べる | --staged／--all／--history と pre-commit は実装済み。検知は heuristic。 | 残る検知漏れを修正し、専門 secret scanner を導入先にも併用。検知器は外部サービスの鍵を自動失効しない。 |
| 高 | 資格情報の短命化、最小 scope、失効手段、MFA。CI の長期クラウドキーを減らす | 指示書によるレビュー。利用者の MFA 登録や実際のトークン状態は未取得。 | 設定点検・対応手順・任意の管理 API 連携。本人登録、失効、session 切断は対象サービス側で実施。 |
| 中 | 大量取得、異常な管理操作、アカウント作成・権限変更、Web シェルの痕跡をログで調べる | ログ分析・実時間監視は未実装。 | ローカルで既存ログを読み、期間と根拠を付けた調査候補を出すことは可能。継続監視・遮断は EDR／ネットワーク／クラウド側。 |
| 中 | 保有データと保存期間を点検。不要な個人情報・メタデータを残さず、共有を制限する | ソース中の一部 PII を検知。DB・SaaS の実データや保持状態は未検証。 | schema／設定／共有ポリシーと専用テストによる確認。実データをレポートに複製しない。削除の実行は保存義務と対象を確認する別操作。 |

API のレコード単位の認可と回帰テストは [OWASP BOLA](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/) を根拠とする。トークン検証・失効、管理 endpoint の公開制限、機密値を URL に入れない設計は [OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) に沿って点検する。

MFA は重要だが、盗まれた既存トークンや認可不備への対策も必要。rate limit は大量取得を抑える補助となり、他人の情報を読める認可不備そのものは修正する。暗号化も、正当な読取り権限を奪われた場合のアクセス制御の代わりにはならない（本調査の技術的判断）。

## 現行コードとの照合

| 確認対象 | 根拠 | 判断 |
|---|---|---|
| CLI の実装コマンド | [yasakani.js:14](../../bin/yasakani.js#L14) | init／scan／uninstall／help。以下で提案する専用 audit 機能はまだない。 |
| Secret／PII | [scan.js:24](../../src/scan.js#L24)、[scan.js:99](../../src/scan.js#L99)、[scan.js:364](../../src/scan.js#L364) | 行単位の pattern と entropy 検査。構文・データフローの完全解析ではない。 |
| Prompt 資産 | [scan.js:299](../../src/scan.js#L299) | private／system 指定パスは無条件 block。その他は Markdown の marker に依存。実行時 prompt injection の防御機構ではない。 |
| 依存／コンテナ／CI | [scan.js:397](../../src/scan.js#L397) | notice のみ。lockfile 本文は secret 検査から除外。CVE・公開設定・workflow の安全性は自動判定しない。 |
| 検査対象の境界 | [scan.js:426](../../src/scan.js#L426)、[scan.js:460](../../src/scan.js#L460) | --all も .git／node_modules／.yasakani／binary 等を除外。履歴はローカル参照から到達可能な commit。取得していない remote 履歴は含まれない。 |
| 導入先の生成 CI | [security-scan.yml:36](../../templates/security-scan.yml#L36)、[init.js:178](../../src/init.js#L178) | scanner と policy の snapshot を復元して --all。履歴検査と Gitleaks は生成されない。snapshot 更新は別途必要。 |
| Yasakani 自身の CI | [test.yml:50](../../.github/workflows/test.yml#L50) | Gitleaks 履歴検査あり。導入先の CI と同一ではない。 |
| AI の監査観点と実行範囲 | [yasakani-jewel.md:152](../../templates/yasakani-jewel.md#L152)、[yasakani-jewel.md:325](../../templates/yasakani-jewel.md#L325) | 認可／SBOM 等は指示書に存在するが、検査エンジンの実装・実環境の安全を意味しない。 |

架空値を使った既存 detectContent helper の確認では、複数行 password、JSON の引用符付き full_name、JSON の instructions、日本語だけの未分類 Markdown prompt は block 0 件。対照の dotenv secret と private パスの日本語 prompt は block 1 件。これは残る検知範囲の不足であり、導入先で漏洩が発生した証拠ではない。未対応項目は YJ-TB-010 に記録する。

確認方法は require('./src/scan').detectContent(content, file) を直接呼び、action が block の結果数を数えるもの。CLI／Git hook の end-to-end 検証とは区別する。主担当でも次の3入力の block 0 件を再確認した（値はすべて架空）。

| file 引数 | content 引数 |
|---|---|
| app.js | 下記の2行の文字列 |
| user.json | {"full_name":"Synthetic Person"} |
| docs/agent.md | あなたは非公開の社内アシスタントです。 |

```javascript
const password =
"demo-demo";
```

## 推奨する追加構成と順序（未実装）

### 1. 基本検査の補強＋利用製品の脆弱性検査

- 検知漏れを再現 fixture にして secret／PII／prompt 分類を補強。対象ごとに誤検知も評価する。
- 専門 secret scanner の履歴検査と、依存・SBOM の既知脆弱性検査を任意の独立ジョブにする。必須ツール不在・検査失敗を「安全」と扱わない。
- 初期候補は OSV-Scanner。公式資料で [lockfile／SBOM 検査](https://github.com/google/osv-scanner/blob/main/docs/scan-source.md) と [offline mode](https://google.github.io/osv-scanner/usage/offline-mode/) を確認した。事前に DB を取得し、--offline で検査すれば依存情報を送信しない。--offline-vulnerabilities だけでは他機能の通信が残り得るため、両者を混同しない。
- 検査器と DB の版・取得日・対象資産を記録する。新しい CVE はコード変更がなくても追加されるので、定期再検査も必要。OSV の対象外製品はベンダー通知／資産台帳で補う。
- tradeoff: 外部バイナリと DB の供給・更新管理が増える。既知 CVE にない脆弱性や悪性パッケージを網羅できない。

### 2. API 認可テスト＋公開設定／CI 点検

- 導入先の endpoint・HTTP method・role・tenant／owner・期待結果を権限表にする。正当アクセスと拒否ケースを両方実行する。
- 専用データのローカル／staging 環境で実施し、レスポンスの機密情報露出や失敗した操作の副作用も確認する。権限表にない endpoint は「未検証」とする。
- CI／IaC は専門の構造化 rule engine で点検。危険な trigger と未信頼コード実行、過剰 token 権限、公開 storage、広すぎる ingress を対象にする。
- [GitHub の公式対策](https://docs.github.com/en/actions/reference/security/secure-use) に沿い、Actions の SHA 固定、最小権限、未信頼入力の扱い、必要に応じた OIDC を確認する。
- tradeoff: 汎用化には導入先ごとの設定が必要。静的 IaC 検査は手動変更された実環境を証明できない。

### 3. ログ点検＋インシデント対応の証跡

- read-only のログ取込みで、時刻・主体・操作・成否・取得量を比較する。調査候補と根拠をローカルレポートへ残す。
- 調査時点2026-10-11を基準に、まず2026-09-11以降、次に2026-07-11以降へ広げる。これは IPA の段階的なログ点検を絶対日付にした運用例。サービスごとの保持期間と取得担当を確認する。
- 公表 IoC の IP や User-Agent だけで侵害を断定しない。観測期間付きの調査材料にする。
- 失効・session 切断・機器隔離・証拠保全の手順と担当を記録する。Yasakani に常駐通信監視を追加する場合は現行 Zero Daemon 方針の変更になる。
- tradeoff: ログ取得権限と形式の統一が必要。過去ログの点検は常時検知や遮断にはならない。

## 影響範囲と実装時の検証基準

| 対象 | 想定する変更・影響 | 検証基準 |
|---|---|---|
| src/scan.js・fixture 評価 | 既存検知漏れの補強。新たな誤検知が commit を止める可能性。 | 上記再現例の検知と通常 JSON／Markdown の非検知を両方確認。 |
| CLI と外部検査 adapter | 入力・出力・終了状態の統一。軽量 scanner の外部依存ゼロを維持するため分離する。 | 固定引数で実行し、機密値を伏せる。tool 不在・異常終了・古い DB を「検査済み問題なし」にしない。 |
| src/findings.js・ローカル報告 | 既存カテゴリを利用し、検査対象・対象外・未検証・DB 日付を追加。 | 実施していない項目を成功扱いしない。raw token／PII／plan・state 値を報告に含めない。 |
| src/init.js・CI template | 任意ジョブの配線、snapshot 更新手順、必須チェックの設定案。 | 既存 workflow を保持。導入先で検査器の復元と終了状態を確認。CI 変更は実装合意後に行う。 |
| 導入先の API・資産・ログ | テスト環境、権限表、機器台帳、担当者の準備。Yasakani 本体だけでは完結しない。 | 権限仕様と実行結果の対応、棚卸し漏れ、実環境の drift を確認。 |


調査の到達点: 一次資料とコードの対応付け、および helper による検知範囲の確認。実環境の侵害調査・脆弱性判定、機器の更新、対策機能の実装は今回の調査では行っていない。検知漏れは未対応として記録し、実装対象の決定時に優先度を確定する。
