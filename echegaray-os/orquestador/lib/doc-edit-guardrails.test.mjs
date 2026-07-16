#!/usr/bin/env node
// Test de los guardarraíles de edición (extraerRestricciones). Hermético: sin red/DB.
// Cubre las frases REALES del dueño que motivaron el fix y evita falsos positivos
// (un verbo de quitar lejano no debe engancharse a un sustantivo de otra cláusula).
import { extraerRestricciones, DOCTRINA_EDICION, VERIFICACION_EDICION } from './doc-edit-guardrails.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }
const nReglas = (txt) => extraerRestricciones(txt).length
const tieneGrafico = (txt) => extraerRestricciones(txt).some((r) => /gr[aá]fico/i.test(r))

// Frases reales (captura del chat, jul-2026).
check('quitaras los graficos → 1', nReglas('te dije q le quitaras los graficos') === 1)
check('quitaras → detecta gráfico', tieneGrafico('te dije q le quitaras los graficos'))
check('sacá los gráficos (acento) → detecta gráfico', tieneGrafico('sacá los gráficos y dejá formato sobrio'))
check('sacá gráficos + dejá formato → NO engancha formato (1 regla)', nReglas('sacá los gráficos y dejá formato sobrio') === 1)
check('sin colores ni gráficos → 2', nReglas('reconstruí el resumen sin colores ni gráficos') === 2)
check('no relleno de color → 1', nReglas('no pongas relleno de color, quiero sobrio') === 1)
check('sin negrita ni formato → 1', nReglas('sin negrita ni formato raro') === 1)

// Sin restricciones: NO inventar.
check('pedido normal → 0', nReglas('hace tablas dinamicas de todo para q actualice solo') === 0)
check('armar tabla → 0', nReglas('armá una tabla de gastos por proveedor') === 0)
check('vacío → 0', nReglas('') === 0)

// Las constantes de guía existen y no están vacías.
check('DOCTRINA no vacía', typeof DOCTRINA_EDICION === 'string' && DOCTRINA_EDICION.length > 100)
check('VERIFICACION no vacía', typeof VERIFICACION_EDICION === 'string' && /RELE[EÉ]/.test(VERIFICACION_EDICION))

console.log(`\ndoc-edit-guardrails.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
