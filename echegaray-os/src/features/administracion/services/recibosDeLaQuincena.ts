// «MÁS → RECIBOS»: EL RECIBO DEL ESTUDIO DE CADA PERSONA CONTRA EL BANCO QUE PUBLICA EL CUADRO.
//
// Dueño, 14/09/2026: *«la sección recibos de liquidación de hs no está mejorada, rota»*; lo que pide
// es ver y abrir el recibo de sueldo de cada persona en la quincena elegida. Puro: sin base, sin JSX.
//
// ═══ UN SOLO «BANCO» EN LAS DOS PANTALLAS ═══
//
// La plata sale de la línea de `getLiquidacionDeLaQuincena` —la misma del cuadro—: `reciboNeto`,
// `porBanco`, `reciboSinGiro`, `blancoAcuerdo`. Esta pantalla no vuelve a buscar el giro por su
// cuenta: la vez que lo hizo usó otro concepto (`'sueldo'`) y marcaba «sin movimiento» a todo el
// plantel mientras el cuadro lo daba por pagado.
//
// ═══ NUNCA $0 ═══
//
// Sin recibo del estudio la fila dice «sin recibo del estudio»; con PDF pero sin importe publicado,
// «sin importe publicado» (la regla de `lecturaDeRecibo` en «Mis recibos»). Ninguno es un cero.

import { periodoDelNombre } from '../../empleado/services/periodoDelRecibo.ts'
import type { GrupoLiquidacion } from './liquidacionQuincena.ts'
import type { Quincena } from './quincena.ts'

const r2 = (n: number): number => Math.round(n * 100) / 100

/** Lo que Recibos lee de una línea de la liquidación. Es un subconjunto de `LineaConOverrides`. */
export interface LineaParaRecibo {
  personaId: string
  nombre: string
  reciboNeto: number | null
  porBanco: number
  reciboSinGiro: boolean
  blancoAcuerdo: number | null
  sinTarifa: boolean
  cobra: number | null
}

/**
 *   girado            hay recibo y el extracto muestra el giro: el banco del cuadro es el recibo.
 *   recibo-sin-giro   hay recibo y el extracto no lo muestra: pendiente accionable (ámbar).
 *   sin-importe       hay PDF del recibo pero no un neto publicado: se abre, no se acusa.
 *   sin-recibo        el estudio no mandó recibo de esta persona para esta quincena.
 *   sin-extracto      hay recibo pero no hay movimientos bancarios importados: no se puede afirmar nada.
 */
export type EstadoDeRecibo = 'girado' | 'recibo-sin-giro' | 'sin-importe' | 'sin-recibo' | 'sin-extracto'

export interface FilaDeRecibo {
  personaId: string
  nombre: string
  grupo: GrupoLiquidacion
  reciboNeto: number | null
  /** El banco que publica el cuadro, el mismo número. */
  porBanco: number
  /** porBanco − reciboNeto. `null` sin recibo: no hay contra qué comparar. */
  diferencia: number | null
  blancoAcuerdo: number | null
  estado: EstadoDeRecibo
  driveFileId: string | null
  /** Para el pie: el cuadro no suma a la plata a quien no tiene tarifa. */
  sumaAlBanco: boolean
}

/** Los PDF de recibo de sueldo de la quincena, por persona. Una fila por persona: la primera con archivo. */
export function archivosDeLaQuincena(
  docs: readonly { persona_id: string | null; nombre: string | null; drive_file_id: string | null }[],
  q: Quincena,
): Map<string, string> {
  const periodo = q.desde.slice(0, 7)
  const quincena = Number(q.desde.slice(8, 10)) === 1 ? '1' : '2'
  const out = new Map<string, string>()
  for (const d of docs) {
    if (!d.persona_id || !d.drive_file_id || out.has(d.persona_id)) continue
    const p = periodoDelNombre(d.nombre)
    if (p && p.periodo === periodo && p.quincena === quincena) out.set(d.persona_id, d.drive_file_id)
  }
  return out
}

export interface ReciboFueraDelCuadro {
  personaId: string
  /** Del nombre del archivo («Recibo 2026-08 Q2 · APELLIDO NOMBRE.pdf» → «APELLIDO NOMBRE»). */
  nombre: string
  driveFileId: string
}

/**
 * LOS RECIBOS DE LA QUINCENA DE PERSONAS QUE NO ESTÁN EN SU CUADRO: bajas, liquidaciones finales o
 * quien no tuvo línea. Existen y se tienen que poder abrir.
 *
 * Captura del 14/09/2026: la tabla sólo armaba filas desde la liquidación y mostraba 14 enlaces de los
 * 19 PDF de 2026-08 Q2. El nombre sale del archivo porque la persona puede no estar en el legajo
 * activo que lee la pantalla.
 */
export function recibosFueraDelCuadro(
  docs: readonly { persona_id: string | null; nombre: string | null; drive_file_id: string | null }[],
  q: Quincena, conLinea: ReadonlySet<string>,
): ReciboFueraDelCuadro[] {
  const nombres = new Map(docs.map((d) => [d.persona_id, d.nombre]))
  return [...archivosDeLaQuincena(docs, q)]
    .filter(([personaId]) => !conLinea.has(personaId))
    .map(([personaId, driveFileId]) => ({
      personaId,
      driveFileId,
      nombre: (nombres.get(personaId) ?? '').split('·').slice(1).join('·').replace(/\.pdf$/i, '').trim() || 'sin nombre en el archivo',
    }))
}

export function filasDeRecibos(
  lineas: readonly { grupo: GrupoLiquidacion; linea: LineaParaRecibo }[],
  ctx: { hayExtracto: boolean; archivos: ReadonlyMap<string, string> },
): FilaDeRecibo[] {
  return lineas.map(({ grupo, linea: l }) => {
    const driveFileId = ctx.archivos.get(l.personaId) ?? null
    const estado: EstadoDeRecibo = l.reciboNeto == null
      ? (driveFileId ? 'sin-importe' : 'sin-recibo')
      : !ctx.hayExtracto ? 'sin-extracto'
        : l.reciboSinGiro ? 'recibo-sin-giro' : 'girado'
    return {
      personaId: l.personaId,
      nombre: l.nombre,
      grupo,
      reciboNeto: l.reciboNeto,
      porBanco: l.porBanco,
      diferencia: l.reciboNeto == null ? null : r2(l.porBanco - l.reciboNeto),
      blancoAcuerdo: l.blancoAcuerdo,
      estado,
      driveFileId,
      sumaAlBanco: !(l.sinTarifa || l.cobra == null),
    }
  })
}

export interface TotalesDeRecibos {
  /** Suma de los netos que liquidó el estudio. */
  recibos: number
  /** El mismo número que el pie del cuadro: sólo las filas que el cuadro suma a la plata. */
  porBanco: number
  /** Recibos que el extracto todavía no muestra girados. */
  sinGiro: number
  conRecibo: number
  conPdf: number
  personas: number
}

export function totalesDeRecibos(filas: readonly FilaDeRecibo[]): TotalesDeRecibos {
  let recibos = 0, porBanco = 0, sinGiro = 0, conRecibo = 0, conPdf = 0
  for (const f of filas) {
    if (f.reciboNeto != null) { recibos += f.reciboNeto; conRecibo++ }
    if (f.driveFileId) conPdf++
    if (f.estado === 'recibo-sin-giro') sinGiro += f.reciboNeto ?? 0
    // EL MISMO CRITERIO QUE `totalesDelEspejo`: sin tarifa no suma a la plata del pie.
    if (f.sumaAlBanco) porBanco += f.porBanco
  }
  return { recibos: r2(recibos), porBanco: r2(porBanco), sinGiro: r2(sinGiro), conRecibo, conPdf, personas: filas.length }
}

/** El único aviso de la pantalla: cuando el estudio no mandó NINGÚN recibo de la quincena. */
export function avisoDeRecibos(filas: readonly FilaDeRecibo[], rotulo: string): string | null {
  if (filas.length === 0) return null
  if (filas.some((f) => f.reciboNeto != null || f.driveFileId)) return null
  return `El estudio todavía no mandó los recibos de ${rotulo} (0 de ${filas.length}).`
}
