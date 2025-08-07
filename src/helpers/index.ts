// Library
import { green, yellow, red, bold } from "@std/fmt/colors"

// File-system helpers
export * from './fs.ts'

/** Helper function to get the IP Address of the client */
export function getClientIP(req: Request): string {
    return req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1'
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
