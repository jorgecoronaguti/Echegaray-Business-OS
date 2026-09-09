// QUIÉN COBRA POR DEBAJO DEL PISO DE SU CONVENIO, Y CUÁNTO CUESTA REGULARIZARLO.
//
// Pantalla 8 del handoff v2: *«un renglón en rojo no es una decisión; un número sí»*. La app ya
// pintaba en rojo al que parecía barato; nadie sabía cuánta plata era ponerlo en regla, así que
// nadie decidía. Acá el rojo trae su importe: diferencia por hora × horas esperadas de la quincena.
//
// ═══ EL PISO SALE DE UNA FILA CARGADA, NUNCA DE UNA ANALOGÍA ═══
//
// `convenio_escala` nace VACÍA a propósito (migración 20260909T1720) y este módulo respeta esa
// decisión: sin fila para (convenio, categoría, fecha) la línea dice «sin piso» y NO acusa a nadie.
// Sería fácil —y sería un invento— hacer que el que dice «UOCRA — Ley 22.250» herede la escala del
// CCT 76/75 que el OS ya tiene cargada en `uocra_escala`: son dos rótulos distintos y nadie firmó
// que sean el mismo convenio. Esa equivalencia es una afirmación laboral con plata atrás y la firma
// una persona apretando «Cargar la escala» en la pantalla, donde queda con su `fuente`.
//
// ═══ SIN PISO NO ES «CUMPLE» ═══
//
// Es la trampa de este cuadro: una tabla vacía haría que todo el plantel apareciera en regla. Por
// eso `bajoElPiso` sólo puede ser `true` con un piso real, y las líneas sin piso se CUENTAN aparte
// —`sinPiso` en el resumen— para que la pantalla escriba «6 personas sin piso» al lado del total.

/** Una fila de escala ya normalizada: el piso de una categoría de un convenio desde una fecha. */
export interface FilaEscala {
  convenio: string
  categoria: string
  /** ISO `YYYY-MM-DD`. El piso vigente es el de mayor `desde` que ya empezó. */
  desde: string
  valorHora: number
  fuente: string
}

/** El piso que rige, con su origen a la vista. Ningún importe sin origen (regla del dueño). */
export interface PisoDeConvenio {
  valorHora: number
  desde: string
  fuente: string
}

/**
 * NORMALIZAR PARA COMPARAR, NO PARA GUARDAR.
 *
 * `personas.categoria` guarda `oficial_especializado` y una escala pegada a mano dice «Oficial
 * Especializado». Son la misma categoría escrita por dos personas distintas, y compararlas con `===`
 * dejaba sin piso a todo el plantel sin decir por qué. Se normaliza sólo del lado de la comparación:
 * lo que se muestra y lo que se guarda sigue siendo el texto original.
 */
export const clave = (s: string | null | undefined): string =>
  (s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

/**
 * EL PISO VIGENTE AL DÍA `fecha`. Se elige por FECHA, no «el último cargado»: revisar una quincena
 * de marzo tiene que usar la escala de marzo, o un acuerdo de septiembre declararía en infracción
 * medio año que se pagó bien.
 */
export function pisoVigente(
  escalas: readonly FilaEscala[],
  convenio: string | null | undefined,
  categoria: string | null | undefined,
  fecha: string,
): PisoDeConvenio | null {
  const c = clave(convenio)
  const cat = clave(categoria)
  if (c === '' || cat === '') return null
  let mejor: FilaEscala | null = null
  for (const e of escalas) {
    if (clave(e.convenio) !== c || clave(e.categoria) !== cat) continue
    if (e.desde > fecha) continue
    if (!(Number(e.valorHora) > 0)) continue
    if (!mejor || e.desde > mejor.desde) mejor = e
  }
  return mejor == null
    ? null
    : { valorHora: Number(mejor.valorHora), desde: mejor.desde, fuente: mejor.fuente }
}

/** Lo que la exposición necesita saber de una persona. Nada de esto se deriva: se lee del legajo. */
export interface PersonaExpuesta {
  personaId: string
  nombre: string
  convenio: string | null
  /** El texto del legajo (`personas.categoria`), tal cual. */
  categoria: string | null
  /** $/h de bolsillo vigente (`persona_tarifa`). `null` = sin retribución cargada. */
  valorHora: number | null
  /** De dónde salió esa tarifa. */
  origenTarifa: string | null
}

export interface LineaExposicion extends PersonaExpuesta {
  piso: PisoDeConvenio | null
  /** `true` SÓLO con piso real y bolsillo por debajo. Sin piso nunca es `true` — y tampoco «cumple». */
  bajoElPiso: boolean
  /** $/h que faltan para llegar al piso. `null` cuando no se puede comparar. */
  diferenciaHora: number | null
  /** Brecha contra el piso en %. Negativa = por debajo. `null` = no medible. */
  brechaPct: number | null
  /** Lo que cuesta ponerlo en regla esta quincena: diferencia × horas esperadas. */
  regularizar: number | null
  /** Por qué no se pudo comparar. `null` = se comparó. R1: NULL nunca es cero. */
  porQueNoSeCompara: string | null
}

const redondear2 = (n: number): number => Math.round(n * 100) / 100

/**
 * UNA PERSONA CONTRA SU PISO.
 *
 * `horasEsperadas` es el denominador del costo de regularizar y viene de
 * `horasEsperadasDeQuincena` — 9 h de lunes a jueves, 8 los viernes—, no de las horas trabajadas:
 * lo que se está cotizando es «cuánto sale pagarle bien la quincena entera», no lo que ya se pagó.
 */
export function exponerAlPiso(
  p: PersonaExpuesta, escalas: readonly FilaEscala[], fecha: string, horasEsperadas: number,
): LineaExposicion {
  const piso = pisoVigente(escalas, p.convenio, p.categoria, fecha)
  const base = { ...p, piso, bajoElPiso: false, diferenciaHora: null, brechaPct: null, regularizar: null }
  if (!p.convenio?.trim()) return { ...base, porQueNoSeCompara: 'sin convenio en el legajo' }
  if (!p.categoria?.trim()) return { ...base, porQueNoSeCompara: 'sin categoría en el legajo' }
  if (piso == null) return { ...base, porQueNoSeCompara: `sin piso: la escala de ${p.convenio} no está cargada` }
  if (p.valorHora == null) return { ...base, porQueNoSeCompara: 'sin retribución cargada' }

  const diferenciaHora = redondear2(piso.valorHora - p.valorHora)
  const bajoElPiso = diferenciaHora > 0
  return {
    ...base,
    bajoElPiso,
    diferenciaHora,
    brechaPct: redondear2(((p.valorHora - piso.valorHora) / piso.valorHora) * 100),
    // SÓLO SE COTIZA LO QUE FALTA. Al que cobra por encima del piso no se le "devuelve" la
    // diferencia: un negativo acá restaría del total y abarataría el costo de regularizar al resto.
    regularizar: bajoElPiso ? redondear2(diferenciaHora * horasEsperadas) : 0,
    porQueNoSeCompara: null,
  }
}

export interface ResumenExposicion {
  /** Cuántas personas se pudieron comparar contra un piso real. */
  comparadas: number
  bajoElPiso: number
  /** Personas sin piso cargado: el número que la pantalla escribe al lado del total. */
  sinPiso: number
  /** Los convenios que no tienen escala, para nombrarlos sin repetir. */
  conveniosSinEscala: string[]
  /** Lo que cuesta poner en regla a TODOS los que están bajo el piso, esta quincena. */
  regularizarTotal: number
}

/**
 * EL TOTAL DEL CUADRO. Las líneas que no se pudieron comparar no suman cero: se cuentan.
 *
 * Un total de $ 0 con seis personas sin escala se lee «no debemos nada», que es exactamente lo
 * contrario de lo que se sabe. Por eso `sinPiso` y `conveniosSinEscala` viajan al lado del importe.
 */
export function resumenDeExposicion(lineas: readonly LineaExposicion[]): ResumenExposicion {
  const conveniosSinEscala = new Set<string>()
  let comparadas = 0, bajoElPiso = 0, sinPiso = 0, regularizarTotal = 0
  for (const l of lineas) {
    if (l.piso == null) {
      sinPiso++
      if (l.convenio?.trim()) conveniosSinEscala.add(l.convenio.trim())
      continue
    }
    if (l.porQueNoSeCompara != null) continue
    comparadas++
    if (l.bajoElPiso) bajoElPiso++
    regularizarTotal += l.regularizar ?? 0
  }
  return {
    comparadas, bajoElPiso, sinPiso,
    conveniosSinEscala: [...conveniosSinEscala].sort(),
    regularizarTotal: redondear2(regularizarTotal),
  }
}
