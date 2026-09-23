// ANULAR UNA FILA DE COMPRAS QUE UNA RENDICIÓN ESCRIBIÓ — «Estado = Cancelado», nada más.
//
// ═══ POR QUÉ (dueño, 23/09/2026) ═══
//
// «Voy a hacer muchas pruebas del módulo efectivo por todos lados, quiero que me permita borrar/anular y
// que se quite de pestañas Compras y Caja». Hasta hoy, anular una entrega con tickets ya cargados en
// Compras se negaba: «vaciá esas filas en el Sheet y volvé». Eso deja al dueño limpiando a mano lo que
// el bot escribió solo. La anulación desde la app encola UN cambio por fila rendida, y este bisturí lo
// aplica con las mismas garantías que la obra y el pago: la fila tiene que seguir siendo la misma compra.
//
// ═══ QUÉ SE ESCRIBE Y QUÉ NO ═══
//
// Una sola celda: «Estado» ← «Cancelado», el texto que la pestaña ya usa para una fila anulada (orden del
// 08/09/2026; `esAnulada` en compras-fila.mjs). La fila NO se vacía ni se borra: `_MOVIMIENTOS` indexa
// Compras por posición y correr las filas de abajo cambia el estado de otras compras. Con «Cancelado» el
// espejo la replica anulada, el costo por obra la excluye y el dueño la ve tachada en su pestaña.
//
// Sólo entra por acá una fila con Tipo pago «A rendir»: es la única que escribió el bot. Una factura
// cargada por una persona no se cancela desde una entrega de efectivo, aunque la clave coincida.
import { letra } from './compras-columnas.mjs'
import { PRIMERA_FILA, esAnulada, filaACompra } from './compras-fila.mjs'
import { rechazar, resolverLayout, verificarHuella } from './bisturi-compras-obra.mjs'

export const ESTADO_ANULADA = 'Cancelado'
const esARendir = (v) => /a\s*rendir/i.test(String(v ?? ''))

/**
 * EL PLAN. `{accion:'escribir', celda, valor}` · `{accion:'ya_aplicado', actual}` · `{accion:'rechazar'|'diferir', motivo, detalle}`.
 * `fila` leída SIN formato, como el sync; `respaldo` sólo se mira si el cambio no trae clave.
 */
export function planificarAnulacion({ cambio, encabezado, fila, respaldo = null } = {}) {
  const n = Number(cambio?.fila)
  if (!Number.isInteger(n) || n < PRIMERA_FILA) {
    return rechazar('fila_invalida', `la fila ${cambio?.fila} no es un renglón de datos (empiezan en la ${PRIMERA_FILA})`)
  }
  const { idx, decision } = resolverLayout(encabezado, { exigirObra: false })
  if (decision) return decision
  if (idx.estado === undefined || idx.tipo_pago === undefined) {
    return rechazar('sin_columna_estado', 'Compras no tiene las columnas «Estado» y «Tipo pago» en la fila de rótulos: no escribo en otra')
  }
  const compra = filaACompra(fila ?? [], idx, n)
  if (!compra) return rechazar('fila_vacia', `la fila ${n} ya no tiene ID: no es una compra`)
  const huella = verificarHuella(compra, cambio, respaldo)
  if (huella) return huella
  if (esAnulada(compra.estado)) return { accion: 'ya_aplicado', actual: compra.estado }
  if (!esARendir(compra.tipo_pago)) {
    return rechazar('no_es_a_rendir',
      `la fila ${n} tiene Tipo pago «${compra.tipo_pago ?? 'vacío'}»: la escribió una persona, no la rendición, y no se cancela desde una entrega`)
  }
  return {
    accion: 'escribir',
    celda: `Compras!${letra(idx.estado)}${n}`,
    valor: ESTADO_ANULADA,
    nota: `la fila era «${compra.proveedor ?? 'sin proveedor'}» ${compra.total ?? ''} A rendir`,
  }
}
