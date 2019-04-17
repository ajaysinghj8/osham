export interface ICacheOptions {
    expires: string;
    query: false | Array<string>;
    headers: false | Array<string>;
};


export interface IRulesOptions {
    [key: string]: ICacheOptions;
}

export interface INameSpaceOptions {
    expose: string;
    proxy: string;
    rules: IRulesOptions;
    cache: ICacheOptions;
}
