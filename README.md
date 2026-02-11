# family-photo

Googleドライブの課金が高いので自前で安く済ませる家族写真アプリケーションです。

## アーキテクチャ

```
                          ┌─────────────────────────────┐
                          │       Backblaze B2          │
                          │    (オブジェクトストレージ)    │
                          └──────────┬──────────────────┘
                                     │ AWS Sig v4
                          ┌──────────┴──────────────────┐
                      ┌──→│  Storage Proxy Worker        │
                      │   │  (Cloudflare Workers / Hono) │
                      │   │  family-photo-storage-proxy   │
                      │   └──────────┬──────────────────┘
                      │              │
         Service      │   CF Access  │
         Binding      │   Service    │
         (内部通信)    │   Token      │
                      │              │
┌─────────────────────┴───┐  ┌──────┴──────────────────┐
│  Edge Cache Worker       │  │  Media Processor         │
│  (Cloudflare Workers)    │  │  (Cloud Run / Rust+Axum) │
│  family-photo-cdn        │  │  media-processor         │
│                          │←─┤                          │
│  - next-auth JWT 検証    │  │  - リサイズ              │
│  - Cloudflare Cache API  │  │  - フォーマット変換       │
│  - メディア種別ルーティング│  │  - メタデータ削除        │
└────────────┬─────────────┘  └──────────────────────────┘
             │ Cookie (JWT)
             │ OIDC Token →
┌────────────┴─────────────┐
│  Browser                 │
│                          │
│  ┌────────────────────┐  │
│  │ Next.js (Vercel)   │  │
│  │ - UI (ギャラリー)    │  │
│  │ - Auth.js          │  │
│  │ - アップロード管理   │  │
│  └────────────────────┘  │
└──────────────────────────┘
```

**リクエストフロー:**
- 画像: Browser → Edge Cache → Cloud Run (変換) → Storage Proxy → B2
- 動画: Browser → Edge Cache → Storage Proxy (Service Binding) → B2
- アップロード: Browser → Next.js API → Presigned URL → B2 直接

## 想定コスト

- エグレスは無料:
  - Backblaze B2とCloudflareの提携により、Cloudflare経由のダウンロード配信は無料
  - https://www.backblaze.com/docs/cloud-storage-deliver-public-backblaze-b2-content-through-cloudflare-cdn
- 保存容量: 10GBは無料それ以上に対して費用がかかる

### Backblaze B2
- 100GB: $0.54 / 月（記述現在約82円）
  - 100GB - 10GB = 90GB
  - 90 x $0.006
- 200GB: $1.14 / 月（記述現在約173円）
  - 200GB - 10GB = 190GB
  - 190 x $0.006

### Googleドライブ
  - 100GB: 290円 / 月
  - 200GB: 440円 / 月

## 機能

- 一括アップロード
- ギャラリー表示
- 詳細表示
- 動画再生
- 特定のGoogleアカウントのみ利用許可（身内のみの利用想定）

## 技術スタック

| コンポーネント | 技術 | パッケージ |
|---|---|---|
| Frontend | Next.js / Tailwind CSS / shadcn/ui | `packages/app` |
| Edge Cache Worker | Cloudflare Workers / Hono | `packages/cdn` |
| Storage Proxy Worker | Cloudflare Workers / Hono | `packages/storage-proxy` |
| Media Processor | Cloud Run / Rust / Axum | `packages/media-processor` |
| Storage | Backblaze B2 (S3互換) | - |
| Auth | Auth.js (Google OAuth) | - |

## プロジェクト構成

```
packages/
  app/               # Next.js Frontend (Vercel)
  cdn/                # Edge Cache Worker (Cloudflare Workers)
  storage-proxy/      # Storage Proxy Worker (Cloudflare Workers)
  media-processor/    # Media Processor (Cloud Run / Rust)
```

詳細な設計は [docs/DESIGN.md](docs/DESIGN.md) を参照。
