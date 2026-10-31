# ドメイン移行手順書（sendo-app.com → sendo.page）

## 1. 概要

ベースドメインを `sendo-app.com` から `sendo.page` に移行する。サブドメイン構成は維持する。

| サービス      | 移行前                    | 移行後                   | ホスティング                       |
| ------------- | ------------------------- | ------------------------ | ---------------------------------- |
| Frontend      | `photo.sendo-app.com`     | `photo.sendo.page`       | Vercel カスタムドメイン            |
| Edge Cache    | `cdn.photo.sendo-app.com` | `cdn.photo.sendo.page`   | Cloudflare Workers カスタムドメイン |
| Storage Proxy | `*.workers.dev`           | 変更なし                 | Cloudflare Access で保護           |
| Cloud Run     | `*.run.app`               | 変更なし                 | Edge Cache Worker からのみアクセス |

### 1.1 方針

- 新ドメインのインフラ（DNS・Vercel・Worker カスタムドメイン・OAuth）を**先に**用意し、旧ドメインと並行稼働させてからアプリを切り替える
- Cookie の `Domain` はコードに固定値で書かれているため、Frontend は新旧ドメインを同時に正しく扱えない。アプリ切り替え時に旧 Frontend ドメインは新ドメインへリダイレクトする
- 旧ドメインの設定は動作確認後に削除する

### 1.2 影響

- **全ユーザーが再ログインになる**: セッション Cookie の Domain が `.photo.sendo-app.com` から `.photo.sendo.page` に変わり、旧 Cookie は新ドメインに送られないため
- Edge Cache（Cloudflare Cache API）のキャッシュキーはホスト名を含むため、切り替え直後はキャッシュミスが増え、Cloud Run の負荷が一時的に上がる

## 2. 変更対象一覧

### 2.1 リポジトリ内

| ファイル                                   | 内容                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `packages/app/src/auth.ts`                 | セッション Cookie の `domain`（`.photo.sendo-app.com` → `.photo.sendo.page`）                            |
| `packages/app/next.config.ts`              | `images.remotePatterns` の `hostname`                                                                    |
| `packages/cdn/wrangler.jsonc`              | `routes` の Worker カスタムドメイン                                                                       |
| `packages/storage-proxy/wrangler.jsonc`    | `vars.APP_HOST`（`src/index.ts` で CORS の許可オリジンに使用）                                            |
| `docs/DESIGN.md`                           | §2.3 ドメイン設計 / §4.3 Cookie Domain / §5.3.3 Cloudflare 初期構築 / §7.1 キャッシュキー例 / Phase 4      |

### 2.2 リポジトリ外

| 対象                         | 内容                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| レジストラ / Cloudflare DNS  | `sendo.page` のゾーンを Cloudflare に追加                                                   |
| Vercel ドメイン              | `photo.sendo.page` を追加、`photo.sendo-app.com` をリダイレクトに変更                      |
| Vercel 環境変数              | `NEXT_PUBLIC_CDN_ORIGIN`（画像・ダウンロード URL の生成に使用。ビルド時に埋め込まれる）    |
| Google Cloud Console (OAuth) | 承認済み JavaScript 生成元 / リダイレクト URI                                              |

以下は workers.dev / run.app を指しているため**変更不要**。

- Cloudflare Access アプリケーション（Storage Proxy の workers.dev ドメイン）
- GitHub Actions Secrets の `STORAGE_PROXY_URL`
- `packages/cdn/wrangler.jsonc` の `MEDIA_PROCESSOR_URL`

## 3. 移行手順

### Step 1: 新ドメインの準備（ユーザー影響なし）

1. **Cloudflare にゾーン追加**
   - Cloudflare ダッシュボード > Add a site で `sendo.page` を追加
   - レジストラのネームサーバーを Cloudflare 指定のものに変更し、ゾーンが Active になるまで待つ
   - `.page` TLD は HSTS preload 対象のため HTTPS 必須（Vercel / Cloudflare とも自動で証明書が発行されるので追加作業はない）
2. **Vercel にドメイン追加**
   - Project > Settings > Domains で `photo.sendo.page` を追加
   - 表示される DNS レコード（CNAME `cname.vercel-dns.com` 等）を Cloudflare DNS に登録する。プロキシは **DNS only（グレー雲）** にする
   - この時点では `photo.sendo-app.com` をプライマリのまま残す
3. **Google OAuth に新ドメインを追加**
   - Google Cloud Console > APIs & Services > Credentials > 対象の OAuth 2.0 クライアント ID
   - 承認済み JavaScript 生成元に `https://photo.sendo.page` を追加
   - 承認済みリダイレクト URI に `https://photo.sendo.page/api/auth/callback/google` を追加
   - 旧ドメインの値はまだ削除しない

**確認**

- [ ] `sendo.page` ゾーンが Active
- [ ] Vercel の Domains で `photo.sendo.page` が Valid Configuration になっている

### Step 2: Edge Cache Worker に新ドメインを追加（ユーザー影響なし）

`packages/cdn/wrangler.jsonc` の `routes` に新ドメインを**追加**する（旧ドメインは残す）。

```jsonc
"routes": [
  { "custom_domain": true, "pattern": "cdn.photo.sendo-app.com" },
  { "custom_domain": true, "pattern": "cdn.photo.sendo.page" }
],
```

main にマージすると `deploy-cdn.yml` でデプロイされ、DNS レコードと証明書が自動で作られる。

**確認**

- [ ] Workers & Pages > family-photo-cdn > Settings > Domains に `cdn.photo.sendo.page` が表示される
- [ ] `curl https://cdn.photo.sendo.page/health` が `ok` を返す
- [ ] `curl -I https://cdn.photo.sendo.page/images/<key>` が 401 を返す（未認証なので拒否される）

### Step 3: アプリの切り替え（ここから再ログインが必要になる）

1. **コード変更**（1 つの PR にまとめる）
   - `packages/app/src/auth.ts`: `domain` を `".photo.sendo.page"` に変更
   - `packages/app/next.config.ts`: `remotePatterns` に `cdn.photo.sendo.page` を追加（切り替え中は旧ドメインも残す）
   - `packages/storage-proxy/wrangler.jsonc`: `APP_HOST` を `photo.sendo.page` に変更
2. **Vercel 環境変数を変更**（Production）
   - `NEXT_PUBLIC_CDN_ORIGIN` を `https://cdn.photo.sendo.page` に変更
   - `AUTH_URL` / `NEXTAUTH_URL` が設定されている場合は `https://photo.sendo.page` に変更（`trustHost: true` のため未設定なら不要）
3. **PR をマージ**
   - Vercel の本番デプロイと `deploy-storage-proxy.yml` が走る
   - `NEXT_PUBLIC_*` はビルド時に埋め込まれるため、環境変数の変更は**マージ前**に済ませておく。後から変えた場合は Redeploy する
4. **Vercel のドメイン設定を切り替え**
   - `photo.sendo.page` をプライマリにする
   - `photo.sendo-app.com` を `photo.sendo.page` への 308 リダイレクトに変更

> Cookie の Domain、Frontend のホスト、`NEXT_PUBLIC_CDN_ORIGIN` の 3 つが揃わないと、Edge Cache Worker に Cookie が届かず画像が 401 になる。Step 3 の 3〜4 は続けて行う。

**確認**

- [ ] `https://photo.sendo-app.com` にアクセスすると `https://photo.sendo.page` にリダイレクトされる
- [ ] Google ログインができる（`redirect_uri_mismatch` が出ない）
- [ ] DevTools > Application > Cookies で `__Secure-authjs.session-token` の Domain が `.photo.sendo.page`
- [ ] ギャラリーの画像が `https://cdn.photo.sendo.page/images/...` から表示される
- [ ] 動画が再生できる（Range リクエスト）
- [ ] メディアのダウンロード（`?download=true`）ができる
- [ ] アップロードができる
- [ ] `ALLOW_EMAILS` に含まれないアカウントは `/forbidden` になる
- [ ] Cloudflare / Vercel / Cloud Run のログにエラーが増えていない

### Step 4: 旧ドメインの後片付け

Step 3 のあと数日様子を見て問題がなければ行う。

1. **コード変更**
   - `packages/cdn/wrangler.jsonc`: `routes` から `cdn.photo.sendo-app.com` を削除
   - `packages/app/next.config.ts`: `remotePatterns` から `cdn.photo.sendo-app.com` を削除
   - `docs/DESIGN.md`: `sendo-app.com` の記述をすべて `sendo.page` に置き換える
2. **Google OAuth**: 旧ドメインの JavaScript 生成元とリダイレクト URI を削除
3. **Vercel**: リダイレクトを残す期間を決め、期間が過ぎたら `photo.sendo-app.com` を削除
4. **DNS**: `sendo-app.com` ゾーンの不要レコードを削除（ドメイン自体を手放すかは別途判断）

**確認**

- [ ] `git grep -i sendo-app` の結果が空
- [ ] Step 3 の確認項目をもう一度通す

## 4. ロールバック

Step 4 を行うまでは旧ドメインの設定がすべて残っているため、以下で元に戻せる。

1. Vercel のドメイン設定で `photo.sendo-app.com` をプライマリに戻し、リダイレクトを外す
2. Vercel 環境変数 `NEXT_PUBLIC_CDN_ORIGIN` を `https://cdn.photo.sendo-app.com` に戻す
3. Step 3 の PR を revert してマージする（Vercel と Storage Proxy が再デプロイされる）

この場合も Cookie の Domain が戻るため、ユーザーは再ログインが必要になる。
