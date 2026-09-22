// LA VERIFICACIÓN DE USO (M10 · M13 · D11 · D01) — puro: sin Supabase, sin React.
//
// Antes de salir con un rodado o de arrancar un equipo, quien lo maneja u opera carga el km (u horas)
// y cuatro respuestas Bien/Mal. La base (migración 20260922T1200, `registrar_verificacion_uso`) es la
// que decide: rechaza un odómetro que baja y deja fuera de servicio un «Mal» crítico. Acá está lo que
// la pantalla necesita saber ANTES de mandar (para avisar) y DESPUÉS (para mostrar la última).
//
// ═══ BASE NORMATIVA: SIN VERIFICAR ═══
// El diseño cita el Dec. 911/96 y la Res. SRT 960/15. Nadie verificó que este checklist los cumpla:
// es el checklist OPERATIVO de la empresa y ninguna pantalla puede decir que cumple una norma. La
// habilitación del operador (licencia E.2, capacitación) no existe en la base: no se muestra.
//
// ═══ VACÍO NO ES CERO ═══
// Sin la migración aplicada no hay «nunca»: hay «sin la migración». Sin lectura cargada, el km es
// «sin cargar», nunca 0.

import type { Activo, Clase, LecturaUso, RespuestaChecklist } from '../types.ts'
import { diasDesde, vivo, type Parque } from './parque.ts'

export type ClaseVerificable = Extract<Clase, 'rodado' | 'equipo'>

export interface ItemChecklist {
  clave: string
  /** Como lo escribe el diseño en la pantalla del teléfono. */
  rotulo: string
  critico: boolean
}

/**
 * Los ítems, en el orden del diseño. ESPEJO de `_verificacion_items()` de la migración 20260922T1200:
 * `verificacion.test.ts` lee el bloque ITEMS-VERIFICACION de ese archivo y falla si se separan.
 */
export const ITEMS: Record<ClaseVerificable, ItemChecklist[]> = {
  rodado: [
    { clave: 'frenos_direccion', rotulo: 'Frenos y dirección', critico: true },
    { clave: 'luces_alarma', rotulo: 'Luces y alarma de retroceso', critico: true },
    { clave: 'cubiertas_fluidos', rotulo: 'Cubiertas y fluidos', critico: false },
    { clave: 'matafuego_auxilio_botiquin', rotulo: 'Matafuego, auxilio y botiquín', critico: false },
  ],
  equipo: [
    { clave: 'guardas', rotulo: 'Guardas y protecciones', critico: true },
    { clave: 'corte_emergencia', rotulo: 'Corte de emergencia', critico: true },
    { clave: 'alarma_retroceso', rotulo: 'Alarma de retroceso', critico: true },
    { clave: 'combustible_perdidas', rotulo: 'Combustible y pérdidas', critico: false },
  ],
}

export const UNIDAD: Record<ClaseVerificable, 'km' | 'h'> = { rodado: 'km', equipo: 'h' }

/** Qué se verifica: rodados y equipos vivos. Una herramienta de mano no; un activo en baja, tampoco. */
export function seVerifica<T extends Pick<Activo, 'clase' | 'estado'>>(a: T): a is T & { clase: ClaseVerificable } {
  return vivo(a) && (a.clase === 'rodado' || a.clase === 'equipo')
}

export function esCritico(clase: ClaseVerificable, clave: string): boolean {
  return ITEMS[clase].some((i) => i.clave === clave && i.critico)
}

export type Respuestas = Record<string, RespuestaChecklist | undefined>

/** Los ítems en «Mal», separados en críticos (sacan de servicio) y el resto (sólo reportan). */
export function enMal(clase: ClaseVerificable, r: Respuestas): { criticos: ItemChecklist[]; otros: ItemChecklist[] } {
  const mal = ITEMS[clase].filter((i) => r[i.clave] === 'mal')
  return { criticos: mal.filter((i) => i.critico), otros: mal.filter((i) => !i.critico) }
}

/** ¿Están las cuatro respuestas? Sin las cuatro no se manda: una verificación a medias no es una verificación. */
export function completo(clase: ClaseVerificable, r: Respuestas): boolean {
  return ITEMS[clase].every((i) => r[i.clave] === 'bien' || r[i.clave] === 'mal')
}

// ── LECTURAS ────────────────────────────────────────────────────────────────────────────────────

/** Las verificaciones de un activo, de la más nueva a la más vieja. */
export function lecturasDe(p: Parque, activoId: string): LecturaUso[] {
  return p.lecDe.get(activoId) ?? []
}

export function ultimaVerificacion(p: Parque, activoId: string): LecturaUso | null {
  return lecturasDe(p, activoId)[0] ?? null
}

/** La última lectura CARGADA (una verificación sin km no borra el km anterior). */
export function ultimaLectura(p: Parque, activoId: string): { valor: number; fecha: string } | null {
  const l = lecturasDe(p, activoId).find((x) => x.lectura != null)
  return l && l.lectura != null ? { valor: l.lectura, fecha: l.fecha_hora } : null
}

// ── ¿CUÁNDO SE VERIFICÓ? ────────────────────────────────────────────────────────────────────────

export type EstadoVerif =
  | { tipo: 'sin_base' }
  | { tipo: 'nunca' }
  | { tipo: 'hoy'; hora: string }
  | { tipo: 'ayer' }
  | { tipo: 'dias'; n: number }

const HORA = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/San_Juan', hour: '2-digit', minute: '2-digit', hour12: false })

/**
 * `ultima` = fecha ISO de la última verificación; `null` = nunca; `undefined` = la tabla no existe
 * todavía (sin la migración no se puede decir «nunca»). Por fecha calendario de San Juan.
 */
export function estadoVerificacion(ultima: string | null | undefined, hoy: Date = new Date()): EstadoVerif {
  if (ultima === undefined) return { tipo: 'sin_base' }
  if (ultima === null) return { tipo: 'nunca' }
  const n = diasDesde(ultima, hoy)
  if (n <= 0) return { tipo: 'hoy', hora: HORA.format(new Date(ultima)) }
  if (n === 1) return { tipo: 'ayer' }
  return { tipo: 'dias', n }
}

/** «hoy 07:40» · «ayer» · «hace 3 d» · «nunca» · «sin la migración». Como la columna de D11. */
export function textoVerificacion(e: EstadoVerif): string {
  switch (e.tipo) {
    case 'sin_base': return 'sin la migración'
    case 'nunca': return 'nunca'
    case 'hoy': return `hoy ${e.hora}`
    case 'ayer': return 'ayer'
    case 'dias': return `hace ${e.n} d`
  }
}

/** El estado de un activo en el parque. Sin la tabla, `sin_base`. */
export function verificacionDe(p: Parque, activoId: string, hoy: Date = new Date()): EstadoVerif {
  if (!p.lecturas) return { tipo: 'sin_base' }
  return estadoVerificacion(ultimaVerificacion(p, activoId)?.fecha_hora ?? null, hoy)
}

/**
 * «Sin verificar hoy» del Resumen: de los rodados y equipos vivos, cuántos no tienen una verificación
 * con fecha de hoy. `null` = sin la migración (la cifra no existe, no es cero).
 */
export function sinVerificarHoy(p: Parque, hoy: Date = new Date()): { sin: number; de: number } | null {
  if (!p.lecturas) return null
  const verificables = p.activos.filter(seVerifica)
  const sin = verificables.filter((a) => verificacionDe(p, a.id, hoy).tipo !== 'hoy').length
  return { sin, de: verificables.length }
}

// ── EL NÚMERO QUE SE CARGA ──────────────────────────────────────────────────────────────────────

/** Tope por día de lo que un rodado o un equipo puede sumar. Un rodado a Buenos Aires hace ~1.150 km. */
export const TOPE_POR_DIA: Record<'km' | 'h', number> = { km: 1200, h: 24 }

export type ChequeoLectura =
  | { tipo: 'ok' }
  | { tipo: 'baja'; anterior: number; fecha: string }
  | { tipo: 'salto'; diferencia: number; tope: number; dias: number }

/**
 * Lo que la pantalla dice del número antes de mandarlo. «baja» repite lo que la base rechaza (el
 * odómetro no vuelve atrás); «salto» es más de lo que se puede hacer en el tiempo transcurrido desde la
 * última lectura —probable dedo de más—: se avisa y quien carga confirma, la base no lo rechaza.
 * Menos de un día cuenta como un día entero.
 */
export function chequearLectura(
  nueva: number | null, anterior: { valor: number; fecha: string } | null, unidad: 'km' | 'h', ahora: Date = new Date(),
): ChequeoLectura {
  if (nueva == null || !anterior) return { tipo: 'ok' }
  if (nueva < anterior.valor) return { tipo: 'baja', anterior: anterior.valor, fecha: anterior.fecha }
  const dias = Math.max(1, Math.ceil((ahora.getTime() - Date.parse(anterior.fecha)) / 86_400_000))
  const tope = TOPE_POR_DIA[unidad] * dias
  const diferencia = nueva - anterior.valor
  return diferencia > tope ? { tipo: 'salto', diferencia, tope, dias } : { tipo: 'ok' }
}

/** «148.220» · «412,5». Lo que se tipea en el teléfono: «148.220», «148220», «412,5». */
export function numeroAr(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n)
}

/** Lee lo que tipea la gente: «148.220» y «148220» son lo mismo; «412,5» son horas y media. `null` = vacío o ilegible. */
export function leerNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s|km|hs?\b/gi, '')
  if (!t) return null
  if (!/^\d{1,3}(\.\d{3})*(,\d)?$|^\d+(,\d)?$/.test(t)) return null
  return Number(t.replace(/\./g, '').replace(',', '.'))
}

/** «148.220 km» · «412 h» · «sin cargar». */
export function textoLectura(v: { valor: number } | null, unidad: 'km' | 'h'): string {
  return v ? `${numeroAr(v.valor)} ${unidad}` : 'sin cargar'
}
