import type { ClientModule } from 'claude-code'

import type { Post, SetRow, SettingsProps } from '../types'

// The settings pane: one row per level (defaults, built-in, each tool, each
// MCP server and, opened, its tools), a column per class of call, and a
// "counts as" column. Click a value to cycle it; click a server's name to list
// its tools. Once a click has given the pane the focus, the keyboard works
// too: ↑↓ rows, ←→ columns, enter or space to change, r to reset a row.

type S = { sel: number; col: number }

const COL = 21
const AS_W = 12
const FIELDS = ['label', 'ro', 'rw', 'as'] as const

const pad = (s: string, w: number) => (s.length >= w ? `${s.slice(0, Math.max(1, w - 1))}…` : s + ' '.repeat(w - s.length))

let down: { x: number; y: number } | undefined

const Settings: ClientModule<SettingsProps, S> = (props, surface) => {
  const { Box, Text } = surface.elements
  const rows: SetRow[] = Array.isArray(props?.rows) ? props.rows : []
  const cols = surface.columns > 0 ? surface.columns : Number(props?.cols) || 100
  const longest = Math.max(16, ...rows.map(r => r.depth * 2 + r.label.length + 2))
  const LW = Math.max(16, Math.min(longest + 1, cols - 2 * COL - AS_W - 2))
  const actionable = (r: SetRow | undefined) => r !== undefined && r.key !== '' && r.fixed === ''
  const sel = surface.state?.sel ?? -1
  const col = surface.state?.col ?? 1

  const act = (n: number, field: (typeof FIELDS)[number]) => {
    const r = rows[n]
    if (!actionable(r) || r === undefined) return
    if (field === 'label') {
      if (r.key.startsWith('server:')) surface.post({ op: 'toggle', key: r.key } satisfies Post)
      return
    }
    if (field === 'as' && (r.as === '' || r.key === 'defaults')) return
    if ((field === 'ro' && r.ro === '—') || (field === 'rw' && r.rw === '—')) return
    surface.post({ op: 'cycle', key: r.key, field } satisfies Post)
  }
  const fieldAt = (x: number) => (x < LW ? 'label' : x < LW + COL ? 'ro' : x < LW + 2 * COL ? 'rw' : 'as')

  surface.onPointer(ev => {
    if (ev.type === 'down' && ev.button === 'left') down = { x: ev.x, y: ev.y }
    if (ev.type !== 'up' || ev.button !== 'left') return
    const d = down
    down = undefined
    if (d === undefined || d.x !== ev.x || d.y !== ev.y) return
    const n = ev.y - 1
    const field = fieldAt(ev.x)
    surface.setState({ sel: n, col: FIELDS.indexOf(field) })
    act(n, field)
  })

  surface.onKey(ev => {
    const move = (dir: 1 | -1) => {
      let n = sel
      for (let k = 0; k < rows.length; k++) {
        n = (n + dir + rows.length) % rows.length
        if (actionable(rows[n])) break
      }
      surface.setState({ sel: n, col })
    }
    if (ev.key === 'up') move(-1)
    else if (ev.key === 'down') move(1)
    else if (ev.key === 'left') surface.setState({ sel, col: Math.max(0, col - 1) })
    else if (ev.key === 'right') surface.setState({ sel, col: Math.min(3, col + 1) })
    else if (ev.key === 'return' || ev.key === ' ' || ev.key === 'space') act(sel, FIELDS[col] ?? 'ro')
    else if (ev.key === 'r') {
      const r = rows[sel]
      if (actionable(r) && r !== undefined && r.key !== 'defaults') surface.post({ op: 'reset', key: r.key } satisfies Post)
    }
  })

  const cell = (n: number, c: number, text: string, w: number, quiet: boolean) => (
    <Text
      color={quiet ? 'inactive' : undefined}
      underline={n === sel && c === col}
      weight={n === sel && c === col ? 'semibold' : undefined}
    >
      {pad(text, w)}
    </Text>
  )

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row">
        <Text color="inactive">{pad('', LW)}</Text>
        <Text weight="semibold">{pad('read-only', COL)}</Text>
        <Text weight="semibold">{pad('may change something', COL)}</Text>
        <Text weight="semibold">{pad('counts as', AS_W)}</Text>
      </Box>
      {rows.map((r, n) => {
        const indent = '  '.repeat(r.depth)
        const mark = r.open === undefined ? '' : r.open ? '▾ ' : '▸ '
        const label = `${indent}${mark}${r.label}`
        if (r.key === '' && r.fixed === '')
          return (
            <Box flexDirection="row">
              <Text weight="semibold">{pad(label, LW)}</Text>
            </Box>
          )
        if (r.fixed !== '')
          return (
            <Box flexDirection="row">
              <Text color="inactive">{pad(label, LW)}</Text>
              <Text color="inactive">{r.fixed}</Text>
            </Box>
          )
        return (
          <Box flexDirection="row">
            {cell(n, 0, label, LW, false)}
            {cell(n, 1, r.ro, COL, r.ro === '·' || r.ro === '—')}
            {cell(n, 2, r.rw, COL, r.rw === '·' || r.rw === '—')}
            {cell(n, 3, r.as, AS_W, r.as === '·' || r.as === '')}
          </Box>
        )
      })}
      <Text>{' '}</Text>
      <Text color="inactive">{String(props?.note ?? '')}</Text>
    </Box>
  )
}

export default Settings
