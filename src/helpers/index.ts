// Library
import { contentType } from "jsr:@std/media-types/content-type"

/** Helper function to get the IP Address of the client */
export function getClientIP(req: Request): string {
    return req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1'
}

/** Helper function to get the extension of a file */
export function getExtension(path: string): string {
    return path.split('.')?.pop()?.toLowerCase() ?? ''
}

/** Helper function to get the mime-type of a file */
export function getMimeType(path: string) {
    const ext = getExtension(path)
    return contentType(ext) || 'application/octet-stream'
}
