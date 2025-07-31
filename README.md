# `self-serve`

A super simple static file server.

## 🌟 Features

- **Static File Server**: Serve up a directory and its files
- **Live Refresh**: Automatically refreshes the browser when you change a web file
- **CSS Hot Swap**: CSS changes are injected directly without a full-page reload for a seamless styling experience
- **Directory Listing**: Generates and displays a list of contents, If a directory doesn't have an `index.html`
- **Zero-Dependency**: Zero external dependencies (other than the standard library)

## 📋 Usage

If you have Deno, you can run `self-serve.ts` with:

```sh
deno run --allow-net --allow-read self-serve.ts
```

you can also directly run the `self-serve.ts` from the web without installing or cloning the repository.

```sh
deno run --allow-net --allow-read https://raw.githubusercontent.com/Shresht7/self-serve/refs/heads/main/self-serve.ts
```

Alternatively, you can install `self-serve` as a cli application using [`deno install`](#-installation) and run it locally using:

```sh
self-serve
```

This starts the server on `localhost:5327`

to specify the `port`

```sh
deno run --allow-net --allow-read self-serve.ts --port 3000
```

### Permissions

| Permission     | Why                                                                          |
| :------------- | :--------------------------------------------------------------------------- |
| `--allow-net`  | Required to create the web-server and websocket connections for live-refresh |
| `--allow-read` | Required to read files from the specified directory in the file-system       |

### Arguments

## 📦 Installation

To compile and install it as a binary

```sh
deno install --global --allow-net --allow-read self-serve.ts --name self-serve 
```

then you can simply do

```sh
self-serve
```

## 📕 Reference

 | Flag                     | Alias | Description                                                       | Default                 |
 | :----------------------- | :---: | :---------------------------------------------------------------- | :---------------------- |
 | `--dir`                  | `-d`  | The directory to serve. Can also be passed as the first argument. | `.` (current directory) |
 | `--port`                 | `-p`  | The port to listen on.                                            | `5327`                  |
 | `--host`                 | `-a`  | The host address to bind to.                                      | `localhost`             |
 | `--watch` / `--no-watch` | `-w`  | Enable or disable the live-reloading feature.                     | `--watch`               |
 | `--help`                 | `-h`  | Show the help message.                                            |                         |
 | `--version`              | `-v`  | Print the application version.                                    |                         |

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

## 📄 License

This project is licensed under the [MIT License](./LICENSE)
