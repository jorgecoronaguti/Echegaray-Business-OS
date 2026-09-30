// EL BOT ESCRIBIÓ DONDE NO DEBÍA — la reproducción del 30/09/2026, medida contra el Sheet y la base.
//
// ═══ LO QUE PASÓ ═══
//
// El dueño pidió que el bot de comprobantes-gastos «respete cada fila: lo que debe cargar, sin
// inventar y respetando las fórmulas». Auditando `Compras` (filas 994–1037, últimos diez días):
//
//   · Monto Pagado (U) y Estado (Y) son FÓRMULA por fila y el cargador las escribía como valor
//     (`pisaElCargador` en el contrato + `valoresInput` con `set('pagado', total)` / `set('estado',
//     …)`). ~40 filas quedaron con la fórmula muerta: U pegada con el total y Y pegada con «Pagado».
//     La 1037 quedó incoherente: Modalidad «Pago» con Estado «Pendiente» y Monto Pagado 0.
//   · La póliza de Zurich (fila 1036) salió con «Vehiculos / Maquinas» en la columna J sin ninguna
//     anotación manuscrita: la propuso el modelo por parecido («seguro de automotores»). Es una obra
//     inventada con la forma de un dato real.
//   · Los pagos de una PERSONA (el botón Pagar de la app) sí tienen que seguir escribiendo U e Y: por
//     eso la excepción no se borra, se muda de dueño (`pisaLaPersona`, que consume la puerta de la app).
//
// NÚCLEO PURO: cero Postgres, cero Mattermost, cero Google, cero modelo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { armarItem } from '../../lib/comprobantes/item.mjs'
import { valoresInput, COL_INPUT } from '../../lib/carga-comprobantes.mjs'
import {
  DECLARACION, NATURALEZA, colDelCargador, contratoContra, derivar, letrasIndebidas,
} from '../../lib/comprobantes/contrato-columnas.mjs'
import { ESCRIBIBLES } from '../../lib/pagos-de-compra.mjs'
import { COMPRAS_CON_OBRA } from '../../lib/encabezados-referencia.mjs'

// La pestaña de HOY: con «Obra» en L. U = Monto Pagado, Y = Estado.
const VIVO = contratoContra(COMPRAS_CON_OBRA)
const COL_VIVA = colDelCargador(VIVO)
const letraDe = (clave) => VIVO.find((c) => c.clave === clave)?.letra

const LISTAS = Object.freeze({
  ok: true,
  proveedores: ['ZURICH ARGENTINA Compañia de Seguros S.A.', 'Corralon Progreso'],
  obras: ['Administracion', 'MESSINA', 'Taller', 'Vehiculos / Maquinas'],
  unidades: ['Estructura', 'Obras'],
  categorias: ['B', 'N'],
})

/** La póliza de Zurich tal como la leyó la visión: SIN anotación manuscrita, con obra propuesta por el modelo. */
function lecturaZurich(over = {}) {
  return {
    emisor: 'ZURICH ARGENTINA Compañia de Seguros S.A.',
    cuit: '30500002456',
    letra: 'A',
    numero: '0904-01367735',
    fecha: '07/09/2026',
    total: '3.331.599,98',
    neto_gravado: '2.829.896,07',
    iva_21: '501.703,91',
    condicion_venta: 'Contado',
    forma_pago: 'Efectivo',
    concepto: 'Póliza de seguro de automotores, producto 904 Automotores',
    obra: 'Vehiculos / Maquinas',
    unidad_negocio: 'Estructura',
    por_que_esa_obra: 'seguro de automotores',
    anotacion_manuscrita: null,
    legible: true,
    ...over,
  }
}

// ─── (a) el cargador no escribe fórmulas de estado ──────────────────────────────────────────────

test('(a) con Modalidad = Pago el cargador NO escribe Monto Pagado ni Estado: las rinden sus fórmulas', () => {
  const v = valoresInput({
    proveedor: 'ZURICH ARGENTINA Compañia de Seguros S.A.', fecha: '07/09/2026', modalidad: 'Pago',
    total: '3.331.599,98', iva: '501.703,91', condicion: 'Contado', formaPago: 'Efectivo',
  }, COL_VIVA)
  assert.equal(v[letraDe('modalidad')], 'Pago')
  assert.equal(v[letraDe('neto')], 2829896.07)
  assert.equal(v[letraDe('pagado')], undefined, 'U es =IF(F="pago";P;0): escribirla la mataba (40 filas)')
  assert.equal(v[letraDe('estado')], undefined, 'Y es fórmula: escribirla dejó la 1037 Pago con «Pendiente»')
  assert.equal(letraDe('pagado'), 'U')
  assert.equal(letraDe('estado'), 'Y')
})

test('(a) ni el estado ni el pagado que traiga el comprobante llegan a una celda', () => {
  const v = valoresInput({ proveedor: 'X', fecha: '07/09/2026', total: '1.000,00', iva: '0', estado: 'Pagado', pagado: 1000 }, COL_VIVA)
  assert.equal(v[letraDe('pagado')], undefined)
  assert.equal(v[letraDe('estado')], undefined)
})

test('(a) la lista de columnas de input no nombra Monto Pagado ni Estado', () => {
  assert.ok(!COL_INPUT.includes('pagado'))
  assert.ok(!COL_INPUT.includes('estado'))
})

// ─── (b) sin anotación, el modelo no imputa ─────────────────────────────────────────────────────

test('(b) sin anotación manuscrita la obra que propuso el modelo se descarta (caso Zurich, fila 1036)', () => {
  const it = armarItem({ lectura: lecturaZurich(), adjunto: { fileId: 'f1', nombre: 'IMG_1.jpg' }, listas: LISTAS })
  assert.equal(it.comprobante.obra, null, '«Vehiculos / Maquinas» salió del parecido «seguro de automotores», no del papel')
  assert.equal(it.comprobante.unidad ?? null, null, 'la unidad de negocio tampoco la elige el modelo sin papel que lo respalde')
  assert.equal(it.comprobante.obraVia, null)
})

test('(b) con anotación manuscrita el modelo sigue ayudando a resolverla (HW DX 2018 → Vehiculos)', () => {
  const it = armarItem({
    lectura: lecturaZurich({ anotacion_manuscrita: 'HW DX 2018' }),
    adjunto: { fileId: 'f1', nombre: 'IMG_1.jpg' },
    listas: LISTAS,
  })
  assert.equal(it.comprobante.obra, 'Vehiculos / Maquinas')
})

test('(b) lo que la persona escribió en el mensaje sigue mandando aunque el papel no traiga anotación', () => {
  const it = armarItem({
    lectura: lecturaZurich({ obra: null }),
    adjunto: { fileId: 'f1', nombre: 'IMG_1.jpg' },
    listas: LISTAS,
    textoPost: 'Taller',
  })
  assert.equal(it.comprobante.obra, 'Taller')
  assert.equal(it.comprobante.obraVia, 'mensaje')
})

// ─── (c) el contrato: el cargador no toca U/Y; la puerta de la app sí ───────────────────────────

test('(c) Monto Pagado y Estado están prohibidos para el cargador y permitidos para la puerta de la app', () => {
  const u = letraDe('pagado')
  const y = letraDe('estado')
  const malas = letrasIndebidas([u, y], VIVO).map((m) => m.letra)
  assert.deepEqual(malas, [u, y], 'el portón del cargador rechaza las dos')
  const { LETRAS_ESCRIBIBLES, COLUMNAS_A_ESTAMPAR } = derivar(VIVO)
  assert.ok(!LETRAS_ESCRIBIBLES.includes(u) && !LETRAS_ESCRIBIBLES.includes(y), 'el cargador no las escribe')
  assert.ok(COLUMNAS_A_ESTAMPAR.includes(u) && COLUMNAS_A_ESTAMPAR.includes(y), 'se estampan: nacen con su fórmula')
  assert.ok(ESCRIBIBLES.has('Monto Pagado') && ESCRIBIBLES.has('Estado'), 'un pago de una persona sigue escribiéndolas')
})

test('(c) la excepción es de la persona, no del cargador', () => {
  const pisadasPorPersona = DECLARACION.filter((c) => c.pisaLaPersona === true).map((c) => c.rotulo).sort()
  assert.deepEqual(pisadasPorPersona, ['Estado', 'Monto Pagado'])
  assert.equal(DECLARACION.filter((c) => c.pisaElCargador === true).length, 0)
  for (const rotulo of pisadasPorPersona) {
    assert.equal(DECLARACION.find((c) => c.rotulo === rotulo).naturaleza, NATURALEZA.FORMULA_FILA)
  }
})
