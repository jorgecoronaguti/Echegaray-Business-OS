// RECIBOS DE PAGO — lo que se decide sin base, sin React y sin red. Lo prueba `logica.test.ts` y lo
// importa la VM (`orquestador/scripts/recibos-a-drive.mjs`): la carpeta del legajo se define una vez.
//
// ═══ LA BASE ES LA CERRADURA; ESTO ES LA PUERTA ═══
//
// Emitir, firmar, archivar y observar los decide `20260922T1600_recibo_pago.sql` con las mismas reglas.
// Acá se repiten para que la pantalla diga ANTES por qué un botón no está, en vez de mandar el pedido y
// mostrar el rechazo. Si las dos difieren, gana la base; `logica.test.ts` fija los casos del ensayo.
//
// ═══ EL RECIBO MUESTRA LO QUE LA LIQUIDACIÓN DICE ═══
//
// La vista previa sale de la línea que ya arma la pantalla de Liquidación (`LineaConOverrides`): en la
// quincena abierta con la precedencia manual > JORNALES > calculado de `aplicarOverrides`, en la cerrada
// con la foto del sello (`sinOverrides`). Esta función no vuelve a calcular nada: copia y verifica que
// la cuenta cierre. Sin tarifa no dice $ 0: dice que no liquida (lección `recibo-sin-liquidacion`).

export const ESTADOS = ['emitido', 'firmado_telefono', 'firmado_papel', 'archivado', 'observado'] as const
export type EstadoRecibo = (typeof ESTADOS)[number]

/** Los importes que el recibo congela al emitirse. Son las columnas de `recibo_pago`. */
export interface FotoDeRecibo {
  horas: number | null
  valorHora: number | null
  bruto: number
  adelanto: number
  yaTransferido: number
  total: number
  porBanco: number
  enEfectivo: number
}

/** Lo que el recibo necesita de una línea de la liquidación (un subconjunto de `LineaConOverrides`). */
export interface LineaParaRecibo {
  horas: number | null
  valorHora: number | null
  cobra: number | null
  adelanto: number
  yaTransferido: number
  porBanco: number
  enEfectivo: number | null
  total: number | null
  sinTarifa: boolean
}

export type Armado = { foto: FotoDeRecibo; bloqueo: null } | { foto: null; bloqueo: string }

const r2 = (n: number): number => Math.round(n * 100) / 100
/** La tolerancia de la base (`recibo_pago_compone`): un peso por redondeos de la planilla. */
const TOLERANCIA = 1

/**
 * LA FOTO DE UNA LÍNEA, O POR QUÉ NO HAY RECIBO. Nunca un recibo en $ 0 y nunca uno cuya cuenta no
 * cierre: un papel firmado con una resta que no da es peor que ningún papel.
 */
export function armarRecibo(l: LineaParaRecibo): Armado {
  if (l.sinTarifa) return { foto: null, bloqueo: 'sin tarifa: no liquida' }
  if (l.cobra == null || l.total == null || l.enEfectivo == null) return { foto: null, bloqueo: 'no liquida: falta el importe' }
  if (l.cobra <= 0) return { foto: null, bloqueo: 'no liquida: el importe de la quincena es cero' }
  if (l.total <= 0) return { foto: null, bloqueo: 'el total a pagar es cero: no se emite un recibo en $ 0' }
  if (l.porBanco < 0 || l.enEfectivo < 0) return { foto: null, bloqueo: 'banco o efectivo negativo' }
  if (Math.abs(l.cobra - l.adelanto - l.yaTransferido - l.total) > TOLERANCIA) {
    return { foto: null, bloqueo: 'la composición no cierra: bruto − adelantos ≠ total' }
  }
  if (Math.abs(r2(l.porBanco + l.enEfectivo) - r2(l.total)) > 0.005) {
    return { foto: null, bloqueo: 'por banco + en efectivo no da el total' }
  }
  return {
    bloqueo: null,
    foto: {
      horas: l.horas == null ? null : r2(l.horas), valorHora: l.valorHora == null ? null : r2(l.valorHora),
      bruto: r2(l.cobra), adelanto: r2(l.adelanto), yaTransferido: r2(l.yaTransferido),
      total: r2(l.total), porBanco: r2(l.porBanco), enEfectivo: r2(l.enEfectivo),
    },
  }
}

/** La línea tal como está HOY en `liquidacion_linea`, para compararla con la foto. */
export interface LineaActual {
  horas: number | null
  cobra: number
  adelanto: number
  yaTransferido: number
  total: number
  porBanco: number
  enEfectivo: number
}

/**
 * ¿EL RECIBO EMITIDO SIGUE DICIENDO LO QUE DICE LA LIQUIDACIÓN? `null` = al día; si no, por qué.
 * Es `recibo_pago_desactualizado()` de la migración, dicho en TypeScript.
 */
export function motivoDesactualizado(
  foto: FotoDeRecibo, actual: LineaActual | null, quincenaCerrada: boolean,
): string | null {
  if (!actual) return 'la línea de la liquidación ya no existe'
  if (!quincenaCerrada) return 'la quincena se reabrió: la liquidación puede cambiar'
  const horas = actual.horas == null ? null : r2(actual.horas)
  const cambio = horas !== foto.horas
    || r2(actual.cobra) !== foto.bruto || r2(actual.adelanto) !== foto.adelanto
    || r2(actual.yaTransferido) !== foto.yaTransferido || r2(actual.total) !== foto.total
    || r2(actual.porBanco) !== foto.porBanco || r2(actual.enEfectivo) !== foto.enEfectivo
  return cambio ? 'la liquidación cambió después de emitir' : null
}

// ── ESTADOS Y TRANSICIONES ───────────────────────────────────────────────────────────────────────

export type Accion = 'firmar' | 'subir_papel' | 'archivar' | 'observar' | 'reclamar' | 'reemitir'
export type Quien = 'persona' | 'administracion'

/** De qué estado se puede hacer cada acción, y quién. La base dice lo mismo (funciones *_recibo_pago). */
const DESDE: Record<Accion, { estados: readonly EstadoRecibo[]; quien: readonly Quien[] }> = {
  firmar: { estados: ['emitido'], quien: ['persona'] },
  subir_papel: { estados: ['emitido', 'firmado_telefono'], quien: ['persona', 'administracion'] },
  archivar: { estados: ['firmado_telefono', 'firmado_papel'], quien: ['administracion'] },
  observar: { estados: ['emitido', 'firmado_telefono', 'firmado_papel'], quien: ['administracion'] },
  // «No coincide» (M09): la persona, ANTES de firmar. Después, el reclamo va por otra vía.
  reclamar: { estados: ['emitido'], quien: ['persona'] },
  // Reemitir sólo lo observado o lo desactualizado: un vigente al día no se duplica.
  reemitir: { estados: ESTADOS, quien: ['administracion'] },
}

/** Adónde lleva cada acción. `reemitir` crea otro recibo: el viejo conserva su estado. */
export const DESTINO: Record<Exclude<Accion, 'reemitir'>, EstadoRecibo> = {
  firmar: 'firmado_telefono', subir_papel: 'firmado_papel', archivar: 'archivado',
  observar: 'observado', reclamar: 'observado',
}

export interface SituacionDelRecibo {
  estado: EstadoRecibo
  vigente: boolean
  desactualizado: string | null
}

/** `null` = se puede; si no, el motivo en palabras de la pantalla. */
export function motivoParaNo(accion: Accion, r: SituacionDelRecibo, quien: Quien): string | null {
  const regla = DESDE[accion]
  if (!regla.quien.includes(quien)) {
    return quien === 'persona' ? 'lo hace Administración' : 'lo hace la persona del recibo'
  }
  if (!r.vigente) return 'este recibo fue reemplazado por uno nuevo'
  if (accion === 'reemitir') {
    return r.estado === 'observado' || r.desactualizado ? null : 'ya está vigente y al día'
  }
  if (r.desactualizado && accion !== 'observar') return `desactualizado: ${r.desactualizado}`
  if (!regla.estados.includes(r.estado)) return `está ${ROTULO_ESTADO[r.estado].toLowerCase()}`
  return null
}

export const ROTULO_ESTADO: Record<EstadoRecibo, string> = {
  emitido: 'Emitido, sin firmar',
  firmado_telefono: 'Firmado en el teléfono',
  firmado_papel: 'Firmado en papel · cargado',
  archivado: 'Archivado en el legajo',
  observado: 'Observado',
}

// ── LA COLUMNA «RECIBO» DE D11 ───────────────────────────────────────────────────────────────────

export type Tono = 'pos' | 'warn' | 'neg' | 'tenue'
export interface MarcaDeFila { texto: string; tono: Tono; clave: 'sin_emitir' | 'bloqueado' | 'abierta' | 'desactualizado' | EstadoRecibo }

const DOS = (n: number) => String(n).padStart(2, '0')
/** `15/09 18:42`, en la hora de San Juan (UTC−3, sin horario de verano). */
export function diaHora(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000)
  return `${DOS(d.getUTCDate())}/${DOS(d.getUTCMonth() + 1)} ${DOS(d.getUTCHours())}:${DOS(d.getUTCMinutes())}`
}

/**
 * LO QUE DICE LA COLUMNA «RECIBO» DE UNA PERSONA. El recibo vigente manda; sin recibo, lo que impide
 * emitirlo (bloqueado, en rojo) o que todavía falta cerrar la quincena.
 */
export function marcaDeFila(e: {
  recibo: (SituacionDelRecibo & { firmadoEn: string | null; observacion: string | null }) | null
  bloqueo: string | null
  quincenaCerrada: boolean
}): MarcaDeFila {
  const r = e.recibo
  if (r) {
    if (r.desactualizado && r.estado !== 'archivado') return { texto: 'Desactualizado · reemitir', tono: 'warn', clave: 'desactualizado' }
    if (r.estado === 'firmado_telefono' && r.firmadoEn) return { texto: `Firmado ${diaHora(r.firmadoEn)}`, tono: 'pos', clave: r.estado }
    if (r.estado === 'observado') return { texto: `Observado · ${r.observacion ?? ''}`.trim(), tono: 'neg', clave: r.estado }
    if (r.estado === 'emitido') return { texto: ROTULO_ESTADO.emitido, tono: 'warn', clave: r.estado }
    return { texto: ROTULO_ESTADO[r.estado], tono: 'pos', clave: r.estado }
  }
  if (e.bloqueo) return { texto: 'Bloqueado', tono: 'neg', clave: 'bloqueado' }
  if (!e.quincenaCerrada) return { texto: 'Se emite al cerrar la quincena', tono: 'tenue', clave: 'abierta' }
  return { texto: 'Sin emitir', tono: 'tenue', clave: 'sin_emitir' }
}

/** La bajada de D11: `30 legajos · 21 firmados · 7 sin firmar · 2 bloqueados`. Nada se cuenta dos veces. */
export function resumenDeQuincena(marcas: readonly MarcaDeFila[]): string {
  const n = (f: (m: MarcaDeFila) => boolean) => marcas.filter(f).length
  const firmados = n((m) => ['firmado_telefono', 'firmado_papel', 'archivado'].includes(m.clave))
  const sinFirmar = n((m) => m.clave === 'emitido')
  const bloqueados = n((m) => m.clave === 'bloqueado')
  const partes = [`${marcas.length} legajo${marcas.length === 1 ? '' : 's'}`, `${firmados} firmado${firmados === 1 ? '' : 's'}`,
    `${sinFirmar} sin firmar`, `${bloqueados} bloqueado${bloqueados === 1 ? '' : 's'}`]
  const resto = marcas.length - firmados - sinFirmar - bloqueados
  if (resto > 0) partes.push(`${resto} sin emitir u observado${resto === 1 ? '' : 's'}`)
  return partes.join(' · ')
}

// ── FORMATO ──────────────────────────────────────────────────────────────────────────────────────

/** `341.700` — el número del diseño, sin signo; centavos sólo si los tiene (la fila tiene que cerrar). */
export function miles(n: number): string {
  const centavos = Math.round(n * 100) % 100 !== 0
  return n.toLocaleString('es-AR', { minimumFractionDigits: centavos ? 2 : 0, maximumFractionDigits: centavos ? 2 : 0 })
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** `16 al 30 de septiembre de 2026` (el «Período» de D12). */
export function periodoLargo(desde: string, hasta: string): string {
  return `${Number(desde.slice(8, 10))} al ${Number(hasta.slice(8, 10))} de ${MESES[Number(hasta.slice(5, 7)) - 1]} de ${hasta.slice(0, 4)}`
}

/** `16–30/09` (el rótulo corto de D11 y M09). */
export function periodoCorto(desde: string, hasta: string): string {
  return `${Number(desde.slice(8, 10))}–${hasta.slice(8, 10)}/${hasta.slice(5, 7)}`
}

// ── EL PAPEL EN STORAGE Y EL FIRMADO EN DRIVE ────────────────────────────────────────────────────

export const TIPOS_DEL_PAPEL = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'] as const
export const PAPEL_MAX_BYTES = 10 * 1024 * 1024

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
  'application/pdf': 'pdf',
}

/**
 * DÓNDE VA LA FOTO DEL PAPEL: `<uid>/recibo/<recibo>-<marca>.<ext>`. La primera carpeta es quien sube
 * (la policy del bucket `recibos` lo exige) y la segunda dice qué es. `null` = tipo no admitido.
 */
export function rutaDelPapel(uid: string, reciboId: string, tipo: string, ahora: number): string | null {
  const ext = EXTENSION[tipo]
  if (!ext || !uid || !reciboId) return null
  return `${uid}/recibo/${reciboId}-${ahora}.${ext}`
}

/** `2026-09-2`: año, mes y quincena (1 = del 1 al 15, 2 = del 16 al fin). */
export function periodoDeCarpeta(desde: string): string {
  return `${desde.slice(0, 7)}-${Number(desde.slice(8, 10)) <= 15 ? 1 : 2}`
}

/** La subcarpeta dentro de la carpeta del legajo (`personas.drive_folder_id`). */
export const SUBCARPETA_RECIBOS = 'Recibos'

/**
 * EL CAMINO COMPLETO QUE SE MUESTRA: `Legajos / <nombre> / Recibos / 2026-09-2`. La VM no lo recorre
 * desde la raíz: parte de `personas.drive_folder_id` y crea `Recibos / <período>` adentro.
 */
export function carpetaDelLegajo(nombre: string, desde: string): string[] {
  return ['Legajos', nombre.trim(), SUBCARPETA_RECIBOS, periodoDeCarpeta(desde)]
}

/** `REC-2026-0412 · AGÜERO Mario · firmado.pdf` — el código primero: ordena y no se repite. */
export function nombreDelArchivo(codigo: string, nombre: string, forma: 'telefono' | 'papel'): string {
  const limpio = nombre.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return `${codigo} · ${limpio} · firmado ${forma === 'telefono' ? 'en el teléfono' : 'en papel'}.pdf`
}

// ── EL TRAZO: SE DIBUJA SÓLO SI ES UNA FIRMA ─────────────────────────────────────────────────────

const TRAZO = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) (\d+)"><path d="([ML0-9 l-]+)" fill="none" stroke="#1F1F1E" stroke-width="2\.4" stroke-linecap="round" stroke-linejoin="round"\/><\/svg>$/

/**
 * EL TRAZO GUARDADO, DESARMADO. Se dibuja con un `<path>` de React y nunca con `innerHTML`: un texto que
 * no sea exactamente una firma no llega a la pantalla (la base ya lo rechaza con la misma expresión).
 */
export function leerTrazo(svg: string | null): { ancho: number; alto: number; d: string } | null {
  if (!svg || svg.length > 60_000) return null
  const m = TRAZO.exec(svg)
  return m ? { ancho: Number(m[1]), alto: Number(m[2]), d: m[3] } : null
}
