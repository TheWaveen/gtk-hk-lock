# BME GTK HK Lock System

A complete RFID-based access control system consisting of a desktop application and Arduino hardware controller.

## Project Structure

### `card-manager/` - Desktop Application
A cross-platform desktop application built with:
- **Frontend**: React.js with Vite
- **Backend**: Go with Wails framework
- **UI**: Modern, responsive interface for managing RFID cards and viewing access logs

### `r3uno/` - Arduino Hardware Controller
Arduino Uno-based RFID lock controller featuring:
- **RFID Reader**: MFRC522 module for card detection
- **Access Control**: Relay-based lock mechanism
- **Storage**: EEPROM for persistent card and log storage
- **Serial Communication**: Real-time communication with desktop app

## Features

### Desktop Application
- Manage authorized RFID cards with custom aliases
- View real-time access logs
- Monitor system memory usage
- Auto-connect to Arduino device
- Cross-platform compatibility (Windows, macOS, Linux)

### Arduino Controller
- Support for up to 30 authorized cards
- Persistent storage of card data and access logs
- 5-second cooldown between card scans
- Real-time serial communication
- Relay control for lock mechanism

## Development

### Prerequisites
- Go 1.18+
- Node.js 16+
- Arduino IDE (for hardware development)
- Wails CLI: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`

### Desktop Application Setup

1. Navigate to the card-manager directory:
   ```bash
   cd card-manager
   ```

2. Install backend dependencies:
   ```bash
   npm install
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

4. For live development:
   ```bash
   wails dev
   ```
   This runs a Vite development server with hot reload. You can also access the dev server at http://localhost:34115 for browser-based development.

5. To build for production:

   **For all platforms:**
   ```bash
   wails build
   ```

   **Platform-specific builds:**

   **macOS (Intel):**
   ```bash
   wails build -platform darwin/amd64
   ```

   **macOS (Apple Silicon):**
   ```bash
   wails build -platform darwin/universal
   ```

   **Windows 64-bit:**
   ```bash
   wails build -platform windows/amd64
   ```

   **Cross-platform builds (from any OS):**
   ```bash
   # Build for all platforms
   wails build -platform darwin/universal,windows/amd64
   
   # Or build individually
   wails build -platform darwin/amd64
   wails build -platform darwin/universal  
   wails build -platform windows/amd64
   ```

   **Build options:**
   - `-clean`: Clean build cache before building
   - `-debug`: Include debug information
   - `-skipbindings`: Skip binding generation
   - `-webview2 embed`: Embed WebView2 runtime (Windows only)

### Arduino Setup

1. Open `r3uno/r3uno.ino` in Arduino IDE
2. Install required libraries:
   - MFRC522 (RFID reader)
   - SPI (included with Arduino)
3. Connect hardware:
   - MFRC522 RFID reader to pins 9 (RST) and 10 (SS)
   - Relay module to pin 6
4. Upload to Arduino Uno

## Communication Protocol

The desktop application communicates with the Arduino via serial commands:

- `GET_LOGS` - Retrieve access logs
- `GET_CARDS` - Get authorized card list
- `CLEAR_LOGS` - Clear all logs
- `REMOVE_CARD:XX:XX:XX:XX` - Remove specific card
- `ADD_CARD:XX:XX:XX:XX:ALIAS` - Add new card with alias

## Auto-Connection

The desktop application automatically attempts to connect to Arduino devices containing "usbmodem212101" in the port name.

## Memory Management

The Arduino uses EEPROM for persistent storage:
- Card UIDs: 30 cards × 4 bytes each
- Card aliases: 30 cards × 16 bytes each  
- Access logs: 50 entries with timestamps and results
- Log UIDs: 30 unique UIDs for log entries

## Troubleshooting

### Connection Issues
- Ensure Arduino is connected via USB
- Check that the correct port is selected
- Verify Arduino code is uploaded successfully

### Card Detection Issues
- Check RFID reader connections
- Ensure cards are within reading range
- Verify card compatibility with MFRC522

### Build Issues
- Ensure all dependencies are installed
- Check Go and Node.js versions
- Verify Wails CLI is installed correctly 