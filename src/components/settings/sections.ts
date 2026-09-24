import type { ComponentType } from 'react'
import type { IconName } from '../Icon'
import { AppearanceSettings } from './AppearanceSettings'
import { PlankSettings } from './PlankSettings'

export interface SettingsSection {
  /** Its address: #settings/<id>. Keep it once shipped, since people bookmark and share them. */
  id: string
  label: string
  /** A few words under the label in the settings menu. */
  summary: string
  icon: IconName
  Content: ComponentType
}

// The settings menu, in order. A new section is an entry here and a component for its content;
// moving one is moving its entry.
export const SECTIONS: SettingsSection[] = [
  { id: 'appearance', label: 'Appearance', summary: 'Theme and colors', icon: 'palette', Content: AppearanceSettings },
  { id: 'plank', label: 'Plank', summary: 'Aurora lights', icon: 'sparkles', Content: PlankSettings },
]
