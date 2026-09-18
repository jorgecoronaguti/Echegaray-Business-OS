// LA ESCALA UOCRA VIGENTE, LA QUE SE MUESTRA AL LADO DE «MÁS» (dueño, 16/09/2026: «quiero ver al lado del "más"
// siempre la última escala salarial del CCT de UOCRA que nos corresponde, actualizada»).
//
// Lo puro: de las filas de `uocra_escala` (zona A, CCT 76/75), cuál rige HOY —la vigencia más nueva que no sea
// futura— y cómo se lee en una línea. San Juan es Zona A (verificado 16/09/2026 contra el Anexo I de UOCRA).
// La lectura vive en `escalaUocraService.ts`; acá no hay Supabase.

export interface FilaUocra {
  categoria: string | null
  basico_hora: number | string | null
  mensual: number | string | null
  vigencia_desde: string | null
  cct?: string | null
  fuente?: string | null
  cargado_en?: string | null
}

export interface ValorDeEscala {
  categoria: string
  /** «Ayud.», «Medio of.», «Of.», «Of. Esp.», «Sereno»: el nombre de la categoría abreviado, nunca un símbolo. */
  corto: string
  /** $/h, o $/mes para el sereno. */
  valor: number
  porMes: boolean
}

export interface EscalaVigente {
  /** ISO de la vigencia que rige. */
  desde: string
  /** «ago 2026». */
  rige: string
  cct: string
  zona: 'A'
  valores: ValorDeEscala[]
  fuente: string | null
  /** Cuándo entró a la base la fila más nueva de esa vigencia. */
  cargadoEn: string | null
}

/**
 * El orden y el rótulo corto de cada categoría. Lo que no está acá no se dibuja en la tira.
 *
 * ═══ «½ Of.» NO ES LA CATEGORÍA (dueño, 17/09/2026: «falta la categoría medio oficial») ═══
 *
 * El dato estaba —`uocra_escala` trae Medio Oficial $5.866 desde el 01/08/2026— pero el rótulo era un símbolo de
 * fracción, no un nombre: el dueño leyó la tira y no encontró su categoría. Un rótulo que hay que descifrar equivale
 * a un dato ausente. Todos los cortos son ahora el NOMBRE abreviado, igual que en el resto de la pantalla
 * (`CATEGORIA_LABEL`, «Medio oficial»); ninguno es un símbolo.
 */
const CATEGORIAS: readonly { clave: string; corto: string; porMes: boolean }[] = [
  { clave: 'ayudante', corto: 'Ayud.', porMes: false },
  { clave: 'medio oficial', corto: 'Medio of.', porMes: false },
  { clave: 'oficial', corto: 'Of.', porMes: false },
  { clave: 'oficial especializado', corto: 'Of. Esp.', porMes: false },
  { clave: 'sereno', corto: 'Sereno', porMes: true },
]

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const normal = (s: string | null | undefined): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s*\(.*\)\s*$/, '').trim()

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** «ago 2026» de una vigencia ISO. */
export function mesDeVigencia(iso: string): string {
  const [a, m] = iso.slice(0, 10).split('-')
  const i = Number(m) - 1
  return MESES[i] ? `${MESES[i]} ${a}` : iso.slice(0, 10)
}

/**
 * La vigencia que rige `hoy`: la más nueva con `vigencia_desde <= hoy`. Un acuerdo futuro cargado de antemano no
 * se muestra hasta que llegue su mes; sin filas, `null` (la tira lo dice, no inventa).
 */
export function escalaVigente(filas: readonly FilaUocra[], hoy: string): EscalaVigente | null {
  const vigentes = filas.filter((f) => f.vigencia_desde && f.vigencia_desde.slice(0, 10) <= hoy.slice(0, 10))
  if (vigentes.length === 0) return null
  const desde = vigentes.map((f) => f.vigencia_desde!.slice(0, 10)).sort().at(-1)!
  const delMes = vigentes.filter((f) => f.vigencia_desde!.slice(0, 10) === desde)
  const valores: ValorDeEscala[] = []
  for (const c of CATEGORIAS) {
    const f = delMes.find((x) => normal(x.categoria) === c.clave)
    const valor = f ? (c.porMes ? num(f.mensual) ?? num(f.basico_hora) : num(f.basico_hora)) : null
    if (f && valor != null) valores.push({ categoria: String(f.categoria), corto: c.corto, valor, porMes: c.porMes })
  }
  if (valores.length === 0) return null
  const cargado = delMes.map((f) => f.cargado_en ?? '').filter(Boolean).sort().at(-1) ?? null
  return {
    desde, rige: mesDeVigencia(desde), cct: String(delMes[0].cct ?? '76/75'), zona: 'A', valores,
    fuente: delMes.find((f) => f.fuente)?.fuente ?? null, cargadoEn: cargado,
  }
}
