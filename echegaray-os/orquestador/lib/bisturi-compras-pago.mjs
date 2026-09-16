// EL BISTURÍ SOBRE LAS CELDAS DE PAGO DE UNA FILA DE COMPRAS — qué celdas, qué valores, y cuándo NO.
//
// Hermano de `bisturi-compras-obra.mjs`, y deliberadamente flaco: la aritmética ya la resolvió el
// núcleo puro (`pagos-de-compra.mjs`) cuando la app encoló, y la identidad de la fila la prueba la
// MISMA función que usa Obra (`verificarHuella`). Acá sólo queda lo que no se puede decidir hasta
// tener la fila viva delante: ¿el layout se entiende?, ¿la fila sigue siendo esta compra?, ¿las
// celdas siguen diciendo lo que la pantalla vio?
//
// ═══ POR QUÉ NO SE RECALCULA EL PLAN ACÁ ═══
//
// Porque entre que la app encoló y el worker aplica pueden pasar diez minutos, y recalcular contra la
// fila viva produciría un pago DISTINTO del que la persona aprobó —con otro monto, otro estado— sin
// que nadie lo pida. Si la fila cambió, la respuesta correcta no es adaptarse: es rechazar y que
// alguien vuelva a decidir. Lo que el worker escribe es exactamente lo que se aprobó, o nada.
//
// ═══ LAS CUATRO DECISIONES, IGUAL QUE EN OBRA ═══
//
//   escribir     las celdas dicen lo que la pantalla vio y la fila es la misma compra.
//   ya_aplicado  TODAS las celdas ya dicen lo pedido: el reintento de una escritura que aterrizó y
//                cuyo cierre se perdió. Se cierra sin volver a escribir.
//   rechazar     TERMINAL. Otra compra, o una celda que cambió desde que se miró.
//   diferir      el mundo todavía no permite escribir (layout ambiguo, rótulo faltante).
//
// ═══ UN PAGO SE ESCRIBE ENTERO O NO SE ESCRIBE ═══
//
// Si UNA celda del pago cambió, se rechaza el pago COMPLETO. Escribir las otras tres dejaría la fila
// con «Estado = Pagado» y «Monto Pagado» viejo: la fórmula `Estado pago` dibujaría «✓ Pagado» sobre
// una factura impaga, y `Saldo pendiente (OS)` —de la que cuelga la pestaña Proveedores— pasaría a
// cero. Un pago a medias no es la mitad de un pago: es un dato falso.
//
// ═══ LA COMPARACIÓN ES POR ESPECIE, Y SALE DE `filaACompra` ═══
//
// La fila se lee con UNFORMATTED_VALUE: un importe vuelve como número con cola binaria y una fecha
// como el serial de Sheets. Comparar texto contra texto —como hace Obra, donde todo es texto— diría
// «la celda cambió» en cada pago. `filaACompra` YA normaliza los montos a dos decimales y las fechas
// a ISO con el mismo camino que usó el sync para escribir `compra_sheet`: comparar contra eso es
// comparar contra la misma definición que vio la pantalla.

import { letra } from './compras-columnas.mjs'
import { COMPRAS, columnasDe } from './columnas-por-encabezado.mjs'
import { PRIMERA_FILA, filaACompra, pesos } from './compras-fila.mjs'
import { diferir, rechazar, resolverLayout, verificarHuella } from './bisturi-compras-obra.mjs'
import { CLAVE_POR_ROTULO, ESPECIE_PAGO, ROTULOS_PAGO, paraElSheet } from './pagos-de-compra.mjs'

// El mapa rótulo→clave vive en el núcleo (lo usan los dos lados del viaje) y se re-exporta acá para
// que quien ya lo importaba del bisturí siga teniendo UNA sola definición y no una copia.
export { CLAVE_POR_ROTULO }

/** Las columnas de pago, para `columnasDe`. Mismo pedido que `COMPRAS`, acotado a las seis. */
export const PEDIDO_COLUMNAS = Object.freeze({
  tipoPago: COMPRAS.tipoPago, totalParcial: COMPRAS.totalParcial, pagado: COMPRAS.pagado,
  fechaPrevista2: COMPRAS.fechaPrevista2, parcial2: COMPRAS.parcial2, estado: COMPRAS.estado,
})

const ROTULO_A_PEDIDO = Object.freeze(Object.fromEntries(
  Object.entries(PEDIDO_COLUMNAS).map(([k, rotulo]) => [rotulo, k]),
))

const txt = (v) => String(v ?? '').trim()

/**
 * ¿La celda viva dice esto? Por especie, contra la fila ya normalizada por `filaACompra`.
 * Un vacío y un `null` son lo mismo; un importe se compara con un centavo de tolerancia.
 */
export function celdaDice(compra, rotulo, valor) {
  const vivo = compra?.[CLAVE_POR_ROTULO[rotulo]]
  const especie = ESPECIE_PAGO[rotulo]
  if (especie === 'importe') return Math.abs(pesos(vivo) - pesos(valor)) < 0.01
  return txt(vivo) === txt(valor)
}

/** Cómo se dibuja un valor en el mensaje de rechazo. Un vacío se nombra, no se deja en blanco. */
const comoSeVe = (compra, rotulo) => {
  const v = compra?.[CLAVE_POR_ROTULO[rotulo]]
  return txt(v) === '' ? 'vacía' : `«${txt(v)}»`
}

/**
 * EL PLAN DE UN PAGO. `{accion, celdas?, actual?, motivo?, detalle?}`.
 *
 * El orden es la garantía y es el mismo que el de Obra: primero que el layout se entienda, después
 * que la fila sea la misma compra, y recién ahí qué dicen las celdas. Mirar las celdas de una fila
 * que no es la misma compra respondería una pregunta sobre otra plata.
 *
 * @param {{cambio:object, encabezado:any[], fila:any[], respaldo?:object|null}} p
 *   `cambio.celdas` = lo que dejó `pagos-de-compra.mjs` (rotulo, valor, anterior) · `fila` leída con
 *   UNFORMATTED_VALUE, como el sync.
 */
export function planificarPago({ cambio, encabezado, fila, respaldo = null } = {}) {
  const n = Number(cambio?.fila)
  if (!Number.isInteger(n) || n < PRIMERA_FILA) {
    return rechazar('fila_invalida', `la fila ${cambio?.fila} no es un renglón de datos (empiezan en la ${PRIMERA_FILA})`)
  }
  const celdas = Array.isArray(cambio?.celdas) ? cambio.celdas : []
  if (!celdas.length) return rechazar('sin_celdas', 'el cambio no dice qué celda escribir')

  const { idx, decision } = resolverLayout(encabezado, { exigirObra: false })
  if (decision) return decision
  let cols
  try {
    cols = columnasDe(encabezado ?? [], PEDIDO_COLUMNAS, 'Compras')
  } catch (e) {
    return diferir('sin_columnas_de_pago', e.message)
  }

  const compra = filaACompra(fila ?? [], idx, n)
  if (!compra) return rechazar('fila_vacia', `la fila ${n} ya no tiene ID: no es una compra`)
  const huella = verificarHuella(compra, cambio, respaldo)
  if (huella) return huella

  return decidirCeldas({ celdas, compra, cols, n, cambio, respaldo })
}

/** Qué hacer con las celdas del pago, una vez probado que la fila es la misma compra. */
function decidirCeldas({ celdas, compra, cols, n, cambio, respaldo }) {
  const escribir = []
  for (const c of celdas) {
    const pedido = ROTULO_A_PEDIDO[c?.rotulo]
    if (!pedido) {
      return rechazar('rotulo_invalido', `«${c?.rotulo}» no es una celda de entrada de pago: no la escribo`)
    }
    if (celdaDice(compra, c.rotulo, c.valor)) continue
    if (!celdaDice(compra, c.rotulo, c.anterior)) {
      return rechazar('celda_cambio',
        `la celda «${c.rotulo}» de la fila ${n} dice ${comoSeVe(compra, c.rotulo)} y la pantalla vio «${txt(c.anterior) || 'vacía'}»: no la piso`)
    }
    escribir.push({
      rotulo: c.rotulo,
      especie: c.especie ?? undefined,
      celda: `Compras!${letra(cols[pedido].indice)}${n}`,
      valor: c.valor,
      escribir: paraElSheet(c.valor, c.especie),
    })
  }
  if (!escribir.length) {
    return { accion: 'ya_aplicado', actual: celdas.map((c) => `${c.rotulo}=${txt(c.valor)}`).join(' · ') }
  }
  const nota = !cambio?.clave && respaldo?.resincronizado
    ? 'huella de respaldo tomada de compra_sheet resincronizado después del pedido' : undefined
  return { accion: 'escribir', celdas: escribir, nota }
}

/** ¿La relectura prueba la escritura? Una celda por vez, con la misma normalización de la lectura. */
export function relecturaConfirmaPago(compra, celdas = []) {
  const malas = celdas.filter((c) => !celdaDice(compra, c.rotulo, c.valor))
  return malas.length
    ? { ok: false, detalle: malas.map((c) => `«${c.rotulo}» dice ${comoSeVe(compra, c.rotulo)} y se escribió «${txt(c.valor)}»`).join(' · ') }
    : { ok: true }
}
