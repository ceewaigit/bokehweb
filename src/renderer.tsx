import React from 'react';
import ReactDOM from 'react-dom/client';
import RecordButton from './app/record-button/page';
import { WorkspaceManager } from './components/workspace/workspace-manager';
import './app/globals.css';

// Check if we're loading the record button based on the URL hash
const isRecordButton = window.location.hash === '#/record-button';

const App = () => {
  if (isRecordButton) {
    return <RecordButton />;
  }

  // Main app UI
  return <WorkspaceManager />;
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);