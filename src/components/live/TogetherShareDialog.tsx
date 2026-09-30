import { useCallback, useMemo } from 'react'
import type { TogetherShare } from '../../lib/live/link'
import { renderTogetherCard } from '../../lib/live/togetherCard'
import { togetherAlt, togetherText } from '../../lib/live/togetherShare'
import { CARD_HEIGHT, CARD_WIDTH } from '../../lib/shareCard'
import { Dialog } from '../Dialog'
import { ShareSheet } from '../ShareDialog'

/** Share a round planked together: one card and one text for the whole room. */
export function TogetherShareDialog({ share, onClose }: { share: TogetherShare | null; onClose: () => void }) {
  return (
    <Dialog open={share !== null} title="Share it together" onClose={onClose}>
      {share && <TogetherShareSheet share={share} />}
    </Dialog>
  )
}

function TogetherShareSheet({ share }: { share: TogetherShare }) {
  const render = useCallback(() => renderTogetherCard(share), [share])
  const text = useMemo(() => togetherText(share), [share])
  return (
    <ShareSheet
      render={render}
      fileName={`plank-to-taylor-together-${share.day}.png`}
      alt={togetherAlt(share)}
      width={CARD_WIDTH}
      height={CARD_HEIGHT}
      text={text}
    />
  )
}
