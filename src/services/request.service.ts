import Axios, { AxiosError, AxiosResponse } from 'axios';
import { Context } from 'koa';
import * as Debug from 'debug';

const logger = Debug('acp:service:request');

function onSuccessWithCtx(ctx: Context, time: number) {
    return (response: AxiosResponse) => {
        const { status, headers, data } = response;
        ctx.status = status;
        const stringData = JSON.stringify(data);
        for (const key in headers) {
            ctx.set(key, headers[key]);
        }
        ctx.type = 'json';
        ctx.res.end(stringData);
        logger(`Responded In: ${Date.now() - time} ms`);
        return {
            status,
            headers,
            data: stringData,
        };
    };
}

export function onErrorWithCtx(ctx: Context) {
    return (error: AxiosError) => {
        throw error;
    };
}

export function makeRequest(ctx: Context, path: string, headers: any) {
    logger(`call server for ${path}`);
    const d1 = Date.now();
    return Axios.get(path, { headers: headers }).then(
        onSuccessWithCtx(ctx, d1),
        onErrorWithCtx(ctx)
    );
}

export function errorToData(error: AxiosError) {
    const data: any = { status: 503, data: '', headers: [] };
    try {
        const { response, message } = error;
        if (response) {
            const { status, data, headers } = response;
            return { status, data, headers };
        }
        data.data = message;
    } catch (e) { }
    return data;
}