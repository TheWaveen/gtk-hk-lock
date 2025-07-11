import React from 'react';
import Button from './Button.jsx';

export default function LastCard({ lastUID, isScanning, cards, onAdd, onRemove, loadingAdd, loadingRemove, globalLoading, onCheckForCards, checkForCardsLoading, checkForCardsDisabled }) {
  const isInList = lastUID && cards.some(card => card.uid === lastUID);
  return (
    <div style={{ marginBottom: 20, padding: 15, background: '#f8f9fa', borderRadius: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, justifyContent: 'space-between' }}>
        <span id="lastUID" style={{ fontWeight: 'bold', color: '#333' }}>
          {lastUID ? 'Utolsó UID: ' + lastUID : 'Szkennelés készen áll...'}
        </span>
        <Button
          onClick={onCheckForCards}
          disabled={checkForCardsDisabled}
          loading={checkForCardsLoading}
          style={{ background: '#28a745', marginLeft: 10 }}
        >
          Kártyák Ellenőrzése
        </Button>
      </div>
      {lastUID && (
        isInList ? (
          <Button
            id="removeLastBtn"
            style={{ padding: '8px 16px', background: '#dc3545', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer' }}
            onClick={onRemove}
            loading={loadingRemove}
            globalLoading={globalLoading}
          >
            Listából Eltávolítás
          </Button>
        ) : (
          <Button
            id="addLastBtn"
            style={{ padding: '8px 16px', background: '#28a745', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer' }}
            onClick={onAdd}
            loading={loadingAdd}
            globalLoading={globalLoading}
          >
            Listához Adás
          </Button>
        )
      )}
    </div>
  );
} 