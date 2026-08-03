// EL AGRUPADO Y EL MENSAJE DE CONFIRMACIÓN.
//
// Lo que se prueba acá es la decisión de producto que el dueño pidió justificar: varias fotos
// seguidas se agrupan en UNA confirmación, y lo que garantiza que nada entre dos veces NO es la
// ventana de tiempo sino la clave del comprobante.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  entraEnElFajo, colapsarRepetidos, resumenFajo, botonesFajo, preguntasDe, estaCompleto,
  etiquetaComprobante, ESTADO, VENTANA_FAJO_MIN,
} from './fajo.mjs'

const T0 = new Date('2026-08-03T10:00:00Z')
const mas = (min) => new Date(T0.getTime() + min * 60_000)

const abierto = (o = {}) => ({
  id: 'f1', estado: ESTADO.ABIERTO, plataforma_user_id: 'u1', channel_id: 'c1', ultimo_at: T0, ...o,
})

const item = (o = {}) => ({
  clave: o.clave ?? 'c:30712345678|A|0113-00010489',
  comprobante: {
    proveedor: 'Combustibles Barcelo', cuit: '30712345678', tipo: 'A', numero: '0113-00010489',
    fecha: '05/01/2026', total: 36460.30, iva: 5981, obra: 'Estrella', esNotaCredito: false,
    ...(o.comprobante ?? {}),
  },
  ...(o.extra ?? {}),
})

// ── El agrupado ──────────────────────────────────────────────────────────────

test('dos posts seguidos de la misma persona en el mismo canal entran en el mismo fajo', () => {
  assert.equal(entraEnElFajo(abierto(), { userId: 'u1', channelId: 'c1', ahora: mas(2) }), true)
})

test('pasada la ventana, es una tanda nueva', () => {
  assert.equal(entraEnElFajo(abierto(), { userId: 'u1', channelId: 'c1', ahora: mas(VENTANA_FAJO_MIN + 1) }), false)
})

test('otra persona, u otro canal, nunca comparte fajo', () => {
  assert.equal(entraEnElFajo(abierto(), { userId: 'u2', channelId: 'c1', ahora: mas(1) }), false)
  assert.equal(entraEnElFajo(abierto(), { userId: 'u1', channelId: 'c2', ahora: mas(1) }), false)
})

test('un fajo YA CONFIRMADO no recibe nada más: cargaría algo que nadie confirmó', () => {
  const f = abierto({ estado: ESTADO.CONFIRMADO })
  assert.equal(entraEnElFajo(f, { userId: 'u1', channelId: 'c1', ahora: mas(1) }), false)
})

test('no se agrupa hacia atrás: un reloj corrido no mete un comprobante en un fajo viejo', () => {
  assert.equal(entraEnElFajo(abierto(), { userId: 'u1', channelId: 'c1', ahora: mas(-3) }), false)
})

// ── La idempotencia dentro del fajo ──────────────────────────────────────────

test('la misma factura fotografiada dos veces se muestra UNA vez', () => {
  const { items, repetidos } = colapsarRepetidos([item(), item()])
  assert.equal(items.length, 1)
  assert.equal(repetidos.length, 1)
})

test('dos comprobantes distintos NO se colapsan', () => {
  const otro = item({ clave: 'c:30712345678|A|0113-00010490', comprobante: { numero: '0113-00010490' } })
  const { items } = colapsarRepetidos([item(), otro])
  assert.equal(items.length, 2)
})

test('sin clave no se colapsa: unir dos gastos distintos es peor que mostrar dos veces el mismo', () => {
  // Sin número no hay identidad posible: dos tickets ilegibles del mismo proveedor pueden ser dos
  // compras distintas, y colapsarlos borraría un gasto real.
  const sinNumero = () => item({ comprobante: { numero: null } })
  const { items } = colapsarRepetidos([sinNumero(), sinNumero()])
  assert.equal(items.length, 2)
})

test('la clave se RECALCULA del comprobante, no se cree la que venía guardada', () => {
  // Si se confiara en el campo `clave`, corregir un número mal leído dejaría la clave vieja y el
  // comprobante se deduplicaría contra otra cosa.
  const mentiroso = item({ clave: 'c:otra|cosa|distinta' })
  const { items } = colapsarRepetidos([item(), mentiroso])
  assert.equal(items.length, 1)
})

// ── Lo que falta se pregunta ─────────────────────────────────────────────────

test('un comprobante sin obra no está completo: se pregunta, no se infiere', () => {
  const sinObra = item({ comprobante: { obra: null } })
  assert.equal(estaCompleto(sinObra), false)
  assert.match(preguntasDe(sinObra).join(' '), /obra/)
})

test('un PROVEEDOR DESCONOCIDO frena la carga y se pregunta por su nombre', () => {
  const nuevo = { ...item(), proveedorNuevo: true }
  assert.equal(estaCompleto(nuevo), false)
  const p = preguntasDe(nuevo).join(' ')
  assert.match(p, /no está en la lista de Compras/)
  assert.match(p, /Combustibles Barcelo/, 'se dice QUÉ proveedor, no un "hay un problema"')
})

test('un comprobante ya cargado no se vuelve a cargar aunque esté completo', () => {
  const ya = { ...item(), yaCargado: { fila: 412 } }
  assert.equal(estaCompleto(ya), false)
})

test('un comprobante completo es cargable', () => {
  assert.equal(estaCompleto(item()), true)
})

// ── El mensaje ───────────────────────────────────────────────────────────────

test('el resumen muestra el TOTAL del papel y el importe que va a la columna M', () => {
  const t = resumenFajo({ items: [item()] })
  assert.match(t, /total \$36\.460,30/)
  assert.match(t, /IVA \$5\.981,00/)
  // 36.460,30 − 5.981,00 = 30.479,30. Sin mostrar el total, el dueño no puede verificar contra el
  // papel el único número que el papel tiene impreso grande.
  assert.match(t, /importe a Compras \$30\.479,30/)
  assert.match(t, /Confirmar/)
})

test('una nota de crédito se ANUNCIA y se muestra en negativo', () => {
  const nc = item({ comprobante: { esNotaCredito: true, tipo: 'NC', total: -9823178, iva: -1704849.90 } })
  const t = resumenFajo({ items: [nc] })
  assert.match(t, /nota de crédito: entra en negativo/)
  assert.match(t, /−\$9\.823\.178,00/)
  assert.equal(etiquetaComprobante(nc.comprobante), 'N C 0113-00010489')
})

test('si ya estaba cargado, el mensaje dice EN QUÉ FILA en vez de duplicar', () => {
  const t = resumenFajo({ items: [{ ...item(), yaCargado: { fila: 412 } }] })
  assert.match(t, /ya está cargado en la fila 412/)
  assert.match(t, /No hay nada que cargar todavía/)
})

// ── Los botones ──────────────────────────────────────────────────────────────

test('los botones llevan el secreto en la URL de integración y el id del fajo en el contexto', () => {
  const url = 'https://chat.ecsas.com.ar/comprobantes/accion?t=SECRETO'
  const [att] = botonesFajo({ id: 'f1', items: [item()] }, { url })
  const ids = att.actions.map((a) => a.id)
  assert.deepEqual(ids, ['confirmar', 'corregir', 'descartar'])
  for (const a of att.actions) {
    assert.equal(a.integration.url, url, 'el callback no trae identidad: el secreto va en la query')
    assert.equal(a.integration.context.fajo_id, 'f1')
  }
})

test('sin nada cargable NO aparece el botón de Confirmar', () => {
  const url = 'https://x/accion?t=s'
  const [att] = botonesFajo({ id: 'f1', items: [item({ comprobante: { obra: null } })] }, { url })
  assert.deepEqual(att.actions.map((a) => a.id), ['corregir', 'descartar'])
})

test('sin URL no se dibujan botones que no van a poder llamar a nadie', () => {
  assert.deepEqual(botonesFajo({ id: 'f1', items: [item()] }, {}), [])
})
