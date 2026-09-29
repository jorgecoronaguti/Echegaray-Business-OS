// «NOVEDADES PARA EL ESTUDIO» — el papel de la quincena que se le manda al contador.
//
// Dueño, 29/09/2026: un exportable por quincena, con los horarios de cada empleado y la liquidación estimada de
// sus conceptos remunerativos y no remunerativos, para los contadores. El estudio liquida el sueldo; lo que
// necesita de nosotros son las NOVEDADES (quién, qué categoría, qué días y horas, qué ausencias) y, como
// referencia, lo que el panel estima.
//
// ═══ SÓLO EL BLANCO, Y POR CONSTRUCCIÓN ═══
//
// Este módulo no lee `negro`, `horasNegro`, adelantos, pagos, Banco ni Efectivo del panel: de la liquidación
// toma únicamente lo que ya pasa por `reciboFormatoContador` (reciboEstimado / conceptosReales / totalesReales).
// No hay forma de que el negro entre porque el tipo de entrada no lo trae. Tampoco se copian los `avisos` del
// recibo: comparan contra el Banco del panel y no son para el estudio.
//
// ═══ QUIÉN NO ENTRA ═══
//
// Quien no tiene blanco por conceptos (`SinReciboContador`) queda FUERA del archivo y se cuenta aparte en
// `excluidos`. Incluirlo con importes vacíos le diría al estudio que existe alguien sin blanco; eso lo decide
// el dueño mirando la pantalla, no un archivo que sale de la empresa.
//
// ═══ NADA SE RECALCULA ═══
//
// Los importes son los renglones del recibo; los subtotales, los del recibo. Las únicas sumas propias son los
// totales del pie (suma de lo que ya está en cada fila) y el conteo de días/horas de las celdas de la grilla.

import { compararPorApellido } from '../../../shared/personas/nombre.ts'
import type { FilaDelEspejo } from './espejoDeJornales.ts'
import { EMPLEADOR, esReciboContador, periodoDePago, reciboFormatoContador, type RenglonContador } from './reciboFormatoContador.ts'

export type SeccionNovedad = 'remunerativo' | 'no_remunerativo' | 'descuento'

export interface ColumnaDeConcepto { clave: string; seccion: SeccionNovedad; codigo: string; descripcion: string }

/** Lo que la pantalla sabe de la persona y `FilaDelEspejo` no trae: viene del legajo. */
export interface DatosDelLegajo {
  /** «Maldonado Batista Emiliano Miguel»: el legajo, apellido primero. */
  nombreCompleto: string | null
  legajo: string | null
  cuil: string | null
  obra: string | null
}

export interface FilaDeNovedades {
  personaId: string
  legajo: string | null
  apellidoYNombre: string
  cuil: string | null
  categoria: string | null
  obra: string | null
  diasTrabajados: number
  horasNormales: number
  horasExtra50: number
  horasExtra100: number
  horasTrabajadas: number
  diasAusencia: number
  diasAusenciaSinMotivo: number
  diasLicencia: number
  horasLicencia: number
  origen: 'recibo' | 'estimado'
  importes: Record<string, number | null>
  totalRemunerativo: number | null
  totalNoRemunerativo: number | null
  sueldoBruto: number | null
  totalDescuentos: number | null
  neto: number | null
}

export interface TotalesDeNovedades {
  personas: number
  horasNormales: number
  horasExtra50: number
  horasExtra100: number
  horasTrabajadas: number
  diasAusencia: number
  diasLicencia: number
  porConcepto: Record<string, number>
  totalRemunerativo: number
  totalNoRemunerativo: number
  sueldoBruto: number
  totalDescuentos: number
  neto: number
  /** Filas con algún importe sin número (regla dudosa): sus totales no incluyen ese renglón. */
  filasIncompletas: number
}

export interface ReporteDeNovedades {
  empleador: { razonSocial: string; cuit: string }
  titulo: string
  periodo: { desde: string; hasta: string; texto: string }
  emision: string
  feriadosDeLaQuincena: number | null
  leyenda: string
  columnas: ColumnaDeConcepto[]
  filas: FilaDeNovedades[]
  totales: TotalesDeNovedades
  /** Uso interno de la pantalla: NO se escribe en el archivo. */
  excluidos: number
}

export const LEYENDA_ESTIMADO =
  'Importes ESTIMADOS por el OS de Echegaray Construcciones con las horas cargadas de la quincena. No son la liquidación: '
  + 'el recibo oficial lo emite el estudio. Las filas con origen «Recibo del estudio» llevan los conceptos del recibo ya cargado.'

const ORDEN_SECCION: Record<SeccionNovedad, number> = { remunerativo: 0, no_remunerativo: 1, descuento: 2 }
const r2 = (n: number): number => Math.round(n * 100) / 100

export function rotuloDeSeccion(s: SeccionNovedad): string {
  return s === 'remunerativo' ? 'Remunerativo' : s === 'no_remunerativo' ? 'No remunerativo' : 'Descuentos'
}

interface ConteoDeDias {
  diasTrabajados: number; diasAusencia: number; diasAusenciaSinMotivo: number; diasLicencia: number; horasLicencia: number
}

/** Días y horas de las celdas de la grilla tal cual las pinta el panel (una celda = un día). */
function contarDias(fila: FilaDelEspejo): ConteoDeDias {
  const c: ConteoDeDias = { diasTrabajados: 0, diasAusencia: 0, diasAusenciaSinMotivo: 0, diasLicencia: 0, horasLicencia: 0 }
  for (const x of fila.celdas) {
    if (x.marca === 'horas' && (x.horas ?? 0) > 0) c.diasTrabajados += 1
    else if (x.marca === 'ausencia') { c.diasAusencia += 1; if (x.sinMotivo) c.diasAusenciaSinMotivo += 1 }
    else if (x.marca === 'licencia') { c.diasLicencia += 1; c.horasLicencia += x.horas ?? 0 }
  }
  c.horasLicencia = r2(c.horasLicencia)
  return c
}

const renglonesDe = (r: { remunerativo: RenglonContador[]; noRemunerativo: RenglonContador[]; descuentos: RenglonContador[] }) => [
  ...r.remunerativo.map((x) => ({ x, seccion: 'remunerativo' as const })),
  ...r.noRemunerativo.map((x) => ({ x, seccion: 'no_remunerativo' as const })),
  ...r.descuentos.map((x) => ({ x, seccion: 'descuento' as const })),
]

export interface EntradaDeNovedades {
  filas: readonly FilaDelEspejo[]
  legajos: ReadonlyMap<string, DatosDelLegajo>
  quincena: { desde: string; hasta: string }
  /** `YYYY-MM-DD` de hoy: se pasa, no se lee del reloj, para que el armado sea puro. */
  emision: string
  feriados: number | null
}

/** Arma el reporte. Orden: apellido (el comparador único de personas), sin importar el cuadro de origen. */
export function novedadesParaElEstudio(e: EntradaDeNovedades): ReporteDeNovedades {
  const columnas = new Map<string, ColumnaDeConcepto>()
  const filas: FilaDeNovedades[] = []
  let excluidos = 0
  for (const f of e.filas) {
    const r = reciboFormatoContador(f.linea.sueldo)
    if (!esReciboContador(r)) { excluidos += 1; continue }
    const l = e.legajos.get(f.personaId)
    const importes: Record<string, number | null> = {}
    for (const { x, seccion } of renglonesDe(r)) {
      const clave = `${seccion}:${x.codigo}`
      if (!columnas.has(clave)) columnas.set(clave, { clave, seccion, codigo: x.codigo, descripcion: x.descripcion })
      importes[clave] = x.monto
    }
    filas.push({
      personaId: f.personaId, legajo: l?.legajo ?? null, cuil: l?.cuil ?? null, obra: l?.obra ?? null,
      apellidoYNombre: l?.nombreCompleto ?? f.nombre,
      categoria: r.categoria ?? f.categoria,
      ...contarDias(f),
      horasNormales: f.horasPorTipo.normales, horasExtra50: f.horasPorTipo.extra50,
      horasExtra100: f.horasPorTipo.extra100, horasTrabajadas: f.horasPorTipo.total,
      origen: r.origen, importes,
      totalRemunerativo: r.totalRemunerativo, totalNoRemunerativo: r.totalNoRemunerativo,
      sueldoBruto: r.sueldoBruto, totalDescuentos: r.totalDescuentos,
      // Si el recibo no cuadra el neto no se afirma (misma regla que el recibo en blanco).
      neto: r.cuadra ? r.neto : null,
    })
  }
  filas.sort((a, b) => compararPorApellido(a.apellidoYNombre, b.apellidoYNombre))
  const cols = [...columnas.values()].sort((a, b) =>
    ORDEN_SECCION[a.seccion] - ORDEN_SECCION[b.seccion] || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  const p = periodoDePago(e.quincena.desde)
  return {
    empleador: { razonSocial: EMPLEADOR.razonSocial, cuit: EMPLEADOR.cuit },
    titulo: `Novedades para el estudio · ${p.texto}`,
    periodo: { desde: e.quincena.desde, hasta: e.quincena.hasta, texto: p.texto },
    emision: e.emision, feriadosDeLaQuincena: e.feriados, leyenda: LEYENDA_ESTIMADO,
    columnas: cols, filas, totales: totalizar(filas, cols), excluidos,
  }
}

function totalizar(filas: readonly FilaDeNovedades[], cols: readonly ColumnaDeConcepto[]): TotalesDeNovedades {
  const suma = (f: (x: FilaDeNovedades) => number | null): number => r2(filas.reduce((a, x) => a + (f(x) ?? 0), 0))
  const porConcepto: Record<string, number> = {}
  for (const c of cols) porConcepto[c.clave] = suma((x) => x.importes[c.clave] ?? null)
  return {
    personas: filas.length,
    horasNormales: suma((x) => x.horasNormales), horasExtra50: suma((x) => x.horasExtra50),
    horasExtra100: suma((x) => x.horasExtra100), horasTrabajadas: suma((x) => x.horasTrabajadas),
    diasAusencia: suma((x) => x.diasAusencia), diasLicencia: suma((x) => x.diasLicencia),
    porConcepto,
    totalRemunerativo: suma((x) => x.totalRemunerativo), totalNoRemunerativo: suma((x) => x.totalNoRemunerativo),
    sueldoBruto: suma((x) => x.sueldoBruto), totalDescuentos: suma((x) => x.totalDescuentos), neto: suma((x) => x.neto),
    filasIncompletas: filas.filter((x) => x.neto == null || Object.values(x.importes).some((m) => m == null)).length,
  }
}
