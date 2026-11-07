// Draws the images in assets/ and writes README.md, from the text in src/content.ts.
//
// GitHub shows a README without custom fonts or CSS, so the display type is drawn here:
// Anton and IBM Plex are turned into SVG paths, which look the same on every screen.
// Each image comes in a Day version (paper and ink) and a Night version (iron and bone);
// <picture> picks the one that matches the reader's GitHub theme.
//
// Run: bun install && bun run build
//
// Design note (DESIGN.md §0.6). Stock: Ledger paper, with a Night version of every image; texture
// level 1 (grain on the greeting sheet and the closing band only, off in high-contrast mode).
// Density: Poster. The one loud element is the greeting. Devices: opener rules on the two real
// sections, and one misregistered headline (the decorative one).

import opentype from 'opentype.js'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { greeting, intro, stack, thanks, whatIDo } from './content'

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
}

/** Cap height of a font, in px at `size`. */
const capH = (font: Font, size: number) => (font.tables.os2.sCapHeight / font.unitsPerEm) * size
/** Baseline inside a CSS line box of height `lh`, measured from the top of the box. */
const baselineIn = (font: Font, size: number, lh: number) => {
  const asc = font.ascender / font.unitsPerEm
  const desc = -font.descender / font.unitsPerEm
  return (lh - (asc + desc) * size) / 2 + asc * size
}

function glyphCount(font: Font, str: string): number {
  const missing = [...str].filter((ch) => ch !== ' ' && font.charToGlyphIndex(ch) === 0)
  if (missing.length) throw new Error(`Font ${font.names.fullName.en} has no glyph for "${missing.join('')}" in "${str}"`)
  return font.stringToGlyphs(str).length
}

/** Width of a run of text, with kerning and tracking (in em) between glyphs. */
function measure(font: Font, str: string, size: number, tracking = 0): number {
  const n = glyphCount(font, str)
  return font.getAdvanceWidth(str, size, { kerning: true }) + tracking * size * Math.max(0, n - 1)
}

/**
 * Each glyph outline is drawn once per document, in <defs>, and every occurrence is a <use>.
 * GLYPHS holds the outline of every glyph used so far, by id; svg() copies the ones a document uses.
 */
const GLYPHS = new Map<string, string>()
const FONT_KEYS = new Map<Font, string>(Object.entries(F).map(([key, font]) => [font, key]))

/** One line of text, as glyph references. `y` is the baseline. */
function text(font: Font, str: string, x: number, y: number, size: number, fill: string): string {
  // Small text needs less precision: 0.1 px is a fifth of a device pixel on a 2x screen.
  const dec = size >= 30 ? 2 : 1
  const round = (n: number) => Number(n.toFixed(dec))
  const uses: string[] = []
  glyphCount(font, str)
  font.forEachGlyph(str, x, y, size, { kerning: true }, (glyph, gx, gy) => {
    const d = glyph.getPath(0, 0, size).toPathData(dec)
    if (!d) return // spaces
    const id = `${FONT_KEYS.get(font)}${size}-${glyph.index}`
    GLYPHS.set(id, d)
    uses.push(`<use href="#${id}" x="${round(gx)}" y="${round(gy)}"/>`)
  })
  return `<g fill="${fill}">${uses.join('')}</g>`
}

/** Greedy line breaking at spaces. */
function wrap(font: Font, str: string, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of str.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(font, next, size) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  for (const l of lines) {
    if (measure(font, l, size) > maxWidth + 0.5) throw new Error(`"${l}" is wider than ${maxWidth}px`)
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
  fg: string
  line: string
  lineSoft: string
  accent: string
  /** Grain tile colour (r, g, b) and alpha, as in the kit's feColorMatrix. */
  grain: [number, number, number, number]
}

const DAY: Theme = {
  name: 'day', bg: '#E9E3D1', fg: '#16211F', line: '#16211F', lineSoft: '#C9C2AC', accent: '#3F6F6D',
  grain: [0.09, 0.13, 0.12, 0.2],
}

const NIGHT: Theme = {
  name: 'night', bg: '#16211F', fg: '#E9E3D1', line: '#CFCBB9', lineSoft: '#33443F', accent: '#5E8C88',
  grain: [0.91, 0.89, 0.82, 0.14],
}

/** The closing band is an inverted sheet, like the site's: iron on a Day page, paper on a Night page. */
const invert = (t: Theme) => (t.name === 'day' ? NIGHT : DAY)

// --- SVG helpers -----------------------------------------------------------------------------------

function svg(w: number, h: number, label: string, body: string, defs = ''): string {
  const ids = [...new Set([...body.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))].sort()
  const glyphs = ids.map((id) => `<path id="${id}" d="${GLYPHS.get(id)}"/>`).join('')
  const allDefs = defs + glyphs
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r(w)}" height="${r(h)}" viewBox="0 0 ${r(w)} ${r(h)}" role="img" aria-label="${esc(label)}">` +
    `<title>${esc(label)}</title>${allDefs ? `<defs>${allDefs}</defs>` : ''}${body}</svg>\n`
  )
}

const rect = (x: number, y: number, w: number, h: number, fill: string) =>
  `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" fill="${fill}"/>`

/** A paper (or iron) sheet with grain behind the content (DESIGN.md §6, level 1). Same noise as the kit. */
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
 * The two sections sit side by side, separated by SPACER (about 25 px of text spaces), and stack on
 * narrower screens. Both plus the spacer fit in the 838 px column of the repository page.
 */
const HALF = 400
const SPACER = '&ensp;&emsp;'
/** Transparent space under each section, so they do not touch when stacked on phones. */
const STACK_GAP = 16

// --- The greeting -----------------------------------------------------------------------------------

/** The one loud element: the greeting on a paper sheet, with a 2-3px teal misregistration plate. */
function hero(t: Theme): string {
  const W = FULL
  const pad = 28
  const words = greeting.split(' ')
  const lines = [upper(words.slice(0, 2).join(' ')), upper(words.slice(2).join(' '))] // "HI, I'M" / "MOUNIR GHAFIR"
  const S = Math.min(150, Math.floor((W - pad * 2 - 4) / (measure(F.display, lines[1], 100) / 100)))
  const cap = capH(F.display, S)
  const base1 = 34 + cap
  const line1Bottom = F.display.getPath(lines[0], 0, base1, S).getBoundingBox().y2
  const base2 = Math.max(base1 + S * 0.96, line1Bottom + 12 + cap)
  const off = { x: S * 0.018, y: S * 0.014 }
  const parts: string[] = []
  for (const [color, dx, dy] of [[t.accent, off.x, off.y], [t.fg, 0, 0]] as const) {
    parts.push(text(F.display, lines[0], pad + dx, base1 + dy, S, color))
    parts.push(text(F.display, lines[1], pad + dx, base2 + dy, S, color))
  }
  const H = Math.round(base2 + 36)
  const s = sheet(W, H, t)
  return svg(W, H, greeting, s.body + parts.join(''), s.defs)
}

// --- The two sections ----------------------------------------------------------------------------------

type Row = { label?: string; text: string }

/** A section: 4px opener rule, display title, then a ruled list like the site's skills ledger. */
function section(title: string, rows: Row[], t: Theme): { body: string; h: number } {
  const W = HALF
  const size = 48
  const parts: string[] = [rect(0, 0, W, 4, t.line)]
  const titleBase = 4 + 14 + capH(F.display, size)
  parts.push(text(F.display, upper(title), 0, titleBase, size, t.fg))
  let y = titleBase + 18
  parts.push(rect(0, y, W, 2, t.line))
  y += 2
  const fs = 16
  const lh = 24
  for (const row of rows) {
    y += 12
    if (row.label) {
      parts.push(text(F.sansSemi, row.label, 0, y + baselineIn(F.sansSemi, fs, lh), fs, t.fg))
      y += lh + 2
    }
    for (const line of wrap(F.sans, row.text, fs, W)) {
      parts.push(text(F.sans, line, 0, y + baselineIn(F.sans, fs, lh), fs, t.fg))
      y += lh
    }
    y += 12
    parts.push(rect(0, y, W, 1, t.lineSoft))
    y += 1
  }
  return { body: parts.join(''), h: y }
}

// --- The closing line ------------------------------------------------------------------------------------

/** The thank-you line as a statement band (DESIGN.md §13.1), inverted like the site's contact band. */
function band(t: Theme): string {
  const inv = invert(t)
  const W = FULL
  const pad = 32
  // Quieter than the greeting (DESIGN.md §1.4, NN-08: one loud element), and set on one line.
  const words = upper(thanks.replace(/\.$/, ''))
  const size = Math.min(64, Math.floor((W - pad * 2) / (measure(F.display, words, 100) / 100)))
  const lines = wrap(F.display, words, size, W - pad * 2)
  const cap = capH(F.display, size)
  const parts: string[] = []
  let base = 38 + cap
  for (const line of lines) {
    parts.push(text(F.display, line, pad, base, size, inv.fg))
    base += size * 0.95
  }
  const H = Math.round(base - size * 0.95 + 38)
  const s = sheet(W, H, inv)
  return svg(W, H, thanks, s.body + parts.join(''), s.defs)
}

// --- Write the images -----------------------------------------------------------------------------------------

rmSync(ASSETS, { recursive: true, force: true })
mkdirSync(ASSETS, { recursive: true })
const written: string[] = []
const out = (name: string, content: string) => {
  writeFileSync(join(ASSETS, name), content)
  written.push(name)
}

const stackRows: Row[] = stack.rows.map((row) => ({ label: row.group, text: row.items }))
const doRows: Row[] = whatIDo.items.map((item) => ({ text: item }))
const stackLabel = `${stack.title}. ${stack.rows.map((row) => `${row.group}: ${row.items}.`).join(' ')}`
const doLabel = `${whatIDo.title}. ${whatIDo.items.join(' ')}`

for (const t of [DAY, NIGHT]) {
  out(`greeting-${t.name}.svg`, hero(t))
  // Side by side, the two sections line up at the top (align="top" in the README), so each one
  // keeps its own height and no empty space is left under the shorter one when they stack.
  const a = section(stack.title, stackRows, t)
  const b = section(whatIDo.title, doRows, t)
  out(`stack-${t.name}.svg`, svg(HALF, Math.ceil(a.h) + STACK_GAP, stackLabel, a.body))
  out(`what-i-do-${t.name}.svg`, svg(HALF, Math.ceil(b.h) + STACK_GAP, doLabel, b.body))
  out(`thanks-${t.name}.svg`, band(t))
}

// --- Write the README --------------------------------------------------------------------------------------------

/** A Day/Night image pair. GitHub shows the source that matches the reader's theme. */
function picture(name: string, alt: string, width: number, align = ''): string {
  return (
    `<picture>` +
    `<source media="(prefers-color-scheme: dark)" srcset="assets/${name}-night.svg">` +
    `<source media="(prefers-color-scheme: light)" srcset="assets/${name}-day.svg">` +
    `<img src="assets/${name}-day.svg" width="${width}"${align ? ` align="${align}"` : ''} alt="${esc(alt)}">` +
    `</picture>`
  )
}

const readme = `<!--
  This file is generated. Edit src/content.ts, then run: bun install && bun run build
  The images in assets/ are drawn by src/build.ts in the OXIDE PRESS design system, like my site.
-->

<p>${picture('greeting', greeting, FULL)}</p>

${intro.join('\n\n')}

<p>
${picture('stack', stackLabel, HALF, 'top')}${SPACER}
${picture('what-i-do', doLabel, HALF, 'top')}
</p>

<p>${picture('thanks', thanks, FULL)}</p>
`

writeFileSync(join(ROOT, 'README.md'), readme)
console.log(`Wrote README.md and ${written.length} images to assets/`)
