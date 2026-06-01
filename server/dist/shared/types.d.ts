/** Error class for Yuque API errors with status code */
export declare class YuqueAPIError extends Error {
    statusCode: number;
    body: string;
    constructor(statusCode: number, body: string);
}
