#!/usr/bin/env node
// Test de isBudgetingIntent (lib/budget-intent.mjs). Guard de COSTO: un read que menciona
// "presupuesto" NO debe forzar sonnet + método de presupuestación. Hermético, 0 API.
import { isBudgetingIntent } from './budget-intent.mjs'

let ok = 0, fail = 0
const yes = (t) => { if (isBudgetingIntent(t)) ok++; else { fail++; console.error(`FALLA: "${t}" → esperaba CREAR, dio false`) } }
const no = (t) => { if (!isBudgetingIntent(t)) ok++; else { fail++; console.error(`FALLA: "${t}" → esperaba read, dio true`) } }

// READS que mencionan presupuesto/cotización → NO son crear (probe: 7/7 fugaban a sonnet).
no('mostrame el presupuesto de Messina')
no('cuánto cotizamos la obra del hospital')
no('qué gasto hay en el presupuesto de la obra')
no('cuál es el presupuesto contratado de San Francisco')
no('el presupuesto de la obra ya está aprobado?')
no('comparame el presupuesto contra el costo real')
no('cuánto fue el cómputo de hormigón')
no('mostrame la cotización de Corralón')
no('la obra ya está cotizada?')          // participio, no orden
no('el presupuesto valorizado del año pasado')

// CREAR / cotizar de verdad → SÍ (necesita sonnet + método UOCRA).
yes('armá el presupuesto de la obra nueva')
yes('cotizá la obra del hospital')
yes('cotizame el galpón')
yes('necesito presupuestar la ampliación')
yes('hacé el cómputo y presupuesto de la losa')
yes('prepará una oferta para la licitación')
yes('valorizá la obra')
yes('presupuestá la ampliación')
yes('hacé una cotización para el cliente')
yes('armame el presupuesto de la casa')

// Charla/otros dominios → NO.
no('cuánto tengo en caja hoy')
no('qué obras tengo activas')

console.log(`\nbudget-intent.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
