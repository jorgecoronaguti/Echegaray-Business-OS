// LAS COLUMNAS DE «NOVEDADES PARA EL ESTUDIO», UNA SOLA VEZ: el Excel y el PDF las leen de acá.
//
// Si cada formato armara su lista, el PDF y la planilla que recibe el estudio terminarían con rótulos u orden
// distintos para la misma quincena. Acá sólo se decide QUÉ columna es y de dónde sale su valor y su total;
// cómo se dibuja es cosa de cada formato.

import type { FilaDeNovedades, ReporteDeNovedades, SeccionNovedad } from './novedadesParaElEstudio.ts'

export type Valor = string | number | null

export interface ColumnaDeSalida {
  titulo: string
  tipo: 'texto' | 'horas' | 'dias' | 'plata'
  valor: (f: FilaDeNovedades) => Valor
  /** Va en la hoja resumen del PDF; las demás (una por concepto) van en el detalle. */
  resumen: boolean
  /** Un renglón de concepto del recibo (no un subtotal): va en las tablas de detalle del PDF. */
  concepto?: true
}

const texto = (titulo: string, valor: (f: FilaDeNovedades) => Valor): ColumnaDeSalida =>
  ({ titulo, tipo: 'texto', valor, resumen: true })
const num = (titulo: string, tipo: 'horas' | 'dias' | 'plata', valor: (f: FilaDeNovedades) => Valor, resumen = true): ColumnaDeSalida =>
  ({ titulo, tipo, valor, resumen })

const ROTULO: Record<SeccionNovedad, string> = { remunerativo: 'Rem.', no_remunerativo: 'No rem.', descuento: 'Desc.' }

export function columnasDeSalida(r: ReporteDeNovedades): ColumnaDeSalida[] {
  const deSeccion = (s: SeccionNovedad, subtotal: ColumnaDeSalida): ColumnaDeSalida[] => [
    ...r.columnas.filter((c) => c.seccion === s).map((c) =>
      ({ ...num(`${ROTULO[s]} ${c.codigo} ${c.descripcion}`, 'plata', (f) => f.importes[c.clave] ?? null, false), concepto: true as const })),
    subtotal,
  ]
  return [
    texto('Legajo', (f) => f.legajo),
    texto('Apellido y nombre', (f) => f.apellidoYNombre),
    texto('CUIL', (f) => f.cuil),
    texto('Categoría', (f) => f.categoria),
    texto('Obra', (f) => f.obra),
    num('Días trabajados', 'dias', (f) => f.diasTrabajados),
    num('Hs normales', 'horas', (f) => f.horasNormales),
    num('Hs extra 50%', 'horas', (f) => f.horasExtra50),
    num('Hs extra 100%', 'horas', (f) => f.horasExtra100),
    num('Hs trabajadas', 'horas', (f) => f.horasTrabajadas, false),
    num('Días ausencia', 'dias', (f) => f.diasAusencia),
    num('Ausencias sin motivo', 'dias', (f) => f.diasAusenciaSinMotivo, false),
    num('Días licencia', 'dias', (f) => f.diasLicencia),
    num('Hs licencia', 'horas', (f) => f.horasLicencia, false),
    texto('Origen del importe', (f) => (f.origen === 'recibo' ? 'Recibo del estudio' : 'Estimado')),
    ...deSeccion('remunerativo', num('Total remunerativo', 'plata', (f) => f.totalRemunerativo)),
    ...deSeccion('no_remunerativo', num('Total no remunerativo', 'plata', (f) => f.totalNoRemunerativo)),
    ...deSeccion('descuento', num('Total descuentos', 'plata', (f) => f.totalDescuentos)),
    num('Sueldo bruto estimado', 'plata', (f) => f.sueldoBruto, false),
    num('Neto estimado', 'plata', (f) => f.neto),
  ]
}

/**
 * EL TOTAL DEL PIE ES LA SUMA DE LA COLUMNA QUE SE VE. Una sola cuenta para las dos salidas: el pie del Excel y
 * el del PDF no pueden separarse de las filas de arriba. Un renglón sin número (regla dudosa) no suma.
 */
export function totalDeColumna(r: ReporteDeNovedades, c: ColumnaDeSalida): number | null {
  if (c.tipo === 'texto') return null
  const t = r.filas.reduce((a, f) => a + (Number(c.valor(f)) || 0), 0)
  return Math.round(t * 100) / 100
}

const fechaAR = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** La línea del período, igual en el Excel y en el PDF. */
export const lineaDelPeriodo = (r: ReporteDeNovedades): string =>
  `Período: ${fechaAR(r.periodo.desde)} al ${fechaAR(r.periodo.hasta)} · Emitido el ${fechaAR(r.emision)}`
  + (r.feriadosDeLaQuincena == null ? '' : ` · Feriados en la quincena: ${r.feriadosDeLaQuincena}`)
