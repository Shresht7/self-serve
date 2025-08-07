// Library
import { extname } from "@std/path"
import { contentType } from "@std/media-types/content-type"
import { green, yellow, red, bold } from "@std/fmt/colors"


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
