/** Error class for Yuque API errors with status code */
export class YuqueAPIError extends Error {
    statusCode;
    body;
    constructor(statusCode, body) {
        super(`语雀 API 错误 [${statusCode}]: ${body.slice(0, 200)}`);
        this.name = "YuqueAPIError";
        this.statusCode = statusCode;
        this.body = body;
    }
}
//# sourceMappingURL=types.js.map