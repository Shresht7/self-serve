export function GET(_req: Request) {
    return new Response("Hello from API!")
}

export function POST(_req: Request) {
    return new Response("You posted to me!")
}
