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
import { colDe, grilla, ultimoDiaCargado } from './jornales-pestana.mjs'

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
