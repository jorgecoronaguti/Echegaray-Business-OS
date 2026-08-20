// RECIBOS — el OS no calcula sueldo. Publica lo que la liquidación publica, y dice cuándo no hay.
//
// ═══ QUÉ ES REAL HOY, Y QUÉ NO ═══
//
// EL PDF ES REAL: 652 recibos en `documentacion_legajo`, de 60 personas, con el período escrito en
// el nombre del archivo («Recibo 2026-07 Q1 · APELLIDO NOMBRE.pdf»). Esa pantalla funciona.
//
// LOS NÚMEROS NO EXISTEN todavía. `jornales_quincena` es el agregado de la quincena entera y
// `nomina_por_mes` el del mes: ninguno baja a la persona. Por eso `recibo_empleado` nace vacía y
// esta pantalla escribe «todavía no liquidado» en vez de un neto.
//
// LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO: nunca $ 0 por falta de dato. Un cero es una afirmación
// —«no cobraste nada»— y la ausencia de la liquidación no afirma eso. Se dice que falta.

import type { MiRecibo } from '../types'

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** `2026-07` + `1` → `Julio 2026 · 1ª quincena`. Cuando el nombre no traía período se dice que la
 *  fecha es la del archivo, no se inventa una quincena. */
export function etiquetaDePeriodo(r: Pick<MiRecibo, 'periodo' | 'quincena' | 'periodo_cierto'>): string {
  if (!r.periodo) return 'Período sin identificar'
  const [a, m] = r.periodo.split('-')
  const nombre = MES[Number(m) - 1]
  const base = nombre ? `${nombre[0].toUpperCase()}${nombre.slice(1)} ${a}` : r.periodo
  const quincena = r.quincena ? ` · ${r.quincena}ª quincena` : ''
  return r.periodo_cierto ? `${base}${quincena}` : `${base} (según la fecha del archivo)`
}

/** Lo más reciente arriba. Dentro del mismo mes, la 2ª quincena antes que la 1ª. */
export function ordenar(recibos: MiRecibo[]): MiRecibo[] {
  return [...recibos].sort((a, b) => {
    const p = (b.periodo ?? '').localeCompare(a.periodo ?? '')
    if (p !== 0) return p
    return (b.quincena ?? '').localeCompare(a.quincena ?? '')
  })
}

export interface LecturaDeRecibo {
  /** El neto formateado, o `null` cuando no hay liquidación. NUNCA `$ 0`. */
  neto: string | null
  /** Lo que se escribe en lugar del neto cuando no hay. */
  falta: string
  estado: string
  tono: 'pos' | 'warn' | 'nulo'
  /** ¿Se puede abrir el PDF? Es lo único que hoy existe siempre. */
  hayPdf: boolean
}

export function lecturaDeRecibo(r: MiRecibo): LecturaDeRecibo {
  const hayPdf = Boolean(r.drive_file_id)
  if (!r.liquidado) {
    return {
      neto: null,
      falta: 'sin importe publicado',
      estado: hayPdf ? 'Recibo disponible' : 'Todavía no liquidado',
      tono: hayPdf ? 'nulo' : 'warn',
      hayPdf,
    }
  }
  return {
    neto: r.neto == null ? null : pesos(r.neto),
    falta: 'sin importe publicado',
    estado: r.estado_pago === 'pagado'
      ? (r.fecha_pago ? `Pagado el ${dm(r.fecha_pago)}` : 'Pagado')
      : 'Pendiente de pago',
    tono: r.estado_pago === 'pagado' ? 'pos' : 'warn',
    hayPdf,
  }
}

/** es-AR: punto de miles, coma de decimales, y el símbolo separado del número. */
export function pesos(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function dm(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return d ? `${d}/${m}/${a}` : iso
}
