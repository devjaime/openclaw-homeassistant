import React from 'react';

export default function LoadingSpinner({ size = 32, message = 'Cargando...' }) {
  return (
    <div className="loading-spinner-container">
      <div className="loading-spinner" style={{ width: size, height: size }} />
      {message && <p className="loading-message">{message}</p>}
    </div>
  );
}
