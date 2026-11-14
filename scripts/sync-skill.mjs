// Copia o motor de cálculo para dentro da skill (mantém as duas cópias idênticas).
// Uso: node scripts/sync-skill.mjs
// Para gerar o .zip de upload no claude.ai: python3 scripts/empacotar-skill.py
import { copyFileSync } from 'node:fs';
copyFileSync('calculadora/motor-calculo.js', '.claude/skills/calculo-judicial/scripts/motor-calculo.js');
console.log('motor-calculo.js sincronizado com a skill.');
