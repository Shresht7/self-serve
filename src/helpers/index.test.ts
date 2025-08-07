import { assertEquals } from "@std/assert"
import { getMimeType, getColoredStatusText } from "./index.ts"
import { green, yellow, red, bold } from "@std/fmt/colors"

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


Deno.test("getColoredStatusText should return the correct colored status text", () => {
    assertEquals(getColoredStatusText(200), green("[200]"))
    assertEquals(getColoredStatusText(304), yellow("[304]"))
    assertEquals(getColoredStatusText(404), red("[404]"))
    assertEquals(getColoredStatusText(500), bold(red("[500]")))
})
