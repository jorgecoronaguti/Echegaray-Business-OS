#!/usr/bin/env node
// Test de selección de skills por profundidad. Hermético, 0 DB.
import { skillsSegunProfundidad, skillsParaDirectiva, mencionaSheet, SKILL_SHEETS } from './skill-map.mjs'
import { classifyDirectiveMulti } from './classify-directive.mjs'

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

// FLUJO DE FONDOS — el dueño dijo textualmente que es lo primero que va a pedir. Estas preguntas
// NO llevan la palabra "sheet" y aun así son preguntas de planilla: el documento ES un Sheet.
// Medido 2026-07-20: "cómo debería estar armado el flujo de fondos" NO cargaba la skill de Sheets.
for (const q of ['como deberia estar armado el flujo de fondos', 'esta bien armado mi cash flow?',
                 'mejorame el control de gastos', 'revisa el libro iva', 'como estan los jornales cargados']) {
  check(`artefacto real activa Sheets: ${q}`, mencionaSheet(q))
}
check('sin artefacto ni palabra de planilla NO fuerza Sheets', !mencionaSheet('cuanto le debo a alumetal'))
check('pregunta de obras no fuerza Sheets', !mencionaSheet('que obras tengo activas'))
check('flujo de fondos SIN la palabra sheet igual trae la skill de Sheets',
  skillsSegunProfundidad(['advise.finance'], 'como deberia estar armado el flujo de fondos', { asesoria: false }).includes(SKILL_SHEETS))

// "estructura" pelado era contaminación: en esta empresa es el centro de costo Estructura o la
// estructura de una pestaña, no ingeniería civil.
check('"estructura" pelado no arrastra ingenieria civil',
  !classifyDirectiveMulti('que estructura tiene que tener la pestaña de egresos').includes('advise.civil'))
check('la estructura constructiva SI activa ingenieria civil',
  classifyDirectiveMulti('revisa el calculo estructural de la losa').includes('advise.civil'))

console.log(`\nskill-map.test: ${ok} OK, ${fail} FALLA`)
if (fail) process.exit(1)
