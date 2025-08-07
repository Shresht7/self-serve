import { assertEquals } from "@std/assert"
import { parse } from "./cli.ts"

Deno.test("CLI argument parsing should handle default values", () => {
    const args = parse([])
    assertEquals(args.dir, Deno.cwd())
    assertEquals(args.host, "localhost")
    assertEquals(args.port, 5327)
    assertEquals(args.watch, true)
    assertEquals(args.cors, "*")
})

Deno.test("CLI argument parsing should handle custom values", () => {
    const args = parse(["--dir", "/tmp", "--host", "0.0.0.0", "--port", "8080", "--no-watch", "--cors", "https://example.com"])
    assertEquals(args.dir, "/tmp")
    assertEquals(args.host, "0.0.0.0")
    assertEquals(args.port, 8080)
    assertEquals(args.watch, false)
    assertEquals(args.cors, "https://example.com")
})

Deno.test("CLI argument parsing should handle aliases", () => {
    const args = parse(["-d", "/tmp", "-a", "0.0.0.0", "-p", "8080"])
    assertEquals(args.dir, "/tmp")
    assertEquals(args.host, "0.0.0.0")
    assertEquals(args.port, 8080)
})

Deno.test("CLI argument parsing should handle positional directory argument", () => {
    const args = parse(["/my/custom/dir"])
    assertEquals(args.dir, "/my/custom/dir")
})
