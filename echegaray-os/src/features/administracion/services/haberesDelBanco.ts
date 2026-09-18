// LO QUE EL BANCO LE ACREDITÓ A UNA PERSONA EN EL AÑO, PERÍODO POR PERÍODO, CONTRA LA PLANILLA Y LA
// LIQUIDACIÓN. Dueño, 18/09/2026: «quiero que dejes esto cargado en todos los legajos como corresponde, de
// los activos e inactivos».
//
// ═══ POR QUÉ ES UNA TABLA PROPIA Y NO LA COLUMNA «BANCO» DE LA RETRIBUCIÓN ═══
//
// La tabla de arriba de la solapa es la línea de la Liquidación, tal cual la calcula ese módulo (que se
// corrige en otra rama y no se toca desde acá). El certificado del banco es una fuente DISTINTA y más
// fuerte: lo que el Santander dice que acreditó, persona por persona. Mezclarlos en una celda obligaría a
// elegir uno en silencio. Por eso cada período lleva las tres cifras —banco, planilla, liquidación— y la
// fila dice si coinciden. El «banco» del período ES el del certificado; los otros dos son el cotejo.
//
// ═══ QUÉ PERÍODOS ENTRAN ═══
//
//   · todo período que el banco pagó (quincena o mes, según la clase que decidió el cargador);
//   · todo período donde la planilla o la liquidación AFIRMAN un banco > 0 y el certificado no tiene
//     nada: «la planilla dice que se pagó por banco y el banco no lo acreditó» también es una diferencia.
// Las liquidaciones finales y lo «a confirmar» NO entran a ningún período: van en sus propias listas
// (regla del dueño: la final no se considera en la quincena, ni en el pie, ni en el costo).
//
// ═══ UN MENSUAL SE LEE POR MES ═══
//
// Quien tiene filas en «Oficina 26» (los jefes: cobran por mes, siempre) se agrupa por mes, también la
// planilla y la liquidación. Un jornalero, por quincena calendario (1–15 / 16–fin). Los bloques de la
// planilla que arrancan el 2, el 4 o el 17 caen en su quincena calendario por su primer día.
//
// Puro: sin base, sin React. Se prueba en `haberesDelBanco.test.ts`.

export type ClaseDeAcreditacion = 'quincena' | 'adelanto_quincena' | 'sueldo_mensual' | 'liquidacion_final' | 'a_confirmar'

export interface AcreditacionDelBanco {
  fecha: string
  importe: number
  clase: ClaseDeAcreditacion
  periodoDesde: string | null
  periodoHasta: string | null
  confianza: 'coincide_planilla' | 'regla_fecha' | 'baja_confirmada' | null
  evidencia: string
  nombreBanco: string
}

export interface FilaDePlanilla {
  pestana: string
  quincenaDesde: string
  quincenaHasta: string
  porBanco: number | null
  yaTransferido: number | null
}

export interface LineaDeLiquidacion {
  desde: string
  hasta: string
  porBanco: number | null
  pagadoBanco: number | null
}

export type Cotejo = 'coincide' | 'difiere' | 'sin_dato'

export interface PeriodoDelBanco {
  desde: string
  hasta: string
  tipo: 'quincena' | 'mes'
  /** Las acreditaciones del banco que pagan este período (quincena + adelanto, o el sueldo del mes). */
  acreditaciones: AcreditacionDelBanco[]
  /** Suma del banco. 0 si el banco no acreditó nada y la fila existe por la planilla o la liquidación. */
  banco: number
  /** BANCO + ADELANTO BANCO de la planilla en el período. `null` = la planilla no anota nada. */
  planilla: number | null
  /** Lo que la liquidación registró pagado por banco (`pagado_banco`, o `por_banco` si no hay). */
  liquidacion: number | null
  contraPlanilla: Cotejo
  contraLiquidacion: Cotejo
  /** La cifra de la liquidación de este período es un neto ESTIMADO (la tabla de Retribución lo rotula «est.»). */
  liquidacionEstimada: boolean
  /** Alguna de las dos fuentes dice otra cosa que el banco. La pantalla lo marca; no elige. */
  difiere: boolean
  /** Alguna acreditación salió de la regla de fecha y no de una coincidencia al peso. */
  porRegla: boolean
}

export interface HaberesDelBanco {
  puedeVer: boolean
  anio: number
  periodos: PeriodoDelBanco[]
  finales: AcreditacionDelBanco[]
  aConfirmar: AcreditacionDelBanco[]
  totales: { acreditado: number; periodos: number; finales: number; aConfirmar: number; diferencias: number }
  errores: string[]
}

export const PESTANA_OFICINA = 'Oficina 26'
export const FUENTE = 'certificado Santander del 18/09/2026'

const dos = (n: number): string => String(n).padStart(2, '0')
const ultimoDia = (a: number, m: number): number => new Date(Date.UTC(a, m, 0)).getUTCDate()

/** La quincena calendario de una fecha (o del primer día de un bloque de la planilla). */
export function quincenaCalendario(fecha: string): { desde: string; hasta: string } {
  const a = Number(fecha.slice(0, 4)); const m = Number(fecha.slice(5, 7)); const d = Number(fecha.slice(8, 10))
  return d <= 15
    ? { desde: `${a}-${dos(m)}-01`, hasta: `${a}-${dos(m)}-15` }
    : { desde: `${a}-${dos(m)}-16`, hasta: `${a}-${dos(m)}-${dos(ultimoDia(a, m))}` }
}

export function mesCalendario(fecha: string): { desde: string; hasta: string } {
  const a = Number(fecha.slice(0, 4)); const m = Number(fecha.slice(5, 7))
  return { desde: `${a}-${dos(m)}-01`, hasta: `${a}-${dos(m)}-${dos(ultimoDia(a, m))}` }
}

const centavos = (n: number): number => Math.round(n * 100)
const suma = (xs: number[]): number => centavos(xs.reduce((s, x) => s + x, 0)) / 100
/** «Coincide al peso»: la planilla redondea (Maldonado, enero: 1.113.592,21 contra 1.113.592). */
export const alPeso = (a: number, b: number): boolean => Math.abs(centavos(a) - centavos(b)) < 100

function cotejar(banco: number, otro: number | null): Cotejo {
  if (otro == null || otro === 0) return banco === 0 ? 'sin_dato' : 'difiere'
  return alPeso(banco, otro) ? 'coincide' : 'difiere'
}

/** ¿La liquidación de este período es un estimado? Un mes lo es si alguna de sus quincenas lo es. */
export function liquidacionEstimada(x: { desde: string; tipo: 'quincena' | 'mes' }, estimadas: readonly string[]): boolean {
  return x.tipo === 'mes' ? estimadas.some((d) => d.slice(0, 7) === x.desde.slice(0, 7)) : estimadas.includes(x.desde)
}

/** Marca `liquidacionEstimada` sobre un resultado ya armado, cuando las quincenas estimadas se conocen después. */
export function conLiquidacionEstimada(h: HaberesDelBanco, estimadas: readonly string[]): HaberesDelBanco {
  return { ...h, periodos: h.periodos.map((x) => ({ ...x, liquidacionEstimada: x.liquidacion != null && liquidacionEstimada(x, estimadas) })) }
}

export function armarHaberesDelBanco(p: {
  puedeVer: boolean
  anio: number
  acreditaciones: readonly AcreditacionDelBanco[]
  planilla: readonly FilaDePlanilla[]
  liquidacion: readonly LineaDeLiquidacion[]
  /** `desde` de las quincenas cuyo banco la Retribución muestra como estimado (`bancoEstimado`). */
  estimadas?: readonly string[]
  errores?: string[]
}): HaberesDelBanco {
  const vacio = { acreditado: 0, periodos: 0, finales: 0, aConfirmar: 0, diferencias: 0 }
  if (!p.puedeVer) return { puedeVer: false, anio: p.anio, periodos: [], finales: [], aConfirmar: [], totales: vacio, errores: [] }

  const anio = String(p.anio)
  const mensual = p.planilla.some((f) => f.pestana === PESTANA_OFICINA)
    || p.acreditaciones.some((a) => a.clase === 'sueldo_mensual')
  const periodoDe = (fecha: string) => (mensual ? mesCalendario(fecha) : quincenaCalendario(fecha))

  type Acum = { desde: string; hasta: string; acreditaciones: AcreditacionDelBanco[]; planilla: number[]; liquidacion: number[] }
  const porPeriodo = new Map<string, Acum>()
  const tomar = (r: { desde: string; hasta: string }): Acum => {
    let a = porPeriodo.get(r.desde)
    if (!a) { a = { ...r, acreditaciones: [], planilla: [], liquidacion: [] }; porPeriodo.set(r.desde, a) }
    return a
  }

  const finales: AcreditacionDelBanco[] = []
  const aConfirmar: AcreditacionDelBanco[] = []
  for (const a of p.acreditaciones) {
    if (a.clase === 'liquidacion_final') { finales.push(a); continue }
    if (a.clase === 'a_confirmar' || !a.periodoDesde || !a.periodoHasta) { aConfirmar.push(a); continue }
    // El período lo decidió el cargador; para un mensual ya es el mes, para un jornalero la quincena.
    tomar({ desde: a.periodoDesde, hasta: a.periodoHasta }).acreditaciones.push(a)
  }
  for (const f of p.planilla) {
    const v = (f.porBanco ?? 0) + (f.yaTransferido ?? 0)
    if (f.porBanco == null && f.yaTransferido == null) continue
    if (!f.quincenaDesde.startsWith(anio)) continue
    tomar(periodoDe(f.quincenaDesde)).planilla.push(v)
  }
  for (const l of p.liquidacion) {
    const v = l.pagadoBanco ?? l.porBanco
    if (v == null || v === 0) continue
    if (!l.desde.startsWith(anio)) continue
    tomar(periodoDe(l.desde)).liquidacion.push(v)
  }

  const periodos: PeriodoDelBanco[] = [...porPeriodo.values()]
    .filter((x) => x.acreditaciones.length > 0 || x.planilla.some((v) => v !== 0) || x.liquidacion.some((v) => v !== 0))
    .sort((a, b) => a.desde.localeCompare(b.desde))
    .map((x) => {
      const banco = suma(x.acreditaciones.map((a) => a.importe))
      const planilla = x.planilla.length ? suma(x.planilla) : null
      const liquidacion = x.liquidacion.length ? suma(x.liquidacion) : null
      const contraPlanilla = cotejar(banco, planilla)
      const contraLiquidacion = cotejar(banco, liquidacion)
      return {
        desde: x.desde, hasta: x.hasta, tipo: mensual ? 'mes' as const : 'quincena' as const,
        acreditaciones: x.acreditaciones.sort((a, b) => a.fecha.localeCompare(b.fecha)),
        banco, planilla, liquidacion, contraPlanilla, contraLiquidacion,
        liquidacionEstimada: liquidacion != null && liquidacionEstimada({ desde: x.desde, tipo: mensual ? 'mes' : 'quincena' }, p.estimadas ?? []),
        difiere: contraPlanilla === 'difiere' || contraLiquidacion === 'difiere',
        porRegla: x.acreditaciones.some((a) => a.confianza === 'regla_fecha'),
      }
    })

  return {
    puedeVer: true, anio: p.anio, periodos,
    finales: finales.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    aConfirmar: aConfirmar.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    totales: {
      acreditado: suma(p.acreditaciones.map((a) => a.importe)),
      periodos: suma(periodos.map((x) => x.banco)),
      finales: suma(finales.map((a) => a.importe)),
      aConfirmar: suma(aConfirmar.map((a) => a.importe)),
      diferencias: periodos.filter((x) => x.difiere).length,
    },
    errores: p.errores ?? [],
  }
}

/** `1ª quincena de marzo · 1 al 15` o `marzo 2026`. */
export function rotuloDelPeriodo(x: { desde: string; hasta: string; tipo: 'quincena' | 'mes' }): string {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const mes = MESES[Number(x.desde.slice(5, 7)) - 1]
  if (x.tipo === 'mes') return `${mes} ${x.desde.slice(0, 4)}`
  return `${Number(x.desde.slice(8, 10)) === 1 ? '1ª' : '2ª'} quincena de ${mes} · ${Number(x.desde.slice(8, 10))} al ${Number(x.hasta.slice(8, 10))}`
}

/** `16/01/2026` */
export const fechaCorta = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
