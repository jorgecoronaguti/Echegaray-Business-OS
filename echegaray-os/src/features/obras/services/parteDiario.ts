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
  for (const campo of campos) {
    const v = datos.get(campo)
    if (typeof v === 'string' && v.includes(',')) datos.set(campo, v.replace(',', '.'))
  }
  return datos
}

/** Lo que falta de una actividad, al borde derecho de cada opción del desplegable (canónico 05). */
export function textoPendiente(a: Actividad): string {
  const p = pendienteDe(a)
  return p ? `${dec2(p.cantidad)} ${p.unidad}`.trim() : 'sin medición'
}
