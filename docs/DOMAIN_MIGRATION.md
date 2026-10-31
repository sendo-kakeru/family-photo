# ドメイン移行手順書（sendo-app.com → sendo.page）

## 1. 概要

ベースドメインを `sendo-app.com` から `sendo.page` に移行する。サブドメイン構成は維持する。

| サービス      | 移行前                    | 移行後                 | ホスティング                        |
| ------------- | ------------------------- | ---------------------- | ----------------------------------- |
| Frontend      | `photo.sendo-app.com`     | `photo.sendo.page`     | Vercel カスタムドメイン             |
| Edge Cache    | `cdn.photo.sendo-app.com` | `cdn.photo.sendo.page` | Cloudflare Workers カスタムドメイン |
| Storage Proxy | `*.workers.dev`           | 変更なし               | Cloudflare Access で保護            |
| Cloud Run     | `*.run.app`               | 変更なし               | Edge Cache Worker からのみアクセス  |

利用者が限られるため、新旧ドメインの並行稼働は行わず一度に切り替える。切り替え後は再ログインが必要になる。

## 2. 変更対象一覧

### 2.1 リポジトリ内（対応済み）

| ファイル                                | 内容                                                       |
| --------------------------------------- | ---------------------------------------------------------- |
| `packages/app/src/auth.ts`              | セッション Cookie の `domain`                              |
| `packages/app/next.config.ts`           | `images.remotePatterns` の `hostname`                      |
| `packages/cdn/wrangler.jsonc`           | `routes` の Worker カスタムドメイン                        |
| `packages/storage-proxy/wrangler.jsonc` | `vars.APP_HOST`（`src/index.ts` で CORS の許可オリジンに使用） |
| `docs/DESIGN.md`                        | ドメインの記述                                             |

### 2.2 リポジトリ外

| 対象                         | 内容                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| レジストラ / Cloudflare DNS  | `sendo.page` のゾーンを Cloudflare に追加                                                |
| Vercel ドメイン              | `photo.sendo.page` を追加                                                               |
| Vercel 環境変数              | `NEXT_PUBLIC_CDN_ORIGIN`（画像・ダウンロード URL の生成に使用。ビルド時に埋め込まれる） |
| Google Cloud Console (OAuth) | 承認済み JavaScript 生成元 / リダイレクト URI                                           |

以下は workers.dev / run.app を指しているため**変更不要**。

- Cloudflare Access アプリケーション（Storage Proxy の workers.dev ドメイン）
- GitHub Actions Secrets の `STORAGE_PROXY_URL`
- `packages/cdn/wrangler.jsonc` の `MEDIA_PROCESSOR_URL`

## 3. 移行手順

### Step 1: 事前準備（PR マージ前）

1. **Cloudflare にゾーン追加**
   - Cloudflare ダッシュボード > Add a site で `sendo.page` を追加
   - レジストラのネームサーバーを Cloudflare 指定のものに変更し、ゾーンが Active になるまで待つ
   - Worker のカスタムドメインは同じ Cloudflare アカウントのゾーンにしか作れないため、Active になる前に PR をマージすると `deploy-cdn.yml` が失敗する
2. **Vercel にドメイン追加**
   - Project > Settings > Domains で `photo.sendo.page` を追加
   - 表示される DNS レコード（CNAME `cname.vercel-dns.com` 等）を Cloudflare DNS に登録する。プロキシは **DNS only（グレー雲）** にする
3. **Google OAuth に新ドメインを追加**
   - Google Cloud Console > APIs & Services > Credentials > 対象の OAuth 2.0 クライアント ID
   - 承認済み JavaScript 生成元に `https://photo.sendo.page` を追加
   - 承認済みリダイレクト URI に `https://photo.sendo.page/api/auth/callback/google` を追加
4. **Vercel 環境変数を変更**（Production）
   - `NEXT_PUBLIC_CDN_ORIGIN` を `https://cdn.photo.sendo.page` に変更
   - `AUTH_URL` / `NEXTAUTH_URL` が設定されている場合は `https://photo.sendo.page` に変更（`trustHost: true` のため未設定なら不要）
   - `NEXT_PUBLIC_*` はビルド時に埋め込まれるため、PR マージ前に変更しておく

### Step 2: PR をマージ

main にマージすると以下がデプロイされる。

- Vercel（Frontend）
- `deploy-cdn.yml`（Edge Cache Worker。`cdn.photo.sendo.page` の DNS レコードと証明書が自動で作られる）
- `deploy-storage-proxy.yml`（Storage Proxy）

### Step 3: Vercel のプライマリドメインを切り替え

- `photo.sendo.page` をプライマリにする
- `photo.sendo-app.com` は削除するか、`photo.sendo.page` への 308 リダイレクトにする

### Step 4: 動作確認

- [ ] `curl https://cdn.photo.sendo.page/health` が `ok` を返す
- [ ] Google ログインができる（`redirect_uri_mismatch` が出ない）
- [ ] DevTools > Application > Cookies で `__Secure-authjs.session-token` の Domain が `.photo.sendo.page`
- [ ] ギャラリーの画像が `https://cdn.photo.sendo.page/images/...` から表示される
- [ ] 動画が再生できる（Range リクエスト）
- [ ] メディアのダウンロード（`?download=true`）ができる
- [ ] アップロードができる

画像が 401 になる場合は、Cookie の Domain・Frontend のホスト・`NEXT_PUBLIC_CDN_ORIGIN` のいずれかが新ドメインになっていない。

### Step 5: 旧ドメインの後片付け

- Google OAuth から旧ドメインの JavaScript 生成元とリダイレクト URI を削除
- Vercel から `photo.sendo-app.com` を削除（Step 3 でリダイレクトにした場合）
- `sendo-app.com` ゾーンの不要な DNS レコードを削除

## 4. ロールバック

1. Vercel 環境変数 `NEXT_PUBLIC_CDN_ORIGIN` を `https://cdn.photo.sendo-app.com` に戻す
2. PR を revert してマージする（Frontend・Edge Cache Worker・Storage Proxy が再デプロイされる）
3. Vercel のプライマリドメインを `photo.sendo-app.com` に戻す
