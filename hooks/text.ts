// Pure text helpers: sanitizing, terminal cell widths, clipping and wrapping,
// humanized names, the label/value layout of arguments and results, secret
// masking, and pulling text out of a tool's stored result. No engine calls.

import type { Pair } from '../types'

// ---------------------------------------------------------------------------
// Sanitizing. Everything shown or sent passes through here.

const ANSI = /(\u001b\[|\u009b)[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)|\u001b[@-Z\\-_]/g
// C0 (but \n), DEL, C1 (which holds CSI U+009B), bidi marks, embeddings,
// overrides and isolates, zero-width characters and the BOM.
const HIDDEN = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g

export const sane = (s: string) =>
  s
    .replace(ANSI, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(/\t/g, '  ')
    .replace(HIDDEN, '')

// ---------------------------------------------------------------------------
// Terminal cell widths: wide (East Asian, emoji) take two cells, combining
// marks none, so Hebrew points and CJK never overflow a row's height.

const COMBINING = /[\p{Mn}\p{Me}]/u

const cp = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0
  if (COMBINING.test(ch)) return 0
  if (
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf && c !== 0x303f) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe4f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) ||
    (c >= 0x1f300 && c <= 0x1faff) ||
    (c >= 0x20000 && c <= 0x3fffd)
  )
    return 2
  return 1
}

export const cells = (s: string) => {
  let n = 0
  for (const ch of s) n += cp(ch)
  return n
}

/** The longest prefix of `s` that fits in `w` cells. */
const fitStart = (s: string, w: number) => {
  let n = 0
  let out = ''
  for (const ch of s) {
    const k = cp(ch)
    if (n + k > w) break
    n += k
    out += ch
  }
  return out
}

/** The longest suffix of `s` that fits in `w` cells. */
const fitEnd = (s: string, w: number) => {
  const chars = [...s]
  let n = 0
  let i = chars.length
  while (i > 0) {
    const k = cp(chars[i - 1] ?? '')
    if (n + k > w) break
    n += k
    i--
  }
  return chars.slice(i).join('')
}

export const clipEnd = (s: string, w: number) =>
  cells(s) <= w ? s : `${fitStart(s, Math.max(1, w - 1))}…`

/** Keeps the start and the end: paths keep their filename, URLs their host. */
export const clipMiddle = (s: string, w: number) => {
  if (cells(s) <= w) return s
  const room = Math.max(2, w - 1)
  const tail = Math.ceil(room * 0.55)
  return `${fitStart(s, room - tail)}…${fitEnd(s, tail)}`
}

/** Word-wraps to `width` cells; past `maxLines`, the last line ends in `…`. */
export const wrap = (text: string, width: number, maxLines = Infinity) => {
  const w = Math.max(8, width)
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let cur = ''
    let curW = 0
    for (let word of para.split(/ +/).filter(Boolean)) {
      while (cells(word) > w) {
        if (cur !== '') lines.push(cur)
        const head = fitStart(word, w)
        lines.push(head)
        word = word.slice(head.length)
        cur = ''
        curW = 0
      }
      const ww = cells(word)
      if (cur === '') {
        cur = word
        curW = ww
      } else if (curW + 1 + ww <= w) {
        cur += ` ${word}`
        curW += 1 + ww
      } else {
        lines.push(cur)
        cur = word
        curW = ww
      }
    }
    lines.push(cur)
  }
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = `${clipEnd(kept[maxLines - 1] ?? '', w - 1)}…`.replace(/……$/, '…')
  return kept
}

// ---------------------------------------------------------------------------
// Numbers.

export const num = (n: number) => Math.round(n).toLocaleString('en-US')
export const tok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`)
export const estimate = (chars: number) => Math.ceil(chars / 3)

export const dur = (ms: number) => {
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return s === 0 ? `${m}m` : `${m}m ${String(s).padStart(2, '0')}s`
}

export const bytes = (n: number) =>
  n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`

// ---------------------------------------------------------------------------
// Names.

/** `mcp__<server>__<tool>`, split; undefined for a built-in. */
export const splitMcp = (name: string) => {
  const m = /^mcp__(.+?)__(.+)$/.exec(name)
  return m ? { server: m[1] ?? '', tool: m[2] ?? '' } : undefined
}

const words = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .filter(Boolean)

export const humanKey = (k: string) => words(k).join(' ').toLowerCase()

// Display names only; any other server is title-cased from its own name.
const SERVER_NAMES: Record<string, string> = {
  whatsapp: 'WhatsApp',
  'google-workspace': 'Google Workspace',
  'claude-in-chrome': 'Chrome',
  github: 'GitHub',
  linkedin: 'LinkedIn',
}

export const humanServer = (server: string) => {
  let s = server.replace(/^claude_ai_/, '')
  const plugin = /^plugin_([^_]+)_(.+)$/.exec(s)
  if (plugin) s = plugin[2] ?? s
  const known = SERVER_NAMES[s.toLowerCase()]
  if (known) return known
  return words(s)
    .map(w => (w.length <= 2 ? w.toUpperCase() : w[0]?.toUpperCase() + w.slice(1)))
    .join(' ')
}

/** A tool's words, dropping those that repeat the server's (`browser_click` on Playwright → click). */
export const humanTool = (server: string, tool: string) => {
  const sw = new Set(words(humanServer(server)).map(w => w.toLowerCase()))
  sw.add('browser')
  sw.add('mcp')
  const ws = words(tool).map(w => w.toLowerCase())
  const kept = ws.filter(w => !sw.has(w))
  return (kept.length > 0 ? kept : ws).join(' ')
}

/** What the row calls the tool: `Bash`, `Read`, `WhatsApp send text`. */
export const displayName = (name: string) => {
  const m = splitMcp(name)
  return m ? `${humanServer(m.server)} ${humanTool(m.server, m.tool)}` : name
}

export const relPath = (p: string, root: string | undefined) => {
  if (root && p.startsWith(`${root}/`)) return p.slice(root.length + 1)
  return p
}

// ---------------------------------------------------------------------------
// Secrets: whole key names, and value patterns. An on-screen courtesy; the
// engine's own open row shows the same values.

const SECRET_KEYS = new Set([
  'token', 'access token', 'refresh token', 'id token', 'auth token', 'bearer token',
  'session token', 'secret', 'client secret', 'password', 'passwd', 'passphrase',
  'authorization', 'cookie', 'api key', 'apikey', 'private key', 'access key',
  'secret key', 'credentials',
])

export const isSecretKey = (k: string) => {
  const h = humanKey(k)
  return SECRET_KEYS.has(h) || / (secret|password)$/.test(h)
}

const SECRET_VALUES: [RegExp, string][] = [
  [/\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{12,}/gi, '$1 ••••'],
  [/\b(sk|rk|pk)-[A-Za-z0-9_-]{16,}/g, '$1-••••'],
  [/\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{16,}/g, '$1_••••'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, 'xox-••••'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA••••'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '••••'],
  [/(\/\/[^/\s:@]+):[^/\s@]+@/g, '$1:••••@'],
  [/([?&](?:access_token|token|api_key|apikey|key|sig|signature|password)=)[^&\s#]+/gi, '$1••••'],
]

export const maskValue = (s: string) => SECRET_VALUES.reduce((acc, [re, to]) => acc.replace(re, to), s)

// ---------------------------------------------------------------------------
// Pulling text out of a stored result, bounded: whatever the tool returned,
// the row costs the same on every redraw.

export const BOUND = 20_000

export type Extract = { text: string; len: number; images: number; lines: number; json?: unknown }

const countLines = (s: string) => {
  if (s === '') return 0
  let n = 1
  for (let i = s.indexOf('\n'); i !== -1; i = s.indexOf('\n', i + 1)) n++
  return s.endsWith('\n') ? n - 1 : n
}

const blocks = (arr: readonly unknown[]) => {
  let text = ''
  let images = 0
  for (const b of arr) {
    if (typeof b === 'string') text += (text ? '\n' : '') + b
    else if (b && typeof b === 'object') {
      const o = b as Record<string, unknown>
      if (o.type === 'text' && typeof o.text === 'string') text += (text ? '\n' : '') + o.text
      else if (o.type === 'image' || o.type === 'document') images++
    }
  }
  return { text, images }
}

const asJson = (s: string) => {
  const t = s.trim()
  if (t.length > BOUND || !(t.startsWith('{') || t.startsWith('['))) return undefined
  try {
    return JSON.parse(t) as unknown
  } catch {
    return undefined
  }
}

export const extract = (tool: string, output: unknown): Extract => {
  let full = ''
  let images = 0
  if (typeof output === 'string') full = output
  else if (Array.isArray(output)) ({ text: full, images } = blocks(output))
  else if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>
    if (tool === 'Bash') {
      full = `${o.stdout ?? ''}${o.stderr ? `${o.stdout ? '\n' : ''}${o.stderr}` : ''}`
      if (o.isImage === true) images = 1
    } else if (tool === 'Read') {
      const f = (o.file ?? {}) as Record<string, unknown>
      if (o.type === 'text' && typeof f.content === 'string') full = f.content
      else if (o.type === 'notebook') full = JSON.stringify(f.cells ?? '').slice(0, BOUND)
      else images = 1
    } else if (tool === 'WebFetch' && typeof o.result === 'string') full = o.result
    else if (tool === 'WebSearch' && Array.isArray(o.results)) {
      full = (o.results as unknown[])
        .map(r =>
          typeof r === 'string'
            ? r
            : Array.isArray((r as { content?: unknown }).content)
              ? ((r as { content: { title?: string; url?: string }[] }).content)
                  .map(c => `${c.title ?? ''} ${c.url ?? ''}`)
                  .join('\n')
              : '',
        )
        .join('\n')
    } else if (Array.isArray(o.content)) ({ text: full, images } = blocks(o.content))
    else {
      try {
        full = JSON.stringify(output).slice(0, BOUND)
      } catch {
        full = ''
      }
    }
  }
  const len = full.length
  const text = sane(full.slice(0, BOUND))
  return { text, len, images, lines: countLines(text), json: asJson(text) }
}

/** The first non-empty line, and how many lines follow it. */
export const firstLine = (text: string) => {
  const ls = text.split('\n')
  const i = ls.findIndex(l => l.trim() !== '')
  if (i === -1) return { line: '', more: 0 }
  const rest = ls.slice(i + 1)
  while (rest.length > 0 && rest[rest.length - 1]?.trim() === '') rest.pop()
  return { line: (ls[i] ?? '').trim(), more: rest.length }
}

// ---------------------------------------------------------------------------
// The label/value layout: arguments and JSON results for people, never JSON.

const isEpochKey = (k: string) => /(^|\s)(time|timestamp|date|at|created|updated|modified)$/.test(humanKey(k))

const scalar = (k: string, v: unknown): string | undefined => {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number') {
    if (isEpochKey(k) && v > 1e9 && v < 4e12) {
      const d = new Date(v < 1e11 ? v * 1000 : v)
      return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`
    }
    return String(v)
  }
  if (typeof v === 'string') return isSecretKey(k) ? '••••' : maskValue(sane(v))
  return undefined
}

export type LayoutOpts = { width: number; maxLines: number; maxValueLines: number }

/** Lays `value` out as label/value lines; returns the lines and the label column width. */
export const layout = (value: unknown, o: LayoutOpts): { pairs: Pair[]; lw: number } => {
  const narrow = o.width < 60
  const entries = (v: unknown): [string, unknown][] =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v as Record<string, unknown>) : [['value', v]]
  const top = entries(value)
  const lw = narrow ? 0 : Math.min(14, Math.max(4, ...top.map(([k]) => cells(humanKey(k)))))
  const valW = Math.max(12, narrow ? o.width - 2 : o.width - lw - 2)
  const out: Pair[] = []

  const push = (label: string, text: string, depth: number) => {
    const pad = '  '.repeat(depth)
    const w = Math.max(10, valW - pad.length)
    const ls = wrap(text, w, o.maxValueLines)
    if (narrow) {
      out.push({ l: '', v: `${pad}${label}` })
      for (const l of ls) out.push({ l: '', v: `${pad}  ${l}` })
      return
    }
    ls.forEach((l, i) => out.push({ l: i === 0 ? clipEnd(`${pad}${label}`, lw) : '', v: l }))
  }

  const walk = (k: string, v: unknown, depth: number) => {
    const label = humanKey(k) || k
    const s = scalar(k, v)
    if (s !== undefined) return push(label, s, depth)
    if (v === null || v === undefined || v === '') return
    if (depth >= 3) return push(label, '…', depth)
    if (Array.isArray(v)) {
      if (v.length === 0) return
      if (v.every(x => typeof x !== 'object' || x === null)) {
        const items = v.map(x => scalar(k, x) ?? '').filter(Boolean)
        const joined = items.join(', ')
        if (cells(joined) <= valW) return push(label, joined, depth)
        push(label, '', depth)
        items.slice(0, 5).forEach(x => push('•', x, depth + 1))
        if (items.length > 5) push('', `… and ${items.length - 5} more`, depth + 1)
        return
      }
      push(label, `${v.length} item${v.length === 1 ? '' : 's'}`, depth)
      v.slice(0, 5).forEach((x, i) => {
        if (x && typeof x === 'object') {
          push(`• ${i + 1}`, '', depth + 1)
          for (const [ck, cv] of Object.entries(x as Record<string, unknown>)) walk(ck, cv, depth + 2)
        } else push('•', String(x), depth + 1)
      })
      if (v.length > 5) push('', `… and ${v.length - 5} more`, depth + 1)
      return
    }
    if (typeof v === 'object') {
      push(label, '', depth)
      for (const [ck, cv] of Object.entries(v as Record<string, unknown>)) walk(ck, cv, depth + 1)
    }
  }

  for (const [k, v] of top) walk(k, v, 0)
  if (out.length > o.maxLines) {
    const shown = out.slice(0, Math.max(1, o.maxLines - 1))
    shown.push({ l: '', v: `… ${out.length - shown.length} more lines · click to open` })
    return { pairs: shown, lw }
  }
  return { pairs: out, lw }
}

/** Arguments as plain `label: value` text, for Haiku's prompt (masked). */
export const argsText = (input: unknown) =>
  layout(input, { width: 200, maxLines: 40, maxValueLines: 6 })
    .pairs.map(p => (p.l ? `${p.l.trim()}: ${p.v}` : `  ${p.v}`))
    .join('\n')

// ---------------------------------------------------------------------------
// The title's arguments: scalar values in order, by kind, within a budget.

const valueForTitle = (k: string, v: unknown, room: number): string | undefined => {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'boolean') return `${humanKey(k)} ${v ? 'yes' : 'no'}`
  if (typeof v === 'number') return `${humanKey(k)} ${v}`
  if (typeof v !== 'string') return undefined
  if (isSecretKey(k)) return `${humanKey(k)} ••••`
  const s = maskValue(sane(v)).replace(/\s*\n\s*/g, ' ⏎ ').trim()
  if (s === '') return undefined
  if (/^[a-z]+:\/\//i.test(s) || /^[~./]/.test(s) || (/\//.test(s) && !/\s/.test(s))) return clipMiddle(s, room)
  if (!/\s/.test(s)) return cells(s) > 28 ? clipMiddle(s, Math.min(room, 24)) : s
  return `"${clipEnd(s, Math.max(6, room - 2))}"`
}

export const titleArgs = (input: unknown, budget: number) => {
  if (!input || typeof input !== 'object') return ''
  const parts: string[] = []
  let used = 0
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const room = budget - used - (parts.length > 0 ? 2 : 0)
    if (room < 6) {
      parts.push('…')
      break
    }
    const s = valueForTitle(k, v, room)
    if (s === undefined) continue
    parts.push(s)
    used += cells(s) + (parts.length > 1 ? 2 : 0)
  }
  return parts.join(', ')
}
