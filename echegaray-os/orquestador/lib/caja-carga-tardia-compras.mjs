// LA MEDICIÓN DE CARGA TARDÍA SOBRE COMPRAS — leer la pestaña, observar las celdas, sacar el número.
//
// POR QUÉ VIVE EN SU PROPIO ARCHIVO. Lo necesitan DOS: el paso del centinela (que lo grita por el log
// de la corrida) y el generador del anexo (que lo publica en la pestaña, que es donde el dueño mira).
// Escrito dos veces, el número del log y el de la pestaña podrían empezar a discrepar — y el día que
// discrepen, ninguno de los dos significaría nada.
//
// EL ALCANCE ES MÍNIMO Y ESTÁ MEDIDO: la columna de "Monto Pagado" de Compras, filtrada por tipo de
// pago "Efectivo". Son 439 celdas hoy, una lectura de la pestaña, ~1,5 s. Vigilar TODAS las fuentes
// que mueven el cajón —Cobranzas, Jornales, Oficina, la réplica del extracto— multiplicaría el costo
// sin cerrar el mismo agujero: el caso que el dueño describió, y el único que INFLA la caja, es el
// PAGO cargado sobre una fila vieja. Lo que queda afuera está declarado abajo, no cerrado en silencio.
//
// ═══ LAS COLUMNAS, POR RÓTULO (14/09/2026) ═══
//
// Leía `C:E`, `P:T`, `X` y `AD` e indexaba `pt[i][4]`: con «Obra» insertada en Compras L, el «monto
// pagado» habría sido «Monto Parcial 1» y el tipo de pago «Total». La fila 3 se lee en la corrida y
// cada campo sale de su rótulo. Consecuencia declarada: la REFERENCIA con la que la base guarda cada
// celda es su A1 (`Compras!T125`), así que al insertar la columna pasa a `Compras!U125` y el
// centinela empieza una racha nueva por celda — ve la primera observación, no un cambio.

import { observarMuchas } from './caja-conteo-centinela.mjs'
import { cargaTardia } from './caja-carga-tardia.mjs'
import { diaDe } from './caja-ancla-por-instante.mjs'
import { COMPRAS, columnasDe, lectorDeEncabezados, rangoFilas } from './columnas-por-encabezado.mjs'

/** La pestaña que se vigila. Sólo el nombre: las columnas salen de su fila de rótulos. */
export const PESTANA_VIGILADA = 'Compras'

/** Las columnas que la medición lee, por clave de `COMPRAS`. */
export const COLUMNAS_CARGA_TARDIA = Object.freeze(['fecha', 'proveedor', 'tipoPago', 'pagado', 'estado', 'fechaCaja'])
const FILA0 = 4

/** El prefijo con el que estas celdas viajan a la base: `Compras!T125` — la letra, de la fila de rótulos. */
export const prefijoDe = (cols) => `Compras!${cols.pagado.letra}`

/**
 * LO QUE ESTA MEDICIÓN NO CUBRE. Va como constante porque el test lo cita: el día que alguien sume una
 * fuente, tiene que venir acá a sacarla de la lista.
 */
export const FUERA_DE_ALCANCE = Object.freeze([
  'Cobranzas: un cobro en efectivo cargado tarde sobre una fila vieja NO se detecta. El error va en '
  + 'sentido contrario (la caja publicada queda por DEBAJO de la real), que es el lado barato.',
  'Jornales y Oficina: un jornal en efectivo cargado tarde sobre una quincena vieja no se detecta. '
  + 'Son ~15 filas por cuadro y dos columnas cada una: barato de sumar, pero el importe vive en '
  + 'celdas con fórmula y habría que vigilar el resultado, no la celda.',
  'la réplica del extracto (_BANCO_RAW): la reescribe un generador entera en cada corrida, así que un '
  + 'cambio de celda no distingue "movimiento nuevo" de "la misma fila reescrita".',
  'una fila de Compras BORRADA con su pago adentro: la celda desaparece y el centinela deja de verla, '
  + 'no la reporta como delta negativo.',
])

const num = (x) => (typeof x === 'number' ? x
  : (x === '' || x == null ? null : Number(String(x).replace(',', '.'))))

/**
 * NÚCLEO PURO: las celdas de pago en efectivo de filas ya leídas, con las columnas resueltas.
 *
 * LA FECHA ECONÓMICA ES LA MISMA QUE USA LA FÓRMULA, o el detector mediría una ventana distinta de la
 * que gobierna la plata: "Pagado" va por su «Fecha de caja» y "Pendiente" por «Fecha factura».
 * Ver `formulaComprasEfectivoPosteriores`.
 */
export function celdasDeEfectivo(filas = [], cols) {
  const faltan = COLUMNAS_CARGA_TARDIA.filter((k) => !cols?.[k]?.letra)
  if (faltan.length) throw new Error(`carga tardía: faltan columnas de Compras resueltas por encabezado (${faltan.join(', ')})`)
  const en = (f, k) => f?.[cols[k].indice]
  const prefijo = prefijoDe(cols)
  const out = []
  filas.forEach((f, i) => {
    const pagado = num(en(f, 'pagado'))
    if (String(en(f, 'tipoPago') ?? '').trim().toLowerCase() !== 'efectivo' || pagado === null) return
    const estado = String(en(f, 'estado') ?? '').trim()
    out.push({
      referencia: `${prefijo}${FILA0 + i}`,
      valor: pagado,
      fecha: estado === 'Pendiente' ? num(en(f, 'fecha')) : num(en(f, 'fechaCaja')),
      etiqueta: String(en(f, 'proveedor') ?? '').slice(0, 40),
    })
  })
  return out
}

/** Las columnas y las filas de Compras de esta corrida. Un rótulo que falta sube como error. */
async function leer(google, fileId) {
  const pedidas = Object.fromEntries(COLUMNAS_CARGA_TARDIA.map((k) => [k, COMPRAS[k]]))
  const cols = columnasDe(await lectorDeEncabezados(google, fileId).encabezado('Compras'), pedidas, 'Compras')
  const filas = (await google.readSheetValues(fileId, rangoFilas('Compras', FILA0), { render: 'UNFORMATTED_VALUE' }).catch(() => [])) ?? []
  return { cols, celdas: celdasDeEfectivo(filas, cols) }
}

/** Las celdas de pago en efectivo de Compras, leídas de la pestaña, con su fecha económica. */
export async function leerCeldasDeEfectivo(google, fileId) {
  return (await leer(google, fileId)).celdas
}

/**
 * EL CICLO COMPLETO: leer, observar, medir. Devuelve el dictamen de `cargaTardia`.
 *
 * Es idempotente dentro de una misma corrida: observar dos veces el mismo valor sólo confirma la racha.
 * Por eso el paso del centinela y el generador del anexo pueden llamarlo los dos sin pisarse.
 *
 * @param {{serial:number, fila:{vistoDesde:Date}}} ancla la observación vigente del conteo
 */
export async function medirCargaTardia(google, fileId, ancla, { ahora = new Date() } = {}) {
  const { cols, celdas } = await leer(google, fileId)
  if (!celdas.length) return { ...cargaTardia([], { anclaDia: NaN, anclaInstante: null }), leidas: 0 }
  const obs = await observarMuchas(fileId, celdas.map((c) => ({ concepto: c.referencia, valor: c.valor })),
    { ahora, prefijo: prefijoDe(cols) })
  const conObservacion = celdas.map((c) => {
    const o = obs.get(c.referencia)
    return {
      ...c,
      valorPrevio: o?.fila?.valorPrevio ?? null,
      vistoDesde: o?.fila?.vistoDesde,
      primera: o?.accion === 'primera',
    }
  })
  const r = cargaTardia(conObservacion, {
    anclaDia: diaDe(ancla?.serial),
    anclaInstante: ancla?.fila?.vistoDesde,
  })
  return { ...r, leidas: celdas.length }
}
