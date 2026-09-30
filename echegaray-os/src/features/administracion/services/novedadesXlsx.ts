// «NOVEDADES PARA EL ESTUDIO» EN EXCEL (.xlsx).
//
// Un .xlsx y no un .csv: los importes van como NÚMEROS con formato (el estudio los suma y los pega en su
// sistema sin reescribir comas) y los CUIL como texto (un CUIL numérico pierde ceros y se vuelve notación
// científica). Google Sheets lo abre y lo convierte en una planilla propia: por eso no hay un «formato Sheet»
// aparte, y el OS no crea nada en el Drive de la empresa sin que el dueño lo pida.
//
// Una sola hoja con DOS SECCIONES (OBREROS y OFICINA, como en Liquidación de horas), cada una con su
// encabezado y su subtotal, y el TOTAL GENERAL al final. Arriba, el logo de la empresa sobre filas en blanco.

import * as XLSX from 'xlsx'
import { xlsxConLogo } from '../../../shared/exportar/xlsxConLogo.ts'
import { columnasDeSalida, lineaDelPeriodo, totalDeColumna, type ColumnaDeSalida } from './novedadesColumnas.ts'
import type { FilaDeNovedades, ReporteDeNovedades } from './novedadesParaElEstudio.ts'

const FORMATO: Record<ColumnaDeSalida['tipo'], string | null> = { texto: null, horas: '#,##0.00', dias: '0', plata: '#,##0.00' }

/** Filas en blanco para el logo: 4 × 18 pt = 72 pt = 96 px, y el logo mide 88 px para dejar aire. */
const FILAS_DEL_LOGO = 4
const ALTO_FILA_LOGO_PT = 18
const ALTO_LOGO_PX = 88

const cuenta = (n: number): string => `${n} ${n === 1 ? 'persona' : 'personas'}`
type Celda = string | number | null

const filaTotales = (cols: ColumnaDeSalida[], rotulo: string, personas: string, filas: readonly FilaDeNovedades[]): Celda[] =>
  cols.map((c, i) => (i === 0 ? rotulo : c.titulo === 'Apellido y nombre' ? personas : totalDeColumna(filas, c)))

export function xlsxDeNovedades(r: ReporteDeNovedades): Uint8Array {
  const cols = columnasDeSalida(r)
  const filas: Celda[][] = Array.from({ length: FILAS_DEL_LOGO }, () => [])
  const conFormato: number[] = []
  filas.push([r.titulo], [`${r.empleador.razonSocial} · CUIT ${r.empleador.cuit}`], [lineaDelPeriodo(r)], [r.leyenda], [])
  for (const s of r.secciones) {
    filas.push([`${s.titulo} · ${cuenta(s.filas.length)}`], cols.map((c) => c.titulo))
    for (const f of s.filas) { conFormato.push(filas.length); filas.push(cols.map((c) => c.valor(f))) }
    conFormato.push(filas.length)
    filas.push(filaTotales(cols, `Subtotal ${s.titulo}`, cuenta(s.filas.length), s.filas), [])
  }
  conFormato.push(filas.length)
  filas.push(filaTotales(cols, 'TOTAL GENERAL', cuenta(r.filas.length), r.filas))

  const ws = XLSX.utils.aoa_to_sheet(filas)
  // Formato celda por celda: sólo las numéricas. Las de texto quedan como texto (CUIL, legajo).
  cols.forEach((c, j) => {
    const z = FORMATO[c.tipo]
    if (!z) return
    for (const i of conFormato) {
      const celda = ws[XLSX.utils.encode_cell({ r: i, c: j })]
      if (celda && celda.t === 'n') celda.z = z
    }
  })
  ws['!cols'] = cols.map((c) => ({ wch: c.tipo === 'texto' ? Math.max(12, c.titulo.length + 2) : Math.max(11, Math.min(c.titulo.length, 24)) }))
  ws['!rows'] = Array.from({ length: FILAS_DEL_LOGO }, () => ({ hpt: ALTO_FILA_LOGO_PT }))
  const wb = XLSX.utils.book_new()
  const q = r.periodo.texto.startsWith('PRIMERA') ? 1 : 2
  XLSX.utils.book_append_sheet(wb, ws, `Q${q} ${r.periodo.desde.slice(5, 7)}-${r.periodo.desde.slice(0, 4)}`)
  const base = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
  return xlsxConLogo(base, ALTO_LOGO_PX)
}
