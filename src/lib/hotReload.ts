export const MARKER = "__hot_reload__" as const

/**
 * Generates the JavaScript code for the hot-reload client-side script.
 * @param host The host address for the WebSocket connection.
 * @param port The port number for the WebSocket connection.
 * @returns The JavaScript code as a string.
 */
export function generateHotReloadScript(host: string, port: number) {
    return /* JavaScript */ `
        const MARKER = '__hot_reload__'

        function setupHotReload() {
            const socket = new WebSocket('ws://${host}:${port}/${MARKER}')
            socket.addEventListener('open', () => console.log('🔥 Hot-Reload WebSocket Connection Established'))
            socket.addEventListener('message', (event) => {
                const data = JSON.parse(event.data)
                if (data.type === 'full-reload') {
                    window.location.reload()
                } else if (data.type === 'css-change') {
                    reloadCSS(data.files)
                }
            })
            socket.addEventListener('close', () => console.log('Hot-Reload WebSocket Connection Closed'))
            socket.addEventListener('error', (error) => console.error('Hot-Reload Error: ', error))
        }

        function reloadCSS(files) {
            const links = document.querySelectorAll('link[rel="stylesheet"]') // Get all stylesheet links in the document
            links.forEach(link => {
                const href = link.getAttribute('href')
                if (!href) { return }

                // Check if this CSS file was in the changed files, and if it was, hot-swap the CSS file
                const shouldReload = files.some(file => {
                    const fileName = file.split(/[\\\\/]+/g).pop() || file
                    const linkFileName = href.split(/[\\\\/]+/g).pop() || href
                    return linkFileName.includes(fileName) || fileName.includes(href)
                })

                if (shouldReload) {
                    const newLink = link.cloneNode()
                    const url = new URL(href, window.location.origin)
                    url.searchParams.set(MARKER, Date.now().toString())
                    newLink.href = url.toString()

                    // Replace the old link with the new one
                    newLink.addEventListener('load', () => link.remove())
                    newLink.addEventListener('error', () => link.remove())
                    link.parentNode.insertBefore(newLink, link.nextSibling)
                }
            })
        }

        setupHotReload()            
    `
}

/**
 * Injects the hot-reload script into an HTML content.
 * @param content The HTML content as a Uint8Array.
 * @param host The host address for the WebSocket connection.
 * @param port The port number for the WebSocket connection.
 */
export function injectHotReloadScript(content: Uint8Array<ArrayBuffer>, host: string, port: number) {
    const html = new TextDecoder().decode(content)

    const script = generateHotReloadScript(host, port)
    const hotReloadScript = /* HTML */ `<script>${script}</script>`

    if (html.includes('</body>')) {
        return html.replace(/<\/body>/i, hotReloadScript + '\n</body>')
    } else if (html.includes('</html>')) {
        return html.replace(/<\/html>/i, hotReloadScript + '\n</html>')
    } else {
        return html + hotReloadScript
    }
}
