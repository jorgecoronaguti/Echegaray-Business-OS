#!/usr/bin/env node
// Test de selección de skills por profundidad. Hermético, 0 DB.
import { skillsSegunProfundidad, skillsParaDirectiva, mencionaSheet, SKILL_SHEETS } from './skill-map.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

// CONSULTA DE DATO: 1 sola skill. Medido: "cuánta caja tengo hoy" cargaba 8.405 tokens de criterio
// experto (finanzas + impuestos) para una pregunta que responde una tool con el número exacto.
const caps = ['advise.finance', 'advise.tax']
check('dato → 1 skill', skillsSegunProfundidad(caps, 'cuanta caja tengo hoy', { asesoria: false }).length === 1)
check('dato → la del dominio dueño', skillsSegunProfundidad(caps, 'cuanta caja tengo hoy', { asesoria: false })[0] === 'finanzas-tesoreria-construccion')

// CONSULTA DE CRITERIO: hasta 4. Acá el conocimiento ES la respuesta; ahorrar tokens sería
// ahorrar calidad.
check('criterio → hasta 4 skills', skillsSegunProfundidad(caps, 'como mejoro el capital de trabajo', { asesoria: true }).length > 1)

// SHEET: la skill de Sheets entra igual aunque sea consulta de dato (regla obligatoria del CLAUDE.md).
const sheetDato = skillsSegunProfundidad(caps, 'leeme la pestaña de caja del sheet', { asesoria: false })
check('sheet + dato → incluye Sheets', sheetDato.includes(SKILL_SHEETS))
check('sheet + dato → 2 skills (dominio + Sheets)', sheetDato.length === 2)
check('sheet + dato → el dominio manda primero', sheetDato[0] !== SKILL_SHEETS)

// Sin capacidades no revienta.
check('sin capacidades no crashea', skillsSegunProfundidad([], 'hola', { asesoria: false }).length === 0)
check('mencionaSheet distingue', mencionaSheet('la pestaña Caja') && !mencionaSheet('cuanta plata hay'))
check('skillsParaDirectiva respeta el tope', skillsParaDirectiva(caps, 'algo del sheet', 2).length <= 2)

console.log(`\nskill-map.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
