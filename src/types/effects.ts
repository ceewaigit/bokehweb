export enum EffectLayerType {
  Zoom = 'zoom',
  Cursor = 'cursor',
  Background = 'background',
  Screen = 'screen',
}

export type SelectedEffectLayer = { type: EffectLayerType; id?: string } | null

export type EffectType = 'zoom' | 'cursor' | 'keystroke' | 'background' | 'annotation' | 'screen' 