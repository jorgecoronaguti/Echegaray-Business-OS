// LA RETRIBUCIÓN DEL PLANTEL ENTERO — la solapa «Retribución» de Personal. Dueño, 17/09/2026.
//
// Elegido entre opciones: *«Personal: Plantel · Horas · Retribución · Liquidación»*, una tabla con todo el
// plantel activo, el $/h negro y el del recibo vigentes, una columna por quincena del año con lo pagado
// (o lo liquidado; los mensuales por mes) y el total del año. Cada persona abre su detalle, que es la
// sección «Retribución» de su legajo.
//
// ═══ NO HAY UNA SEGUNDA CUENTA: CADA FILA ES LA FICHA DE ESA PERSONA ═══
//
// La fila de una persona se arma con `armarRetribucion` —la MISMA función de su legajo— sobre las mismas
// líneas de la Liquidación, y su celda de una quincena es la `FilaDeRetribucion` de ese período. El total
// del año es `totales.pagado` o `totales.total`, que son las cifras «consta pagado» y «liquidado» de la
// ficha. Si la tabla sumara las celdas por su cuenta, el día que una fila «sin neto» o «sin saldo» quede
// fuera del pie las dos pantallas dirían números distintos para la misma persona.
//
// Lo único que este módulo decide es DISTRIBUCIÓN: qué línea es de quién, en qué columna cae cada fila y
// quién es el plantel activo.
//
// ═══ EL PLANTEL ACTIVO ES EL DE LA QUINCENA EN CURSO, COMO LO PUBLICA LA LIQUIDACIÓN ═══
//
// `en_la_empresa` es un campo; «activo» es lo que decide `plantelDeLaQuincena` con evidencia, y ya viene
// resuelto en los cuadros de la quincena de hoy. Las liquidaciones finales no entran: son gente que se va
// y el dueño pidió no considerarlas. Quien se fue en junio no aparece en la tabla, pero sus quincenas
// siguen en su legajo.
//
// Puro: sin base, sin React. Se prueba en `retribucionDelPlantel.test.ts`.

import { estadoDelCuadro, type EstadoDeCuadro } from './estadoDelCuadro.ts'
import {
  armarRetribucion, type FilaDeRetribucion, type LineaRetribuida,
  type QuincenaRetribuida, type ReciboDelBlanco, type RetribucionDelLegajo,
} from './retribucionDelLegajo.ts'
import type { Quincena } from './quincena.ts'
import type { RotuloValorHora } from './valorHoraDelLegajo.ts'

/** Lo que se toma de una línea del cuadro: la parte retribuida y de quién es. */
export type LineaDelCuadro = LineaRetribuida & { personaId: string; nombre: string }

/** Una quincena ya leída con `getLiquidacionDeLaQuincena`. Si falló, `cuadros` vacío. */
export interface QuincenaLeida {
  quincena: Quincena
  cuadros: readonly { grupo: string; lineas: readonly LineaDelCuadro[] }[]
  estados: Readonly<Record<string, EstadoDeCuadro>>
}

/**
 * LA QUINCENA DE UNA PERSONA: su línea en el primer cuadro que la tiene, con el estado de ESE cuadro.
 * La usa también el legajo (`retribucionDelLegajoService.ts`): una sola definición de «su línea».
 */
export function quincenaDeLaPersona(l: QuincenaLeida, personaId: string): QuincenaRetribuida {
  for (const c of l.cuadros) {
    const linea = c.lineas.find((x) => x.personaId === personaId)
    if (!linea) continue
    return { quincena: l.quincena, estado: estadoDelCuadro(l.estados, c.grupo).estado, linea }
  }
  return { quincena: l.quincena, estado: null, linea: null }
}

/** Quien está en los cuadros de la quincena más nueva, sin las liquidaciones finales. Por nombre. */
export function plantelActivo(lecturas: readonly QuincenaLeida[]): { personaId: string; nombre: string }[] {
  const ultima = [...lecturas].sort((a, b) => (a.quincena.desde < b.quincena.desde ? 1 : -1))[0]
  if (!ultima) return []
  const vistos = new Map<string, string>()
  for (const c of ultima.cuadros) {
    if (c.grupo === 'final') continue
    for (const l of c.lineas) if (!vistos.has(l.personaId)) vistos.set(l.personaId, l.nombre)
  }
  return [...vistos].map(([personaId, nombre]) => ({ personaId, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export type Medida = 'pagado' | 'liquidado'

export const medidaDe = (v: string | undefined): Medida => (v === 'liquidado' ? 'liquidado' : 'pagado')

/** Un mes del año con sus quincenas: la cabecera de dos pisos de la tabla. */
export interface MesDeColumnas {
  mes: string
  rotulo: string
  quincenas: Quincena[]
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function mesesDeColumnas(quincenas: readonly Quincena[]): MesDeColumnas[] {
  const porMes = new Map<string, Quincena[]>()
  for (const q of [...quincenas].sort((a, b) => (a.desde < b.desde ? -1 : 1))) {
    const mes = q.desde.slice(0, 7)
    porMes.set(mes, [...(porMes.get(mes) ?? []), q])
  }
  return [...porMes].map(([mes, qs]) => ({ mes, rotulo: MES_CORTO[Number(mes.slice(5, 7)) - 1], quincenas: qs }))
}

/**
 * UNA CELDA DE LA TABLA. `span` 2 = el mes de un mensual ocupa sus dos quincenas; 0 = la tapa la de al
 * lado y no se dibuja. `valor` null con `motivo` = se escribe el motivo, nunca $0.
 */
export interface CeldaDelPlantel {
  desde: string
  span: number
  valor: number | null
  motivo: 'fuera' | 'sin neto' | 'sin total' | null
  estado: 'abierta' | 'cerrada' | 'fuera'
  mensual: boolean
}

function valorDeLaFila(f: FilaDeRetribucion, medida: Medida): Pick<CeldaDelPlantel, 'valor' | 'motivo'> {
  if (!f.pago) return { valor: null, motivo: 'fuera' }
  if (medida === 'pagado') return { valor: f.pago.pagado, motivo: null }
  if (f.sinNeto) return { valor: null, motivo: 'sin neto' }
  return f.pago.total == null ? { valor: null, motivo: 'sin total' } : { valor: f.pago.total, motivo: null }
}

/** Las filas de la ficha, puestas en las columnas del año. */
export function celdasDeLaPersona(
  filas: readonly FilaDeRetribucion[], meses: readonly MesDeColumnas[], medida: Medida,
): CeldaDelPlantel[] {
  const porDesde = new Map(filas.map((f) => [f.desde, f]))
  const celdas: CeldaDelPlantel[] = []
  for (const m of meses) {
    const primera = porDesde.get(m.quincenas[0].desde)
    if (primera?.mensual) {
      m.quincenas.forEach((q, i) => celdas.push({
        desde: q.desde, span: i === 0 ? m.quincenas.length : 0, ...valorDeLaFila(primera, medida),
        estado: primera.estado, mensual: true,
      }))
      continue
    }
    for (const q of m.quincenas) {
      const f = porDesde.get(q.desde)
      celdas.push(f
        ? { desde: q.desde, span: 1, ...valorDeLaFila(f, medida), estado: f.estado, mensual: false }
        : { desde: q.desde, span: 1, valor: null, motivo: 'fuera', estado: 'fuera', mensual: false })
    }
  }
  return celdas
}

export interface PersonaDelPlantelRetribuido {
  personaId: string
  nombre: string
  cuil: string | null
}

export interface EntradaDelPlantel {
  puedeVer: boolean
  anio: number
  medida: Medida
  lecturas: readonly QuincenaLeida[]
  personas: readonly PersonaDelPlantelRetribuido[]
  /** Las líneas de recibo real, ya repartidas por persona con la llave del legajo. */
  recibosDe: (p: PersonaDelPlantelRetribuido) => readonly ReciboDelBlanco[]
  /** El rótulo de $/h de su legajo (`rotuloDeValorHora`): de ahí salen los dos $/h vigentes. */
  rotuloDe: (p: PersonaDelPlantelRetribuido) => RotuloValorHora
  errores: readonly string[]
}

export interface FilaDelPlantel {
  personaId: string
  nombre: string
  celdas: CeldaDelPlantel[]
  /** `totales.pagado` o `totales.total` de SU ficha. `null` = ninguna quincena liquidada. */
  total: number | null
  retribucion: RetribucionDelLegajo
  rotulo: RotuloValorHora
}

export interface RetribucionDelPlantel {
  puedeVer: boolean
  anio: number
  medida: Medida
  meses: MesDeColumnas[]
  filas: FilaDelPlantel[]
  errores: string[]
}

/** LA SOLAPA ENTERA. Cada persona pasa por `armarRetribucion`, igual que en su legajo. */
export function armarRetribucionDelPlantel(e: EntradaDelPlantel): RetribucionDelPlantel {
  const meses = mesesDeColumnas(e.lecturas.map((l) => l.quincena))
  if (!e.puedeVer) return { puedeVer: false, anio: e.anio, medida: e.medida, meses, filas: [], errores: [] }
  const filas = e.personas.map((p) => {
    const retribucion = armarRetribucion({
      puedeVer: true, anio: e.anio,
      quincenas: e.lecturas.map((l) => quincenaDeLaPersona(l, p.personaId)),
      recibos: e.recibosDe(p), errores: [],
    })
    const t = retribucion.totales
    return {
      personaId: p.personaId,
      nombre: p.nombre,
      celdas: celdasDeLaPersona(retribucion.filas, meses, e.medida),
      total: t.liquidadas === 0 ? null : e.medida === 'pagado' ? t.pagado : t.total,
      retribucion,
      rotulo: e.rotuloDe(p),
    }
  })
  return { puedeVer: true, anio: e.anio, medida: e.medida, meses, filas, errores: [...new Set(e.errores)] }
}
