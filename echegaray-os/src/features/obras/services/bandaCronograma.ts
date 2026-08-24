// LA CABECERA DE DOS BANDAS DEL CRONOGRAMA — el mockup `07 · Obra Cronograma.dc.html` la dibuja
// como 46px partidos en 22 + 24: arriba el PERÍODO («Agosto 2025», «Septiembre 2025») y abajo las
// divisiones de la escala elegida.
//
// ═══ POR QUÉ EL PERÍODO ES UNA BANDA Y NO UN RÓTULO MÁS ═══
//
// Con una sola banda, doce columnas rotuladas «S32 S33 S34…» no dicen en qué mes cae la obra: hay
// que abrir un calendario para saber si S34 es agosto o septiembre. El mockup pone el mes arriba y
// la división abajo justamente porque son dos preguntas distintas —«¿cuándo?» y «¿qué tan lejos?»—
// y la de arriba es la que orienta.
//
// ═══ Y POR QUÉ LOS DÍAS QUE NO SE TRABAJAN SE PINTAN ═══
//
// El mockup sombrea las columnas de fin de semana (#FAFAF8). Acá no se asume sábado y domingo: se
// pintan los días que NO están en el calendario de ESTA obra. Una obra que trabaja los sábados con
// el sábado sombreado diría que ese avance pasó un día no laborable, y el ancho de una barra es
// calendario —los días hábiles ya los resolvió el motor—, así que la sombra es lo único que
// distingue «diez días de trabajo» de «diez días corridos».

import { celdasDe, sumar, type UnidadEscala } from './escalaCronograma.ts'

export interface BandaPeriodo {
  clave: string
  etiqueta: string
  izqPct: number
  anchoPct: number
}

const aDate = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z')

/** «Agosto 2026», como el mockup. El mes y el año se pegan a mano: `toLocaleDateString` en es-AR
 *  devuelve «agosto de 2026», y ese «de» en una banda de 22px es ancho gastado en una preposición. */
function nombreDeMes(iso: string): string {
  const mes = aDate(iso).toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' })
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${iso.slice(0, 4)}`
}

const clavePeriodo = (iso: string, porAnio: boolean) => (porAnio ? iso.slice(0, 4) : iso.slice(0, 7))

/**
 * Los períodos que cruza la ventana, en % del lienzo.
 *
 * La banda de arriba es siempre UNA unidad más gruesa que las divisiones de abajo: con zoom de día
 * o de semana, meses; con zoom de mes, años. Dos bandas diciendo lo mismo son media cabecera
 * gastada en repetir.
 *
 * Los porcentajes salen del MISMO denominador que las barras (`celdasDe`): si la cabecera usara
 * otro, el mes dibujado arriba y la barra dibujada abajo estarían en escalas distintas y nadie
 * daría error.
 */
export function bandasDePeriodo(desde: string, hasta: string, unidad: UnidadEscala): BandaPeriodo[] {
  const celdas = celdasDe(desde, hasta)
  const porAnio = unidad === 'mes'
  const bandas: BandaPeriodo[] = []
  let clave = ''
  for (let d = 0; d < celdas; d++) {
    const iso = sumar(desde, d)
    const k = clavePeriodo(iso, porAnio)
    if (k !== clave) {
      clave = k
      bandas.push({
        clave: k,
        etiqueta: porAnio ? iso.slice(0, 4) : nombreDeMes(iso),
        izqPct: (d / celdas) * 100,
        anchoPct: 0,
      })
    }
    const ultima = bandas[bandas.length - 1]!
    ultima.anchoPct = ((d + 1) / celdas) * 100 - ultima.izqPct
  }
  return bandas
}

export interface FranjaNoLaborable {
  clave: string
  izqPct: number
  anchoPct: number
}

/**
 * Las franjas de días NO laborables de la obra, en % del lienzo.
 *
 * Se dibujan sólo cuando un día ocupa al menos ~1% del ancho: en una obra de dos años, sombrear
 * cada fin de semana pinta el lienzo entero de rayas y la sombra deja de significar algo. El tope
 * es `TOPE_DIAS`; por encima, la lista vuelve vacía y la cabecera no promete un detalle que a esa
 * escala no se puede leer.
 */
const TOPE_DIAS = 120

export function franjasNoLaborables(
  desde: string, hasta: string, diasHabiles: readonly number[],
): FranjaNoLaborable[] {
  const celdas = celdasDe(desde, hasta)
  if (celdas > TOPE_DIAS || diasHabiles.length === 0) return []
  const habil = new Set(diasHabiles)
  const franjas: FranjaNoLaborable[] = []
  let ultimoDia: number | null = null
  for (let d = 0; d < celdas; d++) {
    const iso = sumar(desde, d)
    // `isodow`: 1 lunes … 7 domingo, la misma numeración que `obra_canonica.dias_habiles`. Con
    // `getUTCDay()` a secas el domingo es 0 y una obra que declara trabajar los domingos —el 7
    // está en su lista— vería sus domingos sombreados igual.
    const dow = aDate(iso).getUTCDay() || 7
    if (habil.has(dow)) { ultimoDia = null; continue }
    const anterior = franjas[franjas.length - 1]
    if (anterior && ultimoDia === d - 1) anterior.anchoPct = ((d + 1) / celdas) * 100 - anterior.izqPct
    else franjas.push({ clave: iso, izqPct: (d / celdas) * 100, anchoPct: (1 / celdas) * 100 })
    ultimoDia = d
  }
  return franjas
}
