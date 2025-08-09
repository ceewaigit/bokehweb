import React from 'react';
import ReactDOM from 'react-dom/client';
import RecordButton from './app/record-button/page';
import './app/globals.css';

// Check if we're loading the record button based on the URL hash
const isRecordButton = window.location.hash === '#/record-button';

const App = () => {
  if (isRecordButton) {
    return <RecordButton />;
  }

  // Main app UI
  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      textAlign: 'center'
    }}>
      <h1>Screen Studio</h1>
      <p>Main application interface</p>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);