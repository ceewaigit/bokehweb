import React from 'react';
import ReactDOM from 'react-dom/client';

// This is a bridge renderer for electron-forge webpack
// The actual Next.js app is loaded via the electron main process

const App = () => {
  React.useEffect(() => {
    // In production, redirect to Next.js app
    if (process.env.NODE_ENV === 'production') {
      window.location.href = 'http://localhost:3000';
    }
  }, []);

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      textAlign: 'center'
    }}>
      <h1>Screen Studio</h1>
      <p>Loading application...</p>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);