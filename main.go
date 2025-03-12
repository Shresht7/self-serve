package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
)

// ==========
// SELF SERVE
// ==========

// Self Serve is a super simple static file server
type Self struct {
	host   string       // The host to serve on
	port   int          // The port to use
	dir    string       // The directory to serve
	server *http.Server // The server instance
}

// Create a new instance of Self
func NewSelf(host, dir string, port int) *Self {
	return &Self{
		host: host,
		port: port,
		dir:  dir,
	}
}

// Serve the given directory
func (s *Self) Serve() error {
	addr := fmt.Sprintf("%s:%v", s.host, s.port)
	fileServer := http.FileServer(http.Dir(s.dir))

	// HTTP Handler Function
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("\u001b[90m-- %s \u001b[92m%s\u001b[0m %s\n", r.RemoteAddr, r.Method, r.URL) // Log the request
		fileServer.ServeHTTP(w, r)                                                              // Serve the files
	})

	// Setup the server instance
	s.server = &http.Server{Addr: addr, Handler: handler}

	// Start the server
	fmt.Println() // empty line before server start
	log.Println("Server started on", addr)
	return s.server.ListenAndServe()
}

// Handle graceful exit
func (s *Self) handleGracefulExit() {
	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, os.Interrupt)
	<-signalChan
	log.Println("Closing the server...")
	if err := s.server.Shutdown(context.Background()); err != nil {
		log.Fatalf("Could not gracefully shutdown the server: %v\n", err)
	}
}

// ----
// MAIN
// ----

const (
	// The default host to use
	DEFAULT_HOST = "localhost"
	// The default port to use
	DEFAULT_PORT = 5327
)

// The version number of the application
const VERSION = "0.2.0"

// A super simple static file server
func main() {
	// Get current working directory
	cwd, err := os.Getwd()
	if err != nil {
		log.Fatalf("Failed to get the working directory: %v", err.Error())
	}

	// Get the default host and port configuration from environment variables
	defaultHost, defaultPort := getDefaultConfiguration()

	// Parse the command line arguments
	dir := flag.String("dir", cwd, "The directory to serve")
	port := flag.Int("port", defaultPort, "The port number to use")
	host := flag.String("host", defaultHost, "The host to use")
	version := flag.Bool("version", false, "Print the version number")
	flag.Parse()

	// if --version is set, print the version number and exit
	if *version {
		fmt.Println(VERSION)
		return
	}

	// Instantiate the Self Serve
	Self := NewSelf(*host, *dir, *port)

	// Print out the address to the console
	fmt.Printf("File Server running on \u001b[4;36mhttp://%s:%v\u001b[0m\n", Self.host, Self.port)

	// Handle graceful exit
	go Self.handleGracefulExit()

	// Serve the files
	err = Self.Serve()
	if err != nil {
		log.Fatalf("Failed to serve files: %v", err.Error())
	}
}

// ----------------
// HELPER FUNCTIONS
// ----------------

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
