import React from 'react';
import ReactDOM from 'react-dom/client';
import { RecordButtonDock } from './components/record-button-dock';
import { RecordButtonTest } from './components/record-button-test';
import { WorkspaceManager } from './components/workspace/workspace-manager';
import { ThemeProvider } from './contexts/theme-context';
import { ErrorBoundary } from './components/error-boundary';
import './app/globals.css';

// Check if we're loading the record button based on the URL hash
const isRecordButton = window.location.hash === '#/record-button';
console.log('[Renderer] Starting app, hash:', window.location.hash, 'isRecordButton:', isRecordButton);

const App = () => {
  if (isRecordButton) {
    // First try simple test component to verify rendering works
    console.log('[Renderer] Rendering record button test component');
    return <RecordButtonTest />;
    
    // Original code - will restore after testing
    // return (
    //   <ThemeProvider>
    //     <RecordButtonDock />
    //   </ThemeProvider>
    // );
  }

  // Main app UI needs ThemeProvider
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <WorkspaceManager />
      </ErrorBoundary>
    </ThemeProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);