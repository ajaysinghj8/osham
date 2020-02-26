import { Context } from './ctx.provider';
import { INameSpaceOptions } from './types';

export function respondWithCtx(ctx: Context) {
    return ({ statusCode, headers, data }: any) => {
        ctx.statusCode = statusCode;
        for (const key in headers) {
            if (!Object.prototype.hasOwnProperty.call(headers, key)) continue;
            ctx.set(key, headers[key]);
        }
        ctx.body = data;
        return {
            statusCode, headers, data
        };
    };
}

export function nextTick() {
    return new Promise((resolve) => {
        process.nextTick(resolve);
    });
}

export function timeOutResponse(reason?: string): any {
    return {
        statusCode: 408,
        statusMessage: 'Request Timeout',
        headers: [],
        data: reason || 'Request Timeout'
    };
}


export function isNameSpace(key: string, options: INameSpaceOptions): boolean {
    if (typeof key !== 'string') return false;
    if (!options) return false;
    if (typeof options !== 'object') return false;
    if (!options.expose || !options.target) return false;
    return true;
}
