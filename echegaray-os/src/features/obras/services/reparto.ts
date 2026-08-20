// REPARTIR UN TOTAL DE HH ENTRE VARIAS ACTIVIDADES. Sin React y sin Supabase, como `cronograma.ts`.
//
// ═══ POR QUÉ ESTO NO VIVE DENTRO DE LA SERVER ACTION ═══
//
// Es la única parte de las acciones masivas que puede estar mal SIN QUE SE VEA: la acción va a
// contestar «cargué 12 actividades» igual si repartió bien que si repartió mal. Un reparto que suma
// 998 donde el administrador escribió 1.000 no rompe nada, no tira un error, y desde ese momento el
// desvío de HH de la obra arrastra dos horas que nadie puso. Acá se puede probar sin navegador.
//
// ═══ TRES REGLAS QUE NO SE NEGOCIAN ═══
//
// 1. LA SUMA REPARTIDA ES EXACTAMENTE EL TOTAL. Redondear cada parte por su cuenta pierde o inventa
//    centésimos; se reparte por resto mayor para que el error de redondeo sea cero por construcción.
// 2. NUNCA SE ESCRIBE 0. Cero horas es una afirmación —«esta actividad no lleva mano de obra»— y no
//    es lo mismo que «todavía no sé cuántas lleva». Si el total no alcanza para que a todas les
//    toque algo, el reparto se RECHAZA entero en vez de sembrar ceros.
// 3. LA QUE NO ENTRA SE DECLARA, no se descarta en silencio. Cada actividad que queda afuera sale
//    con su motivo escrito, y la pantalla lo muestra.

/** Lo mínimo que hace falta para repartir. No pide una `Actividad` entera: así se puede probar. */
export interface ConVentana {
  id: string
  inicio_plan: string | null
  fin_plan: string | null
}

export interface Reparto {
  /** Lo que se va a escribir. Ninguna entrada lleva 0 — ver regla 2. */
  asignaciones: { id: string; hh: number }[]
  /** Las que no entraron, con el motivo. Viaja hasta la pantalla. */
  fuera: { id: string; motivo: string }[]
  /** Con qué criterio se repartió lo que se repartió. La pantalla lo dice: no se adivina. */
  criterio: 'proporcional' | 'iguales'
  /** `null` si se pudo repartir. Con texto, NO se escribe nada. */
  error: string | null
}

const DIA = 86400000

/**
 * CUÁNTOS DÍAS DURA UNA ACTIVIDAD, contando los dos extremos: del lunes al lunes es un día de
 * trabajo, no cero. Sin las dos fechas no hay duración —y no se inventa 1—, y una ventana invertida
 * es un dato roto que no puede pesar en un reparto.
 */
export function diasDe(a: ConVentana): number | null {
  if (!a.inicio_plan || !a.fin_plan) return null
  const d = (Date.parse(a.fin_plan + 'T00:00:00Z') - Date.parse(a.inicio_plan + 'T00:00:00Z')) / DIA + 1
  if (!Number.isFinite(d) || d <= 0) return null
  return d
}

/**
 * REPARTO POR RESTO MAYOR sobre centésimos de hora.
 *
 * Se trabaja en enteros —centésimos— y no en punto flotante: `0.1 + 0.2` no da `0.3`, y sumar 344
 * partes en coma flotante deja una diferencia contra el total que después nadie sabe de dónde salió.
 * Los centésimos que sobran del piso se le dan a los restos más grandes, y en un empate gana el que
 * venga primero: el resultado es el mismo cada vez que se corre, que es lo que hace posible probarlo.
 */
function porRestoMayor(pesos: number[], totalCentesimos: number): number[] {
  const suma = pesos.reduce((s, p) => s + p, 0)
  const exactos = pesos.map((p) => (totalCentesimos * p) / suma)
  const piso = exactos.map((x) => Math.floor(x))
  let sobran = totalCentesimos - piso.reduce((s, x) => s + x, 0)
  const orden = exactos
    .map((x, i) => ({ i, resto: x - Math.floor(x) }))
    .sort((a, b) => (b.resto - a.resto) || (a.i - b.i))
  for (let k = 0; sobran > 0; k++, sobran--) piso[orden[k % orden.length].i]++
  return piso
}

/**
 * REPARTIR `totalHH` ENTRE LAS ACTIVIDADES SELECCIONADAS.
 *
 * `proporcional` pesa por días de plan: una actividad de diez días se lleva el doble que una de
 * cinco. Las que no tienen las dos fechas NO tienen contra qué pesar, y quedan afuera declaradas —
 * meterlas con peso 1 sería inventarles una duración de un día.
 *
 * `iguales` reparte en partes iguales entre TODAS las seleccionadas, tengan fechas o no. Es el modo
 * que sirve cuando el cronograma todavía no tiene fechas cargadas, que es exactamente el estado de
 * una obra que se está poniendo en marcha.
 *
 * Si el modo es `proporcional` y NINGUNA seleccionada tiene fechas, no hay peso posible: se devuelve
 * el error en vez de caer callado a partes iguales. Cambiar de criterio sin decirlo es la manera de
 * que el administrador crea que repartió por duración cuando repartió por cabeza.
 */
export function repartirHH(
  actividades: readonly ConVentana[],
  totalHH: number,
  criterio: 'proporcional' | 'iguales',
): Reparto {
  const vacio = (error: string): Reparto => ({ asignaciones: [], fuera: [], criterio, error })

  if (!Number.isFinite(totalHH) || totalHH <= 0) return vacio('El total de HH tiene que ser mayor que cero.')
  if (actividades.length === 0) return vacio('No hay ninguna actividad seleccionada.')

  const fuera: { id: string; motivo: string }[] = []
  let entran: ConVentana[]
  let pesos: number[]

  if (criterio === 'proporcional') {
    entran = []
    pesos = []
    for (const a of actividades) {
      const d = diasDe(a)
      if (d === null) fuera.push({ id: a.id, motivo: 'sin inicio y fin de plan: no tiene duración contra la cual repartir' })
      else { entran.push(a); pesos.push(d) }
    }
    if (entran.length === 0) {
      return vacio('Ninguna de las seleccionadas tiene inicio y fin de plan: no hay duración contra la cual repartir. Cargá las fechas, o repartí en partes iguales.')
    }
  } else {
    entran = [...actividades]
    pesos = entran.map(() => 1)
  }

  const centesimos = porRestoMayor(pesos, Math.round(totalHH * 100))
  // REGLA 2. Un cero acá no sería «le tocó poco»: quedaría escrito en la base como «esta actividad
  // no lleva horas», que es un dato que nadie cargó. Antes que sembrarlo, no se escribe nada.
  const enCero = centesimos.filter((c) => c === 0).length
  if (enCero > 0) {
    return vacio(
      `${totalHH} HH no alcanzan para ${entran.length} actividades: a ${enCero} le${enCero === 1 ? '' : 's'} tocaría 0, y 0 horas no es «sin dato».`,
    )
  }

  return {
    asignaciones: entran.map((a, i) => ({ id: a.id, hh: centesimos[i] / 100 })),
    fuera,
    criterio,
    error: null,
  }
}
