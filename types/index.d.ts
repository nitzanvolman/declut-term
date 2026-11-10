/** How one class of call is drawn. */
export type Mode = 'summary' | 'args' | 'compact' | 'off'

/** Which class a tool's calls count as: its own declaration, or an override. */
export type CountsAs = 'declared' | 'read-only' | 'write'

/** One rule; a field left out inherits from the level above. */
export type Rule = { ro?: Mode; rw?: Mode; as?: CountsAs }

/** Rules by target: `tool:<name>`, `server:<server>`, or `builtin`. */
export type Rules = Record<string, Rule>

/** Where a call is between the model writing it and its result. */
export type Phase = 'started' | 'asking' | 'running' | 'denied'

/** Why a row has no summary. */
export type NoSummary = 'timed out' | 'Haiku error' | 'busy' | 'session cap reached'

/** One tool call's row. Lives in session state only: summaries never reach $.store or disk. */
export type Row = {
  /** Haiku's summary. */
  s?: string
  /** The output's token estimate, from the text the model read. */
  o?: number
  /** The person's own open (true) or fold (false) choice, and when it was made. */
  x?: boolean
  xt?: number
  /** Whether the hover card shows. */
  p?: boolean
  ph?: Phase
  /** The tool's word that this input is read-only. */
  ro?: boolean
  /** Execution start and end, ms since epoch. */
  t0?: number
  t1?: number
  /** A summary is queued or being written. */
  q?: boolean
  why?: NoSummary
  /** The result was longer than Haiku's window. */
  win?: boolean
  /** The settings rule that refused the call. */
  rule?: string
}

/** One line of the ⎿ block. */
export type Line = {
  t: string
  /** status: transient, upright, quiet · summary: Haiku, italic · raw: the result verbatim · fail: an error verbatim */
  k: 'status' | 'summary' | 'raw' | 'fail'
  /** Quiet text after it on the same line. */
  tail?: string
}

/** One line of an argument or result block: a label column and its value. */
export type Pair = { l: string; v: string }

/** The hover card, already laid out to fit inside its border. */
export type Card = {
  width: number
  title: string
  /** Bash's command lines; empty for other tools. */
  cmd: string[]
  args: Pair[]
  body: Pair[]
  /** Label column width for `args` and `body`. */
  lw: number
  more: string
}

/** What the collapsed row's surface module is handed: plain JSON. */
export type SummaryProps = {
  id: string
  /** Bold: `Bash`, `Read`, `WhatsApp send text`. */
  name: string
  /** In parentheses after the name; empty draws no parentheses. */
  title: string
  /** Lines under the title: the full arguments, or Bash's command. */
  head: Pair[]
  lw: number
  lines: Line[]
  /** The token line; empty when the counts ride on a receipt line. */
  tokens: string
  glyph: Glyph
  /** Running since (ms epoch): the module appends the elapsed time. */
  since?: number
  /** Before the call starts: the two status texts and when the input last changed. */
  pre?: { writing: string; waiting: string; at: number }
  cols: number
  card: Card | null
  hint: string
}

export type Glyph = 'success' | 'error' | 'inactive' | 'warning'

/** The open row's overlay. */
export type FoldProps = { id: string; glyph: Glyph }

/** One call's line under a group's head. */
export type GroupItem = { id: string; name: string; gist: string; k: Line['k']; glyph: Glyph }

export type GroupProps = {
  head: string
  tokens: string
  items: GroupItem[]
  nameWidth: number
  cols: number
  glyph: Glyph
}

/** One row of the settings pane. */
export type SetRow = {
  /** `defaults`, `builtin`, `server:<s>`, `tool:<t>`; empty for a heading. */
  key: string
  label: string
  depth: number
  ro: string
  rw: string
  as: string
  /** Why the row cannot be changed; empty when it can. */
  fixed: string
  /** A server row: whether its tools are listed under it. */
  open?: boolean
}

export type SettingsProps = { rows: SetRow[]; cols: number; note: string }

/** What the surface modules post back to the hooks module. */
export type Post =
  | { op: 'peek' | 'unpeek' | 'open' | 'close'; id: string }
  | { op: 'cycle'; key: string; field: 'ro' | 'rw' | 'as' }
  | { op: 'toggle'; key: string }
  | { op: 'reset'; key: string }

/** Haiku spend this session, which the session's own cost total leaves out. */
export type Spent = { calls: number; input: number; output: number; failed: number }

declare module 'claude-code' {
  interface PluginState {
    'declut-term': {
      rows: StateFamily<Row>
      spent: Spent
      all: { open: boolean; at: number }
      rules: Rules
      classes: Record<string, boolean>
      opened: string[]
    }
  }
}
