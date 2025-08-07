export function GET(req: Request) {
    return new Response("Hello from API!")
}

export function POST(req: Request) {
    return new Response("You posted to me!")
}
