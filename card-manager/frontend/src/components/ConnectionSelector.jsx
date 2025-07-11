import React from 'react';
import Button from './Button.jsx';

export default function ConnectionSelector({ ports, selectedPort, connected, onPortChange, onConnect, onDisconnect, loading, globalLoading }) {
  return (
    <div className="connection-selector">
      <label className="connection-selector__label">Soros Port:</label>
      <select
        value={selectedPort}
        onChange={e => onPortChange(e.target.value)}
        className="connection-selector__select"
        disabled={connected || globalLoading}
      >
        {ports.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <div className="connection-selector__buttons">
        <Button
          onClick={onConnect}
          disabled={connected}
          loading={loading}
          globalLoading={globalLoading}
          className={`btn--large ${connected ? 'btn--success' : ''}`}
        >
          {connected ? 'Kapcsolódva' : 'Kapcsolódás'}
        </Button>
        {connected && (
          <Button
            onClick={onDisconnect}
            loading={loading}
            globalLoading={globalLoading}
            className="btn--large btn--danger"
          >
            Kapcsolat Bontása
          </Button>
        )}
      </div>
    </div>
  );
} 