import './style.css';
import './app.css';
import './content.css';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CardsTable from './components/CardsTable.jsx';
import LogsTable from './components/LogsTable.jsx';
import { SendCommand, IsConnected, GetConnectionStatus } from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';
import logo from './assets/images/logo.png';

// Helper to get/set aliases in localStorage
function getAliases() {
  return JSON.parse(localStorage.getItem('aliases') || '{}');
}
function setAlias(uid, alias) {
  const aliases = getAliases();
  aliases[uid] = alias;
  localStorage.setItem('aliases', JSON.stringify(aliases));
}
function removeAlias(uid) {
  const aliases = getAliases();
  delete aliases[uid];
  localStorage.setItem('aliases', JSON.stringify(aliases));
}

function App() {
  const [connected, setConnected] = useState(false);
  const [cards, setCards] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [savingAliasUID, setSavingAliasUID] = useState(null);
  const [isCommandInProgress, setIsCommandInProgress] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null);
  const [activeTab, setActiveTab] = useState('cards'); // Default to cards tab
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [logTimeOffset, setLogTimeOffset] = useState(0); // ms
  const [connectionStatus, setConnectionStatus] = useState('searching'); // 'searching' or 'connected'
  const [eventCounter, setEventCounter] = useState(0); // Track received events
  const [memoryUsage, setMemoryUsage] = useState({ used: 0, total: 0 });

  // Listen for real-time log events from Go app
  useEffect(() => {
    console.log('Setting up event listeners for logs');
    
    // Listen for new log entries
    const unsubscribeNewLog = EventsOn('newLogEntry', (data) => {
      setEventCounter(prev => prev + 1);
      console.log(`Received new log entry #${eventCounter + 1}:`, data);
      
      // Add the new log entry to the existing logs
      const newLog = {
        millis: parseInt(data.timestamp, 10),
        uid: data.uid,
        displayName: data.displayName || data.uid,
        result: data.result
      };
      
      console.log('Adding new log:', newLog);
      setLogs(prevLogs => {
        const updatedLogs = [...prevLogs, newLog];
        console.log('Updated logs count:', updatedLogs.length);
        // Keep only the last 100 logs to prevent memory issues
        return updatedLogs.slice(-100);
      });
      
      // Update time offset if this is the first log
      if (logs.length === 0) {
        setLogTimeOffset(Date.now() - newLog.millis);
      }
    });
    
    // Listen for individual log entries (from GET_LOGS response)
    const unsubscribeLogEntry = EventsOn('logEntry', (data) => {
      console.log('Received log entry:', data);
      
      const logEntry = {
        millis: parseInt(data.timestamp, 10),
        uid: data.uid,
        displayName: data.displayName || data.uid,
        result: data.result
      };
      
      setLogs(prevLogs => {
        // Check if this log already exists
        const exists = prevLogs.some(log => 
          log.millis === logEntry.millis && 
          log.uid === logEntry.uid && 
          log.result === logEntry.result
        );
        
        if (!exists) {
          const updatedLogs = [...prevLogs, logEntry];
          console.log('Added log entry, total logs:', updatedLogs.length);
          return updatedLogs.slice(-100);
        }
        
        return prevLogs;
      });
      
      // Update time offset if this is the first log
      if (logs.length === 0) {
        setLogTimeOffset(Date.now() - logEntry.millis);
      }
    });
    
    // Listen for logs cleared event
    const unsubscribeLogsCleared = EventsOn('logsCleared', () => {
      console.log('Logs cleared event received');
      setLogs([]);
    });
    
    // Listen for card entries (from GET_CARDS response)
    const unsubscribeCardEntry = EventsOn('cardEntry', (data) => {
      console.log('Received card entry:', data);
      
      const cardEntry = {
        uid: data.uid,
        alias: data.alias || getAliases()[data.uid] || '' // Use Arduino alias or fallback to localStorage
      };
      
      setCards(prevCards => {
        // Check if this card already exists
        const exists = prevCards.some(card => card.uid === cardEntry.uid);
        
        if (!exists) {
          const updatedCards = [...prevCards, cardEntry];
          console.log('Added card entry, total cards:', updatedCards.length);
          return updatedCards;
        } else {
          // Update existing card with new alias from Arduino
          const updatedCards = prevCards.map(card => 
            card.uid === cardEntry.uid 
              ? { ...card, alias: cardEntry.alias }
              : card
          );
          return updatedCards;
        }
      });
    });
    
    // Listen for card removal responses
    const unsubscribeCardRemoved = EventsOn('cardRemoved', (data) => {
      console.log('Card removal response:', data);
      
      if (data.success) {
        // Card was successfully removed from Arduino
        console.log('Card removed successfully from Arduino');
        
        // If UID is provided, clear the alias from localStorage
        if (data.uid) {
          console.log('Clearing alias for removed card:', data.uid);
          removeAlias(data.uid);
        }
      } else {
        console.error('Card removal failed:', data.error);
        // If removal failed on Arduino, we should restore the card to the UI
        // But since we don't have the card data here, we'll just show an error
        // and let the user refresh if needed
        alert('Kártya eltávolítása sikertelen: ' + data.error);
        // Note: In a more sophisticated implementation, we could restore the card
        // by storing the removed card data and restoring it on failure
      }
    });
    
    // Listen for card added responses
    const unsubscribeCardAdded = EventsOn('cardAdded', (data) => {
      console.log('Card added response:', data);
      
      if (data.success) {
        // Card was successfully added to Arduino
        console.log('Card added successfully to Arduino');
        alert('Kártya engedélyezve!');
      } else {
        console.error('Card addition failed:', data.error);
        alert('Kártya engedélyezése sikertelen: ' + data.error);
      }
    });
    
    // Listen for alias saved responses
    const unsubscribeAliasSaved = EventsOn('aliasSaved', (data) => {
      console.log('Alias saved response:', data);
      
      if (data.success) {
        console.log('Alias saved successfully to Arduino');
      } else {
        console.error('Alias save failed:', data.error);
        alert('Becenév mentése sikertelen: ' + data.error);
      }
    });
    
    // Listen for memory usage updates
    const unsubscribeMemoryUsage = EventsOn('memoryUsage', (data) => {
      console.log('Memory usage received:', data);
      setMemoryUsage({
        used: data.used || 0,
        total: data.total || 0
      });
    });
    
    // Listen for EEPROM reset events
    const unsubscribeEepromReset = EventsOn('eepromReset', (data) => {
      console.log('EEPROM reset event received:', data);
      if (data.success) {
        // Clear all aliases from localStorage
        localStorage.removeItem('aliases');
        // Clear cards and logs from UI
        setCards([]);
        setLogs([]);
        alert('EEPROM sikeresen törölve!');
      }
    });
    
    console.log('Event listeners set up');
    
    return () => {
      unsubscribeNewLog();
      unsubscribeLogEntry();
      unsubscribeLogsCleared();
      unsubscribeCardEntry();
      unsubscribeCardRemoved();
      unsubscribeCardAdded();
      unsubscribeAliasSaved();
      unsubscribeMemoryUsage();
      unsubscribeEepromReset();
    };
  }, [logs.length, eventCounter]);

  // Immediate connection check on startup
  useEffect(() => {
    const checkInitialConnection = async () => {
      try {
        const isConnected = await IsConnected();
        const status = await GetConnectionStatus();
        console.log('Initial connection check:', { isConnected, status });
        
        if (isConnected) {
          setConnected(true);
          setConnectionStatus('connected');
          // Auto-fetch data when first connected
          if (activeTab === 'logs') {
            setTimeout(() => fetchLogs(), 1000); // Delay to ensure connection is stable
          } else if (activeTab === 'cards') {
            setTimeout(() => fetchCards(), 1000); // Delay to ensure connection is stable
          }
        }
      } catch (error) {
        console.log('Initial connection check failed:', error);
      }
    };
    
    checkInitialConnection();
  }, []);

  // Check connection status periodically
  useEffect(() => {
    let isChecking = false;
    
    const checkConnection = async () => {
      if (isChecking) return; // Prevent multiple simultaneous checks
      isChecking = true;
      
      try {
        // First check if Go app thinks we're connected
        const isConnected = await IsConnected();
        const status = await GetConnectionStatus();
        console.log('Connection status check:', { isConnected, status });
        
        if (isConnected && !connected) {
          console.log('Setting connected state to true');
          setConnected(true);
          setConnectionStatus('connected');
          // Only fetch data after connection is confirmed
          // Don't auto-fetch here - let the tab-specific useEffect handle it
        } else if (!isConnected && connected) {
          console.log('Setting connected state to false');
          setConnected(false);
          setConnectionStatus('searching');
        }
      } catch (error) {
        console.log('Connection check failed:', error);
        if (connected) {
          console.log('Setting connected state to false');
          setConnected(false);
          setConnectionStatus('searching');
        }
      } finally {
        isChecking = false;
      }
    };

    // Check immediately
    checkConnection();
    
    // Then check every 2 seconds (more frequent now that we're not sending commands)
    const interval = setInterval(checkConnection, 2000);
    
    return () => clearInterval(interval);
  }, [connected, activeTab]);

  // Periodically refresh memory usage when connected
  useEffect(() => {
    if (!connected) return;
    
    const refreshMemory = () => {
      SendCommand('GET_MEMORY');
    };
    
    // Refresh memory every 30 seconds when connected
    const interval = setInterval(refreshMemory, 30000);
    
    return () => clearInterval(interval);
  }, [connected]);

  // Helper to fetch cards - real implementation
  async function fetchCards() {
    setCardsLoading(true);
    setLoadingAction('refresh');
    setIsCommandInProgress(true);
    setIsLoading(true);
    try {
      // Clear existing cards first
      setCards([]);
      
      // Send command - the real-time listener will handle the response
      const resp = await SendCommand('GET_CARDS');
      console.log('SendCommand response:', resp);
      
      // The cards will be received via events, so we just wait a bit
      setTimeout(() => {
        setCardsLoading(false);
        setIsLoading(false);
        setIsCommandInProgress(false);
        setLoadingAction(null);
      }, 2000); // Give Arduino time to send all cards
      
    } catch (e) {
      console.error('Error fetching cards:', e);
      setCardsLoading(false);
      setIsLoading(false);
      setIsCommandInProgress(false);
      setLoadingAction(null);
    }
  }

  // Fetch data when needed (refresh, add, remove, save alias) - real implementation
  async function refreshData() {
    if (!connected) return;
    setLoadingAction('refresh');
    await fetchCards();
    setLoadingAction(null);
  }

  // Add/remove card logic - dummy implementations
  async function handleAddManual() {
    const uid = document.getElementById('addUID').value.trim();
    const alias = document.getElementById('addAlias').value.trim();
    if (!uid) return alert('Adja meg az UID-t');
    if (cards.some(card => card.uid === uid)) return alert('UID már szerepel a listában');
    setIsCommandInProgress(true);
    setLoadingAction('addManual');
    try {
      // Dummy implementation
      alert('Dummy: Kártya hozzáadva!');
      document.getElementById('addUID').value = '';
      document.getElementById('addAlias').value = '';
    } finally {
      setIsCommandInProgress(false);
      setLoadingAction(null);
    }
  }
  async function handleRemove(uid) {
    setIsCommandInProgress(true);
    setLoadingAction('remove:' + uid);
    
    // Optimistic handling: immediately remove card from UI
    setCards(prevCards => prevCards.filter(card => card.uid !== uid));
    
    try {
      // Send REMOVE_CARD command to Arduino
      const resp = await SendCommand(`REMOVE_CARD:${uid}`);
      console.log('Remove card command sent:', resp);
      
      // The cardRemoved event will be handled by the event listener
      // We just wait a bit for the event to be processed
      setTimeout(() => {
        setIsCommandInProgress(false);
        setLoadingAction(null);
      }, 1000);
      
    } catch (e) {
      console.error('Error removing card:', e);
      // If there was an error, we could potentially restore the card
      // But for now, we'll assume it was successful
      setIsCommandInProgress(false);
      setLoadingAction(null);
    }
  }
  async function handleSaveAlias(uid) {
    const input = document.querySelector(`.aliasInput[data-uid='${uid}']`);
    const newAlias = input.value.trim();
    
    // Optimistic update: immediately update the UI
    setCards(prevCards => 
      prevCards.map(card => 
        card.uid === uid 
          ? { ...card, alias: newAlias }
          : card
      )
    );
    
    // Also update localStorage
    setAlias(uid, newAlias);
    
    setSavingAliasUID(uid);
    setLoadingAction('saveAlias:' + uid);
    
    try {
      // Send command to Arduino
      const resp = await SendCommand(`SAVE_ALIAS:${uid}:${newAlias}`);
      console.log('Save alias command sent:', resp);
      
      // The aliasSaved event will be handled by the event listener
      setTimeout(() => {
        setSavingAliasUID(null);
        setLoadingAction(null);
      }, 1000);
      
    } catch (e) {
      console.error('Error saving alias:', e);
      // If there was an error, we could potentially revert the optimistic update
      // But for now, we'll assume it was successful
      setSavingAliasUID(null);
      setLoadingAction(null);
    }
  }

  // Allow a denied card
  async function handleAllowCard(uid) {
    try {
      // Optimistic handling: immediately add card to local cards list
      setCards(prevCards => {
        // Check if card already exists
        const exists = prevCards.some(card => card.uid === uid);
        if (!exists) {
          return [...prevCards, { uid, alias: getAliases()[uid] || '' }];
        }
        return prevCards;
      });
      
      // Send ADD_CARD command to Arduino
      const resp = await SendCommand(`ADD_CARD:${uid}`);
      console.log('Add card command sent:', resp);
      
      // The cardAdded event will be handled by the event listener
      // We just wait a bit for the event to be processed
      setTimeout(() => {
        // Could refresh cards list here if needed
      }, 1000);
      
    } catch (e) {
      console.error('Error adding card:', e);
      // If there was an error, we could potentially remove the card from local list
      // But for now, we'll assume it was successful
    }
  }

  // Fetch data when switching tabs or when connection is established
  useEffect(() => {
    if (connected) {
      if (activeTab === 'logs') {
        console.log('Fetching logs after connection established');
        fetchLogs();
      } else if (activeTab === 'cards') {
        console.log('Fetching cards after connection established');
        fetchCards();
      }
    }
  }, [activeTab, connected]);

  // Fetch logs from Arduino
  async function fetchLogs() {
    setLogsLoading(true);
    setLogsError(null);
    try {
      // Clear existing logs first
      setLogs([]);
      
      // Send command - the real-time listener will handle the response
      const resp = await SendCommand('GET_LOGS');
      console.log('SendCommand response:', resp);
      
      // The logs will be received via events, so we just wait a bit
      setTimeout(() => {
        setLogsLoading(false);
      }, 2000); // Give Arduino time to send all logs
      
    } catch (e) {
      console.error('Error fetching logs:', e);
      setLogsError('Napló betöltése sikertelen: ' + e.message);
      setLogsLoading(false);
    }
  }

  // Clear logs - real implementation
  async function handleClearLogs() {
    setLogsLoading(true);
    setLogsError(null);
    try {
      // Send command - the real-time listener will handle the response
      const response = await SendCommand('CLEAR_LOGS');
      console.log('Clear logs command sent:', response);
      
      // The logsCleared event will be handled by the event listener
      // We just wait a bit for the event to be processed
      setTimeout(() => {
        setLogsLoading(false);
      }, 1000);
      
    } catch (e) {
      console.error('Error clearing logs:', e);
      setLogsError('Napló törlése sikertelen: ' + e.message);
      setLogsLoading(false);
    }
  }

  return (
    <div className="app-container">
      <img src={logo} alt="Kártya Kezelő" className="app-logo" />
      <h1 className="app-title">Kártya Kezelő</h1>
      
      {/* Connection Status - Centered below title */}
      <div className="connection-status">
        <div className={`connection-status__indicator ${connectionStatus === 'connected' ? 'connection-status__indicator--connected' : 'connection-status__indicator--searching'}`}>
          <div className={`connection-status__dot ${connectionStatus === 'searching' ? 'connection-status__dot--searching' : ''}`}></div>
          {connectionStatus === 'connected' ? 'Kapcsolódva' : 'Eszköz keresése...'}
        </div>
        
        {/* Memory Usage Indicator */}
        {connectionStatus === 'connected' && (
          <div 
            className="memory-usage"
            onClick={(e) => {
              if (e.shiftKey) {
                e.preventDefault();
                SendCommand('RESET_EEPROM');
                // Refresh memory usage after reset
                setTimeout(() => {
                  SendCommand('GET_MEMORY');
                }, 1000); // Wait 1 second for reset to complete
              }
            }}
            title="Shift+click az EEPROM törléséhez"
          >
            Memória: {memoryUsage.used || 0}/{memoryUsage.total || 1024} bájt
          </div>
        )}
      </div>
      
      {/* Tab content area */}
      <div className={`content-card tab-content${connected ? '' : ' content-card--disabled'}`}>
        <div className="tabs-bar tabs-bar--main">
          <button
            onClick={() => connected && setActiveTab('cards')}
            disabled={!connected}
            className={`tab-btn${activeTab === 'cards' ? ' tab-btn--active' : ''}`}
          >
            Kártyák
          </button>
          <button
            onClick={() => connected && setActiveTab('logs')}
            disabled={!connected}
            className={`tab-btn${activeTab === 'logs' ? ' tab-btn--active' : ''}`}
          >
            Napló
          </button>
        </div>
        {activeTab === 'cards' && (
          <>
            <CardsTable
              cards={cards}
              savingAliasUID={savingAliasUID}
              onSaveAlias={handleSaveAlias}
              onRemove={handleRemove}
              loadingAction={loadingAction}
              loading={cardsLoading}
            />
          </>
        )}
        {activeTab === 'logs' && (
          <>
            {logsError && <div className="error-message">{logsError}</div>}
            <div className="logs-content">
              <LogsTable
                logs={logs}
                loading={logsLoading}
                logTimeOffset={logTimeOffset}
                cards={cards}
                onAllowCard={handleAllowCard}
                getAliases={getAliases}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('app'));
root.render(<App />);
