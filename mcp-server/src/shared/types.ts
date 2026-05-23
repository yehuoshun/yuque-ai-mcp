/** Error class for Yuque API errors with status code */
export class YuqueAPIError extends Error {
  statusCode: number;
  body: string;

  constructor(statusCode: number, body: string) {
    super(`语雀 API 错误 [${statusCode}]: ${body.slice(0, 200)}`);
    this.name = "YuqueAPIError";
    this.statusCode = statusCode;
    this.body = body;
  }
}