#!/usr/bin/env node
// ARMA EL ESTADO DE CUENTA DE UN CLIENTE DESDE COBRANZAS, PARA DIBUJARLO COMO RECIBO.
//
// Los recibos 2 a 17 de este cliente son un Excel exportado a PDF. Intente continuarlos leyendo el
// 17 con `find_tables` y la extraccion no recupera la grilla: celdas fusionadas, columnas corridas.
// Continuar un documento a partir de una lectura que no cierra seria poner numeros sin verificar
// delante de un cliente.
//
// Cobranzas SI es fuente de verdad, la mantiene el dueno y cada renglon de este PDF sale de una
// fila suya. El documento lo dice en el pie, que es lo que lo hace auditable.
//
// ═══ EL NÚMERO LO DA LA SERIE RC, NO ESTE ARCHIVO (dueño, 02/10/2026) ═══
//
// Antes el número estaba escrito acá ('18'), igual que el cliente y el pago: correrlo de nuevo armaba OTRO
// recibo con el número de uno ya entregado. Ahora el número sale de `recibo_serie` (migración 20261002T1200):
//   · sin `--aplicar` muestra el que TOMARÍA (último + 1) y no escribe nada: ni la serie ni el JSON. Un JSON
//     con un número no tomado se dibuja y se entrega igual, y el siguiente recibo repetiría ese número.
//   · con `--aplicar` lo toma (`tomar_numero_de_recibo('RC')`) y escribe el JSON DENTRO de la misma
//     transacción: si el archivo no se escribe, el número vuelve a la serie.
// Lo propio de cada recibo (cliente, fecha, pago) viaja en `<pago.json>`, no en el código.
// `numero` queda pelado ('20'), como lo guarda `recibo_cliente` y lo cruza el portal; `codigo` es RC-000020.
//
//   node orquestador/scripts/recibo-cliente-armar.mjs <cobranzas.json> <pago.json> <salida.json> [--aplicar]
//   pago.json = { fecha, cliente, cuit_cliente, pago: { forma, monto, aplica: [{ concepto, monto }] },
//                 filas_de_este_pago: [<fila de Cobranzas>, …] }
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { codigoDeRecibo } from '../../src/shared/recibo/codigoDeRecibo.ts'

const suma = (a) => a.reduce((s, f) => s + f.total, 0)
const porFecha = (a, b) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? ''))
const rot = (f) => f.concepto || 'Cobro a cuenta'
const fechaDicha = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** El recibo, sin base: filas de Cobranzas + el pago + el número que ya se tomó (o `null` en la vista previa). */
export function armarDatos(filas, pago, numero) {
  const util = filas.filter((f) => !/cancelar/i.test(f.estado) && (f.total || f.concepto))
  const cobrado = util.filter((f) => /cobrado/i.test(f.estado)).sort(porFecha)
  const pendiente = util.filter((f) => !/cobrado/i.test(f.estado)).sort(porFecha)
  // Las filas que este pago movió: se marcan como nuevas en el recibo.
  const estePago = new Set(pago.filas_de_este_pago ?? [])
  return {
    numero: numero == null ? null : String(numero),
    codigo: codigoDeRecibo('RC', numero),
    fecha: pago.fecha,
    cliente: pago.cliente,
    cuit_cliente: pago.cuit_cliente,
    pago: pago.pago,
    secciones: [
      { titulo: 'Cobrado', total: suma(cobrado),
        filas: cobrado.map((f) => ({ fecha: f.fecha, concepto: rot(f), forma: f.forma, monto: f.total, nuevo: estePago.has(f.fila) })) },
      { titulo: 'Pendiente de cobro', total: suma(pendiente),
        filas: pendiente.map((f) => ({ fecha: f.fecha, concepto: rot(f), forma: f.forma, monto: f.total })) },
    ],
    saldo: suma(pendiente),
    pie: `Estado de cuenta al ${fechaDicha(pago.fecha)}, generado desde la pestaña Cobranzas del Flujo de Caja de Echegaray Construcciones. Cada renglón corresponde a una fila de esa planilla.`,
  }
}

/** Lo que la serie RC daría ahora, SIN consumirlo. */
const SIN_SERIE = 'La serie RC no existe: falta aplicar la migración 20261002T1200. No tomé ni escribí nada.'

async function numeroQueTomaria(query) {
  const { rows } = await query("select ultimo from public.recibo_serie where serie = 'RC'").catch((e) => {
    if (e?.code === '42P01') throw new Error(SIN_SERIE)
    throw e
  })
  if (!rows.length) throw new Error(SIN_SERIE)
  return Number(rows[0].ultimo) + 1
}

async function main(argv) {
  const [cobranzas, pagoJson, salida] = argv.filter((a) => !a.startsWith('--'))
  if (!cobranzas || !pagoJson || !salida) {
    console.error('uso: recibo-cliente-armar.mjs <cobranzas.json> <pago.json> <salida.json> [--aplicar]')
    process.exit(2)
  }
  const filas = JSON.parse(readFileSync(cobranzas, 'utf8'))
  const pago = JSON.parse(readFileSync(pagoJson, 'utf8'))
  const { query, withTx, closePool } = await import('../lib/db.mjs')
  try {
    if (!argv.includes('--aplicar')) {
      const datos = armarDatos(filas, pago, null)
      const siguiente = await numeroQueTomaria(query)
      console.log(`VISTA PREVIA · tomaría ${codigoDeRecibo('RC', siguiente)} (no se consumió) · no escribí ${salida}`)
      console.log('cobrado', datos.secciones[0].total.toLocaleString('es-AR'), '| pendiente', datos.saldo.toLocaleString('es-AR'))
      return
    }
    const datos = await withTx(async (c) => {
      const { rows } = await c.query("select public.tomar_numero_de_recibo('RC') as n")
      const d = armarDatos(filas, pago, Number(rows[0].n))
      writeFileSync(salida, JSON.stringify(d, null, 1))
      return d
    })
    console.log(`TOMADO ${datos.codigo} · escrito ${salida}`)
  } finally {
    await closePool()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2))
