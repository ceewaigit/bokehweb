import React from 'react';
import ReactDOM from 'react-dom/client';
import { RecordButtonDock } from './components/record-button-dock';
import { WorkspaceManager } from './components/workspace/workspace-manager';
import { ThemeProvider } from './contexts/theme-context';
import { ErrorBoundary } from './components/error-boundary';
import { PermissionGuard } from './components/permission-guard';
import './app/globals.css';

// Check if we're loading the record button based on the URL hash
const isRecordButton = window.location.hash === '#/record-button';

const App = () => {
  if (isRecordButton) {
    // Record button needs ThemeProvider to access design tokens
    return (
      <ThemeProvider>
        <RecordButtonDock />
      </ThemeProvider>
    );
  }

  // Main app UI needs ThemeProvider
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <PermissionGuard>
          <WorkspaceManager />
        </PermissionGuard>
      </ErrorBoundary>
    </ThemeProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);