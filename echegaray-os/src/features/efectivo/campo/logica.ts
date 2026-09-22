// EFECTIVO A RENDIR EN EL TELÉFONO — las reglas, sin base, sin red y sin React.
//
// Todo lo que decide QUÉ SE VE vive acá para probarlo con `node --test`: qué tarjeta sale en Hoy, qué
// dice «Tengo que rendir», cómo se lee el estado de cada ticket y dónde se guarda la foto. Las
// pantallas sólo dibujan lo que esto devuelve.
//
// ═══ DECISIONES DEL DUEÑO (22/09) QUE MANDAN SOBRE EL DISEÑO ═══
//
//   · Sin plazo, sin tope y sin bloqueo por vencida: ninguna función de acá calcula un vencimiento.
//   · El ticket no espera aprobación: se manda y el worker lo carga a Compras. Por eso el estado bueno
//     se llama «en Compras» y no «aceptado» — nadie lo acepta, entra.
//   · La devolución la registra quien recibe la plata (la RPC exige Administración): el teléfono no
//     la ofrece como acción propia.

import type { EntregaSaldo, EstadoTicket, TicketRendicion } from './tipos.ts'
import { extensionDe } from '../../administracion/services/comprobanteEntrada.ts'

/** La migración que publica el módulo. Mientras no esté aplicada, las pantallas lo dicen. */
export const MIGRACION_EFECTIVO = '20260922T1500'

const ENTERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

/** `800000` → `800.000`. Los centavos sólo aparecen si existen. */
export function cifra(n: number): string {
  return ENTERO.format(n)
}

/** `800000` → `$ 800.000`, con el espacio que dibuja el mockup. El negativo lleva el signo adelante. */
export function pesos(n: number): string {
  return n < 0 ? `−$ ${cifra(-n)}` : `$ ${cifra(n)}`
}

/** `2026-09-16` → `16/09`. */
export function diaMes(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return '—'
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

const HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/San_Juan', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  hour12: false,
})

/** Un instante en la hora de San Juan: `21/09 09:10`. La VM y Vercel corren en UTC. */
export function diaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return HORA.format(d).replace(',', '')
}

/**
 * EL TOTAL QUE LEYÓ EL CIRCUITO, que puede venir como número o como texto.
 *
 * El worker guarda lo que devolvió el modelo de visión: `96400`, `"96400.5"` o `"96.400,50"`. Un
 * texto con coma decimal es formato argentino (punto de miles). Sin coma, `30.000` es treinta mil
 * (grupos de tres después del punto) y `96400.5` es decimal.
 */
export function aNumero(v: string | number | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const limpio = v.replace(/[^\d.,-]/g, '')
  if (!limpio) return null
  const normal = limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.')
    : /^-?\d{1,3}(\.\d{3})+$/.test(limpio) ? limpio.replace(/\./g, '') : limpio
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

/** El importe del ticket: el de la fila de Compras si ya entró; si no, lo que leyó el circuito. */
export function totalDelTicket(t: Pick<TicketRendicion, 'monto_rendido' | 'resultado'>): number | null {
  if (t.monto_rendido != null) return Number(t.monto_rendido)
  const leidos = (t.resultado?.comprobantes ?? []).map((c) => aNumero(c.total)).filter((n): n is number => n != null)
  return leidos.length ? leidos.reduce((s, n) => s + n, 0) : null
}

/** El comercio que leyó el circuito, o `null` si todavía no lo leyó (o no se lee). */
export function comercioDelTicket(t: Pick<TicketRendicion, 'resultado'>): string | null {
  const p = (t.resultado?.comprobantes ?? []).map((c) => c.proveedor?.trim()).find((x) => !!x)
  return p ?? null
}

/** La fecha del comprobante si el circuito la leyó; si no, el día en que se mandó. */
export function fechaDelTicket(t: Pick<TicketRendicion, 'resultado' | 'enviado_en'>): string {
  const leida = (t.resultado?.comprobantes ?? []).map((c) => c.fecha).find((x) => !!x && /^\d{4}-\d{2}-\d{2}/.test(x))
  return diaMes(leida ?? t.enviado_en)
}

export type Tono = 'faint' | 'warn' | 'pos' | 'neg'

export interface EstadoVisible {
  /** El renglón grande de la fila: el comercio, o lo que falta cuando te piden un dato. */
  titulo: string
  /** La palabra del estado, en minúscula, para `21/09 · te lo piden`. */
  etiqueta: string
  tono: Tono
  /** Hay que contestar algo: la fila se marca y lleva a M07. */
  pideDato: boolean
  /** Todavía no es gasto de la obra (leyendo, o esperando un dato). */
  pendiente: boolean
}

/**
 * CÓMO SE LEE CADA TICKET EN «MIS RENDICIONES».
 *
 * ═══ «OBSERVADO» NO SIEMPRE ES «TE LO PIDEN» ═══
 *
 * Desde el 22/09/2026 la vista tiene su propio estado `respondido` para quien YA contestó y espera la
 * carga. El caso `observado` + `respondido_en` se conserva por si llega una fila de antes de ese cambio.
 * Decirle «te lo piden» a quien ya contestó lo manda a contestar dos veces.
 */
export function estadoVisible(t: TicketRendicion): EstadoVisible {
  const comercio = comercioDelTicket(t)
  const base = (etiqueta: string, tono: Tono, titulo = comercio ?? 'Ticket', pendiente = false): EstadoVisible =>
    ({ titulo, etiqueta, tono, pideDato: false, pendiente })
  switch (t.estado as EstadoTicket) {
    case 'en_compras': return base('en Compras', 'pos')
    case 'leyendo': return base('leyendo', 'faint', comercio ?? 'Leyendo el ticket', true)
    case 'respondido': return base('contestaste · falta cargar', 'faint', comercio ?? 'Ticket', true)
    case 'observado':
      if (t.respondido_en) return base('contestaste · falta cargar', 'faint', comercio ?? 'Ticket', true)
      return {
        titulo: t.observacion?.trim() || t.motivo?.trim() || 'Falta un dato', etiqueta: 'te lo piden',
        tono: 'warn', pideDato: true, pendiente: true,
      }
    case 'duplicado': return base('ya lo habías mandado', 'neg', comercio ?? 'Ticket repetido')
    case 'error': return base('falló · se reintenta solo', 'neg', comercio ?? 'No se pudo cargar', true)
    case 'descartado': return base('descartado', 'faint', t.descartado_motivo?.trim() || comercio || 'Ticket descartado')
    default: return base('leyendo', 'faint', comercio ?? 'Leyendo el ticket', true)
  }
}

/** Las entregas que todavía corren: ni cerradas ni anuladas. */
export function abiertas(entregas: readonly EntregaSaldo[]): EntregaSaldo[] {
  return entregas.filter((e) => e.estado === 'abierta')
}

/** Adónde fue la plata: la obra, o «Estructura». No hay tercera opción (lo exige la base). */
export function destino(e: Pick<EntregaSaldo, 'obra' | 'obra_id' | 'estructura'>): string {
  if (e.estructura) return 'Estructura'
  return e.obra ?? e.obra_id ?? 'obra sin nombre'
}

export interface ResumenEfectivo {
  /** Las abiertas CON conformidad: lo que la persona ya dijo que recibió. */
  entregas: EntregaSaldo[]
  recibi: number
  rendi: number
  devolvi: number
  tengoQueRendir: number
  /** Suma de lo que leyó el circuito en tickets que todavía no están en Compras. */
  pendienteMonto: number
  /** Tickets pendientes a los que el circuito todavía no les leyó el total. */
  pendienteSinTotal: number
  pendientes: TicketRendicion[]
  /** Los que piden un dato y nadie contestó. */
  piden: TicketRendicion[]
}

/**
 * LA CUENTA DE M03, sobre las entregas abiertas y FIRMADAS.
 *
 * La que no tiene conformidad no suma: M01 dice «si firmás, vas a tener … para rendir», o sea que
 * hasta la firma esa plata no es de la persona. Aparece aparte, como la tarjeta para recibirla.
 */
export function resumenMiEfectivo(entregas: readonly EntregaSaldo[], tickets: readonly TicketRendicion[]): ResumenEfectivo {
  const firmadas = abiertas(entregas).filter((e) => e.conformidad)
  const ids = new Set(firmadas.map((e) => e.id))
  const suyos = tickets.filter((t) => ids.has(t.entrega_id))
  const pendientes = suyos.filter((t) => estadoVisible(t).pendiente)
  const suma = (f: (e: EntregaSaldo) => number) => firmadas.reduce((s, e) => s + Number(f(e) || 0), 0)
  const montos = pendientes.map(totalDelTicket)
  return {
    entregas: firmadas,
    recibi: suma((e) => e.entregado),
    rendi: suma((e) => e.rendido),
    devolvi: suma((e) => e.devuelto),
    tengoQueRendir: suma((e) => e.en_su_poder),
    pendienteMonto: montos.reduce<number>((s, n) => s + (n ?? 0), 0),
    pendienteSinTotal: montos.filter((n) => n == null).length,
    pendientes,
    piden: suyos.filter((t) => estadoVisible(t).pideDato),
  }
}

/**
 * EL NÚMERO GRANDE DE M03.
 *
 * Tres casos y no uno: con saldo, en cero, y rendido DE MÁS (el ticket fue más caro que la plata
 * entregada). El negativo no se esconde en un cero: es plata que la empresa le debe a la persona, y
 * eso lo resuelve Administración, no la pantalla.
 */
export function textoTengoQueRendir(
  r: Pick<ResumenEfectivo, 'tengoQueRendir' | 'entregas'>,
  sinFirmar = 0,
): { rotulo: string; valor: string; detalle: string | null } {
  if (r.entregas.length === 0) {
    // QA del teléfono, 22/09/2026: con una entrega esperando la firma, la pantalla mostraba la tarjeta
    // «te entregan $ 12.000» y abajo «No tenés efectivo de la empresa». La plata no cuenta hasta firmar
    // —eso no cambia—, pero el texto tiene que decir QUÉ falta, no negar la entrega que se ve arriba.
    const detalle = sinFirmar > 0
      ? 'Firmá la conformidad de arriba y la plata aparece acá.'
      : 'No tenés efectivo de la empresa. Cuando te entreguen, aparece acá.'
    return { rotulo: 'Tengo que rendir', valor: pesos(0), detalle }
  }
  if (r.tengoQueRendir < 0) {
    return {
      rotulo: 'Rendiste de más', valor: pesos(-r.tengoQueRendir),
      detalle: 'Los tickets suman más que lo que te entregaron: la diferencia la resuelve Administración.',
    }
  }
  if (r.tengoQueRendir === 0) {
    return { rotulo: 'Tengo que rendir', valor: pesos(0), detalle: 'Rendiste todo lo que recibiste.' }
  }
  return { rotulo: 'Tengo que rendir', valor: pesos(r.tengoQueRendir), detalle: null }
}

/** La frase de la tarjeta «Te piden un dato»: `El ticket de $ 30.000 del 21/09: falta el comercio.` */
export function fraseTePiden(t: TicketRendicion): string {
  const total = totalDelTicket(t)
  const que = t.observacion?.trim() || t.motivo?.trim() || 'falta un dato'
  return `El ticket${total != null ? ` de ${pesos(total)}` : ''} del ${fechaDelTicket(t)}: ${que.charAt(0).toLowerCase()}${que.slice(1)}`
}

export type TarjetaHoy =
  | { tipo: 'recibir'; entrega: EntregaSaldo; yaTenes: number; previas: EntregaSaldo[] }
  | { tipo: 'mi-efectivo'; tengoQueRendir: number; piden: number }
  | null

/**
 * QUÉ TARJETA DE EFECTIVO SALE EN HOY — como mucho una.
 *
 * Primero la entrega sin firmar (M01): es la única que pide algo YA, con la plata en la mano. Si no
 * hay, el acceso a «Mi efectivo» sólo cuando hay algo que mirar: saldo distinto de cero o un dato
 * pedido. Una tarjeta que dice «$ 0» todos los días deja de leerse.
 */
export function tarjetaDeHoy(entregas: readonly EntregaSaldo[], tickets: readonly TicketRendicion[]): TarjetaHoy {
  const vivas = abiertas(entregas)
  const sinFirma = vivas.filter((e) => !e.conformidad).sort((a, b) => a.fecha.localeCompare(b.fecha))[0]
  const r = resumenMiEfectivo(entregas, tickets)
  if (sinFirma) return { tipo: 'recibir', entrega: sinFirma, yaTenes: r.tengoQueRendir, previas: r.entregas }
  if (r.entregas.length && (r.tengoQueRendir !== 0 || r.piden.length)) {
    return { tipo: 'mi-efectivo', tengoQueRendir: r.tengoQueRendir, piden: r.piden.length }
  }
  return null
}

/** El recuadro «Ya tenés … sin rendir» de M01. `null` si no tiene nada en la mano. */
export function textoYaTenes(t: Extract<TarjetaHoy, { tipo: 'recibir' }>): { titulo: string; detalle: string } | null {
  if (t.yaTenes <= 0 || t.previas.length === 0) return null
  const de = t.previas.length === 1 ? `De la entrega del ${diaMes(t.previas[0].fecha)}.` : `De ${t.previas.length} entregas.`
  return {
    titulo: `Ya tenés ${pesos(t.yaTenes)} sin rendir`,
    detalle: `${de} Si firmás, vas a tener ${pesos(t.yaTenes + Number(t.entrega.entregado))} para rendir.`,
  }
}

/**
 * ¿A QUÉ ENTREGA VA EL TICKET?
 *
 * La pedida si está abierta; si hay una sola abierta, ésa; si hay varias, `null` y la pantalla
 * pregunta. Nunca se adivina entre dos obras: el gasto se imputa a la obra de la entrega, y elegir mal
 * es cargarle el corralón de Galpón 8 a otra obra.
 */
export function entregaParaRendir(entregas: readonly EntregaSaldo[], pedida: string | null | undefined): EntregaSaldo | null {
  const vivas = abiertas(entregas)
  if (pedida) return vivas.find((e) => e.id === pedida) ?? null
  return vivas.length === 1 ? vivas[0] : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * EL NOMBRE DE LA FOTO EN EL BUCKET: `<uid>/rendicion/<uuid>.<ext>`.
 *
 * La policy `comprobantes_sube_rendicion` exige la carpeta 1 = `auth.uid()` y la carpeta 2 =
 * `rendicion`; `rendir_comprobante` vuelve a mirar la primera. La extensión sale del media type, igual
 * que en la subida de Compras: un `.HEIC` que Safari manda sin `type` queda guardado como `.heic`.
 */
export function rutaDeRendicion(p: { uid: string; id: string; mediaType: string }): string {
  if (!UUID.test(p.uid)) throw new Error(`La ruta de la foto necesita tu usuario; vino «${p.uid}».`)
  if (!UUID.test(p.id)) throw new Error(`La ruta de la foto necesita un identificador válido; vino «${p.id}».`)
  return `${p.uid}/rendicion/${p.id}.${extensionDe(p.mediaType)}`
}

/** La misma pregunta que la policy, del lado del servidor, antes de encolar. */
export function esRutaDeRendicion(ruta: string, uid: string): boolean {
  const [carpeta, sub, archivo, ...resto] = ruta.split('/')
  return UUID.test(uid) && carpeta === uid && sub === 'rendicion' && !!archivo && resto.length === 0
    && /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i.test(archivo)
}

/**
 * ADÓNDE VUELVE LA FLECHA DE LAS PANTALLAS COMPARTIDAS (firmar, rendir, rendiciones, devolver).
 *
 * El jefe de obra entra desde `/obra/efectivo` y la persona desde `/mi-informacion/efectivo`; las
 * pantallas del medio son las mismas. El destino viaja en la URL (`?desde=obra&obra=…`) y se valida:
 * un parámetro libre en un `href` es una redirección abierta.
 */
export function destinoDeVuelta(desde: string | null | undefined, obra: string | null | undefined): string {
  if (desde === 'obra') {
    return obra && /^[\w-]{1,80}$/.test(obra) ? `/obra/efectivo?obra=${obra}` : '/obra/efectivo'
  }
  return '/mi-informacion/efectivo'
}

/** Los parámetros que las pantallas compartidas se pasan entre sí para no perder la vuelta. */
export function sufijoDeVuelta(desde: string | null | undefined, obra: string | null | undefined): string {
  if (desde !== 'obra') return ''
  return obra && /^[\w-]{1,80}$/.test(obra) ? `desde=obra&obra=${obra}` : 'desde=obra'
}

/** Pega el sufijo de vuelta a un `href` que puede tener ya su `?`. */
export function conVuelta(href: string, sufijo: string): string {
  if (!sufijo) return href
  return `${href}${href.includes('?') ? '&' : '?'}${sufijo}`
}
