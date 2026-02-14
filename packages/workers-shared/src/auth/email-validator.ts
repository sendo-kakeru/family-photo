/**
 * ALLOW_EMAILS のキャッシュ
 */
let cachedAllowEmails: {
  raw: string;
  emails: Set<string>;
} | null = null;

/**
 * ALLOW_EMAILS 環境変数からメールアドレスのセットを取得する（キャッシュ付き）
 */
export function getAllowEmails(raw: string): Set<string> {
  // キャッシュチェック
  if (cachedAllowEmails?.raw === raw) {
    return cachedAllowEmails.emails;
  }

  // カンマ区切りでパースし、正規化
  const emails = new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

  // キャッシュに保存
  cachedAllowEmails = { emails, raw };

  return emails;
}

/**
 * メールアドレスが許可リストに含まれているか確認する
 */
export function isEmailAllowed(
  email: string,
  allowEmails: Set<string>,
): boolean {
  return allowEmails.has(email.toLowerCase());
}
