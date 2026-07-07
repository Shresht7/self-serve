# `self-serve`

A super simple static file server.

> [!NOTE]
> `self-serve` is mostly a side-project and is not intended to be a production-ready server. It is meant for local development and for situations where you quickly need to serve something up on the local network. See the [Goals](#-goals) section for more details.


## 🌟 Features

- **Static File Server**: Serve up a directory and its files
- **Live Refresh**: Automatically refreshes the browser when you change a web file
- **CSS Hot Swap**: CSS changes are injected directly without a full-page reload for a seamless styling experience
- **Directory Listing**: Generates and displays a list of contents, If a directory doesn't have an `index.html`
- **SPA Mode**: Fallback to `index.html` for single-page applications
- **API Routes**: Create server-side API endpoints
- **Zero-Dependency**: Zero external dependencies. Just the Deno Standard Library.

---

## 📦 Installation

If you have Deno, there are several ways to run `self-serve`.

- From JSR

    ```sh
    deno run --allow-net --allow-read jsr:@shresht7/self-serve
    ```
- From a local clone of the repository

    ```sh
    deno run --allow-net --allow-read self-serve.ts
    ```

- Directly from the web without installing or cloning the repository

    ```sh
    deno run --allow-net --allow-read https://raw.githubusercontent.com/Shresht7/self-serve/refs/heads/main/self-serve.ts
    ```

To install `self-serve` as a cli application:


```sh
deno install --global --allow-net --allow-read jsr:@shresht7/self-serve --name self-serve 
```

then you can simply run it from anywhere in your terminal using:

```sh
self-serve
```

### Permissions

| Permission     | Why                                                                          |
| :------------- | :--------------------------------------------------------------------------- |
| `--allow-net`  | Required to create the web-server and websocket connections for live-refresh |
| `--allow-read` | Required to read files from the specified directory in the file-system       |

---

## 📋 Usage

```sh
self-serve  # If installed as a binary
```
or

```sh
deno run --allow-net --allow-read jsr:@shresht7/self-serve  # If running directly with deno from JSR
```

This starts the server on `localhost:5327`

to specify the `port`

```sh
self-serve --port 3000
```

to enable SPA mode

```sh
self-serve --spa
```

to specify the api directory

```sh
self-serve --api api
```

### Arguments

| Flag                     | Alias | Description                                                       | Default                  |
| :----------------------- | :---: | :---------------------------------------------------------------- | :----------------------- |
| `--dir`                  | `-d`  | The directory to serve. Can also be passed as the first argument. | `.` (current directory)  |
| `--port`                 | `-p`  | The port to listen on.                                            | `5327`                   |
| `--host`                 | `-a`  | The host address to bind to.                                      | `localhost`              |
| `--watch` / `--no-watch` | `-w`  | Enable or disable the live-reloading feature.                     | `--watch`                |
| `--cors [origin]`        |       | Enable CORS, optionally specifying an origin.                     | `*` (if flag is present) |
| `--spa`                  |       | Enable SPA mode (fallback to `index.html`).                       |                          |
| `--api <path>`           |       | Enable API routes from the specified directory.                   | `api/`                   |
| `--help`                 | `-h`  | Show the help message.                                            |                          |
| `--version`              | `-v`  | Print the application version.                                    |                          |

---

## 📂 Static File Server

`self-serve` resolves each request as follows:

- If the request path matches a directory containing an `index.html`, that file is served.
- If the directory has no `index.html`, a directory listing page is generated automatically (with a light/dark theme toggle).
- If the request path doesn't exist and `--spa` is enabled, `index.html` at the root of `--dir` is served instead (client-side routing fallback).
- If the request path doesn't exist and `--spa` is disabled, a `404` page is returned.
- MIME types are inferred from the file extension (via `@std/media-types`); unrecognized extensions fall back to `application/octet-stream`.
- Images and JavaScript files get a `Cache-Control: public, max-age=0, must-revalidate` header; other file types have no explicit caching directive.
- Path-traversal attempts (e.g. `../../etc/passwd`) and null-byte injection are blocked by resolving and comparing real paths before serving.

> [!CAUTION]
> Dotfiles (e.g. `.env`, `.git/`) are **not** hidden, be mindful of what directory you point `self-serve` at. I should probably add a way to hide sensitive files, but for now, just be careful.

**Known limitations**, compared to a production-grade static file server such as [`@std/http/file-server`](https://jsr.io/@std/http/doc/file-server):
- No `ETag` / `If-Modified-Since` conditional-request support.
- No `Range` request support (no partial content, resumable downloads, or video scrubbing).
- Whole files are read into memory per request rather than streamed.

## 🛰️ API Routes

`self-serve` supports creating server-side API endpoints. To enable this feature, use the `--api` flag and specify the directory where your API files are located. By default, it looks for an `api/` directory in your project's root.

### Creating API Endpoints

To create an API endpoint, you create a `.ts` or `.js` file inside your designated API directory. The name of the file will determine the API route.

For example, a file named `hello.ts` in the `api/` directory will create an endpoint at `/api/hello`.

### Handling HTTP Methods

Inside your API file, you can export functions that correspond to the HTTP methods you want to handle (e.g., `GET`, `POST`, `PUT`, `DELETE`, etc.). These functions will receive the `Request` object as an argument and should return a `Response` object.

Here is an example of a simple API endpoint that handles `GET` and `POST` requests:

**`api/hello.ts`**

```ts
export function GET(req: Request): Response {
    return new Response("Hello from API!")
}

export function POST(req: Request): Response {
    return new Response("You posted to me!")
}
```

Now, if you run `self-serve --api api`, you can make requests to `/api/hello`:

- `GET /api/hello` will return `Hello from API!`
- `POST /api/hello` will return `You posted to me!`

### Nested Routes

You can also create nested routes by creating subdirectories inside your API directory. For example, a file named `api/users/profile.ts` will create an endpoint at `/api/users/profile`.

---

## 📙 Library

If for some reason you want programmatic access to the server, you can:

```ts
import { Self } from "jsr:@shresht7/self-serve/server"

const self = new Self({
    dir: "./public",
    host: "localhost",
    port: 3000,
    watch: true,
    cors: "*",
    spa: false,
    apiDir: "./api"
})

await self.serve()

// ... later, to shutdown the server
self.shutdown()
```

---

## 💽 Development

### Publishing to JSR

This package is published to [JSR](https://jsr.io/@shresht7/self-serve) via GitHub Actions.

- Update the `version` in `deno.json` and commit the changes.
- Create an annotated tag with the same version number, e.g. `git tag -a v1.0.0 -m "Release v1.0.0"`.
- Push the tag to GitHub, e.g. `git push --tags`.
- Create a new release on GitHub for the tag you just pushed. The GitHub Action will automatically publish the package to JSR.

> [!NOTE]
> The GitHub Action is configured to only publish when a new release is created, not on every push to the main branch. This is to prevent accidental releases of incomplete or untested code.

> [!NOTE]
> The GitHub Action uses OIDC authentication to securely publish the package to JSR without needing to store a secret token in the repository. This is a more secure way to authenticate with JSR.

---

## ⚽ Goals

I had very specific goals and self-imposed challenges in mind when building this project.

- Quickly spin up a simple static file server
- Self-contained in a single file (No longer the case, but was fun trying to cram everything into one file)
- No external dependencies, use only the standard library
- Just good enough for basic web development
- Optionally support live-reloading and directory listing
- Be half-decent

## 🏛️ Go Version

This repository also contains a Go implementation (`./static/go/main.go`) which was the original. It is a very basic file-server and **does not** include features like live-reloading. It is preserved here as one of the main goals of this project, for me, was to build a static file server as concisely as possible in a single file.

---

## 📕 Reference

- [Deno Standard Library](https://jsr.io/@std)

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE)
