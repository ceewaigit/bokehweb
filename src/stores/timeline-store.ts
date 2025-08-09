/**
 * Timeline store - Now redirects to project-store
 * This file is kept for backward compatibility
 */

// Re-export everything from project-store with aliases
export { useProjectStore as useTimelineStore } from './project-store'

// For components that need the store directly
export { useProjectStore } from './project-store'