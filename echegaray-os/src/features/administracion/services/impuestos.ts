// LA PANTALLA DE IMPUESTOS, SIN REACT NI SUPABASE — lo que decide qué número se publica.
//
// La fuente es `public.impuesto_posicion` (la obligación vigente de cada impuesto × período con lo
// pagado contra ella), que escribe `orquestador/scripts/impuestos-a-postgres.mjs`. Acá no se recalcula
// ningún impuesto: se elige qué filas contestan cada pregunta de la pantalla.
//
// ═══ LAS TRES PREGUNTAS ═══
//
//   1. ¿Qué tengo que pagar en los próximos 30 días? — lo pendiente con vencimiento en la ventana, Y lo
//      ya vencido sin pago registrado: un vencimiento que pasó sin pago no deja de deberse.
//   2. ¿Cuánta plata tengo inmovilizada en el fisco? — el saldo a favor del ÚLTIMO período de cada
//      impuesto, no la suma de los meses: cada saldo ya arrastra al anterior.
//   3. ¿Puedo confiar en estos números? — hasta qué fecha llega cada fuente.

export type Impuesto =
  | 'iva' | 'iibb' | 'ganancias' | 'bienes_personales' | 'cargas_sociales' | 'impuesto_cheque' | 'sellos' | 'otro'

export interface PosicionImpuesto {
  impuesto: Impuesto
  periodo: string
  concepto: string
  fuente: 'ddjj_contador' | 'arca' | 'calculo' | 'manual'
  estado: 'estimado' | 'presentado' | 'pagado'
  vencimiento: string | null
  vencimiento_confianza: 'verificado' | 'supuesto' | null
  determinado: number | null
  creditos: number | null
  a_pagar: number | null
  saldo_a_favor: number | null
  pagado: number
  pendiente: number | null
  datos_al: string | null
  detalle: { parcial?: boolean; creditos_parciales?: boolean } | null
}

export interface PagoSinImputar {
  fecha: string
  importe: number
  descripcion: string | null
  fuente: string
}

export interface LectorSincronizado { ok: boolean; error?: string; datos_al?: string | null }

export interface Sincronizacion {
  corrio_en: string
  lectores: Record<string, LectorSincronizado>
}

export const NOMBRE_IMPUESTO: Record<Impuesto, string> = {
  iva: 'IVA', iibb: 'IIBB San Juan', ganancias: 'Ganancias', bienes_personales: 'Bienes Personales',
  cargas_sociales: 'F931', impuesto_cheque: 'Imp. al cheque', sellos: 'Sellos', otro: 'Otro',
}

/** El orden de lectura: lo que más plata mueve primero. */
const ORDEN: Impuesto[] = ['iva', 'iibb', 'cargas_sociales', 'ganancias', 'bienes_personales', 'impuesto_cheque', 'sellos', 'otro']

export const NOMBRE_FUENTE: Record<PosicionImpuesto['fuente'], string> = {
  ddjj_contador: 'DDJJ', arca: 'ARCA', calculo: 'cálculo', manual: 'Compras',
}

/** Cuántos días hacia atrás sigue mostrándose un vencimiento pendiente. Lo mismo que la pestaña (45). */
export const DIAS_VENCIDO = 45
export const DIAS_ADELANTE = 30

const dias = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)

export interface Vencimiento extends PosicionImpuesto { dias: number }

/**
 * LO QUE HAY QUE PAGAR EN 30 DÍAS. Entra lo que tiene vencimiento en la ventana y NO está saldado:
 * `pendiente > 0`, o `pendiente` null —el importe no se conoce, y un vencimiento sin importe se muestra
 * como tal en vez de desaparecer—. `total` suma sólo lo conocido y `sinImporte` cuenta lo que no.
 */
export function aPagarProximos(filas: PosicionImpuesto[], hoy: string) {
  const lista: Vencimiento[] = filas
    .filter((f) => f.vencimiento && f.estado !== 'pagado' && (f.pendiente === null || f.pendiente > 0))
    .map((f) => ({ ...f, dias: dias(hoy, f.vencimiento as string) }))
    .filter((f) => f.dias <= DIAS_ADELANTE && f.dias >= -DIAS_VENCIDO)
    .sort((a, b) => a.dias - b.dias)
  return {
    lista,
    total: lista.reduce((s, f) => s + (f.pendiente ?? 0), 0),
    sinImporte: lista.filter((f) => f.pendiente === null).length,
    vencidos: lista.filter((f) => f.dias < 0).length,
  }
}

/**
 * El saldo a favor del último período CERRADO de cada impuesto que declara saldo. Null no se publica
 * como 0. Un mes parcial no cuenta: medido en producción el 16/09/2026, septiembre (ARCA al 04/09) ponía
 * el IVA a favor en $265.832 contra $6.181.413 de agosto — cuatro días de ventas contra un mes entero.
 */
export function saldosAFavor(filas: PosicionImpuesto[]) {
  const ultimo = new Map<Impuesto, PosicionImpuesto>()
  for (const f of filas) {
    if (f.concepto !== 'ddjj' || f.saldo_a_favor === null || f.detalle?.parcial) continue
    const u = ultimo.get(f.impuesto)
    if (!u || f.periodo > u.periodo) ultimo.set(f.impuesto, f)
  }
  return ORDEN.filter((i) => ultimo.has(i)).map((i) => ultimo.get(i) as PosicionImpuesto)
}

/** Período × impuesto, del más nuevo al más viejo. */
export function porPeriodo(filas: PosicionImpuesto[]) {
  return [...filas].sort((a, b) => b.periodo.localeCompare(a.periodo)
    || ORDEN.indexOf(a.impuesto) - ORDEN.indexOf(b.impuesto) || a.concepto.localeCompare(b.concepto))
}

/**
 * LAS FUENTES Y SU FRESCURA. Cada una tiene su propia vara: ARCA y el banco se mueven todos los días;
 * una DDJJ es mensual y la de agosto recién existe a mediados de septiembre, así que su «al 31/08» es
 * al día hasta ~45 días después.
 */
export const FUENTES_FRESCURA = [
  { lector: 'arca', nombre: 'ARCA', viejaTrasDias: 7 },
  { lector: 'ddjj_iva_pdf', nombre: 'DDJJ IVA', viejaTrasDias: 50 },
  { lector: 'ddjj_iibb_pdf', nombre: 'DDJJ IIBB', viejaTrasDias: 50 },
  { lector: 'f931_raw', nombre: 'F931', viejaTrasDias: 50 },
  { lector: 'banco', nombre: 'banco', viejaTrasDias: 4 },
] as const

/** Una corrida del sincronizador más vieja que esto ya no es «cada 2 h». */
export const HORAS_SINCRONIZACION_VIEJA = 5

/**
 * EL DÍA EN SAN JUAN (UTC−3, sin horario de verano). `toISOString()` a secas da el día UTC: desde las
 * 21 h un vencimiento de hoy se leería como de ayer, «vencido».
 */
export const hoyAR = (ahora: Date) => new Date(ahora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10)

export function frescura(sinc: Sincronizacion | null, ahora: Date) {
  const hoy = hoyAR(ahora)
  const fuentes = FUENTES_FRESCURA.map((f) => {
    const l = sinc?.lectores?.[f.lector]
    const al = l?.datos_al ?? null
    return {
      nombre: f.nombre,
      al,
      fallo: l ? !l.ok : false,
      vieja: al === null || dias(al, hoy) > f.viejaTrasDias,
    }
  })
  const horas = sinc ? (ahora.getTime() - Date.parse(sinc.corrio_en)) / 3_600_000 : null
  return { fuentes, horasDesdeSincronizacion: horas, sincronizacionVieja: horas === null || horas > HORAS_SINCRONIZACION_VIEJA }
}

/** dd/mm de una fecha ISO, sin pasar por `Date` local (la zona horaria ya corrió fechas en este repo). */
export const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—')

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** '2026-08' → 'ago-26', el rótulo de mes de la pestaña. */
export const rotuloPeriodo = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]}-${p.slice(2, 4)}`
