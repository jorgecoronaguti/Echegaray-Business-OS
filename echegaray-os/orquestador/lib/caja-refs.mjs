// LAS REFERENCIAS DEL ARCHIVO QUE CAJA Y SU ANEXO NECESITAN, RESUELTAS UNA SOLA VEZ.
//
// POR QUÉ EXISTE (05/08/2026). Cuando el anexo de CAJA se mudó a `_CAJA_ANEXO`, los dos generadores
// pasaron a necesitar lo mismo: en qué pestaña están los cheques y la tarjeta, en qué fila del Cash
// Flow Mensual está el "Efectivo al inicio", y cuál es la cartera de valores. Copiarlo en los dos era
// garantizar que un día se separaran — y una referencia a una fila muerta devuelve $0 sin un solo
// #ERROR, que es el modo de falla más caro de este archivo.
//
// TODO SE UBICA POR RÓTULO, NUNCA POR NÚMERO DE FILA. Es la regla que ya pagó tres veces este
// archivo: anclar en la posición es lo que dejó dos cash flow con el saldo inicial en blanco.

import { hallarPestana } from './sheet-pestanas.mjs'
import { CALENDARIO_IMPUESTOS, rotulosCalendarioImpuestos } from './cash-flow-lineas.mjs'
import { EN_CARTERA } from './cartera-cheques.mjs'
import * as BANCO from './banco-santander.mjs'

/**
 * Las líneas del cuadro de caja que NO tienen fuente con fecha, y por eso valen CERO por tramo.
 *
 * Las tres son costos que el banco debita solo, sin factura: su único registro es el extracto, que por
 * definición sólo cubre el PASADO. Proyectarlas por tramo exigiría un modelo de timing que hoy no
 * existe, y un número inventado en la columna que produce el PISO es peor que un cero.
 *
 * PERO EL CERO SE DECLARA EN LA PESTAÑA: un cero invisible es el defecto; un cero con nombre y con
 * monto es una limitación conocida.
 */
export const SIN_FUENTE_EN_VENTANA = ['descubierto', 'comisiones', 'impuestoCheque']

/** Dónde quedó cada línea del Cash Flow Mensual, buscada POR RÓTULO. */
export function ubicarEnCashFlow(colA, rotulo) {
  const i = colA.findIndex((f) => String(f?.[0] ?? '').trim().toLowerCase().startsWith(rotulo.toLowerCase()))
  return i < 0 ? null : i + 1
}

/**
 * En qué filas de "Impuestos y Financieros" están el IVA y el IIBB a pagar. Se ubican por su RÓTULO.
 *
 * ROMPE si la pestaña no está, y es a propósito: el IVA/IIBB es el egreso más grande del último
 * cuatrimestre y no vive en Compras. Una referencia a una fila muerta lo deja en $0 sin error, y el
 * piso de caja sube sin que se haya pagado nada.
 */
export async function filasDelCalendarioFiscal(google, fileId, hojas) {
  const P = CALENDARIO_IMPUESTOS.pestaña
  if (!hojas.some((h) => h.title === P)) {
    throw new Error(`caja: no encuentro la pestaña "${P}" — sin ella el calendario no vería el IVA/IIBB a pagar, que es el egreso más grande del último cuatrimestre`)
  }
  const colA = await google.readSheetValues(fileId, `'${P}'!A1:A200`)
  const fila = (rotulo) => {
    const i = colA.findIndex((f) => String(f?.[0] ?? '').trim() === rotulo)
    return i < 0 ? null : i + 1
  }
  return Object.fromEntries(rotulosCalendarioImpuestos().map(({ clave, rotulo }) => [clave, fila(rotulo)]))
}

/**
 * Las referencias del archivo. Lo que no se encuentre queda en `null` y lo consume quien pueda: el
 * calendario fiscal es el único que ROMPE, porque es el único cuyo faltante se lee como un cero.
 */
export async function refsDelArchivo(google, fileId, hojas) {
  const colA = await google.readSheetValues(fileId, 'Cash Flow Mensual!A1:A80')
  return {
    // 'Cheques Emitidos' completo, no 'Cheques' a secas: desde que existe 'Cheques Recibidos' el
    // nombre corto es ambiguo y hallarPestana corta con error.
    cheques: hallarPestana(hojas, 'Cheques Emitidos').title,
    recibidos: hallarPestana(hojas, 'Cheques Recibidos')?.title ?? null,
    tarjeta: hallarPestana(hojas, 'Tarjeta').title,
    // La réplica del extracto. Si no está, el saldo del banco vuelve al número declarado: sin corte
    // confiable, la ventana de "movimientos posteriores" no se puede acotar.
    bancoRaw: hojas.some((h) => h.title === '_BANCO_RAW') ? '_BANCO_RAW' : null,
    cierre: ubicarEnCashFlow(colA, 'Efectivo y equivalentes al cierre'),
    // El INICIO del mes es contra lo que se concilia de verdad: comparar la caja de HOY contra el
    // CIERRE proyectado da el flujo neto del mes, no un descuadre.
    inicio: ubicarEnCashFlow(colA, 'Efectivo y equivalentes al inicio'),
    cab: ubicarEnCashFlow(colA, 'Período'),
    filasCal: await filasDelCalendarioFiscal(google, fileId, hojas),
  }
}

/**
 * LA CARTERA, NORMALIZADA. Una sola forma para las dos fuentes posibles.
 *
 * RESPALDO, no fuente: la transcripción de las pantallas del banco que vive en banco-santander.mjs. Si
 * se usa, las FILAS pueden quedar viejas — pero el total y el calendario siguen saliendo de la
 * réplica, así que el canario lo grita en la propia pestaña.
 */
export function carteraDeRespaldo() {
  return {
    origen: BANCO.ORIGEN,
    enCartera: BANCO.enCartera().map((e) => ({ numero: e.numero, emisor: e.emisor, pago: e.pago })),
    endosados: BANCO.endosados().map((e) => ({ numero: e.numero, beneficiario: e.beneficiario })),
  }
}

/**
 * LA CARTERA DESDE LA BASE — la misma fuente que alimenta la réplica `_CHEQUES_RAW`.
 *
 * POR QUÉ NO ALCANZABA EL ARRAY DE JAVASCRIPT: era una transcripción a mano con corte 22/07. El 30/07
 * entró el cheque 514, quedó en la base y en la réplica, y el array no lo tenía: CAJA listaba un
 * cheque y mostraba $10.000.000 con $10.290.000 en cartera.
 *
 * EL ENDOSATARIO NO ESTÁ EN LA BASE (`public.cheques` no guarda a quién se le entregó el valor), así
 * que se completa desde la réplica del banco cuando el número coincide. Si no está, el rótulo dice
 * "endosado" y no inventa un beneficiario.
 */
export async function carteraDesdeLaBase() {
  const { query } = await import('./db.mjs')
  const { rows } = await query(
    `select numero, librador, contraparte, importe::float8 importe, fecha_pago::text pago, estado, corte::text corte
       from public.cheques
      where tipo = 'recibido' and estado in ($1, 'Endosado')
      order by (fecha_pago is null), fecha_pago, numero`, [EN_CARTERA])
  if (!rows.length) throw new Error('public.cheques no tiene valores en cartera ni endosados')
  const corte = rows.reduce((mx, r) => (String(r.corte) > mx ? String(r.corte) : mx), '')
  const beneficiarioDe = (numero) => BANCO.endosados().find((e) => String(e.numero) === String(numero))?.beneficiario ?? null
  return {
    origen: `public.cheques al ${corte}`,
    enCartera: rows.filter((r) => r.estado === EN_CARTERA)
      .map((r) => ({ numero: r.numero, emisor: r.librador || r.contraparte || 'librador sin cargar', pago: r.pago })),
    endosados: rows.filter((r) => r.estado === 'Endosado')
      .map((r) => ({ numero: r.numero, beneficiario: beneficiarioDe(r.numero) })),
  }
}

/** La cartera de la base, con caída al respaldo declarado. Mejor un detalle viejo y avisado que una
 *  pestaña que no se puede generar. */
export async function carteraDelArchivo() {
  try {
    return await carteraDesdeLaBase()
  } catch (e) {
    const c = carteraDeRespaldo()
    console.log(`  ⚠ la cartera no salió de la base (${e.message}): uso el respaldo ${c.origen}. El total y el calendario SIGUEN saliendo de la réplica.`)
    return c
  }
}
