// LA SOLAPA «RECIBOS» DEL LEGAJO — une en una lista lo que hasta hoy vivía en dos lugares.
//
// Dueño, 30/09/2026: «una sección exclusiva que diga recibos (ahí deben ir los blancos y los firmados)».
// Los blancos eran PDF sueltos dentro de «Documentos» (categoría del legajo) y los emitidos por la app
// estaban en «Retribución», con el ciclo de firma. Nadie los encontraba juntos.
//
// ═══ REGLA DE LOS DOS ORÍGENES (decidida acá, no heredada) ═══
//
// · `estudio`: el recibo de sueldo en blanco que liquida el estudio contable (PDF en Drive). Entran TODOS.
// · `liquidacion`: el recibo que emite la app desde Liquidación. Entran SÓLO los firmados (teléfono, papel
//   con foto o papel sin foto): uno sin firmar es un borrador de trabajo y se sigue gestionando en Retribución.
//
// NO SE DEDUPLICAN ENTRE ORÍGENES aunque coincidan en quincena: son dos papeles distintos (el del estudio es
// el formal al banco; el de la app suma el efectivo y es lo que la persona firma al cobrar). Fundirlos
// escondería uno de los dos. Sí se evita el doble dentro del origen `estudio`: el mismo archivo de Drive
// vinculado dos veces al legajo (clave = archivo).
// Los firmados de la app NO se deduplican por quincena: una reemisión firmada también se entregó.
//
// Nada de esto toca importes para quien no liquida: el que llama decide `puedeVer` y este módulo sólo ordena.

import { estaFirmado } from '../../../shared/recibo/ciclo.ts'
import type { ReciboEnElLegajo } from './reciboEmitido.ts'

export type OrigenDelRecibo = 'estudio' | 'liquidacion'

/** Un papel en Drive del legajo (`documentacion_legajo`, tipo recibo_sueldo), ya cruzado con su línea. */
export interface ReciboDelEstudio {
  documentoId: string
  nombre: string | null
  driveFileId: string | null
  fechaDocumento: string | null
  /** `recibo_sueldo_linea.periodo` si el importador lo leyó del PDF: «Q2-08/2026» o «FINAL-08/2026». */
  periodoLinea: string | null
  neto: number | null
}

export type FilaDeRecibo =
  | {
    origen: 'estudio'; clave: string; desde: string; hasta: string
    /** «2.ª quincena 08/2026» · «Liquidación final 08/2026» · o el nombre del archivo si no se entiende. */
    rotulo: string
    neto: number | null
    driveFileId: string | null
  }
  | {
    origen: 'liquidacion'; clave: string; desde: string; hasta: string
    rotulo: string
    recibo: ReciboEnElLegajo
  }

const pad = (n: number): string => String(n).padStart(2, '0')
const ultimoDia = (anio: number, mes: number): number => new Date(Date.UTC(anio, mes, 0)).getUTCDate()

interface Periodo { desde: string; hasta: string; rotulo: string }

/** «Q2-08/2026» → 16 al 31/08. «FINAL-08/2026» → el mes entero, rotulado aparte. Otra cosa → null. */
export function periodoDeLinea(p: string | null): Periodo | null {
  const q = /^Q([12])-(\d{2})\/(20\d{2})$/.exec(p ?? '')
  if (q) {
    const [, n, mm, aaaa] = q
    const mes = Number(mm)
    if (mes < 1 || mes > 12) return null
    return n === '1'
      ? { desde: `${aaaa}-${mm}-01`, hasta: `${aaaa}-${mm}-15`, rotulo: `1.ª quincena ${mm}/${aaaa}` }
      : { desde: `${aaaa}-${mm}-16`, hasta: `${aaaa}-${mm}-${pad(ultimoDia(Number(aaaa), mes))}`, rotulo: `2.ª quincena ${mm}/${aaaa}` }
  }
  const f = /^FINAL-(\d{2})\/(20\d{2})$/.exec(p ?? '')
  if (f) {
    const [, mm, aaaa] = f
    if (Number(mm) < 1 || Number(mm) > 12) return null
    const fin = `${aaaa}-${mm}-${pad(ultimoDia(Number(aaaa), Number(mm)))}`
    return { desde: fin, hasta: fin, rotulo: `Liquidación final ${mm}/${aaaa}` }
  }
  return null
}

/** Mismo criterio que el importador: «Recibo 2026-08 Q2 · X.pdf» / «Liquidación final 2026-08 · X». */
export function periodoDelNombre(nombre: string | null): string | null {
  if (!nombre) return null
  const q = /(20\d{2})-(\d{2}) (Q[12])/.exec(nombre)
  if (q) return `${q[3]}-${q[2]}/${q[1]}`
  const f = /final (20\d{2})-(\d{2})/i.exec(nombre)
  return f ? `FINAL-${f[2]}/${f[1]}` : null
}

function filaDelEstudio(d: ReciboDelEstudio): FilaDeRecibo {
  // La línea (leída del PDF) manda sobre el nombre del archivo: el nombre miente (memoria «nombre de archivo miente»).
  const per = periodoDeLinea(d.periodoLinea) ?? periodoDeLinea(periodoDelNombre(d.nombre))
  // Sin período entendible NO se inventa uno: se ordena por la fecha del documento y se rotula con su nombre.
  const fecha = (d.fechaDocumento ?? '').slice(0, 10)
  return {
    origen: 'estudio',
    clave: `estudio:${d.driveFileId ?? d.documentoId}`,
    desde: per?.desde ?? fecha, hasta: per?.hasta ?? fecha,
    rotulo: per?.rotulo ?? d.nombre ?? 'Recibo sin período',
    neto: d.neto, driveFileId: d.driveFileId,
  }
}

/** El rótulo de la quincena de un recibo de la app: «01/09 al 15/09/2026». */
const rotuloQuincena = (desde: string, hasta: string): string =>
  `${desde.slice(8, 10)}/${desde.slice(5, 7)} al ${hasta.slice(8, 10)}/${hasta.slice(5, 7)}/${hasta.slice(0, 4)}`

export function unirRecibos(p: { estudio: ReciboDelEstudio[]; emitidos: ReciboEnElLegajo[] }): FilaDeRecibo[] {
  const vistos = new Set<string>()
  const filas: FilaDeRecibo[] = []
  for (const d of p.estudio) {
    const f = filaDelEstudio(d)
    if (vistos.has(f.clave)) continue
    vistos.add(f.clave)
    filas.push(f)
  }
  for (const r of p.emitidos) {
    if (!estaFirmado(r)) continue
    filas.push({
      origen: 'liquidacion', clave: `liquidacion:${r.id}`,
      desde: r.quincenaDesde, hasta: r.quincenaHasta,
      rotulo: rotuloQuincena(r.quincenaDesde, r.quincenaHasta), recibo: r,
    })
  }
  return filas.sort((a, b) =>
    b.desde.localeCompare(a.desde) || b.hasta.localeCompare(a.hasta)
    // A igual período el del estudio va primero (es el formal) y entre emitidos el más reciente.
    || (a.origen === b.origen ? 0 : a.origen === 'estudio' ? -1 : 1)
    || (a.origen === 'liquidacion' && b.origen === 'liquidacion' ? b.recibo.emitidoEn.localeCompare(a.recibo.emitidoEn) : 0))
}
