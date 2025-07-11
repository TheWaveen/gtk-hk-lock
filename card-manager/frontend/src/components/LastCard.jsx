import React from 'react';
import Button from './Button.jsx';

export default function LastCard({ lastUID, isScanning, cards, onAdd, onRemove, loadingAdd, loadingRemove, globalLoading, onCheckForCards, checkForCardsLoading, checkForCardsDisabled }) {
  const isInList = lastUID && cards.some(card => card.uid === lastUID);
  return (
    <div className="last-card">
      <div className="last-card__header">
        <span id="lastUID" className="last-card__uid">
          {lastUID ? 'Utolsó UID: ' + lastUID : 'Szkennelés készen áll...'}
        </span>
        <Button
          onClick={onCheckForCards}
          disabled={checkForCardsDisabled}
          loading={checkForCardsLoading}
          className="btn--success"
        >
          Kártyák Ellenőrzése
        </Button>
      </div>
      {lastUID && (
        isInList ? (
          <Button
            id="removeLastBtn"
            className="btn--medium btn--danger"
            onClick={onRemove}
            loading={loadingRemove}
            globalLoading={globalLoading}
          >
            Listából Eltávolítás
          </Button>
        ) : (
          <Button
            id="addLastBtn"
            className="btn--medium btn--success"
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