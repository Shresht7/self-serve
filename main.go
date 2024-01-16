package main

import (
	"bufio"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
)

// The server instance
var server *http.Server

// A channel to listen for restarts
var restart = make(chan bool)

// The default host to use
const DEFAULT_HOST = "localhost"

// The default port to use
const DEFAULT_PORT = 5327

// A super simple static file server
func main() {
	// Get current working directory
	cwd, err := os.Getwd()
	if err != nil {
		log.Fatalf(err.Error())
	}

	// Get the default host and port configuration from environment variables
	defaultHost, defaultPort := getDefaultConfiguration()

	// Parse the command line arguments
	dir := flag.String("dir", cwd, "The directory to serve")
	port := flag.Int("port", defaultPort, "The port number to use")
	host := flag.String("host", defaultHost, "The host to use")
	flag.Parse()

	// Print out the port to the console
	fmt.Printf("File Server running on http://%s:%v", *host, *port)
	fmt.Print("\t\u001b[90m| Ctrl+C to quit\u001b[0m\n") // Use ansi codes to color it gray

	// Handle graceful exit
	go func() {
		signalChan := make(chan os.Signal, 1)
		signal.Notify(signalChan, os.Interrupt)
		<-signalChan
		log.Println("Closing the server...")
		server.Close()   // Close the server
		restart <- false // Signal not to restart
	}()

	// Listen for keyboard input to restart the server
	go func() {
		reader := bufio.NewReader(os.Stdin)
		for {
			text, _ := reader.ReadString('\n')
			if strings.TrimSpace(text) == "r" {
				// Restart the server
				log.Println("Restarting the server...")
				server.Close()  // Close the server
				restart <- true // Signal to restart
			}
		}
	}()

	// Start indefinite loop to serve the files and restart the server when needed
	for {
		// Serve the files
		err := SelfServe(*dir, *host, *port)
		if err != nil {
			log.Println(err.Error())
		}

		// Listen for restart signal from the channel
		// If the restart signal is `false`, then exit the loop
		shouldContinue := <-restart
		if !shouldContinue {
			break
		}
	}

}

// Serve the given directory on the given port
func SelfServe(dir, host string, port int) error {
	addr := fmt.Sprintf("%s:%v", host, port)
	fileServer := http.FileServer(http.Dir(dir))

	// HTTP Handler Function
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("\u001b[90m-- %s \u001b[92m%s\u001b[0m %s\n", r.RemoteAddr, r.Method, r.URL) // Log the request
		fileServer.ServeHTTP(w, r)                                                              // Serve the files
	})

	// Setup the server instance
	server = &http.Server{Addr: addr, Handler: handler}

	// Start the server
	log.Println("Starting the server")
	return server.ListenAndServe()
}

// Read configuration from Environment Variables
func getDefaultConfiguration() (host string, port int) {
	// Read the HOST variable
	host = os.Getenv("HOST")
	if host == "" {
		host = DEFAULT_HOST
	}
	// Read the PORT variable
	port, err := strconv.Atoi(os.Getenv("PORT"))
	if err != nil {
		port = DEFAULT_PORT
	}
	return host, port
}
