// EL COSTO REAL DE UNA HORA — R9 del handoff v2, sin base y sin red.
//
// El $/h que cobra la persona NO es lo que la hora le cuesta a la obra. Encima van cargas
// sociales, ART, fondo de cese UOCRA, seguro de vida y sepelio, y el no-trabajado-pago (lluvia,
// feriados). Handoff §5: bolsillo 3.650 → costo 5.564, multiplicador 1,524. Todo presupuesto que
// use el $/h de bolsillo subestima la mano de obra un 52 %.
//
// ═══ POR QUÉ ESTE MÓDULO ES PURO ═══
//
// Porque el multiplicador multiplica los sueldos de diecisiete personas y después se carga a una
// obra. Un error acá no se ve: da un número plausible. Un módulo que necesita Supabase para
// probarse no se prueba, y un control que no se puede poner en rojo no es un control.
//
// ═══ LA VERSIÓN VIGENTE NO ES «LA ÚLTIMA FILA» ═══
//
// Es la de mayor `desde` que ya empezó A LA FECHA QUE SE PREGUNTA. Cargar hoy la ART que rige
// desde el 01/10 no puede cambiar el costo de la quincena de septiembre: la obra vieja conserva
// su alícuota, y por eso la tabla se versiona en vez de actualizarse.
//
// ═══ NULL NUNCA ES CERO (R1) ═══
//
// Sin alícuotas cargadas el multiplicador es `null`, no 1. Un 1 diría «la hora cuesta lo que
// cobra», que es una afirmación falsa dicha con la misma cara con la que se dice una verdadera.
// Y `null` × horas es `null`: el costo no se publica, se dice qué falta cargar.

/** Los cinco conceptos del CHECK de `public.costo_hora_alicuota`. */
export const CONCEPTOS_COSTO = [
  'cargas_sociales', 'art', 'fondo_cese', 'seguro_vida_sepelio', 'no_trabajado_pago',
] as const

export type ConceptoCosto = (typeof CONCEPTOS_COSTO)[number]

export const ROTULO_CONCEPTO: Record<ConceptoCosto, string> = {
  cargas_sociales: 'Cargas sociales',
  art: 'ART',
  fondo_cese: 'Fondo de cese UOCRA',
  seguro_vida_sepelio: 'Seguro de vida y sepelio',
  no_trabajado_pago: 'No trabajado pago',
}

/**
 * Sobre qué pesa el concepto. `declarado` = sólo sobre la mitad que va por recibo; `total` = sobre
 * todo lo pagado. Sin esta distinción el sistema tendría que elegir por su cuenta y elegiría mal
 * la mitad de las veces (§5 del handoff: el multiplicador efectivo baja de 1,524 a 1,262).
 */
export type BaseAlicuota = 'declarado' | 'total'

export interface Alicuota {
  concepto: ConceptoCosto
  /** ISO `YYYY-MM-DD`. La fila rige desde ese día inclusive. */
  desde: string
  /** 0 a 100, como lo guarda la base. */
  porcentaje: number
  base: BaseAlicuota
  fuente: string
}

/** Un concepto vigente, con el aporte que hace al multiplicador a la proporción declarada dada. */
export interface AporteDeConcepto {
  concepto: ConceptoCosto
  porcentaje: number
  base: BaseAlicuota
  desde: string
  fuente: string
  /** Cuánto suma al multiplicador: `porcentaje/100 × peso`. */
  aporte: number
}

export interface Multiplicador {
  /** `null` cuando no hay UNA sola alícuota vigente. Nunca 1. */
  valor: number | null
  aportes: AporteDeConcepto[]
  /** Los conceptos sin fila vigente a esa fecha. Se nombran en pantalla, no se asumen en 0. */
  faltan: ConceptoCosto[]
  /** La proporción del pago que genera cargas: 1 = todo por recibo. */
  proporcionDeclarada: number
}

const esISO = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * LA VERSIÓN VIGENTE DE CADA CONCEPTO A UNA FECHA.
 *
 * Empate imposible por el UNIQUE `(concepto, desde)` de la base, pero el orden se declara igual:
 * si alguna vez la fuente deja de ser esa tabla, «cualquiera de las dos» sería una respuesta que
 * cambia entre corridas.
 */
export function alicuotasVigentes(
  filas: readonly Alicuota[], fecha: string,
): Partial<Record<ConceptoCosto, Alicuota>> {
  const vig: Partial<Record<ConceptoCosto, Alicuota>> = {}
  if (!esISO(fecha)) return vig
  for (const f of filas) {
    if (!esISO(f.desde) || f.desde > fecha) continue
    const ya = vig[f.concepto]
    if (!ya || f.desde > ya.desde) vig[f.concepto] = f
  }
  return vig
}

/**
 * EL MULTIPLICADOR: cuántas veces el bolsillo cuesta la hora.
 *
 *   multiplicador = 1 + Σ (porcentaje/100 × peso)      peso = 1 si base=total
 *                                                      peso = proporciónDeclarada si base=declarado
 *
 * Con los cinco conceptos del handoff al 100 % declarado da 1,524 (26,4+7,2+8+1+9,8 = 52,4 %).
 * Con el arreglo mitad recibo / mitad efectivo y los cinco marcados `declarado`, da 1,262 — que es
 * exactamente el número que §5 llama «el multiplicador efectivo». Si en cambio el
 * no-trabajado-pago se carga como `total` (pesa sobre todo lo pagado, no sólo sobre lo blanco), la
 * misma mitad da 1,311: por eso `base` se guarda por fila y no se deduce acá.
 *
 * `proporcionDeclarada` entra acotada a [0,1] en vez de confiar en el llamador: fuera de ese rango
 * el resultado sería un costo silenciosamente inflado o descontado.
 */
export function multiplicadorDeCosto(
  vigentes: Partial<Record<ConceptoCosto, Alicuota>>,
  proporcionDeclarada = 1,
): Multiplicador {
  const p = Number.isFinite(proporcionDeclarada)
    ? Math.min(1, Math.max(0, proporcionDeclarada))
    : 1
  const aportes: AporteDeConcepto[] = []
  const faltan: ConceptoCosto[] = []
  for (const c of CONCEPTOS_COSTO) {
    const a = vigentes[c]
    if (!a) { faltan.push(c); continue }
    const peso = a.base === 'total' ? 1 : p
    aportes.push({
      concepto: c, porcentaje: a.porcentaje, base: a.base, desde: a.desde, fuente: a.fuente,
      aporte: (a.porcentaje / 100) * peso,
    })
  }
  // SIN UNA SOLA ALÍCUOTA NO HAY MULTIPLICADOR. Devolver 1 sería publicar «la hora cuesta lo que
  // cobra» como un hecho calculado.
  const valor = aportes.length === 0
    ? null
    : 1 + aportes.reduce((s, a) => s + a.aporte, 0)
  return { valor, aportes, faltan, proporcionDeclarada: p }
}

/** El costo de una hora. `null` si falta cualquiera de los dos: nunca un cero. */
export function costoDeHora(bolsillo: number | null, mult: number | null): number | null {
  if (bolsillo == null || mult == null) return null
  if (!Number.isFinite(bolsillo) || !Number.isFinite(mult)) return null
  return bolsillo * mult
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PANTALLA 5 · LA ESCALERA BOLSILLO → COSTO, POR CATEGORÍA
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Una persona del plantel con lo único que la escalera necesita saber de ella. */
export interface PersonaDeEscalera {
  personaId: string
  categoria: string | null
  valorHora: number | null
}

export interface FilaDeCategoria {
  categoria: string
  /** `null` = la persona no tiene categoría cargada. La fila existe igual: son horas que se pagan. */
  sinCategoria: boolean
  gente: number
  /**
   * El $/h de la categoría, SÓLO cuando las personas que la integran comparten uno.
   *
   * Con dos valores distintos queda `null` y `valores` dice cuántos son. Un promedio inventaría un
   * bolsillo que nadie cobra, y la columna «costo real» lo multiplicaría por 1,5 antes de mandarlo
   * a una obra: el error entra al presupuesto amplificado.
   */
  bolsillo: number | null
  /** Los $/h distintos observados en la categoría, ordenados. Vacío = nadie tiene tarifa. */
  valores: number[]
  costoReal: number | null
}

/**
 * LA ESCALERA DEL MOCKUP (§5): una fila por categoría, bolsillo → costo real.
 *
 * ═══ POR QUÉ NO SE PROMEDIA ═══
 *
 * El mockup dibuja UN bolsillo por categoría porque en el ejemplo del dueño todos los ayudantes
 * cobran lo mismo. En la base eso no está garantizado. Promediar publicaría un $/h que nadie cobra;
 * elegir el primero escondería a los demás. La fila dice cuántos valores distintos hay y no publica
 * costo hasta que alguien los unifique — que es el trabajo real que destraba la columna.
 */
export function escaleraDeCategorias(
  personas: readonly PersonaDeEscalera[], mult: number | null,
): FilaDeCategoria[] {
  const grupos = new Map<string, { rotulo: string; sinCategoria: boolean; gente: number; valores: Set<number> }>()
  for (const p of personas) {
    const rotulo = (p.categoria ?? '').trim()
    const clave = rotulo === '' ? '\u0000sin' : rotulo.toLocaleLowerCase('es')
    const g = grupos.get(clave)
      ?? { rotulo: rotulo === '' ? 'sin categoría cargada' : rotulo, sinCategoria: rotulo === '', gente: 0, valores: new Set<number>() }
    g.gente += 1
    if (p.valorHora != null && Number.isFinite(p.valorHora)) g.valores.add(p.valorHora)
    grupos.set(clave, g)
  }
  return [...grupos.values()]
    .map((g) => {
      const valores = [...g.valores].sort((a, b) => b - a)
      const bolsillo = valores.length === 1 ? valores[0] : null
      return {
        categoria: g.rotulo,
        sinCategoria: g.sinCategoria,
        gente: g.gente,
        bolsillo,
        valores,
        costoReal: costoDeHora(bolsillo, mult),
      }
    })
    // DE MAYOR A MENOR BOLSILLO, como el mockup: oficial especializado arriba, ayudante abajo. Las
    // que no tienen un $/h publicable van al final, donde se leen como pendientes y no como piso.
    .sort((a, b) => (b.bolsillo ?? -1) - (a.bolsillo ?? -1))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PANTALLA 6 · LA QUINCENA CARGADA A LA OBRA
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Horas de una obra en la ventana, ya agrupadas. `bolsillo` = Σ horas × $/h de cada persona. */
export interface HorasDeObra {
  obraId: string | null
  rotulo: string
  horas: number
  /** Cuántas personas distintas cargaron horas a esa obra. Columna «Gente» del mockup (pantalla 6). */
  gente: number
  /** `null` si alguna de las personas que trabajó ahí no tiene tarifa: el total sería incompleto. */
  bolsillo: number | null
  /** Cuántas personas de esa obra no tienen $/h cargado. */
  sinTarifa: number
}

export interface LineaDeObra extends HorasDeObra {
  costoReal: number | null
  /** Mano de obra presupuestada (`obra_egreso_proyectado`, tipo mano_de_obra). `null` = sin base. */
  presupuesto: number | null
  /** Porcentaje del presupuesto que consume esta quincena. `null` cuando no hay base. */
  consumo: number | null
}

/**
 * LO QUE LA QUINCENA LE CUESTA A CADA OBRA.
 *
 * El consumo % SÓLO existe cuando hay mano de obra presupuestada. Sin base, «sin base»: un 0 %
 * diría que la obra no consumió nada de su presupuesto, cuando lo que pasa es que nadie cargó el
 * presupuesto. Es la diferencia entre una obra sana y una obra sin control.
 */
export function lineasDeObra(
  horas: readonly HorasDeObra[],
  presupuestoPorObra: ReadonlyMap<string, number>,
  mult: number | null,
): LineaDeObra[] {
  return horas.map((h) => {
    const costoReal = costoDeHora(h.bolsillo, mult)
    const presupuesto = h.obraId == null ? null : presupuestoPorObra.get(h.obraId) ?? null
    const consumo = costoReal == null || presupuesto == null || presupuesto <= 0
      ? null
      : (costoReal / presupuesto) * 100
    return { ...h, costoReal, presupuesto, consumo }
  })
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PANTALLA 9 · CAJA DE NÓMINA
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Una persona activa con su $/h vigente, para proyectar la quincena que todavía no pasó. */
export interface PersonaProyectable {
  personaId: string
  nombre: string
  valorHora: number | null
}

export interface Proyeccion {
  /** Horas esperadas de la ventana (9 h de lunes a jueves, 8 el viernes). */
  horasEsperadas: number
  /** Σ horasEsperadas × $/h de cada persona CON tarifa. */
  bolsillo: number
  /** Cuántas personas activas no tienen $/h: el número proyectado les falta. */
  sinTarifa: number
  costoReal: number | null
}

/**
 * LA PRÓXIMA QUINCENA, PROYECTADA.
 *
 * Las personas sin tarifa NO se proyectan en cero y se cuentan aparte: un total que parece
 * completo y le falta gente es peor que un total que dice cuánta gente le falta. La proyección es
 * un PISO —es lo que se sabe hoy—, y así se rotula en pantalla.
 */
export function proyectarQuincena(
  personas: readonly PersonaProyectable[], horasEsperadas: number, mult: number | null,
): Proyeccion {
  let bolsillo = 0
  let sinTarifa = 0
  for (const p of personas) {
    if (p.valorHora == null || !Number.isFinite(p.valorHora)) { sinTarifa++; continue }
    bolsillo += p.valorHora * horasEsperadas
  }
  return { horasEsperadas, bolsillo, sinTarifa, costoReal: costoDeHora(bolsillo, mult) }
}
