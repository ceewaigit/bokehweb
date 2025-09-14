// Enum for all effect types - single source of truth
export enum EffectType {
  Zoom = 'zoom',
  Cursor = 'cursor',
  Keystroke = 'keystroke',
  Background = 'background',
  Annotation = 'annotation',
  Screen = 'screen'
}

// Enum for effect layer types (subset of effects that appear in the sidebar)
export enum EffectLayerType {
  Zoom = 'zoom',
  Cursor = 'cursor',
  Background = 'background',
  Screen = 'screen',
}

export type SelectedEffectLayer = { type: EffectLayerType; id?: string } | null 