// Deno Standard Library
import { join, extname, toFileUrl } from "@std/path"
import { green, gray, cyan, red, yellow, underline, italic } from "@std/fmt/colors"

// Modules
import * as cli from './src/cli.ts'
import * as template from './src/templates/index.ts'
import * as hotReload from './src/lib/hotReload.ts'
import * as helpers from './src/helpers/index.ts'

interface Config {
    /** The directory to serve files from */
    dir: string
    /** The host to bind the server to */
    host: string
    /** The port to bind the server to */
    port: number
    /** Whether to enable live-reload */
    watch: boolean
    /** Whether to enable CORS and on what origins */
    cors: string
    /** Whether to enable SPA fallback routing */
    spa: boolean
    /** Path to the server-actions api directory */
    apiDir: string
}

class Self {
    /** The directory to serve the files from */
    private dir: string
    /** The hostname of the server */
    private host: string
    /** The port of the server */
    private port: number
    /** Whether to enable live-reload */
    private liveReload: boolean
    /** Whether to enable CORS and on what origins */
    private cors: string
    /** Whether to enable SPA fallback routing */
    private spa: boolean
    /** Path to the server-actions api directory */
    private apiDir: string
    /** File-System Watcher for hot-reloading */
    private watcher: Deno.FsWatcher | null = null
    /** The file-extensions to watch for changes */
    private watchFor: string[] = ['html', 'css', 'js', 'json', 'svg', 'png', 'jpg', 'jpeg']
    /** Set of connected WebSocket clients */
    private wsClients: Set<WebSocket> = new Set()
    /** AbortController for graceful shutdown */
    private abortableController: AbortController = new AbortController()

    /**
     * Creates a new instance of the Self server
     * @param cfg - The configuration options for the server
     */
    constructor(cfg: Config) {
        this.dir = cfg.dir
        this.host = cfg.host
        this.port = cfg.port
        this.liveReload = cfg.watch
        this.cors = cfg.cors
        this.spa = cfg.spa
        this.apiDir = cfg.apiDir
        this.setupShutdownListener()
    }

    /** Starts the server */
    async serve() {
        // Start the File Watcher if watching is enabled
        if (this.liveReload) {
            this.startFileWatcher()
        }

        // Define the request handler
        const handler = async (req: Request): Promise<Response> => {
            const url = new URL(req.url)
            const start = performance.now() // To time the request-response cycle

            if (this.liveReload && url.pathname.endsWith(hotReload.MARKER)) {
                return this.handleWebSocketUpgrade(req)
            }

            // Route the request to the appropriate handler and get a response
            let response: Response
            if (url.pathname.startsWith('/' + this.apiDir)) {
                // Handle API requests
                response = await this.handleApiRequest(req)
            } else {
                // Serve static files
                response = await this.handleStaticRequest(url.pathname)
            }

            // Apply CORS headers if required
            if (this.cors) { this.applyCors(response) }

            // Log the request
            const duration = (performance.now() - start).toFixed(2)
            const statusText = helpers.getColoredStatusText(response.status)
            console.log(gray(`-- ${helpers.getClientIP(req)} ${green(req.method)} ${url.pathname} ${statusText} ${cyan(`${duration}ms`)}`))

            return response
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

    /** Function to handle incoming requests for static files and directory listings */
    private async handleStaticRequest(pathName: string): Promise<Response> {
        // Normalize the path
        const decodedPathName = decodeURIComponent(pathName)
        const resolvedPath = join(this.dir, decodedPathName)

        // Check for path traversal and symlinks
        const errResponse = await this.checkPath(pathName, resolvedPath, this.dir)
        if (errResponse) { return errResponse }

        try {
            const fileInfo = await Deno.stat(resolvedPath)
            if (fileInfo.isDirectory) {
                return await this.serveDirectory(resolvedPath, pathName)
            } else {
                return await this.serveFile(resolvedPath)
            }
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
                console.warn(red(`→ Blocked suspicious path: ${pathName}`))
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
            if (this.spa) {
                const indexPath = join(this.dir, 'index.html')
                return this.serveFile(indexPath)
            }
            return new Response(template.generateNotFoundPage(pathName), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        } else if (error instanceof Deno.errors.PermissionDenied) {
            return new Response('Forbidden', { status: 403 })
        }
        console.error(red(`Error serving ${pathName}:`), error)
        return new Response('Internal Server Error', { status: 500 })
    }

    /** Serves a directory, either by serving its index.html or by generating a directory listing */
    private async serveDirectory(path: string, pathName: string): Promise<Response> {
        const indexPath = join(path, 'index.html')
        try {
            await Deno.stat(indexPath)
            return await this.serveFile(indexPath)
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                const dirList = await template.generateDirectoryListingPage(pathName, path)
                return new Response(dirList, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
            }
            throw error
        }
    }

    /** Helper function to serve a single file */
    private async serveFile(filePath: string): Promise<Response> {
        // Read the file-contents and determine the mime-type
        const content = await Deno.readFile(filePath)
        const mimeType = helpers.getMimeType(filePath)

        // HTML: Inject hot-reload script if enabled
        if (this.liveReload && mimeType.includes('text/html')) {
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

        // Add nosniff header to all responses for security
        // This prevents the browser from trying to guess the content-type which can help mitigate certain types of attacks
        headers['X-Content-Type-Options'] = 'nosniff'

        return new Response(content, { headers })
    }

    /**
     * Handles API requests by dynamically importing and executing API modules.
     * @param req - The incoming Request object.
     * @returns A Promise that resolves to a Response object.
     */
    private async handleApiRequest(req: Request): Promise<Response> {
        const url = new URL(req.url)
        const apiPath = url.pathname.substring(this.apiDir.length + 1) // Remove apiDir prefix

        const apiFilePath = await helpers.resolveApiFilePath(Deno.cwd(), this.dir, this.apiDir, apiPath)
        if (!apiFilePath) {
            return new Response(`API endpoint not found: ${apiPath}`, { status: 404 })
        }

        try {
            // Dynamically import the API module
            const apiModule = await import(toFileUrl(apiFilePath).toString())

            // Get the HTTP method function (e.g., GET, POST)
            const method = req.method.toUpperCase()
            const handler = apiModule[method]

            if (typeof handler === 'function') {
                // Execute the handler and return its response
                return await handler(req)
            } else {
                return new Response(`Method ${method} not allowed for ${apiPath}`, { status: 405 })
            }
        } catch (error) {
            console.error(red(`Error handling API request for ${apiPath}:`), error)
            return new Response('Internal Server Error', { status: 500 })
        }
    }

    /** Applies CORS headers to a response if the feature is enabled */
    private applyCors(response: Response) {
        if (this.cors) {
            response.headers.set('Access-Control-Allow-Origin', this.cors)
        }
    }

    /** Starts the file-watcher to monitor changes in the served directory */
    private async startFileWatcher() {
        try {
            // Check if the directory exists and is readable
            const dirInfo = await Deno.stat(this.dir)
            if (!dirInfo || !dirInfo.isDirectory) {
                console.error(red(`${this.dir} is not a directory`))
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
                        const ext = extname(path).substring(1)
                        return ext && this.watchFor.includes(ext)
                    })

                    if (webFiles.length > 0) {
                        // Debounce rapid file changes (100ms delay)
                        if (debounceTimer) {
                            clearTimeout(debounceTimer)
                        }
                        debounceTimer = setTimeout(() => {
                            console.log(cyan(`File changed: ${webFiles.join(', ')}`))
                            this.onFilesChanged(webFiles)
                        }, 100)
                    }
                }
            }
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                console.error(red(`Directory not found: ${this.dir}`))
            } else if (error instanceof Deno.errors.PermissionDenied) {
                console.error(red(`Permission denied: ${this.dir}`))
            } else {
                console.error(red('Error watching files: '), error)
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
            console.log(green(`→ WebSocket client connected (${this.wsClients.size} total)`))
        })

        socket.addEventListener('close', () => {
            this.wsClients.delete(socket)
            console.log(red(`→ WebSocket client disconnected (${this.wsClients.size} remaining)`))
        })

        socket.addEventListener('error', (error) => {
            this.wsClients.delete(socket)
            console.error(red(`→ WebSocket error:`), error)
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
                    console.error(red(`→ Failed to send to client:`), error)
                    this.wsClients.delete(client)
                }
            } else {
                this.wsClients.delete(client)
            }
        }
    }

    /** Sets up a listener to gracefully shut down the server on Ctrl+C */
    private async setupShutdownListener() {
        // Set stdin to raw mode to capture individual key presses
        try {
            Deno.stdin.setRaw(true)
        } catch {
            // Ignore if not in a TTY environment
            return
        }
        const buffer = new Uint8Array(1)

        while (true) {
            try {
                const n = await Deno.stdin.read(buffer)
                if (n === null) break // Stdin closed

                // Check for Ctrl+C (ETX character, byte value 3)
                if (buffer[0] === 3) {
                    this.shutdown()
                    break // Exit the listener loop
                }
            } catch {
                // Ignore errors and exit loop
                break
            }
        }
    }

    /** Shuts down the server and performs the necessary cleanup operation */
    shutdown() {
        console.log('Shutting down server...')
        // Restore terminal to its normal state
        try {
            Deno.stdin.setRaw(false)
        } catch {
            // Ignore if not in a TTY environment
        }
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
    const self = new Self({
        dir: args.dir,
        host: args.host,
        port: args.port,
        watch: args.watch,
        cors: args.cors,
        spa: args.spa,
        apiDir: args.api,
    })

    console.info(`Serving ${yellow(args.dir)} on ${underline(cyan(`http://${args.host}:${args.port}`))}`)
    if (!args.watch) {
        console.info(italic('Live-reload disabled'))
    }

    // Self Serve
    try {
        await self.serve()
    } catch (error) {
        console.error(red("Failed to serve files: "), error)
        Deno.exit(1)
    }
    console.info('Server shutdown')
}

// Call the `main` function if this file is being run directly
// as the main program. (as opposed to being imported in a script)
if (import.meta.main) {
    main()
}
