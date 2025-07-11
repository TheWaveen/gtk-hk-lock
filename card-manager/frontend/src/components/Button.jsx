import React from 'react';

export default function Button({ children, onClick, disabled, style, loading, globalLoading, ...props }) {
  const isDisabled = (globalLoading && !loading) || disabled;
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      style={{
        padding: '10px 20px',
        background: '#007bff',
        color: 'white',
        border: 'none',
        borderRadius: 5,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        fontSize: 16,
        position: 'relative',
        ...style,
      }}
      {...props}
    >
      {loading && (
        <span style={{
          display: 'inline-block',
          width: 16,
          height: 16,
          border: '2px solid #fff',
          borderTop: '2px solid #007bff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          verticalAlign: 'middle',
          marginRight: 8,
        }} />
      )}
      {children}
    </button>
  );
} 