// «NOVEDADES PARA EL ESTUDIO» EN EXCEL (.xlsx).
//
// Un .xlsx y no un .csv: los importes van como NÚMEROS con formato (el estudio los suma y los pega en su
// sistema sin reescribir comas) y los CUIL como texto (un CUIL numérico pierde ceros y se vuelve notación
// científica). Google Sheets lo abre y lo convierte en una planilla propia: por eso no hay un «formato Sheet»
// aparte, y el OS no crea nada en el Drive de la empresa sin que el dueño lo pida.

import * as XLSX from 'xlsx'
import { columnasDeSalida, lineaDelPeriodo, totalDeColumna, type ColumnaDeSalida } from './novedadesColumnas.ts'
import type { ReporteDeNovedades } from './novedadesParaElEstudio.ts'

const FORMATO: Record<ColumnaDeSalida['tipo'], string | null> = { texto: null, horas: '#,##0.00', dias: '0', plata: '#,##0.00' }

export function xlsxDeNovedades(r: ReporteDeNovedades): Uint8Array {
  const cols = columnasDeSalida(r)
  const encabezado: string[][] = [
    [r.titulo],
    [`${r.empleador.razonSocial} · CUIT ${r.empleador.cuit}`],
    [lineaDelPeriodo(r)],
    [r.leyenda],
    [],
  ]
  const cuerpo = r.filas.map((f) => cols.map((c) => c.valor(f)))
  const pie = cols.map((c, i) => (i === 0 ? 'TOTALES' : totalDeColumna(r, c)))
  const ws = XLSX.utils.aoa_to_sheet([...encabezado, cols.map((c) => c.titulo), ...cuerpo, pie])
  const primera = encabezado.length + 1
  // Formato celda por celda: sólo las numéricas. Las de texto quedan como texto (CUIL, legajo).
  cols.forEach((c, j) => {
    const z = FORMATO[c.tipo]
    if (!z) return
    for (let i = primera; i <= primera + cuerpo.length; i++) {
      const celda = ws[XLSX.utils.encode_cell({ r: i, c: j })]
      if (celda && celda.t === 'n') celda.z = z
    }
  })
  ws['!cols'] = cols.map((c) => ({ wch: c.tipo === 'texto' ? Math.max(12, c.titulo.length + 2) : Math.max(11, Math.min(c.titulo.length, 24)) }))
  const wb = XLSX.utils.book_new()
  const q = r.periodo.texto.startsWith('PRIMERA') ? 1 : 2
  XLSX.utils.book_append_sheet(wb, ws, `Q${q} ${r.periodo.desde.slice(5, 7)}-${r.periodo.desde.slice(0, 4)}`)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}
