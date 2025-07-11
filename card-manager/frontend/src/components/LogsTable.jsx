import React from 'react';

export default function LogsTable({ logs, loading, logTimeOffset, cards, onAllowCard, getAliases }) {
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner loading-spinner--large"></div>
      </div>
    );
  }

  return (
    <div className="logs-container">
      <table className="logs-table">
        <thead>
          <tr className="logs-table-header">
            <th className="logs-table-cell">Idő</th>
            <th className="logs-table-cell">Kártya</th>
            <th className="logs-table-cell">Becenév</th>
            <th className="logs-table-cell">Eredmény</th>
            <th className="logs-table-cell">Művelet</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr><td colSpan={5} className="logs-table__empty">Nincsen napló</td></tr>
          ) : [...logs].reverse().map((log, idx) => {
            const aliases = getAliases();
            const alias = aliases[log.uid] || '';
            const date = new Date(log.millis + logTimeOffset);
            return (
              <tr key={idx} className="logs-table-row">
                <td className="logs-table-cell">{date.toLocaleString()}</td>
                <td className="logs-table-cell">{log.uid}</td>
                <td className="logs-table-cell">{alias}</td>
                <td className={`logs-table-cell logs-table-cell--${log.result === 'GRANTED' || log.result === 1 ? 'granted' : 'denied'}`}>
                  {log.result === 'GRANTED' || log.result === 1 ? 'ENGEDÉLYEZVE' : 'MEGTAGADVA'}
                </td>
                <td className="logs-table-cell">
                  {(log.result === 'DENIED' || log.result === 0) && (
                    cards.some(card => card.uid === log.uid) ? (
                      <span className="logs-table__status">
                        Kártya engedélyezve
                      </span>
                    ) : (
                      <button
                        onClick={() => onAllowCard(log.uid)}
                        className="logs-table__action-btn"
                      >
                        Kártya engedélyezése
                      </button>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
} 