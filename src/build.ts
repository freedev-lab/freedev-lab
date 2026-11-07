// Draws every image in assets/ and writes README.md, from the text in src/content.ts.
//
// GitHub shows a README without custom fonts or CSS, so the display type is drawn here:
// Anton and IBM Plex are turned into SVG paths, which look the same on every screen.
// Each image comes in a Day version (paper and ink) and a Night version (iron and bone);
// <picture> picks the one that matches the reader's GitHub theme.
//
// Run: bun install && bun run build
//
// Design note (DESIGN.md §0.6). Stock: Ledger paper, with a Night version of every image; texture
// level 1 (grain on the hero, the linkify cover and the contact band only, off in high-contrast mode).
// Density: Poster for the hero, Standard elsewhere. The one loud element is the "Hi, I'm Mounir"
// headline. Devices: the title block (real facts about me), the "Open to work" stamp (a real
// status), opener rules on real sections, and one misregistered headline (the decorative one).
//
// Two kinds of image are not drawn here, they are copied files:
// - assets/devconnect-cover-{day,night}.webp, made at 2x from the portfolio's screenshot with
//     magick explore-projects-1440.webp -resize '796x496!' -bordercolor '#16211F' -border 2 \
//       -background none -gravity north -extent 800x532 -quality 82 devconnect-cover-day.webp
//   ('#CFCBB9' for the night copy). The border is the 1 px figure frame from DESIGN.md §7.7; the
//   transparent strip at the bottom is STACK_GAP, so the cover matches the height of its text block.
// - assets/badges/*.svg, the 88×31 buttons from the portfolio.

import opentype from 'opentype.js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { about, badges, contact, formatDate, links, profile, projects, tools, updated, work, type Project } from './content'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(ROOT, 'assets')

// --- Fonts --------------------------------------------------------------------------------------

type Font = opentype.Font

function loadFont(pkg: string, file: string): Font {
  const buf = readFileSync(join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file))
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

const F = {
  display: loadFont('anton', 'anton-latin-400-normal.woff'),
  sans: loadFont('ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff'),
  sansSemi: loadFont('ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff'),
  cond: loadFont('ibm-plex-sans-condensed', 'ibm-plex-sans-condensed-latin-600-normal.woff'),
  condBold: loadFont('ibm-plex-sans-condensed', 'ibm-plex-sans-condensed-latin-700-normal.woff'),
  mono: loadFont('ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff'),
}

/** Cap height of a font, in px at `size`. */
const capH = (font: Font, size: number) => (font.tables.os2.sCapHeight / font.unitsPerEm) * size
/** Baseline inside a CSS line box of height `lh`, measured from the top of the box. */
const baselineIn = (font: Font, size: number, lh: number) => {
  const asc = font.ascender / font.unitsPerEm
  const desc = -font.descender / font.unitsPerEm
  return (lh - (asc + desc) * size) / 2 + asc * size
}

function glyphCount(font: Font, text: string): number {
  const glyphs = font.stringToGlyphs(text)
  const missing = [...text].filter((ch) => ch !== ' ' && font.charToGlyphIndex(ch) === 0)
  if (missing.length) throw new Error(`Font ${font.names.fullName.en} has no glyph for "${missing.join('')}" in "${text}"`)
  return glyphs.length
}

/** Width of a run of text, with kerning and tracking (in em) between glyphs. */
function measure(font: Font, text: string, size: number, tracking = 0): number {
  const n = glyphCount(font, text)
  return font.getAdvanceWidth(text, size, { kerning: true }) + tracking * size * Math.max(0, n - 1)
}

type Anchor = 'start' | 'middle' | 'end'

/**
 * Each glyph outline is drawn once per document, in <defs>, and every occurrence is a <use>.
 * GLYPHS holds the outline of every glyph used so far, by id; svg() copies the ones a document uses.
 */
const GLYPHS = new Map<string, string>()
const FONT_KEYS = new Map<Font, string>(Object.entries(F).map(([key, font]) => [font, key]))

/** One line of text, as glyph references. `y` is the baseline. */
function text(font: Font, str: string, x: number, y: number, size: number, fill: string, opts: { tracking?: number; anchor?: Anchor } = {}): string {
  const tracking = opts.tracking ?? 0
  const w = measure(font, str, size, tracking)
  const x0 = opts.anchor === 'end' ? x - w : opts.anchor === 'middle' ? x - w / 2 : x
  // Small text needs less precision: 0.1 px is a fifth of a device pixel on a 2x screen.
  const dec = size >= 30 ? 2 : 1
  const round = (n: number) => Number(n.toFixed(dec))
  const uses: string[] = []
  font.forEachGlyph(str, x0, y, size, { kerning: true, letterSpacing: tracking }, (glyph, gx, gy) => {
    const d = glyph.getPath(0, 0, size).toPathData(dec)
    if (!d) return // spaces
    const id = `${FONT_KEYS.get(font)}${size}-${glyph.index}`
    GLYPHS.set(id, d)
    uses.push(`<use href="#${id}" x="${round(gx)}" y="${round(gy)}"/>`)
  })
  return `<g fill="${fill}">${uses.join('')}</g>`
}

/** Greedy line breaking at spaces. */
function wrap(font: Font, str: string, size: number, maxWidth: number, tracking = 0): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of str.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(font, next, size, tracking) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  for (const l of lines) {
    if (measure(font, l, size, tracking) > maxWidth + 0.5) throw new Error(`"${l}" is wider than ${maxWidth}px`)
  }
  return lines
}

const upper = (s: string) => s.toUpperCase()
const r = (n: number) => Math.round(n * 100) / 100
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// --- Themes (DESIGN.md §2.2, §2.3, §2.5) -------------------------------------------------------

type Theme = {
  name: 'day' | 'night'
  bg: string
  surface: string
  fg: string
  fg2: string
  fg3: string
  line: string
  lineSoft: string
  accent: string
  accentText: string
  fillInk: string
  onFillInk: string
  /** Grain tile colour (r, g, b) and alpha, as in the kit's feColorMatrix. */
  grain: [number, number, number, number]
}

const DAY: Theme = {
  name: 'day',
  bg: '#E9E3D1', surface: '#F3EEDF', fg: '#16211F', fg2: '#4E5C58', fg3: '#727D79',
  line: '#16211F', lineSoft: '#C9C2AC', accent: '#3F6F6D', accentText: '#335A58',
  fillInk: '#16211F', onFillInk: '#F3EEDF', grain: [0.09, 0.13, 0.12, 0.2],
}

const NIGHT: Theme = {
  name: 'night',
  bg: '#16211F', surface: '#1E2B29', fg: '#E9E3D1', fg2: '#B9B6A5', fg3: '#8A8F86',
  line: '#CFCBB9', lineSoft: '#33443F', accent: '#5E8C88', accentText: '#86ABA6',
  fillInk: '#E9E3D1', onFillInk: '#0F1816', grain: [0.91, 0.89, 0.82, 0.14],
}

const THEMES = [DAY, NIGHT]
/** The contact band is an inverted sheet: iron on a Day page, paper on a Night page. */
const invert = (t: Theme) => (t.name === 'day' ? NIGHT : DAY)

// --- SVG helpers -----------------------------------------------------------------------------------

function svg(w: number, h: number, label: string, body: string, defs = ''): string {
  const ids = [...new Set([...body.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))].sort()
  const glyphs = ids.map((id) => {
    const d = GLYPHS.get(id)
    if (!d) throw new Error(`Unknown glyph ${id}`)
    return `<path id="${id}" d="${d}"/>`
  })
  const allDefs = defs + glyphs.join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r(w)}" height="${r(h)}" viewBox="0 0 ${r(w)} ${r(h)}" role="img" aria-label="${esc(label)}">` +
    `<title>${esc(label)}</title>${allDefs ? `<defs>${allDefs}</defs>` : ''}${body}</svg>\n`
  )
}

const rect = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" fill="${fill}"/>`

/** Paper grain behind content (DESIGN.md §6, level 1). Same noise tile as the kit. */
function sheet(w: number, h: number, t: Theme): { defs: string; body: string } {
  const [cr, cg, cb, a] = t.grain
  return {
    defs:
      `<style>@media (prefers-contrast: more){.grain{display:none}}</style>` +
      `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 ${cr} 0 0 0 0 ${cg} 0 0 0 0 ${cb} 0 0 0 ${a} 0"/></filter>`,
    body: `${rect(0, 0, w, h, t.bg)}<rect class="grain" width="${r(w)}" height="${r(h)}" filter="url(#grain)"/>`,
  }
}

// --- Sizes -------------------------------------------------------------------------------------------

/** Full-width images. The README column is 838 to 846 px wide on a desktop. */
const FULL = 830
/**
 * Half-width images sit side by side, separated by SPACER (about 25 px of text spaces), and stack on
 * narrower screens. Two of them plus the spacer fit in the 838 px column of the repository page.
 */
const HALF = 400
const SPACER = '&ensp;&emsp;'
/** Transparent space under each image of a pair, so stacked images do not touch on phones. */
const STACK_GAP = 16
const COVER_H = Math.round((HALF * 900) / 1440)

// --- Hero ------------------------------------------------------------------------------------------

function hero(t: Theme): string {
  const W = FULL
  const pad = 28
  const parts: string[] = []

  // Masthead strip: wordmark at the start, role at the end, 2px rule below.
  const mastH = 64
  const wmSize = 28
  const wmBase = mastH / 2 + capH(F.display, wmSize) / 2
  parts.push(text(F.display, upper(profile.name), pad, wmBase, wmSize, t.fg))
  const roleSize = 15
  parts.push(text(F.sansSemi, profile.role, W - pad, mastH / 2 + capH(F.sansSemi, roleSize) / 2, roleSize, t.fg, { anchor: 'end' }))
  parts.push(rect(0, mastH - 1, W, 2, t.line))

  // Headline: the one loud element, with a 2-3px teal misregistration plate behind it.
  const S = 150
  const lines = [upper(`Hi, I’m`), upper(profile.firstName)]
  const cap = capH(F.display, S)
  const base1 = mastH + 30 + cap
  const line1Bottom = F.display.getPath(lines[0], 0, base1, S).getBoundingBox().y2
  const base2 = Math.max(base1 + S * 0.96, line1Bottom + 12 + cap)
  const headW = Math.max(...lines.map((l) => measure(F.display, l, S)))
  const off = { x: S * 0.018, y: S * 0.014 }
  for (const [color, dx, dy] of [[t.accent, off.x, off.y], [t.fg, 0, 0]] as const) {
    parts.push(text(F.display, lines[0], pad + dx, base1 + dy, S, color))
    parts.push(text(F.display, lines[1], pad + dx, base2 + dy, S, color))
  }

  // Title block of real facts, bottom-aligned with the headline, and the "Open to work" stamp.
  const colX = Math.round(pad + headW + 44)
  const plateW = W - pad - colX
  if (plateW < 270) throw new Error(`Hero title block is too narrow (${plateW}px)`)
  const cellW = (plateW - 3) / 2
  const cellPadX = 12
  const cellPadY = 9
  const labelSize = 12
  const labelLH = 16
  const valueSize = 16
  const valueLH = 22
  const rows = [profile.facts.slice(0, 2), profile.facts.slice(2, 4)]
  const rowLines = rows.map((row) => row.map((f) => wrap(F.sansSemi, f.value, valueSize, cellW - cellPadX * 2)))
  const rowH = rowLines.map((cells) => cellPadY * 2 + labelLH + 3 + Math.max(...cells.map((c) => c.length)) * valueLH)
  const plateH = 3 + rowH[0] + rowH[1]
  const plateY = base2 - plateH
  parts.push(rect(colX, plateY, plateW, plateH, t.line))
  let y = plateY + 1
  rows.forEach((row, ri) => {
    row.forEach((fact, ci) => {
      const x = colX + 1 + ci * (cellW + 1)
      parts.push(rect(x, y, cellW, rowH[ri], t.surface))
      parts.push(text(F.sansSemi, fact.label, x + cellPadX, y + cellPadY + baselineIn(F.sansSemi, labelSize, labelLH), labelSize, t.fg2))
      rowLines[ri][ci].forEach((line, li) => {
        const ly = y + cellPadY + labelLH + 3 + li * valueLH + baselineIn(F.sansSemi, valueSize, valueLH)
        parts.push(text(F.sansSemi, line, x + cellPadX, ly, valueSize, t.fg))
      })
    })
    y += rowH[ri] + 1
  })

  if (profile.openToWork) {
    const st = 'OPEN TO WORK'
    const size = 20
    const tw = measure(F.display, st, size)
    const w = tw + 20 + 4
    const h = size * 1.15 + 4 + 4
    const x = colX + plateW - 16 - w
    const sy = plateY - h + 5
    const cx = x + w / 2
    const cy = sy + h / 2
    parts.push(
      `<g transform="rotate(-3 ${r(cx)} ${r(cy)})">` +
        `<rect x="${r(x + 1)}" y="${r(sy + 1)}" width="${r(w - 2)}" height="${r(h - 2)}" fill="${t.bg}" stroke="${t.accentText}" stroke-width="2"/>` +
        text(F.display, st, cx, cy + capH(F.display, size) / 2, size, t.accentText, { anchor: 'middle' }) +
        `</g>`,
    )
  }

  const H = Math.round(base2 + 34)
  const s = sheet(W, H, t)
  const facts = profile.facts.map((f) => `${f.label}: ${f.value}.`).join(' ')
  const label = `Hi, I’m ${profile.firstName}. ${profile.role} from ${profile.country}${profile.openToWork ? ', open to work' : ''}. ${facts}`
  return svg(W, H, label, s.body + parts.join(''), s.defs)
}

// --- Buttons ---------------------------------------------------------------------------------------

/** A large button (DESIGN.md §7.1), plus a transparent gutter so neighbours do not touch. */
function button(label: string, variant: 'primary' | 'secondary', t: Theme): string {
  const size = 16
  const tracking = 0.06
  const h = 48
  const tw = measure(F.cond, upper(label), size, tracking)
  const w = Math.round(tw + 28 * 2 + 4)
  const gutter = 10
  const fill = variant === 'primary' ? t.fillInk : 'none'
  const stroke = variant === 'primary' ? t.fillInk : t.line
  const color = variant === 'primary' ? t.onFillInk : t.fg
  const body =
    `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
    text(F.cond, upper(label), w / 2, h / 2 + capH(F.cond, size) / 2, size, color, { tracking, anchor: 'middle' })
  return svg(w + gutter, h + gutter, label, body)
}

// --- Section heads ------------------------------------------------------------------------------------

/** A 4px opener rule over a display title (DESIGN.md §5, opener). */
function sectionHead(title: string, t: Theme): string {
  const size = 64
  const base = 4 + 16 + capH(F.display, size)
  const H = Math.round(base + 14)
  return svg(FULL, H, title, rect(0, 0, FULL, 4, t.line) + text(F.display, upper(title), 0, base, size, t.fg))
}

// --- Projects --------------------------------------------------------------------------------------------

/** Name, summary, facts and tags: the text half of a work-list row. Same height as the cover. */
function projectSpec(p: Project, t: Theme): string {
  const W = HALF
  const parts: string[] = []
  const nameSize = 52
  let y = 2 + capH(F.display, nameSize)
  parts.push(text(F.display, upper(p.name), 0, y, nameSize, t.fg))

  const sumSize = 15
  const sumLH = 22.5
  y += 10
  for (const line of wrap(F.sans, p.summary, sumSize, W)) {
    parts.push(text(F.sans, line, 0, y + baselineIn(F.sans, sumSize, sumLH), sumSize, t.fg))
    y += sumLH
  }

  y += 12
  let x = 0
  for (const f of p.facts) {
    const w = Math.max(measure(F.sansSemi, f.label, 12), measure(F.sansSemi, f.value, 14))
    parts.push(text(F.sansSemi, f.label, x, y + baselineIn(F.sansSemi, 12, 16), 12, t.fg2))
    parts.push(text(F.sansSemi, f.value, x, y + 18 + baselineIn(F.sansSemi, 14, 20), 14, t.fg))
    x += w + 24
  }
  if (x - 24 > W) throw new Error(`${p.name}: facts are wider than ${W}px`)
  y += 18 + 20 + 14

  // Tags: 24px boxes with a 1px frame, condensed capitals, wrapping like the site's flex row.
  const tagSize = 12
  const tagTrack = 0.06
  const tagH = 24
  const gap = 8
  x = 0
  for (const tag of p.stack) {
    const label = upper(tag)
    const w = measure(F.cond, label, tagSize, tagTrack) + 16 + 2
    if (x > 0 && x + w > W) {
      x = 0
      y += tagH + gap
    }
    parts.push(`<rect x="${r(x + 0.5)}" y="${r(y + 0.5)}" width="${r(w - 1)}" height="${tagH - 1}" fill="none" stroke="${t.line}" stroke-width="1"/>`)
    parts.push(text(F.cond, label, x + 9, y + tagH / 2 + capH(F.cond, tagSize) / 2, tagSize, t.fg, { tracking: tagTrack }))
    x += w + gap
  }
  y += tagH
  if (y > COVER_H) throw new Error(`${p.name}: the project text is ${Math.ceil(y)}px tall, more than the ${COVER_H}px cover`)

  const label = `${p.name}. ${p.summary} ${p.facts.map((f) => `${f.label}: ${f.value}.`).join(' ')} Built with ${p.stack.join(', ')}.`
  return svg(W, COVER_H + STACK_GAP, label, parts.join(''))
}

/** linkify's cover: its Google Play feature graphic, redrawn for a 16:10 frame. Always on iron stock. */
function linkifyCover(t: Theme): string {
  const W = HALF
  const H = COVER_H
  const n = NIGHT
  const s = sheet(W, H, n)
  const parts: string[] = [s.body]
  // the inner hairline of the feature graphic, and the figure's 1px frame (ink by day, bone by night)
  parts.push(`<rect x="8.5" y="8.5" width="${W - 17}" height="${H - 17}" fill="none" stroke="${n.lineSoft}" stroke-width="1"/>`)
  parts.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${t.name === 'day' ? DAY.line : NIGHT.line}" stroke-width="1"/>`)

  // The mark from linkify's assets/brand/mark-night.svg (108 x 108 box).
  const markSize = 100
  const wordSize = 64
  const textX = 30 + markSize + 22
  const groupH = capH(F.display, wordSize) + 16 + 2 + 18 + 18
  const top = (H - groupH) / 2
  const mk = markSize / 108
  parts.push(
    `<g transform="translate(26 ${r(H / 2 - markSize / 2)}) scale(${r(mk)})"><g transform="translate(54 54) rotate(-45) scale(1.15) translate(-53 -54.5)" fill="none" stroke-width="9" stroke-linecap="butt" stroke-linejoin="miter">` +
      `<path d="M64 54.5V58A4 4 0 0 1 60 62H20A4 4 0 0 1 16 58V36A4 4 0 0 1 20 32H60A4 4 0 0 1 64 36V39.5" stroke="#F3EEDF"/>` +
      `<path d="M42 54.5V51A4 4 0 0 1 46 47H86A4 4 0 0 1 90 51V73A4 4 0 0 1 86 77H46A4 4 0 0 1 42 73V69.5" stroke="#5E8C88"/></g></g>`,
  )
  const wordBase = top + capH(F.display, wordSize)
  parts.push(text(F.display, 'LINKIFY', textX, wordBase, wordSize, n.fg))
  parts.push(rect(textX, wordBase + 16, 48, 2, n.accent))
  const tagLines = wrap(F.sans, 'Save links from any app in one tap.', 13, W - textX - 22)
  tagLines.forEach((line, i) => parts.push(text(F.sans, line, textX, wordBase + 16 + 2 + 18 + i * 18, 13, n.fg)))
  return svg(W, H + STACK_GAP, projects[1].coverAlt, parts.join(''), s.defs)
}

// --- About -------------------------------------------------------------------------------------------------

function h4(str: string, x: number, top: number, t: Theme): { svg: string; bottom: number } {
  const size = 20
  const base = top + capH(F.condBold, size) + 2
  return { svg: text(F.condBold, upper(str), x, base, size, t.fg, { tracking: 0.06 }), bottom: base + 16 }
}

/** Education as a timeline: a 2px rule with square markers, filled when finished. */
function education(t: Theme): { body: string; h: number } {
  const parts: string[] = []
  const head = h4('Education', 0, 0, t)
  parts.push(head.svg)
  const listTop = head.bottom + 4
  let y = listTop
  const textX = 30
  const maxW = HALF - textX
  about.education.forEach((item, i) => {
    parts.push(`<rect x="1" y="${r(y + 4.8 + 1)}" width="8" height="8" fill="${t.fillInk}" stroke="${t.line}" stroke-width="2"/>`)
    parts.push(text(F.mono, item.years, textX, y + baselineIn(F.mono, 13, 19.5), 13, t.fg2))
    y += 19.5 + 4
    for (const line of wrap(F.sansSemi, item.title, 16, maxW)) {
      parts.push(text(F.sansSemi, line, textX, y + baselineIn(F.sansSemi, 16, 21.6), 16, t.fg))
      y += 21.6
    }
    y += 4
    for (const line of wrap(F.sans, item.school, 14, maxW)) {
      parts.push(text(F.sans, line, textX, y + baselineIn(F.sans, 14, 21), 14, t.fg2))
      y += 21
    }
    if (i < about.education.length - 1) y += 18
  })
  // the rule runs behind the markers
  parts.unshift(rect(4, listTop, 2, y - listTop, t.line))
  return { body: parts.join(''), h: y }
}

/** Now (with its date and a status LED) and Languages (with leader dots). */
function nowAndLanguages(t: Theme): { body: string; h: number } {
  const parts: string[] = []
  const head = h4('Now', 0, 0, t)
  parts.push(head.svg)
  parts.push(text(F.sansSemi, formatDate(about.now.updated), HALF, head.bottom - 16, 12, t.fg2, { anchor: 'end' }))
  let y = head.bottom + 4
  const size = 15
  const lh = 21.75
  const items = profile.openToWork ? about.now.items : about.now.items.slice(1)
  items.forEach((item, i) => {
    const status = profile.openToWork && i === 0
    const font = status ? F.sansSemi : F.sans
    const lines = wrap(font, item, size, HALF - 20)
    const base = y + baselineIn(font, size, lh)
    const xh = (font.tables.os2.sxHeight / font.unitsPerEm) * size
    if (status) {
      parts.push(`<circle cx="5" cy="${r(base - xh / 2)}" r="4.5" fill="${t.accent}" stroke="${t.line}" stroke-width="1"/>`)
    } else {
      parts.push(rect(2, base - xh / 2 - 3, 6, 6, t.fg))
    }
    lines.forEach((line, li) => parts.push(text(font, line, 20, base + li * lh, size, t.fg)))
    y += lines.length * lh + 8
  })

  const head2 = h4('Languages', 0, y + 14, t)
  parts.push(head2.svg)
  y = head2.bottom + 4
  for (const lang of about.languages) {
    const base = y + baselineIn(F.sansSemi, 16, 24)
    const nameW = measure(F.sansSemi, lang.name, 16)
    const levelW = measure(F.sans, lang.level, 16)
    parts.push(text(F.sansSemi, lang.name, 0, base, 16, t.fg))
    parts.push(text(F.sans, lang.level, HALF, base, 16, t.fg, { anchor: 'end' }))
    const dotY = base - 16 * 0.25
    parts.push(`<line x1="${r(nameW + 8)}" y1="${r(dotY)}" x2="${r(HALF - levelW - 8)}" y2="${r(dotY)}" stroke="${t.fg3}" stroke-width="2" stroke-dasharray="2 3"/>`)
    y += 24 + 8
  }
  return { body: parts.join(''), h: y - 8 }
}

// --- Tools ledger --------------------------------------------------------------------------------------------

function ledger(rows: typeof tools.rows, t: Theme): { body: string; h: number } {
  const parts: string[] = [rect(0, 0, HALF, 2, t.line)]
  let y = 2
  for (const row of rows) {
    y += 12
    parts.push(text(F.sansSemi, row.group, 0, y + baselineIn(F.sansSemi, 15, 21), 15, t.fg))
    y += 21 + 2
    for (const line of wrap(F.sans, row.items, 15, HALF)) {
      parts.push(text(F.sans, line, 0, y + baselineIn(F.sans, 15, 22.5), 15, t.fg))
      y += 22.5
    }
    y += 12
    parts.push(rect(0, y, HALF, 1, t.lineSoft))
    y += 1
  }
  return { body: parts.join(''), h: y }
}

// --- Contact band ----------------------------------------------------------------------------------------------

function contactBand(t: Theme): string {
  const inv = invert(t)
  const W = FULL
  const pad = 32
  const size = 120
  const base = 40 + capH(F.display, size)
  const leadSize = 22
  const leadBase = base + 26 + baselineIn(F.sans, leadSize, 33)
  const H = Math.round(leadBase + 40)
  const s = sheet(W, H, inv)
  const body = s.body + text(F.display, upper(contact.title), pad, base, size, inv.fg) + text(F.sans, contact.lead, pad, leadBase, leadSize, inv.fg)
  return svg(W, H, `${contact.title}. ${contact.lead}`, body, s.defs)
}

// --- Write the images ------------------------------------------------------------------------------------------

mkdirSync(ASSETS, { recursive: true })
const written: string[] = []
const out = (name: string, content: string) => {
  writeFileSync(join(ASSETS, name), content)
  written.push(name)
}

/** Pads two half-width blocks to the same height, so they line up side by side. */
function pair(a: { body: string; h: number }, b: { body: string; h: number }, labels: [string, string], names: [string, string], t: Theme, gap = STACK_GAP) {
  const h = Math.ceil(Math.max(a.h, b.h)) + gap
  out(`${names[0]}-${t.name}.svg`, svg(HALF, h, labels[0], a.body))
  out(`${names[1]}-${t.name}.svg`, svg(HALF, h, labels[1], b.body))
}

const BUTTONS = {
  work: 'See my work',
  email: 'Email me',
  resume: 'Download resume',
  linkedin: 'LinkedIn',
  site: 'Visit my site',
} as const

const educationLabel = `Education. ${about.education.map((e) => `${e.years}: ${e.title}, ${e.school}.`).join(' ')}`
const nowLabel = `Now, ${formatDate(about.now.updated)}: ${(profile.openToWork ? about.now.items : about.now.items.slice(1)).join('; ')}. Languages: ${about.languages.map((l) => `${l.name}, ${l.level.toLowerCase()}`).join('; ')}.`
const half = Math.ceil(tools.rows.length / 2)
const toolRows: [typeof tools.rows, typeof tools.rows] = [tools.rows.slice(0, half), tools.rows.slice(half)]
const toolLabel = (rows: typeof tools.rows) => rows.map((row) => `${row.group}: ${row.items}.`).join(' ')

for (const t of THEMES) {
  out(`hero-${t.name}.svg`, hero(t))
  out(`btn-work-${t.name}.svg`, button(BUTTONS.work, 'primary', t))
  for (const key of ['email', 'resume', 'linkedin', 'site'] as const) out(`btn-${key}-${t.name}.svg`, button(BUTTONS[key], 'secondary', t))
  out(`head-work-${t.name}.svg`, sectionHead(work.title, t))
  out(`head-about-${t.name}.svg`, sectionHead(about.title, t))
  out(`head-tools-${t.name}.svg`, sectionHead(tools.title, t))
  for (const p of projects) out(`${p.slug}-${t.name}.svg`, projectSpec(p, t))
  out(`linkify-cover-${t.name}.svg`, linkifyCover(t))
  pair(education(t), nowAndLanguages(t), [educationLabel, nowLabel], ['education', 'now'], t)
  // The two ledger halves read as one list when stacked, so they get no gap.
  pair(ledger(toolRows[0], t), ledger(toolRows[1], t), [toolLabel(toolRows[0]), toolLabel(toolRows[1])], ['tools-1', 'tools-2'], t, 2)
  out(`contact-${t.name}.svg`, contactBand(t))
}

// --- Write the README --------------------------------------------------------------------------------------------

/** A Day/Night image pair. GitHub shows the source that matches the reader's theme. */
function picture(name: string, alt: string, width: number, ext = 'svg'): string {
  return (
    `<picture>` +
    `<source media="(prefers-color-scheme: dark)" srcset="assets/${name}-night.${ext}">` +
    `<source media="(prefers-color-scheme: light)" srcset="assets/${name}-day.${ext}">` +
    `<img src="assets/${name}-day.${ext}" width="${width}" alt="${esc(alt)}">` +
    `</picture>`
  )
}

const svgWidth = (name: string) => Number(/width="([\d.]+)"/.exec(readFileSync(join(ASSETS, `${name}-day.svg`), 'utf8'))![1])
const btn = (key: keyof typeof BUTTONS, href: string) => `<a href="${href}">${picture(`btn-${key}`, BUTTONS[key], svgWidth(`btn-${key}`))}</a>`
const mailto = `mailto:${links.email}`

const cover = (p: Project) =>
  p.slug === 'linkify' ? picture('linkify-cover', p.coverAlt, HALF) : picture(`${p.slug}-cover`, p.coverAlt, HALF, 'webp')

const projectBlocks = projects
  .map((p) => {
    const spec = readFileSync(join(ASSETS, `${p.slug}-day.svg`), 'utf8')
    const specAlt = /aria-label="([^"]*)"/.exec(spec)![1]
    return [
      `<p>`,
      `<a href="${p.caseStudy}">${cover(p)}</a>${SPACER}`,
      `<a href="${p.caseStudy}">${picture(p.slug, specAlt.replace(/&quot;/g, '"').replace(/&amp;/g, '&'), HALF)}</a>`,
      `</p>`,
      ``,
      p.more,
    ].join('\n')
  })
  .join('\n\n')

const badgeRow = [
  `<a href="${links.site}"><img src="assets/badges/88x31.svg" width="88" alt="${esc(profile.name)}, a link to my site"></a>`,
  ...badges.map((b) => `<img src="assets/badges/${b.file}" width="88" alt="${esc(b.alt)}">`),
].join('\n')

const readme = `<!--
  This file is generated. Edit src/content.ts, then run: bun install && bun run build
  The images in assets/ are drawn by src/build.ts in the OXIDE PRESS design system, like my site.
-->

<a href="${links.site}">${picture('hero', `Hi, I’m ${profile.firstName}. ${profile.role} from ${profile.country}${profile.openToWork ? ', open to work' : ''}. ${profile.facts.map((f) => `${f.label}: ${f.value}.`).join(' ')}`, FULL)}</a>

${profile.lead}

<p>
${btn('work', links.work)}
${btn('email', mailto)}
${btn('resume', links.resume)}
</p>

<h3>${picture('head-work', work.title, FULL)}</h3>

${work.intro}

${projectBlocks}

<h3>${picture('head-about', about.title, FULL)}</h3>

${about.paragraphs.join('\n\n')}

<p>
${picture('education', educationLabel, HALF)}${SPACER}
${picture('now', nowLabel, HALF)}
</p>

<h3>${picture('head-tools', tools.title, FULL)}</h3>

<p>
${picture('tools-1', toolLabel(toolRows[0]), HALF)}${SPACER}
${picture('tools-2', toolLabel(toolRows[1]), HALF)}
</p>

<h3>${picture('contact', `${contact.title}. ${contact.lead}`, FULL)}</h3>

Send me an email at **[${links.email}](${mailto})**.

<p>
${btn('email', mailto)}
${btn('linkedin', links.linkedin)}
${btn('site', links.site)}
${btn('resume', links.resume)}
</p>

<p>
${badgeRow}
</p>

<sub>The type is Anton and IBM Plex, drawn as SVG paths so it looks the same on every screen, in GitHub’s light and dark themes. The buttons above come from my site and say what it is made of. Updated ${formatDate(updated)}.</sub>
`

writeFileSync(join(ROOT, 'README.md'), readme)
console.log(`Wrote README.md and ${written.length} images to assets/`)
