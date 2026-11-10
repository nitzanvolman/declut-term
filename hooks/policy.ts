// Pure policy: which calls the mod leaves alone, which mode a call is drawn in,
// and what each row says at every moment. No engine calls.

import type { CountsAs, Glyph, GroupItem, Line, Mode, Pair, Row, Rule, Rules } from '../types'
import {
  bytes,
  cells,
  clipEnd,
  clipMiddle,
  displayName,
  dur,
  estimate,
  type Extract,
  firstLine,
  layout,
  maskValue,
  num,
  relPath,
  sane,
  splitMcp,
  titleArgs,
  tok,
  wrap,
} from './text'

export const MIN_CHARS = 200
export const SUB_LINES = 3
export const HEAD = 4000
export const TAIL = 2000

// ---------------------------------------------------------------------------
// Modes and rules.

export const MODE_LABEL: Record<Mode, string> = {
  summary: 'Summary',
  args: 'Summary + arguments',
  compact: 'Compact',
  off: 'Off',
}
export const MODES: Mode[] = ['summary', 'args', 'compact', 'off']
export const modeOf = (label: unknown, fallback: Mode): Mode =>
  MODES.find(m => MODE_LABEL[m] === label) ?? fallback

export const AS_LABEL: Record<CountsAs, string> = {
  declared: 'as declared',
  'read-only': 'read-only',
  write: 'may change',
}
export const AS_ORDER: CountsAs[] = ['declared', 'read-only', 'write']

export type Defaults = { ro: Mode; rw: Mode }

/** The rule keys that apply to a tool, most specific first. */
export const targets = (tool: string) => {
  const m = splitMcp(tool)
  return [`tool:${tool}`, m ? `server:${m.server}` : 'builtin']
}

/** The class a call counts as, and the mode it is drawn in. */
export const resolve = (rules: Rules, d: Defaults, tool: string, declaredRO: boolean | undefined) => {
  const [toolKey = '', groupKey = ''] = targets(tool)
  const t: Rule = rules[toolKey] ?? {}
  const g: Rule = rules[groupKey] ?? {}
  const as: CountsAs = t.as ?? g.as ?? 'declared'
  const isRO = as === 'declared' ? declaredRO === true : as === 'read-only'
  const cls = isRO ? 'ro' : 'rw'
  const mode: Mode = t[cls] ?? g[cls] ?? d[cls]
  return { cls, mode, as, isRO } as const
}

// ---------------------------------------------------------------------------
// What the mod never takes over, whatever the rules say.

const FIXED: Record<string, string> = {
  Edit: 'the diff is what you review',
  Write: 'the diff is what you review',
  NotebookEdit: 'the diff is what you review',
  AskUserQuestion: 'your decisions',
  EnterPlanMode: 'your decisions',
  ExitPlanMode: 'your decisions',
  ReportFindings: 'drawn by the host',
  EndConversation: 'your decisions',
  SendUserMessage: 'addressed to you',
  SendUserFile: 'addressed to you',
  PushNotification: 'addressed to you',
  ProposeGoal: 'addressed to you',
  WrapUp: 'addressed to you',
  Agent: 'runs in the background',
  Workflow: 'runs in the background',
  Monitor: 'runs in the background',
}

export const fixedReason = (tool: string): string | undefined =>
  FIXED[tool] ?? (/^(Suggest|Show|Offer)[A-Z]/.test(tool) ? 'addressed to you' : undefined)

/** A call the input already rules out. */
export const inputExcluded = (tool: string, input: unknown) => {
  const i = (input ?? {}) as Record<string, unknown>
  if (tool === 'Bash' && i.run_in_background === true) return 'runs in the background'
  return undefined
}

/** A result with nothing to summarize or count. */
export const outputExcluded = (tool: string, output: unknown, ext: Extract) => {
  const o = (output && typeof output === 'object' ? output : {}) as Record<string, unknown>
  if (tool === 'Skill' && o.background === true) return 'runs in the background'
  if (ext.images > 0 && ext.text.trim() === '') return 'image result'
  return undefined
}

// ---------------------------------------------------------------------------
// Wording.

const host = (url: unknown) => {
  if (typeof url !== 'string') return ''
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(url)
  return m?.[1] ?? ''
}

export const statusWords = (tool: string, input: unknown) => {
  const i = (input ?? {}) as Record<string, unknown>
  const m = splitMcp(tool)
  if (m) return { writing: 'Preparing the call…', running: `Waiting for ${displayName(tool).split(' ')[0]}…` }
  switch (tool) {
    case 'Bash':
      return { writing: 'Writing the command…', running: 'Running…' }
    case 'Read':
      return { writing: 'Choosing what to read…', running: 'Reading…' }
    case 'WebFetch':
      return { writing: 'Preparing the call…', running: `Fetching ${host(i.url) || 'the page'}…` }
    case 'WebSearch':
      return { writing: 'Preparing the call…', running: 'Searching…' }
    default:
      return { writing: 'Preparing the call…', running: 'Running…' }
  }
}

// ---------------------------------------------------------------------------
// The title.

const readRange = (input: Record<string, unknown>, output: unknown) => {
  const f = ((output as { file?: Record<string, unknown> } | undefined)?.file ?? {}) as Record<string, unknown>
  const start = Number(f.startLine)
  const n = Number(f.numLines)
  const total = Number(f.totalLines)
  if (Number.isFinite(start) && Number.isFinite(n) && Number.isFinite(total) && total > 0) {
    if (n >= total) return { long: '', short: '' }
    return { long: `lines ${num(start)}–${num(start + n - 1)} of ${num(total)}`, short: `${start}–${start + n - 1}/${total}` }
  }
  if (typeof input.offset === 'number') return { long: `from line ${num(input.offset)}`, short: `${input.offset}–` }
  return { long: '', short: '' }
}

export const titleFor = (tool: string, input: unknown, output: unknown, budget: number, root?: string) => {
  const i = (input ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? maskValue(sane(v)).trim() : '')
  switch (tool) {
    case 'Bash':
      return clipEnd(str(i.description) || firstLine(str(i.command)).line, budget)
    case 'Read': {
      const p = clipMiddle(relPath(str(i.file_path), root), budget)
      const r = readRange(i, output).long
      return r ? clipEnd(`${p}, ${r}`, budget) : p
    }
    case 'WebFetch':
      return clipMiddle(str(i.url), budget)
    case 'WebSearch':
      return str(i.query) ? `"${clipEnd(str(i.query), budget - 2)}"` : ''
    case 'Skill':
      return clipEnd(str(i.skill), budget)
    default:
      return titleArgs(input, budget)
  }
}

// ---------------------------------------------------------------------------
// One row, at this moment.

export type RowIn = {
  tool: string
  input: unknown
  output: unknown
  isRunning: boolean
  isErrored: boolean
  isInterrupted: boolean
  row: Row
  mode: Mode
  isRO: boolean
  cols: number
  now: number
  ext?: Extract
  /** When the input last changed (for writing vs waiting to run). */
  inputAt: number
  root?: string
}

export type RowOut = {
  name: string
  title: string
  head: Pair[]
  lw: number
  lines: Line[]
  tokens: string
  glyph: Glyph
  since?: number
  pre?: { writing: string; waiting: string; at: number }
  /** The one-line form a group shows for this call. */
  gist: { t: string; k: Line['k'] }
}

const errorObject = (json: unknown): string | undefined => {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return undefined
  const o = json as Record<string, unknown>
  const status = Number(o.status ?? o.statusCode)
  const e = o.error ?? o.errors
  if (e === undefined && !(status >= 400)) return undefined
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const m = (e as Record<string, unknown>).message
    if (typeof m === 'string') return m
    return JSON.stringify(e).slice(0, 300)
  }
  return `status ${status}`
}

const exitCode = (text: string) => /Exit code (\d+)/.exec(text)?.[1]

export const buildRow = (r: RowIn): RowOut => {
  const name = displayName(r.tool)
  const titleBudget = Math.max(12, r.cols - cells(name) - 8)
  const title = titleFor(r.tool, r.input, r.output, titleBudget, r.root)
  const i = (r.input ?? {}) as Record<string, unknown>
  const lineW = Math.max(20, r.cols - 6)
  const row = r.row
  const words = statusWords(r.tool, r.input)
  const out = (r.output && typeof r.output === 'object' ? r.output : {}) as Record<string, unknown>

  // Under the title: the arguments in full, or Bash's command.
  let head: Pair[] = []
  let lw = 0
  if (r.tool === 'Bash') {
    const cmd = typeof i.command === 'string' ? maskValue(sane(i.command)).trim() : ''
    if (cmd !== '' && (r.mode === 'args' || !r.isRO)) {
      const ls = cmd.split('\n')
      const first = wrap(`$ ${ls[0] ?? ''}`, lineW, 3)
      head = first.map(v => ({ l: '', v }))
      if (ls.length > 1) head.push({ l: '', v: `  (+${num(ls.length - 1)} more lines)` })
    }
  } else if (r.mode === 'args' && r.input && typeof r.input === 'object') {
    const l = layout(r.input, { width: lineW, maxLines: 8, maxValueLines: 8 })
    head = l.pairs
    lw = l.lw
  }

  // Tokens: the call the model wrote, and what it read back.
  let inTok = 0
  try {
    inTok = estimate(JSON.stringify(r.input ?? {}).length)
  } catch {}
  const outTok = row.o ?? (r.ext ? estimate(r.ext.len) : undefined)
  const notes: string[] = []
  if (row.win) notes.push('summary saw the start and end only')
  if (row.why) notes.push(`no summary (${row.why})`)
  const tokenLine =
    `input ≈${tok(inTok)} tok` + (outTok === undefined ? '' : ` · output ≈${tok(outTok)} tok`) + notes.map(n => ` · ${n}`).join('')

  const res = (lines: Line[], glyph: Glyph, extra: Partial<RowOut> = {}): RowOut => ({
    name,
    title,
    head,
    lw,
    lines,
    tokens: tokenLine,
    glyph,
    gist: { t: lines[0]?.t ?? '', k: lines[0]?.k ?? 'status' },
    ...extra,
  })
  const status = (t: string): Line => ({ t, k: 'status' })
  const fail = (t: string): Line => ({ t, k: 'fail' })
  const summaryLines = (s: string): Line[] => wrap(s, lineW, SUB_LINES).map(t => ({ t, k: 'summary' }))
  const rawLine = (text: string): Line => {
    const f = firstLine(text)
    return { t: clipEnd(f.line, lineW - 12), k: 'raw', tail: f.more > 0 ? `+${num(f.more)} lines` : undefined }
  }
  const elapsed = row.t0 !== undefined && row.t1 !== undefined ? row.t1 - row.t0 : undefined

  // Not finished yet.
  if (r.isRunning || r.output === undefined) {
    if (r.isInterrupted) return res([fail(row.t0 ? `Interrupted after ${dur(r.now - row.t0)}` : 'Cancelled before it ran')], 'error')
    if (row.ph === 'denied') return res([fail('Not run · blocked by a permission rule')], 'error')
    if (row.ph === 'asking') return res([status('Waiting for your approval')], 'warning')
    if (row.ph === 'running' || (r.isRunning && row.ph === undefined && row.t0 !== undefined))
      return res([status(words.running)], 'inactive', { since: row.t0 })
    if (row.ph === 'started') return res([status('Waiting to run…')], 'inactive')
    if (r.isRunning) return res([status(words.running)], 'inactive')
    return res([status(words.writing)], 'inactive', {
      pre: { writing: words.writing, waiting: 'Waiting to run…', at: r.inputAt },
    })
  }

  const ext = r.ext ?? { text: '', len: 0, images: 0, lines: 0 }
  const text = ext.text

  // Ended without a normal result.
  if (r.isInterrupted) {
    const after = elapsed !== undefined ? `Interrupted after ${dur(elapsed)}` : 'Interrupted'
    return res([fail(after), ...(text.trim() ? [rawLine(text)] : [])], 'error')
  }
  if (r.isErrored) {
    if (row.ph === 'denied')
      return res([fail(`Not run · blocked by a permission rule${row.rule ? ` (${row.rule})` : ''}`)], 'error')
    if (row.ph === 'asking' && row.t0 === undefined) return res([fail('Not run · you declined it')], 'error')
    const code = exitCode(text)
    const first = fail(`Failed${code ? ` · exit ${code}` : ''}`)
    const rest = row.s ? summaryLines(row.s) : text.trim() ? [rawLine(text.replace(/^Exit code \d+\s*/, ''))] : []
    return res([first, ...rest], 'error')
  }
  if (r.tool === 'Bash' && typeof out.timedOutAfterMs === 'number') {
    const rest = row.s ? summaryLines(row.s) : row.q ? [status('summarizing…')] : text.trim() ? [rawLine(text)] : []
    return res([fail(`Timed out after ${dur(out.timedOutAfterMs)} · ${num(ext.lines)} lines`), ...rest], 'error')
  }
  if (r.tool === 'Bash' && typeof out.backgroundTaskId === 'string')
    return res([status(`Moved to the background · task ${out.backgroundTaskId}`)], 'inactive')

  const soft = errorObject(ext.json)
  if (soft !== undefined)
    return res([fail('Failed'), ...wrap(maskValue(sane(soft)), lineW, 2).map(t => ({ t, k: 'raw' as const }))], 'error')

  // Nothing came back.
  if (text.trim() === '') {
    const said = typeof out.returnCodeInterpretation === 'string' ? sane(out.returnCodeInterpretation) : ''
    const t = r.tool === 'Bash' ? said || 'Done · printed nothing' : 'Done · empty result'
    return res([status(t)], 'success')
  }

  // Short: the result itself, the counts at its end.
  if (ext.len < MIN_CHARS) {
    const line = rawLine(text)
    const counts = `in ≈${tok(inTok)} · out ≈${tok(outTok ?? estimate(ext.len))} tok`
    return { ...res([{ ...line, tail: line.tail ? `${line.tail} · ${counts}` : counts }], 'success'), tokens: '' }
  }

  if (r.mode === 'compact') return res([rawLine(text)], 'success')
  if (row.s) return res(summaryLines(row.s), 'success')
  if (row.q) {
    const facts: string[] = []
    if (elapsed !== undefined) facts.push(`Done in ${dur(elapsed)}`)
    if (r.tool === 'Read') {
      const f = (out.file ?? {}) as Record<string, unknown>
      const n = Number(f.numLines)
      const total = Number(f.totalLines)
      facts.push(Number.isFinite(n) && Number.isFinite(total) && n < total ? `${num(n)} of ${num(total)} lines` : `${num(ext.lines)} lines`)
    } else if (r.tool === 'WebFetch' && typeof out.bytes === 'number') facts.push(bytes(out.bytes))
    else facts.push(`${num(ext.lines)} lines`)
    facts.push('summarizing…')
    return res([status(facts.join(' · '))], 'success')
  }
  return res([rawLine(text)], 'success')
}

// ---------------------------------------------------------------------------
// One call's line under a group's head.

export const groupItem = (id: string, r: RowIn, built: RowOut): GroupItem => {
  const i = (r.input ?? {}) as Record<string, unknown>
  let label: string
  if (r.tool === 'Read') {
    const p = relPath(typeof i.file_path === 'string' ? sane(i.file_path) : '', r.root)
    const range = readRange(i, r.output).short
    label = range ? `${p} ${range}` : p
  } else if (r.tool === 'Bash') {
    label = `$ ${firstLine(typeof i.command === 'string' ? maskValue(sane(i.command)) : '').line}`
  } else label = built.title ? `${built.name} ${built.title}` : built.name
  let gist = built.gist
  // A Read's mechanical fact beats the first line of `cat -n` output.
  if (r.tool === 'Read' && gist.k === 'raw' && r.ext) gist = { t: `${num(r.ext.lines)} lines`, k: 'status' }
  return { id, name: label, gist: gist.t, k: gist.k, glyph: built.glyph }
}

/** "Read 3 files, ran 1 command", from the calls in a group. */
export const groupHead = (tools: string[]) => {
  const counts = new Map<string, number>()
  for (const t of tools) counts.set(t, (counts.get(t) ?? 0) + 1)
  const parts: string[] = []
  for (const [t, n] of counts) {
    const s = n === 1 ? '' : 's'
    if (t === 'Read') parts.push(`read ${n} file${s}`)
    else if (t === 'Bash') parts.push(`ran ${n} command${s}`)
    else if (t === 'Grep' || t === 'Glob') parts.push(`searched ${n} pattern${s}`)
    else parts.push(`called ${displayName(t)} ${n} time${s}`)
  }
  const head = parts.join(', ')
  return head.charAt(0).toUpperCase() + head.slice(1)
}
