// Test hermético del sincronizador de nómina. Sin Sheet, sin Drive.
import { detectarQuincenas, filasQuincenas, hayCambio, cuerpoDelCuadro, ubicarCuadro, formatSync } from './nomina-sync.mjs'

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
// Tiene que coincidir EXACTO con las 10 columnas de la pestaña. Devolvía 7 (de un layout viejo):
// como sólo escribe cuando algo cambia y nada había cambiado, nunca se notó — la primera quincena
// nueva habría reescrito el cuadro con las columnas corridas.
check('11 columnas por quincena, como la pestaña', filas[0].length === 11)
// La etiqueta es una REFERENCIA a la celda de fecha, nunca la fecha copiada.
check('la fecha se referencia, no se copia', filas[0][0].f === "='_J_OBREROS'!F3")
// El "Hasta" busca la POSICIÓN del último día cargado, no cuántos días hay: las filas de fecha
// tienen huecos y COUNTA dejaba la celda vacía (bloque del 16/3: COUNTA 12, última posición 14).
check('Hasta busca la posición del último, no cuenta', filas[0][1].f.includes('MAX(') && !filas[0][1].f.includes('COUNTA('))
check('Σ del jornal por hora del plantel sale de la columna W', filas[0][10].f === "=SUM('_J_OBREROS'!W4:W6)")
check('el total usa el rango del bloque', filas[0][9].f === "=SUM('_J_OBREROS'!AA4:AA6)")
check('el segundo bloque usa SU rango', filas[1][9].f === "=SUM('_J_OBREROS'!AA9:AA10)")
// Las hs correspondientes se autorreferencian: dependen de la fila donde va a quedar la quincena.
check('hs correspondientes referencian su propia fila', filas[0][4].f === "=C6*D6*'Parámetros'!$B$43")
check('la segunda quincena referencia la fila 7', filas[1][4].f === "=C7*D7*'Parámetros'!$B$43")
check('ninguna celda trae un número suelto', filas.every((r) => r.every((c) => c.f && !('n' in c))))

// cuerpoDelCuadro: dónde termina el cuerpo. Contar "celdas no vacías de la columna A" daba 30
// quincenas donde hay 14, porque debajo viven los bloques POR CLIENTE y PROYECCIÓN — el agente
// habría creído que cambió algo en cada corrida.
{
  const colA = [['5/1'], ['16/1'], ['2/2'], ['TOTAL AÑO'], [''], ['POR CLIENTE'], ['San Francisco'], ['PROYECCIÓN']]
  const c = cuerpoDelCuadro(colA, 6)
  check('el cuerpo termina en el TOTAL, no en la última celda con texto', c.filas === 3)
  check('la fila del TOTAL se ubica bien', c.filaTotal === 9)
}
check('pestaña sin TOTAL todavía: cuenta lo que hay', cuerpoDelCuadro([['5/1'], ['16/1']], 6).filas === 2)
check('pestaña vacía', cuerpoDelCuadro([], 6).filas === 0)

// ubicarCuadro: el agente NO puede asumir en qué fila arranca el cuadro. El 20/07 el dueño borró
// tres filas de arriba, el cuadro pasó de la 6 a la 3 y el agente escribió igual en la 6: duplicó
// tres quincenas y dejó el total corto $3.011.996.
{
  const colA = [['JORNALES POR QUINCENA'], ['Desde'], ['5/1/2026'], ['16/1/2026'], ['TOTAL AÑO'], [''], ['POR CLIENTE']]
  const u = ubicarCuadro(colA)
  check('encuentra el cuadro por el encabezado "Desde"', u.encontrado && u.filaInicio === 3)
  check('cuenta las quincenas que hay', u.filas === 2)
  check('ubica el TOTAL', u.filaTotal === 5)
}
{
  const corrido = [[''], [''], [''], [''], [''], ['Desde'], ['5/1/2026'], ['TOTAL AÑO']]
  check('si el cuadro está más abajo, lo sigue', ubicarCuadro(corrido).filaInicio === 7)
}
check('sin encabezado no inventa una fila', ubicarCuadro([['hola'], ['chau']]).encontrado === false)

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
