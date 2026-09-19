import test from 'node:test'
import assert from 'node:assert/strict'
import { detectarCorrimiento, corregir, cambios, contraBanco } from './pagado-el-corrido.mjs'

// El registro real al 01/08, en seriales de Sheets. "Se paga el" es lo que calcula la pestaña;
// "Pagado el" es lo que había cargado en la columna del dueño.
// La cola del registro, CONTIGUA: cada "Se paga el" es el "Pagado el" que la fila de arriba tenía
// cargado, que es justamente la forma del corrimiento.
const REAL = [
  { quincena: '18/05–30/05', sePagaEl: 46174, pagadoEl: 46189 },
  { quincena: '01/06–15/06', sePagaEl: 46189, pagadoEl: 46204 },
  { quincena: '16/06–30/06', sePagaEl: 46204, pagadoEl: 46220 },
  { quincena: '01/07–15/07', sePagaEl: 46220, pagadoEl: 46234 },
  { quincena: '16/07–31/07', sePagaEl: 46237, pagadoEl: 46234 },
]

test('detecta el corrimiento: cada fila tiene la fecha de la SIGUIENTE', () => {
  const d = detectarCorrimiento(REAL)
  assert.equal(d.corrido, true)
  assert.equal(d.propias, 0, 'ninguna fila coincidía con su propia fecha de pago')
  assert.ok(d.coinciden > d.comparables / 2)
})

test('la última fila se contradecía sola: pagada ANTES de la fecha en que se paga', () => {
  // 16/07–31/07 se paga el 03/08 (46237) y decía pagada el 31/07 (46234). Es el síntoma que hace
  // imposible leerlo como un pago adelantado legítimo: la quincena todavía no había cerrado del todo.
  const u = REAL[REAL.length - 1]
  assert.ok(u.pagadoEl < u.sePagaEl)
})

test('NO se declara corrimiento si alguna fila ya coincide con su propia fecha', () => {
  // Si hay filas bien y filas mal, no es un corrimiento parejo: es un revoltijo, y mover la columna
  // entera rompería las que estaban bien. El guard que evita "arreglar" destruyendo.
  const mezcla = [
    { sePagaEl: 100, pagadoEl: 100 },
    { sePagaEl: 114, pagadoEl: 128 },
    { sePagaEl: 128, pagadoEl: 142 },
    { sePagaEl: 142, pagadoEl: 156 },
  ]
  assert.equal(detectarCorrimiento(mezcla).corrido, false)
})

test('con muy pocas filas no se afirma nada: dos quincenas pueden coincidir por casualidad', () => {
  assert.equal(detectarCorrimiento([{ sePagaEl: 1, pagadoEl: 2 }, { sePagaEl: 2, pagadoEl: 3 }]).corrido, false)
})

test('corregir mueve cada fecha una fila hacia abajo y deja la primera VACÍA', () => {
  const n = corregir(REAL)
  assert.equal(n[0], '', 'la fecha de la primera no está en ninguna parte: vacío es la verdad, no un invento')
  assert.equal(n[1], REAL[0].pagadoEl)
  // Las dos que confirma el extracto del Santander:
  assert.equal(n[2], 46204, '16/06–30/06 → 01/07, el lote 260701507')
  assert.equal(n[3], 46220, '01/07–15/07 → 17/07, el lote 260717507')
  // Y la que el dueño pagó el 31/07, mitad efectivo mitad transferencia, después del corte del extracto.
  assert.equal(n[4], 46234, '16/07–31/07 → 31/07')
  assert.equal(n.length, REAL.length)
})

test('la primera fila NO se rellena con su "Se paga el" — sería fabricar un hecho', () => {
  const n = corregir(REAL)
  assert.notEqual(n[0], REAL[0].sePagaEl)
})

test('el control contra el banco es POR FILA — preguntar si la fecha "existe" no controla nada', () => {
  // El primer intento contaba cuántas fechas de la columna caían en un día con lote: daba 2 antes y 2
  // después, porque el 01/07 y el 17/07 seguían estando los dos, sólo que en la fila equivocada. Un
  // control que da lo mismo con el defecto y sin él no es un control.
  const lotes = [46204, 46220] // 01/07 y 17/07
  const despues = contraBanco(REAL, corregir(REAL), lotes)
  assert.deepEqual(despues, { calzan: 2, noCalzan: 0 })
  // Y ANTES de corregir NINGUNA calzaba. Es lo que prueba que la columna estaba mal y no el banco.
  const antes = contraBanco(REAL, REAL.map((f) => f.pagadoEl), lotes)
  assert.deepEqual(antes, { calzan: 0, noCalzan: 2 })
})

test('cambios lista celda por celda qué se toca, con la quincena a la que pertenece', () => {
  const c = cambios(REAL, corregir(REAL))
  // Cambian todas menos la última, que ya tenía la fecha correcta (31/07) por el propio corrimiento.
  assert.equal(c.length, REAL.length - 1)
  assert.equal(c[0].i, 0)
  assert.equal(c[0].a, '')
  assert.ok(c.every((x) => typeof x.quincena === 'string'))
})

test('sobre una columna ya corregida, corregir de nuevo NO la vuelve a mover', () => {
  // Idempotencia: correr esto dos veces tiene que ser inofensivo, o es una trampa.
  const sano = REAL.map((f, i) => ({ ...f, pagadoEl: corregir(REAL)[i] }))
  assert.equal(detectarCorrimiento(sano).corrido, false, 'ya corregida, no vuelve a detectar corrimiento')
})
