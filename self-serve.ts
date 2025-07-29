// ----
// SELF
// ----

class Self {
    constructor(
        private dir: string,
        private host: string,
        private port: number
    ) { }

    serve() {
        const handler = (_req: Request): Response => {
            return new Response("Hello World")
        }

        Deno.serve({
            hostname: this.host,
            port: this.port
        }, handler)

        console.log(`Server started on http://${this.host}:${this.port}`)
    }
}

// ----
// MAIN
// ----

async function main() {
    const self = new Self(".", "localhost", 8080)
    await self.serve()
}

// This file is being run directly as the main program
if (import.meta.main) {
    main()
}
