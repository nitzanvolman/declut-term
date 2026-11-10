# declut-term

A Claude Code plugin that makes tool-call rows in the terminal transcript short.
Each row says what the call is doing while it runs, and when the result comes
back, Haiku writes a one-sentence summary of it. The row also shows a token
estimate for the call. Click a row to open Claude Code's original rendering, and
click again to fold it.

## What it does

- **Live status.** A row moves through *Writing the command…*, *Checking
  permission…* (auto mode) or *Waiting for your approval* (only while a dialog
  is open for you), *Running…*, *Done in 3.2s · 300 lines · summarizing…* and
  on to the summary. A call that never ran says why: you declined it, a rule
  or auto mode blocked it, or the dialog closed unanswered.
- **Summaries.** Haiku summarizes long results using your session's own
  account, at most 3 at a time and at most 300 per session (you can change the
  cap). Short results are shown word for word instead.
- **Calls that may change something** show their arguments in full, written as
  labelled lines rather than JSON. Values that look like secrets are masked.
- **File reads** that come in a run collapse into one group line, with a line
  per file. Click a file to open that read. The group line takes the place of
  Claude Code's own, including its "Ran N PreToolUse hooks" line and any
  recalled memories; ctrl+o or a click shows them.
- **ctrl+o and verbose.** ctrl+o shows Claude Code's full rows. With `verbose`
  on in your settings, which marks every row as expanded, rows and groups stay
  compact; click one to see it in full.
- **Hover card.** Rest the pointer on a row's title for a second to see its
  arguments and result.
- **Left alone:** edits and writes, where you review the diff; questions and
  plan approvals; messages addressed to you; background agents and commands.

Summaries stay in the session's memory and are never written to disk. To
summarize a result, the plugin sends it to Haiku.

## Install

At the prompt of a Claude Code terminal session:

```text
/plugin install declut-term --marketplace nitzanvolman/declut-term
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```sh
claude plugin install declut-term --marketplace nitzanvolman/declut-term
```

## Use

| Command | Does |
| --- | --- |
| `/declut-term` or `/declut-term status` | Shows whether it is on, the defaults, your rules, and how many summaries this session used |
| `/declut-term tools` | Opens the settings pane: one row per tool and MCP server |
| `/declut-term on` / `off` | Switches the plugin on or off |
| `/declut-term expand` / `collapse` | Opens or folds every row |
| `/declut-term open` | Opens the last row |
| `/declut-term skip <tool or server>` | Gives that tool or server back to Claude Code's own rows |
| `/declut-term unskip <tool or server>` | Undoes a skip |

In the settings pane, click a value to change it. After a first click, the
keyboard works too: ↑↓ to pick a row, ←→ to pick a column, Enter or Space to
change the value, and `r` to reset the row.

## Settings

Every call is either **read-only**, as the tool declares it, or **may change
something**. Each class gets one of four modes:

| Mode | Row |
| --- | --- |
| Summary | Compact row with a Haiku summary |
| Summary + arguments | Same as Summary, plus the call's full arguments |
| Compact | Compact row showing the result's first line, with no Haiku call |
| Off | Claude Code's own row, untouched |

The defaults are in `/config`: read-only calls get **Summary**, and calls that
may change something get **Summary + arguments**. The summary cap is also there.
Rules for a single tool or server, set in `/declut-term tools`, take precedence
over the defaults. A server that marks none of its tools as read-only can be
set to count as read-only.

## Develop

```sh
claude --plugin-dir /path/to/declut-term   # load it from this folder; saves reload it
claude plugin validate .                   # manifest, marketplace file and hooks
claude plugin test .                       # hooks/*.test.ts
tsc -p .                                   # after the first load writes .claude-plugin/types/
```

The plugin has no runtime dependencies. `.claude-plugin/types/` is written by
Claude Code when it loads the plugin, and git ignores it.

Built and tested on Claude Code 2.1.321.

## Licence

MIT. See [LICENSE](LICENSE).
