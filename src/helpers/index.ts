import { contentType } from "jsr:@std/media-types/content-type"

export function getMimeType(path: string) {
    const ext = path.split('.').pop() ?? ''
    return contentType(ext) || 'application/octet-stream'
}
