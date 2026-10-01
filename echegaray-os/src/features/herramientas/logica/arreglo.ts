// EL ARREGLO — lógica pura sobre los eventos del libro de vida (migración 20261001T0800), sin base.
//
// Un arreglo es un evento que pasó por el mecánico: `ingreso_taller` es el reloj. Todo lo que la pantalla dice
// («3 afuera», «hace 12 días», «atrasado») sale de acá, así Mantenimiento, el listado y la ficha no pueden
// contar distinto. Los días se cuentan entre FECHAS (YYYY-MM-DD) y no entre instantes: una fecha sin hora
// interpretada como UTC cae el día anterior en San Juan.

import type { Activo } from '../types.ts'
import type { Evento } from './evento.ts'

const ZONA = 'America/Argentina/San_Juan'
const MS_DIA = 86_400_000

/** Hoy en San Juan como YYYY-MM-DD. */
export const hoyIso = (hoy: Date = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(hoy)

/** Días entre dos fechas YYYY-MM-DD (negativo si `hasta` es anterior). */
export const diasEntre = (desde: string, hasta: string): number =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_DIA)

/** Está afuera: en el mecánico y todavía no volvió. */
export const estaAfuera = (e: Pick<Evento, 'situacion'>): boolean => e.situacion === 'en_taller'

/**
 * Días que lleva (o llevó) fuera. En el mecánico: hasta hoy. Ya volvió: hasta la vuelta. `null` si nunca
 * pasó por el mecánico o se cargó sin la fecha de ingreso: no se inventa un número.
 */
export function diasFuera(e: Pick<Evento, 'situacion' | 'ingreso_taller' | 'vuelta_en'>, hoy: string): number | null {
  if (!e.ingreso_taller) return null
  if (e.situacion === 'en_taller') return Math.max(0, diasEntre(e.ingreso_taller, hoy))
  return e.vuelta_en ? Math.max(0, diasEntre(e.ingreso_taller, e.vuelta_en)) : null
}

/** Pasó la vuelta prometida y sigue afuera. Sin fecha prometida no hay «atrasado»: no se supone. */
export const atrasado = (e: Pick<Evento, 'situacion' | 'vuelta_estimada'>, hoy: string): boolean =>
  estaAfuera(e) && !!e.vuelta_estimada && e.vuelta_estimada < hoy

export interface Afuera { evento: Evento; activo: Activo; dias: number | null; atrasado: boolean }

/** Lo que está en el mecánico ahora, lo que más lleva primero (los que no tienen fecha de ingreso, al final). */
export function afuera(eventos: Evento[] | null | undefined, porId: Map<string, Activo>, hoy: string): Afuera[] {
  const out: Afuera[] = []
  for (const e of eventos ?? []) {
    const activo = porId.get(e.activo_id)
    if (!estaAfuera(e) || !activo || activo.estado === 'baja') continue
    out.push({ evento: e, activo, dias: diasFuera(e, hoy), atrasado: atrasado(e, hoy) })
  }
  return out.sort((x, y) => (y.dias ?? -1) - (x.dias ?? -1) || x.activo.nombre.localeCompare(y.activo.nombre, 'es'))
}

/** El arreglo en el mecánico de un activo (hay a lo sumo uno útil; si hubiera dos, el que lleva más). */
export function arregloEnTaller(eventos: Evento[] | null | undefined, activoId: string, hoy: string): Evento | null {
  const mios = (eventos ?? []).filter((e) => e.activo_id === activoId && estaAfuera(e))
  if (mios.length <= 1) return mios[0] ?? null
  return [...mios].sort((x, y) => (diasFuera(y, hoy) ?? -1) - (diasFuera(x, hoy) ?? -1))[0]
}

export function resumenAfuera(lista: Afuera[]): { cuantos: number; masViejo: number | null; atrasados: number } {
  const dias = lista.map((x) => x.dias).filter((d): d is number => d != null)
  return { cuantos: lista.length, masViejo: dias.length ? Math.max(...dias) : null, atrasados: lista.filter((x) => x.atrasado).length }
}

export const plazoDias = (n: number): string => (n === 0 ? 'hoy' : `${n} ${n === 1 ? 'día' : 'días'}`)

/** Un activo en un lote no lleva arreglo: el estado es de todo el lote. */
export const admiteArreglo = (a: Pick<Activo, 'estado' | 'cantidad'>): boolean => a.estado !== 'baja' && a.cantidad <= 1

/** Lo que la base también rechaza, dicho antes de mandar. `null` = se puede mandar. */
export function errorDeIngreso(d: { falla: string; taller: string; ingreso: string; vueltaEstimada: string; hoy: string }): string | null {
  if (d.falla.trim().length < 3) return 'Contá en una línea qué falla tiene (3 letras o más).'
  if (!d.taller.trim()) return 'Falta el mecánico: elegí un proveedor o escribí el nombre.'
  if (!d.ingreso) return 'Falta el día que entró al taller.'
  if (d.ingreso > d.hoy) return 'El ingreso al taller no puede ser en el futuro.'
  if (d.vueltaEstimada && d.vueltaEstimada < d.ingreso) return 'La vuelta estimada no puede ser anterior al ingreso.'
  return null
}

/** El cierre: qué se le hizo es obligatorio, la vuelta no es futura ni anterior al ingreso y el costo no es negativo. */
export function errorDeCierre(d: { trabajo: string; vuelta: string; ingreso: string | null; costo: string; resultado: string; hoy: string }): string | null {
  if (d.trabajo.trim().length < 3) return 'Contá qué se le hizo (3 letras o más).'
  if (d.resultado !== 'operativo' && d.resultado !== 'baja') return 'Decí cómo quedó: operativo o se da de baja.'
  if (!d.vuelta) return 'Falta el día que volvió.'
  if (d.vuelta > d.hoy) return 'La vuelta no puede ser en el futuro.'
  if (d.ingreso && d.vuelta < d.ingreso) return 'No puede haber vuelto antes de entrar al taller.'
  const costo = d.costo.trim().replace(',', '.')
  if (costo && (!Number.isFinite(Number(costo)) || Number(costo) < 0)) return 'El costo es un número de 0 o más.'
  return null
}

/** `2026-09-30` → `30/09/2026`. */
export const diaMesAnioIso = (iso: string): string => {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/**
 * El renglón del libro de vida de un evento, en palabras: la falla, lo que se le hizo, dónde, cuándo entró y
 * volvió, cuántos días estuvo fuera, repuestos, costo y N° de comprobante. Sólo lo que está cargado: lo que
 * falta no se dice «0» ni «sin».
 */
export function renglonDeLibro(
  e: Evento,
  c: { nombreTipo: string; taller: string | null; quien: string | null; hoy: string; pesos: (n: number) => string; numero: (n: number) => string },
): string {
  const dias = diasFuera(e, c.hoy)
  const quien = e.llevado_por || c.quien
  const partes = [
    e.trabajo_hecho ? `${c.nombreTipo} · ${e.descripcion} → ${e.trabajo_hecho}` : `${c.nombreTipo} · ${e.descripcion}`,
    c.taller,
    e.ingreso_taller ? `entró ${diaMesAnioIso(e.ingreso_taller)}${quien ? ` (lo llevó ${quien})` : ''}` : null,
    e.vuelta_en ? `volvió ${diaMesAnioIso(e.vuelta_en)}` : null,
    dias != null ? `${plazoDias(dias)} ${e.situacion === 'en_taller' ? 'afuera' : 'fuera'}` : null,
    e.repuestos ? `repuestos: ${e.repuestos}` : null,
    e.km != null ? `${c.numero(e.km)} km` : null,
    e.costo != null ? c.pesos(e.costo) : null,
    e.compra_ref ? `comprobante ${e.compra_ref}` : null,
    e.proximo_km != null ? `próximo a los ${c.numero(e.proximo_km)} km` : null,
    e.proximo_fecha ? `próximo ${diaMesAnioIso(e.proximo_fecha)}` : null,
    e.resultado === 'baja' ? 'se dio de baja' : null,
  ]
  return partes.filter(Boolean).join(' · ')
}

/** Cómo se escribe un activo en el buscador del panel: «ROD-0003 · Hilux». */
export const rotuloDeBusqueda = (a: Pick<Activo, 'codigo' | 'nombre'>): string => `${a.codigo} · ${a.nombre}`

/** Los activos a los que se les puede cargar un arreglo: una unidad, no dada de baja y que no esté ya en el mecánico. */
export function candidatosArreglo(activos: Activo[], eventos: Evento[] | null | undefined): Activo[] {
  const afueraIds = new Set((eventos ?? []).filter(estaAfuera).map((e) => e.activo_id))
  return activos.filter((a) => admiteArreglo(a) && !afueraIds.has(a.id))
    .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
}

/** El activo que se escribió (rótulo completo o sólo el código); `null` si no es uno de los candidatos. */
export function activoDeTexto(candidatos: Activo[], texto: string): Activo | null {
  const t = texto.trim().toLowerCase()
  if (!t) return null
  return candidatos.find((a) => rotuloDeBusqueda(a).toLowerCase() === t || a.codigo.toLowerCase() === t) ?? null
}
