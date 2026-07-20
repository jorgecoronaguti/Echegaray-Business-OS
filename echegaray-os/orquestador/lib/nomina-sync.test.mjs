// Test hermético del sincronizador de nómina. Sin Sheet, sin Drive.
import { detectarQuincenas, filasQuincenas, hayCambio, formatSync } from './nomina-sync.mjs'

let ok = 0, falla = 0
const check = (n, c) => { if (c) ok++; else { falla++; console.error(`  FALLA: ${n}`) } }

// Grilla con la forma real: fila de fechas, bloque de personas, hueco, otra fila de fechas, bloque.
const F = (a) => [a]
const grid = [
  ['x', 'OBRERO'],            // 1
  [],                         // 2
  ['', '', '', '', '', '5/1'],// 3  ← fila de fechas del bloque 1
  ['1', 'Aguero'],            // 4
  ['2', 'Ochoa'],             // 5
  ['3', 'Rosales'],           // 6
  [],                         // 7
  ['', '', '', '', '', '16/1'],// 8 ← fila de fechas del bloque 2
  ['1', 'Aguero'],            // 9
  ['2', 'Ochoa'],             // 10
]
const b = detectarQuincenas(grid)
check('detecta los 2 bloques', b.length === 2)
check('bloque 1 arranca en la fila 4', b[0].inicio === 4)
check('bloque 1 termina en la 6', b[0].fin === 6)
check('la fila de fechas es la de arriba', b[0].filaFecha === 3)
check('bloque 2 arranca en la 9', b[1].inicio === 9 && b[1].fin === 10)
check('grilla vacía no rompe', detectarQuincenas([]).length === 0)
check('grilla sin bloques', detectarQuincenas([['x'], ['y']]).length === 0)

const filas = filasQuincenas(b)
check('7 columnas por quincena', filas[0].length === 7)
// La etiqueta es una REFERENCIA a la celda de fecha, nunca la fecha copiada.
check('la fecha se referencia, no se copia', filas[0][0].f === '=_J_OBREROS!F3')
check('el total usa el rango del bloque', filas[0][6].f === '=SUMA(_J_OBREROS!AA4:AA6)')
check('el segundo bloque usa SU rango', filas[1][6].f === '=SUMA(_J_OBREROS!AA9:AA10)')
check('ninguna celda trae un número suelto', filas.every((r) => r.every((c) => c.f && !('n' in c))))

// hayCambio: sólo se reescribe si aparecieron quincenas nuevas.
check('mismo número de quincenas → no hay cambio', !hayCambio(b, 2))
check('una quincena nueva → hay cambio', hayCambio(b, 1))
check('pestaña vacía → hay cambio', hayCambio(b, 0))

const t = formatSync({ ddjj_meses: 6, ddjj_total: 44776342, ddjj_nuevos: ['2026-07'], ddjj_faltantes: [], quincenas: 15, quincenas_nuevas: 1, escribio: true })
check('formato: avisa las DDJJ nuevas', t.includes('2026-07'))
check('formato: avisa las quincenas nuevas', t.includes('quincena(s) nueva'))
check('formato: dice que escribió', t.includes('actualizadas'))
check('formato: sin cambios lo dice', formatSync({ ddjj_meses: 6, ddjj_total: 1, quincenas: 14, escribio: false }).includes('Nada cambió'))
check('formato: error se declara', formatSync({ error: 'x' }).includes('No pude'))

console.log(`nomina-sync.test: ${ok} OK, ${falla} FALLA`)
if (falla) process.exit(1)
