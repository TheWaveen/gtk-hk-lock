#include <SPI.h>
#include <MFRC522.h>
#include <EEPROM.h>

#define RST_PIN         9
#define SS_PIN          10
#define RELAY_PIN       6

#define MAX_UIDS        30
#define UID_SIZE        4
#define ALIAS_SIZE      16
#define EEPROM_COUNT_ADDR 0
#define EEPROM_UIDS_ADDR  1
#define EEPROM_ALIASES_ADDR (EEPROM_UIDS_ADDR + MAX_UIDS * UID_SIZE)
#define MAX_LOGS 50
#define LOG_UID_SIZE 4
#define LOG_ENTRY_SIZE (4 + 1 + 1) // 4 bytes timestamp, 1 byte UID index, 1 byte result
#define MAX_LOG_UIDS 30 // Maximum unique UIDs to store
#define EEPROM_LOGS_START (EEPROM_ALIASES_ADDR + MAX_UIDS * ALIAS_SIZE)
#define EEPROM_LOGS_COUNT_ADDR (EEPROM_LOGS_START)
#define EEPROM_LOGS_HEAD_ADDR (EEPROM_LOGS_START + 1)
#define EEPROM_LOG_UIDS_COUNT_ADDR (EEPROM_LOGS_START + 2)
#define EEPROM_LOG_UIDS_DATA_ADDR (EEPROM_LOGS_START + 3)
#define EEPROM_LOGS_DATA_ADDR (EEPROM_LOG_UIDS_DATA_ADDR + MAX_LOG_UIDS * LOG_UID_SIZE)

MFRC522 mfrc522(SS_PIN, RST_PIN);

byte allowedUIDs[MAX_UIDS][UID_SIZE];
char aliases[MAX_UIDS][ALIAS_SIZE];
byte numAllowedUIDs = 0;

byte lastScannedUID[UID_SIZE];
byte lastScannedUIDLength = 0;
unsigned long lastCardScanTime = 0; // Track when last card was scanned
const unsigned long CARD_SCAN_COOLDOWN = 5000; // 5 seconds cooldown

struct LogEntry {
  uint32_t timestamp; // millis
  byte uidIndex; // Index into logUIDs array
  byte result; // 1 = granted, 0 = denied
};

LogEntry logs[MAX_LOGS];
byte logCount = 0;
byte logHead = 0;

// Centralized UID storage for logs
byte logUIDs[MAX_LOG_UIDS][LOG_UID_SIZE];
byte logUIDCount = 0;

String inputString = "";
bool stringComplete = false;

void setup() {
  Serial.begin(115200);
  delay(1000); // Wait for serial to stabilize
  Serial.println(F("Arduino RFID Lock System Ready"));
  SPI.begin();
  mfrc522.PCD_Init();
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);
  
  // Initialize aliases array with empty strings
  for (byte i = 0; i < MAX_UIDS; i++) {
    aliases[i][0] = '\0';
  }
  
  Serial.println(F("=== Loading data from EEPROM ==="));
  
  // Debug EEPROM layout
  Serial.print(F("EEPROM Layout: UIDs="));
  Serial.print(EEPROM_UIDS_ADDR);
  Serial.print(F("-"));
  Serial.print(EEPROM_UIDS_ADDR + MAX_UIDS * UID_SIZE - 1);
  Serial.print(F(", Aliases="));
  Serial.print(EEPROM_ALIASES_ADDR);
  Serial.print(F("-"));
  Serial.print(EEPROM_ALIASES_ADDR + MAX_UIDS * ALIAS_SIZE - 1);
  Serial.print(F(", Logs="));
  Serial.print(EEPROM_LOGS_START);
  Serial.print(F("-"));
  Serial.print(EEPROM_LOGS_DATA_ADDR + MAX_LOGS * LOG_ENTRY_SIZE - 1);
  Serial.println();
  
  loadUIDsFromEEPROM();
  Serial.print(F("Loaded "));
  Serial.print(numAllowedUIDs);
  Serial.println(F(" UIDs"));
  
  loadAliasesFromEEPROM();
  Serial.println(F("Loaded aliases"));
  
  // Validate and fix corrupted aliases
  for (byte i = 0; i < MAX_UIDS; i++) {
    bool corrupted = false;
    for (byte j = 0; j < ALIAS_SIZE; j++) {
      char c = aliases[i][j];
      if (c != '\0' && (c < 32 || c > 126)) {
        corrupted = true;
        break;
      }
    }
    if (corrupted) {
      aliases[i][0] = '\0'; // Clear corrupted alias
    }
  }
  
  loadLogUIDsFromEEPROM();
  loadLogsFromEEPROM();
  
  Serial.println(F("=== EEPROM loading complete ==="));
  
  // Only clear EEPROM if we detect completely corrupted data
  // Don't auto-clear just because logs are empty
}

void loop() {
  // Check for serial commands
  if (stringComplete) {
    inputString.trim();
    processCommand(inputString);
    inputString = "";
    stringComplete = false;
  }

  // Check for new cards
  if (mfrc522.PICC_IsNewCardPresent()) {
    if (mfrc522.PICC_ReadCardSerial()) {
      // Check if enough time has passed since last scan
      unsigned long currentTime = millis();
      if (currentTime - lastCardScanTime < CARD_SCAN_COOLDOWN) {
        // Still in cooldown period, ignore this scan
        mfrc522.PICC_HaltA();
        mfrc522.PCD_StopCrypto1();
        return;
      }
      
      // Save last scanned UID
      lastScannedUIDLength = mfrc522.uid.size;
      for (byte i = 0; i < mfrc522.uid.size; i++) {
        lastScannedUID[i] = mfrc522.uid.uidByte[i];
      }

      byte granted = isAllowedUID(mfrc522.uid.uidByte, mfrc522.uid.size) ? 1 : 0;
      addLog(mfrc522.uid.uidByte, granted);
      if (granted) {
        accessGranted();
      }
      
      // Update last scan time
      lastCardScanTime = currentTime;

      mfrc522.PICC_HaltA();
      mfrc522.PCD_StopCrypto1();
    }
  }
  
  // Minimal delay for optimal responsiveness
  delay(1);
}

void serialEvent() {
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    if (inChar == '\n') {
      stringComplete = true;
    } else if (inChar == '\r') {
      // Ignore carriage return
    } else {
      inputString += inChar;
    }
  }
}

void processCommand(String command) {
  command.trim(); // Remove any whitespace
  
  // Ignore command echoes
  if (command.startsWith("Received command:")) {
    return;
  }
  
  if (command.startsWith("GET_LOGS")) {
    sendLogs();
  } else if (command.startsWith("CLEAR_LOGS")) {
    clearLogs();
    Serial.println(F("LOGS_CLEARED"));
    Serial.flush(); // Ensure the response is sent immediately
  } else if (command.startsWith("GET_CARDS")) {
    sendCards();
  } else if (command.startsWith("REMOVE_CARD:")) {
    // Extract UID from command (format: REMOVE_CARD:XX:XX:XX:XX)
    String uidStr = command.substring(12); // Remove "REMOVE_CARD:" prefix
    byte uid[UID_SIZE];
    if (parseUID(uidStr, uid)) {
      if (removeUID(uid)) {
        // Send removal confirmation with UID for alias clearing
        Serial.print(F("CARD_REMOVED_WITH_UID:"));
        printUID(uid, UID_SIZE);
        Serial.println();
      } else {
        Serial.println(F("CARD_NOT_FOUND"));
      }
    } else {
      Serial.println(F("INVALID_UID"));
    }
    Serial.flush(); // Ensure the response is sent immediately
  } else if (command.startsWith("ADD_CARD:")) {
    // Extract UID from command (format: ADD_CARD:XX:XX:XX:XX)
    String uidStr = command.substring(9); // Remove "ADD_CARD:" prefix
    byte uid[UID_SIZE];
    if (parseUID(uidStr, uid)) {
      if (numAllowedUIDs < MAX_UIDS) {
        addUID(uid);
        Serial.println(F("CARD_ADDED"));
      } else {
        Serial.println(F("CARD_LIST_FULL"));
      }
    } else {
      Serial.println(F("INVALID_UID"));
    }
    Serial.flush(); // Ensure the response is sent immediately
  } else if (command.startsWith("PING")) {
    Serial.println(F("PONG"));
    Serial.flush(); // Ensure the response is sent immediately
  } else if (command.startsWith("SAVE_ALIAS:")) {
    // Extract UID and alias from command (format: SAVE_ALIAS:XX:XX:XX:XX:alias_text)
    // Find the 4th colon (after SAVE_ALIAS: and the 3 colons in the UID)
    int colonCount = 0;
    int uidEnd = -1;
    for (int i = 11; i < command.length(); i++) {
      if (command.charAt(i) == ':') {
        colonCount++;
        if (colonCount == 4) {
          uidEnd = i;
          break;
        }
      }
    }
    
    if (uidEnd != -1) {
      String uidStr = command.substring(11, uidEnd);
      String aliasStr = command.substring(uidEnd + 1);
      Serial.print(F("Parsing UID: "));
      Serial.println(uidStr);
      byte uid[UID_SIZE];
      if (parseUID(uidStr, uid)) {
        int cardIndex = findCardIndex(uid);
        if (cardIndex != -1) {
          // Validate and save alias
          aliasStr.trim(); // Remove leading/trailing whitespace
          if (aliasStr.length() > 0 && aliasStr.length() < ALIAS_SIZE) {
            // Validate characters (only printable ASCII)
            bool valid = true;
            for (int i = 0; i < aliasStr.length(); i++) {
              char c = aliasStr.charAt(i);
              if (c < 32 || c > 126) {
                valid = false;
                break;
              }
            }
            
            if (valid) {
              aliasStr.toCharArray(aliases[cardIndex], ALIAS_SIZE);
              saveAliasesToEEPROM();
              Serial.println("ALIAS_SAVED");
            } else {
              Serial.println("INVALID_CHARS");
            }
          } else {
            Serial.println("INVALID_LENGTH");
          }
        } else {
          Serial.println(F("CARD_NOT_FOUND"));
        }
      } else {
        Serial.println(F("INVALID_UID"));
      }
    } else {
      Serial.println(F("INVALID_FORMAT"));
    }
    Serial.flush(); // Ensure the response is sent immediately
  } else if (command.startsWith("GET_MEMORY")) {
    // Report EEPROM usage instead of RAM
    int totalEEPROM = 1024; // Arduino Uno has 1KB EEPROM
    
    // Calculate actual EEPROM usage based on the defined layout
    int eepromUsed = 0;
    
    // UIDs: 1 byte count + actual UIDs stored
    eepromUsed += 1 + (numAllowedUIDs * UID_SIZE);
    
    // Aliases: count actual bytes used for each card with an alias
    int aliasBytesUsed = 0;
    for (byte i = 0; i < numAllowedUIDs; i++) {
      bool hasAlias = false;
      int aliasLength = 0;
      for (byte j = 0; j < ALIAS_SIZE; j++) {
        if (aliases[i][j] != '\0') {
          hasAlias = true;
          aliasLength = j + 1; // Count up to the null terminator
        }
      }
      if (hasAlias) {
        aliasBytesUsed += ALIAS_SIZE; // Each alias takes full ALIAS_SIZE in EEPROM
      }
    }
    eepromUsed += aliasBytesUsed;
    
    // Log UIDs: 1 byte count + actual UIDs stored
    eepromUsed += 1 + (logUIDCount * LOG_UID_SIZE);
    
    // Logs: 2 bytes count/head + actual logs stored
    eepromUsed += 2 + (logCount * LOG_ENTRY_SIZE);
    
    Serial.print(F("DEBUG_MEMORY: UIDs="));
    Serial.print(1 + (numAllowedUIDs * UID_SIZE));
    Serial.print(F(", Aliases="));
    Serial.print(aliasBytesUsed);
    Serial.print(F(", LogUIDs="));
    Serial.print(1 + (logUIDCount * LOG_UID_SIZE));
    Serial.print(F(", Logs="));
    Serial.print(2 + (logCount * LOG_ENTRY_SIZE));
    Serial.print(F(", Total="));
    Serial.println(eepromUsed);
    
    Serial.print(F("MEMORY_USAGE:"));
    Serial.print(eepromUsed);
    Serial.print(F(","));
    Serial.println(totalEEPROM);
    Serial.flush(); // Ensure the response is sent immediately
  } else if (command.startsWith("RESET_EEPROM")) {
    // Reset all EEPROM data
    Serial.println(F("RESETTING_EEPROM"));
    
    // Clear all UIDs
    numAllowedUIDs = 0;
    saveUIDsToEEPROM();
    
    // Clear all aliases
    for (byte i = 0; i < MAX_UIDS; i++) {
      for (byte j = 0; j < ALIAS_SIZE; j++) {
        aliases[i][j] = '\0';
      }
    }
    saveAliasesToEEPROM();
    
    // Clear all logs
    logCount = 0;
    logHead = 0;
    saveLogsToEEPROM();
    
    // Clear centralized log UIDs
    logUIDCount = 0;
    saveLogUIDsToEEPROM();
    
    Serial.println(F("EEPROM_RESET_COMPLETE"));
    Serial.flush(); // Ensure the response is sent immediately
  } else if (command.startsWith("ECHO")) {
    Serial.println(F("ECHO_RESPONSE"));
    Serial.flush(); // Ensure the response is sent immediately
  } else {
    Serial.print(F("Unknown command: "));
    Serial.println(command);
  }
}

void sendLogs() {
  Serial.println(F("LOGS:"));
  for (byte i = 0; i < logCount; i++) {
    // Calculate the actual index in the circular buffer
    byte idx = (logHead - logCount + i + MAX_LOGS) % MAX_LOGS;
    
    // Get the actual UID from the index
    byte uid[LOG_UID_SIZE];
    getLogUID(logs[idx].uidIndex, uid);
    
    // Print timestamp
    Serial.print(logs[idx].timestamp);
    Serial.print(",");
    
    // Print UID
    printUID(uid, LOG_UID_SIZE);
    Serial.print(",");
    
    // Print result
    if (logs[idx].result == 1) {
      Serial.println(F("GRANTED"));
    } else {
      Serial.println(F("DENIED"));
    }
  }
}

void loadUIDsFromEEPROM() {
  numAllowedUIDs = EEPROM.read(EEPROM_COUNT_ADDR);

  
  if (numAllowedUIDs > MAX_UIDS || numAllowedUIDs < 0) {
    numAllowedUIDs = 0;
    saveUIDsToEEPROM();
  } else {
    for (byte i = 0; i < numAllowedUIDs; i++) {
      for (byte j = 0; j < UID_SIZE; j++) {
        allowedUIDs[i][j] = EEPROM.read(EEPROM_UIDS_ADDR + i * UID_SIZE + j);
      }
    }
  }
}

void saveUIDsToEEPROM() {
  EEPROM.write(EEPROM_COUNT_ADDR, numAllowedUIDs);
  for (byte i = 0; i < numAllowedUIDs; i++) {
    for (byte j = 0; j < UID_SIZE; j++) {
      EEPROM.write(EEPROM_UIDS_ADDR + i * UID_SIZE + j, allowedUIDs[i][j]);
    }
  }
}

void addUID(byte *uid) {
  for (byte j = 0; j < UID_SIZE; j++) {
    allowedUIDs[numAllowedUIDs][j] = uid[j];
  }
  numAllowedUIDs++;
  saveUIDsToEEPROM();
}

bool removeUID(byte *uid) {
  for (byte i = 0; i < numAllowedUIDs; i++) {
    bool match = true;
    for (byte j = 0; j < UID_SIZE; j++) {
      if (allowedUIDs[i][j] != uid[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      // Clear the alias for this card
      for (byte j = 0; j < ALIAS_SIZE; j++) {
        aliases[i][j] = '\0';
      }
      
      // Shift remaining UIDs and their aliases
      for (byte k = i; k < numAllowedUIDs - 1; k++) {
        for (byte j = 0; j < UID_SIZE; j++) {
          allowedUIDs[k][j] = allowedUIDs[k + 1][j];
        }
        // Also shift the alias
        for (byte j = 0; j < ALIAS_SIZE; j++) {
          aliases[k][j] = aliases[k + 1][j];
        }
      }
      
      // Clear the last entry (now empty after shift)
      for (byte j = 0; j < UID_SIZE; j++) {
        allowedUIDs[numAllowedUIDs - 1][j] = 0;
      }
      for (byte j = 0; j < ALIAS_SIZE; j++) {
        aliases[numAllowedUIDs - 1][j] = '\0';
      }
      
      numAllowedUIDs--;
      saveUIDsToEEPROM();
      saveAliasesToEEPROM();
      
      // Also clear this UID from centralized log storage if it's no longer needed
      cleanupUnusedUIDs();
      
      return true;
    }
  }
  return false;
}

bool isAllowedUID(byte *uid, byte size) {
  if (size != UID_SIZE) return false;
  for (byte i = 0; i < numAllowedUIDs; i++) {
    bool match = true;
    for (byte j = 0; j < UID_SIZE; j++) {
      if (uid[j] != allowedUIDs[i][j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

void accessGranted() {
  digitalWrite(RELAY_PIN, LOW);
  delay(5000);
  digitalWrite(RELAY_PIN, HIGH);
}

void printUID(byte *uid, byte len) {
  for (byte i = 0; i < len; i++) {
    if (i > 0) Serial.print(":");
    if (uid[i] < 0x10) Serial.print("0");
    Serial.print(uid[i], HEX);
  }
}

bool parseUID(String str, byte *uid) {
  int idx = 0;
  int lastIdx = 0;
  for (byte i = 0; i < UID_SIZE; i++) {
    idx = str.indexOf(':', lastIdx);
    String part;
    if (idx == -1) {
      // Last part or no more colons
      part = str.substring(lastIdx);
      if (i < UID_SIZE - 1) return false; // Not enough parts
    } else {
      part = str.substring(lastIdx, idx);
    }
    uid[i] = (byte) strtoul(part.c_str(), NULL, 16);
    lastIdx = idx + 1;
  }
  return true;
}

void loadLogUIDsFromEEPROM() {
  logUIDCount = EEPROM.read(EEPROM_LOG_UIDS_COUNT_ADDR);
  if (logUIDCount > MAX_LOG_UIDS) logUIDCount = 0;
  
  Serial.print(F("Loading log UIDs: count="));
  Serial.println(logUIDCount);
  
  // Only validate if we have UIDs to load
  if (logUIDCount > 0) {
    // Validate loaded data - be more lenient
    bool dataValid = true;
    for (byte i = 0; i < logUIDCount; i++) {
      for (byte j = 0; j < LOG_UID_SIZE; j++) {
        logUIDs[i][j] = EEPROM.read(EEPROM_LOG_UIDS_DATA_ADDR + i * LOG_UID_SIZE + j);
      }
      
      Serial.print(F("UID "));
      Serial.print(i);
      Serial.print(F(": "));
      for (byte j = 0; j < LOG_UID_SIZE; j++) {
        if (logUIDs[i][j] < 16) Serial.print(F("0"));
        Serial.print(logUIDs[i][j], HEX);
        if (j < LOG_UID_SIZE - 1) Serial.print(F(":"));
      }
      Serial.println();
      
      // Only check if UID is completely invalid (all 255s = erased EEPROM)
      bool uidValid = true;
      bool all255s = true;
      for (byte j = 0; j < LOG_UID_SIZE; j++) {
        if (logUIDs[i][j] != 255) all255s = false;
      }
      // Only consider invalid if all 255s (erased EEPROM)
      if (all255s) {
        Serial.print(F("UID "));
        Serial.print(i);
        Serial.println(F(" is all 255s (erased EEPROM)"));
        uidValid = false;
      }
      if (!uidValid) {
        dataValid = false;
        break;
      }
    }
    
    // If data is invalid, reset to empty
    if (!dataValid) {
      Serial.println(F("UID data invalid, resetting UIDs"));
      logUIDCount = 0;
      for (byte i = 0; i < MAX_LOG_UIDS; i++) {
        for (byte j = 0; j < LOG_UID_SIZE; j++) {
          logUIDs[i][j] = 0;
        }
      }
    } else {
      Serial.print(F("Successfully loaded "));
      Serial.print(logUIDCount);
      Serial.println(F(" UIDs"));
    }
  } else {
    Serial.println(F("No UIDs to load"));
  }
}

void saveLogUIDsToEEPROM() {
  EEPROM.write(EEPROM_LOG_UIDS_COUNT_ADDR, logUIDCount);
  for (byte i = 0; i < logUIDCount; i++) {
    for (byte j = 0; j < LOG_UID_SIZE; j++) {
      EEPROM.write(EEPROM_LOG_UIDS_DATA_ADDR + i * LOG_UID_SIZE + j, logUIDs[i][j]);
    }
  }
}

void loadLogsFromEEPROM() {
  logCount = EEPROM.read(EEPROM_LOGS_COUNT_ADDR);
  logHead = EEPROM.read(EEPROM_LOGS_HEAD_ADDR);
  if (logCount > MAX_LOGS) logCount = 0;
  if (logHead >= MAX_LOGS) logHead = 0;
  
  Serial.print(F("Loading logs: count="));
  Serial.print(logCount);
  Serial.print(F(", head="));
  Serial.println(logHead);
  
  // Only validate if we have logs to load
  if (logCount > 0) {
    // Validate log data - be more lenient
    bool dataValid = true;
    for (byte i = 0; i < logCount; i++) {
      int addr = EEPROM_LOGS_DATA_ADDR + i * LOG_ENTRY_SIZE;
      logs[i].timestamp = 0;
      for (byte j = 0; j < 4; j++) {
        logs[i].timestamp |= ((uint32_t)EEPROM.read(addr + j)) << (8 * j);
      }
      logs[i].uidIndex = EEPROM.read(addr + 4);
      logs[i].result = EEPROM.read(addr + 5);
      
      Serial.print(F("Log "));
      Serial.print(i);
      Serial.print(F(": ts="));
      Serial.print(logs[i].timestamp);
      Serial.print(F(", uidIdx="));
      Serial.print(logs[i].uidIndex);
      Serial.print(F(", result="));
      Serial.println(logs[i].result);
      
      // Check for invalid data - only reject obviously corrupted entries
      if (logs[i].timestamp == 4294967295 || // Max uint32 (erased EEPROM)
          logs[i].uidIndex >= MAX_LOG_UIDS || // Invalid index
          (logs[i].result != 0 && logs[i].result != 1)) { // Invalid result
        Serial.print(F("Invalid log entry "));
        Serial.println(i);
        dataValid = false;
        break;
      }
      // Allow timestamp == 0 (valid for very old logs)
    }
    
    // If data is invalid, reset logs
    if (!dataValid) {
      Serial.println(F("Log data invalid, resetting logs"));
      logCount = 0;
      logHead = 0;
      for (byte i = 0; i < MAX_LOGS; i++) {
        logs[i].timestamp = 0;
        logs[i].uidIndex = 0;
        logs[i].result = 0;
      }
    } else {
      Serial.print(F("Successfully loaded "));
      Serial.print(logCount);
      Serial.println(F(" logs"));
    }
  } else {
    Serial.println(F("No logs to load"));
  }
}

void saveLogsToEEPROM() {
  EEPROM.write(EEPROM_LOGS_COUNT_ADDR, logCount);
  EEPROM.write(EEPROM_LOGS_HEAD_ADDR, logHead);
  for (byte i = 0; i < logCount; i++) {
    int addr = EEPROM_LOGS_DATA_ADDR + i * LOG_ENTRY_SIZE;
    uint32_t ts = logs[i].timestamp;
    for (byte j = 0; j < 4; j++) {
      EEPROM.write(addr + j, (ts >> (8 * j)) & 0xFF);
    }
    EEPROM.write(addr + 4, logs[i].uidIndex);
    EEPROM.write(addr + 5, logs[i].result);
  }
}

void addLog(byte *uid, byte result) {
  LogEntry entry;
  entry.timestamp = millis();
  entry.uidIndex = findOrAddLogUID(uid);
  entry.result = result;
  
  // Check if we're overwriting an old entry
  bool overwriting = (logCount >= MAX_LOGS);
  byte oldUIDIndex = 0;
  if (overwriting) {
    // Get the UID index of the entry being overwritten
    oldUIDIndex = logs[logHead].uidIndex;
  }
  
  logs[logHead] = entry;
  logHead = (logHead + 1) % MAX_LOGS;
  if (logCount < MAX_LOGS) {
    logCount++;
  } else {
    // Buffer full: oldest entry is deleted (overwritten)
    // logHead always points to the next slot to write
    // NOTE: This only affects logs, never touches allowed cards
  }
  
  // If we overwrote an entry, check if that UID is still used
  if (overwriting) {
    cleanupUnusedUIDs();
  }
  
  saveLogsToEEPROM();
  saveLogUIDsToEEPROM();
  
  // Automatically send the new log entry to the Go app
  sendNewLogEntry(entry);
}

void sendNewLogEntry(LogEntry &entry) {
  // Get the actual UID from the index
  byte uid[LOG_UID_SIZE];
  getLogUID(entry.uidIndex, uid);
  
  // Send a special marker to indicate a new log entry
  Serial.print("NEW_LOG:");
  Serial.print(entry.timestamp);
  Serial.print(",");
  printUID(uid, LOG_UID_SIZE);
  Serial.print(",");
  if (entry.result == 1) {
    Serial.println("GRANTED");
  } else {
    Serial.println("DENIED");
  }
}

void clearLogs() {
  logCount = 0;
  logHead = 0;
  saveLogsToEEPROM();
}

void sendCards() {
  Serial.println(F("CARDS:"));
  for (byte i = 0; i < numAllowedUIDs; i++) {
    // Print UID and alias
    printUID(allowedUIDs[i], UID_SIZE);
    Serial.print(",");
    Serial.println(aliases[i]);
  }
}

int findCardIndex(byte *uid) {
  for (byte i = 0; i < numAllowedUIDs; i++) {
    bool match = true;
    for (byte j = 0; j < UID_SIZE; j++) {
      if (uid[j] != allowedUIDs[i][j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

void loadAliasesFromEEPROM() {
  for (byte i = 0; i < MAX_UIDS; i++) {
    // Clear the alias first
    for (byte j = 0; j < ALIAS_SIZE; j++) {
      aliases[i][j] = '\0';
    }
    
    // Read from EEPROM and ensure proper null termination
    for (byte j = 0; j < ALIAS_SIZE - 1; j++) {
      char c = EEPROM.read(EEPROM_ALIASES_ADDR + i * ALIAS_SIZE + j);
      if (c == '\0' || c < 32 || c > 126) { // Only printable ASCII characters
        break;
      }
      aliases[i][j] = c;
    }
    aliases[i][ALIAS_SIZE - 1] = '\0'; // Ensure null termination
  }
}

void saveAliasesToEEPROM() {
  for (byte i = 0; i < MAX_UIDS; i++) {
    for (byte j = 0; j < ALIAS_SIZE; j++) {
      char c = aliases[i][j];
      if (c == '\0') {
        // Write null terminator and fill rest with zeros
        EEPROM.write(EEPROM_ALIASES_ADDR + i * ALIAS_SIZE + j, 0);
        for (byte k = j + 1; k < ALIAS_SIZE; k++) {
          EEPROM.write(EEPROM_ALIASES_ADDR + i * ALIAS_SIZE + k, 0);
        }
        break;
      } else if (c >= 32 && c <= 126) { // Only save printable ASCII
        EEPROM.write(EEPROM_ALIASES_ADDR + i * ALIAS_SIZE + j, c);
      } else {
        // Invalid character, write null and stop
        EEPROM.write(EEPROM_ALIASES_ADDR + i * ALIAS_SIZE + j, 0);
        break;
      }
    }
  }
}

// Function to get free memory
int freeMemory() {
  extern int __heap_start, *__brkval;
  int v;
  return (int) &v - (__brkval == 0 ? (int) &__heap_start : (int) __brkval);
}

// Find or add UID to centralized storage
byte findOrAddLogUID(byte *uid) {
  // First, try to find existing UID
  for (byte i = 0; i < logUIDCount; i++) {
    bool match = true;
    for (byte j = 0; j < LOG_UID_SIZE; j++) {
      if (logUIDs[i][j] != uid[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i; // Return existing index
    }
  }
  
  // UID not found, add it if space available
  if (logUIDCount < MAX_LOG_UIDS) {
    for (byte j = 0; j < LOG_UID_SIZE; j++) {
      logUIDs[logUIDCount][j] = uid[j];
    }
    logUIDCount++;
    return logUIDCount - 1; // Return new index
  }
  
  // No space available - we need to make room by removing the oldest unused UID
  // Find the oldest UID that's not currently in use by any recent logs
  bool uidInUse[MAX_LOG_UIDS] = {false};
  
  // Mark all UIDs currently in logs as in use
  for (byte i = 0; i < logCount; i++) {
    byte idx = (logHead - logCount + i + MAX_LOGS) % MAX_LOGS;
    if (logs[idx].uidIndex < MAX_LOG_UIDS) {
      uidInUse[logs[idx].uidIndex] = true;
    }
  }
  
  // Find the first unused UID (oldest in the array)
  byte oldestUnusedIndex = 255;
  for (byte i = 0; i < logUIDCount; i++) {
    if (!uidInUse[i]) {
      oldestUnusedIndex = i;
      break;
    }
  }
  
  if (oldestUnusedIndex != 255) {
    // Replace the oldest unused UID with the new one
    for (byte j = 0; j < LOG_UID_SIZE; j++) {
      logUIDs[oldestUnusedIndex][j] = uid[j];
    }
    return oldestUnusedIndex;
  }
  
  // If all UIDs are in use, replace the oldest one (index 0)
  // This is a fallback that should rarely happen
  for (byte j = 0; j < LOG_UID_SIZE; j++) {
    logUIDs[0][j] = uid[j];
  }
  return 0;
}

// Get UID by index
void getLogUID(byte index, byte *uid) {
  if (index < logUIDCount) {
    for (byte j = 0; j < LOG_UID_SIZE; j++) {
      uid[j] = logUIDs[index][j];
    }
  } else {
    // Invalid index, return zeros
    for (byte j = 0; j < LOG_UID_SIZE; j++) {
      uid[j] = 0;
    }
  }
}

// Clear all EEPROM data
void clearAllEEPROM() {
  // Clear UIDs
  numAllowedUIDs = 0;
  saveUIDsToEEPROM();
  
  // Clear aliases
  for (byte i = 0; i < MAX_UIDS; i++) {
    for (byte j = 0; j < ALIAS_SIZE; j++) {
      aliases[i][j] = '\0';
    }
  }
  saveAliasesToEEPROM();
  
  // Clear logs
  logCount = 0;
  logHead = 0;
  saveLogsToEEPROM();
  
  // Clear centralized UIDs
  logUIDCount = 0;
  saveLogUIDsToEEPROM();
}

// Clean up unused UIDs from centralized storage
// This function only affects log UIDs, never touches allowed cards
void cleanupUnusedUIDs() {
  // Create a bitmap to track which UIDs are still in use
  bool uidInUse[MAX_LOG_UIDS] = {false};
  
  // Mark all UIDs currently in logs as in use
  for (byte i = 0; i < logCount; i++) {
    byte idx = (logHead - logCount + i + MAX_LOGS) % MAX_LOGS;
    if (logs[idx].uidIndex < MAX_LOG_UIDS) {
      uidInUse[logs[idx].uidIndex] = true;
    }
  }
  
  // Find unused UIDs and create new compacted array
  byte newLogUIDs[MAX_LOG_UIDS][LOG_UID_SIZE];
  byte newLogUIDCount = 0;
  byte indexMap[MAX_LOG_UIDS]; // Maps old indices to new indices
  
  // Build new UID array with only used UIDs
  for (byte i = 0; i < logUIDCount; i++) {
    if (uidInUse[i]) {
      // Copy UID to new position
      for (byte j = 0; j < LOG_UID_SIZE; j++) {
        newLogUIDs[newLogUIDCount][j] = logUIDs[i][j];
      }
      indexMap[i] = newLogUIDCount;
      newLogUIDCount++;
    } else {
      indexMap[i] = 255; // Mark as unused
    }
  }
  
  // Update log entries to use new indices
  for (byte i = 0; i < logCount; i++) {
    byte idx = (logHead - logCount + i + MAX_LOGS) % MAX_LOGS;
    if (logs[idx].uidIndex < MAX_LOG_UIDS) {
      byte oldIndex = logs[idx].uidIndex;
      if (indexMap[oldIndex] != 255) {
        logs[idx].uidIndex = indexMap[oldIndex];
      } else {
        logs[idx].uidIndex = 0; // Fallback to first UID
      }
    }
  }
  
  // Update centralized UID storage
  logUIDCount = newLogUIDCount;
  for (byte i = 0; i < newLogUIDCount; i++) {
    for (byte j = 0; j < LOG_UID_SIZE; j++) {
      logUIDs[i][j] = newLogUIDs[i][j];
    }
  }
  
  // Clear remaining slots
  for (byte i = newLogUIDCount; i < MAX_LOG_UIDS; i++) {
    for (byte j = 0; j < LOG_UID_SIZE; j++) {
      logUIDs[i][j] = 0;
    }
  }
}