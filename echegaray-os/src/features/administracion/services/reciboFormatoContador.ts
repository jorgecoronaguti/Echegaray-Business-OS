// EL RECIBO EN BLANCO CON LA FORMA DEL QUE MANDA EL CONTADOR — qué se imprime y de dónde sale cada número.
//
// Dueño, 28/09/2026: *«quiero que exista la opción de poder imprimir también un recibo con todo lo blanco como
// si fuese el recibo que envía el contador. Revisar bien esta tarea cómo debería ser en base a los recibos
// oficiales»*.
//
// ═══ LA FORMA SALE DEL RECIBO OFICIAL, NO DE UN MODELO DE RECIBO GENÉRICO ═══
//
// Leído del PDF del estudio (Q2-08/2026, TELLO, `drive_file_id` del legajo) y de `recibo_sueldo_concepto`:
// encabezado del empleador (razón social, C.U.I.T., domicilio) · Q, mes, año, apellido y nombre, N° legajo,
// rem. asignada ($/h), sueldo bruto, C.U.I.L. · fecha de ingreso, calificación, F. pago aportes, período y
// banco del último depósito · categoría laboral, sección, modalidad · obra social, lugar y fecha de pago,
// período de pago · contribuciones del empleador y costo total · CONCEPTO / UNIDAD / BASE / MONTO en tres
// secciones (REMUNERATIVO, NO REMUNERATIVO, DESCUENTOS; no en tres columnas) · composición salarial · SUELDO
// NETO · importe en letras · observaciones · firmas y la leyenda «Recibí el importe neto…».
//
// ═══ UNA SOLA FUENTE: LA DEL PANEL ═══
//
// Los renglones son los del bloque BLANCO del panel (`ReciboPorConceptos`): el recibo real de la quincena si
// está cargado concepto por concepto; si no, `sueldo.reciboEstimado` (`estimarRecibo`). Acá no se estima
// nada: se reordena. Y NADA del negro entra — este módulo no lee `negro`, `horasNegro`, adelantos ni pagos:
// sólo `reciboEstimado`, `conceptosReales` y `totalesReales`. Puro: sin base, sin React.

import { totalesDelReal } from './reciboEstimado.ts'
import type { ConceptoDeRecibo, SeccionDelConcepto } from './reglasDelRecibo.ts'
import type { SueldoBlancoNegro } from './sueldoBlancoNegro.ts'

/**
 * EL EMPLEADOR, COMO LO IMPRIME EL ESTUDIO (recibo Q2-08/2026). Es un HECHO del papel, no un dato de la base:
 * la app no tiene una tabla de la empresa. Si el domicilio cambia, cambia acá y en el recibo del estudio.
 */
export const EMPLEADOR = {
  razonSocial: 'ECHEGARAY CONSTRUCCIONES S.A.S.',
  cuit: '30-71630464-3',
  domicilio: 'AV. RIOJA NORTE 75 - CAPITAL',
} as const

export interface RenglonContador {
  codigo: string
  descripcion: string
  unidad: number | null
  base: number | null
  /** `null` = regla dudosa del estimado: no hay número que imprimir. */
  monto: number | null
}

export interface ReciboContador {
  /** `recibo`: los conceptos del recibo real de la quincena. `estimado`: `estimarRecibo`, NUNCA un hecho. */
  origen: 'recibo' | 'estimado'
  categoria: string | null
  valorHora: number | null
  remunerativo: RenglonContador[]
  noRemunerativo: RenglonContador[]
  descuentos: RenglonContador[]
  /** Vacío en el estimado salvo que todas tengan número: un costo total con agujeros mentiría. */
  contribuciones: RenglonContador[]
  totalRemunerativo: number | null
  totalNoRemunerativo: number | null
  totalDescuentos: number | null
  /** Remunerativo + no remunerativo: el «SUELDO BRUTO» del recibo. */
  sueldoBruto: number | null
  neto: number | null
  contribucionesEmpleador: number | null
  costoTotalEmpleador: number | null
  /** remunerativo + no remunerativo − descuentos = neto. Si no cierra, no se imprime. */
  cuadra: boolean
  /** Para la pantalla, no para el papel: reglas dudosas, diferencias con el Banco del panel o con el recibo. */
  avisos: string[]
  driveFileId: string | null
}

export interface SinReciboContador { falta: string; driveFileId: string | null }

const r2 = (n: number): number => Math.round(n * 100) / 100
const renglon = (c: { codigo: string; descripcion: string; unidad: number | null; base: number | null; monto: number | null }): RenglonContador =>
  ({ codigo: c.codigo, descripcion: c.descripcion, unidad: c.unidad, base: c.base, monto: c.monto })
const deSeccion = <T extends { seccion: SeccionDelConcepto }>(ls: readonly T[], s: SeccionDelConcepto): T[] => ls.filter((l) => l.seccion === s)
const sumaONull = (ls: readonly RenglonContador[]): number | null =>
  ls.some((l) => l.monto == null) ? null : r2(ls.reduce((a, l) => a + (l.monto ?? 0), 0))
const $ = (n: number): string => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** El recibo del estudio, concepto por concepto. Los totales, de `totalesDelReal` (la misma cuenta del panel). */
function desdeElReal(s: SueldoBlancoNegro, real: readonly ConceptoDeRecibo[]): ReciboContador {
  const t = totalesDelReal(real)!
  const rem = deSeccion(real, 'remunerativo').map(renglon)
  const noRem = deSeccion(real, 'no_remunerativo').map(renglon)
  const avisos: string[] = []
  // UN CONTROL QUE NO SE VALIDA CONTRA SÍ MISMO: los conceptos salieron del cuerpo del PDF y el neto de
  // `recibo_sueldo_linea` de su pie. Si no coinciden, el detalle cargado está incompleto.
  // Y ES EL ÚNICO CONTROL QUE PUEDE DECIR QUE NO: `cuadra` no puede salir de la misma suma que se imprime.
  const netoDelPie = s.totalesReales?.neto ?? null
  const noCoincideConElPie = netoDelPie != null && Math.abs(netoDelPie - t.neto) > 0.01
  if (noCoincideConElPie) {
    avisos.push(`los conceptos cargados dan un neto de ${$(t.neto)} y el pie del recibo dice ${$(netoDelPie)}: mirá el PDF`)
  }
  return {
    origen: 'recibo', categoria: s.categoriaRecibo ?? null, valorHora: s.valorHoraCategoria,
    remunerativo: rem, noRemunerativo: noRem,
    descuentos: deSeccion(real, 'descuento').map(renglon),
    contribuciones: deSeccion(real, 'contribucion').map(renglon),
    totalRemunerativo: sumaONull(rem), totalNoRemunerativo: sumaONull(noRem), totalDescuentos: t.descuentos,
    sueldoBruto: t.haberes, neto: t.neto,
    contribucionesEmpleador: t.contribuciones, costoTotalEmpleador: t.costoTotal,
    cuadra: !noCoincideConElPie, avisos, driveFileId: s.driveFileId,
  }
}

/** El estimado del panel. Los totales son los suyos (`remunerativo`, `descuentos`, `neto`), no una suma nueva. */
function desdeElEstimado(s: SueldoBlancoNegro): ReciboContador {
  const est = s.reciboEstimado!
  const noRem = deSeccion(est.lineas, 'no_remunerativo').map(renglon)
  // CONTRIBUCIONES SÓLO SI TODAS TIENEN NÚMERO: las de detracción variable (5010–5040) son reglas dudosas, y un
  // «costo total empleador» con agujeros sería un número falso en el papel.
  const contrib = est.contribuciones == null ? [] : deSeccion(est.lineas, 'contribucion').map(renglon)
  const totalNoRem = sumaONull(noRem)
  return {
    origen: 'estimado', categoria: s.categoriaRecibo ?? null, valorHora: est.valorHora,
    remunerativo: deSeccion(est.lineas, 'remunerativo').map(renglon), noRemunerativo: noRem,
    descuentos: deSeccion(est.lineas, 'descuento').map(renglon),
    contribuciones: contrib,
    totalRemunerativo: est.remunerativo, totalNoRemunerativo: totalNoRem, totalDescuentos: est.descuentos,
    sueldoBruto: est.remunerativo == null || totalNoRem == null ? null : r2(est.remunerativo + totalNoRem),
    neto: est.neto,
    contribucionesEmpleador: contrib.length ? est.contribuciones : null,
    costoTotalEmpleador: contrib.length ? est.costoTotal : null,
    cuadra: true, avisos: [...est.avisos], driveFileId: null,
  }
}

/**
 * EL RECIBO EN FORMATO CONTADOR de la persona, o por qué no hay. Con recibo real a medias (llegó el PDF pero
 * no su detalle) NO se cae al estimado: existiendo el papel del estudio, imprimir otro número sería peor que
 * mandar a abrir el PDF.
 */
export function reciboFormatoContador(s: SueldoBlancoNegro | null | undefined): ReciboContador | SinReciboContador {
  if (!s) return { falta: 'esta persona no tiene blanco por conceptos en esta quincena', driveFileId: null }
  const real = s.conceptosReales ?? null
  let r: ReciboContador
  if (real && real.length > 0) r = desdeElReal(s, real)
  else if (s.estado === 'recibo' || s.totalesReales != null) {
    return { falta: 'el recibo del estudio de esta quincena está cargado sin sus conceptos: el papel oficial es su PDF', driveFileId: s.driveFileId }
  } else if (s.reciboEstimado) r = desdeElEstimado(s)
  else return { falta: 'sin $/h o sin horas del recibo: no hay blanco estimado que imprimir', driveFileId: null }
  return controlar(r, s)
}

/** Lo que el papel afirma tiene que cerrar, y lo que difiera del panel se dice en la pantalla. */
function controlar(r: ReciboContador, s: SueldoBlancoNegro): ReciboContador {
  const { totalRemunerativo: rem, totalNoRemunerativo: nr, totalDescuentos: d, neto } = r
  const cuadra = r.cuadra && rem != null && nr != null && d != null && neto != null && Math.abs(r2(rem + nr - d) - neto) <= 0.01
  const avisos = [...r.avisos]
  if (neto == null) avisos.push('hay un concepto sin número (regla dudosa): el neto no se puede afirmar y no se imprime')
  else if (!cuadra) avisos.push(`remunerativo + no remunerativo − descuentos no da el neto ${$(neto)}: no se imprime`)
  // EL BANCO DEL PANEL PUEDE NO SER ESTE NETO: escrito a mano, de la nómina o de la mediana. Se dice, no se pisa.
  if (neto != null && s.neto != null && Math.abs(s.neto - neto) > 0.01) {
    avisos.push(`el Banco del panel es ${$(s.neto)} (${s.origenNeto ?? 'sin origen'}) y este recibo da ${$(neto)}`)
  }
  return { ...r, cuadra, avisos }
}

export const esReciboContador = (x: ReciboContador | SinReciboContador): x is ReciboContador => 'origen' in x

/** «SEGUNDA QUINCENA 08/2026» y sus partes, de la fecha de inicio de la quincena. */
export function periodoDePago(desde: string): { q: 1 | 2; mes: string; anio: string; texto: string } {
  const q: 1 | 2 = Number(desde.slice(8, 10)) <= 15 ? 1 : 2
  const mes = desde.slice(5, 7)
  const anio = desde.slice(0, 4)
  return { q, mes, anio, texto: `${q === 1 ? 'PRIMERA' : 'SEGUNDA'} QUINCENA ${mes}/${anio}` }
}
