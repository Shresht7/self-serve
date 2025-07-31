import { parseArgs } from "jsr:@std/cli"

const VERSION = "v0.3.0"

const DEFAULT_HOST = "localhost"
const DEFAULT_PORT = "5327"

const HELP_MESSAGE = `self-serve [directory] [options]

self-serve is a super simple HTTP static file server

Options:
  -d, --dir     Directory to serve (default: current directory)
  -a, --host    Host address to listen on (default: ${DEFAULT_HOST})
  -p, --port    Port to listen on (default: ${DEFAULT_PORT})
 
  -h, --help    Show this help message
  -v, --version Show version number
`



/** Parses command-line arguments and returns an object with the parsed values */
export function parse(args: string[]) {
    const flags = parseArgs(args, {
        string: ["dir", "host", "port"],
        boolean: ["watch", "cors", "help", "version"],
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
