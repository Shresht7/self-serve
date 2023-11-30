package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
)

const DEFAULT_PORT = 5327

// A super simple static file server
func main() {
	// Parse the command line arguments
	dir := flag.String("dir", ".", "The directory to serve")
	port := flag.Int("port", DEFAULT_PORT, "The port number to use")
	flag.Parse()

	// Print out the port to the console
	fmt.Printf("File Server running on http://localhost:%v", *port)
	fmt.Print("\t\u001b[90m| Ctrl+C to quit\u001b[99m\n") // Use ansi codes to color it gray

	// Serve the directory on the given port
	err := SelfServe(*dir, *port)
	// If there is an error crash the server
	if err != nil {
		log.Fatalln(err)
	}
}

// Serve the given directory on the given port
func SelfServe(dir string, port int) error {
	host := fmt.Sprintf(":%v", port) // 5327 => :5327
	fileServer := http.FileServer(http.Dir(dir))
	return http.ListenAndServe(host, fileServer)
}
