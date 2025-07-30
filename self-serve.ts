// Deno Standard Library
import { contentType } from "jsr:@std/media-types"

// Modules
import * as cli from './src/cli.ts'
import * as template from './src/templates/index.ts'
import { generateHotReloadScript } from './src/lib/hotReload.ts'

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
                return new Response(template.generateNotFoundPage(decodedPathName), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
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
                        const directoryListing = await template.generateDirectoryListingPage(decodedPathName, resolvedPath)
                        return new Response(directoryListing, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
                    }
                    throw error
                }
            }

            return await this.serveFile(resolvedPath)
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                return new Response(template.generateNotFoundPage(decodedPathName), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
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
            const modifiedHtml = this.injectHotReloadScript(content);
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

    /** Injects the hot-reload script into HTML content */
    private injectHotReloadScript(content: Uint8Array<ArrayBuffer>) {
        const html = new TextDecoder().decode(content)

        const script = generateHotReloadScript(this.host, this.port)
        const hotReloadScript = /* HTML */ `<script>${script}</script>`

        if (html.includes('</body>')) {
            return html.replace(/<\/body>/i, hotReloadScript + '\n</body>')
        } else if (html.includes('</html>')) {
            return html.replace(/<\/html>/i, hotReloadScript + '\n</html>')
        } else {
            return html + hotReloadScript
        }
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

/** The main entrypoint of the application */
async function main() {
    // Parse the command-line arguments
    const args = cli.parse(Deno.args)

    // Show the help message if `-h` or `--help` command-line option was passed in
    if (args.help) {
        cli.showHelp()
        return Deno.exit(0)
    }

    // Show the version number if `-v` or `--version` command-line option was passed in
    if (args.version) {
        cli.showVersion()
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
