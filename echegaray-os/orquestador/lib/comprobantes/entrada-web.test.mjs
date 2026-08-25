// EL DEFECTO QUE ESTOS TESTS ATRAPAN
//
// El circuito de comprobantes contesta `estado='cargado'` en DOS situaciones opuestas: cuando
// escribió filas en Compras, y cuando no escribió ninguna porque el comprobante ya estaba (ver
// `escritura.mjs`, rama `!entran.length`). Si la pantalla mapeara ese `cargado` a «cargado» a secas,
// alguien que sube diez fotos de comprobantes ya cargados vería diez ✔ verdes y creería que sumó
// diez gastos al libro. Si se revierte `estadoDeEntrada` para mirar sólo `salida.estado`, el
// primer test de este archivo se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ENTRADA, MAX_INTENTOS, aplicarReintento, estadoDeEntrada, estadoDeExcepcion, motivoDelTexto,
  reintentable, terminal,
} from './entrada-web.mjs'

const parte = (o = {}) => ({ recibidos: 1, cargados: 0, yaEstaban: 0, copias: 0, suma: 0, ...o })

test('«cargado» sin una sola fila escrita NO se publica como cargado', () => {
  const yaEstaba = estadoDeEntrada({ estado: 'cargado', texto: 'Estos comprobantes ya estaban cargados (fila 812 de Compras). No los dupliqué.', parte: parte({ yaEstaban: 1 }) })
  assert.equal(yaEstaba.estado, ENTRADA.YA_ESTABA)

  const escrito = estadoDeEntrada({ estado: 'cargado', texto: '✔ Cargado en la fila 813.', parte: parte({ cargados: 1, suma: 912000 }) })
  assert.equal(escrito.estado, ENTRADA.CARGADO)
  assert.equal(escrito.suma, 912000)
})

test('«cargado» sin filas y sin duplicados queda esperando, nunca en verde', () => {
  const r = estadoDeEntrada({ estado: 'cargado', texto: '✔ Cargado.', parte: parte() })
  assert.equal(r.estado, ENTRADA.EN_ESPERA)
  assert.match(r.motivo, /fila/)
})

test('el freno de mano de Sheets deja el comprobante esperando, no en error', () => {
  const r = estadoDeEntrada({
    estado: 'encolado',
    texto: '🧊 **La escritura de Sheets está congelada.** No toqué nada.',
    parte: parte(),
  })
  assert.equal(r.estado, ENTRADA.EN_ESPERA)
  // Y esperando NO se reintenta: el archivo está vivo, esperando a Dirección.
  assert.equal(reintentable(r.estado, 0), false)
})

test('lo que la puerta rechaza y lo ilegible son terminales: no se reintentan', () => {
  for (const e of ['rechazado_canal', 'rechazado_permiso', 'ilegible', 'demasiados']) {
    const r = estadoDeEntrada({ estado: e, texto: 'No pude leer ninguno de los archivos.', parte: parte() })
    assert.equal(r.estado, ENTRADA.RECHAZADO, e)
    assert.equal(reintentable(r.estado, 0), false, e)
    assert.equal(terminal(r.estado), true, e)
  }
})

test('un estado desconocido nunca se declara éxito', () => {
  const r = estadoDeEntrada({ estado: 'algo_que_no_existia_ayer', parte: parte() })
  assert.equal(r.estado, ENTRADA.ERROR)
  const vacio = estadoDeEntrada({})
  assert.equal(vacio.estado, ENTRADA.ERROR)
})

test('la migración sin aplicar es reintentable: se arregla sin volver a subir el archivo', () => {
  const r = estadoDeEntrada({ estado: 'sin_esquema', texto: 'La carga de comprobantes por chat todavía no está habilitada.', parte: parte() })
  assert.equal(r.estado, ENTRADA.ERROR)
  assert.equal(aplicarReintento(r, 1).estado, ENTRADA.PENDIENTE)
  assert.equal(aplicarReintento(r, MAX_INTENTOS).estado, ENTRADA.ERROR)
})

test('«confirmar» espera a una persona y no gasta un reintento', () => {
  const r = estadoDeEntrada({ estado: 'confirmar', texto: 'Falta el proveedor.', parte: parte() })
  assert.equal(r.estado, ENTRADA.EN_ESPERA)
  assert.equal(aplicarReintento(r, 1).estado, ENTRADA.EN_ESPERA)
})

test('una excepción del worker es técnica y reintentable hasta el tope', () => {
  const v = estadoDeExcepcion(new Error('ECONNREFUSED 5432'))
  assert.equal(v.estado, ENTRADA.ERROR)
  assert.match(v.motivo, /ECONNREFUSED/)
  assert.equal(aplicarReintento(v, 1).estado, ENTRADA.PENDIENTE)
  assert.equal(aplicarReintento(v, MAX_INTENTOS).estado, ENTRADA.ERROR)
})

test('el motivo es la primera línea del mensaje del bot, sin markdown ni emoji', () => {
  assert.equal(motivoDelTexto('\n\n🧊 **La escritura está congelada.**\nsegunda línea'),
    'La escritura está congelada.')
  assert.equal(motivoDelTexto(''), null)
  assert.equal(motivoDelTexto(null), null)
})

// ── EL VEREDICTO NO SE PINTA PAREJO ──────────────────────────────────────────
//
// EL DEFECTO: cinco fotos subidas juntas son UN fajo y el circuito devuelve UN resultado. Si ese
// resultado se copiara a las cinco filas, una tanda con cuatro comprobantes cargados y uno ilegible
// mostraría cinco ✔ — y el gasto del quinto no existiría en ningún lado sin que nada lo diga.

import { repartirVeredicto } from './entrada-web.mjs'

const fila = (id, nombre) => ({ id, nombre_archivo: nombre })
const CARGADO = { estado: ENTRADA.CARGADO, motivo: 'Cargado en la fila 845.', cargados: 4, yaEstaban: 0, suma: 100 }

test('el archivo ilegible de una tanda buena se marca solo a él', () => {
  const r = repartirVeredicto(
    [fila('a', '1.jpg'), fila('b', '2.jpg'), fila('c', 'borrosa.jpg')],
    CARGADO,
    { ilegibles: [{ nombre: 'borrosa.jpg', motivo: 'no se lee el total' }], trabados: [] },
  )
  assert.deepEqual(r.map((x) => x.estado), [ENTRADA.CARGADO, ENTRADA.CARGADO, ENTRADA.RECHAZADO])
  assert.equal(r[2].motivo, 'no se lee el total')
  // Y el veredicto del lote no se pierde en los que sí entraron.
  assert.equal(r[0].cargados, 4)
})

test('lo trabado queda esperando, no rechazado', () => {
  const r = repartirVeredicto([fila('a', 'x.jpg')], CARGADO,
    { ilegibles: [], trabados: [{ nombre: 'x.jpg', motivo: 'el proveedor no está en el desplegable' }] })
  assert.equal(r[0].estado, ENTRADA.EN_ESPERA)
})

test('dos archivos con el MISMO nombre: no se adivina cuál falló', () => {
  const r = repartirVeredicto(
    [fila('a', 'IMG_0001.jpg'), fila('b', 'IMG_0001.jpg')],
    CARGADO,
    { ilegibles: [{ nombre: 'IMG_0001.jpg', motivo: 'no se lee' }], trabados: [] },
  )
  // Ninguno se marca rechazado: marcar uno sería descartar un comprobante que quizás entró.
  assert.deepEqual(r.map((x) => x.estado), [ENTRADA.CARGADO, ENTRADA.CARGADO])
  for (const x of r) assert.match(x.motivo, /no puedo afirmar cuál/)
})

test('sin detalle por archivo, todos heredan el veredicto del lote', () => {
  const r = repartirVeredicto([fila('a', '1.jpg'), fila('b', '2.jpg')], CARGADO, {})
  assert.deepEqual(r.map((x) => x.estado), [ENTRADA.CARGADO, ENTRADA.CARGADO])
  assert.deepEqual(r.map((x) => x.id), ['a', 'b'])
})


test('«confirmar» con todos ya cargados es «ya estaba», no «en espera» (Barcelo 0113-00014607, 25/08)', () => {
  const r = estadoDeEntrada({
    estado: 'confirmar',
    texto: '⚠️ Ya está cargado — Compras fila 883. No hay nada para cargar.\nObra: falta — ¿a qué obra va?',
    parte: { suma: 0, cargados: 0, yaEstaban: 1 },
  })
  assert.equal(r.estado, 'ya_estaba')
  assert.equal(r.yaEstaban, 1)
})

test('«confirmar» con algo que sí falta cargar sigue en espera', () => {
  const r = estadoDeEntrada({ estado: 'confirmar', texto: 'Obra: falta', parte: { suma: 1, cargados: 0, yaEstaban: 0 } })
  assert.equal(r.estado, 'en_espera')
})
