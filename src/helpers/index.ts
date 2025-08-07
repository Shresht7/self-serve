// Library
import { extname, join } from "@std/path"
import { contentType } from "@std/media-types/content-type"
import { green, yellow, red, bold } from "@std/fmt/colors"
import { expandGlob } from "@std/fs"


/** Helper function to get the IP Address of the client */
export function getClientIP(req: Request): string {
    return req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1'
}

/** Helper function to get the mime-type of a file */
export function getMimeType(path: string) {
    const ext = extname(path).substring(1)
    return contentType(ext) || 'application/octet-stream'
}

/** Gets the colored status text for a given status code */
export function getColoredStatusText(status: number): string {
    if (status >= 200 && status < 300) {
        return green(`[${status}]`)
    }
    if (status >= 300 && status < 400) {
        return yellow(`[${status}]`)
    }
    if (status >= 400 && status < 500) {
        return red(`[${status}]`)
    }
    return bold(red(`[${status}]`))
}

/**
 * Resolves the full path to an API file, prioritizing .ts over .js
 * Supports nested paths.
 * @param baseDir - The base directory (Deno.cwd())
 * @param serveDir - The directory being served (this.dir)
 * @param apiDir - The API directory relative to serveDir (this.apiDir)
 * @param apiPath - The requested API path (e.g., 'users/profile')
 * @returns The full path to the API file, or undefined if not found
 */
export async function resolveApiFilePath(baseDir: string, serveDir: string, apiDir: string, apiPath: string): Promise<string | undefined> {
    const apiRootPath = join(baseDir, serveDir, apiDir)

    let foundFilePath: string | undefined

    try {
        // Search for .ts files first
        for await (const entry of expandGlob(`${apiPath}.ts`, { root: apiRootPath })) {
            foundFilePath = entry.path
            break // Found a .ts file, prioritize it and stop
        }

        if (!foundFilePath) {
            // If no .ts, search for .js files
            for await (const entry of expandGlob(`${apiPath}.js`, { root: apiRootPath })) {
                foundFilePath = entry.path
                break
            }
        }
    } catch (error) {
        // If the root directory for glob doesn't exist, it throws NotFound
        if (error instanceof Deno.errors.NotFound) {
            return undefined
        } else {
            throw error // Otherwise, just rethrow other errors
        }
    }

    return foundFilePath
}
