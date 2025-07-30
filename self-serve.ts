// Deno Standard Library
import { parseArgs } from "jsr:@std/cli"
import { contentType } from "jsr:@std/media-types"

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
    ) {
        // Handle graceful shutdown
        Deno.addSignalListener("SIGINT", () => this.shutdown())
    }

    /** Starts the server */
    async serve() {
        this.startFileWatcher()  // Start the File Watcher

        const handler = async (req: Request): Promise<Response> => {
            const url = new URL(req.url)

            // Handle WebSocket upgrade for hot-reload
            if (url.pathname === "/__hot_reload__") {
                return this.handleWebSocketUpgrade(req)
            }

            console.log(`\x1b[90m-- ${this.getClientIP(req)} \x1b[92m${req.method}\x1b[0m ${url.pathname}`)
            return await this.serveStatic(url.pathname)
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
        return req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1'
    }

    /** Function to serve static files and directory listings */
    private async serveStatic(pathName: string): Promise<Response> {
        // Normalize path and prevent directory traversal
        const decodedPathName = decodeURIComponent(pathName)
        const resolvedPath = this.dir + decodedPathName

        try {
            const realBasePath = await Deno.realPath(this.dir)
            const realResolvedPath = await Deno.realPath(resolvedPath)

            if (!realResolvedPath.startsWith(realBasePath) || resolvedPath.includes('\0')) {
                console.warn(`\x1b[91m→ Blocked suspicious path: ${decodedPathName}\x1b[0m`)
                return new Response('Forbidden', { status: 403 })
            }
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                return new Response(this.generateNotFoundPage(decodedPathName), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
            }
            console.error('Error resolving path: ', error)
            return new Response('Internal Server Error', { status: 500 })
        }

        try {
            const fileInfo = await Deno.stat(resolvedPath)
            if (fileInfo.isDirectory) {
                const indexPath = resolvedPath + (resolvedPath.endsWith('/') ? '' : '/') + 'index.html'
                try {
                    await Deno.stat(indexPath);
                    return await this.serveFile(indexPath)
                } catch (error) {
                    if (error instanceof Deno.errors.NotFound) {
                        const directoryListing = await this.generateDirectoryListingPage(decodedPathName, resolvedPath)
                        return new Response(directoryListing, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
                    }
                    throw error
                }
            }

            return await this.serveFile(resolvedPath)
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                return new Response(this.generateNotFoundPage(decodedPathName), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
            } else if (error instanceof Deno.errors.PermissionDenied) {
                return new Response('Forbidden', { status: 403 })
            }
            console.error('Error serving file: ', error)
            return new Response('Internal Server Error', { status: 500 })
        }
    }

    /** Helper function to serve a single file */
    private async serveFile(filePath: string): Promise<Response> {
        const content = await Deno.readFile(filePath)
        const mimeType = contentType(filePath.split('.').pop() || '') || 'application/octet-stream'

        if (mimeType === 'text/html; charset=utf-8') {
            const html = new TextDecoder().decode(content)
            const hotReloadScript = this.generateHotReloadScript()

            let modifiedHtml
            if (html.includes('</body>')) {
                modifiedHtml = html.replace(/<\/body>/i, hotReloadScript + '\n</body>')
            } else if (html.includes('</html>')) {
                modifiedHtml = html.replace(/<\/html>/i, hotReloadScript + '\n</html>')
            } else {
                modifiedHtml = html + hotReloadScript
            }

            return new Response(modifiedHtml, {
                headers: {
                    "Content-Type": mimeType,
                    "Cache-Control": 'no-cache, no-store, must-revalidate',
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            })
        }

        const headers: Record<string, string> = {
            'Content-Type': mimeType
        };
        if (mimeType.startsWith('image/') || mimeType === 'application/javascript') {
            headers['Cache-Control'] = 'public, max-age=0, must-revalidate'
        }
        return new Response(content, { headers })
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
                            console.log(`\x1b[36mFile changed:\x1b[0m ${webFiles.join(', ')}`)
                            this.onFilesChanged(webFiles)
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

    /** Generates the HTML for a directory listing page */
    private async generateDirectoryListingPage(pathName: string, resolvedPath: string): Promise<string> {
        let fileList = ''
        const entries = []
        for await (const entry of Deno.readDir(resolvedPath)) {
            entries.push(entry)
        }
        // Sort entries: directories first, then files, all alphabetically
        entries.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1
            if (!a.isDirectory && b.isDirectory) return 1
            return a.name.localeCompare(b.name)
        })

        for (const entry of entries) {
            const slash = entry.isDirectory ? '/' : ''
            const href = `${pathName.endsWith('/') ? '' : pathName + '/'}${entry.name}${slash}`
            fileList += `<li><a href="${href}">${entry.name}${slash}</a></li>`
        }

        return /* HTML */`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Index of ${pathName}</title>
                    <style>
                        body { font-family: sans-serif; padding: 20px; color: #333; }
                        h1 { border-bottom: 1px solid #ccc; padding-bottom: 10px; }
                        ul { list-style: none; padding: 0; }
                        li { padding: 5px 0; }
                        a { text-decoration: none; color: #007bff; }
                        a:hover { text-decoration: underline; }
                    </style>
                </head>
                <body>
                    <h1>Index of ${pathName}</h1>
                    <ul>
                        ${pathName !== '/' ? '<li><a href="..">../</a></li>' : ''}
                        ${fileList}
                    </ul>
                </body>
                </html>
            `
    }

    /** Generates the HTML for a 404 Not Found page */
    private generateNotFoundPage(path: string): string {
        return /* HTML */`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>404 Not Found</title>
                <style>
                    *, *:before, *:after { box-sizing: border-box; margin: 0; padding: 0; }
                    body { height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: sans-serif; text-align: center; color: #333; }
                    h1 { font-size: 120px; margin: 0; font-weight: 900; }
                    p { font-size: 24px; }
                    code { background: #eee; padding: 2px 6px; border-radius: 4px; }
                </style>
            </head>
            <body>
                <h1>404</h1>
                <p>Page Not Found: <code>${path}</code></p>
            </body>
            </html>
        `
    }

    /** Shuts down the server and performs the necessary cleanup operation */
    shutdown() {
        console.log('Shutting down server...')
        this.wsClients.forEach(client => client.readyState === WebSocket.OPEN && client.close())
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
  -a, --host    Host address to listen on (default: ${DEFAULT_HOST})
  -p, --port    Port to listen on (default: ${DEFAULT_PORT})
 
  -h, --help    Show this help message
  -v, --version Show version number
`

/** Parses command-line arguments and returns an object with the parsed values */
function parseCommandLineArguments(args: string[]): { dir: string, host: string, port: number, version: boolean, help: boolean } {
    const flags = parseArgs(args, {
        string: ["dir", "host", "port"],
        boolean: ["help", "version"],
        alias: {
            "help": "h",
            "version": "v",
            "dir": "d",
            "host": "a",
            "port": "p",
        },
        default: {
            dir: Deno.cwd(),
            host: DEFAULT_HOST,
            port: DEFAULT_PORT,
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

/** The main entrypoint of the application */
async function main() {
    // Parse the command-line arguments
    const args = parseCommandLineArguments(Deno.args)

    // Show the help message if `-h` or `--help` command-line option was passed in
    if (args.help) {
        console.info(HELP_MESSAGE)
        return Deno.exit(0)
    }

    // Show the version number if `-v` or `--version` command-line option was passed in
    if (args.version) {
        console.info(VERSION)
        return Deno.exit(0)
    }

    // Initialize the self server
    const self = new Self(args.dir, args.host, args.port)

    console.info(`File Server running on \x1b[4;36mhttp://${args.host}:${args.port}\x1b[0m serving \x1b[33m${args.dir}\x1b[0m`);

    // Self Serve
    try {
        await self.serve()
    } catch (error) {
        console.error("Failed to serve files: ", error)
        Deno.exit(1)
    }
    console.info('Server shutdown')
}

// Call the `main` function if this file is being run directly
// as the main program. (as opposed to being imported in a script)
if (import.meta.main) {
    main()
}
