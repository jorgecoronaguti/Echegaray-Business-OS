// EL BISTURÍ SOBRE LA COLUMNA «OBRA» DE COBRANZAS (H) — hermano de `bisturi-compras-obra.mjs`.
//
// Núcleo puro: entra la fila de rótulos y la fila de datos tal como se leyeron, y el cambio que
// `cobranza_obra_asignar` encoló en `compra_obra_cambio` con `pestana = 'Cobranzas'`; sale UNA decisión
// con la MISMA forma que la de Compras (escribir · ya_aplicado · rechazar · diferir), así el worker no
// distingue pestañas más que para elegir el bisturí.
//
// ═══ POR QUÉ LA HUELLA NO ES EL N° DE COMPROBANTE ═══
//
// En Compras la identidad de una fila es la clave del comprobante. En Cobranzas 51 de las 90 filas de
// 2026 no tienen número: una huella que dependiera de él rechazaría más de la mitad de la pestaña. La
// huella es «comprobante|Obra / Cliente|total» —lo que la RPC guardó en `clave` desde `public.cobranzas`—
// y se compara con las tres celdas releídas. El ID (columna A, `ROW()-4`) se compara además como
// posición: si no coincide, la fila se corrió y no se escribe.

import { columnasCobranzas } from './cobranzas-columnas.mjs'
import { normalizarCelda } from './bisturi-compras-obra.mjs'
import { PESTANAS } from './columnas-por-encabezado.mjs'
import { validarValorDeObra } from './obra-destino.mjs'

/** Lo que el bisturí necesita de la fila de rótulos. `obra` es opcional: antes del backfill no existe. */
export const COLUMNAS_OBRA_COBRANZA = Object.freeze(['id', 'comprobante', 'cliente', 'total', 'obra'])

const rechazar = (motivo, detalle) => ({ accion: 'rechazar', motivo, detalle })
const diferir = (motivo, detalle) => ({ accion: 'diferir', motivo, detalle })

/**
 * LA HUELLA DE UNA FILA DE COBRANZAS, con la MISMA forma que la arma `cobranza_obra_asignar` en SQL:
 * `concat_ws('|', comprobante, cliente, round(total))`. Cambiar esto de un lado solo deja la cola
 * rechazando todo por `huella_distinta`.
 */
export function huellaDeCobranza({ comprobante, cliente, total } = {}) {
  // Sin total, tramo vacío (como `coalesce(round(total)::text, '')` en SQL): `Number(null)` daría «0», que es otro total.
  const n = total === null || total === undefined || String(total).trim() === '' ? NaN : Number(total)
  return [normalizarCelda(comprobante), normalizarCelda(cliente), Number.isFinite(n) ? String(Math.round(n)) : ''].join('|')
}

/** La huella guardada, desarmada. El cliente puede llevar «|» (no debería): se toma el primero y el último tramo. */
function desarmarHuella(clave) {
  const partes = String(clave ?? '').split('|')
  if (partes.length < 3) return null
  return { comprobante: partes[0], cliente: partes.slice(1, -1).join('|'), total: partes.at(-1) }
}

/** ¿Es la misma cobranza que se vio al encolar? `null` si sí; si no, el rechazo. */
function verificarHuella(leida, cambio) {
  const esperada = desarmarHuella(cambio?.clave)
  if (!esperada) {
    return rechazar('sin_huella', 'el cambio se encoló sin huella de la cobranza: no hay forma de probar que la fila es la misma')
  }
  const idEsperado = cambio?.sheet_id
  if (idEsperado !== null && idEsperado !== undefined && String(leida.id) !== String(idEsperado)) {
    return rechazar('huella_distinta', `la fila ${cambio.fila} tiene ID ${leida.id || 'vacío'} y se esperaba ${idEsperado}`)
  }
  if (normalizarCelda(leida.comprobante) !== normalizarCelda(esperada.comprobante)) {
    return rechazar('huella_distinta', `la fila ${cambio.fila} tiene el comprobante «${leida.comprobante || 'vacío'}» y se esperaba «${esperada.comprobante || 'vacío'}»`)
  }
  if (normalizarCelda(leida.cliente) !== normalizarCelda(esperada.cliente)) {
    return rechazar('huella_distinta', `la fila ${cambio.fila} dice «${leida.cliente || 'vacío'}» en Obra / Cliente y se esperaba «${esperada.cliente}»`)
  }
  // Un peso de tolerancia: el total es una fórmula (`=neto+IVA-retenciones`) y el redondeo del camino cambia decimales.
  const real = Number(leida.total)
  const esp = Number(esperada.total)
  if (esperada.total !== '' && (!Number.isFinite(real) || Math.abs(real - esp) > 1)) {
    return rechazar('huella_distinta', `la fila ${cambio.fila} tiene total ${leida.total ?? 'vacío'} y se esperaba ${esperada.total}`)
  }
  return null
}

/** El layout contra la fila de rótulos VIVA. Cualquier duda difiere. */
function resolverLayout(encabezado) {
  let cols
  try {
    cols = columnasCobranzas(encabezado ?? [], COLUMNAS_OBRA_COBRANZA)
  } catch (e) {
    return { decision: diferir('layout_ambiguo', e.message) }
  }
  if (!cols.obra) {
    return { decision: diferir('sin_columna_obra', 'Cobranzas no tiene la columna «Obra» en la fila de rótulos: no escribo en otra') }
  }
  return { cols }
}

/**
 * EL PLAN para una fila de Cobranzas. Mismo orden de garantías que en Compras: valor legítimo → layout
 * entendido → misma cobranza → qué dice la celda.
 * @param {{cambio:object, encabezado:any[], fila:any[], obras:object[], clienteAlias?:Map<string,string>}} p
 *   `fila` leída con UNFORMATTED_VALUE (el total como número) · `obras` = filas de `obra_canonica`
 */
export function planificarObraCobranza({ cambio, encabezado, fila, obras, clienteAlias } = {}) {
  const n = Number(cambio?.fila)
  const primera = PESTANAS.Cobranzas.primeraFila
  if (!Number.isInteger(n) || n < primera) {
    return rechazar('fila_invalida', `la fila ${cambio?.fila} no es un renglón de datos de Cobranzas (empiezan en la ${primera})`)
  }
  if (!Array.isArray(obras) || !obras.length) {
    return diferir('sin_catalogo', 'no hay obras leídas de la base: no puedo validar el valor contra el desplegable')
  }
  const valor = normalizarCelda(cambio?.valor_nuevo)
  const invalido = validarValorDeObra(valor, obras, clienteAlias)
  if (invalido) return rechazar('valor_invalido', invalido)

  const { cols, decision } = resolverLayout(encabezado)
  if (decision) return decision

  const en = (k) => fila?.[cols[k].indice]
  const leida = { id: normalizarCelda(en('id')), comprobante: en('comprobante'), cliente: en('cliente'), total: en('total') }
  if (!leida.id) return rechazar('fila_vacia', `la fila ${n} no tiene ID: no es una cobranza`)
  const huella = verificarHuella(leida, cambio)
  if (huella) return huella

  const actual = normalizarCelda(en('obra'))
  if (actual === valor) return { accion: 'ya_aplicado', actual }
  const esperado = normalizarCelda(cambio?.valor_anterior)
  if (actual !== esperado) {
    return rechazar('celda_cambio', `la celda Obra de la fila ${n} dice «${actual || 'vacía'}» y se esperaba «${esperado || 'vacía'}»: no la piso`)
  }
  return { accion: 'escribir', celda: `Cobranzas!${cols.obra.letra}${n}`, valor, actual }
}
