import { get } from "../client.js";
/**
 * 团队整体统计
 */
export async function getGroupStats(params) {
    const data = await get(`/groups/${params.login}/statistics`);
    const s = data.data || data;
    return JSON.stringify(s, null, 2);
}
/**
 * 团队成员统计
 */
export async function getMemberStats(params) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 10, 20);
    let url = `/groups/${params.login}/statistics/members?page=${page}&limit=${limit}`;
    if (params.name)
        url += `&name=${encodeURIComponent(params.name)}`;
    if (params.range !== undefined)
        url += `&range=${params.range}`;
    if (params.sortField)
        url += `&sortField=${params.sortField}`;
    if (params.sortOrder)
        url += `&sortOrder=${params.sortOrder}`;
    const data = await get(url);
    return JSON.stringify(data.data || data, null, 2);
}
/**
 * 团队知识库统计
 */
export async function getBookStats(params) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 10, 20);
    let url = `/groups/${params.login}/statistics/books?page=${page}&limit=${limit}`;
    if (params.name)
        url += `&name=${encodeURIComponent(params.name)}`;
    if (params.range !== undefined)
        url += `&range=${params.range}`;
    if (params.sortField)
        url += `&sortField=${params.sortField}`;
    if (params.sortOrder)
        url += `&sortOrder=${params.sortOrder}`;
    const data = await get(url);
    return JSON.stringify(data.data || data, null, 2);
}
/**
 * 团队文档统计
 */
export async function getDocStats(params) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 10, 20);
    let url = `/groups/${params.login}/statistics/docs?page=${page}&limit=${limit}`;
    if (params.bookId)
        url += `&bookId=${params.bookId}`;
    if (params.name)
        url += `&name=${encodeURIComponent(params.name)}`;
    if (params.range !== undefined)
        url += `&range=${params.range}`;
    if (params.sortField)
        url += `&sortField=${params.sortField}`;
    if (params.sortOrder)
        url += `&sortOrder=${params.sortOrder}`;
    const data = await get(url);
    return JSON.stringify(data.data || data, null, 2);
}
//# sourceMappingURL=statistic.js.map