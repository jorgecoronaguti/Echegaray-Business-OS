// «NOVEDADES PARA EL ESTUDIO» — el papel de la quincena que se le manda al contador.
//
// Dueño, 29/09/2026: un exportable por quincena, con los horarios de cada empleado y la liquidación estimada de
// sus conceptos remunerativos y no remunerativos, para los contadores. El estudio liquida el sueldo; lo que
// necesita de nosotros son las NOVEDADES (quién, qué categoría, qué días y horas, qué ausencias) y, como
// referencia, lo que el panel estima.
//
// ═══ SÓLO EL BLANCO, Y POR CONSTRUCCIÓN ═══
//
// Este módulo no lee el efectivo, los adelantos, los pagos ni el Banco del panel: de la liquidación
// toma únicamente lo que ya pasa por `reciboFormatoContador` (reciboEstimado / conceptosReales / totalesReales).
// No hay forma de que el negro entre porque el tipo de entrada no lo trae. Tampoco se copian los `avisos` del
// recibo: comparan contra el Banco del panel y no son para el estudio.
//
// ═══ DOS SECCIONES, COMO EN LIQ. DE HS (dueño, 30/09/2026) ═══
//
// «Rehacé lo del envío a los contadores: la lista de empleados, hs, legajo, categoría y valor hora, total de hs a
// considerar y si le corresponde presentismo. Distinguí obreros de oficina, tal como en Liq. hs, y a esos les
// ponés lo que les corresponde por recibo.» La separación es `linea`/`grupo` del cuadro (`FilaDelEspejo.grupo`),
// la MISMA que dibuja la pantalla: no se re-deriva por rol ni por tarifa. Las liquidaciones finales (gente que ya
// se fue) no van: el dueño las excluyó de la quincena y del costo de mano de obra.
//
// ═══ NADIE SE OMITE POR NO TENER RECIBO ═══
//
// Antes quien no tenía blanco por conceptos quedaba fuera. Ahora el pedido ES la lista de empleados: la persona
// entra con su legajo, categoría, $/h, horas y presentismo, y los importes quedan vacíos con origen «Sin recibo».
// El dueño ve cuántas son en `sinRecibo` y el archivo no inventa un número para ellas.
//
// ═══ CATEGORÍA Y $/H: LOS DEL RECIBO ═══
//
// El blanco usa la categoría, el $/h y las horas del último recibo real (`categoriaRecibo`). Sólo si la persona
// nunca tuvo recibo cae a la del legajo, y la fila lo marca (`categoriaDelLegajo`) para que el estudio no la
// tome por la del recibo.
//
// ═══ NADA SE RECALCULA ═══
//
// Los importes son los renglones del recibo; los subtotales, los del recibo. Las únicas sumas propias son los
// totales del pie (suma de lo que ya está en cada fila) y el conteo de días/horas de las celdas de la grilla.

import { compararPorApellido } from '../../../shared/personas/nombre.ts'
import type { FilaDelEspejo } from './espejoDeJornales.ts'
import type { PresentismoDeLinea } from './presentismo.ts'
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

/** Los dos cuadros que viajan al estudio. `final` (liquidaciones finales) no es parte de la quincena. */
export type GrupoDeNovedades = 'obreros' | 'oficina'

/**
 * «Sí» cumple (0425 sin 0426), «No» perdido (0426, por tardanzas). «No aplica»: oficina (mensual) o quincena
 * anterior al 16/09. «Sin dato»: sin horas o sin categoría y el recibo no lo dice.
 */
export type TextoDePresentismo = 'Sí' | 'No' | 'No aplica' | 'Sin dato'

export interface FilaDeNovedades {
  personaId: string
  grupo: GrupoDeNovedades
  legajo: string | null
  apellidoYNombre: string
  cuil: string | null
  /** La del RECIBO; sin recibo previo, la del legajo (y `categoriaDelLegajo` es `true`). */
  categoria: string | null
  categoriaDelLegajo: boolean
  /** El $/h del blanco: el del recibo, o el piso de la categoría del legajo si nunca hubo recibo. */
  valorHora: number | null
  obra: string | null
  /** Las horas del blanco que el recibo considera. `null` = el panel no las trae (oficina, sin sueldo). */
  horasAConsiderar: number | null
  presentismo: TextoDePresentismo
  diasTrabajados: number
  horasNormales: number
  horasExtra50: number
  horasExtra100: number
  horasTrabajadas: number
  diasAusencia: number
  diasAusenciaSinMotivo: number
  diasLicencia: number
  horasLicencia: number
  origen: 'recibo' | 'estimado' | 'sin_recibo'
  importes: Record<string, number | null>
  totalRemunerativo: number | null
  totalNoRemunerativo: number | null
  sueldoBruto: number | null
  totalDescuentos: number | null
  neto: number | null
}

export interface TotalesDeNovedades {
  personas: number
  horasAConsiderar: number
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
  /** Todas las filas, en el orden en que se escriben: primero OBREROS, después OFICINA. */
  filas: FilaDeNovedades[]
  secciones: SeccionDeNovedades[]
  totales: TotalesDeNovedades
  /** Uso interno de la pantalla: NO se escribe en el archivo. Liquidaciones finales, que no entran. */
  excluidos: number
  /** Personas en el archivo sin recibo (ni real ni estimado): van con importes vacíos. */
  sinRecibo: number
}

export interface SeccionDeNovedades {
  grupo: GrupoDeNovedades
  titulo: 'OBREROS' | 'OFICINA'
  filas: FilaDeNovedades[]
  totales: TotalesDeNovedades
}

export const LEYENDA_ESTIMADO =
  'Importes ESTIMADOS por el OS de Echegaray Construcciones con las horas cargadas de la quincena. No son la liquidación: '
  + 'el recibo oficial lo emite el estudio. Las filas con origen «Recibo del estudio» llevan los conceptos del recibo ya cargado. '
  + '* Sin recibo previo: categoría y valor hora son los del legajo del OS. '
  + 'Presentismo: Sí = cumple (concepto 0425 sin 0426); No = perdido por tardanzas (0426); rige desde la quincena 2 de 09/2026.'

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

const TITULO_DE: Record<GrupoDeNovedades, SeccionDeNovedades['titulo']> = { obreros: 'OBREROS', oficina: 'OFICINA' }
const GRUPOS: readonly GrupoDeNovedades[] = ['obreros', 'oficina']
const esGrupoDeNovedades = (g: string): g is GrupoDeNovedades => g === 'obreros' || g === 'oficina'

/**
 * SÍ / NO DEL PRESENTISMO. Lo dice `presentismo.ts` (el mismo estado que muestra la pantalla); sólo cuando el panel
 * no lo pudo evaluar y el recibo es el REAL del estudio se lee el hecho del papel: 0426 = perdido, 0425 = cumple.
 * Con estimado no se lee: el estimado ya salió de ese mismo estado y confirmarlo con él sería un control circular.
 */
export function textoDePresentismo(
  p: PresentismoDeLinea | null, origen: FilaDeNovedades['origen'], importes: Record<string, number | null>,
): TextoDePresentismo {
  if (p?.estado === 'aplica') return 'Sí'
  if (p?.estado === 'perdido') return 'No'
  if (p?.estado === 'no_aplica' || p?.estado === 'no_rige') return 'No aplica'
  if (origen === 'recibo') {
    if (importes['remunerativo:0426'] != null || importes['descuento:0426'] != null) return 'No'
    if (importes['remunerativo:0425'] != null) return 'Sí'
  }
  return 'Sin dato'
}

/** Arma el reporte. Orden: sección (obreros, oficina) y dentro apellido (el comparador único de personas). */
export function novedadesParaElEstudio(e: EntradaDeNovedades): ReporteDeNovedades {
  const columnas = new Map<string, ColumnaDeConcepto>()
  const filas: FilaDeNovedades[] = []
  let excluidos = 0
  for (const f of e.filas) {
    if (!esGrupoDeNovedades(f.grupo)) { excluidos += 1; continue }
    const s = f.linea.sueldo
    const r = reciboFormatoContador(s)
    const conRecibo = esReciboContador(r)
    const l = e.legajos.get(f.personaId)
    const importes: Record<string, number | null> = {}
    if (conRecibo) {
      for (const { x, seccion } of renglonesDe(r)) {
        const clave = `${seccion}:${x.codigo}`
        if (!columnas.has(clave)) columnas.set(clave, { clave, seccion, codigo: x.codigo, descripcion: x.descripcion })
        importes[clave] = x.monto
      }
    }
    const origen = conRecibo ? r.origen : 'sin_recibo'
    const categoriaRecibo = s?.categoriaRecibo ?? null
    filas.push({
      personaId: f.personaId, grupo: f.grupo, legajo: l?.legajo ?? null, cuil: l?.cuil ?? null, obra: l?.obra ?? null,
      apellidoYNombre: l?.nombreCompleto ?? f.nombre,
      categoria: categoriaRecibo ?? f.categoria, categoriaDelLegajo: categoriaRecibo == null,
      valorHora: conRecibo ? r.valorHora : (s?.valorHoraCategoria ?? null),
      horasAConsiderar: s?.horasBlanco ?? null,
      presentismo: textoDePresentismo(f.linea.presentismo, origen, importes),
      ...contarDias(f),
      horasNormales: f.horasPorTipo.normales, horasExtra50: f.horasPorTipo.extra50,
      horasExtra100: f.horasPorTipo.extra100, horasTrabajadas: f.horasPorTipo.total,
      origen, importes,
      totalRemunerativo: conRecibo ? r.totalRemunerativo : null, totalNoRemunerativo: conRecibo ? r.totalNoRemunerativo : null,
      sueldoBruto: conRecibo ? r.sueldoBruto : null, totalDescuentos: conRecibo ? r.totalDescuentos : null,
      // Si el recibo no cuadra el neto no se afirma (misma regla que el recibo en blanco).
      neto: conRecibo && r.cuadra ? r.neto : null,
    })
  }
  const cols = [...columnas.values()].sort((a, b) =>
    ORDEN_SECCION[a.seccion] - ORDEN_SECCION[b.seccion] || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  const secciones = GRUPOS.map((grupo): SeccionDeNovedades => {
    const suyas = filas.filter((x) => x.grupo === grupo).sort((a, b) => compararPorApellido(a.apellidoYNombre, b.apellidoYNombre))
    return { grupo, titulo: TITULO_DE[grupo], filas: suyas, totales: totalizar(suyas, cols) }
  })
  const ordenadas = secciones.flatMap((x) => x.filas)
  const p = periodoDePago(e.quincena.desde)
  return {
    empleador: { razonSocial: EMPLEADOR.razonSocial, cuit: EMPLEADOR.cuit },
    titulo: `Novedades para el estudio · ${p.texto}`,
    periodo: { desde: e.quincena.desde, hasta: e.quincena.hasta, texto: p.texto },
    emision: e.emision, feriadosDeLaQuincena: e.feriados, leyenda: LEYENDA_ESTIMADO,
    columnas: cols, filas: ordenadas, secciones, totales: totalizar(ordenadas, cols), excluidos,
    sinRecibo: ordenadas.filter((x) => x.origen === 'sin_recibo').length,
  }
}

function totalizar(filas: readonly FilaDeNovedades[], cols: readonly ColumnaDeConcepto[]): TotalesDeNovedades {
  const suma = (f: (x: FilaDeNovedades) => number | null): number => r2(filas.reduce((a, x) => a + (f(x) ?? 0), 0))
  const porConcepto: Record<string, number> = {}
  for (const c of cols) porConcepto[c.clave] = suma((x) => x.importes[c.clave] ?? null)
  return {
    personas: filas.length,
    horasAConsiderar: suma((x) => x.horasAConsiderar),
    horasNormales: suma((x) => x.horasNormales), horasExtra50: suma((x) => x.horasExtra50),
    horasExtra100: suma((x) => x.horasExtra100), horasTrabajadas: suma((x) => x.horasTrabajadas),
    diasAusencia: suma((x) => x.diasAusencia), diasLicencia: suma((x) => x.diasLicencia),
    porConcepto,
    totalRemunerativo: suma((x) => x.totalRemunerativo), totalNoRemunerativo: suma((x) => x.totalNoRemunerativo),
    sueldoBruto: suma((x) => x.sueldoBruto), totalDescuentos: suma((x) => x.totalDescuentos), neto: suma((x) => x.neto),
    filasIncompletas: filas.filter((x) => x.neto == null || Object.values(x.importes).some((m) => m == null)).length,
  }
}
