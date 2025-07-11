import React from 'react';

export default function Button({ children, onClick, disabled, loading, globalLoading, className = '', ...props }) {
  const isDisabled = (globalLoading && !loading) || disabled;
  const btnClasses = `btn ${loading ? 'btn--loading' : ''} ${className}`.trim();
  
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={btnClasses}
      {...props}
    >
      {loading && (
        <span className="loading-spinner" />
      )}
      {children}
    </button>
  );
} 