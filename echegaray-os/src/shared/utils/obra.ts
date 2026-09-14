// CÓMO SE NOMBRA UNA OBRA EN PANTALLA — una sola vez para toda la app.
//
// El dueño (14/09/2026): «además del nombre agregar un id único de obra interno para no confundirlas».
// `obra_canonica.codigo` (`OB-0012`) no cambia nunca; el nombre sí («CÓDIGO - NOMBRE» se estrenó ese
// mismo día). Si cada pantalla armara su propio «código · nombre», la primera que se escriba distinto
// deja dos rótulos para la misma obra, que es exactamente la confusión que el código viene a sacar.

import { contieneEnAlguno, plano } from './busqueda.ts'

/** El formato que impone la base (`obra_canonica_codigo_formato`). `ZZ-` son las obras de la suite E2E. */
export const FORMATO_CODIGO_OBRA = /^(OB|ZZ)-[0-9]{4,}$/

export interface ObraConRotulo {
  nombre: string | null | undefined
  codigo?: string | null
}

/**
 * «OB-0012 · ME - PLAYÓN DE AZUFRE».
 *
 * Sin código (la migración todavía no se aplicó, o la lectura del código falló) queda el nombre solo:
 * un rótulo sin código es incompleto, uno con un código inventado es falso. Sin nombre queda el
 * código, que igual identifica la obra.
 */
export function rotuloDeObra(obra: ObraConRotulo): string {
  const nombre = String(obra.nombre ?? '').trim()
  const codigo = String(obra.codigo ?? '').trim()
  if (!codigo) return nombre
  if (!nombre) return codigo
  return `${codigo} · ${nombre}`
}

/** «ob12», «OB 12», «0012», «12» → 12. Lo que no tiene forma de código → null. */
function numeroBuscado(q: string): { prefijo: string | null; numero: number } | null {
  const m = /^(ob|zz)?[\s-]*0*(\d+)$/.exec(plano(q))
  return m ? { prefijo: m[1] ?? null, numero: Number(m[2]) } : null
}

/**
 * ¿La obra es lo que se buscó? Por nombre, por cliente o por CÓDIGO.
 *
 * El código se busca por número y no sólo como texto: nadie tipea «OB-0012» con los ceros; tipea
 * «ob12» o «12». Un número suelto encuentra la obra con ese código Y las que lo tienen en el nombre
 * («PISOS 120 M²» con «120»): filtrar de más es visible, filtrar de menos esconde la obra buscada.
 */
export function coincideObra(obra: ObraConRotulo & { cliente?: string | null }, q: string): boolean {
  if (contieneEnAlguno([obra.codigo, obra.nombre, obra.cliente], q)) return true
  const buscado = numeroBuscado(q)
  const propio = /^(OB|ZZ)-(\d+)$/.exec(String(obra.codigo ?? '').trim())
  if (!buscado || !propio) return false
  return Number(propio[2]) === buscado.numero && (buscado.prefijo == null || buscado.prefijo === propio[1].toLowerCase())
}
