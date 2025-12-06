import React from 'react';
import ReactDOM from 'react-dom/client';
import { RecordButtonDock } from './components/record-button-dock';
import { WorkspaceManager } from './components/workspace/workspace-manager';
import AreaSelectionPage from './app/area-selection/page';
import { ThemeProvider } from './contexts/theme-context';
import { ErrorBoundary } from './components/error-boundary';
import { PermissionGuard } from './components/permission-guard';
import './app/globals.css';

// Check route based on URL hash
const hash = window.location.hash;
const isRecordButton = hash === '#/record-button';
const isAreaSelection = hash === '#/area-selection';

const App = () => {
  if (isRecordButton) {
    // Record button needs ThemeProvider to access design tokens
    return (
      <ThemeProvider>
        <RecordButtonDock />
      </ThemeProvider>
    );
  }

  if (isAreaSelection) {
    // Area selection is a fullscreen transparent overlay
    // No ThemeProvider needed as it uses inline styles
    return <AreaSelectionPage />;
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