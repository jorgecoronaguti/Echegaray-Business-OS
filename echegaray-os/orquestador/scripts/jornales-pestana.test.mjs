// LO QUE SE PRUEBA ACÁ ES QUE EL CUADRO NO PUEDA VOLVER A CONGELARSE, Y QUE NINGUNA FÓRMULA APUNTE A
// LA COLUMNA DE AL LADO.
//
// Las dos formas concretas en que esta pestaña ya falló:
//   1. Un texto estampado en la corrida ("cargada hasta el 21/07") que se lee como si fuera de hoy.
//   2. Una letra de columna copiada de OTRO layout. La fila 4 de la pestaña viva usa
//      `MAXIFS($B:$B;$K:$K;">0")` y anda bien: ahí la K es el TOTAL. En el layout de este generador
//      la K es "Σ $/hora" —siempre distinta de cero—, así que la misma fórmula copiada al pie de la
//      letra contesta otra pregunta SIN dar un solo error.
import test from 'node:test'
import assert from 'node:assert/strict'
import { colDe, grilla, ultimoDiaCargado, rangosDeJornales, RANGOS_RETIRADOS } from './jornales-pestana.mjs'
import { verificarRangos, explicarProblemas } from '../lib/rangos-con-nombre.mjs'
import { VACIO, tiene } from '../lib/preservar-anotaciones.mjs'

// Bloques mínimos con la forma que `filasQuincenas` y el cuadro de oficina esperan.
const bloques = [
  { filaFecha: 6, inicio: 7, fin: 20 },
  { filaFecha: 30, inicio: 31, fin: 44 },
]
const pendientes = [{ desde: new Date(2026, 7, 1) }, { desde: new Date(2026, 7, 16) }]
const bloquesOfi = [{ mes: 6, inicio: 5, fin: 8 }, { mes: 7, inicio: 12, fin: 15 }]
const g = grilla({ bloques, pendientes, bloquesOfi })
const colA = g.filas.map((f) => String(f[0] ?? ''))

// EL ORÁCULO ES EL ENCABEZADO QUE LA GRILLA ESCRIBE DE VERDAD, NO UNA LETRA COPIADA ACÁ.
//
// La versión anterior de estos tests clavaba 'J' porque el registro tenía doce columnas. Al entrar
// "Se paga el" y "Pagado el" pasó a catorce y el TOTAL se corrió a la K — y los tests se pusieron
// rojos afirmando una letra que ya no era. Clavar la letra en el test reproduce, del lado del
// control, exactamente el defecto que el control existe para atrapar. Se lee de la fila que la
// grilla emitió: si una fórmula apunta a la columna de al lado, sigue saltando.
const encabezado = g.filas.find((f) => f[0] === 'Quincena' && f[1] === 'Hasta' && f.includes('TOTAL'))
const letraDe = (rotulo) => String.fromCharCode(65 + encabezado.indexOf(rotulo))

test('cada letra sale del encabezado real del registro, no de otro layout', () => {
  // Si alguien copia una fórmula de la pestaña viva —o de una versión anterior de este generador—
  // con la letra puesta a mano, apunta a otra columna y devuelve un número plausible y equivocado.
  assert.ok(encabezado, 'no está el encabezado del registro')
  for (const rotulo of ['Quincena', 'Hasta', 'TOTAL', 'Σ $/hora', 'Pagado el']) {
    assert.equal(colDe(rotulo), letraDe(rotulo), `"${rotulo}": colDe y el encabezado no coinciden`)
  }
  // Y las dos que más se confunden entre sí no pueden ser la misma columna.
  assert.notEqual(colDe('TOTAL'), colDe('Σ $/hora'))
})

test('una columna que ya no existe GRITA, no cae a un default', () => {
  assert.throws(() => colDe('Hs extra'), /no tiene la columna/)
})

test('el subtítulo es una fórmula viva y no trae ninguna fecha estampada', () => {
  const subtitulo = String(g.filas[1][0])
  assert.ok(subtitulo.startsWith('='), `el subtítulo quedó como texto: ${subtitulo.slice(0, 60)}`)
  assert.doesNotMatch(subtitulo.replace(/"dd\/mm\/yyyy"/g, ''), /\d{1,2}\/\d{1,2}\/\d{2,4}/)
})

test('la frescura sale del importe cargado, no del encabezado de la quincena', () => {
  // El defecto: la planilla escribe la fila de la quincena —con su "Hasta"— el día que la abre,
  // catorce días antes de que tenga un peso adentro. Un MAX sobre las fechas declara frescura por
  // un encabezado vacío.
  const subtitulo = String(g.filas[1][0])
  const T = letraDe('TOTAL'); const H = letraDe('Hasta')
  assert.match(subtitulo, new RegExp(`MAXIFS\\(\\$${H}\\$\\d+:\\$${H}\\$\\d+;\\$${T}\\$\\d+:\\$${T}\\$\\d+;">0";\\$${H}\\$\\d+:\\$${H}\\$\\d+;"<="&TODAY\\(\\)\\)`),
    `la frescura no está condicionada al TOTAL (columna ${T}): ${subtitulo.slice(0, 120)}`)
})

test('"registro cargado al …" es una FÓRMULA: era el último texto estampado de la pestaña', () => {
  // Era `cargada hasta el ${cargaAlDia}`, medido en JS sobre las horas del espejo: honesto el día que
  // se escribía y congelado a partir del siguiente.
  const nota = g.filas.map((f) => String(f[2] ?? '')).find((c) => /registro cargado/.test(c))
  assert.ok(nota, 'desapareció la nota de hasta dónde llega el registro')
  assert.ok(nota.startsWith('='), `la nota volvió a ser texto estampado: ${nota}`)
  assert.match(nota, /MAXIFS\(/)
  assert.doesNotMatch(nota, /\d{1,2}\/\d{1,2}(\/\d{2,4})?"/, 'hay una fecha estampada en la nota')
})

test('los rangos del registro son CERRADOS y arrancan donde arranca el registro', () => {
  // Abierto (`$B$83:$B`) barrería la proyección y la nómina de oficina, que también tienen fechas en
  // la columna B y hablan de otra cosa. La fila de arranque sale de DÓNDE ESTÁ el encabezado del
  // registro, no del número de sección: la sección se movió de la 4 a la 5 al entrar el bloque de
  // Dirección, y anclar en "4 · " habría medido otro bloque sin dar un solo error.
  const f0 = g.filas.indexOf(encabezado) + 2 // 1-based, y la primera fila va después del encabezado
  const subtitulo = String(g.filas[1][0])
  const H = letraDe('Hasta')
  assert.match(subtitulo, new RegExp(`\\$${H}\\$${f0}:\\$${H}\\$${f0 + bloques.length - 1}`),
    `el rango del registro no coincide con el layout (arranca en ${f0})`)
})

test('el registro conserva su encabezado completo: es el contrato de las letras', () => {
  assert.ok(encabezado, 'no está el encabezado del registro')
  assert.equal(encabezado[colDe('TOTAL').charCodeAt(0) - 65], 'TOTAL')
  assert.equal(encabezado.length, colA.length && encabezado.length, 'el encabezado no puede venir recortado')
})

test('el último día cargado del espejo se saca del MÁXIMO, no de la última celda', () => {
  // Las filas de fecha tienen huecos (feriados, días sin cuadrilla) y vienen desordenadas.
  const d = ultimoDiaCargado(['5/1', '9/1', '6/1', '', '7/1'], 2026)
  assert.equal(d.getDate(), 9)
  assert.equal(d.getMonth(), 0)
})

// ═══ LOS RANGOS CON NOMBRE, CONTRA LA GRILLA QUE LA PESTAÑA ESCRIBE DE VERDAD (03/08) ═══
//
// El defecto que trajo este bloque: de los 47 rangos con nombre del archivo, TRES apuntaban a celdas
// sin un solo dato — y `SUMPRODUCT(…*N(RANGO))` sobre celdas vacías vale 0, así que las dos líneas de
// sueldos de administración de CAJA decían $0 con el cuadro cuadrando. Ningún error, ningún descuadre.
//
// El oráculo NO es una lista de filas escrita acá: es la grilla que `grilla()` acaba de armar. Clavar
// las coordenadas en el test reproduciría, del lado del control, exactamente el defecto que el control
// existe para atrapar — que es la razón por la que estos tests leen el encabezado y no una letra.
test('NINGÚN RANGO CON NOMBRE APUNTA A CELDAS VACÍAS NI A LA COLUMNA DE AL LADO', () => {
  const problemas = verificarRangos(g.filas, rangosDeJornales(g))
  assert.deepEqual(problemas, [], explicarProblemas(problemas))
})

test('LA COLUMNA "Banco" DE OFICINA ES DEL DUEÑO: el generador NO puede emitir el centinela ahí', () => {
  // ÉSTA ES LA CAUSA RAÍZ DE `OFICINA_BANCO` CIEGO. El comentario del generador decía —desde el primer
  // día— que estas celdas no se emiten para que la fusión preserve lo que carga el dueño; el código
  // las emitía con VACIO, que significa lo contrario ("es mi celda y va vacía"), y el worker se las
  // borraba cada 2 h. Revertirlo a VACIO pone rojo esto y el test de arriba.
  const iBanco = g.filas[g.o0 - 2].indexOf('Banco')
  assert.ok(iBanco > 0, 'desapareció el encabezado "Banco" del bloque de Oficina')
  for (let r = g.o0; r <= g.oFin; r++) {
    assert.notEqual(g.filas[r - 1][iBanco], VACIO,
      `fila ${r}: la columna Banco lleva el centinela — el generador le borra al dueño lo que cargue`)
  }
})

test('el bloque de Dirección tiene el mismo cuidado en su columna "Banco"', () => {
  const iBanco = g.filas[g.d0 - 2].indexOf('Banco')
  assert.ok(iBanco > 0, 'desapareció el encabezado "Banco" del bloque de Dirección')
  for (let r = g.d0; r <= g.dFin; r++) assert.notEqual(g.filas[r - 1][iBanco], VACIO, `fila ${r}: centinela en una columna del dueño`)
})

test('OFICINA_EFECTIVO SE RETIRA: un nombre sin bloque es peor que ningún nombre', () => {
  // Quedó de la primera versión del bloque (dos columnas de entrada), clavado en la columna J filas
  // 26-37 de ese layout. Nadie lo republica, así que no se mueve nunca. Un nombre que devuelve vacío
  // da 0 en silencio; sin el nombre, la fórmula da #NAME? — ruidoso, visible, arreglable.
  const nombres = rangosDeJornales(g).map((d) => d.nombre)
  assert.ok(!nombres.includes('OFICINA_EFECTIVO'), 'no hay columna "Efectivo": el efectivo es Pagado − Banco')
  assert.ok(RANGOS_RETIRADOS.includes('OFICINA_EFECTIVO'), 'si no se retira, sigue ahí devolviendo cero para siempre')
})

test('los rangos de Oficina que SÍ funcionan siguen funcionando', () => {
  // El control de que el arreglo no rompió lo que andaba: PAGO, PAGADO y PROYECTADO tenían dato antes
  // y lo siguen teniendo. Un arreglo que apaga la señal de al lado no es un arreglo.
  const d = Object.fromEntries(rangosDeJornales(g).map((x) => [x.nombre, x]))
  for (const n of ['OFICINA_PAGO', 'OFICINA_PAGADO', 'OFICINA_PROYECTADO']) {
    const { c0, r0, r1 } = d[n]
    const con = [...Array(r1 - r0 + 1).keys()].filter((k) => tiene(g.filas[r0 - 1 + k][c0])).length
    assert.ok(con > 0, `${n} se quedó sin una sola celda con dato`)
  }
})

test('LA COLUMNA 14 DE LA GRILLA JAMÁS LLEVA EL CENTINELA — es la del dueño, no una columna de prosa', () => {
  // 4ª reincidencia del mismo borrado (06/08): vaciarColumnaDeProsa(grid, ANCHO-1) pisaba "Pagado el"
  // con VACIO después de copiarla. Este guardián escanea la grilla ENTERA: si cualquier vía futura
  // vuelve a poner el centinela en la columna del dueño, esto se pone rojo antes de llegar al Sheet.
  const g = grilla({ bloques, pendientes, bloquesOfi })
  for (const [i, fila] of g.filas.entries()) {
    assert.notEqual(fila?.[13], VACIO, `fila ${i + 1}: el centinela VACIO en la columna del dueño`)
  }
})
