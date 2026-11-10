import type { ClientModule } from 'claude-code'

import type { FoldProps, Post } from '../types'

// The open row, below its top blank line, laid over Claude Code's own row: it
// draws only the ⏷ over the status dot and lets the row show through, but the
// whole region takes the pointer. A click (press and release on one cell)
// anywhere on it folds the row back; no click on it reaches the transcript's
// own click-to-expand.

const downs = new Map<string, { x: number; y: number }>()

const Fold: ClientModule<FoldProps, { hover: boolean }> = (props, surface) => {
  const { Box, Text } = surface.elements
  const id = String(props?.id ?? '')

  surface.onPointer(ev => {
    switch (ev.type) {
      case 'enter':
        surface.setState({ hover: true })
        break
      case 'leave':
        surface.setState({ hover: false })
        break
      case 'down':
        if (ev.button === 'left') downs.set(id, { x: ev.x, y: ev.y })
        break
      case 'up': {
        const at = downs.get(id)
        downs.delete(id)
        if (ev.button === 'left' && at !== undefined && at.x === ev.x && at.y === ev.y) {
          surface.post({ op: 'close', id } satisfies Post)
        }
        break
      }
    }
  })

  // Coloured as the status dot it covers; underlined while the pointer is on
  // the row (the terminal's own pointer shape is out of a mod's reach).
  const isHover = surface.state?.hover === true
  return (
    <Box flexDirection="column" width="100%">
      <Text color={props?.glyph ?? 'success'} underline={isHover}>
        {'⏷'}
      </Text>
    </Box>
  )
}

export default Fold
