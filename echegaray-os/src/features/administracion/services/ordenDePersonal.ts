// EL ORDEN DEL MÓDULO PERSONAL, UNA SOLA VEZ — Y PARA TODAS LAS PANTALLAS DE LIQUIDACIÓN.
//
// El dueño (10/09/2026): «te pedí uniformidad en las pantallas; acá estoy en la sección y es
// distinto a las demás; buscá todas las pantallas de Liquidación y respetá el orden del módulo
// Personal».
//
// La regla ya existía en Plantel, Asistencia y la grilla de Horas (commit 84bc0fce): alfabético por
// nombre en español, jefes de obra primero, con los rótulos de `agruparPorRolOrganizacional`. Lo
// que faltaba era una función que las demás pantallas pudieran USAR en vez de reescribir el
// `sort` — y cada `sort` escrito a mano fue una pantalla que ordenó distinto: Pagos publicaba a los
// quince obreros alfabéticos y a los dos jefes de Oficina al final, sin un rótulo que lo explicara.
//
// ═══ POR QUÉ ESTO NO VIVE EN `vocabularioPersona.ts` ═══
//
// Porque aquel archivo declara el vocabulario y AGRUPA sin tocar el orden interno («el orden interno
// no se toca: llega ordenado por quien lo leyó de la base»). Ese contrato sigue igual; acá se
// resuelve el paso anterior —ORDENAR— y después se delega en él para agrupar.

import { agruparPorRolOrganizacional } from './vocabularioPersona.ts'
import type { GrupoLiquidacion } from './liquidacionQuincena.ts'

/**
 * JEFES PRIMERO, Y ALFABÉTICO EN ESPAÑOL DENTRO DE CADA GRUPO.
 *
 * `localeCompare(…, 'es')` y no `<`: con el orden binario «Ñ» cae después de «Z» y los acentos
 * ordenan al final del alfabeto. Es ESTABLE respecto del ingreso —dos personas con el mismo nombre
 * conservan el orden en que llegaron— porque `Array.prototype.sort` lo garantiza y acá no se
 * desempata por nada más: inventar un desempate por id haría que la lista cambiara de orden cuando
 * la base devuelve las filas en otro orden.
 */
export function ordenarComoPersonal<T>(
  items: readonly T[], nombreDe: (item: T) => string, esJefeDe: (item: T) => boolean,
): T[] {
  return [...items].sort((a, b) => {
    const ja = esJefeDe(a) ? 0 : 1
    const jb = esJefeDe(b) ? 0 : 1
    if (ja !== jb) return ja - jb
    return nombreDe(a).localeCompare(nombreDe(b), 'es')
  })
}

/**
 * EL ORDEN DE LOS CUADROS DE PAGO — Oficina arriba, igual que Jefes de obra en Personal.
 *
 * Los tres cuadros se conservan porque son la definición de POR QUÉ cobra cada uno (`armarCuadros`),
 * pero se publican en el orden del módulo: Oficina son los jefes de obra, así que van primero;
 * después los obreros; las liquidaciones finales al pie, porque son gente que ya se fue.
 */
export const ORDEN_DE_CUADROS: readonly GrupoLiquidacion[] = ['oficina', 'obreros', 'final']

export function ordenarCuadros<T extends { grupo: GrupoLiquidacion }>(cuadros: readonly T[]): T[] {
  return [...cuadros].sort(
    (a, b) => ORDEN_DE_CUADROS.indexOf(a.grupo) - ORDEN_DE_CUADROS.indexOf(b.grupo),
  )
}

export interface SeccionDePersonal<T> {
  clave: string
  /** Lo que se dibuja con `RotuloDeGrupo`: el mismo texto que Plantel y Asistencia. */
  rotulo: string
  lineas: T[]
}

/**
 * LAS SECCIONES DE UN CUADRO, CON EL RÓTULO QUE CORRESPONDE.
 *
 *   todas las líneas del mismo rol  →  el rótulo de Personal («Jefes de obra · 2», «Obreros · 15»)
 *   roles mezclados                 →  el nombre del cuadro, porque el rol NO describe a esa lista
 *   liquidaciones finales           →  el nombre del cuadro: son subcontratistas y gente que se fue
 *                                      (dueño, 31/08/2026), no «obreros» del plantel
 *
 * El orden interno es siempre el de Personal, esté o no partido en dos: partir la lista es una
 * decisión de rótulo, ordenarla no.
 */
export function seccionesDePersonal<T>(
  grupo: GrupoLiquidacion,
  titulo: string,
  lineas: readonly T[],
  nombreDe: (item: T) => string,
  esJefeDe: (item: T) => boolean,
): SeccionDePersonal<T>[] {
  const ordenadas = ordenarComoPersonal(lineas, nombreDe, esJefeDe)
  if (ordenadas.length === 0) return []
  if (grupo === 'final') return [{ clave: 'final', rotulo: titulo, lineas: ordenadas }]
  const grupos = agruparPorRolOrganizacional(ordenadas, esJefeDe)
  if (grupos.length !== 1) return [{ clave: grupo, rotulo: titulo, lineas: ordenadas }]
  return [{ clave: grupos[0].clave, rotulo: grupos[0].rotulo, lineas: grupos[0].integrantes }]
}
