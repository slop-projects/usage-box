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

// Soft colour that fades smoothly from calm green through amber to a muted red.
function toneOf(pct: number): string {
  const t = Math.min(100, Math.max(0, pct)) / 100
  const hue =
    t < 0.6 ? 150 - (t / 0.6) * 18 : t < 0.85 ? 132 - ((t - 0.6) / 0.25) * 92 : 40 - ((t - 0.85) / 0.15) * 32
  return `hsl(${hue.toFixed(0)} 52% 58%)`
}

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
// Rough widths at 12px for laying text out inside the SVG.
const widthOf = (text: string, bold = false) =>
  [...text].reduce((w, ch) => w + (ch === ' ' ? 3.4 : ch === '·' ? 4 : /[0-9%]/.test(ch) ? 7 : 6.4), 0) *
  (bold ? 1.04 : 1)

// One glass pill: rings on the left, then the numbers, sized to fit exactly.
function pillSvg(session: Limit | undefined, week: Limit | undefined, tip: string): { source: string; width: number; height: number } {
  const H = 28
  const R = H / 2
  const cx = 16
  const cy = H / 2

  const ring = (r: number, w: number, pct: number | undefined) => {
    const len = 2 * Math.PI * r
    const used = pct === undefined ? 0 : Math.min(100, Math.max(0, pct)) / 100
    return (
      `<circle class="track" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${w}"/>` +
      (pct === undefined
        ? ''
        : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${toneOf(pct)}" stroke-width="${w}" ` +
          `stroke-linecap="round" stroke-dasharray="${(used * len).toFixed(2)} ${len.toFixed(2)}" ` +
          `transform="rotate(-90 ${cx} ${cy})"/>`)
    )
  }

  // Text parts: [text, bold]
  const parts: [string, boolean][] = []
  if (session) parts.push([`${Math.round(session.percentUsed)}%`, true], [' session', false])
  if (session && week) parts.push(['  ·  ', false])
  if (week) parts.push([`${Math.round(week.percentUsed)}%`, true], [' week', false])

  const textX = 31
  const textW = parts.reduce((w, [t, b]) => w + widthOf(t, b), 0)
  const W = Math.ceil(textX + textW + 13)
  const spans = parts
    .map(([t, b]) => `<tspan class="${b ? 'num' : 'dim'}">${t.replace(/ /g, '&#160;')}</tspan>`)
    .join('')
  const esc = tip.replace(/&/g, '&amp;').replace(/</g, '&lt;')

  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<title>${esc}</title>` +
    `<style>` +
    `.base{fill:#2b2b2b}.edge{stroke:rgba(255,255,255,.11)}.shine{stroke:rgba(255,255,255,.22)}` +
    `.track{stroke:rgba(255,255,255,.12)}.num{fill:#ececec;font-weight:600}.dim{fill:#9a9a9a}` +
    `@media (prefers-color-scheme: light){.base{fill:#f6f6f5}.edge{stroke:rgba(0,0,0,.09)}` +
    `.shine{stroke:rgba(255,255,255,.9)}.track{stroke:rgba(0,0,0,.10)}.num{fill:#262626}.dim{fill:#7a7a7a}}` +
    `</style>` +
    `<defs>` +
    `<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#fff" stop-opacity=".13"/>` +
    `<stop offset=".45" stop-color="#fff" stop-opacity=".04"/>` +
    `<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<radialGradient id="glow" cx=".12" cy="0" r=".9">` +
    `<stop offset="0" stop-color="#fff" stop-opacity=".10"/>` +
    `<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    // body, glass sheen, soft glow, hairline edge, top highlight
    `<rect class="base" x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${R - 0.5}"/>` +
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${R - 0.5}" fill="url(#sheen)"/>` +
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${R - 0.5}" fill="url(#glow)"/>` +
    `<rect class="edge" x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${R - 0.5}" fill="none"/>` +
    `<path class="shine" d="M ${R} 1.2 H ${W - R}" stroke-width="1" stroke-linecap="round" fill="none" opacity=".55"/>` +
    ring(9, 2.4, session?.percentUsed) +
    ring(5, 2, week?.percentUsed) +
    `<text x="${textX}" y="${cy + 4.2}" font-family="${FONT}" font-size="12">${spans}</text>` +
    `</svg>`

  return { source, width: W, height: H }
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
    const words = [
      session && `${Math.round(session.percentUsed)}% session`,
      week && `${Math.round(week.percentUsed)}% week`,
    ]
      .filter(Boolean)
      .join(' · ')

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
    const pill = pillSvg(session, week, tip)
    return (
      <Box flexDirection="row" alignItems="center" justifyContent="flex-end" gap={1}>
        <Svg source={pill.source} alt={tip} width={pill.width} height={pill.height} isInteractive />
        <Link href={USAGE_PAGE} label="Reset" />
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
