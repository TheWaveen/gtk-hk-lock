import React from 'react';
import Button from './Button.jsx';

export default function CardsTable({ cards, savingAliasUID, onSaveAlias, onRemove, loadingAction, loading }) {
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
    <table id="cardTable" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
      <thead>
        <tr style={{ background: '#f8f9fa' }}>
          <th style={{ padding: 12, textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#333' }}>UID</th>
          <th style={{ padding: 12, textAlign: 'left', borderBottom: '2px solid #dee2e6', color: '#333' }}>Alias</th>
        </tr>
      </thead>
      <tbody>
        {cards.map(card => {
          const originalAlias = card.alias || '';
          const isSaving = savingAliasUID === card.uid;
          const isSaveLoading = loadingAction === `saveAlias:${card.uid}`;
          const isRemoveLoading = loadingAction === `remove:${card.uid}`;
          const globalLoading = !!loadingAction && !isSaveLoading && !isRemoveLoading;
          return (
            <tr key={card.uid} style={{ borderBottom: '1px solid #dee2e6' }}>
              <td style={{ padding: 12, color: '#333' }}>{card.uid}</td>
              <td style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', width: '60%' }}>
                  <input
                    type="text"
                    defaultValue={originalAlias}
                    data-uid={card.uid}
                    className="aliasInput"
                    style={{ 
                      width: '100%', 
                      padding: 5, 
                      border: '1px solid #ddd', 
                      borderRadius: 3,
                      marginBottom: 2
                    }}
                    disabled={isSaving || isSaveLoading || globalLoading}
                    maxLength={15}
                    onInput={e => {
                      const btn = document.querySelector(`.saveAliasBtn[data-uid='${card.uid}']`);
                      const charCount = document.querySelector(`.charCount[data-uid='${card.uid}']`);
                      const currentValue = e.target.value;
                      const isUnchanged = currentValue === originalAlias;
                      
                      if (btn) {
                        btn.disabled = isUnchanged;
                      }
                      if (charCount) {
                        charCount.textContent = `${currentValue.length}/15`;
                        charCount.style.color = '#666';
                      }
                    }}
                    onKeyPress={e => {
                      if (e.key === 'Enter') {
                        const input = e.target;
                        if (input.value !== originalAlias) {
                          onSaveAlias(card.uid);
                        }
                      }
                    }}
                  />
                  <div 
                    className="charCount" 
                    data-uid={card.uid}
                    style={{ 
                      fontSize: '11px', 
                      color: '#666',
                      textAlign: 'right'
                    }}
                  >
                    {originalAlias.length}/15
                  </div>
                </div>
                <Button
                  className="saveAliasBtn"
                  data-uid={card.uid}
                  disabled={isSaving}
                  loading={isSaveLoading}
                  globalLoading={globalLoading}
                  style={{ 
                    padding: '5px 12px', 
                    background: '#007bff', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: 3, 
                    cursor: 'pointer', 
                    minWidth: 60 
                  }}
                  onClick={() => onSaveAlias(card.uid)}
                >
                  Mentés
                </Button>
                <Button
                  className="removeBtn"
                  data-uid={card.uid}
                  style={{ padding: '5px 10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                  onClick={() => onRemove(card.uid)}
                  loading={isRemoveLoading}
                  globalLoading={globalLoading}
                >
                  Törlés
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
} 