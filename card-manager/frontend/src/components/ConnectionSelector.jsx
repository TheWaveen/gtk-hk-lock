import React from 'react';
import Button from './Button.jsx';

export default function ConnectionSelector({ ports, selectedPort, connected, onPortChange, onConnect, onDisconnect, loading, globalLoading }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Soros Port:</label>
      <select
        value={selectedPort}
        onChange={e => onPortChange(e.target.value)}
        style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 5, marginBottom: 10 }}
        disabled={connected || globalLoading}
      >
        {ports.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 10 }}>
        <Button
          onClick={onConnect}
          disabled={connected}
          loading={loading}
          globalLoading={globalLoading}
          style={{ flex: 1, padding: 12, background: connected ? '#4CAF50' : '#007bff', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 16 }}
        >
          {connected ? 'Kapcsolódva' : 'Kapcsolódás'}
        </Button>
        {connected && (
          <Button
            onClick={onDisconnect}
            loading={loading}
            globalLoading={globalLoading}
            style={{ flex: 1, padding: 12, background: '#dc3545', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 16 }}
          >
            Kapcsolat Bontása
          </Button>
        )}
      </div>
    </div>
  );
} 