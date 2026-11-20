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

// Bright, clear colour that fades smoothly from green through amber to red.
function toneOf(pct: number): string {
  const t = Math.min(100, Math.max(0, pct)) / 100
  const hue =
    t < 0.6 ? 145 - (t / 0.6) * 10 : t < 0.85 ? 135 - ((t - 0.6) / 0.25) * 97 : 38 - ((t - 0.85) / 0.15) * 34
  return `hsl(${hue.toFixed(0)} 72% 50%)`
}

// One thin ring with a soft glow behind the coloured part.
function ringSvg(pct: number | undefined, tip: string): string {
  const S = 20
  const c = S / 2
  const r = 7.6
  const w = 2.6
  const len = 2 * Math.PI * r
  const track = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(140,140,140,0.22)" stroke-width="${w}"/>`
  let arc = ''
  if (pct !== undefined) {
    const used = Math.min(100, Math.max(0, pct)) / 100
    const stroke =
      `cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${toneOf(pct)}" stroke-width="${w}" ` +
      `stroke-linecap="round" stroke-dasharray="${(used * len).toFixed(2)} ${len.toFixed(2)}" ` +
      `transform="rotate(-90 ${c} ${c})"`
    arc = `<circle ${stroke} filter="url(#glow)" opacity=".5"/><circle ${stroke}/>`
  }
  const esc = tip.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
    `<title>${esc}</title>` +
    `<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%">` +
    `<feGaussianBlur stdDeviation="1.3"/></filter></defs>` +
    track + arc + `</svg>`
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

    const now = await $.clock.now()
    const tip = summary(list, now)
    const { Box, Text, Link } = $.ui.resolve(e)
    const words = [
      session && `${Math.round(session.percentUsed)}% session`,
      week && `${Math.round(week.percentUsed)}% week`,
    ]
      .filter(Boolean)
      .join(' · ')

    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="row" gap={1}>
          <Text color={toneOf(session?.percentUsed ?? 0)}>◔</Text>
          <Text dimColor>{words}</Text>
          <Link href={USAGE_PAGE} label="Reset" />
        </Box>
      )
    }

    const { Svg } = $.ui.resolve(e as typeof e & { surface: 'desktop' })
    const side = (l: Limit | undefined, label: string, key: string) =>
      l && (
        <Box key={key} flexDirection="row" alignItems="center" gap={1}>
          <Svg source={ringSvg(l.percentUsed, tip)} alt={tip} width={20} height={20} isInteractive />
          <Text dimColor>
            {Math.round(l.percentUsed)}% {label}
            {l.resetsAt ? ` · ${untilReset(l.resetsAt, now)}` : ''}
          </Text>
        </Box>
      )
    return (
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" paddingX={1}>
        {side(session, 'session', 'session') ?? <Box key="session" />}
        <Box key="right" flexDirection="row" alignItems="center" gap={2}>
          {side(week, 'week', 'week')}
          <Link href={USAGE_PAGE} label="Reset" />
        </Box>
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
