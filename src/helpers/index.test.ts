import { assertEquals } from "@std/assert"
import { getColoredStatusText } from "./index.ts"
import { green, yellow, red, bold } from "@std/fmt/colors"

Deno.test("getColoredStatusText should return the correct colored status text", () => {
    assertEquals(getColoredStatusText(200), green("[200]"))
    assertEquals(getColoredStatusText(304), yellow("[304]"))
    assertEquals(getColoredStatusText(404), red("[404]"))
    assertEquals(getColoredStatusText(500), bold(red("[500]")))
})
