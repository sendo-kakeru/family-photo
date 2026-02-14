/**
 * バリデーションエラー
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * 認証エラー
 */
export class AuthenticationError extends Error {
  constructor(message = "認証に失敗しました") {
    super(message);
    this.name = "AuthenticationError";
  }
}

/**
 * ストレージエラー
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = "StorageError";
  }
}
