const fs = require('fs')
const path = require('path')

const DEFAULT_FILE_PATH = path.join(__dirname, '../DOMS_INTEGRATION_TODO.md')
const PROGRESS_START = '<!-- doms-todo-progress:start -->'
const PROGRESS_END = '<!-- doms-todo-progress:end -->'

function countCheckboxes(content) {
  return countCheckboxesInArray(content.split('\n'))
}

function countCheckboxesInArray(lines) {
  let total = 0
  let completed = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('- [x]') || trimmed.startsWith('- [ ]')) {
      total++
      if (trimmed.startsWith('- [x]')) completed++
    }
  }

  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
  return { total, completed, percentage }
}

function stripProgressHeader(content) {
  let body = content

  if (body.includes(PROGRESS_START) && body.includes(PROGRESS_END)) {
    body = body.replace(
      new RegExp(
        `^# DOMS Integration Todo List\\n+${escapeRegExp(PROGRESS_START)}[\\s\\S]*?${escapeRegExp(PROGRESS_END)}\\n+---\\n*`,
      ),
      '',
    )
  } else {
    body = body.replace(
      /^# DOMS Integration Todo List[\s\S]*?^---\s*\n*/m,
      '',
    )
  }

  body = body.replace(/^# DOMS Integration Todo List\n+/, '')

  // Older versions wrote the Last updated line after the separator, so repeated
  // executions left multiple stale timestamp lines at the top of the report.
  body = body.replace(/^(?:\*Last updated:[^\n]*\*\s*\n+)+/i, '')

  return body.replace(/^\n+/, '')
}

function extractSectionProgress(content) {
  const sections = []
  const lines = content.split('\n')
  let currentSection = null
  let sectionContent = []

  const flushSection = () => {
    if (!currentSection || sectionContent.length === 0) return

    const { total, completed, percentage } = countCheckboxesInArray(sectionContent)
    if (total > 0) {
      sections.push({
        title: currentSection.replace(/^##\s+/, '').trim(),
        completed,
        total,
        percentage,
      })
    }
  }

  for (const line of lines) {
    if (line.trim().startsWith('## ')) {
      flushSection()
      currentSection = line.trim()
      sectionContent = []
    } else if (currentSection) {
      sectionContent.push(line)
    }
  }

  flushSection()
  return addSectionAnchors(sections)
}

function addSectionAnchors(sections) {
  const usedAnchors = new Map()

  return sections.map((section) => {
    const baseAnchor = markdownAnchor(section.title)
    const seen = usedAnchors.get(baseAnchor) ?? 0
    usedAnchors.set(baseAnchor, seen + 1)

    return {
      ...section,
      anchor: seen === 0 ? baseAnchor : `${baseAnchor}-${seen}`,
    }
  })
}

function markdownAnchor(title) {
  return title
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~[\]()/\\]/g, '')
    .replace(/&amp;/g, 'and')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function escapeMarkdownTableCell(value) {
  return String(value).replace(/\|/g, '\\|')
}

function generateProgressBar(percentage) {
  const filled = Math.floor(percentage / 5)
  return '█'.repeat(filled) + '░'.repeat(20 - filled)
}

function formatLastUpdated(now = new Date()) {
  const date = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const time = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return `*Last updated: ${date} at ${time}*`
}

function generateProgressTable(sectionProgress) {
  let table = '| Section | Completed | Total | Progress |\n'
  table += '|---------|-----------|-------|----------|\n'

  for (const sec of sectionProgress) {
    const bar = generateProgressBar(sec.percentage)
    const title = escapeMarkdownTableCell(sec.title)
    table += `| **[${title}](#${sec.anchor})** | ${sec.completed} | ${sec.total} | ${bar} ${sec.percentage}% |\n`
  }

  return table
}

function generateProgressReport(content, options = {}) {
  const body = stripProgressHeader(content)
  const overall = countCheckboxes(body)
  const sectionProgress = extractSectionProgress(body)
  const overallLine = `**Overall Progress: ${overall.percentage}%** (${overall.completed} / ${overall.total} tasks completed)`
  const table = generateProgressTable(sectionProgress)
  const lastUpdated = formatLastUpdated(options.now)

  const header = `# DOMS Integration Todo List

${PROGRESS_START}
${overallLine}

${lastUpdated}

### Per-Section Progress

${table}
${PROGRESS_END}

---

`

  return {
    content: header + body,
    overall,
    sectionProgress,
  }
}

function updateMarkdown(filePath = DEFAULT_FILE_PATH, options = {}) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const report = generateProgressReport(content, options)

  fs.writeFileSync(filePath, report.content, 'utf-8')

  if (!options.silent) {
    console.log('DOMS TODO progress updated successfully!')
    console.log(
      `   Overall: ${report.overall.completed}/${report.overall.total} -> ${report.overall.percentage}%`,
    )
    console.log(`   ${report.sectionProgress.length} sections tracked`)
    console.log('   Progress table section titles now link to their report sections')
  }

  return report
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

if (require.main === module) {
  updateMarkdown(process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_FILE_PATH)
}

module.exports = {
  PROGRESS_END,
  PROGRESS_START,
  addSectionAnchors,
  countCheckboxes,
  countCheckboxesInArray,
  extractSectionProgress,
  generateProgressBar,
  generateProgressReport,
  generateProgressTable,
  markdownAnchor,
  stripProgressHeader,
  updateMarkdown,
}
