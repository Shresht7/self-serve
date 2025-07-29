// ----
// SELF
// ----

class Self {
    constructor(
        private dir: string,
        private host: string,
        private port: number
    ) { }

    /** Starts the server */
    serve() {
        const handler = (req: Request): Promise<Response> => {
            const url = new URL(req.url)
            console.log(`\x1b[90m-- ${this.getClientIP(req)} \x1b[92m${req.method}\x1b[0m ${url.pathname}`);
            return this.serveStaticFile(url.pathname)
        }

        Deno.serve({
            hostname: this.host,
            port: this.port
        }, handler)

        console.log(`Server started on http://${this.host}:${this.port}`)
    }

    /** Helper function to get the IP Address of the client */
    private getClientIP(req: Request): string {
        return req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    }

    /** Function to serve static files */
    private async serveStaticFile(pathName: string): Promise<Response> {
        // Default to index.html for directory requests
        if (pathName.endsWith('/')) {
            pathName += 'index.html'
        }

        const filePath = this.dir + pathName

        try {
            const fileInfo = await Deno.stat(filePath)

            if (fileInfo.isDirectory) {
                return new Response("Directory listing not supported", { status: 403 })
            }

            const content = await Deno.readFile(filePath)
            const mimeType = this.getMimeType(filePath)

            return new Response(content, {
                headers: {
                    "Content-Type": mimeType,
                }
            })
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                return new Response('Not Found', { status: 404 })
            }
            console.error('Error serving file: ', error)
            return new Response('Internal Server Error', { status: 500 })
        }
    }

    /** Helper function to get the MIME type of a file */
    private getMimeType(filePath: string): string {
        const ext = filePath.split('.').pop()?.toLowerCase()
        const mimeTypes: Record<string, string> = {
            'html': 'text/html',
            'css': 'text/css',
            'js': 'application/javascript',
            'json': 'application/json',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'svg': 'image/svg+xml',
            'ico': 'image/x-icon',
            'txt': 'text/plain',
        };
        return mimeTypes[ext || ''] || 'text/plain';
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
    let host = DEFAULT_HOST
    let port = parseInt(DEFAULT_PORT)
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
