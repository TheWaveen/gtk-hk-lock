import React from 'react';

export default function LogsTable({ logs, loading, logTimeOffset, cards, onAllowCard, getAliases }) {
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: 40
      }}>
        <div style={{ 
          width: '20px', 
          height: '20px', 
          border: '2px solid #f3f3f3', 
          borderTop: '2px solid #007bff', 
          borderRadius: '50%', 
          animation: 'spin 1s linear infinite' 
        }}></div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <table className="logs-table" style={{ borderCollapse: 'collapse', width: '100%' }}>
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
            <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>Nincsen napló</td></tr>
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
                      <span style={{
                        color: '#28a745',
                        fontSize: 16,
                        fontStyle: 'italic'
                      }}>
                        Kártya engedélyezve
                      </span>
                    ) : (
                      <button
                        onClick={() => onAllowCard(log.uid)}
                        style={{
                          padding: '5px 10px',
                          background: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: 3,
                          cursor: 'pointer',
                          fontSize: 16
                        }}
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