# メディア処理・配信サービス 設計書

## 1. システム概要

家族写真アプリケーションにおけるメディア（画像・動画）の変換・配信パイプラインの設計書。

### 1.1 背景・課題

現行アーキテクチャでは、画像のリサイズ・フォーマット変換を Vercel 上の Next.js API Route (`/api/optimize`) で Sharp を使用して実行している。しかし Vercel のリクエスト/レスポンスサイズ制限に到達し、大きな画像の変換が不可能になった。

### 1.2 参考実装

大枠の仕組み（Cloud Run + Cloudflare Workers による画像変換・配信パイプライン、GitHub Actions CI/CD）は以下のリポジトリに実装済み。本設計はこれをベースに family-photo 向けにカスタマイズしたものである。

- https://github.com/sendo-kakeru/image-processing-delivery-rust

### 1.3 解決方針

画像変換処理を Cloud Run (Rust) に移行し、Cloudflare Workers によるキャッシュレイヤーを追加することで、制限のない高速なメディア配信を実現する。将来的な動画処理にも対応可能な汎用的なコンポーネント命名・構成とする。内部サービス間はプラットフォームネイティブの認証機構（Cloud Run IAM / Cloudflare Service Bindings / Cloudflare Access）で保護し、ユーザー認証は現行の next-auth (Google OAuth) を維持する。

---

## 2. アーキテクチャ

### 2.1 コンポーネント構成

| コンポーネント  | 技術                      | 役割                                                                                |
| --------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| Frontend        | Next.js (Vercel)          | UI・メディア管理 API（一覧・削除・アップロード署名URL発行）                         |
| Edge Cache      | Cloudflare Workers (Hono) | キャッシュ判定・next-auth トークン検証・Cloud Run / Storage Proxy へのプロキシ      |
| Media Processor | Cloud Run (Rust / Axum)   | メディア変換（リサイズ・フォーマット変換・品質調整・メタデータ削除）                |
| Storage Proxy   | Cloudflare Workers (Hono) | B2 への署名付きリクエスト代行（Cloudflare-B2 帯域幅アライアンスによるエグレス無料） |
| Storage         | Backblaze B2              | 原本メディアの保存（S3 互換 API）                                                   |
| Auth            | next-auth (Google OAuth)  | ユーザー認証・JWT トークン発行（現行維持）                                          |

### 2.2 リクエストフロー

#### 画像配信（常に Cloud Run 経由）

画像リクエストはパラメータの有無に関わらず、常に Cloud Run を経由する。パラメータなしの場合でもメタデータ削除が行われる。

```
Browser
  ↓ GET /media/:key?w=800&f=webp  （パラメータありでもなしでも同一経路）
  ↓ Cookie: authjs.session-token=<JWT>
Edge Cache Worker (next-auth JWT 検証 → 拡張子で画像と判定)
  ├─ Cache HIT → レスポンス返却
  └─ Cache MISS
       ↓ GET /transform/:key?w=800&f=webp
       ↓ Authorization: Bearer <GCP OIDC Token>  ← Cloud Run IAM 認証
     Cloud Run (Media Processor)
       ↓ GET /:key (原本取得)
       ↓ CF-Access-Client-Id / CF-Access-Client-Secret  ← Cloudflare Access 認証
     Storage Proxy Worker
       ↓ AWS Sig v4 署名付きリクエスト
     Backblaze B2
       ↑ 原本バイナリ
     Cloud Run (メタデータ削除 + 変換処理)
       ↑ 加工済みバイナリ
     Edge Cache Worker (キャッシュ保存)
       ↑ レスポンス返却
Browser
```

#### 動画配信（Storage Proxy パススルー）

動画は変換処理を行わず、Storage Proxy から直接配信する。

```
Browser
  ↓ GET /media/:key (拡張子で動画と判定)
  ↓ Cookie: authjs.session-token=<JWT>
Edge Cache Worker (next-auth JWT 検証)
  ├─ Cache HIT → レスポンス返却
  └─ Cache MISS
       ↓ env.STORAGE_PROXY.fetch()  ← Cloudflare Service Binding（内部通信）
     Storage Proxy Worker
       ↓ AWS Sig v4 署名付きリクエスト
     Backblaze B2
       ↑ 原本バイナリ
     Edge Cache Worker (キャッシュ保存)
       ↑ レスポンス返却
Browser
```

#### アップロード（変更なし）

```
Browser
  ↓ POST /api/upload-signed-url (next-auth セッション)
Vercel (Next.js)
  ↑ Presigned URL 返却
Browser
  ↓ PUT (presigned URL)
Backblaze B2
```

### 2.3 ドメイン設計

ベースドメイン: `photo.sendo-app.com`

| サービス      | ドメイン                      | 備考                                |
| ------------- | ----------------------------- | ----------------------------------- |
| Frontend      | `photo.sendo-app.com`         | Vercel にカスタムドメイン設定                    |
| Edge Cache    | `cdn.photo.sendo-app.com`     | Cloudflare Workers カスタムドメイン              |
| Storage Proxy | `*.workers.dev`（デフォルト）  | カスタムドメイン不要。Cloudflare Access で保護   |
| Cloud Run     | ドメイン割り当て不要          | Edge Cache Worker からのみアクセス               |

### 2.4 リソース命名

**命名方針:** Cloudflare Workers は実験用アカウント内で他プロジェクトと共存するため `family-photo-` プレフィックスを付与する。GCP リソースはプロジェクト単位で分離されるためプレフィックス不要。ローカル（パッケージディレクトリ・package.json・ワークフロー）はプロジェクト内で識別可能な短い名前を使用する。

#### 2.4.1 Cloudflare リソース

| リソース             | リソース名                     |
| -------------------- | ------------------------------ |
| Edge Cache Worker    | `family-photo-cdn`             |
| Storage Proxy Worker | `family-photo-storage-proxy`   |

**Cloudflare Access（セキュリティポリシー。Worker ではない）:**

| 設定                 | 名前                           | 用途                                 |
| -------------------- | ------------------------------ | ------------------------------------ |
| Access Application   | `family-photo-storage-proxy`   | Storage Proxy のドメインを保護       |

#### 2.4.2 GCP リソース

| リソース           | リソース名               |
| ------------------ | ------------------------ |
| Cloud Run サービス | `media-processor`        |
| Artifact Registry  | `media-processor`        |
| Service Account    | `media-delivery-invoker` |

#### 2.4.3 その他

| リソース    | リソース名      | プラットフォーム |
| ----------- | --------------- | ---------------- |
| B2 バケット | `family-photo`  | Backblaze        |

#### 2.4.4 ローカル命名（パッケージ / ワークフロー）

| コンポーネント   | パッケージディレクトリ     | package.json `name`  | ワークフローファイル         |
| ---------------- | -------------------------- | -------------------- | ---------------------------- |
| Frontend         | `packages/app/`            | `@repo/app`          | —（Vercel 自動デプロイ）     |
| Edge Cache       | `packages/cdn/`            | `@repo/cdn`          | `deploy-cdn.yml`             |
| Storage Proxy    | `packages/storage-proxy/`  | `@repo/storage-proxy`| `deploy-storage-proxy.yml`   |
| Media Processor  | `packages/media-processor/`| —（Cargo.toml）      | `deploy-media-processor.yml` |

---

## 3. API 設計

### 3.1 Edge Cache Worker（公開エンドポイント）

#### メディア取得

```
GET /media/:key?w=<width>&h=<height>&f=<format>&q=<quality>
Cookie: authjs.session-token=<JWT>
```

| パラメータ | 型            | 必須 | デフォルト | 説明                                                                                    |
| ---------- | ------------- | ---- | ---------- | --------------------------------------------------------------------------------------- |
| key        | string (path) | Yes  | -          | B2 上のオブジェクトキー                                                                 |
| w          | number        | No   | 原本幅     | 出力幅 (px)                                                                             |
| h          | number        | No   | 原本高     | 出力高 (px)                                                                             |
| f          | string        | No   | 原本形式   | 出力フォーマット (`jpg`, `png`, `webp`, `avif`)                                         |
| q          | number        | No   | 80         | 品質 (1-100, lossy フォーマットのみ)                                                    |
| download   | boolean       | No   | -          | `true` 指定時、`Content-Disposition: attachment` を付与しダウンロード用レスポンスを返却 |

**メディア種別によるルーティング:**

Edge Cache Worker はリクエストパスの拡張子でメディア種別を判定し、ルーティングを決定する。

| メディア種別 | 拡張子                                                             | ルーティング先              |
| ------------ | ------------------------------------------------------------------ | --------------------------- |
| 画像         | `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`, `.gif`, `.bmp`, `.tiff` | Cloud Run（常に加工）       |
| 動画         | `.mp4`, `.mov`, `.avi`, `.webm`, `.mkv`                            | Storage Proxy（パススルー） |
| その他       | 上記以外                                                           | Storage Proxy（パススルー） |

**画像は常に Cloud Run を経由する。** 変換パラメータがすべて省略された場合でも、Cloud Run でメタデータ削除（EXIF / XMP / GPS 情報等）を行ってから返却する。原本がそのまま配信されることはない。

**リサイズ挙動: contain モード**

アスペクト比を維持しながら指定矩形に収まる最大サイズまでリサイズ。元画像より大きいサイズが指定された場合は拡大しない（`withoutEnlargement`）。サイズ制限なし。

- パラメータなし → メタデータ削除のみ（サイズ・フォーマット変更なし）
- `w` のみ指定 → 幅に合わせてリサイズ（高さはアスペクト比から自動算出）
- `h` のみ指定 → 高さに合わせてリサイズ（幅はアスペクト比から自動算出）
- `w` + `h` 両方指定 → 矩形に収まるようリサイズ
- `f` のみ指定 → リサイズせずフォーマット変換のみ
- `q` のみ指定 → リサイズせず品質調整のみ

**レスポンスヘッダ:**

```
Content-Type: image/<format> | video/<format>
Cache-Control: public, max-age=31536000, immutable
Content-Disposition: attachment; filename="<key>"  ← download=true の場合のみ
X-Cache: HIT | MISS
ETag: "<hash>"
```

#### ヘッドリクエスト

```
HEAD /media/:key
Cookie: authjs.session-token=<JWT>
```

メタデータのみ返却（ダウンロード前のサイズ確認等）。

### 3.2 Cloud Run - Media Processor（内部エンドポイント）

#### メディア変換

```
GET /transform/{*key}?w=<width>&h=<height>&f=<format>&q=<quality>
Authorization: Bearer <GCP OIDC Identity Token>
```

Edge Cache Worker からのみ呼び出される（Cloud Run IAM で強制）。Storage Proxy Worker から原本を取得し、加工して返却する。

**処理フロー:**

1. リクエストパラメータのバリデーション
2. Storage Proxy Worker から原本を取得
3. **常に実行:** EXIF / XMP / GPS 等のメタデータを削除
4. **パラメータ指定時のみ:** リサイズ・フォーマット変換・品質調整
5. 加工済みバイナリを返却

パラメータがすべて省略された場合でも、手順 3 のメタデータ削除は必ず実行される。

#### ヘルスチェック

```
GET /health
→ 200 OK
```

### 3.3 Storage Proxy Worker（内部エンドポイント）

既存の `family-photo-storage-proxy` Worker を踏襲。

- **Edge Cache Worker から:** Cloudflare Service Binding 経由（内部通信、認証不要）
- **Cloud Run から:** Cloudflare Access Service Token 経由（エッジで認証）

```
GET /:key
Cf-Access-Jwt-Assertion: <JWT>  ← Cloud Run からの場合（Cloudflare Access が付与）
→ Backblaze B2 からの原本バイナリ
```

- AWS Signature v4 による B2 認証
- Range リクエスト対応（動画ストリーミング用）
- Cloudflare-Backblaze 帯域幅アライアンスによるエグレス無料
- ETag / 304 Not Modified 対応
- Cloudflare Access JWT の検証（多層防御）

### 3.4 バリデーション・加工ポリシー

#### 3.4.1 入力パラメータバリデーション（Edge Cache Worker）

Edge Cache Worker がリクエスト受信時にバリデーションを実行し、不正なリクエストを Cloud Run に到達させない。

| パラメータ | ルール                                                    | エラー時 |
| ---------- | --------------------------------------------------------- | -------- |
| `key`      | 必須。空文字不可。パストラバーサル (`../`) を含まないこと | 400      |
| `w`        | 正の整数。0 以下は不可                                    | 400      |
| `h`        | 正の整数。0 以下は不可                                    | 400      |
| `f`        | `jpg`, `jpeg`, `png`, `webp`, `avif` のいずれか           | 400      |
| `q`        | 1〜100 の整数                                             | 400      |
| 拡張子     | 対応するメディア種別であること（画像 or 動画）            | 400      |

**サイズ制限は設けない。** `w`, `h` に上限値はなく、原本のサイズに関わらずリクエストを受け付ける。

未知のクエリパラメータは無視する（エラーにしない）。

#### 3.4.2 画像加工ポリシー（Cloud Run）

画像リクエストは常に Cloud Run を経由し、以下の加工を行う。

**常に実行（必須加工）:**

| 処理           | 説明                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------- |
| メタデータ削除 | EXIF, XMP, IPTC, ICC プロファイル等を全て削除。GPS 座標・撮影日時・カメラ情報等の漏洩を防止 |

**パラメータ指定時のみ実行（任意加工）:**

| パラメータ | 処理                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| `w` / `h`  | contain モードでリサイズ。アスペクト比維持、拡大なし (`withoutEnlargement`) |
| `f`        | 指定フォーマットへ変換                                                      |
| `q`        | 指定品質でエンコード（lossy フォーマットのみ有効）                          |

**パラメータがすべて省略された場合:** メタデータ削除のみ行い、原本と同じサイズ・フォーマット・品質で返却する。

#### 3.4.3 動画配信ポリシー（Storage Proxy パススルー）

動画リクエストは Cloud Run を経由せず、Storage Proxy から原本をそのまま配信する。

- 変換パラメータ (`w`, `h`, `f`, `q`) が指定されていても無視する
- Range リクエストに対応（動画ストリーミング）
- 将来的に Cloud Run で動画変換を行う場合は、画像と同様のルーティングに拡張する

#### 3.4.4 Cloud Run 内部バリデーション

Cloud Run は Edge Cache Worker でバリデーション済みのリクエストを受け取るが、多層防御として自身でも検証する。

| 検証項目       | 処理                                                   |
| -------------- | ------------------------------------------------------ |
| Content-Type   | Storage Proxy から取得したデータが画像であることを確認 |
| デコード可否   | 画像のデコードに失敗した場合は 422 を返却              |
| エンコード可否 | 指定フォーマットへの変換に失敗した場合は 422 を返却    |

---

## 4. 認証・認可設計

### 4.1 設計方針

内部サービス（Cloud Run / Storage Proxy Worker）をプラットフォームネイティブの認証機構で正規ルート以外からのアクセスを不可能にする。これにより、ユーザー認証は唯一の公開エントリポイントである Edge Cache Worker（と Next.js）のみで行えばよく、**現行の next-auth (Google OAuth) をそのまま維持**できる。

### 4.2 認証レイヤー全体像

| 通信経路                          | 認証方式                                      | 保護レベル                              |
| --------------------------------- | --------------------------------------------- | --------------------------------------- |
| Browser → Edge Cache Worker       | **next-auth JWT**（現行の CDN Worker と同じ） | ユーザー認証                            |
| Browser → Next.js API             | **next-auth セッション**（現行のまま）        | ユーザー認証                            |
| Edge Cache Worker → Storage Proxy | **Cloudflare Service Binding**（内部通信）    | プラットフォーム強制。公開 URL 不要     |
| Edge Cache Worker → Cloud Run     | **Cloud Run IAM + OIDC トークン**             | GCP IAM 強制。未認証リクエスト拒否      |
| Cloud Run → Storage Proxy         | **Cloudflare Access Service Token**           | Cloudflare エッジで未認証リクエスト遮断 |

### 4.3 ユーザー認証（next-auth — Cookie Domain 拡張）

現行の認証フローを維持しつつ、Cookie の Domain 属性を拡張する。

```
Browser
  ↓ Google サインイン
next-auth (Next.js)
  ↑ JWT セッショントークン (Cookie: authjs.session-token; Domain=photo.sendo-app.com)
Browser
  ↓ Cookie 付きリクエスト（photo.sendo-app.com および *.photo.sendo-app.com に送信）
Edge Cache Worker / Next.js API
  ↓ AUTH_SECRET + AUTH_SALT で JWT 検証
  ↓ ALLOW_EMAILS でメールアドレス照合
```

**Cookie Domain 設定（現行からの変更点）:**

Edge Cache Worker (`cdn.photo.sendo-app.com`) にブラウザから直接リクエストする際、Cookie がサブドメインにも送信される必要がある。next-auth の Cookie 設定で `Domain` 属性を明示的に指定する。

```typescript
// packages/app/src/auth.ts
export const { handlers, auth } = NextAuth({
  cookies: {
    sessionToken: {
      options: {
        domain: ".photo.sendo-app.com", // サブドメインにも Cookie を送信
      },
    },
  },
  // ...既存設定
});
```

- `Domain=.photo.sendo-app.com` を設定すると、`photo.sendo-app.com` および `cdn.photo.sendo-app.com` 等の全サブドメインに Cookie が送信される
- 開発環境 (`localhost`) では Domain を設定しない（localhost では Domain 属性不要）
- **現行 CDN Worker との差異:** 現行の CDN Worker (`family-photo-storage-proxy`) は `Authorization: Bearer` ヘッダでトークンを受け取る方式。フロントエンドの `/api/optimize` が Cookie からトークンを取り出して Bearer ヘッダに変換していた。新しい Edge Cache Worker はブラウザから直接アクセスされるため、Cookie から直接 JWT を読み取る方式に変更する

Edge Cache Worker は next-auth の JWT を検証し、`ALLOW_EMAILS` に含まれるユーザーのみアクセスを許可する。

### 4.4 Edge Cache Worker → Storage Proxy（Cloudflare Service Binding）

同一 Cloudflare アカウント内の Worker 間通信。パブリックインターネットを経由せず、認証設定も不要。

**wrangler.jsonc（family-photo-cdn）:**

```jsonc
{
  "services": [{ "binding": "STORAGE_PROXY", "service": "family-photo-storage-proxy" }],
}
```

**呼び出し方:**

```typescript
// Edge Cache Worker 内
const response = await env.STORAGE_PROXY.fetch(
  new Request(`https://dummy/${key}`), // ホスト名は無視される
);
```

**特徴:**

- 同一アカウント内でのみ動作（プラットフォームレベルで強制）
- Storage Proxy Worker に公開 URL を設ける必要がない
- ネットワークオーバーヘッドゼロ（同一スレッド/マシンで実行）
- Hono との互換性あり（`hc()` の `fetch` オプションに `env.STORAGE_PROXY.fetch.bind(env.STORAGE_PROXY)` を渡す）

### 4.5 Edge Cache Worker → Cloud Run（Cloud Run IAM + OIDC）

Cloud Run のネイティブ IAM 認証を使用。`--no-allow-unauthenticated` に設定し、有効な OIDC トークンを持つリクエストのみ受け付ける。

**仕組み:**

1. GCP サービスアカウントを作成し、`roles/run.invoker` ロールを付与
2. サービスアカウントの秘密鍵を Edge Cache Worker の Secret に保存
3. Edge Cache Worker がリクエスト時に自己署名 JWT を生成し、Google の Token エンドポイントで OIDC トークンに交換
4. OIDC トークンを `Authorization: Bearer` ヘッダで Cloud Run に送信
5. Cloud Run が IAM レベルでトークンを自動検証（アプリコード側での検証不要）

```
Edge Cache Worker
  ↓ 自己署名 JWT 生成 (Web Crypto API, RS256)
  ↓ POST https://oauth2.googleapis.com/token
Google Token Endpoint
  ↑ OIDC Identity Token (有効期限: 1時間)
Edge Cache Worker
  ↓ Authorization: Bearer <OIDC Token>
Cloud Run (IAM が自動検証 → 200 or 403)
```

**OIDC トークンのキャッシュ:** トークンは約1時間有効。グローバル変数または Cache API でキャッシュし、毎リクエストの Token Endpoint 呼び出しを回避する。

**セキュリティ特性:**

- トークンは短命（1時間）で自動失効
- `target_audience` で Cloud Run サービス URL にスコープされ、他サービスへのリプレイ不可
- Cloud Run 側にカスタム認証ミドルウェアが不要（IAM が処理）
- サービスアカウント鍵は定期ローテーション推奨（90日目安、手順はセクション 4.5.1 参照）

#### 4.5.1 サービスアカウント鍵ローテーション手順

90 日を目安に以下の手順で鍵をローテーションする。新旧鍵の並行期間を設けることでダウンタイムを回避する。

```bash
PROJECT_ID="your-project-id"
SA_EMAIL="media-delivery-invoker@${PROJECT_ID}.iam.gserviceaccount.com"

# 1. 新しい鍵を発行
gcloud iam service-accounts keys create sa-key-new.json \
  --iam-account=${SA_EMAIL} \
  --project=${PROJECT_ID}

# 2. Edge Cache Worker の Secret を新しい鍵で更新
wrangler secret put GCP_SERVICE_ACCOUNT_KEY < sa-key-new.json

# 3. 新しい鍵で OIDC トークンが正常に発行されることを確認
#    （Edge Cache Worker 経由で画像が取得できることをテスト）

# 4. 旧鍵を削除（旧鍵の KEY_ID は gcloud iam service-accounts keys list で確認）
gcloud iam service-accounts keys delete <OLD_KEY_ID> \
  --iam-account=${SA_EMAIL} \
  --project=${PROJECT_ID}

# 5. sa-key-new.json をローカルから削除
rm sa-key-new.json
```

### 4.6 Cloud Run → Storage Proxy（Cloudflare Access Service Token）

Cloud Run から Storage Proxy Worker への通信はパブリックインターネットを経由するため、Cloudflare Access で保護する。

**仕組み:**

1. Storage Proxy Worker のルート（カスタムドメインまたは workers.dev）に Cloudflare Access アプリケーションを設定
2. Cloudflare Zero Trust ダッシュボードで Service Token を発行（`Client ID` + `Client Secret`）
3. Access ポリシーを「Service Auth」に設定し、当該 Service Token のみ許可
4. Cloud Run は全リクエストに 2つのヘッダを付与:
   - `CF-Access-Client-Id: <CLIENT_ID>`
   - `CF-Access-Client-Secret: <CLIENT_SECRET>`
5. Cloudflare Access がエッジでトークンを検証。無効なリクエストは Worker に到達する前に遮断

**Storage Proxy Worker 内での JWT 検証（多層防御）:**

Cloudflare Access を通過したリクエストには `Cf-Access-Jwt-Assertion` ヘッダが付与される。Storage Proxy Worker 内でこの JWT の署名・audience・有効期限を検証し、Access をバイパスした直接アクセスを防止する。

```typescript
// Storage Proxy Worker 内
import * as jose from "jose";

const CERTS_URL =
  "https://<team-domain>.cloudflareaccess.com/cdn-cgi/access/certs";
const JWKS = jose.createRemoteJWKSet(new URL(CERTS_URL));

const { payload } = await jose.jwtVerify(
  request.headers.get("Cf-Access-Jwt-Assertion"),
  JWKS,
  { audience: "<Access Application AUD>" },
);
```

**注意事項:**

- Service Token の Client Secret は発行時に一度だけ表示される
- Service Token に有効期限を設定し、期限切れアラートを Zero Trust ダッシュボードで設定
- Access ポリシーのアクションは必ず「Service Auth」を使用（「Allow」だと IdP ログインにリダイレクトされる）

### 4.7 アクセス制御まとめ

各コンポーネントへの直接アクセス時の挙動:

| 直接アクセス先       | 結果                 | 理由                                       |
| -------------------- | -------------------- | ------------------------------------------ |
| Edge Cache Worker    | **401 Unauthorized** | next-auth JWT がなければ拒否               |
| Cloud Run            | **403 Forbidden**    | IAM が OIDC トークンなしのリクエストを拒否 |
| Storage Proxy Worker | **403 Forbidden**    | Cloudflare Access がエッジで遮断           |
| Backblaze B2         | **403 Forbidden**    | バケットは非公開。署名付きリクエストのみ   |

**全コンポーネントが正規ルート以外からのアクセスを拒否する。共有シークレットは一切使用しない。**

---

## 5. 技術選定

### 5.1 Cloud Run - Media Processor

| 技術                | 選定理由                                        |
| ------------------- | ----------------------------------------------- |
| Rust                | 高速・省メモリ。画像/動画処理に適している       |
| Axum                | Tokio エコシステムとの親和性が高い。軽量で高速  |
| `image` crate       | Pure Rust デコード/エンコード。WebP / AVIF 対応 |
| `fast_image_resize` | SIMD 最適化リサイズ。`image` crate と統合容易   |

**画像処理ライブラリ選定:**

| 候補                              | メリット                                         | デメリット                                                |
| --------------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| **`image` + `fast_image_resize`** | Pure Rust、Docker ビルドシンプル、WebP/AVIF 対応 | 単体 `image` は resize が遅い（fast_image_resize で補完） |
| `libvips`                         | 最速・省メモリ                                   | ネイティブ依存、Docker ビルド複雑                         |

`image` crate でデコード/エンコード、`fast_image_resize` で SIMD 最適化リサイズを行う構成。Pure Rust のため Docker ビルドがシンプルで CI/CD が容易。

**AVIF エンコード性能に関する注意:**

`image` crate の AVIF エンコードは `rav1e`（Pure Rust エンコーダ）に依存しており、JPEG / WebP と比較して CPU 負荷が高い。大きな画像（4000px 超等）の AVIF 変換は Cloud Run (CPU=1) で処理時間が長くなる可能性がある。運用開始後にレイテンシを監視し、必要に応じて CPU を増量（`--cpu=2`）するか、AVIF エンコードのタイムアウトを個別に設定することを検討する。

**将来的な動画処理:**

動画変換が必要になった場合は FFmpeg バイナリを Cloud Run コンテナに含め、コマンドライン呼び出しで実行する想定。Cloud Run のメモリ・CPU を動画処理に応じてスケールアップする。

### 5.2 Workers

| 技術        | 選定理由                                              |
| ----------- | ----------------------------------------------------- |
| Hono        | 軽量 Web フレームワーク。既存 CDN Worker での実績あり |
| `next-auth` | JWT 検証（Edge Cache Worker。既存 CDN Worker と同様） |
| `jose`      | Cloudflare Access JWT の検証（Storage Proxy Worker）  |
| `aws4fetch` | B2 の AWS Signature v4 署名（Storage Proxy）          |

### 5.3 Cloud Run 構成

IaC (Pulumi 等) は使用しない。GCP リソースは `gcloud` CLI で初期構築し、以降のデプロイは GitHub Actions で行う。リソース数が少なく変更頻度も低いため、IaC の状態管理オーバーヘッドに見合わない。

#### 5.3.1 Cloud Run 設定値

| 設定               | 値                                    | 備考                                                                                      |
| ------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| リージョン         | `asia-northeast1` (東京)              | レイテンシ最適化                                                                          |
| メモリ             | `1Gi`〜                               | 大きな画像のデコードに備える。動画処理時は増量                                            |
| CPU                | `1`                                   | 画像処理には十分。動画処理時は増量                                                        |
| 最小インスタンス数 | `0`                                   | コールドスタート許容（コスト優先。家族利用のため低頻度）                                  |
| 最大インスタンス数 | `4`                                   | バースト対応。コスト上限の安全弁                                                          |
| タイムアウト       | `300s`                                | 大きな画像の変換に余裕を持たせる                                                          |
| 認証               | `--no-allow-unauthenticated`          | IAM 必須                                                                                  |
| Ingress            | `all`                                 | Edge Cache Worker（Cloudflare）からのアクセスを受け付ける                                 |
| 課金モデル         | リクエストベース (`--cpu-throttling`) | リクエスト処理中のみ CPU を割り当て。アイドル時は課金なし。低頻度アクセスの家族利用に最適 |

#### 5.3.2 GCP 初期構築（一度だけ実行）

```bash
PROJECT_ID="your-project-id"
REGION="asia-northeast1"

# 1. Artifact Registry リポジトリ作成
gcloud artifacts repositories create media-processor \
  --repository-format=docker \
  --location=${REGION} \
  --project=${PROJECT_ID}

# 2. サービスアカウント作成（Edge Cache Worker → Cloud Run 認証用）
gcloud iam service-accounts create media-delivery-invoker \
  --display-name="Edge Cache Worker invoker" \
  --project=${PROJECT_ID}

# 3. Cloud Run サービスの初回デプロイ（以降は GitHub Actions が更新）
#    ※ CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET は GitHub Actions Secrets から
#      --set-env-vars で渡す（セクション 9.2 参照）
gcloud run deploy media-processor \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/media-processor/media-processor:initial \
  --region=${REGION} \
  --no-allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=4 \
  --timeout=300 \
  --set-env-vars="STORAGE_PROXY_URL=https://family-photo-storage-proxy.<account>.workers.dev,PORT=8080" \
  --project=${PROJECT_ID}

# 4. サービスアカウントに Cloud Run 呼び出し権限を付与
gcloud run services add-iam-policy-binding media-processor \
  --region=${REGION} \
  --member="serviceAccount:media-delivery-invoker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --project=${PROJECT_ID}

# 5. サービスアカウント鍵の発行（Edge Cache Worker の Secret に設定）
gcloud iam service-accounts keys create sa-key.json \
  --iam-account=media-delivery-invoker@${PROJECT_ID}.iam.gserviceaccount.com \
  --project=${PROJECT_ID}
# → sa-key.json の内容を wrangler secret put GCP_SERVICE_ACCOUNT_KEY で設定
```

#### 5.3.3 Cloudflare 初期構築（一度だけ実行）

Cloudflare ダッシュボードで以下を設定する。

| 設定項目                      | 操作場所                                                | 内容                                              |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| Edge Cache Worker ドメイン    | Workers & Pages > family-photo-cdn > Settings > Domains | `cdn.photo.sendo-app.com`                               |
| Access Application            | Zero Trust > Access > Applications                      | Storage Proxy の workers.dev ドメインに Self-hosted App を作成 |
| Access Policy                 | 同上 > Policies                                         | Action: Service Auth, Service Token を指定        |
| Service Token                 | Zero Trust > Access > Service Auth > Service Tokens     | Cloud Run 用の Service Token を発行               |

#### 5.3.4 Secret 管理

| プラットフォーム          | 管理方法              | 対象                                                                  |
| ------------------------- | --------------------- | --------------------------------------------------------------------- |
| GitHub Actions Secrets    | リポジトリ Settings   | GCP 認証情報, Cloudflare API Token, CF Access Client ID / Secret      |
| Cloudflare Worker Secrets | `wrangler secret put` | GCP SA 鍵, AUTH_SECRET, AUTH_SALT                                     |

---

## 6. プロジェクト構成

```
family-photo/
├── packages/
│   ├── app/                          # Next.js Frontend (Vercel) ※既存
│   ├── cdn/                          # Edge Cache Worker (Hono) ※新規
│   ├── storage-proxy/                # Storage Proxy Worker (Hono) ※既存 cdn/ からリネーム
│   └── media-processor/              # Cloud Run (Rust / Axum) ※新規
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # ※既存
│   │   ├── deploy-storage-proxy.yml  # Storage Proxy ※既存 deploy-cdn-prod.yml からリネーム
│   │   ├── deploy-cdn.yml       # Edge Cache Worker ※新規
│   │   └── deploy-media-processor.yml # Cloud Run ※新規
│   └── actions/
│       └── setup-pnpm/              # ※既存
├── docs/
│   └── DESIGN.md                     # 本設計書
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### 6.1 パッケージ詳細

| パッケージ        | 言語       | ランタイム         | 説明                            |
| ----------------- | ---------- | ------------------ | ------------------------------- |
| `app`             | TypeScript | Node.js (Vercel)   | フロントエンド・管理 API        |
| `cdn`             | TypeScript | Cloudflare Workers | キャッシュ・認証・プロキシ      |
| `storage-proxy`   | TypeScript | Cloudflare Workers | B2 署名付きプロキシ（既存改修） |
| `media-processor` | Rust       | Cloud Run (Docker) | メディア変換処理                |

---

## 7. キャッシュ戦略

### 7.1 Cache Key

Edge Cache Worker は Cloudflare Cache API を使用。リクエスト URL 全体（クエリパラメータを含む）がキャッシュキーとなる。パラメータの組み合わせごとにキャッシュされる。

**例:**

```
https://cdn.photo.sendo-app.com/media/abc123.jpg?w=800&f=webp  → キャッシュキー A（リサイズ+変換）
https://cdn.photo.sendo-app.com/media/abc123.jpg?w=400&f=webp  → キャッシュキー B（リサイズ+変換）
https://cdn.photo.sendo-app.com/media/abc123.jpg                → キャッシュキー C（メタデータ削除済み）
https://cdn.photo.sendo-app.com/media/xyz789.mp4                → キャッシュキー D（動画パススルー）
```

### 7.2 TTL

```
Cache-Control: public, max-age=31536000, immutable
```

原本が不変であることを前提に 1 年キャッシュ。原本を差し替える場合は別キー（UUID ファイル名）を使用する。

### 7.3 キャッシュパージ

Cloudflare Cache API `cache.delete()` で個別パージ可能。将来的に管理 API を追加して対応。

### 7.4 キャッシュレイヤー

| レイヤー             | 対象                  | TTL                           |
| -------------------- | --------------------- | ----------------------------- |
| Cloudflare Cache API | 変換済み/原本メディア | 1 年                          |
| ブラウザキャッシュ   | 同上                  | 1 年（Cache-Control ヘッダ）  |
| ETag                 | 全メディア            | 条件付きリクエストで 304 返却 |

---

## 8. エラーハンドリング

| ケース                            | Edge Cache | Cloud Run | Storage Proxy           | HTTP Status |
| --------------------------------- | ---------- | --------- | ----------------------- | ----------- |
| next-auth トークン未提供          | 401 返却   | -         | -                       | 401         |
| next-auth トークン無効/期限切れ   | 401 返却   | -         | -                       | 401         |
| OIDC トークン無効 (Cloud Run IAM) | -          | 403 返却  | -                       | 403         |
| Access Service Token 無効         | -          | -         | 403 返却 (エッジで遮断) | 403         |
| B2 にキーが存在しない             | -          | -         | 404 返却                | 404         |
| パラメータ不正 (w=-1 等)          | 400 返却   | -         | -                       | 400         |
| サポート外フォーマット            | 400 返却   | -         | -                       | 400         |
| Cloud Run タイムアウト            | 504 返却   | -         | -                       | 504         |
| Cloud Run 内部エラー              | 502 返却   | 500 返却  | -                       | 502         |
| メディア変換失敗                  | -          | 422 返却  | -                       | 422         |
| B2 アクセスエラー                 | -          | -         | 502 返却                | 502         |

---

## 9. CI/CD パイプライン

### 9.1 トリガー条件

| ワークフロー                 | トリガー               | 対象パス                      |
| ---------------------------- | ---------------------- | ----------------------------- |
| `ci.yml`                     | push / PR (全ブランチ) | `**/*`                           |
| `deploy-storage-proxy.yml`   | push to `main`         | `packages/storage-proxy/**`      |
| `deploy-cdn.yml`        | push to `main`         | `packages/cdn/**`           |
| `deploy-media-processor.yml` | push to `main`         | `packages/media-processor/**`    |

### 9.2 Cloud Run デプロイフロー

```
push to main (packages/media-processor/**)
  → Docker build (multi-stage)
  → Push to Artifact Registry
  → gcloud run deploy --set-env-vars（GitHub Actions Secrets から注入）
```

Cloud Run の環境変数（`STORAGE_PROXY_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` 等）は GitHub Actions の `--set-env-vars` で渡す。GCP Secret Manager は使用しない。

### 9.3 Docker マルチステージビルド

```dockerfile
FROM rust:1.84-slim AS builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM gcr.io/distroless/cc-debian12
COPY --from=builder /app/target/release/media-processor /
EXPOSE 8080
CMD ["media-processor"]
```

### 9.4 Workers デプロイフロー

```
push to main (packages/cdn/** or packages/storage-proxy/**)
  → pnpm install
  → wrangler deploy
```

### 9.5 デプロイ戦略

インフラの初期構築とアプリの継続的デプロイを分離する。

| 責務                                                  | ツール                               | タイミング                        |
| ----------------------------------------------------- | ------------------------------------ | --------------------------------- |
| GCP 初期構築 (AR, Cloud Run, SA, IAM)                 | `gcloud` CLI                         | 初回のみ（セクション 5.3.2 参照） |
| Cloudflare 初期構築 (Access, DNS, ドメイン)           | ダッシュボード                       | 初回のみ（セクション 5.3.3 参照） |
| Cloud Run デプロイ (コンテナイメージ更新)             | GitHub Actions (`gcloud run deploy`) | main マージ時                     |
| Workers デプロイ                                      | GitHub Actions (`wrangler deploy`)   | main マージ時                     |

---

## 10. 環境変数

### 10.1 Edge Cache Worker (`family-photo-cdn`)

| 変数                      | 種別   | 説明                                                     |
| ------------------------- | ------ | -------------------------------------------------------- |
| `MEDIA_PROCESSOR_URL`     | vars   | Cloud Run のエンドポイント URL                           |
| `GCP_SERVICE_ACCOUNT_KEY` | secret | GCP サービスアカウント秘密鍵 JSON（OIDC トークン生成用） |
| `AUTH_SECRET`             | secret | next-auth JWT 検証用シークレット                         |
| `AUTH_SALT`               | secret | next-auth JWT 検証用ソルト                               |
| `ALLOW_EMAILS`            | vars   | アクセス許可メールアドレス（カンマ区切り）               |

**Service Binding（wrangler.jsonc で設定）:**

```jsonc
{
  "services": [{ "binding": "STORAGE_PROXY", "service": "family-photo-storage-proxy" }],
}
```

### 10.2 Cloud Run (`media-processor`)

| 変数                      | 説明                                                    |
| ------------------------- | ------------------------------------------------------- |
| `STORAGE_PROXY_URL`       | Storage Proxy Worker の URL（Cloudflare Access で保護） |
| `CF_ACCESS_CLIENT_ID`     | Cloudflare Access Service Token の Client ID            |
| `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access Service Token の Client Secret        |
| `PORT`                    | リッスンポート (デフォルト: `8080`)                     |

**IAM 設定（認証はプラットフォームが処理、環境変数不要）:**

- Cloud Run サービスは `--no-allow-unauthenticated` で作成
- Edge Cache Worker 用 GCP サービスアカウントに `roles/run.invoker` を付与

### 10.3 Storage Proxy Worker (`storage-proxy`)

| 変数                    | 種別   | 説明                                            |
| ----------------------- | ------ | ----------------------------------------------- |
| `B2_ENDPOINT`           | vars   | B2 の S3 互換エンドポイント                     |
| `BUCKET_NAME`           | vars   | B2 バケット名                                   |
| `B2_KEY_ID`             | secret | B2 API キー ID                                  |
| `B2_APP_KEY`            | secret | B2 アプリケーションキー                         |
| `CF_ACCESS_TEAM_DOMAIN` | vars   | Cloudflare Access チームドメイン（JWT 検証用）  |
| `CF_ACCESS_AUD`         | vars   | Cloudflare Access Application AUD（JWT 検証用） |

**Cloudflare Access（ダッシュボードで設定）:**

- Storage Proxy Worker のルートに Access アプリケーションを作成
- ポリシー: Service Auth（Cloud Run 用 Service Token のみ許可）

### 10.4 Next.js Frontend (`app`)

| 変数                       | 説明                                            |
| -------------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_CDN_ORIGIN` | Edge Cache Worker のオリジン URL                |
| `B2_KEY_ID`                | B2 API キー ID（presigned URL 発行用）          |
| `B2_APP_KEY`               | B2 アプリケーションキー（presigned URL 発行用） |
| `AUTH_SECRET`              | next-auth JWT シークレット（現行のまま）        |
| `AUTH_SALT`                | next-auth JWT ソルト（現行のまま）              |
| `AUTH_GOOGLE_ID`           | Google OAuth Client ID（現行のまま）            |
| `AUTH_GOOGLE_SECRET`       | Google OAuth Client Secret（現行のまま）        |
| `ALLOW_EMAILS`             | アクセス許可メールアドレス（現行のまま）        |

---

## 11. 制約・前提

- 画像の入力サイズ・出力解像度に上限を設けない（Cloud Run のメモリ範囲内で処理）
- 対応画像フォーマット: JPEG, PNG, WebP, AVIF, GIF, BMP, TIFF
- 画像は常に Cloud Run で加工して返却する（パラメータなしでもメタデータ削除を実行）
- 変換時に EXIF / XMP / IPTC / GPS 等のメタデータを常に全削除（プライバシー保護）
- 動画は現時点では加工せず Storage Proxy からパススルー配信
- Cloud Run メモリ: 画像処理 1GiB〜（大きな画像のデコードに備え余裕を持たせる）。将来的な動画処理時はさらに増量
- Cloudflare-Backblaze 帯域幅アライアンスにより B2 → Cloudflare のエグレスは無料
- Cloud Run は Edge Cache Worker からのみアクセス可能（Cloud Run IAM + OIDC トークン）
- Storage Proxy Worker は Edge Cache Worker（Service Binding）および Cloud Run（Cloudflare Access）からのみアクセス可能
- GCP サービスアカウント鍵は 90 日目安で定期ローテーション
- Cloudflare Access Service Token は有効期限を設定し、期限切れアラートを構成
- アップロードフロー（Presigned URL → B2 直接アップロード）は既存のまま変更なし
- メディア一覧・削除 API は引き続き Next.js API Route で提供

---

## 12. マイグレーション計画

### Phase 1: GCP 初期構築

1. Artifact Registry リポジトリ作成
2. サービスアカウント作成 + `roles/run.invoker` 付与
3. Cloud Run サービスの初回デプロイ（`--no-allow-unauthenticated`）
4. サービスアカウント鍵を発行し、Edge Cache Worker の Secret に設定

※ 手順の詳細はセクション 5.3.2 を参照

### Phase 2: Cloudflare 初期構築

1. Storage Proxy Worker にカスタムドメイン設定
2. Cloudflare Access アプリケーション + Service Auth ポリシー作成
3. Service Token 発行 → GitHub Actions Secrets に格納
4. Edge Cache Worker の作成（Service Binding + OIDC トークン生成）（`packages/cdn`）

### Phase 3: Storage Proxy Worker 改修

既存 CDN Worker は `Authorization: Bearer` ヘッダで認証しているため、Edge Cache Worker からの Service Binding 経由アクセス（Bearer ヘッダなし）を受け付けるには先に改修が必要。

1. 既存 CDN Worker から next-auth JWT 検証・ALLOW_EMAILS チェックを削除（Edge Cache Worker が担当するため不要に）
2. Cloudflare Access JWT 検証（`Cf-Access-Jwt-Assertion`）を追加（多層防御）
3. Service Binding 経由のリクエストを正常処理できることを確認

### Phase 4: フロントエンド移行

Phase 3 完了後、Edge Cache Worker → Storage Proxy の経路が動作する状態で移行する。

1. next-auth の Cookie 設定に `Domain=.photo.sendo-app.com` を追加（セクション 4.3 参照）
2. `OptimizedImage` コンポーネントの画像 URL を Edge Cache Worker オリジンに変更（パラメータ名: `width` → `w`, `format` → `f`, `quality` → `q`）
3. `/api/download` を Edge Cache Worker 経由に変更（`?download=true` パラメータ使用、セクション 3.1 参照）
4. `/api/optimize` API Route の削除

### Phase 5: 検証・切り替え

1. 全経路の動作確認（画像配信・動画配信・アップロード）
2. 各コンポーネントへの直接アクセスが拒否されることを確認
3. フロントエンドの配信元を Edge Cache Worker に切り替え
