// EL TRABAJO ASÍNCRONO DE LECTURA DEL PLANO — el contrato de `/api/presupuestos/cotizar`.
//
// «Presupuestos v5 · Lectura del plano»: el cómputo no es una lista que xsas escupe de una — es la
// consecuencia de leer el plano en un orden, y el backend PUBLICA cada paso a medida que lo mide
// (encolar en <3 s, nunca esperar). Esto es SOLO la forma del dato y las cuentas que hacen falta
// para dibujarlo: nada de red, nada de fetch — eso vive en `trabajoCotizarApi.ts`.
//
// Los nombres de campo y los cinco estados de un paso salen de `orquestador/lib/plano/pasos-vista.mjs`
// (el módulo que arma la respuesta): `filas[].n` ya llega FORMATEADO en español ('1.284', no 1284) —
// se dibuja tal cual, nunca se reformatea. Lo que SÍ llega crudo son los números de plata: el importe
// que deriva un paso (`deriva.importe`), los ítems del cómputo y la cascada — eso se formatea acá,
// igual que lo hacía el propio mockup en su `renderVals()`.
//
// LA REGLA QUE GOBIERNA TODO EL MÓDULO: null nunca es cero. Un importe sin precio es 'sin cotizar',
// nunca '$0' — mezclarlos haría que un ítem sin cotizar bajara el total en vez de faltarle.

export type EstadoTrabajo = 'ENCOLADO' | 'LEYENDO' | 'LISTO' | 'ERROR'

export type EstadoPaso = 'firme' | 'con supuesto' | 'sin dato' | 'conflicto' | 'revisar'

export interface FilaPaso {
  k: string
  d: string
  sub?: string | null
  /** Ya formateado en es-AR por el backend ('1.284'), o `null` si el plano no lo dice. */
  n: string | null
  u?: string | null
  v?: string | null
  falta?: boolean
  disputa?: boolean
}

export interface ColumnasPaso { a: string; b: string; c: string; d: string }

export interface DerivaPaso {
  partidas: number
  /** Suma cruda de los importes con precio. `null` cuando ninguna partida tiene precio. */
  importe: number | null
  sinCotizar: number
}

export interface PasoTrabajo {
  id: string
  etiqueta: string
  titulo: string
  pregunta: string
  estado: EstadoPaso
  resumen: string
  columnas: ColumnasPaso
  filas: FilaPaso[]
  evidencia: string | null
  supuesto: string | null
  faltan: string[]
  deriva: DerivaPaso
}

export interface CertezaTrabajo {
  estado: EstadoPaso | null
  porEstado: Partial<Record<EstadoPaso, number>>
  firmes: number
  total: number
}

export interface ItemComputo {
  d: string
  /** Cantidad cruda. `null` = el plano no la dice. */
  c: number | null
  u: string
  /** Precio unitario crudo. `null` = sin cotizar. */
  p: number | null
  /** Importe crudo (`c * p`, o lo que mande el backend). `null` = sin cotizar. */
  imp: number | null
  nota?: string | null
}

export interface GrupoComputo {
  pasoId: string
  rotulo: string
  titulo: string
  subtotal: number | null
  items: ItemComputo[]
}

export interface Computo { grupos: GrupoComputo[] }

export interface Cascada {
  costoDirecto: number
  indirectos: number
  riesgo: number
  financiero: number
  beneficio: number
  venta: number
  coeficiente: number | null
}

export interface TrabajoLectura {
  id: string
  estado: EstadoTrabajo
  etapa: string | null
  pasos: PasoTrabajo[]
  certeza: CertezaTrabajo | null
  computo: Computo | null
  cascada: Cascada | null
  presupuesto_id: string | null
  error: string | null
}

// ── FORMATO — los mismos tres formateadores del mockup (N/P/M), en criollo ─────────────────────

/** Un entero o decimal en es-AR. `null` in ⇒ `null` out: nunca se inventa un cero. */
export function formatoNumero(n: number | null, decimales = 0): string | null {
  if (n === null || !Number.isFinite(n)) return null
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

/** `$1.234.567`. */
export function formatoPesos(n: number | null): string | null {
  if (n === null || !Number.isFinite(n)) return null
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

/** `$1,2M`. */
export function formatoMillones(n: number | null): string | null {
  if (n === null || !Number.isFinite(n)) return null
  return `$${(n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`
}

/** Una cantidad del cómputo: entera se ve entera, con fracción se ve a dos decimales. El backend
 *  no manda cuántos decimales corresponden por ítem — inventar una regla por unidad sería fabricar
 *  precisión que nadie declaró; ésta es la única que no depende de adivinar la unidad. */
export function formatoCantidad(n: number | null): string | null {
  if (n === null || !Number.isFinite(n)) return null
  return formatoNumero(n, Number.isInteger(n) ? 0 : 2)
}

// ── EL COLOR DE UN ESTADO — la MISMA regla que `chipDe()` en el mockup ─────────────────────────
// firme → verde · conflicto → rojo · con supuesto → ámbar · sin dato / revisar → gris apagado.

export const COLOR_ESTADO: Record<EstadoPaso, string> = {
  firme: '#067647',
  conflicto: '#B42318',
  'con supuesto': '#B54708',
  'sin dato': '#6B6B67',
  revisar: '#6B6B67',
}

// ── EL PIE DE UN PASO — «→ 3 partidas · $1,2M» ──────────────────────────────────────────────────

export function pieDePaso(p: PasoTrabajo): string {
  if (p.deriva.partidas === 0) return 'no genera partida'
  const partidas = p.deriva.partidas === 1 ? '1 partida' : `${p.deriva.partidas} partidas`
  const importe = p.deriva.importe === null ? 'sin importe' : formatoMillones(p.deriva.importe)
  return `→ ${partidas} · ${importe}`
}

// ── LA CERTEZA EN PLATA — derivada del cómputo + el estado real de cada paso ────────────────────
//
// El backend manda la certeza por PASOS (`certeza.porEstado`, cuántos pasos son firmes) y el
// cómputo por ÍTEMS (`computo.grupos[].items`). Cruzarlos por `pasoId` es lo único que permite
// mostrar plata: un ítem que vive en un paso `conflicto` está EN DISPUTA, no es firme aunque tenga
// precio — la disputa es del paso entero (la vigueta de arriostramiento no es dudosa por su
// hormigón, es dudosa porque no se sabe si va).

export interface CertezaMonetaria {
  firme: number | null
  disputa: number | null
  sinCotizar: number
  pctFirme: number
  pctDisputa: number
}

export function certezaMonetaria(pasos: PasoTrabajo[], computo: Computo | null): CertezaMonetaria {
  const vacio: CertezaMonetaria = { firme: null, disputa: null, sinCotizar: 0, pctFirme: 0, pctDisputa: 0 }
  if (!computo || !computo.grupos.length) return vacio
  const estadoDe = new Map(pasos.map((p) => [p.id, p.estado]))
  let firme = 0
  let disputa = 0
  let sinCotizar = 0
  let huboFirme = false
  let huboDisputa = false
  for (const g of computo.grupos) {
    const estado = estadoDe.get(g.pasoId)
    for (const it of g.items) {
      if (it.imp === null) { sinCotizar += 1; continue }
      if (estado === 'conflicto') { disputa += it.imp; huboDisputa = true } else { firme += it.imp; huboFirme = true }
    }
  }
  const total = firme + disputa
  return {
    firme: huboFirme ? firme : (huboDisputa ? 0 : null),
    disputa: huboDisputa ? disputa : null,
    sinCotizar,
    pctFirme: total ? Math.round((firme / total) * 100) : 0,
    pctDisputa: total ? Math.round((disputa / total) * 100) : 0,
  }
}

// ── FILTRAR EL CÓMPUTO POR UN PASO — clic en el pie de un paso, clic de nuevo lo quita ──────────

export function filtrarComputo(computo: Computo | null, pasoId: string | null): GrupoComputo[] {
  if (!computo) return []
  if (!pasoId) return computo.grupos
  return computo.grupos.filter((g) => g.pasoId === pasoId)
}

/** Un porcentaje derivado de dos cifras reales — nunca una tasa fija: `costoDirecto` es la base. */
export function pctSobreCostoDirecto(base: number, valor: number): string | null {
  if (!Number.isFinite(base) || base === 0) return null
  return `${((valor / base) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`
}

/** El progreso «paso N de 7» y el ancho de la barra, sobre el ESQUELETO fijo de 7 pasos. */
export function progresoDeLectura(cantidadPublicados: number, totalEsperado = 7) {
  const hechos = Math.min(cantidadPublicados, totalEsperado)
  return {
    texto: `paso ${hechos} de ${totalEsperado}`,
    pctAncho: totalEsperado ? Math.round((hechos / totalEsperado) * 100) : 0,
    completo: hechos >= totalEsperado,
  }
}
