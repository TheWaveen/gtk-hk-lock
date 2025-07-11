package main

import (
	"context"
	"fmt"
	"io/ioutil"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/tarm/serial"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx         context.Context
	port        *serial.Port
	connected   bool
	cardAliases map[string]string // Map UID to alias
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		cardAliases: make(map[string]string),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Try to auto-connect to the Arduino device
	go a.autoConnect()
}

// autoConnect attempts to automatically connect to the Arduino device
func (a *App) autoConnect() {
	// Wait a bit for the system to be ready
	time.Sleep(2 * time.Second)

	ports, err := a.ListPorts()
	if err != nil {
		fmt.Printf("Error listing ports: %v\n", err)
		return
	}

	// Look for a port containing "usbmodem212101"
	var targetPort string
	for _, port := range ports {
		if strings.Contains(strings.ToLower(port), "usbmodem212101") {
			targetPort = port
			break
		}
	}

	if targetPort != "" {
		fmt.Printf("Auto-connecting to %s\n", targetPort)
		err := a.Connect(targetPort)
		if err != nil {
			fmt.Printf("Auto-connect failed: %v\n", err)
		} else {
			fmt.Printf("Successfully auto-connected to %s\n", targetPort)
			// Start listening for real-time logs
			// go a.listenForRealTimeLogs() // This line is now handled by Connect
		}
	} else {
		fmt.Println("No device with 'usbmodem212101' found for auto-connect")
	}
}

// listenForRealTimeLogs continuously listens for new log entries from Arduino
func (a *App) listenForRealTimeLogs() {
	if a.port == nil {
		return
	}

	fmt.Println("Starting real-time log listener...")

	// Auto-fetch initial data after starting the listener
	go func() {
		// Wait a bit for the listener to be ready
		time.Sleep(500 * time.Millisecond)

		// Fetch memory usage first
		fmt.Println("Auto-fetching memory usage...")
		a.SendCommand("GET_MEMORY")

		// Wait a bit between commands
		time.Sleep(500 * time.Millisecond)

		// Fetch cards
		fmt.Println("Auto-fetching cards...")
		a.SendCommand("GET_CARDS")

		// Wait a bit between commands
		time.Sleep(500 * time.Millisecond)

		// Fetch logs
		fmt.Println("Auto-fetching logs...")
		a.SendCommand("GET_LOGS")
	}()

	// Create a separate goroutine for reading
	go func() {
		buf := make([]byte, 256)
		var responseBuffer strings.Builder

		for {
			// Quick read without blocking
			n, err := a.port.Read(buf)

			if err != nil {
				// No data available, continue
				time.Sleep(100 * time.Millisecond)
				continue
			}

			if n > 0 {
				data := string(buf[:n])
				responseBuffer.WriteString(data)

				// Process complete lines
				lines := strings.Split(responseBuffer.String(), "\n")

				// Keep the last incomplete line in the buffer
				if len(lines) > 1 {
					responseBuffer.Reset()
					responseBuffer.WriteString(lines[len(lines)-1])

					// Process all complete lines except the last one
					for i := 0; i < len(lines)-1; i++ {
						line := strings.TrimSpace(lines[i])
						if line == "" {
							continue
						}

						fmt.Printf("Processing line: %s\n", line)

						// Handle different types of messages
						if strings.HasPrefix(line, "NEW_LOG:") {
							fmt.Printf("Processing NEW_LOG: %s\n", line)
							a.handleNewLogEntry(line)
						} else if strings.HasPrefix(line, "LOGS:") {
							// This is the start of a logs response
							fmt.Printf("Received logs response start\n")
						} else if strings.Contains(line, "GRANTED") || strings.Contains(line, "DENIED") {
							// This is a log entry
							fmt.Printf("Received log entry: %s\n", line)
							// Emit event for log entry
							a.handleLogEntry(line)
						} else if strings.HasPrefix(line, "LOGS_CLEARED") {
							fmt.Printf("Logs cleared\n")
							// Emit event for logs cleared
							wailsRuntime.EventsEmit(a.ctx, "logsCleared", map[string]interface{}{})
							// Refresh memory usage after logs cleared
							time.Sleep(100 * time.Millisecond)
							a.SendCommand("GET_MEMORY")
						} else if strings.HasPrefix(line, "CARDS:") {
							// This is the start of a cards response
							fmt.Printf("Received cards response start\n")
						} else if strings.HasPrefix(line, "CARD_REMOVED") {
							fmt.Printf("Card removed successfully\n")
							// Emit event for card removed
							wailsRuntime.EventsEmit(a.ctx, "cardRemoved", map[string]interface{}{
								"success": true,
							})
							// Refresh memory usage after card removal
							time.Sleep(100 * time.Millisecond)
							a.SendCommand("GET_MEMORY")
						} else if strings.HasPrefix(line, "CARD_REMOVED_WITH_UID:") {
							// Extract UID from removal confirmation
							uid := strings.TrimPrefix(line, "CARD_REMOVED_WITH_UID:")
							fmt.Printf("Card removed with UID: %s\n", uid)
							// Clear alias from memory
							delete(a.cardAliases, uid)
							// Emit event for card removed with UID
							wailsRuntime.EventsEmit(a.ctx, "cardRemoved", map[string]interface{}{
								"success": true,
								"uid":     uid,
							})
							// Refresh memory usage after card removal
							time.Sleep(100 * time.Millisecond)
							a.SendCommand("GET_MEMORY")
						} else if strings.HasPrefix(line, "CARD_NOT_FOUND") {
							fmt.Printf("Card not found\n")
							// Emit event for card not found
							wailsRuntime.EventsEmit(a.ctx, "cardRemoved", map[string]interface{}{
								"success": false,
								"error":   "Card not found",
							})
						} else if strings.HasPrefix(line, "INVALID_UID") {
							fmt.Printf("Invalid UID format\n")
							// Emit event for invalid UID
							wailsRuntime.EventsEmit(a.ctx, "cardRemoved", map[string]interface{}{
								"success": false,
								"error":   "Invalid UID format",
							})
						} else if strings.HasPrefix(line, "CARD_ADDED") {
							fmt.Printf("Card added successfully\n")
							// Emit event for card added
							wailsRuntime.EventsEmit(a.ctx, "cardAdded", map[string]interface{}{
								"success": true,
							})
							// Refresh memory usage after card addition
							time.Sleep(100 * time.Millisecond)
							a.SendCommand("GET_MEMORY")
						} else if strings.HasPrefix(line, "MEMORY_USAGE:") {
							// Parse memory usage (format: MEMORY_USAGE:used,total)
							memoryData := strings.TrimPrefix(line, "MEMORY_USAGE:")
							parts := strings.Split(memoryData, ",")
							if len(parts) >= 2 {
								used, _ := strconv.Atoi(parts[0])
								total, _ := strconv.Atoi(parts[1])
								fmt.Printf("Memory usage: %d/%d bytes\n", used, total)
								// Emit event for memory usage
								wailsRuntime.EventsEmit(a.ctx, "memoryUsage", map[string]interface{}{
									"used":  used,
									"total": total,
								})
							}
						} else if strings.HasPrefix(line, "ALIAS_SAVED") {
							fmt.Printf("Alias saved successfully\n")
							// Emit event for alias saved
							wailsRuntime.EventsEmit(a.ctx, "aliasSaved", map[string]interface{}{
								"success": true,
							})
							// Refresh memory usage after alias save
							time.Sleep(100 * time.Millisecond)
							a.SendCommand("GET_MEMORY")
						} else if strings.HasPrefix(line, "CARD_LIST_FULL") {
							fmt.Printf("Card list is full\n")
							// Emit event for card list full
							wailsRuntime.EventsEmit(a.ctx, "cardAdded", map[string]interface{}{
								"success": false,
								"error":   "Card list is full",
							})
						} else if strings.Contains(line, ",") && strings.Contains(line, ":") {
							// This is a card with alias (format: XX:XX:XX:XX,alias)
							// But first check if it's not a command echo
							if !strings.HasPrefix(line, "Received command:") &&
								!strings.HasPrefix(line, "REMOVE_CARD:") &&
								!strings.HasPrefix(line, "GET_CARDS") &&
								!strings.HasPrefix(line, "GET_LOGS") &&
								!strings.HasPrefix(line, "CLEAR_LOGS") &&
								!strings.HasPrefix(line, "DEBUG_MEMORY:") {
								parts := strings.Split(line, ",")
								if len(parts) >= 2 {
									uid := parts[0]
									alias := parts[1]
									fmt.Printf("Received card: %s with alias: %s\n", uid, alias)
									// Store alias in memory for log cross-referencing
									a.cardAliases[uid] = alias
									// Emit event for card
									wailsRuntime.EventsEmit(a.ctx, "cardEntry", map[string]interface{}{
										"uid":   uid,
										"alias": alias,
									})
								}
							}
						} else if strings.HasPrefix(line, "PONG") {
							fmt.Printf("Received PONG\n")
						} else if strings.HasPrefix(line, "RESETTING_EEPROM") {
							fmt.Printf("EEPROM reset in progress...\n")
						} else if strings.HasPrefix(line, "EEPROM_RESET_COMPLETE") {
							fmt.Printf("EEPROM reset completed\n")
							// Clear all aliases from memory
							a.cardAliases = make(map[string]string)
							// Emit event for EEPROM reset
							wailsRuntime.EventsEmit(a.ctx, "eepromReset", map[string]interface{}{
								"success": true,
							})
							// Refresh memory usage after reset
							time.Sleep(100 * time.Millisecond)
							a.SendCommand("GET_MEMORY")
						} else if strings.HasPrefix(line, "ECHO_RESPONSE") {
							fmt.Printf("Received ECHO_RESPONSE\n")
						}
					}
				}
			}

			// Small delay to prevent busy waiting
			time.Sleep(50 * time.Millisecond)
		}
	}()
}

// handleNewLogEntry processes a new log entry from Arduino
func (a *App) handleNewLogEntry(line string) {
	// Remove "NEW_LOG:" prefix
	logData := strings.TrimPrefix(line, "NEW_LOG:")
	parts := strings.Split(logData, ",")

	if len(parts) >= 3 {
		timestamp := parts[0]
		uid := parts[1]
		result := parts[2]

		// Check if we have an alias for this UID
		displayName := uid
		if alias, exists := a.cardAliases[uid]; exists && alias != "" {
			displayName = alias
		}

		fmt.Printf("New log entry: %s, %s (%s), %s\n", timestamp, displayName, uid, result)

		// Emit event to frontend with new log data
		wailsRuntime.EventsEmit(a.ctx, "newLogEntry", map[string]interface{}{
			"timestamp":   timestamp,
			"uid":         uid,
			"displayName": displayName,
			"result":      result,
		})

		fmt.Printf("Emitted newLogEntry event for %s\n", displayName)

		// Refresh memory usage after new log entry
		time.Sleep(100 * time.Millisecond)
		a.SendCommand("GET_MEMORY")
	} else {

		fmt.Printf("Emitted newLogEntry event\n")
	}
}

// handleLogEntry processes a log entry from Arduino
func (a *App) handleLogEntry(line string) {
	parts := strings.Split(line, ",")
	if len(parts) >= 3 {
		timestamp := parts[0]
		uid := parts[1]
		result := parts[2]

		// Check if we have an alias for this UID
		displayName := uid
		if alias, exists := a.cardAliases[uid]; exists && alias != "" {
			displayName = alias
		}

		fmt.Printf("Log entry: %s, %s (%s), %s\n", timestamp, displayName, uid, result)

		// Emit event to frontend with log data
		wailsRuntime.EventsEmit(a.ctx, "logEntry", map[string]interface{}{
			"timestamp":   timestamp,
			"uid":         uid,
			"displayName": displayName,
			"result":      result,
		})
	}
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// ListPorts lists available serial ports (macOS/Linux: /dev/tty.*, Windows: COM*)
func (a *App) ListPorts() ([]string, error) {
	var ports []string

	if runtime.GOOS == "windows" {
		// Windows: Look for COM ports
		for i := 1; i <= 20; i++ {
			portName := fmt.Sprintf("COM%d", i)
			// Try to open the port to see if it exists
			c := &serial.Config{Name: portName, Baud: 115200}
			if port, err := serial.OpenPort(c); err == nil {
				port.Close()
				ports = append(ports, portName)
			}
		}
	} else {
		// macOS/Linux: Look for tty devices
		files, err := ioutil.ReadDir("/dev")
		if err != nil {
			return nil, err
		}

		for _, f := range files {
			name := f.Name()
			// Include various tty devices that might be Arduino
			if strings.HasPrefix(name, "tty.") ||
				strings.HasPrefix(name, "cu.") ||
				strings.Contains(strings.ToLower(name), "usbmodem") ||
				strings.Contains(strings.ToLower(name), "arduino") {
				ports = append(ports, "/dev/"+name)
			}
		}
	}

	return ports, nil
}

// Connect to a serial port
func (a *App) Connect(portName string) error {
	c := &serial.Config{
		Name:        portName,
		Baud:        115200,
		ReadTimeout: time.Second * 2,
		Size:        8,
		Parity:      0,
		StopBits:    1,
	}
	port, err := serial.OpenPort(c)
	if err != nil {
		return err
	}
	a.port = port
	a.connected = true

	// Wait for Arduino to start up and clear any startup messages
	time.Sleep(2 * time.Second)

	// Clear any pending data
	cleared, _ := a.port.Read(make([]byte, 1024))
	if cleared > 0 {
		fmt.Printf("Cleared %d bytes of startup data\n", cleared)
	}

	// Start listening for real-time logs after connection
	go a.listenForRealTimeLogs() // Re-enabled since communication is working

	return nil
}

// SendCommand sends a command to Arduino and returns the response
func (a *App) SendCommand(cmd string) (string, error) {
	if a.port == nil {
		return "", fmt.Errorf("Not connected")
	}

	fmt.Printf("Sending command: %s\n", cmd)

	// Send the command
	written, err := a.port.Write([]byte(cmd + "\n"))
	if err != nil {
		return "", err
	}
	fmt.Printf("Wrote %d bytes: %q\n", written, cmd+"\n")

	// Don't try to read response immediately - let the real-time listener handle it
	// The Arduino will send the response when it's ready
	return "Command sent", nil
}

// SendCommandOnly sends a command without trying to read response
func (a *App) SendCommandOnly(cmd string) (string, error) {
	if a.port == nil {
		return "", fmt.Errorf("Not connected")
	}

	fmt.Printf("Sending command only: %s\n", cmd)

	// Send the command
	written, err := a.port.Write([]byte(cmd + "\n"))
	if err != nil {
		return "", err
	}
	fmt.Printf("Wrote %d bytes: %q\n", written, cmd+"\n")

	return fmt.Sprintf("Command sent successfully (%d bytes)", written), nil
}

// Disconnect closes the serial port connection
func (a *App) Disconnect() error {
	if a.port != nil {
		err := a.port.Close()
		a.port = nil
		a.connected = false
		return err
	}
	return nil
}

// ListenForNewCard listens for NEW_CARD messages from Arduino
func (a *App) ListenForNewCard() (string, error) {
	// Dummy implementation
	return "", fmt.Errorf("no_data")
}

// GetLastScannedCard gets the last scanned card without waiting
func (a *App) GetLastScannedCard() (string, error) {
	// Dummy implementation
	return "", fmt.Errorf("No last card")
}

// TestLogEvent is a test function to manually emit a log event
func (a *App) TestLogEvent() {
	fmt.Println("Testing log event emission...")
	wailsRuntime.EventsEmit(a.ctx, "newLogEntry", map[string]interface{}{
		"timestamp": "1234",
		"uid":       "AA:BB:CC:DD",
		"result":    "GRANTED",
	})
	fmt.Println("Test log event emitted")
}

// TestConnection tests if the Arduino is responding
func (a *App) TestConnection() (bool, error) {
	if a.port == nil {
		return false, fmt.Errorf("Not connected")
	}

	// Send a simple command and see if we get any response
	_, err := a.port.Write([]byte("GET_LOGS\n"))
	if err != nil {
		return false, err
	}

	// Wait a bit for response
	time.Sleep(200 * time.Millisecond)

	// Try to read any response
	buf := make([]byte, 128)
	n, err := a.port.Read(buf)

	// Consider connected if we can read any data
	return n > 0, nil
}

// IsConnected returns true if the Arduino is connected
func (a *App) IsConnected() bool {
	return a.port != nil && a.connected
}

// GetConnectionStatus returns the current connection status
func (a *App) GetConnectionStatus() string {
	if a.port == nil {
		return "searching"
	}
	return "connected"
}

// PingArduino sends a simple ping to test communication
func (a *App) PingArduino() (string, error) {
	if a.port == nil {
		return "", fmt.Errorf("Not connected")
	}

	fmt.Println("Pinging Arduino...")

	// Clear any pending data first
	cleared, _ := a.port.Read(make([]byte, 256))
	if cleared > 0 {
		fmt.Printf("Cleared %d bytes of pending data\n", cleared)
	}

	// Send a simple ping
	written, err := a.port.Write([]byte("PING\n"))
	if err != nil {
		return "", err
	}
	fmt.Printf("Wrote %d bytes: PING\n", written)

	// Wait a bit
	time.Sleep(200 * time.Millisecond)

	// Try to read any response
	buf := make([]byte, 128)
	n, err := a.port.Read(buf)
	if err != nil {
		return "", err
	}

	if n > 0 {
		response := string(buf[:n])
		fmt.Printf("Ping response: %q\n", response)
		return response, nil
	}

	return "No response", nil
}

// EchoTest sends a simple echo command to test basic communication
func (a *App) EchoTest() (string, error) {
	if a.port == nil {
		return "", fmt.Errorf("Not connected")
	}

	fmt.Println("Testing echo communication...")

	// Clear any pending data first
	cleared, _ := a.port.Read(make([]byte, 256))
	if cleared > 0 {
		fmt.Printf("Cleared %d bytes of pending data\n", cleared)
	}

	// Send a simple echo command
	written, err := a.port.Write([]byte("ECHO\n"))
	if err != nil {
		return "", err
	}
	fmt.Printf("Wrote %d bytes: ECHO\n", written)

	// Wait a bit
	time.Sleep(500 * time.Millisecond)

	// Try to read any response
	buf := make([]byte, 128)
	n, err := a.port.Read(buf)
	if err != nil {
		return "", err
	}

	if n > 0 {
		response := string(buf[:n])
		fmt.Printf("Echo response: %q\n", response)
		return response, nil
	}

	return "No response", nil
}

// ReadArduinoOutput reads any available output from Arduino
func (a *App) ReadArduinoOutput() (string, error) {
	if a.port == nil {
		return "", fmt.Errorf("Not connected")
	}

	fmt.Println("Reading Arduino output...")

	// Try to read any available data
	buf := make([]byte, 1024)
	n, err := a.port.Read(buf)
	if err != nil {
		return "", err
	}

	if n > 0 {
		response := string(buf[:n])
		fmt.Printf("Read %d bytes from Arduino: %q\n", n, response)
		return response, nil
	}

	return "No output", nil
}
