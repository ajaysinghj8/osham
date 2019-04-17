import Axios, { AxiosError, AxiosResponse } from 'axios';
import { Context } from 'koa';
import * as Debug from 'debug';

const logger = Debug('api-cache-proxy:service:request');

function onSuccessWithCtx(ctx: Context, time: number) {
    return ({ status, headers, data }: AxiosResponse) => {
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
        ctx.status = error.response.status;
        ctx.res.end(error.response.data);
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
