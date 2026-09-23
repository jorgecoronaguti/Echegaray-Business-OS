// EL PARTE DIARIO — lo que la pantalla DECIDE, fuera de la pantalla.
//
// El canónico «05 · Registrar avance» dibuja tres decisiones que no son de presentación: qué frentes
// se listan, cómo se escribe un acumulado que todavía no existe, y qué falta para poder registrar.
// Escritas dentro del JSX no se pueden probar sin un navegador, y son exactamente las que un
// rediseño vuelve a llenar de ceros: «0,00 / 96,00» en un frente que nunca reportó, «0 %» donde no
// hay medición, «Registrar» habilitado sobre un formulario que el servidor va a rebotar.
//
// Acá viven puras, con su test al lado. La FORMA la ponen los componentes de `components/parte/`.

import type { Actividad, ParteEjecucion } from '../types/index.ts'
import { pendienteDe } from './ejecucionService.ts'
import { leerNumeroEsAR } from '../../../shared/lib/numeroEsAR.ts'

/** Dos decimales SIEMPRE, como el mockup: «0,43 / 1,08 m³», «2,84 / 2,84 m³». Un «96» al lado de un
 *  «71,04» hace leer dos escalas distintas en la misma celda. */
const dec2 = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** El porcentaje del zip va PEGADO al signo (`f.av + "%"`), sin el espacio del es-AR. */
const pct1 = (n: number) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`

/**
 * El día corrido `n` posiciones desde `iso`, en el mismo formato ISO.
 *
 * EN UTC A PROPÓSITO: con la hora local, un `Date` de medianoche en San Juan (UTC−3) retrocede al
 * día anterior al serializar, y la flecha «día anterior» saltearía dos días.
 */
export function correr(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * EN CURSO ES UN HECHO, NO UN RÓTULO: la actividad declarada en curso, o la que tiene avance
 * empezado y sin terminar. Con sólo el rótulo, un frente que avanza y nadie declaró desaparece de
 * la lista donde se lo carga.
 */
export function enCurso(a: Actividad): boolean {
  return a.estado_operativo === 'en_curso'
    || (a.avance_pct != null && a.avance_pct > 0 && a.avance_pct < 100)
}

/**
 * Los frentes cargables, en el orden del canónico: primero lo que ya arrancó —que es lo que se
 * carga todos los días— y después lo que todavía no empezó.
 *
 * Un rubro de RESUMEN no se ejecuta: se completa solo con sus hijas, y ofrecerlo en el desplegable
 * del parte es ofrecer una carga que la base rechaza. Una archivada tampoco: salió del plan.
 */
export function frentesDelParte(actividades: Actividad[], soloCurso: boolean): Actividad[] {
  const ejecutables = actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada)
  const vivo = (x: Actividad) => (x.estado_operativo === 'en_curso' ? 0 : x.avance_pct ? 1 : 2)
  const orden = [...ejecutables].sort((a, b) => vivo(a) - vivo(b) || a.orden - b.orden)
  return soloCurso ? orden.filter(enCurso) : orden
}

/**
 * EL NOMBRE COMPLETO DE UN FRENTE — «Mampostería ladrillón · Eje 1–4».
 *
 * Así lo escribe el canónico: el rubro y el tramo en un solo renglón separados por «·». No es
 * decoración: dos actividades pueden llamarse igual en dos rubros distintos, y en un desplegable de
 * una línea por frente el nombre solo no alcanza para saber cuál se está cargando.
 */
export const nombreDeFrente = (a: { rubro: string | null; nombre: string }): string =>
  a.rubro ? `${a.rubro} · ${a.nombre}` : a.nombre

export interface Acumulado {
  texto: string
  /** `false` = el frente no reportó NADA. No es cero: es que no hay medición cargada, y por eso el
   *  canónico escribe «sin registrar» en gris y deja el porcentaje en «—». */
  registrado: boolean
}

/** El acumulado de un frente: «71,04 / 96,00 m²», «12 %» o «sin registrar». NUNCA «0,00 / 96,00». */
export function acumuladoDeFrente(a: Actividad): Acumulado {
  if (a.metodo_avance === 'cantidad') {
    if (a.cantidad_ejecutada == null) return { texto: 'sin registrar', registrado: false }
    const u = a.unidad ?? ''
    const texto = a.cantidad_objetivo == null
      // Sin objetivo no hay «de cuánto»: se publica lo ejecutado solo, no una fracción inventada.
      ? `${dec2(a.cantidad_ejecutada)} ${u}`
      : `${dec2(a.cantidad_ejecutada)} / ${dec2(a.cantidad_objetivo)} ${u}`
    return { texto: texto.trim(), registrado: true }
  }
  if (a.avance_pct == null) return { texto: 'sin registrar', registrado: false }
  return { texto: pct1(a.avance_pct), registrado: true }
}

/** Los tres colores de barra del zip: verde al 100, azul en marcha, gris sin arrancar. */
export type TonoBarra = 'completo' | 'curso' | 'nulo'

export function tonoDeBarra(pct: number | null, registrado: boolean): TonoBarra {
  if (!registrado || pct == null) return 'nulo'
  return pct >= 100 ? 'completo' : pct > 0 ? 'curso' : 'nulo'
}

/** El número a la derecha de la barra. Sin acumulado registrado es «—», nunca «0%». */
export function textoDeAvance(a: Actividad, acumulado: Acumulado): string {
  if (!acumulado.registrado || a.avance_pct == null) return '—'
  return pct1(a.avance_pct)
}

/** Lo que movió un parte: «+15,20 m²», «+12 %» o «—» cuando no midió nada (sólo HH y nota). */
export function resumenDelParte(p: ParteEjecucion, a: Actividad | undefined): string {
  if (p.cantidad != null) return `+${dec2(p.cantidad)} ${a?.unidad ?? ''}`.trim()
  if (p.avance_pct != null) return `+${p.avance_pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`
  return '—'
}

/** Una actividad que declara su avance a mano: el campo del parte es el AVANCE DEL DÍA, no cantidad. */
export const porDeclaracion = (a: Actividad): boolean =>
  a.metodo_avance === 'manual' || a.metodo_avance === 'partes'

/**
 * QUÉ FALTA PARA REGISTRAR, con las palabras del zip.
 *
 * Es lo que el SERVIDOR exige: sin cantidad ni avance devuelve «Poné la cantidad ejecutada o el
 * avance del día». Prometer que las HH solas alcanzan sería mandar a la persona a un error que la
 * pantalla ya conocía. `null` = se puede registrar.
 *
 * NO exige gente marcada —el zip sí—: las horas de una jornada también se cargan desde Personal, y
 * bloquear el parte por eso perdería la producción del día por un dato que entra por otra puerta.
 * Que falten se avisa en el chip, en tono de aviso, sin apagar la primaria.
 */
export function faltaParaRegistrar(sel: Actividad | null, hayMedida: boolean): string | null {
  if (sel == null) return 'Elegí la actividad'
  if (hayMedida) return null
  return porDeclaracion(sel) ? 'Cargá el avance del día' : 'Cargá la cantidad'
}

/**
 * LA COMA ES LO QUE SALE DE UN TECLADO EN ESPAÑOL.
 *
 * El canónico escribe la medición en un `input type="text"` con el placeholder «0,00», así que lo
 * que se tipea es «15,20». `z.coerce.number()` de esa cadena da `NaN` y el parte vuelve rebotado
 * con un error que no dice nada. Se normaliza antes de mandar —igual que `leerReparto` hace con las
 * horas—: el criterio de qué es un número decimal es UNO en todo el parte.
 */
export function conDecimalesEnPunto(datos: FormData, campos: readonly string[]): FormData {
  // «1.500» ES MIL QUINIENTOS (auditoría, 18/09/2026): antes sólo se cambiaba la coma, y «1.500» llegaba a
  // `z.coerce.number()` como 1,5. Se lee con el lector de la casa y viaja en forma canónica; lo que no se puede
  // leer se deja tal cual, para que el esquema lo rechace con su mensaje.
  for (const campo of campos) {
    const v = datos.get(campo)
    if (typeof v !== 'string' || v.trim() === '') continue
    const l = leerNumeroEsAR(v)
    if (l.ok && l.valor != null) datos.set(campo, String(l.valor))
  }
  return datos
}

/** Lo que falta de una actividad, al borde derecho de cada opción del desplegable (canónico 05). */
export function textoPendiente(a: Actividad): string {
  const p = pendienteDe(a)
  return p ? `${dec2(p.cantidad)} ${p.unidad}`.trim() : 'sin medición'
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// DISEÑO ERP OBRAS · 06 «Parte diario» y M08 (dueño, 23/09/2026).
//
// Lo que sigue son las DECISIONES de esa pantalla: qué renglones se dibujan, cómo se escribe cada
// cifra («960 / 1.100 · 87%», «30% declarado», «12 esperados · 10 marcados · 2 sin marcar»), cómo se
// nombra el día («lunes 07/09/2026», «Lun 21/09») y cómo se lee el formulario que guarda TODO el
// parte de una vez. La forma la ponen `components/parte/`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const DIAS_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const partesDe = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}
const dd = (n: number) => String(n).padStart(2, '0')

/** «lunes 07/09/2026» — el navegador de fecha de la 06. */
export function fechaLarga(iso: string): string {
  const { y, m, d, dow } = partesDe(iso)
  return `${DIAS_LARGO[dow]} ${dd(d)}/${dd(m)}/${y}`
}

/** «Lun 21/09» — la fecha grande de la M08. */
export function fechaCortaDia(iso: string): string {
  const { m, d, dow } = partesDe(iso)
  return `${DIAS_CORTO[dow]} ${dd(d)}/${dd(m)}`
}

/** Un entero con punto de miles, sin decimales de más: «1.100», «960», «12,5». */
export const cifra = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

/** El porcentaje entero pegado al signo: «87%». */
export const pctEntero = (n: number) => `${Math.round(n)}%`

/**
 * UN RENGLÓN POR FRENTE EN CURSO. Es lo que dice el subtítulo de la 06, y por eso NO se listan las
 * pendientes: el parte carga lo que se está haciendo. Entra la que está en curso o bloqueada (un
 * frente con impedimento abierto sigue siendo un frente en curso: se dibuja, sin input, con el borde
 * rojo), y la que tiene avance empezado sin terminar aunque nadie la haya declarado.
 */
export function renglonesDelParte(actividades: readonly Actividad[]): Actividad[] {
  return actividades
    .filter((a) => a.tipo !== 'resumen' && !a.archivada)
    .filter((a) => a.estado_operativo === 'en_curso' || a.estado_operativo === 'bloqueada' || enCurso(a))
    .sort((a, b) => a.orden - b.orden)
}

/** Bloqueada = tiene un impedimento abierto. Se deriva; nadie la elige. */
export const estaBloqueada = (a: Actividad): boolean =>
  a.estado_operativo === 'bloqueada' || a.impedimentos_abiertos > 0

/** «Rubro › Épica» debajo del nombre (11,5 px faint). Sin estructura, nada: no se inventa un rubro. */
export function rutaDeTarea(a: { seccion: string | null; rubro: string | null }): string | null {
  const partes = [a.seccion, a.rubro].filter((x): x is string => Boolean(x && x.trim()))
  const unicas = partes.filter((p, i) => partes.indexOf(p) === i)
  return unicas.length ? unicas.join(' › ') : null
}

/** Lo que sabe el resumen de partes por tarea (`actividad_partes_resumen`). */
export interface ResumenPartes {
  actividad_id: string
  fraccion_acumulada: number | null
  dias_reales: number
}

export interface CeldaAcumulado {
  texto: string
  /** El manual se escribe en tono de aviso: «30% declarado» es lo que alguien dijo, no lo que se midió. */
  tono: 'normal' | 'warn' | 'mudo'
}

/**
 * ACUMULADO: «960 / 1.100» (cantidad), «30% declarado» (manual, warn) o «sin registrar».
 * Nunca «0 / 1.100»: cero ejecutado y nada cargado son dos cosas distintas.
 */
export function celdaAcumulado(a: Actividad): CeldaAcumulado {
  if (a.metodo_avance === 'cantidad') {
    if (a.cantidad_ejecutada == null) return { texto: 'sin registrar', tono: 'mudo' }
    if (a.cantidad_objetivo == null) return { texto: cifra(a.cantidad_ejecutada), tono: 'normal' }
    return { texto: `${cifra(a.cantidad_ejecutada)} / ${cifra(a.cantidad_objetivo)}`, tono: 'normal' }
  }
  if (a.avance_pct == null) return { texto: 'sin registrar', tono: 'mudo' }
  return { texto: `${pctEntero(a.avance_pct)} declarado`, tono: 'warn' }
}

/**
 * % ÍTEM: la fracción acumulada de los partes cuando existe; si no, el avance de la actividad. Sin
 * ninguna de las dos, «sin parte».
 */
export function celdaPctItem(a: Actividad, resumen: ResumenPartes | undefined): string {
  if (resumen?.fraccion_acumulada != null) return pctEntero(resumen.fraccion_acumulada * 100)
  if (a.avance_pct != null) return pctEntero(a.avance_pct)
  return 'sin parte'
}

/** La bajada de la M08: «890 de 1.100 m³» o «30% declarado» o «sin registrar». */
export function bajadaHecho(a: Actividad): string {
  if (a.metodo_avance === 'cantidad' && a.cantidad_ejecutada != null && a.cantidad_objetivo != null) {
    return `${cifra(a.cantidad_ejecutada)} de ${cifra(a.cantidad_objetivo)} ${a.unidad ?? ''}`.trim()
  }
  return celdaAcumulado(a).texto
}

/** La unidad del input: la de la actividad, o «%» cuando se declara a mano. */
export const unidadDelInput = (a: Actividad): string =>
  a.metodo_avance === 'cantidad' ? (a.unidad ?? 'un') : '%'

// ── QUIÉN VINO ─────────────────────────────────────────────────────────────────────────────────

export interface ChipGente {
  id: string
  nombre: string
  /** «9 hs», «ausente» o «sin marcar». */
  estado: 'horas' | 'ausente' | 'sin_marcar'
  horas: number | null
}

/** «R. Quiroga» — inicial del nombre y apellido, como el diseño. «Quiroga Rodolfo» → «R. Quiroga». */
export function nombreCorto(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/)
  if (partes.length < 2) return nombreCompleto.trim()
  // Los legajos vienen «APELLIDO Nombre»; el diseño escribe «N. Apellido».
  const apellido = partes[0]
  const nombre = partes[partes.length - 1]
  const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  return `${nombre.charAt(0).toUpperCase()}. ${capital(apellido)}`
}

/** Las horas de la jornada de una persona, en «9 hs» / «4,5 hs». */
export const textoHoras = (h: number) => `${h.toLocaleString('es-AR', { maximumFractionDigits: 1 })} hs`

/**
 * QUIÉN VINO: el plantel de la obra contra las horas de `registros_hh` de ese día. Sin registro es
 * «sin marcar» (aviso); ausencia o licencia es «ausente»; el resto son horas trabajadas.
 */
export function chipsDeGente(
  personas: readonly { id: string; nombre_completo: string }[],
  registros: readonly { fecha: string | null; horas: number; tipo_hora: string; persona_id: string | null }[] | undefined,
  dia: string,
): ChipGente[] {
  const horas = new Map<string, number>()
  const ausentes = new Set<string>()
  for (const r of registros ?? []) {
    if (r.fecha !== dia || !r.persona_id) continue
    if (r.tipo_hora === 'ausencia' || r.tipo_hora === 'licencia') { ausentes.add(r.persona_id); continue }
    horas.set(r.persona_id, (horas.get(r.persona_id) ?? 0) + r.horas)
  }
  return personas.map((p) => {
    const h = horas.get(p.id)
    if (h != null && h > 0) return { id: p.id, nombre: nombreCorto(p.nombre_completo), estado: 'horas', horas: h }
    if (ausentes.has(p.id)) return { id: p.id, nombre: nombreCorto(p.nombre_completo), estado: 'ausente', horas: null }
    return { id: p.id, nombre: nombreCorto(p.nombre_completo), estado: 'sin_marcar', horas: null }
  })
}

/** «12 esperados · 10 marcados · 2 sin marcar» (06) y «7 esperados · 5 marcados» (M08). */
export function resumenGente(chips: readonly ChipGente[], conSinMarcar = true): string {
  const marcados = chips.filter((c) => c.estado !== 'sin_marcar').length
  const sin = chips.length - marcados
  const base = `${chips.length} esperados · ${marcados} marcados`
  return conSinMarcar ? `${base} · ${sin} sin marcar` : base
}

// ── EQUIPOS EN LA OBRA HOY ────────────────────────────────────────────────────────────────────

export interface ActivoEnObra { id: string; nombre: string; codigo: string; clase: string }

/** «en 2 tareas» / «en 1 tarea» / «sin uso hoy». */
export function usoDelActivo(activoId: string, usadosPorTarea: ReadonlyMap<string, ReadonlySet<string>>): string {
  let n = 0
  for (const set of usadosPorTarea.values()) if (set.has(activoId)) n++
  if (n === 0) return 'sin uso hoy'
  return `en ${n} ${n === 1 ? 'tarea' : 'tareas'}`
}

// ── LO QUE VIAJA EN EL FORMULARIO ─────────────────────────────────────────────────────────────

export type DestinoNovedad = 'impedimento' | 'pedido' | 'nota'
export const DESTINOS_NOVEDAD: readonly DestinoNovedad[] = ['impedimento', 'pedido', 'nota']
export const DESTINO_LABEL: Record<DestinoNovedad, string> = {
  impedimento: 'Impedimento', pedido: 'Pedido', nota: 'Sólo nota',
}

export interface RenglonLeido {
  actividad_id: string
  /** Lo tipeado en «Hecho hoy», ya como número. */
  hecho: number
  personas: string[]
  activos: string[]
}

export interface ParteLeido {
  renglones: RenglonLeido[]
  /** Renglones cuyo «Hecho hoy» no se pudo leer como número: se dicen, no se guardan a medias. */
  ilegibles: { actividad_id: string; texto: string }[]
}

const UUID = '[0-9a-f-]{36}'
const HECHO = new RegExp(`^hecho_(${UUID})$`)
const PERSONAS = new RegExp(`^personas_(${UUID})$`)
const ACTIVOS = new RegExp(`^activos_(${UUID})$`)

/** Un renglón sin «Hecho hoy» NO es un parte, aunque tenga gente: no hay hecho que registrar. */
export function leerParteDiario(entradas: Iterable<[string, FormDataEntryValue]>): ParteLeido {
  const todas = [...entradas].filter((e): e is [string, string] => typeof e[1] === 'string')
  const lista = (re: RegExp, id: string) => {
    const fila = todas.find(([k]) => { const m = re.exec(k); return m?.[1] === id })
    return fila ? fila[1].split(',').map((s) => s.trim()).filter(Boolean) : []
  }
  const renglones: RenglonLeido[] = []
  const ilegibles: ParteLeido['ilegibles'] = []
  for (const [k, v] of todas) {
    const m = HECHO.exec(k)
    if (!m || v.trim() === '') continue
    const l = leerNumeroEsAR(v)
    if (!l.ok || l.valor == null || l.valor < 0) { ilegibles.push({ actividad_id: m[1], texto: v }); continue }
    renglones.push({ actividad_id: m[1], hecho: l.valor, personas: lista(PERSONAS, m[1]), activos: lista(ACTIVOS, m[1]) })
  }
  return { renglones, ilegibles }
}

/** Qué escribe un renglón según el método: cantidad → `cantidad`; manual → `fraccion` + `declarada`. */
export function filaDeEjecucion(metodo: string, hecho: number): {
  cantidad: number | null; avance_pct: number | null; fraccion: number | null; declarada: boolean
} {
  if (metodo === 'cantidad') return { cantidad: hecho, avance_pct: null, fraccion: null, declarada: false }
  const pct = Math.min(100, hecho)
  return { cantidad: null, avance_pct: pct, fraccion: pct / 100, declarada: true }
}
