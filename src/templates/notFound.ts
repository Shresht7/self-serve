/** Generates the HTML for a 404 Not Found page */
export function generateNotFoundPage(path: string): string {
    return /* HTML */ `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>404 Not Found</title>
                <style>
                    :root { color-scheme: light dark; }
                    *, *:before, *:after { box-sizing: border-box; margin: 0; padding: 0; }
                    body { height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: sans-serif; text-align: center; color: #333; }
                    h1 { font-size: 120px; margin: 0; font-weight: 900; }
                    p { font-size: 24px; }
                    code { background: #eee; padding: 2px 6px; border-radius: 4px; }
                    @media (prefers-color-scheme: dark) {
                        body { color: #eee; background-color: #333 }
                        code { background: #777; padding: 2px 6px; border-radius: 4px; }
                    }
                </style>
            </head>
            <body>
                <h1>404</h1>
                <p>Page Not Found: <code>${path}</code></p>
            </body>
        </html>
    `
}
