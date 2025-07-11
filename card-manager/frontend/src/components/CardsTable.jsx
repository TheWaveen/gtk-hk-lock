import React from 'react';
import Button from './Button.jsx';

export default function CardsTable({ cards, savingAliasUID, onSaveAlias, onRemove, loadingAction, loading }) {
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner loading-spinner--large"></div>
      </div>
    );
  }

  return (
    <table id="cardTable" className="cards-table">
      <thead>
        <tr className="cards-table__header">
          <th className="cards-table__header-cell">UID</th>
          <th className="cards-table__header-cell">Alias</th>
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
            <tr key={card.uid} className="cards-table__row">
              <td className="cards-table__cell">{card.uid}</td>
              <td className="cards-table__cell cards-table__cell--actions">
                <div className="alias-input-container">
                  <input
                    type="text"
                    defaultValue={originalAlias}
                    data-uid={card.uid}
                    className="alias-input"
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
                    className="char-count charCount" 
                    data-uid={card.uid}
                  >
                    {originalAlias.length}/15
                  </div>
                </div>
                <Button
                  className="saveAliasBtn btn--small"
                  data-uid={card.uid}
                  disabled={isSaving}
                  loading={isSaveLoading}
                  globalLoading={globalLoading}
                  onClick={() => onSaveAlias(card.uid)}
                >
                  Mentés
                </Button>
                <Button
                  className="removeBtn btn--small btn--danger"
                  data-uid={card.uid}
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