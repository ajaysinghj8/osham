interface BaseICacheOptions {
    expires?: number | string;
    query?: false | Array<string>;
    headers?: false | Array<string>;
    pool?: boolean;
}

export type ICacheOptions = undefined | false | BaseICacheOptions;

export interface IRulesOptions {
    [key: string]: { cache: ICacheOptions };
}

export interface INameSpaceOptions {
    expose: string;
    target: string;
    port?: number;
    followRedirects?: boolean;
    changeOrigin?: boolean;
    timeout?: number;
    rules: IRulesOptions;
    cache: ICacheOptions;
}
