import type { ComponentType } from 'react'
import type { IconName } from '../Icon'
import { accountsEnabled } from '../../lib/account'
import { remindersAvailable } from '../../lib/push'
import { AppearanceSettings } from './AppearanceSettings'
import { DiscordSettings } from './DiscordSettings'
import { PlankSettings } from './PlankSettings'
import { ReminderSettings } from './ReminderSettings'

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
  // Only on a site with reminders set up (see "Daily reminders" in the README).
  ...(remindersAvailable
    ? [{ id: 'reminders', label: 'Reminders', summary: 'A nudge to plank each day', icon: 'bell' as const, Content: ReminderSettings }]
    : []),
  // Only on a site with accounts (see "The Discord daily post" in the README). #discord opens it too.
  ...(accountsEnabled
    ? [{ id: 'discord', label: 'Discord', summary: 'A daily post in your server', icon: 'message' as const, Content: DiscordSettings }]
    : []),
]
