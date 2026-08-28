// CÓMO SE LLAMA CADA CLIENTE EN CADA FUENTE — el mapa que hace falta para atribuir plata a una obra.
//
// POR QUÉ EXISTE. `public.cliente_alias` y `public.rotulo_no_es_cliente` se crearon el 28/08/2026 y
// no las leía NADIE: el motor de costo por obra recibía el mapa por parámetro y en producción no
// había quien se lo armara. Una tabla sin consumidor no es una fuente de verdad, es un archivo SQL.
//
// LA REGLA QUE GOBIERNA ESTE ARCHIVO: ANTE CUALQUIER DUDA, `leido: false`.
//
// El motor distingue NO_VERIFICABLE de DESCONOCIDO justamente para no decir "este rótulo no existe"
// cuando lo que pasó es que no se pudo mirar. Ese contrato se sostiene acá o no se sostiene en
// ningún lado: si la consulta falla se devuelve `leido:false` con el motivo —no se lanza, porque
// quien llama tiene que poder informar el estado en vez de morirse— y si la tabla no tiene ninguna
// fila para la fuente, TAMBIÉN es `leido:false`. Un mapa vacío devuelto en silencio convierte a
// todos los clientes de la planilla en DESCONOCIDOS y eso se lee como "la planilla está mal".

import { query as queryPg } from './db.mjs'
import { normalizarClave } from './jornales-estructura.mjs'

const SQL_ALIAS = 'select rotulo_clave, cliente_canonico, origen from public.cliente_alias where fuente = $1'
const SQL_NO_CLIENTE = 'select rotulo_clave, motivo from public.rotulo_no_es_cliente where fuente = $1'

/** Mapa vacío pero explícito: nunca se devuelve un `alias` undefined que reviente río abajo. */
const cerrado = (motivo) => ({ leido: false, motivo, alias: new Map(), noCliente: new Map(), origenes: new Map() })

/**
 * Carga el mapa de clientes de una fuente. `query` se inyecta para poder probar los tres finales
 * —anda, falla, está vacía— sin base.
 *
 * Devuelve { leido, motivo, alias: Map<clave, canonico>, noCliente: Map<clave, motivo>,
 * origenes: Map<clave, 'DECISION_DUENO'|'INFERENCIA_OS'> }. `origenes` importa: una equivalencia
 * que dedujo el sistema y nadie confirmó sirve para trabajar, no para afirmar.
 */
export async function cargarMapaClientes({ fuente = 'JORNALES', query = queryPg } = {}) {
  let filasAlias
  let filasNo
  try {
    filasAlias = (await query(SQL_ALIAS, [fuente]))?.rows ?? []
    filasNo = (await query(SQL_NO_CLIENTE, [fuente]))?.rows ?? []
  } catch (e) {
    return cerrado(`no se pudieron leer los alias de cliente (${fuente}): ${e?.message ?? e}`)
  }
  if (!filasAlias.length) {
    return cerrado(
      `public.cliente_alias no tiene ninguna fila para la fuente ${fuente}. `
      + '¿Está aplicada la migración? Sin mapa NO se atribuye: todo saldría DESCONOCIDO y eso se lee '
      + 'como que la planilla está mal.',
    )
  }
  const alias = new Map()
  const origenes = new Map()
  for (const r of filasAlias) {
    // Se vuelve a normalizar aunque la columna ya sea la clave: una fila insertada a mano sin
    // normalizar dejaría un rótulo que nunca matchea y que se leería como cliente desconocido.
    const clave = normalizarClave(r.rotulo_clave)
    if (!clave) continue
    alias.set(clave, r.cliente_canonico)
    origenes.set(clave, r.origen ?? null)
  }
  const noCliente = new Map()
  for (const r of filasNo) {
    const clave = normalizarClave(r.rotulo_clave)
    if (clave) noCliente.set(clave, r.motivo)
  }
  return { leido: true, motivo: null, fuente, alias, noCliente, origenes }
}
