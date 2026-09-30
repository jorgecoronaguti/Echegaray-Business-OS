// «NOVEDADES PARA EL ESTUDIO» EN EXCEL (.xlsx).
//
// Un .xlsx y no un .csv: el $/h y las horas van como NÚMEROS con formato (el estudio los pega en su sistema sin
// reescribir comas) y los CUIL como texto (un CUIL numérico pierde ceros y se vuelve notación científica).
// Google Sheets lo abre y lo convierte en una planilla propia: por eso no hay un «formato Sheet» aparte.
//
// Una sola hoja con un bloque por grupo pedido (OBREROS, OFICINA), cada uno con SUS encabezados: las columnas de
// uno y otro no son las mismas. Sin totales: no hay importes que sumar, y sumar $/h no significa nada.
// Arriba, el logo de la empresa sobre filas en blanco.

import * as XLSX from 'xlsx'
import { xlsxConLogo } from '../../../shared/exportar/xlsxConLogo.ts'
import { columnasDe, lineasDelEncabezado, type ColumnaDeSalida } from './novedadesColumnas.ts'
import type { ReporteDeNovedades } from './novedadesParaElEstudio.ts'

const FORMATO: Record<ColumnaDeSalida['tipo'], string | null> = { texto: null, horas: '#,##0.00', plata: '#,##0.00' }

/** Filas en blanco para el logo: 4 × 18 pt = 72 pt = 96 px, y el logo mide 88 px para dejar aire. */
const FILAS_DEL_LOGO = 4
const ALTO_FILA_LOGO_PT = 18
const ALTO_LOGO_PX = 88

const cuenta = (n: number): string => `${n} ${n === 1 ? 'persona' : 'personas'}`
type Celda = string | number | null

export function xlsxDeNovedades(r: ReporteDeNovedades): Uint8Array {
  const filas: Celda[][] = Array.from({ length: FILAS_DEL_LOGO }, () => [])
  const formatos: { fila: number; col: number; z: string }[] = []
  const anchos: number[] = []
  filas.push([r.titulo], ...lineasDelEncabezado(r).map((l) => [l]), [r.leyenda], [])
  for (const s of r.secciones) {
    const cols = columnasDe(s.grupo)
    cols.forEach((c, j) => { anchos[j] = Math.max(anchos[j] ?? 0, Math.round(c.peso * 12)) })
    filas.push([`${s.titulo} · ${cuenta(s.filas.length)}`], cols.map((c) => c.titulo))
    for (const f of s.filas) {
      cols.forEach((c, j) => { const z = FORMATO[c.tipo]; if (z) formatos.push({ fila: filas.length, col: j, z }) })
      filas.push(cols.map((c) => c.valor(f)))
    }
    filas.push([])
  }

  const ws = XLSX.utils.aoa_to_sheet(filas)
  // Formato sólo en las celdas numéricas; las de texto quedan como texto (CUIL, legajo).
  for (const { fila, col, z } of formatos) {
    const celda = ws[XLSX.utils.encode_cell({ r: fila, c: col })]
    if (celda && celda.t === 'n') celda.z = z
  }
  ws['!cols'] = anchos.map((wch) => ({ wch: Math.max(10, wch) }))
  ws['!rows'] = Array.from({ length: FILAS_DEL_LOGO }, () => ({ hpt: ALTO_FILA_LOGO_PT }))
  const wb = XLSX.utils.book_new()
  const q = r.periodo.texto.startsWith('PRIMERA') ? 1 : 2
  XLSX.utils.book_append_sheet(wb, ws, `Q${q} ${r.periodo.desde.slice(5, 7)}-${r.periodo.desde.slice(0, 4)}`)
  const base = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
  return xlsxConLogo(base, ALTO_LOGO_PX)
}
