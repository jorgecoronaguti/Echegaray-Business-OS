// LA CAJA DE ANALÍTICAS ES LA PESTAÑA CAJA — leída de su espejo, no recalculada.
//
// El dueño (18/09/2026): «la sección caja que muestra analíticas tiene que ser un reflejo fiel de lo
// que muestra la pestaña caja de sheet flujo de fondos, manda todo a supabase en tiempo real para que
// se lea de ahí». Acá no hay un número calculado por la app: cada celda llega con el TEXTO que la
// pestaña muestra (`$80.072.343`, `U$S 507,53`, `(12.293.790)`, `—`) y se dibuja ese texto. El número
// que viaja al lado sirve para medir una barra, nunca para reescribir el texto.
//
// Lo que sí calcula la app es lo que el dueño pidió conservar —«me gusta lo de marcar lo que se está
// gastando»—: el destino de cada egreso (obra / estructura / sin destino), que ahora sale de
// `caja_egreso_percibido` por FECHA DE CAJA (criterio percibido) y se recorta con el filtro de fechas.
//
// Rutas relativas con extensión: `node --test` no resuelve el alias `@/`.
import { destinoDe, type Egreso } from './empresa.ts'

export interface CeldaCaja { texto: string; numero: number | null; fecha: string | null }
export interface TarjetaCaja { clave: string; rotulo: string; valor: CeldaCaja; contexto: string }
export interface FilaTabla { clave: string; fila: number; celdas: CeldaCaja[] }
export type SeccionCaja =
  | { clave: string; numero: number; titulo: string; forma: 'tabla'; encabezados: string[]; filas: FilaTabla[] }
  | { clave: string; numero: number; titulo: string; forma: 'lista'; items: { fila: number; texto: string }[] }
export interface SerieCaja { nombre: string; tipo: string | null; eje: string | null; punteada: boolean; valores: (number | null)[] }
export interface GraficoCaja {
  id: string; titulo: string; subtitulo: string; tipo: string | null; apilado: string | null; fila: number
  dominio: string[]; series: SerieCaja[]
}
export interface FotoCaja {
  portada: { titulo: string; tarjetas: TarjetaCaja[] }
  secciones: SeccionCaja[]
  graficos: GraficoCaja[]
  tipoCambioUsd: number | null
  /** Primera vez que el espejo vio este contenido. */
  leidaEn: string
  /** Última vez que CAJA seguía mostrando exactamente esto. */
  verificadaEn: string
  versionDrive: string | null
  ultimoIntentoEn: string | null
  ultimoIntentoOk: boolean | null
  ultimoError: string | null
}

/**
 * LOS CUATRO ESTADOS DE LA LECTURA, y ninguno se dibuja como otro:
 *   · `foto`        — hay espejo y hay foto: se muestra CAJA.
 *   · `sin_foto`    — el espejo existe pero todavía no guardó ninguna foto (o el sync falló siempre).
 *   · `sin_espejo`  — la migración del espejo no está aplicada en esta base: la app salió antes.
 *   · `no_leida`    — la consulta falló por otra causa (permiso, red).
 */
export type LecturaCaja =
  | { estado: 'foto'; foto: FotoCaja }
  | { estado: 'sin_foto'; error: string | null }
  | { estado: 'sin_espejo' }
  | { estado: 'no_leida' }

const str = (v: unknown): string => (v == null ? '' : String(v))
const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const celda = (v: unknown): CeldaCaja => {
  const r = (v ?? {}) as Record<string, unknown>
  return { texto: str(r.texto), numero: num(r.numero), fecha: typeof r.fecha === 'string' ? r.fecha : null }
}

/** La fila de `caja_sheet_vigente` → la foto. `null` si no tiene la forma (no se dibuja a medias). */
export function leerFotoCaja(fila: unknown): FotoCaja | null {
  const r = (fila ?? {}) as Record<string, unknown>
  const portada = (r.portada ?? {}) as Record<string, unknown>
  const tarjetas = Array.isArray(portada.tarjetas) ? portada.tarjetas : null
  if (!tarjetas?.length || typeof r.verificada_en !== 'string') return null
  const secciones = (Array.isArray(r.secciones) ? r.secciones : []).flatMap((s): SeccionCaja[] => {
    const x = (s ?? {}) as Record<string, unknown>
    const base = { clave: str(x.clave), numero: Number(x.numero ?? 0), titulo: str(x.titulo) }
    if (x.forma === 'tabla') {
      return [{
        ...base, forma: 'tabla',
        encabezados: (Array.isArray(x.encabezados) ? x.encabezados : []).map(str),
        filas: (Array.isArray(x.filas) ? x.filas : []).map((f) => {
          const y = (f ?? {}) as Record<string, unknown>
          return { clave: str(y.clave), fila: Number(y.fila ?? 0), celdas: (Array.isArray(y.celdas) ? y.celdas : []).map(celda) }
        }),
      }]
    }
    if (x.forma === 'lista') {
      return [{ ...base, forma: 'lista', items: (Array.isArray(x.items) ? x.items : []).map((i) => { const y = (i ?? {}) as Record<string, unknown>; return { fila: Number(y.fila ?? 0), texto: str(y.texto) } }) }]
    }
    return []
  })
  const graficos = (Array.isArray(r.graficos) ? r.graficos : []).map((g): GraficoCaja => {
    const x = (g ?? {}) as Record<string, unknown>
    return {
      id: str(x.id), titulo: str(x.titulo), subtitulo: str(x.subtitulo),
      tipo: typeof x.tipo === 'string' ? x.tipo : null, apilado: typeof x.apilado === 'string' ? x.apilado : null, fila: Number(x.fila ?? 0),
      dominio: (Array.isArray(x.dominio) ? x.dominio : []).map(str),
      series: (Array.isArray(x.series) ? x.series : []).map((s) => {
        const y = (s ?? {}) as Record<string, unknown>
        return { nombre: str(y.nombre), tipo: typeof y.tipo === 'string' ? y.tipo : null, eje: typeof y.eje === 'string' ? y.eje : null, punteada: y.punteada === true, valores: (Array.isArray(y.valores) ? y.valores : []).map(num) }
      }),
    }
  })
  return {
    portada: { titulo: str(portada.titulo), tarjetas: tarjetas.map((t) => { const y = (t ?? {}) as Record<string, unknown>; return { clave: str(y.clave), rotulo: str(y.rotulo), valor: celda(y.valor), contexto: str(y.contexto) } }) },
    secciones, graficos, tipoCambioUsd: num(r.tipo_cambio_usd),
    leidaEn: typeof r.leida_en === 'string' ? r.leida_en : r.verificada_en,
    verificadaEn: r.verificada_en, versionDrive: r.version_drive == null ? null : str(r.version_drive),
    ultimoIntentoEn: typeof r.ultimo_intento_en === 'string' ? r.ultimo_intento_en : null,
    ultimoIntentoOk: typeof r.ultimo_intento_ok === 'boolean' ? r.ultimo_intento_ok : null,
    ultimoError: r.ultimo_error == null ? null : str(r.ultimo_error),
  }
}

/** El espejo promete 10 minutos (sonda de 1 min + timer de 10). Pasado el doble, la foto se declara vieja. */
export const MINUTOS_DE_FRESCURA = 20

/** Cuántos minutos hace que CAJA no se confirma, y qué decir si es demasiado o si el último intento falló. */
export function frescura(foto: FotoCaja, ahoraISO: string): { minutos: number; aviso: string | null } {
  const minutos = Math.max(0, Math.round((Date.parse(ahoraISO) - Date.parse(foto.verificadaEn)) / 60000))
  if (foto.ultimoIntentoOk === false) return { minutos, aviso: `el espejo no pudo leer CAJA en su último intento${foto.ultimoError ? `: ${foto.ultimoError}` : ''}` }
  if (minutos > MINUTOS_DE_FRESCURA) return { minutos, aviso: `CAJA no se confirma desde hace ${minutos} min` }
  return { minutos, aviso: null }
}

const PARTES = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/San_Juan', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

/** `18/09 14:05` en hora de San Juan. */
export function horaSanJuan(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = Object.fromEntries(PARTES.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`
}

export interface EgresosPercibidos {
  egresos: Egreso[]
  /** Pagos sin fecha (un «Monto Parcial 2» sin su fecha): no se pueden ubicar en un mes y quedan afuera, declarados. */
  pagosSinFecha: { n: number; total: number }
  /** Compras «Pagado» sin monto cargado en Compras: se listan con su total, no se suman como salida. */
  sinDesglose: { n: number; total: number }
  /** Deuda del período (saldo pendiente a su fecha prevista): no salió, no se marca. */
  pendientes: { n: number; total: number }
}

/**
 * LO QUE SALIÓ, CADA PAGO EN SU FECHA. Filas de `caja_egreso_percibido`, ya recortadas por período en la
 * base. Sólo `naturaleza = 'pago'` es egreso; `sin_desglose` y `pendiente` se cuentan aparte.
 */
export function egresosPercibidos(filas: unknown[]): EgresosPercibidos {
  const out: EgresosPercibidos = { egresos: [], pagosSinFecha: { n: 0, total: 0 }, sinDesglose: { n: 0, total: 0 }, pendientes: { n: 0, total: 0 } }
  for (const f of filas) {
    const r = f as Record<string, unknown>
    const monto = num(r.monto)
    if (monto == null) continue
    const naturaleza = String(r.naturaleza ?? '')
    if (naturaleza === 'pendiente') { out.pendientes.n++; out.pendientes.total += monto; continue }
    if (naturaleza === 'sin_desglose') { out.sinDesglose.n++; out.sinDesglose.total += monto; continue }
    if (naturaleza !== 'pago') continue
    const fecha = typeof r.fecha_pago === 'string' && r.fecha_pago.length >= 7 ? r.fecha_pago : null
    if (!fecha) { out.pagosSinFecha.n++; out.pagosSinFecha.total += monto; continue }
    const area = typeof r.area === 'string' ? r.area : null
    out.egresos.push({ area, grupo: destinoDe(area), total: monto, mes: fecha.slice(0, 7) })
  }
  return out
}
