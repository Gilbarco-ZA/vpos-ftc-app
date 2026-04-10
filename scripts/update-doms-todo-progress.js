const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '../DOMS_INTEGRATION_TODO.md');

function countCheckboxes(content) {
  const lines = content.split('\n');
  let total = 0;
  let completed = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- [x]') || trimmed.startsWith('- [ ]')) {
      total++;
      if (trimmed.startsWith('- [x]')) completed++;
    }
  }
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percentage };
}

function extractSectionProgress(content) {
  const sections = [];
  const lines = content.split('\n');
  let currentSection = null;
  let sectionContent = [];

  for (const line of lines) {
    if (line.trim().startsWith('## ')) {
      // Save previous section if it has tasks
      if (currentSection && sectionContent.length > 0) {
        const { total, completed } = countCheckboxesInArray(sectionContent);
        if (total > 0) {
          const percentage = Math.round((completed / total) * 100);
          sections.push({
            title: currentSection.replace(/^##\s+/, ''),
            completed,
            total,
            percentage
          });
        }
      }
      currentSection = line.trim();
      sectionContent = [];
    } else if (currentSection) {
      sectionContent.push(line);
    }
  }

  // Don't forget the last section
  if (currentSection && sectionContent.length > 0) {
    const { total, completed } = countCheckboxesInArray(sectionContent);
    if (total > 0) {
      const percentage = Math.round((completed / total) * 100);
      sections.push({
        title: currentSection.replace(/^##\s+/, ''),
        completed,
        total,
        percentage
      });
    }
  }

  return sections;
}

function countCheckboxesInArray(lines) {
  let total = 0;
  let completed = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- [x]') || trimmed.startsWith('- [ ]')) {
      total++;
      if (trimmed.startsWith('- [x]')) completed++;
    }
  }
  return { total, completed };
}

function generateProgressBar(percentage) {
  const filled = Math.floor(percentage / 5);
  return '█'.repeat(filled) + '░'.repeat(20 - filled);
}

function updateMarkdown() {
  let content = fs.readFileSync(FILE_PATH, 'utf-8');

  const overall = countCheckboxes(content);
  const sectionProgress = extractSectionProgress(content);

  const overallLine = `**Overall Progress: ${overall.percentage}%** (${overall.completed} / ${overall.total} tasks completed)`;

  let table = `| Section | Completed | Total | Progress |\n`;
  table += `|---------|-----------|-------|----------|\n`;

  for (const sec of sectionProgress) {
    const bar = generateProgressBar(sec.percentage);
    table += `| **${sec.title}** | ${sec.completed} | ${sec.total} | ${bar} ${sec.percentage}% |\n`;
  }

  // Remove old progress block (if any)
  content = content.replace(
    /^# DOMS Integration Todo List[\s\S]*?---\n\n/s,
    ''
  );

  // Build new header
  const newHeader = `# DOMS Integration Todo List

${overallLine}

### Per-Section Progress

${table}

---

*Last updated: ${new Date().toLocaleDateString('en-US', { 
  year: 'numeric', 
  month: 'long', 
  day: 'numeric' 
})} at ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}*

`;

  const updatedContent = newHeader + content.replace(/^# DOMS Integration Todo List\n+/, '');

  fs.writeFileSync(FILE_PATH, updatedContent, 'utf-8');

  console.log(`✅ DOMS TODO progress updated successfully!`);
  console.log(`   Overall: ${overall.completed}/${overall.total} → ${overall.percentage}%`);
  console.log(`   ${sectionProgress.length} sections tracked`);
}

updateMarkdown();