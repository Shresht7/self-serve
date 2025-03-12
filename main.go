package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// ==========
// SELF SERVE
// ==========

// Self Serve is a super simple static file server
type Self struct {
	host         string       // The host to serve on
	port         int          // The port to use
	dir          string       // The directory to serve
	server       *http.Server // The server instance
	lastModified int64        // The timestamp of when the directory was last modified
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
func (s *Self) Serve(ctx context.Context) error {
	addr := fmt.Sprintf("%s:%v", s.host, s.port)
	fileServer := http.FileServer(http.Dir(s.dir))

	// Create a mux server to handle multiple routes
	mux := http.NewServeMux()

	// HTTP Handler Function
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("\u001b[90m-- %s \u001b[92m%s\u001b[0m %s\n", r.RemoteAddr, r.Method, r.URL) // Log the request

		// Inject live-reload script into HTML responses
		if strings.HasSuffix(r.URL.Path, ".html") {
			// Read the requested file
			filePath := filepath.Join(s.dir, r.URL.Path)
			data, err := os.ReadFile(filePath)
			if err != nil {
				http.Error(w, "File not found", http.StatusNotFound)
				return
			}

			// Inject JavaScript live-reload script
			reloadScript := `<script>
                setInterval(() => fetch('/reload').then(res => res.text()).then(flag => { 
                    if (flag === "reload") { location.reload(); }
                }), 1000);
            </script>`

			modifiedHTML := strings.Replace(string(data), "</body>", reloadScript+"</body>", 1)
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte(modifiedHTML))
			return
		}

		fileServer.ServeHTTP(w, r) // Serve the files
	}))

	// Handle the reload
	mux.Handle("/reload", http.HandlerFunc(s.hotReload))

	// Setup the server instance
	s.server = &http.Server{Addr: addr, Handler: mux}

	go s.watchChanges()

	// Start the server in a go-routine
	serverErr := make(chan error, 1)
	go func() {
		log.Println("Server started on", addr)
		serverErr <- s.server.ListenAndServe()
	}()

	// Wait for either the shutdown signal or server error
	select {
	case <-ctx.Done():
		log.Println("Server shutting down...")
		return s.server.Shutdown(context.Background())
	case err := <-serverErr:
		if err != nil && err != http.ErrServerClosed {
			return fmt.Errorf("server error: %v", err)
		}
	}

	return nil
}

func (s *Self) watchChanges() {
	for {
		time.Sleep(time.Second)
		newTime := getLastModified(s.dir)
		if newTime > s.lastModified {
			s.lastModified = newTime
		}
	}
}

func (s *Self) hotReload(w http.ResponseWriter, r *http.Request) {
	if getLastModified(s.dir) > s.lastModified {
		fmt.Fprintf(w, "reload")
	} else {
		fmt.Fprintf(w, "ok")
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
	ctx, cancel := context.WithCancel(context.Background())
	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-signalChan
		cancel()
	}()

	// Serve the files
	err = Self.Serve(ctx)
	if err != nil {
		log.Fatalf("Failed to serve files: %v", err.Error())
	}

	log.Println("Server shutdown complete")
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

func getLastModified(dir string) int64 {
	var latest int64
	filepath.Walk(dir, func(_ string, info os.FileInfo, err error) error {
		if err == nil && info.ModTime().Unix() > latest {
			latest = info.ModTime().Unix()
		}
		return nil
	})
	return latest
}
