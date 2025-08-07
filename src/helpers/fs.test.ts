import { getMimeType } from "./fs.ts"
import { assertEquals } from "@std/assert"

Deno.test("getMimeType should return the correct mime type", () => {
    assertEquals(getMimeType("file.html"), "text/html; charset=UTF-8")
    assertEquals(getMimeType("file.css"), "text/css; charset=UTF-8")
    assertEquals(getMimeType("file.js"), "text/javascript; charset=UTF-8")
    assertEquals(getMimeType("file.json"), "application/json; charset=UTF-8")
    assertEquals(getMimeType("file.png"), "image/png")
    assertEquals(getMimeType("file.jpg"), "image/jpeg")
    assertEquals(getMimeType("file.jpeg"), "image/jpeg")
    assertEquals(getMimeType("file.svg"), "image/svg+xml")
    assertEquals(getMimeType("file.txt"), "text/plain; charset=UTF-8")
    assertEquals(getMimeType("file.unknown"), "application/octet-stream")
})
