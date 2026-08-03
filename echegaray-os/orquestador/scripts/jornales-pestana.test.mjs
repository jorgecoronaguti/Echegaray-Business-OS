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

test('el TOTAL de la quincena es la J en ESTE layout, no la K', () => {
  // Si alguien copia la fórmula de la pestaña viva tal cual, este test se cae. La K de acá es otra
  // columna y una fórmula contra ella devolvería un número plausible y equivocado.
  assert.equal(colDe('TOTAL'), 'J')
  assert.equal(colDe('Σ $/hora'), 'K')
  assert.equal(colDe('Hasta'), 'B')
})

test('una columna que ya no existe GRITA, no cae a un default', () => {
  assert.throws(() => colDe('Se paga el'), /no tiene la columna/)
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
  assert.match(subtitulo, /MAXIFS\(\$B\$\d+:\$B\$\d+;\$J\$\d+:\$J\$\d+;">0";\$B\$\d+:\$B\$\d+;"<="&TODAY\(\)\)/,
    `la frescura no está condicionada al TOTAL: ${subtitulo.slice(0, 120)}`)
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
  // la columna B y hablan de otra cosa. La fila de arranque sale del layout, no de un número escrito.
  const f0 = colA.findIndex((a) => /^4 · /.test(a)) + 3 // sección, encabezado, primera fila
  const subtitulo = String(g.filas[1][0])
  assert.match(subtitulo, new RegExp(`\\$B\\$${f0}:\\$B\\$${f0 + bloques.length - 1}`),
    `el rango del registro no coincide con el layout (arranca en ${f0})`)
})

test('el registro conserva su encabezado completo: es el contrato de las letras', () => {
  const hdr = g.filas.find((f) => f[0] === 'Quincena' && f[1] === 'Hasta' && f.includes('TOTAL'))
  assert.ok(hdr, 'no está el encabezado del registro')
  assert.equal(hdr[colDe('TOTAL').charCodeAt(0) - 65], 'TOTAL')
})

test('el último día cargado del espejo se saca del MÁXIMO, no de la última celda', () => {
  // Las filas de fecha tienen huecos (feriados, días sin cuadrilla) y vienen desordenadas.
  const d = ultimoDiaCargado(['5/1', '9/1', '6/1', '', '7/1'], 2026)
  assert.equal(d.getDate(), 9)
  assert.equal(d.getMonth(), 0)
})
