// Everything the profile README says lives in this file.
// Edit the text here, then run `bun run build`: it redraws every image in assets/ and rewrites README.md.
// Write in sentence case; the build sets display type in capitals, like the site's CSS does.

export const updated = '2026-11-07'

const site = 'https://mounir-ghafir.mounir-ghafir-officiel.workers.dev/'

export const links = {
  site,
  work: `${site}#work`,
  resume: `${site}Mounir_Ghafir_Resume.pdf`,
  email: 'mounir.ghafir.officiel@gmail.com',
  linkedin: 'https://www.linkedin.com/in/mounir-ghafir-b4b737447/',
}

export const profile = {
  name: 'Mounir Ghafir',
  firstName: 'Mounir',
  role: 'Software developer',
  country: 'Morocco',
  /** Shows the "Open to work" stamp on the hero and the status line in Now. */
  openToWork: true,
  lead: 'I’m a software developer from Morocco. I like building useful apps that solve real problems, and I care about clean code that stays easy to change.',
  facts: [
    { label: 'Based in', value: 'Morocco' },
    { label: 'Builds', value: 'Web and Android apps' },
    { label: 'Main stack', value: 'TypeScript, React, Node.js' },
    { label: 'Trained at', value: 'ENAA, MERN stack' },
  ],
}

export const work = {
  title: 'Things I’ve built',
  intro: 'Two complete projects, each built on my own from the first screen to the tests.',
}

export type Project = {
  slug: string
  name: string
  summary: string
  facts: { label: string; value: string }[]
  stack: string[]
  caseStudy: string
  /** The line under the project, in Markdown, with its links. */
  more: string
  coverAlt: string
}

export const projects: Project[] = [
  {
    slug: 'devconnect',
    name: 'DevConnect',
    summary: 'A full-stack platform where developers post project ideas, find teammates and build together.',
    facts: [
      { label: 'Year', value: '2026' },
      { label: 'Type', value: 'Full-stack web app' },
      { label: 'Role', value: 'Solo project' },
    ],
    stack: ['React', 'TypeScript', 'Node.js', 'Express', 'MongoDB', 'Socket.IO', 'Tailwind CSS'],
    caseStudy: `${site}#/work/devconnect`,
    more: `18 pages, more than 40 API endpoints and more than 90 integration tests. [Read the case study](${site}#/work/devconnect) or [browse the source](https://github.com/freedev-lab/DevConnect).`,
    coverAlt: 'DevConnect’s Explore projects page: a search field, category and difficulty filters, and a grid of project cards.',
  },
  {
    slug: 'linkify',
    name: 'linkify',
    summary:
      'A private Android app for saving links from any app. The library stays on your phone, with optional sync through your own Google Drive.',
    facts: [
      { label: 'Year', value: '2026' },
      { label: 'Type', value: 'Android app' },
      { label: 'Role', value: 'Solo project' },
    ],
    stack: ['React Native', 'Expo', 'TypeScript', 'SQLite', 'NativeWind', 'Kotlin', 'Google Drive API'],
    caseStudy: `${site}#/work/linkify`,
    more: `English and Arabic interfaces, no servers and 82 unit tests. In testing before its Google Play release. [Read the case study](${site}#/work/linkify) or [visit the app’s page](https://linkify-privacy.pages.dev/home/).`,
    coverAlt: 'The linkify logo, two linked chain links in cream and teal, beside the word linkify and “Save links from any app in one tap.”',
  },
]

export const about = {
  title: 'About me',
  paragraphs: [
    'I earned a specialized technician diploma in full-stack web development at ISTA in Oued Zem, then completed the MERN stack program at Ahmed Hansali Digital School (ENAA) in Beni Mellal.',
    'I’m looking for my first developer job. Until then, I learn by building complete projects, from the first screen to the tests. I use AI tools to work faster and try more ideas, and I still care most about code that is clean, readable and easy to maintain.',
  ],
  education: [
    { years: '2025–2026', title: 'MERN Stack Web Development Program', school: 'Ahmed Hansali Digital School (ENAA), Beni Mellal' },
    { years: '2022–2024', title: 'Specialized Technician Diploma in Full-Stack Web Development', school: 'Specialized Institute of Applied Technology (ISTA), Oued Zem' },
  ],
  now: {
    updated: '2026-11-07',
    items: [
      'Looking for my first developer role or an internship',
      'Building new projects with the MERN stack',
      'Testing linkify’s Google Drive sync before its Google Play release',
    ],
  },
  languages: [
    { name: 'Arabic', level: 'Native' },
    { name: 'English', level: 'Intermediate' },
    { name: 'French', level: 'Basic' },
  ],
}

export const tools = {
  title: 'Tools I use',
  rows: [
    { group: 'Languages', items: 'JavaScript, TypeScript, Python' },
    { group: 'Frontend and mobile', items: 'React, Next.js, React Native, Expo, Tailwind CSS' },
    { group: 'Backend', items: 'Node.js, Express, REST APIs, Socket.IO' },
    { group: 'Databases', items: 'MongoDB, MySQL, SQLite' },
    { group: 'Testing', items: 'Node.js test runner, Supertest' },
    { group: 'Tools', items: 'Git, GitHub, Vite, Bun, AI-assisted development' },
  ],
}

export const contact = {
  title: 'Say hello',
  lead: 'Have a role, an internship or a project in mind?',
}

/** The site's 88×31 buttons, copied from the portfolio. The first one is mine and links to the site. */
export const badges = [
  { file: 'react.svg', alt: 'Made with React' },
  { file: 'vite.svg', alt: 'Bundled by Vite' },
  { file: 'typescript.svg', alt: 'Written in TypeScript' },
  { file: 'bun.svg', alt: 'Built with Bun' },
  { file: 'plex.svg', alt: 'Set in IBM Plex and Anton' },
  { file: 'screens.svg', alt: 'Works on any screen size' },
  { file: 'cookies.svg', alt: 'Zero cookies' },
  { file: 'trackers.svg', alt: 'Zero trackers' },
]

/** "2026-11-07" -> "7 Nov 2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[m - 1]} ${y}`
}
