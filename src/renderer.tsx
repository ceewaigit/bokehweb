import React from 'react';
import ReactDOM from 'react-dom/client';
import { RecordButtonDock } from './components/record-button-dock';
import { WorkspaceManager } from './components/workspace/workspace-manager';
import { ThemeProvider } from './contexts/theme-context';
import { ErrorBoundary } from './components/error-boundary';
import './app/globals.css';

// Check if we're loading the record button based on the URL hash
const isRecordButton = window.location.hash === '#/record-button';

const App = () => {
  if (isRecordButton) {
    // Record button renders as minimal component without any wrappers
    return <RecordButtonDock />;
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