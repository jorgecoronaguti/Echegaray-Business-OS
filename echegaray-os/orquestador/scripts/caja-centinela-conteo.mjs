#!/usr/bin/env node
// EL CENTINELA: MIRA EL CONTEO Y LAS CELDAS QUE DESCARGAN EL CAJÓN, Y ANOTA QUÉ VIO.
//
// POR QUÉ ES UN PASO PROPIO Y NO UN TRAMO DE `caja-anexo-pestana.mjs` (15/08/2026).
//
// Porque OBSERVAR NO ES ESCRIBIR, y meter la observación adentro de un escritor la hace depender de
// que ese escritor llegue a correr. El anexo no siempre llega: se corta con `--dry`, se corta cuando la
// pestaña está bajo candado del dueño, se corta con el freno de mano puesto, se corta con un 429. Cada
// una de esas corridas es una ventana en la que el conteo pudo cambiar sin que nadie lo viera — y el
// ancla se pierde o el intervalo se ensancha en silencio, que es el defecto original.
//
// Este script NO ESCRIBE NADA EN EL SHEET, y no por promesa: pide el cliente de Google con los scopes
// de sólo lectura. Escribe únicamente en Postgres. Por eso puede correr siempre, aunque el Sheet esté
// congelado, y por eso va ANTES del anexo en el pipeline: el anexo consume el ancla que éste dejó.
//
//   node orquestador/scripts/caja-centinela-conteo.mjs [--dry]

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { DESDE_CAJA } from '../lib/caja-anexo-nombres.mjs'
import { PESTANA_ANEXO, SELLO_EFECTIVO, claveDeRotulo } from '../lib/caja-anexo.mjs'
import { CMP } from '../lib/caja-posterior-al-corte.mjs'
import { CONCEPTO, RESOLUCION_HORAS, anclaDelConteo, observarMuchas } from '../lib/caja-conteo-centinela.mjs'
import { avisoCargaTardia, cargaTardia } from '../lib/caja-carga-tardia.mjs'
import { diaDe } from '../lib/caja-ancla-por-instante.mjs'
import { ALERTA } from '../lib/glifos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const PREFIJO_COMPRAS = `${CMP.hoja}!${CMP.montoPagado}`

const num = (x) => (typeof x === 'number' ? x : (x === '' || x == null ? null : Number(String(x).replace(',', '.'))))
const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

/**
 * EL SELLO QUE LA PESTAÑA YA TIENE, para adoptarlo la primera vez.
 *
 * Se busca POR RÓTULO con la misma normalización que el anexo (`claveDeRotulo`): buscarlo por número
 * de fila es el defecto que dejó el sello sin rescatar desde que existe. Falla suave a propósito — sin
 * anexo todavía escrito no hay nada que adoptar, y eso no es un error.
 */
async function selloDeLaPestana(google) {
  const g = await google.readSheetGrid(ID, `${PESTANA_ANEXO}!A1:G`).catch(() => ({ filas: [] }))
  const sello = { serial: null, valorSellado: null }
  for (const fila of g.filas ?? []) {
    const a = claveDeRotulo(fila?.[0]?.valor)
    if (a === claveDeRotulo(SELLO_EFECTIVO.sello)) sello.serial = num(fila?.[5]?.numero)
    if (a === claveDeRotulo(SELLO_EFECTIVO.estado)) sello.valorSellado = num(fila?.[3]?.numero)
  }
  return sello
}

/**
 * Mira un conteo y lo deja anotado. Devuelve la observación, o null si la celda no es legible.
 *
 * `critico` decide con qué voz se dice que no hay conteo. El de pesos SIN conteo es una alerta: de él
 * cuelga el ancla y, con ella, el saldo inicial de los dos cash flow. El de dólares en cero es lo
 * normal —la empresa cobra, paga y decide en pesos— y gritarlo cada dos horas convertiría la marca de
 * alerta en ruido, que es exactamente cómo los avisos de verdad dejan de leerse.
 */
async function mirarConteo(google, concepto, rango, sello, ahora, { critico = false } = {}) {
  const v = await google.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' }).catch(() => null)
  const valor = num(v?.[0]?.[0])
  if (!valor) {
    // FALLA CERRADO: sin conteo legible no se inventa un ancla. La pestaña sigue publicando lo suyo y
    // el estado del anexo ya dice que no hay sello.
    console.log(critico
      ? `  ${ALERTA} ${concepto}: la celda no tiene un conteo legible — NO anclo nada, y sin ancla el efectivo publicado es el conteo tal cual`
      : `  ℹ ${concepto}: sin conteo cargado (vacío o cero) — no hay nada que anclar`)
    return null
  }
  if (DRY) { console.log(`  (dry) ${concepto} = ${valor}`); return null }
  const r = await anclaDelConteo(ID, concepto, valor, { ahora, sello })
  const cuanto = r.accion === 'cambio' ? 'CONTEO NUEVO' : (r.accion === 'primera' ? 'primera observación' : 'sin cambios')
  console.log(`  🕒 ${concepto}: ${cuanto} · ${r.ventana.texto}`)
  if (r.accion === 'sigue') {
    // La antigüedad se dice siempre: un ancla vieja no es un error, pero decidir con un conteo de hace
    // dos semanas y no saberlo, sí. Y recontar el mismo monto no se detecta — ver NO_DETECTA.
    const dias = (r.fila.vistoHasta - r.fila.vistoDesde) / 86400000
    console.log(`     el conteo lleva ${dias < 1 ? `${Math.round(dias * 24)} h` : `${dias.toFixed(1)} días`} sin cambiar (${r.fila.corridas} corridas)`)
  }
  return r
}

/**
 * LAS CELDAS DE IMPORTE QUE DESCARGAN EL CAJÓN — hoy, sólo la columna de Compras que paga en efectivo.
 *
 * EL ALCANCE ES MÍNIMO A PROPÓSITO y está medido: son ~850 celdas, cuatro lecturas de columna y una
 * tanda de upsert (500 celdas tardaron 1,2 s contra la base viva). Vigilar TODAS las fuentes que mueven
 * el cajón —Cobranzas, Jornales, Oficina, la réplica del extracto— multiplicaría eso sin cerrar el
 * mismo agujero: el caso que el dueño describió y el que cuesta plata es el PAGO cargado sobre una fila
 * vieja, que infla la caja. Lo que queda afuera está declarado en el README del paso y en el informe.
 */
async function mirarComprasEfectivo(google, ancla, ahora) {
  const col = async (r) => (await google.readSheetValues(ID, `${CMP.hoja}!${r}`, { render: 'UNFORMATTED_VALUE' }).catch(() => []))
  const [ce, pt, x, ad] = await Promise.all([
    col(`C${CMP.desde}:E`), col(`P${CMP.desde}:T`), col(`X${CMP.desde}:X`), col(`AD${CMP.desde}:AD`),
  ])
  const alto = Math.max(ce.length, pt.length, x.length, ad.length)
  const lecturas = []
  const meta = new Map()
  for (let i = 0; i < alto; i++) {
    const tipo = String(pt[i]?.[0] ?? '').trim()
    const pagado = num(pt[i]?.[4])
    if (tipo.toLowerCase() !== 'efectivo' || pagado === null) continue
    const estado = String(x[i]?.[0] ?? '').trim()
    // LA FECHA ECONÓMICA ES LA QUE USA LA FÓRMULA, o el detector mediría otra ventana que la que
    // gobierna la plata: "Pagado" va por su fecha de caja y "Pendiente" por la de la factura.
    const fecha = estado === 'Pendiente' ? num(ce[i]?.[0]) : num(ad[i]?.[0])
    const ref = `${CMP.hoja}!${CMP.montoPagado}${CMP.desde + i}`
    lecturas.push({ concepto: ref, valor: pagado })
    meta.set(ref, { fecha, etiqueta: String(ce[i]?.[2] ?? '').slice(0, 40) })
  }
  if (DRY || !lecturas.length) {
    console.log(`  (${DRY ? 'dry' : 'sin datos'}) ${lecturas.length} celda(s) de pago en efectivo en ${CMP.hoja}`)
    return null
  }
  const obs = await observarMuchas(ID, lecturas, { ahora, prefijo: PREFIJO_COMPRAS })
  const celdas = [...obs.entries()].map(([ref, o]) => ({
    referencia: ref,
    valor: o.fila.valor,
    valorPrevio: o.fila.valorPrevio,
    vistoDesde: o.fila.vistoDesde,
    primera: o.accion === 'primera',
    fecha: meta.get(ref)?.fecha ?? null,
    etiqueta: meta.get(ref)?.etiqueta ?? '',
  }))
  const r = cargaTardia(celdas, { anclaDia: diaDe(ancla?.serial), anclaInstante: ancla?.fila?.vistoDesde })
  const aviso = avisoCargaTardia(r, { marca: ALERTA, fuente: CMP.hoja })
  if (aviso) console.log(`  ${aviso}`)
  else {
    console.log(`  💵 sin carga tardía: ${r.cubiertas} celda(s) con su valor probado desde ANTES del conteo`
      + (r.sembrando
        ? ` · ${r.sembrando} que el centinela vio por primera vez DESPUÉS del conteo: sobre ésas todavía no puedo afirmar nada (se cura con el próximo conteo)`
        : ''))
  }
  for (const d of r.detalle.slice(0, 6)) console.log(`     · ${d.referencia} ${d.etiqueta} ${pesos(d.delta)}`)
  return r
}

async function main() {
  // SÓLO LECTURA, Y NO COMO PROMESA: sin `scopes` el cliente nace con los de lectura. Desde acá el
  // Sheet no se puede tocar aunque alguien agregue una llamada de escritura por error.
  const google = makeGoogleClient({ config: loadConfig() })
  const ahora = new Date()
  console.log(`CENTINELA DEL CONTEO · resolución ${RESOLUCION_HORAS} h (el período del timer): el momento se conoce como INTERVALO, nunca como instante`)
  const sello = await selloDeLaPestana(google)
  const ars = await mirarConteo(google, CONCEPTO.arqueoArs, DESDE_CAJA.arqueoArs, sello, ahora, { critico: true })
  await mirarConteo(google, CONCEPTO.arqueoUsd, DESDE_CAJA.arqueoUsd, {}, ahora)
  // EN SECO SE SIGUE IGUAL: el punto de `--dry` es ver qué haría, y cortar acá dejaba sin probar
  // justamente el tramo caro (las cuatro lecturas de Compras y cuántas celdas quedan bajo vigilancia).
  if (!ars && !DRY) {
    console.log(`  ${ALERTA} sin ancla del conteo en pesos: no puedo medir la carga tardía sobre filas viejas`)
    return
  }
  await mirarComprasEfectivo(google, ars, ahora)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(async () => { await import('../lib/db.mjs').then((m) => m.closePool()).catch(() => {}) })
}

export { mirarComprasEfectivo, selloDeLaPestana }
