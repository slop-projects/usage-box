import { atom, read, update } from 'claude-code'
import type { Register, SessionRateLimit } from 'claude-code'

import type { Limit } from '../types'

// Where Claude's own usage page lives: the "Reset for free" button is there.
const USAGE_PAGE = 'https://claude.ai/settings/usage'

const limits = atom({ plugin: 'usage-left', key: 'limits' } as const, [], {
  shape: 'limits-1',
})
// Which "kind@threshold@resetsAt" warnings were already shown.
const warned = atom({ plugin: 'usage-left', key: 'warned' } as const, [])

const NAMES: Record<string, string> = {
  five_hour: 'Current session',
  seven_day: 'This week',
  spend_limit: 'Spend limit',
}
const nameOf = (kind: string) => NAMES[kind] ?? kind.replace(/_/g, ' ')
const find = (list: Limit[], kind: string) => list.find(l => l.kind === kind)
const toLimits = (rl: SessionRateLimit[]): Limit[] =>
  rl.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt }))

function untilReset(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - now
  if (!Number.isFinite(ms) || ms <= 0) return 'resets now'
  const mins = Math.round(ms / 60_000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `resets in ${d}d ${h}h`
  if (h > 0) return `resets in ${h}h ${m}m`
  return `resets in ${m}m`
}

const toneOf = (pct: number) => (pct >= 95 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e')

// Two thin concentric rings, like the app's own context circle:
// outer = current 5-hour session, inner = this week.
function ringSvg(session: Limit | undefined, week: Limit | undefined, tip: string): string {
  const S = 22
  const c = S / 2
  const arc = (r: number, w: number, pct: number | undefined) => {
    const len = 2 * Math.PI * r
    const used = pct === undefined ? 0 : Math.min(100, Math.max(0, pct)) / 100
    const color = pct === undefined ? 'transparent' : toneOf(pct)
    return (
      `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(140,140,140,0.28)" stroke-width="${w}"/>` +
      `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${w}" ` +
      `stroke-linecap="round" stroke-dasharray="${(used * len).toFixed(2)} ${len.toFixed(2)}" ` +
      `transform="rotate(-90 ${c} ${c})"/>`
    )
  }
  const esc = tip.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
    `<title>${esc}</title>` +
    arc(9, 2.6, session?.percentUsed) +
    arc(5, 2.2, week?.percentUsed) +
    `</svg>`
  )
}

const summary = (list: Limit[], now: number) =>
  list.length === 0
    ? 'No usage reading yet. It arrives with Claude\'s next reply.'
    : list
        .map(l => `${nameOf(l.kind)}: ${l.percentUsed}% used, ${untilReset(l.resetsAt, now)}`)
        .join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Tidy up what the first version left behind.
    $.ui.status(undefined)
    void $.ui.close({ id: 'usage-left' }).catch(() => undefined)

    await $.command.register({
      name: 'usage-left',
      description: 'Show how much of your usage limits is left',
    })
    const u = await $.session.usage()
    await update($, limits, () => toLimits(u.rateLimits))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const list = toLimits(e.rateLimits)
    await update($, limits, () => list)

    // Warn once per window when it crosses 80% and 95% used.
    const now = await $.clock.now()
    const seen = await read($, warned)
    const fresh: string[] = []
    for (const l of list) {
      for (const t of [80, 95]) {
        const id = `${l.kind}@${t}@${l.resetsAt ?? ''}`
        if (l.percentUsed >= t && !seen.includes(id)) {
          fresh.push(id)
          $.ui.toast(`${nameOf(l.kind)}: ${l.percentUsed}% used (${untilReset(l.resetsAt, now)})`)
        }
      }
    }
    if (fresh.length) await update($, warned, w => [...w, ...fresh].slice(-50))
    return next(e)
  })

  on('command.run', { command: 'usage-left' }, async $ => {
    const list = toLimits((await $.session.usage()).rateLimits)
    await update($, limits, () => list)
    return { text: `${summary(list, await $.clock.now())}\nFull limit reset: ${USAGE_PAGE}` }
  })

  // A slim row just above the message box: the green ring, the numbers, Reset.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, limits)
    const session = find(list, 'five_hour')
    const week = find(list, 'seven_day')
    if (e.props.hasSurvey || (!session && !week)) return next(e)

    const tip = summary(list, await $.clock.now())
    const { Box, Text, Link } = $.ui.resolve(e)
    const words =
      `Session ${session ? session.percentUsed : '–'}% used` +
      (week ? ` · Week ${week.percentUsed}%` : '')

    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="row" gap={1}>
          <Text color={toneOf(session?.percentUsed ?? 0)}>●</Text>
          <Text dimColor>{words}</Text>
          <Link href={USAGE_PAGE} label="Reset" />
        </Box>
      )
    }

    const { Svg } = $.ui.resolve(e as typeof e & { surface: 'desktop' })
    return (
      <Box flexDirection="row" alignItems="center" justifyContent="flex-end" gap={1}>
        <Svg source={ringSvg(session, week, tip)} alt={tip} width={22} height={22} isInteractive />
        <Text dimColor>{words}</Text>
        <Link href={USAGE_PAGE} label="Reset" />
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
