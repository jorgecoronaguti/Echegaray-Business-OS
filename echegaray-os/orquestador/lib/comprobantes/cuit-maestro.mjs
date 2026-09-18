// EL CUIT QUE ARCA CONFIRMÓ COMPLETA EL MAESTRO DE PROVEEDORES — NÚCLEO PURO + UNA ESCRITURA ACOTADA.
//
// ═══ EL DEFECTO (17/09/2026, fila 981, Neumagom) ═══
//
// La columna «CUIT (OS)» de Compras es una ARRAYFORMULA: `VLOOKUP(E; '_PROVEEDORES_OS'!A:B)`. La
// auxiliar la genera `proveedores-cuenta-corriente.mjs` desde `public.proveedores`. Neumagom está
// en el maestro SIN CUIT, así que la celda queda vacía… mientras el comprobante que se acaba de
// cargar traía el CUIT 30-69185382-5 y ARCA lo confirmó contra el libro fiscal. El dato existía,
// verificado, y se tiraba: el camino de altas sólo corre para proveedores NUEVOS, y Neumagom
// matcheó por nombre. Ocho proveedores del maestro estaban así el 18/09.
//
// ═══ LA REGLA, Y POR QUÉ ES ESTRICTA ═══
//
// Se completa SÓLO el CUIT que ARCA confirmó (`estado: coincide`, `emisorCuit` del libro fiscal).
// El CUIT leído de la foto no alcanza: VILLA DEL PINO entró una vez como 30716304677 y cinco como
// 30714340677 — el OCR se come dígitos, y un CUIT equivocado en el maestro parte la cuenta
// corriente. Y sólo cuando la fila del maestro NO tiene CUIT y ningún otro proveedor tiene ése:
// una contradicción la resuelve una persona en /administracion/proveedores, no este archivo.
//
// Es Nivel D (escritura interna en la base, reversible: `update … set cuit = null`). No toca el
// Sheet: la auxiliar `_PROVEEDORES_OS` la regenera su paso del pipeline y recién entonces la
// ARRAYFORMULA muestra el CUIT. El aviso del bot lo dice así, sin prometer la celda.

import { normalizar } from '../carga-comprobantes.mjs'

const digitos = (v) => String(v ?? '').replace(/\D/g, '')

/**
 * NÚCLEO PURO: qué filas del maestro pueden recibir el CUIT confirmado de esta corrida.
 *
 * @param {Array<{proveedor?:string, cuitConfirmado?:string|null}>} plan  filas del plan del cargador
 * @param {{ok?:boolean, proveedores?:Array<{id:string, nombre:string, cuit:string|null}>}|null} maestro
 * @returns {Array<{id:string, nombre:string, cuit:string}>}
 */
export function cuitsParaCompletar(plan = [], maestro = null) {
  if (!maestro?.ok || !Array.isArray(maestro.proveedores)) return []
  const candidatos = new Map()
  for (const p of plan) {
    const cuit = digitos(p?.cuitConfirmado)
    const nombre = normalizar(p?.proveedor)
    if (cuit.length !== 11 || !nombre) continue
    const fila = maestro.proveedores.find((x) => normalizar(x?.nombre) === nombre)
    if (!fila?.id || digitos(fila.cuit)) continue
    if (maestro.proveedores.some((x) => digitos(x?.cuit) === cuit)) continue // ese CUIT ya es de otro
    const previo = candidatos.get(fila.id)
    if (previo && previo.cuit !== cuit) { candidatos.set(fila.id, null); continue } // dos CUIT para un nombre: nadie
    if (previo === null) continue
    candidatos.set(fila.id, { id: fila.id, nombre: String(fila.nombre).trim(), cuit })
  }
  return [...candidatos.values()].filter(Boolean)
}

/**
 * BORDE: escribe los CUIT en `public.proveedores`, uno por uno, con las mismas guardas en SQL
 * (sigue sin CUIT, y ningún otro lo tiene). Devuelve lo que la base confirmó, no lo que se pidió.
 *
 * @param {Function} query
 * @param {Array<{id:string, nombre:string, cuit:string}>} pendientes  de `cuitsParaCompletar`
 * @returns {Promise<Array<{id:string, nombre:string, cuit:string}>>}
 */
export async function completarCuitsDelMaestro(query, pendientes = []) {
  if (typeof query !== 'function') throw new Error('completarCuitsDelMaestro necesita un `query`')
  const out = []
  for (const p of pendientes) {
    const { rows } = await query(
      `update public.proveedores set cuit = $1
        where id = $2 and cuit is null
          and not exists (select 1 from public.proveedores o where o.cuit = $1 and o.id <> $2)
        returning id, nombre, cuit`,
      [p.cuit, p.id],
    )
    if (rows?.[0]?.id) out.push(rows[0])
  }
  return out
}
