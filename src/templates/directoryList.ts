/** Generates the HTML for a directory listing page */
export async function generateDirectoryListingPage(pathName: string, resolvedPath: string): Promise<string> {
    let fileList = ''
    const entries = []
    for await (const entry of Deno.readDir(resolvedPath)) {
        entries.push(entry)
    }
    // Sort entries: directories first, then files, all alphabetically
    entries.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
        const slash = entry.isDirectory ? '/' : ''
        const href = `${pathName.endsWith('/') ? '' : pathName + '/'}${entry.name}${slash}`
        fileList += `<li><a href="${href}">${entry.name}${slash}</a></li>`
    }

    return /* HTML */ `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Index of ${pathName}</title>
                <style>
                    :root { color-scheme: light dark; }
                    *, *:before, *:after { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: monospace; padding: 20px; color: #333; display: flex; flex-direction: column; gap: 1rem; }
                    h1 { border-bottom: 1px solid #ccc; padding-bottom: 10px; }
                    ul { list-style: none; padding: 0; }
                    li { padding: 5px 0; }
                    a { text-decoration: none; color: #007bff; }
                    a:hover { text-decoration: underline; }
                    @media (prefers-color-scheme: dark) {
                        h1 { border-bottom: 1px solid #777; }
                        body { color: #eee; background-color: #333 }
                        a { color: #eee; }
                    }
                </style>
            </head>
            <body>
                <h1>${pathName}</h1>
                <ul>
                    ${pathName !== '/' ? '<li><a href="..">../</a></li>' : ''}
                    ${fileList}
                </ul>
            </body>
        </html>
    `
}
