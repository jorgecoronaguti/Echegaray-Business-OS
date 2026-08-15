// LA MEDICIÓN DE CARGA TARDÍA SOBRE COMPRAS — leer la pestaña, observar las celdas, sacar el número.
//
// POR QUÉ VIVE EN SU PROPIO ARCHIVO. Lo necesitan DOS: el paso del centinela (que lo grita por el log
// de la corrida) y el generador del anexo (que lo publica en la pestaña, que es donde el dueño mira).
// Escrito dos veces, el número del log y el de la pestaña podrían empezar a discrepar — y el día que
// discrepen, ninguno de los dos significaría nada.
//
// EL ALCANCE ES MÍNIMO Y ESTÁ MEDIDO: la columna de "Monto Pagado" de Compras, filtrada por tipo de
// pago "Efectivo". Son 439 celdas hoy, cuatro lecturas de columna, ~1,5 s. Vigilar TODAS las fuentes
// que mueven el cajón —Cobranzas, Jornales, Oficina, la réplica del extracto— multiplicaría el costo
// sin cerrar el mismo agujero: el caso que el dueño describió, y el único que INFLA la caja, es el
// PAGO cargado sobre una fila vieja. Lo que queda afuera está declarado abajo, no cerrado en silencio.

import { CMP } from './caja-posterior-al-corte.mjs'
import { observarMuchas } from './caja-conteo-centinela.mjs'
import { cargaTardia } from './caja-carga-tardia.mjs'
import { diaDe } from './caja-ancla-por-instante.mjs'

/** El prefijo con el que estas celdas viajan a la base: `Compras!T125`. */
export const PREFIJO = `${CMP.hoja}!${CMP.montoPagado}`

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
 * Las celdas de pago en efectivo de Compras, leídas de la pestaña, con su fecha económica.
 *
 * LA FECHA ECONÓMICA ES LA MISMA QUE USA LA FÓRMULA, o el detector mediría una ventana distinta de la
 * que gobierna la plata: "Pagado" va por su Fecha de caja (AD) y "Pendiente" por la de la factura (C).
 * Ver `formulaComprasEfectivoPosteriores`.
 */
export async function leerCeldasDeEfectivo(google, fileId) {
  const col = (r) => google.readSheetValues(fileId, `${CMP.hoja}!${r}`, { render: 'UNFORMATTED_VALUE' }).catch(() => [])
  const [ce, pt, x, ad] = await Promise.all([
    col(`C${CMP.desde}:E`), col(`P${CMP.desde}:T`), col(`X${CMP.desde}:X`), col(`AD${CMP.desde}:AD`),
  ])
  const alto = Math.max(ce.length, pt.length, x.length, ad.length)
  const out = []
  for (let i = 0; i < alto; i++) {
    const pagado = num(pt[i]?.[4])
    if (String(pt[i]?.[0] ?? '').trim().toLowerCase() !== 'efectivo' || pagado === null) continue
    const estado = String(x[i]?.[0] ?? '').trim()
    out.push({
      referencia: `${PREFIJO}${CMP.desde + i}`,
      valor: pagado,
      fecha: estado === 'Pendiente' ? num(ce[i]?.[0]) : num(ad[i]?.[0]),
      etiqueta: String(ce[i]?.[2] ?? '').slice(0, 40),
    })
  }
  return out
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
  const celdas = await leerCeldasDeEfectivo(google, fileId)
  if (!celdas.length) return { ...cargaTardia([], { anclaDia: NaN, anclaInstante: null }), leidas: 0 }
  const obs = await observarMuchas(fileId, celdas.map((c) => ({ concepto: c.referencia, valor: c.valor })),
    { ahora, prefijo: PREFIJO })
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
