// Deno Standard Library
import { expandGlob } from "@std/fs"
import { toFileUrl } from "@std/path"
import { red } from "@std/fmt/colors"

/**
 * Handles incoming requests to server-side API functions
 * It dynamically imports the relevant API module and executes the function corresponding to the HTTP method
 * @param dir The base directory where API files are located
 * @param endpoint The requested API endpoint (e.g., 'users/profile')
 * @param req The incoming Request object
 * @returns A Promise that resolves to a Response object
 */
export async function handleServerFunction(dir: string, endpoint: string, req: Request): Promise<Response> {

    // Resolve the path to the server function file
    const serverFunctionPath = await resolveApiFilePath(dir, endpoint)
    if (!serverFunctionPath) {
        return new Response(`API endpoint not found: ${endpoint}`, { status: 404 })
    }

    let apiModule
    try {
        // Dynamically import the API module
        apiModule = await import(toFileUrl(serverFunctionPath).toString())
    } catch (error) {
        console.error(red(`Error handling API request for ${endpoint}:`), error)
        return new Response('Internal Server Error', { status: 500 })
    }

    // Get the HTTP method function (e.g., GET, POST)
    const method = req.method.toUpperCase()
    const handler = apiModule?.[method]

    if (typeof handler === 'function') {
        // Execute the handler and return its response
        return await handler(req)
    } else {
        return new Response(`Method ${method} not allowed for ${endpoint}`, { status: 405 })
    }

}

/**
 * Resolves the full path to an API file, prioritizing .ts over .js
 * Supports nested paths.
 * @param dir - The API directory to serve
 * @param endpoint - The requested API path (e.g., 'users/profile')
 * @returns The full path to the API file, or undefined if not found
 */
async function resolveApiFilePath(dir: string, endpoint: string): Promise<string | undefined> {
    let foundFilePath: string | undefined

    try {
        // Search for .ts files first
        for await (const entry of expandGlob(`${endpoint}.ts`, { root: dir })) {
            foundFilePath = entry.path
            break // Found a .ts file, prioritize it and stop
        }

        if (!foundFilePath) {
            // If no .ts, search for .js files
            for await (const entry of expandGlob(`${endpoint}.js`, { root: dir })) {
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
