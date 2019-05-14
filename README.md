# ओषम् (Osham)

[![Total alerts](https://img.shields.io/lgtm/alerts/g/ajaysinghj8/osham.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/ajaysinghj8/osham/alerts/)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/ajaysinghj8/osham.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/ajaysinghj8/osham/context:javascript)

A Configurable Proxy Cache Server.

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
  Cache Server will hit the http://dummy.restapiexample.com/api/v1/employess.
  It will cache the result for the next 5 minutes as per over about cache configuration.

## Cache Options

- **expose** The proxy path which will expose from osham.

- **target** The actual server HOST name (with path).
- **changeOrigin:** The actual request's HOST name will be passed to backend.
- **followRedirects** The HTTP/HTTPS agent will be changes to follow redirects if server has internal redirection enabled.
- **timeout** Default 5000 miliseconds.

## Use Cases

You are a frontend developer and you don't want to set up backend on your machine, but want a faster development experience.

To reduce TTFB on google page insights in the production environment.

To support a large number of requests with fewer resources.

Centralized many servers end-points to one.

## Limitations

1. It only supports anonymous requests.
2. It will only cache GET requests.
3. In Node Cluster, Requests will be pooled and served from the single response of backend per cache thread.

## Architecture

![Osham Archtecture](https://raw.githubusercontent.com/ajaysinghj8/osham/master/public/Arch.svg?sanitize=true&raw=true)

####

![Osham Auth Arch](https://raw.githubusercontent.com/ajaysinghj8/osham/master/public/SimpleArch.svg?sanitize=true&raw=true)

#### More Optimized Osham

![Osham master slave](https://raw.githubusercontent.com/ajaysinghj8/osham/master/public/MasterSlaveOsham.svg?sanitize=true&raw=true)
