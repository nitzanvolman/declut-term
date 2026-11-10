import type { ClientModule } from 'claude-code'

import type { Line, Pair, Post, SummaryProps } from '../types'

// The collapsed row: title, the arguments or command when shown, the ⎿ block
// (a live status until the result is summarized), the token line, and the
// hover card while the hooks module hands one. The whole region is the click
// area; the 1 s hover timer arms on the title line only, so reading the
// summary does not pop cards.
//
// No `dimColor` here: Claude Code brightens dim text across the whole hovered
// transcript item, so quiet text uses the theme's `inactive` colour instead.

const HOVER_MS = 1000
const WRITING_MS = 1500

type Track = { cancel?: () => void; down?: { x: number; y: number }; x: number; y: number }
type S = { hover: boolean; tick: number }

const tracks = new Map<string, Track>()
/** What each instance's clock needs: running since, or input last changed. */
const clocks = new Map<string, { since?: number; at?: number }>()

const elapsed = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

const pad = (s: string, w: number) => (w <= 0 ? '' : s.length >= w ? s : s + ' '.repeat(w - s.length))

const Summary: ClientModule<SummaryProps, S> = (props, surface) => {
  const { Box, Text } = surface.elements
  // Props from an older version of the mod can reach a new module across a
  // reload: read every field defensively rather than fail the whole row.
  const id = String(props?.id ?? '')
  const name = String(props?.name ?? '')
  const title = String(props?.title ?? '')
  const head: Pair[] = Array.isArray(props?.head) ? props.head : []
  const lw = Number(props?.lw) || 0
  const lines: Line[] = Array.isArray(props?.lines) ? props.lines : []
  const tokens = typeof props?.tokens === 'string' ? props.tokens : ''
  const hint = typeof props?.hint === 'string' ? props.hint : ''
  const card = props?.card != null && Array.isArray(props.card.body) ? props.card : null
  const glyph = props?.glyph ?? 'success'

  clocks.set(id, { ...(props?.since ? { since: props.since } : {}), ...(props?.pre ? { at: props.pre.at } : {}) })
  if (surface.state === undefined) {
    surface.every(1000, () => {
      const c = clocks.get(id)
      if (c === undefined) return
      const now = Date.now()
      const needs = c.since !== undefined || (c.at !== undefined && now - c.at < WRITING_MS + 1500)
      if (needs) surface.setState({ hover: surface.state?.hover ?? false, tick: now })
    })
    surface.setState({ hover: false, tick: 0 })
  }

  let t = tracks.get(id)
  if (t === undefined) {
    t = { x: -1, y: -1 }
    tracks.set(id, t)
  }
  const track = t
  const isShown = card !== null
  const send = (op: 'peek' | 'unpeek' | 'open') => surface.post({ op, id } satisfies Post)
  const stop = () => {
    track.cancel?.()
    track.cancel = undefined
  }
  const arm = (y: number) => {
    stop()
    if (y !== 0) return
    track.cancel = surface.every(HOVER_MS, () => {
      stop()
      send('peek')
    })
  }
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && (surface.columns === 0 || x < surface.columns) && (surface.rows === 0 || y < surface.rows)

  surface.onPointer(ev => {
    switch (ev.type) {
      case 'enter':
        track.x = ev.x
        track.y = ev.y
        surface.setState({ hover: true, tick: surface.state?.tick ?? 0 })
        arm(ev.y)
        break
      case 'move':
        if (ev.button !== undefined) break
        if (ev.x === track.x && ev.y === track.y) break
        track.x = ev.x
        track.y = ev.y
        if (isShown) send('unpeek')
        arm(ev.y)
        break
      case 'leave':
        stop()
        if (isShown) send('unpeek')
        surface.setState({ hover: false, tick: surface.state?.tick ?? 0 })
        break
      case 'down':
        if (ev.button === 'left') track.down = { x: ev.x, y: ev.y }
        stop()
        break
      case 'up': {
        // A click is a press and release on one cell; a drag opens nothing.
        const at = track.down
        track.down = undefined
        if (ev.button === 'left' && at !== undefined && at.x === ev.x && at.y === ev.y && inside(ev.x, ev.y)) {
          tracks.delete(id)
          send('open')
        }
        break
      }
    }
  })

  // The terminal's own pointer shape is out of a mod's reach, so the hover
  // cue is the title underlining while the pointer is anywhere on the row.
  const isHover = surface.state?.hover === true
  const now = Date.now()
  const first = (l: Line, n: number) => {
    if (n !== 0) return l.t
    if (props?.pre) return now - props.pre.at > WRITING_MS ? props.pre.waiting : props.pre.writing
    if (props?.since && now - props.since >= 2000) return `${l.t} ${elapsed(now - props.since)}`
    return l.t
  }
  const color = (k: Line['k']) =>
    k === 'summary' ? 'suggestion' : k === 'status' ? 'inactive' : k === 'fail' ? 'error' : undefined

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row">
        <Text color={glyph}>{'⏵ '}</Text>
        <Text weight="semibold" underline={isHover && title === ''}>
          {name}
        </Text>
        {title !== '' && <Text>{'('}</Text>}
        {title !== '' && (
          <Text color="suggestion" underline={isHover}>
            {title}
          </Text>
        )}
        {title !== '' && <Text>{')'}</Text>}
      </Box>
      {head.map(p => (
        <Box flexDirection="row">
          <Text>{'    '}</Text>
          {lw > 0 && <Text color="inactive">{`${pad(p.l, lw)}  `}</Text>}
          <Text color={lw > 0 ? undefined : 'inactive'}>{p.v}</Text>
        </Box>
      ))}
      {lines.map((l, n) => (
        <Box flexDirection="row">
          <Text color="inactive">{n === 0 ? '  ⎿  ' : '     '}</Text>
          <Text color={color(l.k)} italic={l.k === 'summary'}>
            {first(l, n)}
          </Text>
          {l.tail !== undefined && l.tail !== '' && <Text color="inactive">{`  ${l.tail}`}</Text>}
        </Box>
      ))}
      {tokens !== '' && <Text color="inactive">{`     ${tokens}`}</Text>}
      {hint !== '' && <Text color="inactive">{`     ${hint}`}</Text>}
      {card !== null && (
        <Box
          flexDirection="column"
          marginLeft={2}
          width={card.width}
          borderStyle="round"
          borderColor="bashBorder"
          paddingX={1}
        >
          <Text weight="semibold">{card.title}</Text>
          {card.cmd.map(l => (
            <Text color="bashBorder">{l}</Text>
          ))}
          {card.args.map(p => (
            <Box flexDirection="row">
              {card.lw > 0 && <Text color="inactive">{`${pad(p.l, card.lw)}  `}</Text>}
              <Text>{p.v === '' ? ' ' : p.v}</Text>
            </Box>
          ))}
          <Text color="inactive">{'─'.repeat(Math.max(1, card.width - 4))}</Text>
          {card.body.map(p => (
            <Box flexDirection="row">
              {card.lw > 0 && <Text color="inactive">{`${pad(p.l, card.lw)}  `}</Text>}
              <Text>{p.v === '' ? ' ' : p.v}</Text>
            </Box>
          ))}
          {card.more !== '' && <Text color="inactive">{card.more}</Text>}
        </Box>
      )}
    </Box>
  )
}

export default Summary
