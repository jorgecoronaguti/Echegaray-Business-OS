// EL ENVÍO REAL DEL 13/08 — 1 PDF + 7 HEIC, DE PUNTA A PUNTA.
//
// Lo que el dueño mandó al canal `Comprobantes-gastos`, medido:
//   · 1 PDF  (23284752589_011_00002….pdf, 85 KB)
//   · 7 archivos .HEIC (IMG_7572 … IMG_7578, 2,8–4,3 MB cada uno) — su iPhone
//
// El bot contestó «Cargué 3 comprobante(s)» y de los otros cinco no dijo NADA. Textual del dueño:
// «cargo a medias y mal lo enviado … pierdo tiempo, tengo q rehacer todo y reenviar».
//
// EL CONTRATO QUE FIJA ESTE ARCHIVO: **todo lo que se manda, entra o se nombra.** La cuenta del
// resumen tiene que cerrar contra la cantidad de adjuntos que entraron — recibidos = cargados +
// rechazados con motivo — y ese cierre es un test, no una intención.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { procesarPost, bajarAdjunto } from './flujo.mjs'
import { repoMemoria, portGuarda, mmFalso } from './dobles.mjs'
import { indexarCompras } from '../../lib/comprobantes/compras-vivas.mjs'
import { rendicionDeAdjuntos, DESTINO } from '../../lib/comprobantes/rendicion.mjs'
import { MOTIVO } from '../../lib/comprobantes/imagen.mjs'

const HEIC = readFileSync(new URL('../../lib/comprobantes/fixtures/muestra.heic', import.meta.url))
const URL_CB = 'https://chat.ecsas.com.ar/comprobantes/accion?t=SECRETO'
const ACTOR = { plataforma_user_id: 'u_jorge', plataforma_username: 'jorge', channel_type: 'P', channel_id: 'c_comprobantes' }

const LISTAS = Object.freeze({
  ok: true,
  proveedores: ['Combustibles Barcelo', 'Rodamientos Cuyo', 'VILLA DEL PINO'],
  obras: ['Administracion', 'LA ESTRELLA', 'Taller', 'TALLER', 'Vehiculos / Maquinas'],
  unidades: ['Materiales', 'Servicios'],
  categorias: ['B', 'N'],
  tiposPago: ['Efectivo', 'Transferencia', 'Cheque'],
})

/** Una lectura completa, cargable sin preguntar nada. */
const lectura = (n, over = {}) => ({
  emisor: 'Combustibles Barcelo', cuit: '30709123453', letra: 'FACTURA A',
  numero: `0113-0001${String(n).padStart(4, '0')}`, fecha: '13/08/2026',
  neto_gravado: '10.000,00', iva_21: '2.100,00', total: '12.100,00',
  condicion_venta: 'Contado', concepto: 'Nafta Super', legible: true, dudas: [], ...over,
})

/** El post EXACTO del 13/08: el PDF primero y los siete HEIC del iPhone detrás. */
function envio13Ago() {
  const archivos = { fpdf: { name: '23284752589_011_00002.pdf', mime: 'application/pdf', size: 85_000, data: '%PDF-1.4' } }
  for (let k = 0; k < 7; k++) {
    archivos[`f${k}`] = {
      // Mattermost NO siempre declara el mime del HEIC: acá llega como octet-stream, que es el caso
      // que hacía que ni la extensión lo salvara.
      name: `IMG_757${2 + k}.HEIC`, mime: 'application/octet-stream', size: 3_100_000, data: HEIC,
    }
  }
  return { archivos, fileIds: ['fpdf', ...Array.from({ length: 7 }, (_, k) => `f${k}`)] }
}

function armar({ lecturas, archivos, escribir = null } = {}) {
  const repo = repoMemoria()
  const mm = mmFalso({ archivos })
  let i = 0
  return {
    repo,
    d: {
      port: portGuarda(), repo, mattermost: mm, url: URL_CB,
      leer: async () => {
        const l = lecturas[Math.min(i++, lecturas.length - 1)]
        return l?.error ? { ok: false, error: l.error } : { ok: true, crudo: l }
      },
      listas: async () => LISTAS,
      comprasDe: async () => ({ ok: true, ...indexarCompras([]) }),
      ...(escribir ? { escribir } : {}),
    },
  }
}

const post = (fileIds) => ({
  fileIds, actor: ACTOR, channelId: 'c_comprobantes', postId: 'p1', rootPostId: 'p1',
  ahora: new Date('2026-08-13T19:23:00Z'),
})

// ── LOS OCHO ADJUNTOS ───────────────────────────────────────────────────────

test('los 7 HEIC del iPhone se BAJAN y se convierten: ya no se descartan en la puerta', async () => {
  const { archivos, fileIds } = envio13Ago()
  const mm = mmFalso({ archivos })
  for (const id of fileIds) {
    const a = await bajarAdjunto(mm, id)
    assert.equal(a.ok, true, `${id} se rechazó: ${a.error ?? ''}`)
  }
  // Y salen convertidos, con el origen declarado.
  const heic = await bajarAdjunto(mm, 'f0')
  assert.equal(heic.mediaType, 'image/jpeg')
  assert.equal(heic.convertidoDe, 'image/heic')
  assert.equal(Buffer.from(heic.data, 'base64')[0], 0xFF, 'tiene que ser un JPEG de verdad')
})

test('los 8 adjuntos del envío real terminan en el mensaje: recibidos = cargados + rechazados', async () => {
  const { archivos, fileIds } = envio13Ago()
  const { d } = armar({
    archivos,
    lecturas: Array.from({ length: 8 }, (_, k) => lectura(k)),
    escribir: async (fajo) => ({
      estado: 'cargado', texto: '✔ Cargado.',
      filas: (fajo.items ?? []).map((_, k) => 840 + k),
    }),
  })
  const r = await procesarPost(d, post(fileIds))
  assert.match(r.texto, /8 adjuntos/, 'la cuenta arranca por lo que ENTRÓ, no por lo que sobrevivió')
  assert.match(r.texto, /8 cargados ahora/, 'los ocho entraron: cinco de ellos eran HEIC')
})

test('un adjunto que NO se puede procesar aparece NOMBRADO en el resumen, con su motivo', async () => {
  const { archivos, fileIds } = envio13Ago()
  // El servidor sin convertidor de HEIC: el peor caso, y el que no puede ser silencioso.
  const mmRoto = { ...archivos }
  const { d } = armar({
    archivos: mmRoto,
    lecturas: Array.from({ length: 8 }, (_, k) => lectura(k)),
  })
  // Se fuerza el fallo de conversión por el mismo camino que lo tendría un servidor sin la lib.
  const original = d.mattermost.archivo
  d.mattermost.archivo = async (id) => (id === 'f3' ? Buffer.from('esto no es un heic') : original(id))
  const r = await procesarPost(d, post(fileIds))
  assert.match(r.texto, /8 adjuntos/)
  assert.match(r.texto, /IMG_7575\.HEIC/, 'el archivo que falló se nombra tal como lo ve el dueño')
  assert.match(r.texto, /no pude convertir|no pude leer/i, 'y con el motivo al lado')
})

test('sin convertidor de HEIC el motivo DICE QUÉ HACER, no sólo que falló', () => {
  assert.match(MOTIVO.SIN_CONVERSOR, /HEIC/)
  assert.match(MOTIVO.SIN_CONVERSOR, /JPG/)
  assert.match(MOTIVO.SIN_CONVERSOR, /Más compatible/)
})

// ── EL INVARIANTE, SOBRE LA FUNCIÓN PURA ────────────────────────────────────

test('la cuenta CIERRA siempre: cada adjunto en exactamente un destino', () => {
  const r = rendicionDeAdjuntos({
    fileIds: ['a', 'b', 'c', 'd', 'e'],
    items: [
      { origen: { fileId: 'a', nombre: 'IMG_1.HEIC' }, comprobante: { proveedor: 'X', numero: '1' }, yaCargado: { fila: 840 } },
      { origen: { fileId: 'b', nombre: 'IMG_2.HEIC' }, comprobante: { proveedor: 'X', numero: '2' }, copias: [{ fileId: 'c', nombre: 'IMG_3.HEIC' }] },
    ],
    problemas: [{ fileId: 'd', nombre: 'IMG_4.HEIC', error: MOTIVO.SIN_CONVERSOR }],
  })
  assert.equal(r.total, 5)
  const suma = Object.values(r.cuenta).reduce((a, b) => a + b, 0)
  assert.equal(suma, r.total, 'recibidos ≠ cargados + rechazados')
  assert.equal(r.cuenta[DESTINO.SIN_RASTRO], 1, 'el quinto no está en ningún lado y TIENE que declararse')
  assert.equal(r.cuadra, false, 'un agujero que se anuncia se arregla; uno que se calla vuelve')
})

test('con ocho adjuntos y ninguno perdido, la rendición cuadra', () => {
  const items = Array.from({ length: 8 }, (_, k) => ({
    origen: { fileId: `f${k}`, nombre: `IMG_757${k}.HEIC` },
    comprobante: { proveedor: 'Combustibles Barcelo', numero: `0113-0000000${k}` },
    yaCargado: { fila: 840 + k },
  }))
  const r = rendicionDeAdjuntos({ fileIds: items.map((i) => i.origen.fileId), items, problemas: [] })
  assert.equal(r.cuadra, true)
  assert.equal(r.cuenta[DESTINO.CARGADO], 8)
  assert.equal(Object.values(r.cuenta).reduce((a, b) => a + b, 0), 8)
})

// ── DEDUP CONTRA LA PESTAÑA COMPRAS ENTERA ──────────────────────────────────
//
// Pedido textual del dueño: «quiero q tenga la capacidad como por esta via directa al os de q
// distinga si el comprobante ya esta cargado en compras y no duplique». El matiz importa: NO es
// contra lo que cargó el bot (`comunicacion.comprobantes_cargados`), es contra **la pestaña Compras
// entera**, la haya cargado él a mano, Claude Code, una carga vieja o el sync.
//
// LA CLAVE. Este repo ya pagó dos veces una clave que no identificaba: «el número no identifica un
// cheque» (FISICO 313 ≠ ECHEQ 313 ⇒ (instrumento, número)) y «CUIT + número no identifica sin el
// signo» ($41,9M de notas de crédito contadas como compras). Para una compra la identidad es
// **(proveedor o CUIT, punto de venta + número, signo)**, y el importe es el que la confirma o la
// convierte en conflicto.

import { buscarEnCompras, HALLAZGO } from '../../lib/comprobantes/compras-vivas.mjs'
import { filaCompras } from './dobles.mjs'

/** Compras con 840 filas y una factura de Rodamientos Cuyo cargada A MANO por el dueño. */
function comprasCon840() {
  const filas = Array.from({ length: 836 }, () => [])
  filas.push(filaCompras('13/8/2026', 'Rodamientos Cuyo', 'F A', '0012-00050057',
    'Taller', 'Rodamientos SKF', 'Rodamientos', '$ 121.000,00', 'B'))
  return indexarCompras(filas)
}

const rodamientos = (over = {}) => ({
  proveedor: 'Rodamientos Cuyo', cuit: '30612345678', tipo: 'A',
  numero: '0012-00050057', fecha: '13/08/2026', total: 121000, ...over,
})

test('un comprobante que YA está en Compras no se vuelve a cargar, lo haya cargado quien lo haya cargado', () => {
  const r = buscarEnCompras(rodamientos(), { ok: true, ...comprasCon840() })
  assert.equal(r.que, HALLAZGO.CARGADO, 'lo cargó el dueño a mano y el bot lo tiene que ver igual')
  assert.equal(r.fila, 840)
})

test('mismo número y mismo proveedor con OTRO importe no es un duplicado: es un CONFLICTO y se avisa', () => {
  const r = buscarEnCompras(rodamientos({ total: 99000 }), { ok: true, ...comprasCon840() })
  assert.equal(r.que, HALLAZGO.PROBABLE, 'descartarlo en silencio perdería un gasto o duplicaría otro')
  assert.match(r.via, /no cierra/)
})

test('EL SIGNO PARTE LA CLAVE: una nota de crédito con el mismo número NO es la factura', () => {
  const nc = rodamientos({ tipo: 'NC', esNotaCredito: true, total: -121000 })
  const r = buscarEnCompras(nc, { ok: true, ...comprasCon840() })
  assert.equal(r, null, 'la NC tiene que poder entrar: es otra operación, con el signo contrario')
})

test('y una factura no se confunde con una nota de crédito ya cargada', () => {
  const filas = Array.from({ length: 836 }, () => [])
  filas.push(filaCompras('13/8/2026', 'Rodamientos Cuyo', 'N C', '0012-00050057',
    'Taller', '', 'Devolución', '-$ 121.000,00', 'B'))
  const r = buscarEnCompras(rodamientos(), { ok: true, ...indexarCompras(filas) })
  assert.equal(r, null)
})

test('si la fila vieja NO declara tipo, no se afirma que sean distintas: no saber no es saber', () => {
  const filas = Array.from({ length: 836 }, () => [])
  filas.push(filaCompras('13/8/2026', 'Rodamientos Cuyo', '', '0012-00050057',
    'Taller', '', 'Rodamientos', '$ 121.000,00', 'B'))
  const r = buscarEnCompras(rodamientos({ tipo: 'NC', esNotaCredito: true, total: -121000 }), { ok: true, ...indexarCompras(filas) })
  // Sin tipo en la fila, la única evidencia es el importe: -121.000 no cierra con 121.000, así que
  // no se afirma que esté cargada. Lo que NO puede pasar es que se descarte en silencio.
  assert.notEqual(r?.que, HALLAZGO.CARGADO)
})

test('es BARATO: una sola lectura de Compras por tanda, indexada, y las 840 filas se recorren una vez', () => {
  const indice = { ok: true, ...comprasCon840() }
  // 12 comprobantes contra el MISMO índice: si alguien releyera la pestaña por comprobante, esto
  // seguiría pasando pero la tanda tardaría doce veces más. El índice es un Map, no un scan.
  assert.ok(indice.porNumero instanceof Map, 'el índice es por clave, no una lista que se recorre')
  const t0 = process.hrtime.bigint()
  for (let k = 0; k < 12; k++) buscarEnCompras(rodamientos(), indice)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  assert.ok(ms < 50, `doce búsquedas tardaron ${ms.toFixed(1)}ms: dejó de ser una búsqueda por clave`)
})
