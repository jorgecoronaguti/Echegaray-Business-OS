// APLICAR UN EXTRACTO — el único punto de este módulo con efecto económico.
//
// ═══ POR QUÉ ESTO NO SE APLICA SOLO ═══
//
// Cargar movimientos cambia `public.banco_movimientos`, y de ahí cuelgan por fórmula la
// disponibilidad de CAJA, el impuesto al cheque, los costos bancarios de Impuestos y el cruce de
// Cheques. Un movimiento duplicado no da error: da un saldo equivocado, que se propaga a cuatro
// pestañas antes de que nadie lo note. Leer y previsualizar es automático; escribir lo autoriza una
// persona apretando un botón después de ver qué se leyó y si la cadena de saldos cierra.
//
// ═══ QUÉ SE ESCRIBE: LO QUE EL DUEÑO VIO ═══
//
// Los movimientos salen de `propuesta`, que se guardó cuando se le mostró la previsualización — no
// se vuelve a bajar ni a re-parsear el archivo. Si se re-leyera al confirmar, lo que se carga podría
// no ser lo que se aprobó (el archivo puede haberse borrado del canal, o el parser puede haber
// cambiado entre una cosa y la otra). Se aplica exactamente lo que se mostró.
//
// ═══ LA EVIDENCIA ═══
//
// Después del INSERT se RELEE la tabla por los ids que Postgres devolvió, y eso es lo que se
// publica. El contador del importador prueba que el importador contó; las filas releídas prueban que
// las filas están.

import { novedades, verificarCadena } from '../../lib/banco-importar.mjs'
import { insertarMovimientos, releerMovimientos, movimientosCargados, estadoCuenta } from '../../lib/banco-escribir.mjs'
import { mensajeImportado } from '../../lib/archivos/mensaje.mjs'

export const TEXTO = Object.freeze({
  SIN_MOVIMIENTOS: 'Esa propuesta no tiene ningún movimiento para cargar.',
  CADENA_ROTA: 'No cargo un extracto cuya cadena de saldos no cierra: adentro de la base es peor que afuera. Revisá el corte que te marqué y mandámelo de nuevo.',
})

/**
 * Aplica la propuesta guardada de un extracto.
 *
 * @param {object} dep
 * @param {{query:Function}} dep.port
 * @param {Function} [dep.insertar]   inyectable para probar sin Postgres
 * @param {Function} [dep.releer]
 * @param {Function} [dep.cargados]
 * @param {Function} [dep.estado]
 * @param {object} fila               la fila de `comunicacion.archivos_recibidos`
 * @returns {Promise<{ok:boolean, texto:string, insertados:number, releidos:Array, error?:string}>}
 */
export async function importarExtracto(dep, fila) {
  const {
    port,
    insertar = insertarMovimientos,
    releer = releerMovimientos,
    cargados = movimientosCargados,
    estado = estadoCuenta,
  } = dep ?? {}

  const propuesta = normalizar(fila?.propuesta)
  const movimientos = propuesta?.movimientos ?? []
  if (!movimientos.length) {
    return { ok: false, texto: TEXTO.SIN_MOVIMIENTOS, insertados: 0, releidos: [], error: 'sin_movimientos' }
  }

  // LA CADENA SE VUELVE A VERIFICAR ACÁ, no se confía en el veredicto guardado. Es barato, es puro, y
  // es el control que ya encontró dos errores de transcripción reales: un control que se saltea
  // porque "ya se hizo antes" es un control que un día no se hizo.
  const cadena = verificarCadena(movimientos, null)
  if (!cadena.ok) {
    return { ok: false, texto: TEXTO.CADENA_ROTA, insertados: 0, releidos: [], error: 'cadena_rota', cadena }
  }

  // DEDUPLICAR CONTRA LO QUE HAY AHORA, no contra lo que había cuando se mostró la propuesta. Entre
  // la previsualización y el click puede haber entrado el mismo extracto por la terminal.
  const existentes = await cargados(port)
  const nuevos = novedades(movimientos, existentes ?? [])
  if (!nuevos.length) {
    const e = await estado(port)
    return { ok: true, texto: mensajeImportado({ insertados: 0, total: e.total, cobertura: e.cobertura }), insertados: 0, releidos: [] }
  }

  const origen = `mattermost · archivo "${fila?.nombre ?? fila?.file_id}" · importado ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  const { insertados, ids } = await insertar(port, nuevos, origen)
  const releidos = await releer(port, ids)
  const e = await estado(port)

  return {
    ok: true,
    insertados,
    releidos,
    total: e.total,
    cobertura: e.cobertura,
    texto: mensajeImportado({ insertados, releidos, total: e.total, cobertura: e.cobertura }),
  }
}

/** `propuesta` puede venir como jsonb ya parseado o como texto, según el driver. */
function normalizar(p) {
  if (p == null) return null
  if (typeof p === 'string') { try { return JSON.parse(p) } catch { return null } }
  return p
}
