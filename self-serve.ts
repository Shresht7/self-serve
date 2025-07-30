// ----
// SELF
// ----

class Self {
    constructor(
        private dir: string,
        private host: string,
        private port: number,
        private abortableController: AbortController = new AbortController(),
        private watcher: Deno.FsWatcher | null = null,
        private wsClients: Set<WebSocket> = new Set()
    ) { }

    /** Starts the server */
    async serve() {
        this.startFileWatcher()  // Start the File Watcher

        const handler = async (req: Request): Promise<Response> => {
            const url = new URL(req.url)

            // Handle WebSocket upgrade for hot-reload
            if (url.pathname === "/__hot_reload__") {
                return this.handleWebSocketUpgrade(req)
            }

            console.log(`\x1b[90m-- ${this.getClientIP(req)} \x1b[92m${req.method}\x1b[0m ${url.pathname}`);
            return await this.serveStaticFile(url.pathname)
        }

        const server = Deno.serve({
            hostname: this.host,
            port: this.port,
            signal: this.abortableController.signal,
        }, handler)

        try {
            await server.finished
        } catch (error) {
            const { name } = error as Error
            if (name !== 'AbortError') {
                throw error
            }
        }
    }

    /** Helper function to get the IP Address of the client */
    private getClientIP(req: Request): string {
        return req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    }

    /** Function to serve static files */
    private async serveStaticFile(pathName: string): Promise<Response> {
        // Security: Prevent directory traversal attacks
        if (pathName.includes('..') || pathName.includes('\0')) {
            console.warn(`\x1b[91m→ Bocked suspicious path: ${pathName}\x1b[0m`)
            return new Response('Forbidden', { status: 403 })
        }

        // Default to index.html for directory requests
        if (pathName === "") {
            pathName += '/'
        }
        if (pathName.endsWith('/')) {
            pathName += 'index.html'
        }

        // Normalize path and ensure it's within the served directory
        const filePath = this.dir + pathName

        try {
            // Resolve real path to prevent symlink access
            const realPath = await Deno.realPath(filePath)
            const realDir = await Deno.realPath(this.dir)
            if (!realPath.startsWith(realDir)) {
                console.warn(`\x1b[91m→ Bocked path outside served directory: ${pathName}\x1b[0m`)
                return new Response('Forbidden', { status: 403 })
            }
        } catch {
            // If realPath fails, continue with original path, the file might not exist yet
        }

        try {
            const fileInfo = await Deno.stat(filePath)

            if (fileInfo.isDirectory) {
                // Try to serve index.html from the directory
                const indexPath = filePath + '/index.html'
                try {
                    await Deno.stat(indexPath)
                    return await this.serveStaticFile(indexPath)
                } catch {
                    return new Response("Directory listing not supported", { status: 403 })
                }
            }

            const content = await Deno.readFile(filePath)
            const mimeType = this.getMimeType(filePath)

            // Inject hot-reload script into HTML files
            if (mimeType === 'text/html') {
                const html = new TextDecoder().decode(content).toLowerCase()
                const hotReloadScript = this.generateHotReloadScript()

                let modifiedHtml
                if (html.includes('</body>')) {
                    modifiedHtml = html.replace(/<\/body>/i, hotReloadScript + '\n</body>')
                } else if (html.includes('</html>')) {
                    modifiedHtml = html.replace(/<\/html>/i, hotReloadScript + '\n</html>')
                } else {
                    modifiedHtml = html + hotReloadScript
                }

                const modifiedContent = new TextEncoder().encode(modifiedHtml)
                return new Response(modifiedContent, {
                    headers: {
                        "Content-Type": mimeType,
                        "Cache-Control": 'no-cache, no-store, must-revalidate', // No cache during development to prevent stale content
                        "Pragma": "no-cache",
                        "Expires": "0"
                    }
                })
            }

            // Add appropriate caching headers for static assets
            const headers: Record<string, string> = {
                'Content-Type': mimeType
            }

            // Cache static assets but allow revalidation during development
            if (mimeType.startsWith('image/') || mimeType === 'application/javascript') {
                headers['Cache-Control'] = 'public, max-age=0, must-revalidate'
            }
            return new Response(content, { headers })
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                return new Response('Not Found', { status: 404 })
            } else if (error instanceof Deno.errors.PermissionDenied) {
                return new Response('Forbidden', { status: 403 })
            }
            console.error('Error serving file: ', error)
            return new Response('Internal Server Error', { status: 500 })
        }
    }

    /** Helper function to get the MIME type of a file */
    private getMimeType(filePath: string): string {
        const ext = filePath.split('.').pop()?.toLowerCase()
        const mimeTypes: Record<string, string> = {
            // Text
            'html': 'text/html; charset=utf-8',
            'css': 'text/css; charset=utf-8',
            'js': 'application/javascript; charset=utf-8',
            'mjs': 'application/javascript; charset=utf-8',
            'json': 'application/json; charset=utf-8',
            'xml': 'application/xml; charset=utf-8',
            'txt': 'text/plain; charset=utf-8',
            'md': 'text/markdown; charset=utf-8',
            // Images
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'svg': 'image/svg+xml',
            'webp': 'image/webp',
            'ico': 'image/x-icon',
            // Fonts
            'woff': 'font/woff',
            'woff2': 'font/woff2',
            'ttf': 'font/ttf',
            'otf': 'font/otf',
            'eot': 'application/vnd.ms-fontobject',
            // Other
            'pdf': 'application/pdf',
            'zip': 'application/zip',
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
        };
        return mimeTypes[ext || ''] || 'application/octet-stream';
    }

    /** Starts the file-watcher to monitor changes in the served directory */
    private async startFileWatcher() {
        try {
            // Check if the directory exists and is readable
            const dirInfo = await Deno.stat(this.dir)
            if (!dirInfo || !dirInfo.isDirectory) {
                console.error(`${this.dir} is not a directory`)
                return
            }

            this.watcher = Deno.watchFs(this.dir)
            let debounceTimer: number | null = null
            let isShuttingDown = false

            // Handle graceful shutdown
            this.abortableController.signal.addEventListener('abort', () => {
                isShuttingDown = true
                if (debounceTimer) {
                    clearTimeout(debounceTimer)
                }
            })

            for await (const event of this.watcher) {
                if (isShuttingDown) { break } // Stop listening for events when shutting down

                // Only watch for modify and create events
                if (event.kind === 'modify' || event.kind === 'create') {
                    // Filter for web files only
                    const webFiles = event.paths.filter(path => {
                        const ext = path.split('.').pop()?.toLowerCase()
                        return ext && ['html', 'css', 'js', 'json', 'svg', 'png', 'jpg', 'jpeg'].includes(ext)
                    })

                    if (webFiles.length > 0) {
                        // Debounce rapid file changes (100ms delay)
                        if (debounceTimer) {
                            clearTimeout(debounceTimer)
                        }
                        debounceTimer = setTimeout(() => {
                            console.log(`\x1b[36mFile changed:\x1b[0m ${webFiles.join(', ')}`);
                            this.onFilesChanged(webFiles);
                        }, 100)
                    }
                }
            }
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                console.error(`Directory not found: ${this.dir}`)
            } else if (error instanceof Deno.errors.PermissionDenied) {
                console.error(`Permission denied: ${this.dir}`)
            } else {
                console.error('Error watching files: ', error)
            }
        }
    }

    /** Callback function when files are changed in the served directory */
    private onFilesChanged(files: string[]) {
        // Check if changes are CSS-only for hot-swap reloading
        const cssOnly = files.every(file => file.endsWith('.css'))
        if (cssOnly) {
            this.broadcastToClients(JSON.stringify({ type: 'css-change', files }))
        } else {
            this.broadcastToClients(JSON.stringify({ type: 'full-reload', files }))
        }
    }

    /** Handles WebSocket upgrade requests */
    private handleWebSocketUpgrade(req: Request): Response {
        const { socket, response } = Deno.upgradeWebSocket(req)

        socket.addEventListener('open', () => {
            this.wsClients.add(socket)
            console.log(`\x1b[32m→ WebSocket client connected (${this.wsClients.size} total)\x1b[0m`)
        })

        socket.addEventListener('close', () => {
            this.wsClients.delete(socket)
            console.log(`\x1b[91m→ WebSocket client disconnected (${this.wsClients.size} remaining)\x1b[0m`)
        })

        socket.addEventListener('error', (error) => {
            this.wsClients.delete(socket)
            console.error(`\x1b[91m→ WebSocket error:\x1b[0m`, error)
        })

        return response
    }

    /** Broadcasts a message to all connected WebSocket clients */
    private broadcastToClients(message: string) {
        for (const client of this.wsClients) {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(message)
                } catch (error) {
                    console.error(`\x1b[91m→ Failed to send to client:\x1b[0m`, error)
                    this.wsClients.delete(client)
                }
            } else {
                this.wsClients.delete(client)
            }
        }
    }

    /** Generates a hot-reload script to inject into the client HTML files */
    private generateHotReloadScript(): string {
        return /* HTML */`
            <script>
                function setupHotReload() {
                    const socket = new WebSocket('ws://${this.host}:${this.port}/__hot_reload__')
                    socket.addEventListener('open', () => console.log('🔥 Hot-Reload WebSocket Connection Established'))
                    socket.addEventListener('message', (event) => {
                        const data = JSON.parse(event.data)
                        if (data.type === 'full-reload') {
                            window.location.reload()
                        } else if (data.type === 'css-change') {
                            reloadCSS(data.files)
                        }
                    })
                    socket.addEventListener('close', () => console.log('Hot-Reload WebSocket Connection Closed'))
                    socket.addEventListener('error', (error) => console.error('Hot-Reload Error: ', error))
                }

                function reloadCSS(files) {
                    const links = document.querySelectorAll('link[rel="stylesheet"]') // Get all stylesheet links in the document
                    links.forEach(link => {
                        const href = link.getAttribute('href')
                        if (!href) { return }

                        // Check if this CSS file was in the changed files, and if it was, hot-swap the CSS file
                        const shouldReload = files.some(file => {
                            const fileName = file.split(/[\\\\/]+/g).pop() || file
                            const linkFileName = href.split(/[\\\\/]+/g).pop() || href
                            return linkFileName.includes(fileName) || fileName.includes(href)
                        })

                        if (shouldReload) {
                            const newLink = link.cloneNode()
                            const url = new URL(href, window.location.origin)
                            url.searchParams.set('__hot_reload__', Date.now().toString())
                            newLink.href = url.toString()

                            // Replace the old link with the new one
                            newLink.addEventListener('load', () => link.remove())
                            newLink.addEventListener('error', () => link.remove())
                            link.parentNode.insertBefore(newLink, link.nextSibling)
                        }
                    })
                }

                setupHotReload()
            </script>
        `
    }

    /** Shuts down the server and performs the necessary cleanup operation */
    shutdown() {
        console.log('Shutting down server...')
        this.wsClients.forEach(client => client.close())
        this.wsClients.clear()
        this.watcher?.close()
        this.abortableController.abort()
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

    console.log(`File Server running on \x1b[4;36mhttp://${args.host}:${args.port}\x1b[0m`);

    // Handle graceful shutdown
    Deno.addSignalListener("SIGINT", () => {
        self.shutdown()
    })

    // Self Serve
    try {
        await self.serve()
    } catch (error) {
        console.error("Failed to serve files: ", error);
        Deno.exit(1)
    }
    console.log('Server shutdown')
}

// This file is being run directly as the main program
if (import.meta.main) {
    main()
}
