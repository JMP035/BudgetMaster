#!/usr/bin/env node
// PostToolUse hook (Write|Edit): tras editar un .ts/.tsx, corre `npx tsc --noEmit`
// y devuelve el resultado para reforzar la regla de CLAUDE.md sin depender de que
// el modelo se acuerde de correrlo manualmente.

let data = '';
process.stdin.on('data', (chunk) => {
  data += chunk;
});

process.stdin.on('end', () => {
  let filePath = '';
  try {
    const input = JSON.parse(data);
    filePath = (input.tool_input && input.tool_input.file_path) || '';
  } catch (e) {
    // Input no parseable: no bloquear, simplemente no hacer nada.
    return;
  }

  if (!/\.(ts|tsx)$/.test(filePath)) {
    return;
  }

  const { execSync } = require('child_process');
  try {
    execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: 'pipe' });
    console.log('tsc --noEmit: sin errores de TypeScript.');
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    console.log('tsc --noEmit encontró errores tras la edición de ' + filePath + ':\n' + output);
  }
});
