// Library
import { extname, join } from "@std/path"
import { expandGlob } from "@std/fs"
import { contentType } from "@std/media-types/content-type"

/** Helper function to get the mime-type of a file */
export function getMimeType(path: string) {
    const ext = extname(path).substring(1)
    return contentType(ext) || 'application/octet-stream'
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
