import { parseArgs } from "@std/cli"

const VERSION = "v0.3.0"

const DEFAULT_HOST = "localhost"
const DEFAULT_PORT = "5327"

const HELP_MESSAGE = `self-serve [directory] [options]

A simple static file server for local development

Usage:
  self-serve .                    # Serve current directory
  self-serve public               # Serve 'public' directory
  self-serve --port 8080          # Use a different port
  self-serve --no-watch           # Disable live-reloading
  self-serve --spa                # Enable SPA mode (fallback to index.html)
  self-serve --api api            # Enable API routes from the 'api' directory

Options:
  -d, --dir <path>      Directory to serve (default: current directory)
  -a, --host <address>  Host address to listen on (default: "localhost")
  -p, --port <number>   Port to listen on (default: 5327)
  -w, --watch           Enable live-reloading on file changes (default: true)
      --no-watch        Disable live-reloading
      --cors <origin>   Enable CORS for a specific origin (default: "*")
      --spa             Enable SPA mode (fallback to index.html)
      --api <path>      Enable API routes from the specified directory (default: "api/")

  -h, --help            Show this help message
  -v, --version         Show version number
`



/** Parses command-line arguments and returns an object with the parsed values */
export function parse(args: string[]) {
    const flags = parseArgs(args, {
        string: ["dir", "host", "port", "cors", "api"],
        boolean: ["watch", "help", "version", "spa"],
        negatable: ["watch"],
        alias: {
            "help": "h",
            "version": "v",
            "dir": "d",
            "host": "a",
            "port": "p",
            "watch": "w",
        },
        default: {
            dir: Deno.cwd(),
            host: DEFAULT_HOST,
            port: DEFAULT_PORT,
            watch: true,
            cors: "*",
            spa: false,
            api: "api/",
        },
    })

    // The first non-flag argument is the directory
    const dir = flags._.length > 0 ? String(flags._[0]) : flags.dir

    const port = Number(flags.port)
    if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Invalid port number: ${flags.port}`)
        Deno.exit(1)
    }

    return { ...flags, dir, port }
}

export function showHelp() {
    console.info(HELP_MESSAGE)
}

export function showVersion() {
    console.info(VERSION)
}
