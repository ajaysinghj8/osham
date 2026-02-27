# ओषम् (Osham)

[![Total alerts](https://img.shields.io/lgtm/alerts/g/ajaysinghj8/osham.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/ajaysinghj8/osham/alerts/)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/ajaysinghj8/osham.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/ajaysinghj8/osham/context:javascript)

A Configurable Proxy Cache Server.

```
npx osham
```

```
 npm i -g osham
```

```
 npm i osham
```

## What is ओषम् (Osham) ?

**Osham** is a cache service for APIs.

The idea behind Osham is to support higher concurrent requests with fewer resources and fast response time. 

In a public facing API/frontend, most of the request remains the same and so the response is also the same. To avoid rendering the same request from the backend and to speed up the response time we should use **CACHE**.

The cache can solve many problems and it uses fewer backend resources to provide a good response time.

**But that's not it.**

In a real-world scenario, what happens when your backend is requested with hundreds of concurrent requests for the first time.
In all those concurrent requests, there will be cache miss and will cause a [thundering herd](https://en.wikipedia.org/wiki/Thundering_herd_problem) problem.

All of these problems and many more can be resolved by using Osham in your architecture.

## Setup and Configure

- Create a folder.
  ```sh
  mkdir cache
  ```

* Move in this newly created folder
  ```sh
  cd cache
  ```

- Install osham using

  ```sh
  npm install osham
  ```

  OR

  ```sh
  npm install osham -g
  ```

- Create a .env file.

  ```sh
  touch .env
  ```

- Configure and place following in the .env file.

  ```
  # Port number on the cache server will listen to incoming requests
  PORT=26192
  # Redis host name
  REDIS_HOST=localhost
  # Redis port number
  REDIS_PORT=6379
  # HTTPS Options
  SECURE=false
  SSL_KEY=
  SSL_CERT=
  # Timeout for cache service. Default is 5000 ms
  TIMEOUT=7000
  ```

- Now, just need to create a cache-config.yml file. To get started copy file from [here](https://raw.githubusercontent.com/ajaysinghj8/osham/master/cache-config.example.yml).

- Run osham as
  If you have installed it using -g flag, you will be able to run it directly from cmd.

  ```sh
  osham
  ```

  Or

  ```sh
  ./node_module/.bin/osham
  ```

  Or using package.json
  add into scripts of package.json as
  "start": "osham"

  ```
  npm start
  ```

- Open http://localhost:26192/api/v1/employees in the browser.
  Cache Server will hit the http://dummy.restapiexample.com/api/v1/employees .
  It will cache the result for the next 5 minutes as per over about cache configuration.

## Cache Options

- **expose** The proxy path which will expose from osham.

*** Begin Patch
# ओषम् (Osham)

[![Total alerts](https://img.shields.io/lgtm/alerts/g/ajaysinghj8/osham.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/ajaysinghj8/osham/alerts/)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/ajaysinghj8/osham.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/ajaysinghj8/osham/context:javascript)

Osham is a lightweight configurable proxy cache server for HTTP APIs. It reduces backend load, improves response times, and includes request pooling to avoid thundering-herd effects on first requests.

## Quick start

Install locally:

```sh
npm install osham
```

Install globally:

```sh
npm install -g osham
```

Run (from a project with `cache-config.yml`):

```sh
npx osham
# or if installed globally
osham
```

## Configuration essentials

Create a `.env` (optional) and a `cache-config.yml` in your working directory. Minimal env vars:

```
PORT=26192
REDIS_HOST=localhost
REDIS_PORT=6379
SECURE=false
TIMEOUT=7000
```

See `cache-config.example.yml` for full options and examples. The server supports per-namespace rules, cache expiry, pooling, and query/header-based cache variation.

### Example `cache-config.yml`

Here's a minimal example you can copy into your project to get started quickly.

```yaml
version: '1'
xResponseTime: true
health: true
purge: true
dummyRest:
  expose: '/api/v1/*'
  target: 'http://localhost:3000'
  changeOrigin: true
  cache:
    pool: true
    expires: 10s
    query: false
    headers: false
  rules:
    /employees/:
      cache:
        expires: 1m
        pool: true
        query:
          - limit
          - page
        headers:
          - x-locale
    /employee/2/:
      cache: false
```

## Purge cache (administrative)

Osham provides an admin endpoint to invalidate cache by exact key or by pattern. See the detailed guide:

- [Purge Cache](docs/purge-cache.md)

Key format: `O:<NAMESPACE>:<PATH>[:<VARIANT_HASH>]` (variant hash is SHA1 hex).

## When to use Osham

- Reduce backend load and TTFB for high-read API endpoints
- Prevent thundering-herd on first-request cache misses using request pooling
- Centralize caching for multiple backend endpoints

## Limitations

1. Only anonymous GET requests are cached.
2. Purge operations should be restricted and protected in production.

## Architecture

![Osham Architecture](https://raw.githubusercontent.com/ajaysinghj8/osham/master/public/Arch.svg?sanitize=true&raw=true)

## Contributing

PRs and issues welcome. Run tests with:

```sh
npm test
```

## License

See `LICENSE` in the repository.
