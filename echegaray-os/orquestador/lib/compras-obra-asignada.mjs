// A QUÉ OBRA VA CADA COMPRA — una sola regla, la de JORNALES, aplicada a la pestaña Compras.
//
// ═══ POR QUÉ EXISTE (dueño, 13/09/2026) ═══
//
// «Quiero que las columnas de Materiales y Mano de obra del módulo CRM admin muestren los costos hasta
// el momento sumados de cada una de cada obra de cada cliente, no lo presupuestado; eso tiene que
// estar dentro de cada obra».
//
// Hasta hoy la compra se atribuía por la columna J (`obra_texto`) contra `obra_alias`, y la J dice el
// CLIENTE, no la obra: las 170 filas de «San Francisco» caían enteras en la obra madre cerrada
// («Galpones, Mampostería, Cancha de Padel») y SF - Pisos Industriales, con $ 20 M comprados a su
// nombre en la columna K, se dibujaba «—». Lo mismo con Galpón 9 y la Oficina de La Estrella.
//
// ═══ LA REGLA ═══
//
//   cliente = columna J, por `cliente_alias`. Una J que no es cliente (Administración, Taller, F931…)
//             no se asigna a nada: es estructura, no costo de obra de nadie.
//   obra    = columna K, por el MISMO `resolutorDeObra` de JORNALES (alias «cliente obra», alias
//             «obra», nombre canónico del mismo cliente). Se prueba la K entera y su primer tramo
//             —«Galpon 9 - DISCOS T/27 …» es Galpón 9—, y la obra encontrada TIENE que ser de ese
//             cliente: un alias de otra obra de otro cliente no es evidencia.
//
// ═══ LO QUE ESTA REGLA NO HACE, A PROPÓSITO ═══
//
// El paso 3 del resolutor de JORNALES («alias del cliente solo → la obra madre») NO se acepta para una
// compra cuando el cliente tiene más de una obra. En la planilla de horas, una fila que sólo dice «SAN
// FRANCISCO» es un día en esa obra; en Compras, un gasoil que sólo dice «San Francisco» no dice a cuál
// de sus seis obras fue. Asignarlo a la madre es exactamente el defecto que se vino a sacar. Queda
// `obra_id` null y la ficha lo publica como «Gastos del cliente sin obra asignada». NUNCA se reparte.
// Con UNA sola obra (Quattropani, ARCOR) no hay nada que decidir: va a esa.
//
// La palanca para achicar el «sin obra» es cargar el alias que falta en `obra_alias` (p.ej. «galpon 7»
// → la obra que corresponda), no aflojar esta regla.

import { normAlias, resolutorDeObra } from './jornales-a-registros-hh.mjs'
import { esCostoDeObra } from './compras-costo-de-obra.mjs'
import { DESTINO, resolverCeldaObra } from './obra-destino.mjs'

export const VIA = Object.freeze({
  ALIAS: 'obra_por_alias',
  NOMBRE: 'obra_por_nombre',
  UNICA: 'unica_obra_del_cliente',
  SIN_OBRA: 'sin_obra',
  NO_CLIENTE: 'no_es_cliente',
  // La columna «Obra» (AO) de la fila, desde el 14/09/2026. Manda sobre la K.
  FILA: 'obra_de_la_fila',
  ESTRUCTURA_FILA: 'estructura_de_la_fila',
})

/** La clave que une la fila con `costos_obra.referencia_externa`. La MISMA cuenta que el sync. */
export function referenciaDeCompra(c) {
  return c.sheet_id === null || c.sheet_id === undefined ? String(c.fila) : String(c.sheet_id)
}

/**
 * LOS RÓTULOS QUE SE PRUEBAN DE LA COLUMNA K: la K entera y su primer tramo.
 *
 * El bot de comprobantes escribe «<obra> - <ítems> · <medio de pago>». El corte exige espacio de un
 * lado del guión para no partir un número de OC («02-00002097»).
 */
export function rotulosDeDetalle(detalle) {
  const d = String(detalle ?? '').trim()
  if (!d) return []
  const primero = d.split(/\s+[-·]\s*|\s*[-·]\s+/)[0].trim()
  return [...new Set([d, primero].filter(Boolean))]
}

/**
 * El asignador, armado UNA vez con los catálogos. Devuelve `asignar(compra)`.
 *
 * `alias`: Map normAlias(alias) → obra_id · `canonicas`: filas de `obra_canonica` · `clienteAlias`:
 * Map normAlias(rótulo) → cliente canónico (todas las fuentes).
 */
export function asignadorDeCompras({ alias = new Map(), canonicas = [], clienteAlias = new Map() } = {}) {
  const resolver = resolutorDeObra({ alias, canonicas, clienteAlias })
  const clienteDe = (texto) => {
    const k = normAlias(texto)
    return k ? clienteAlias.get(k) ?? null : null
  }
  // Las obras de cada cliente. Una obra FUSIONADA en otra ya no es una obra aparte: contarla haría
  // que un cliente con una sola obra viva pareciera tener dos.
  const obrasDelCliente = new Map()
  const clienteDeObra = new Map()
  for (const o of canonicas) {
    if (o.fusionada_en) continue
    const cl = clienteDe(o.cliente_texto)
    if (!cl) continue
    const k = normAlias(cl)
    clienteDeObra.set(o.id, k)
    obrasDelCliente.set(k, [...(obrasDelCliente.get(k) ?? []), o.id])
  }

  return function asignar(c) {
    const cliente = clienteDe(c.obra_texto)
    if (!cliente) {
      return { cliente: null, obra_id: null, via: VIA.NO_CLIENTE,
        porque: `«${c.obra_texto ?? ''}» no es un cliente en cliente_alias` }
    }
    const k = normAlias(cliente)
    for (const rotulo of rotulosDeDetalle(c.detalle_obra)) {
      const r = resolver({ cliente: c.obra_texto, obra: rotulo })
      const directo = r.origen === VIA.ALIAS || r.origen === VIA.NOMBRE
      if (directo && clienteDeObra.get(r.obra_id) === k) {
        return { cliente, obra_id: r.obra_id, via: r.origen, porque: `columna K «${rotulo}»` }
      }
    }
    const suyas = obrasDelCliente.get(k) ?? []
    if (suyas.length === 1) {
      return { cliente, obra_id: suyas[0], via: VIA.UNICA, porque: `${cliente} tiene una sola obra` }
    }
    const detalle = String(c.detalle_obra ?? '').trim()
    return {
      cliente, obra_id: null, via: VIA.SIN_OBRA,
      porque: detalle
        ? `columna K «${detalle.slice(0, 80)}» no nombra una obra de ${cliente}`
        : `columna K vacía y ${cliente} tiene ${suyas.length} obras`,
    }
  }
}

/**
 * LA COLUMNA «Obra» DE LA FILA ANTES QUE LA INFERENCIA.
 *
 * La inferencia por la K es lo que hay cuando nadie decidió; cuando la fila trae una opción válida
 * del desplegable, ESA es la decisión y no se discute con un parecido de texto. Tres salidas:
 *   · código de obra      → esa obra (`obra_de_la_fila`), con el cliente de la obra.
 *   · ES-ADM / ES-TAL     → estructura (`estructura_de_la_fila`): ni costo de una obra ni «sin obra»
 *                           del cliente, aunque la J diga un cliente. El costo por obra no la suma.
 *   · «Sin obra – X»      → `sin_obra` de ese cliente, aunque la K nombre una obra.
 * Vacía o inválida → la inferencia de siempre; la invalidez la informa `proyectarObraDeFila`.
 */
export function asignadorConColumnaObra(asignar, cat) {
  return function asignarConFila(c) {
    const r = resolverCeldaObra(c.obra_celda, cat)
    if (!r.celda || r.error) return asignar(c)
    const porque = `columna Obra «${r.celda}»`
    if (r.destino !== DESTINO.OBRA) return { cliente: null, obra_id: null, via: VIA.ESTRUCTURA_FILA, porque }
    const cliente = r.cliente ?? asignar(c).cliente ?? String(c.obra_texto ?? '(sin cliente)')
    if (r.obra_id) return { cliente, obra_id: r.obra_id, via: VIA.FILA, porque }
    return { cliente, obra_id: null, via: VIA.SIN_OBRA, porque }
  }
}

/**
 * LA TABLA `compra_obra_asignada`: una fila por cada fila de Compras que es costo de obra —el MISMO
 * conjunto que `costos_obra`—, así cada peso de `costos_obra` tiene exactamente una asignación y la
 * suma por cliente (obras + sin obra) es, por construcción, el total de Compras del cliente.
 */
export function planDeAsignacion(compras, asignar) {
  return compras.filter(esCostoDeObra).map((c) => ({
    referencia: referenciaDeCompra(c), fila: c.fila, sheet_id: c.sheet_id ?? null, ...asignar(c),
  }))
}

/** Los tres catálogos, leídos con el `query` que se le pase (el del sync o el del dry). */
export async function catalogosDeAsignacion(query) {
  const [alias, canonicas, clientes] = [
    await query('select alias, obra_id from public.obra_alias where obra_id is not null'),
    await query('select id, codigo, nombre, cliente_texto, fusionada_en from public.obra_canonica'),
    await query('select rotulo_clave, cliente_canonico from public.cliente_alias'),
  ]
  return {
    alias: new Map(alias.rows.map((r) => [normAlias(r.alias), r.obra_id])),
    canonicas: canonicas.rows,
    clienteAlias: new Map(clientes.rows.map((r) => [normAlias(r.rotulo_clave), r.cliente_canonico])),
  }
}
