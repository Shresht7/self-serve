// Modules
import * as cli from './src/cli.ts'
import * as template from './src/templates/index.ts'
import * as hotReload from './src/lib/hotReload.ts'
import * as helpers from './src/helpers/index.ts'

class Self {
    constructor(
        /** Directory to serve files from */
        private dir: string,
        /** Hostname for the server */
        private host: string,
        /** Port for the server */
        private port: number,
        /** File system watcher for hot-reloading */
        private watcher: Deno.FsWatcher | null = null,
        /** File extensions to watch for changes */
        private watchFor: string[] = ['html', 'css', 'js', 'json', 'svg', 'png', 'jpg', 'jpeg'],
        /** Set of connected WebSocket clients for hot-reloading */
        private wsClients: Set<WebSocket> = new Set(),
        /** Controller for graceful server shutdown */
        private abortableController: AbortController = new AbortController(),
    ) {
        // Handle graceful shutdown
        Deno.addSignalListener("SIGINT", () => this.shutdown())
    }

    /** Starts the server */
    async serve() {
        // Start the File Watcher
        this.startFileWatcher()

        // Define the request handler
        const handler = async (req: Request): Promise<Response> => {
            const url = new URL(req.url)

            // Handle WebSocket upgrade for hot-reload
            if (url.pathname === "/__hot_reload__") {
                return this.handleWebSocketUpgrade(req)
            }

            // Log the request
            console.log(`\x1b[90m-- ${helpers.getClientIP(req)} \x1b[92m${req.method}\x1b[0m ${url.pathname}`)

            // Serve static files
            return await this.serveStatic(url.pathname)
        }

        // Start the Deno server
        const server = Deno.serve({
            hostname: this.host,
            port: this.port,
            signal: this.abortableController.signal,
        }, handler)

        // Wait for the server to finish or catch an AbortError
        try {
            await server.finished
        } catch (error) {
            const { name } = error as Error
            if (name !== 'AbortError') {
                throw error
            }
        }
    }

    /** Function to serve static files and directory listings */
    private async serveStatic(pathName: string): Promise<Response> {
        // Normalize the path
        const decodedPathName = decodeURIComponent(pathName)
        const resolvedPath = this.dir + decodedPathName

        // Check for path traversal and symlinks
        const errResponse = await this.checkPath(pathName, resolvedPath, this.dir)
        if (errResponse) { return errResponse }

        try {
            const fileInfo = await Deno.stat(resolvedPath)
            if (fileInfo.isDirectory) {
                const indexPath = resolvedPath + (resolvedPath.endsWith('/') ? '' : '/') + 'index.html'
                try {
                    await Deno.stat(indexPath)
                    return await this.serveFile(indexPath)
                } catch (error) {
                    if (error instanceof Deno.errors.NotFound) {
                        const dirList = await template.generateDirectoryListingPage(decodedPathName, resolvedPath)
                        return new Response(dirList, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
                    }
                    throw error
                }
            }

            return await this.serveFile(resolvedPath)
        } catch (error) {
            return this.createErrorResponse(error as Error, pathName)
        }
    }

    /**
     * Checks if the requested path is valid and does not contain suspicious patterns
     * @returns an Error {@link Response} if there is an issue, or {@link null} if there isn't
     */
    private async checkPath(pathName: string, resolvedPath: string, dir: string): Promise<Response | null> {
        try {
            const realBasePath = await Deno.realPath(dir)
            const realResolvedPath = await Deno.realPath(resolvedPath)

            if (!realResolvedPath.startsWith(realBasePath) || resolvedPath.includes('..') || resolvedPath.includes('\0')) {
                console.warn(`\x1b[91m→ Blocked suspicious path: ${pathName}\x1b[0m`)
                return new Response('Forbidden', { status: 403 })
            }
        } catch (error) {
            return this.createErrorResponse(error as Error, pathName)
        }
        return null
    }

    /** Creates an error response based on the type of error */
    private createErrorResponse(error: Error, pathName: string) {
        if (error instanceof Deno.errors.NotFound) {
            return new Response(template.generateNotFoundPage(pathName), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        } else if (error instanceof Deno.errors.PermissionDenied) {
            return new Response('Forbidden', { status: 403 })
        }
        console.error('Error serving file: ', error)
        return new Response('Internal Server Error', { status: 500 })
    }

    /** Helper function to serve a single file */
    private async serveFile(filePath: string): Promise<Response> {
        // Read the file-contents and determine the mime-type
        const content = await Deno.readFile(filePath)
        const mimeType = helpers.getMimeType(filePath)

        // HTML: Inject hot-reload script
        if (mimeType.includes('text/html')) {
            const modifiedHtml = hotReload.injectHotReloadScript(content, this.host, this.port)
            return new Response(modifiedHtml, {
                headers: {
                    "Content-Type": mimeType,
                    "Cache-Control": 'no-cache, no-store, must-revalidate',
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            })
        }

        // Default headers for other file types
        const headers: Record<string, string> = {
            'Content-Type': mimeType
        }

        // Set Cache-Control header for images and JavaScript files
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
                        const ext = helpers.getExtension(path)
                        return ext && this.watchFor.includes(ext)
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
