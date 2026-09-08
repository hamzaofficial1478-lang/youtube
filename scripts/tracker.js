'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const build=JSON.parse(fs.readFileSync(path.join(root,'docs/build-status.json'),'utf8'));
const tasks=build.phases.flatMap(p=>p.tasks);
const lines=[`Completed: ${tasks.filter(t=>t.status==='done').length} / ${tasks.length} tracked work items. These items have different sizes; this is not a percentage of total engineering effort.`, ''];
for(const phase of build.phases){lines.push(`### ${phase.title}`, '', phase.goal, '');for(const task of phase.tasks)lines.push(`- [${task.status==='done'?'x':' '}] **${task.id} ${task.title}** (${task.status}) - ${task.evidence||task.remaining}`);lines.push('');}
const file=path.join(root,'docs/BUILD-PROGRESS.md');
const source=fs.readFileSync(file,'utf8');
if(!source.includes('<!-- CHECKLIST:START -->')||!source.includes('<!-- CHECKLIST:END -->'))throw new Error('Progress checklist markers are missing.');
fs.writeFileSync(file,source.replace(/<!-- CHECKLIST:START -->[\s\S]*?<!-- CHECKLIST:END -->/,`<!-- CHECKLIST:START -->\n${lines.join('\n')}\n<!-- CHECKLIST:END -->`));
console.log(`Progress ledger refreshed: ${tasks.filter(t=>t.status==='done').length}/${tasks.length} work items complete.`);
