import { expect, test } from 'claude-code/testing'

import { buildRow, fixedReason, groupHead, inputExcluded, outputExcluded, resolve, type RowIn } from './policy'
import { cells, displayName, extract, isSecretKey, layout, maskValue, sane, titleArgs } from './text'

const D = { ro: 'summary', rw: 'args' } as const

const base = (over: Partial<RowIn>): RowIn => ({
  tool: 'Bash',
  input: { command: 'ls src', description: 'List the source tree' },
  output: undefined,
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  row: {},
  mode: 'summary',
  isRO: true,
  cols: 100,
  now: 10_000,
  inputAt: 9_000,
  ...over,
})

test('rules: tool beats server beats defaults; counts-as moves the class', async () => {
  expect(resolve({}, D, 'mcp__whatsapp__chats-list', undefined).mode).toBe('args')
  expect(resolve({}, D, 'mcp__whatsapp__chats-list', true).mode).toBe('summary')
  const rules = { 'server:whatsapp': { rw: 'compact' as const }, 'tool:mcp__whatsapp__send-text': { rw: 'off' as const } }
  expect(resolve(rules, D, 'mcp__whatsapp__chats-list', undefined).mode).toBe('compact')
  expect(resolve(rules, D, 'mcp__whatsapp__send-text', undefined).mode).toBe('off')
  const asRO = { 'server:whatsapp': { as: 'read-only' as const } }
  expect(resolve(asRO, D, 'mcp__whatsapp__chats-list', undefined).cls).toBe('ro')
  expect(resolve({ builtin: { ro: 'compact' as const } }, D, 'Read', true).mode).toBe('compact')
})

test('fixed exclusions and receipts', async () => {
  expect(fixedReason('Edit')).toBe('the diff is what you review')
  expect(fixedReason('AskUserQuestion')).toBe('your decisions')
  expect(fixedReason('SuggestSkills')).toBe('addressed to you')
  expect(fixedReason('Agent')).toBe('runs in the background')
  expect(fixedReason('Bash')).toBe(undefined)
  expect(inputExcluded('Bash', { command: 'sleep 9', run_in_background: true })).toBe('runs in the background')
  const img = { type: 'image', file: { base64: 'xx', type: 'image/png' } }
  expect(outputExcluded('Read', img, extract('Read', img))).toBe('image result')
})

test('sanitizing strips C1, bidi and zero-width characters, keeps Hebrew', async () => {
  const s = sane('a\u009b31mb‮c​d שָׁלוֹם\u001b[31mx')
  expect(s).toBe('abcd שָׁלוֹםx')
  expect(cells('שָׁלוֹם')).toBe(4)
  expect(cells('日本')).toBe(4)
})

test('secrets: whole key words, and value patterns', async () => {
  expect(isSecretKey('api_key')).toBe(true)
  expect(isSecretKey('password')).toBe(true)
  expect(isSecretKey('max_tokens')).toBe(false)
  expect(isSecretKey('page_token')).toBe(false)
  expect(isSecretKey('keyword')).toBe(false)
  expect(maskValue('curl -H "Authorization: Bearer abcdefghijklmnop1234"')).toBe('curl -H "Authorization: Bearer ••••"')
  expect(maskValue('https://me:hunter2@example.com/x?token=abc&q=1')).toBe('https://me:••••@example.com/x?token=••••&q=1')
  expect(maskValue('ghp_abcdefghijklmnopqrstuvwxyz')).toBe('ghp_••••')
})

test('names and titles read as words, never JSON', async () => {
  expect(displayName('mcp__plugin_playwright_playwright__browser_click')).toBe('Playwright click')
  expect(displayName('mcp__claude_ai_Google_Drive__search_files')).toBe('Google Drive search files')
  expect(displayName('mcp__whatsapp__send-text')).toBe('WhatsApp send text')
  const t = titleArgs({ chatId: '15550100@c.us', text: 'Thanks, Tuesday works', linkPreview: false }, 80)
  expect(t).toBe('15550100@c.us, "Thanks, Tuesday works", link preview no')
  const l = layout({ chatId: '9725@c.us', text: 'Hi there', linkPreview: false, api_key: 'zzz' }, { width: 80, maxLines: 8, maxValueLines: 4 })
  expect(l.pairs.map(p => `${p.l.trim()}=${p.v}`)).toEqual(['chat id=9725@c.us', 'text=Hi there', 'link preview=no', 'api key=••••'])
})

test('live states: writing, approval, running, summarizing, summarized', async () => {
  const writing = buildRow(base({}))
  expect(writing.lines[0]?.t).toBe('Writing the command…')
  expect(writing.pre?.waiting).toBe('Waiting to run…')
  expect(buildRow(base({ row: { ph: 'asking' } })).glyph).toBe('warning')
  expect(buildRow(base({ row: { ph: 'asking' } })).lines[0]?.t).toBe('Waiting for your approval')
  const run = buildRow(base({ isRunning: true, row: { ph: 'running', t0: 5_000 } }))
  expect(run.lines[0]?.t).toBe('Running…')
  expect(run.since).toBe(5_000)
  const long = { stdout: 'x\n'.repeat(300), stderr: '', interrupted: false }
  const ext = extract('Bash', long)
  const pend = buildRow(base({ output: long, ext, row: { q: true, t0: 1_000, t1: 4_200 } }))
  expect(pend.lines[0]?.t).toBe('Done in 3.2s · 300 lines · summarizing…')
  const done = buildRow(base({ output: long, ext, row: { s: 'Three hundred lines of x.' } }))
  expect(done.lines[0]).toEqual({ t: 'Three hundred lines of x.', k: 'summary' })
})

test('ends: short, empty, failed, declined, blocked, soft failure', async () => {
  const short = { stdout: 'a.txt\nb.txt', stderr: '', interrupted: false }
  const r = buildRow(base({ output: short, ext: extract('Bash', short) }))
  expect(r.lines[0]?.t).toBe('a.txt')
  expect(r.lines[0]?.tail?.startsWith('+1 lines · in ≈')).toBe(true)
  expect(r.tokens).toBe('')
  const empty = { stdout: '', stderr: '', interrupted: false }
  expect(buildRow(base({ output: empty, ext: extract('Bash', empty) })).lines[0]?.t).toBe('Done · printed nothing')
  const failed = buildRow(base({ output: 'Exit code 2\nls: nope: No such file', isErrored: true, ext: extract('Bash', 'Exit code 2\nls: nope: No such file'), row: { t0: 1 } }))
  expect(failed.lines[0]?.t).toBe('Failed · exit 2')
  expect(failed.lines[1]?.t).toBe('ls: nope: No such file')
  const declined = buildRow(base({ output: 'refused', isErrored: true, ext: extract('Bash', 'refused'), row: { ph: 'asking' } }))
  expect(declined.lines[0]?.t).toBe('Not run · you declined it')
  expect(buildRow(base({ row: { ph: 'denied' } })).lines[0]?.t).toBe('Not run · blocked by a permission rule')
  const soft = JSON.stringify({ error: { message: 'chat not found' }, pad: 'p'.repeat(300) })
  const sr = buildRow(base({ tool: 'mcp__whatsapp__send-text', input: { chatId: 'x' }, output: soft, ext: extract('mcp__whatsapp__send-text', soft) }))
  expect(sr.glyph).toBe('error')
  expect(sr.lines.map(l => l.t)).toEqual(['Failed', 'chat not found'])
})

test('calls that may change something show their arguments; Bash writes show the command', async () => {
  const a = buildRow(base({ tool: 'mcp__whatsapp__send-text', input: { chatId: '9725@c.us', text: 'Thanks' }, mode: 'args', isRO: false }))
  expect(a.head.map(p => p.v)).toEqual(['9725@c.us', 'Thanks'])
  const b = buildRow(base({ input: { command: 'git push origin main', description: 'Push' }, isRO: false }))
  expect(b.head[0]?.v).toBe('$ git push origin main')
  expect(buildRow(base({})).head).toEqual([])
})

test('group head', async () => {
  expect(groupHead(['Read', 'Read', 'Read', 'Bash'])).toBe('Read 3 files, ran 1 command')
})
