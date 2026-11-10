import type { ClientModule } from 'claude-code'

import type { GroupItem, GroupProps, Post } from '../types'

// A run of reads, searches and listings: the group's own line, then one line
// per call with what it read or found. A click on a call's line opens that
// call's row (the group unfolds into rows around it; folding it folds back).

type S = { over: number }

const downs = new Map<string, { x: number; y: number }>()

const pad = (s: string, w: number) => (s.length >= w ? `${s.slice(0, Math.max(1, w - 1))}…` : s + ' '.repeat(w - s.length))
const clip = (s: string, w: number) => (s.length > w ? `${s.slice(0, Math.max(1, w - 1))}…` : s)

const Group: ClientModule<GroupProps, S> = (props, surface) => {
  const { Box, Text } = surface.elements
  const items: GroupItem[] = Array.isArray(props?.items) ? props.items : []
  const cols = surface.columns > 0 ? surface.columns : Number(props?.cols) || 100
  const narrow = cols < 80
  const per = narrow ? 2 : 1
  const nameW = Math.max(8, Number(props?.nameWidth) || 20)
  const key = items[0]?.id ?? 'group'
  const at = (y: number) => (y < 1 ? -1 : Math.floor((y - 1) / per))

  surface.onPointer(ev => {
    switch (ev.type) {
      case 'enter':
      case 'move':
        if (ev.button === undefined && at(ev.y) !== surface.state?.over) surface.setState({ over: at(ev.y) })
        break
      case 'leave':
        surface.setState({ over: -1 })
        break
      case 'down':
        if (ev.button === 'left') downs.set(key, { x: ev.x, y: ev.y })
        break
      case 'up': {
        const d = downs.get(key)
        downs.delete(key)
        const item = items[at(ev.y)]
        if (ev.button === 'left' && d !== undefined && d.x === ev.x && d.y === ev.y && item !== undefined)
          surface.post({ op: 'open', id: item.id } satisfies Post)
        break
      }
    }
  })

  const over = surface.state?.over ?? -1
  const color = (k: GroupItem['k']) =>
    k === 'summary' ? 'suggestion' : k === 'status' ? 'inactive' : k === 'fail' ? 'error' : undefined
  const gistW = narrow ? cols - 9 : Math.max(10, cols - 7 - nameW - 2)

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row">
        <Text color={props?.glyph ?? 'success'}>{'⏵ '}</Text>
        <Text weight="semibold">{String(props?.head ?? '')}</Text>
        {props?.tokens ? <Text color="inactive">{`  ·  ${props.tokens}`}</Text> : null}
      </Box>
      {items.map((it, n) =>
        narrow ? (
          <Box flexDirection="column">
            <Box flexDirection="row">
              <Text color="inactive">{n === 0 ? '  ⎿  ' : '     '}</Text>
              <Text underline={over === n}>{clip(it.name, cols - 7)}</Text>
            </Box>
            <Box flexDirection="row">
              <Text>{'       '}</Text>
              <Text color={color(it.k)} italic={it.k === 'summary'}>
                {clip(it.gist, gistW)}
              </Text>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="row">
            <Text color="inactive">{n === 0 ? '  ⎿  ' : '     '}</Text>
            <Text underline={over === n}>{pad(it.name, nameW)}</Text>
            <Text>{'  '}</Text>
            <Text color={color(it.k)} italic={it.k === 'summary'}>
              {clip(it.gist, gistW)}
            </Text>
          </Box>
        ),
      )}
    </Box>
  )
}

export default Group
