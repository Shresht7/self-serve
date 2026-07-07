/**
 * `self-serve` is a simple, zero-dependency static file server for local development
 * with live-reload, CSS hot-swap, SPA fallback, directory listing, and file-based API routes.
 *
 * This is the CLI entrypoint. For programmatic/library usage, see the `./server` export.
 *
 * @example
 * ```sh
 * deno run --allow-net --allow-read jsr:@shresht7/self-serve
 * ```
 *
 * @module
 */

// Deno Standard Library
import { cyan, red, yellow, underline, italic } from "@std/fmt/colors"

// Modules
import * as cli from './src/cli.ts'
import { Self } from './src/server.ts'

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
        showDotfiles: args["show-dotfiles"],
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
