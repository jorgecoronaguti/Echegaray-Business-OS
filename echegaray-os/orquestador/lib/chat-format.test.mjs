#!/usr/bin/env node
// Test de stripPreamble (lib/chat-format.mjs). Usa las frases REALES que aparecieron en
// producción como preámbulo que el dueño odia. Hermético. exit 0 = OK.
import { stripPreamble } from './chat-format.mjs'

let ok = 0, fail = 0
function check(n, c) { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

// --- saca el preámbulo real observado ---
check('saca "Ahora tengo todo lo que necesito. Cruzando..."',
  stripPreamble('Ahora tengo todo lo que necesito. Cruzando Corralón Progreso: hay 4 facturas pendientes por $1.200.000 en total según la planilla.').startsWith('Cruzando Corralón'))
check('saca "Tengo todos los datos. Ahora filtro..."',
  !/^Tengo todos los datos/.test(stripPreamble('Tengo todos los datos. Ahora filtro solo las filas de Corralón: quedan 3 comprobantes impagos por $800.000 en la cuenta corriente.')))
check('saca "Perfecto, " al inicio',
  stripPreamble('Perfecto, el margen de Galpones cerró en 19,9% contra 34,9% presupuestado — 15 puntos destruidos.').startsWith('el margen de Galpones'))
check('saca "Voy a revisar..." de una línea',
  stripPreamble('Voy a revisar la planilla.\nEl saldo de Santander hoy es $7.874.505 según la última fila cargada en Caja.').startsWith('El saldo de Santander'))

// --- NO toca respuestas legítimas ---
const legitimo = 'El saldo de Banco Santander hoy es $7.874.505. Efectivo: $2.279.600. Total disponible: $10.154.105.'
check('NO toca una respuesta directa', stripPreamble(legitimo) === legitimo)
check('NO toca "Ahora el saldo es X" (ahora temporal, no preámbulo)',
  stripPreamble('Ahora el saldo de la obra es negativo por $500.000 tras la última compra registrada.').startsWith('Ahora el saldo'))
const tabla = '| Obra | Margen |\n|---|---|\n| Galpones | 19,9% |\n| Pisos | 22,0% |'
check('NO toca una tabla', stripPreamble(tabla) === tabla)

// --- conservador: si al sacar queda casi nada, devuelve el original ---
check('preámbulo puro corto → devuelve original (no vacío)',
  stripPreamble('Listo, ya está.') === 'Listo, ya está.')
check('vacío/nulo no rompe', stripPreamble('') === '' && stripPreamble(null) === null)

console.log(`chat-format.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
