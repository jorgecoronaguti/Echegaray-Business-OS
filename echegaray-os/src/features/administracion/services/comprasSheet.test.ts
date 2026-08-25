import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claseDeAdjunto, conteosDe, ESTADO, filtroDe, pasa, pastillaDe, totalesDe,
  type Filtrable,
} from './comprasSheet.ts'

const fila = (p: Partial<Filtrable> = {}): Filtrable => ({
  estado: ESTADO.PAGADO, obra_texto: 'Quattropani', anulada: false, total: 1000,
  tiene_adjunto: true, ...p,
})

// ── LA PASTILLA ────────────────────────────────────────────────────────────────────────────────

test('PROYECTADO NO se muestra como «A pagar»: es una proyección, no una obligación', () => {
  // 39 de las 882 filas están así. Pintarlas de ámbar junto a las 16 pendientes diría que hay 55
  // pagos por hacer cuando hay 16.
  const p = pastillaDe(ESTADO.PROYECTADO)
  assert.equal(p.texto, 'Proyectado')
  assert.notEqual(p.color, pastillaDe(ESTADO.PENDIENTE).color)
})

test('una fila anulada se ve anulada, no pagada', () => {
  assert.equal(pastillaDe(ESTADO.ANULADA).texto, 'Anulada')
})

test('un estado que la pestaña no trae NO se asume: se dice que falta', () => {
  assert.equal(pastillaDe(null).texto, 'Sin estado')
  assert.equal(pastillaDe('').texto, 'Sin estado')
  assert.equal(pastillaDe('cualquier cosa').texto, 'Sin estado')
})

test('Pendiente es «A pagar» y Pagado es «Pagado» — los rótulos del canónico', () => {
  assert.equal(pastillaDe(ESTADO.PENDIENTE).texto, 'A pagar')
  assert.equal(pastillaDe(ESTADO.PAGADO).texto, 'Pagado')
})

// ── LOS FILTROS ────────────────────────────────────────────────────────────────────────────────

test('«A pagar» cuenta SÓLO las pendientes, no las proyectadas', () => {
  const filas = [
    fila({ estado: ESTADO.PENDIENTE }), fila({ estado: ESTADO.PROYECTADO }),
    fila({ estado: ESTADO.PAGADO }),
  ]
  assert.equal(filas.filter((f) => pasa(f, 'aPagar')).length, 1)
})

test('UNA FILA ANULADA NO APARECE EN NINGÚN FILTRO DE TRABAJO', () => {
  // Sin esto, «6 sin obra» manda a alguien a imputar seis filas muertas.
  const muerta = fila({ anulada: true, estado: ESTADO.ANULADA, obra_texto: null, tiene_adjunto: false })
  assert.equal(pasa(muerta, 'sinObra'), false)
  assert.equal(pasa(muerta, 'sinComprobante'), false)
  assert.equal(pasa(muerta, 'aPagar'), false)
})

test('pero SÍ aparece en «todo»: la cuenta de la pantalla tiene que cerrar contra la pestaña', () => {
  // El dueño ve 882 filas en su Sheet. Una pantalla que muestra 876 sin decirlo miente por omisión.
  assert.equal(pasa(fila({ anulada: true }), 'todo'), true)
})

test('«sin obra» mira el texto, y un espacio en blanco no es una obra', () => {
  assert.equal(pasa(fila({ obra_texto: '   ' }), 'sinObra'), true)
  assert.equal(pasa(fila({ obra_texto: null }), 'sinObra'), true)
  assert.equal(pasa(fila({ obra_texto: 'Taller' }), 'sinObra'), false)
})

test('«sin comprobante» trata el dato ausente como faltante, no como presente', () => {
  assert.equal(pasa(fila({ tiene_adjunto: undefined }), 'sinComprobante'), true)
  assert.equal(pasa(fila({ tiene_adjunto: false }), 'sinComprobante'), true)
  assert.equal(pasa(fila({ tiene_adjunto: true }), 'sinComprobante'), false)
})

test('un filtro que no existe vuelve a «todo» en vez de vaciar la lista', () => {
  assert.equal(filtroDe('drop table'), 'todo')
  assert.equal(filtroDe(undefined), 'todo')
  assert.equal(filtroDe('aPagar'), 'aPagar')
})

// ── LOS TOTALES ────────────────────────────────────────────────────────────────────────────────

test('las anuladas cuentan en el total de FILAS y no en los conteos de trabajo', () => {
  const t = totalesDe([
    fila({ total: 100 }),
    fila({ anulada: true, estado: ESTADO.ANULADA, total: 0, obra_texto: null, tiene_adjunto: false }),
  ])
  assert.equal(t.nTotal, 2)
  assert.equal(t.nSinObra, 0)
  assert.equal(t.nSinComprobante, 0)
  assert.equal(t.total, 100)
})

test('«A pagar» suma pendientes y NO suma proyectadas', () => {
  const t = totalesDe([
    fila({ estado: ESTADO.PENDIENTE, total: 500 }),
    fila({ estado: ESTADO.PROYECTADO, total: 9_000_000 }),
  ])
  assert.equal(t.aPagar, 500)
})

test('un total NULL no se cuenta como cero disfrazado de dato', () => {
  const t = totalesDe([fila({ total: null }), fila({ total: 250 })])
  assert.equal(t.total, 250)
})

test('el conteo de cada chip sale de la población entera, no de la página', () => {
  const c = conteosDe([
    fila({ estado: ESTADO.PENDIENTE }), fila({ obra_texto: null }),
    fila({ tiene_adjunto: false }), fila({ anulada: true }),
  ])
  assert.equal(c.todo, 4)
  assert.equal(c.aPagar, 1)
  assert.equal(c.sinObra, 1)
  assert.equal(c.sinComprobante, 1)
})

// ── EL ADJUNTO ─────────────────────────────────────────────────────────────────────────────────

test('un PDF no se dibuja como miniatura: se vería roto', () => {
  assert.equal(claseDeAdjunto('application/pdf'), 'pdf')
  assert.equal(claseDeAdjunto('image/jpeg'), 'imagen')
  assert.equal(claseDeAdjunto('image/heic'), 'imagen')
})

test('sin tipo no hay adjunto, y eso se dice — no se dibuja un hueco', () => {
  assert.equal(claseDeAdjunto(null), 'ninguno')
  assert.equal(claseDeAdjunto(undefined), 'ninguno')
  assert.equal(claseDeAdjunto(''), 'ninguno')
})

test('un tipo que no es imagen ni PDF se muestra igual, como «otro»', () => {
  assert.equal(claseDeAdjunto('application/zip'), 'otro')
})
