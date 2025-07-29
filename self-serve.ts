// ----
// SELF
// ----

class Self {
    constructor(
        private dir: string,
        private host: string,
        private port: number
    ) { }

    serve() {
        const handler = (_req: Request): Response => {
            return new Response("Hello World")
        }

        Deno.serve({
            hostname: this.host,
            port: this.port
        }, handler)

        console.log(`Server started on http://${this.host}:${this.port}`)
    }
}

// ----
// MAIN
// ----

const VERSION = "v0.3.0"

const DEFAULT_HOST = "localhost"
const DEFAULT_PORT = "5327"

const HELP_MESSAGE = `self-serve [directory] [options]

self-serve is a super simple HTTP static file server

Options:
  -d, --dir     Directory to serve (default: current directory)
  -a, --host    Host address to listen on (default: localhost)
  -p, --port    Port to listen on (default: 5327)
 
  -h, --help    Show this help message
  -v, --version Show version number
`

/** Parses command-line arguments and returns an object with the parsed values */
function parseArgs(args: string[]): { dir: string, host: string, port: number, version: boolean, help: boolean } {
    let dir = Deno.cwd()
    let host = Deno.env.get("HOST") ?? DEFAULT_HOST
    let port = parseInt(Deno.env.get("PORT") ?? DEFAULT_PORT)
    let version = false
    let help = false

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg === '-h' || arg === '--help') {
            help = true
        } else if (arg === "-v" || arg === "--version") {
            version = true
        } else if (arg === "-d" || arg === "--dir") {
            dir = args.at(++i) ?? dir
        } else if (arg === "-a" || arg === "--host") {
            host = args.at(++i) ?? host
        } else if (arg === "-p" || arg === "--port") {
            port = parseInt(args.at(++i) ?? port.toString())
        }
    }

    return { dir, host, port, version, help }
}

/** The main entrypoint of the application */
async function main() {
    // Parse the command-line arguments
    const args = parseArgs(Deno.args)

    // Show the help message if `-h` or `--help` command-line option was passed in
    if (args.help) {
        console.log(HELP_MESSAGE)
        return Deno.exit(0)
    }

    // Show the version number if `-v` or `--version` command-line option was passed in
    if (args.version) {
        console.log(VERSION)
        return Deno.exit(0)
    }

    // Initialize the self-server
    const self = new Self(args.dir, args.host, args.port)

    // Self Serve
    await self.serve()
}

// This file is being run directly as the main program
if (import.meta.main) {
    main()
}
