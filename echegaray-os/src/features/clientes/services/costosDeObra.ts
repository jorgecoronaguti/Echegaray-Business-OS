// LO QUE LLEVA GASTADO CADA TRABAJO, COMO LO DIBUJA EL CRM.
//
// ═══ POR QUÉ EXISTE (dueño, 12/09 y 13/09/2026) ═══
//
// «Necesito que cada obra tenga, así como las HH que lleva, los costos de obra aparejados: en una
// columna que sume materiales gastados y mano de obra en otra.» Y al día siguiente: «que muestren los
// costos hasta el momento sumados de cada una de cada obra de cada cliente, no lo presupuestado».
//
// ═══ LA REGLA QUE ESTE ARCHIVO DEFIENDE ═══
//
// Ninguna ausencia se dibuja como un cero, y son CUATRO ausencias distintas que se leen distinto:
//
//   · el trabajo no tiene nada imputado      → «—»              (la base contestó: ninguna compra)
//   · no puedo leerlo (rol)                  → vacío            (`costo_obra` llega `null`)
//   · tiene horas y NO se pueden valorizar   → «sin valorizar»  (falta la tarifa de alguien)
//   · se valorizó una parte                  → el importe en ámbar, y el `title` dice quién falta
//
// Y una quinta, que no es de una obra: lo que Compras le imputa al CLIENTE sin decir a cuál de sus
// obras fue. Se publica en su propia fila, «Gastos del cliente sin obra asignada», y NUNCA se reparte.
//
// Los números NO se calculan acá: los trae `costo_obra` (función `costo_de_obras_a_la_fecha`). La
// mano de obra sale desde 20260915T0500 de la definición única `costo_mo_quincena`: recibo del
// estudio (costo total empleador) + parte en negro, repartidos por horas, quincena por quincena. Este
// archivo convierte, da formato y decide qué dice cada hueco.

// LAS RUTAS VAN RELATIVAS Y CON EXTENSIÓN: el alias `@/` lo resuelve el bundler, no `node --test`.
import { plata } from '../../../shared/utils/format.ts'
import { diaMesISO } from '../../../shared/utils/fecha.ts'

/** Una persona cuyas horas no se pudieron valorizar en una quincena. */
export interface FaltaDatoDeObra {
  personaId: string | null
  nombre: string | null
  /** ISO del primer día de la quincena. */
  quincena: string
  horas: number
  origen: string
}

/** Lo que la clave `costo_obra` publica por trabajo. */
export interface CostoDeObra {
  obraId: string
  /** Σ de las compras asignadas al trabajo a la fecha, sin nómina, sin anuladas y sin subcontratos. */
  materiales: number | null
  /** Mano de obra FACTURADA por terceros (rubro «Subcontratos y mano de obra»). No es material y no
   *  es la mano de obra propia: viaja aparte para que no desaparezca al excluirla. */
  subcontratos: number | null
  nComprobantes: number
  /** ISO `YYYY-MM-DD` del último comprobante imputado. */
  ultimoComprobante: string | null
  /** Mano de obra propia a la fecha: recibos + negro. `null` = no se pudo valorizar NADA. */
  manoObra: number | null
  /** La parte de `manoObra` con recibo del estudio. */
  manoObraReal: number | null
  /** La parte de `manoObra` estimada (quincenas sin recibo todavía). */
  manoObraEstimada: number | null
  /** Las horas que hay detrás de `manoObra`. */
  horasValorizadas: number | null
  /** Las horas que NO se pudieron valorizar: FALTA_DATO (sin tarifa o sin neto mensual). */
  horasSinTarifa: number | null
  personasSinTarifa: number
  faltaDato: FaltaDatoDeObra[]
  /** ISO del último día sellado. `null` = todas las quincenas se calcularon en vivo. */
  selladoHasta: string | null
  /** `false` = la RLS de recibos y tarifas (`liquida_sueldos()`) no deja leerlos. Es «no puedo», no
   *  «falta cargarlas», y la celda lo dibuja distinto. */
  puedeVerTarifas: boolean
  /** Compras asignadas a la obra con fecha POSTERIOR al corte: no son costo a la fecha, se nombran. */
  comprometidoFuturo?: number | null
  /** ISO `YYYY-MM-DD` del corte con el que la base sumó. `null` = RPC anterior a 20260913T1550. */
  corte?: string | null
}

/** LOS RÓTULOS DICEN QUÉ ES EL NÚMERO (dueño, 13/09/2026): lo gastado hasta hoy, no lo presupuestado. */
export const ROTULO_MATERIALES = 'Materiales a la fecha'
export const ROTULO_MANO_OBRA = 'Mano de obra a la fecha'
export const ROTULO_SIN_OBRA = 'Gastos del cliente sin obra asignada'

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function entero(v: unknown): number {
  return num(v) ?? 0
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

function faltaDatoDe(v: unknown): FaltaDatoDeObra[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((x): FaltaDatoDeObra[] => {
    const r = x as Record<string, unknown>
    const quincena = texto(r.quincena)
    if (quincena == null) return []
    return [{
      personaId: texto(r.persona_id), nombre: texto(r.nombre), quincena: quincena.slice(0, 10),
      horas: num(r.horas) ?? 0, origen: texto(r.origen) ?? '',
    }]
  })
}

/**
 * LAS FILAS DE `costo_obra`, POR OBRA.
 *
 * `null` ENTRA Y SALE COMO `null`: la RPC lo devuelve cuando quien pregunta no es Administración o
 * cuando la cara no dibuja costos. Un `Map` vacío diría «ningún trabajo gastó nada», que es otra
 * cosa, y los dos casos se dibujan distinto.
 */
export function armarCostosPorObra(
  filas: unknown[] | null | undefined,
): Map<string, CostoDeObra> | null {
  if (filas == null) return null
  const m = new Map<string, CostoDeObra>()
  for (const f of filas) {
    const r = f as Record<string, unknown>
    const obraId = texto(r.obra_id)
    if (!obraId) continue
    m.set(obraId, {
      obraId,
      materiales: num(r.materiales),
      subcontratos: num(r.subcontratos),
      nComprobantes: entero(r.n_comprobantes),
      ultimoComprobante: texto(r.ultimo_comprobante)?.slice(0, 10) ?? null,
      manoObra: num(r.mano_obra),
      manoObraReal: num(r.mano_obra_real),
      manoObraEstimada: num(r.mano_obra_estimada),
      horasValorizadas: num(r.horas_valorizadas),
      horasSinTarifa: num(r.horas_sin_tarifa),
      personasSinTarifa: entero(r.personas_sin_tarifa),
      faltaDato: faltaDatoDe(r.falta_dato),
      selladoHasta: texto(r.sellado_hasta)?.slice(0, 10) ?? null,
      puedeVerTarifas: r.puede_ver_tarifas !== false,
      comprometidoFuturo: num(r.comprometido_futuro),
      corte: texto(r.corte)?.slice(0, 10) ?? null,
    })
  }
  return m
}

/** MATERIALES: el importe o «—». Sin decimales y en es-AR, como el resto de la columna de plata. */
export function textoMateriales(c: CostoDeObra | null | undefined): string {
  return plata(c?.materiales ?? null)
}

/** «+ $ 1.200.000 comprometido a futuro», o nada. Lo que tiene fecha posterior al corte no se suma. */
function fraseFuturo(v: number | null | undefined): string {
  return v ? ` + ${plata(v)} comprometido a futuro, que no entra.` : ''
}

const aLaFecha = (corte: string | null | undefined): string =>
  corte ? ` al ${diaMesISO(corte)}` : ' a la fecha'

/** El detalle que respalda el importe de materiales. `null` cuando no hay nada que respaldar. */
export function tituloMateriales(c: CostoDeObra | null | undefined): string | null {
  if (!c || (c.materiales == null && !c.comprometidoFuturo)) return null
  const partes = [
    `Compras asignadas a la obra${aLaFecha(c.corte)}, pagadas y pendientes (Compras, columna K)`,
    `${c.nComprobantes} ${c.nComprobantes === 1 ? 'comprobante' : 'comprobantes'}`,
    c.ultimoComprobante ? `último ${diaMesISO(c.ultimoComprobante)}` : null,
  ].filter((p) => p != null)
  // QUÉ NO ENTRA, DICHO EN LA CELDA: sin esta frase, la diferencia contra el «costo real» de la ficha de la
  // obra —que sí suma la nómina imputada— se lee como un error de alguno de los dos.
  let t = `${partes.join(' · ')}. No entran nómina, cargas, ARCA ni financiero.`
  if (c.subcontratos != null) {
    // LOS SUBCONTRATOS NO DESAPARECEN AL EXCLUIRLOS. Son mano de obra facturada por un tercero: no
    // son material, y tampoco pueden sumarse a la columna de al lado, que son las horas PROPIAS.
    t += ` Aparte, ${plata(c.subcontratos)} de subcontratos y mano de obra facturada.`
  }
  return t + fraseFuturo(c.comprometidoFuturo)
}

/** Lo que dibuja la celda de mano de obra, con de dónde salió cada variante. */
export interface CeldaManoObra {
  /** El importe, «sin valorizar», «—» o '' (vacío = no puedo leerlo). */
  texto: string
  /** `true` = el número está incompleto o falta cargar un dato: la celda va en ámbar. */
  parcial: boolean
  /** `true` = una parte del importe es estimada (sin recibo del estudio todavía): la celda dice «est.». */
  estimado: boolean
}

/**
 * MANO DE OBRA: el costo de las horas propias, o la palabra que dice por qué no hay número.
 *
 * «Sin valorizar» es una PALABRA y no un cero porque el hueco es de DATO y se puede resolver hoy:
 * falta la tarifa de alguien. Un «$ 0» diría que la obra no tuvo mano de obra.
 */
export function textoManoObra(c: CostoDeObra | null | undefined): CeldaManoObra {
  if (!c) return { texto: '—', parcial: false, estimado: false }
  // NO PUEDO LEER LOS RECIBOS NI LAS TARIFAS: vacío, igual que las HH de un rol sin permiso.
  if (!c.puedeVerTarifas) return { texto: '', parcial: false, estimado: false }
  const conHoras = (c.horasValorizadas ?? 0) + (c.horasSinTarifa ?? 0) > 0
  if (c.manoObra == null) {
    return conHoras ? { texto: 'sin valorizar', parcial: true, estimado: false } : { texto: '—', parcial: false, estimado: false }
  }
  return { texto: plata(c.manoObra), parcial: (c.horasSinTarifa ?? 0) > 0, estimado: (c.manoObraEstimada ?? 0) > 0 }
}

/** Quién falta, sin repetir a la persona por cada quincena. */
function faltaParaValorizar(c: CostoDeObra): string {
  const unicos = [...new Map(c.faltaDato.map((f) => [f.personaId ?? f.nombre ?? '', f])).values()]
  const n = Math.max(c.personasSinTarifa, unicos.length)
  const lista = unicos.slice(0, 4).map((f) => f.nombre ?? 'fila sin persona').join(', ')
  return `${n} ${n === 1 ? 'persona' : 'personas'} sin dato (tarifa en negro o neto mensual)`
    + `${lista ? `: ${lista}${unicos.length > 4 ? '…' : ''}` : ''}`
}

/** «$ X con recibo del estudio + $ Y ESTIMADO», o vacío. */
function fraseRealEstimado(c: CostoDeObra): string {
  const partes = [
    c.manoObraReal ? `${plata(c.manoObraReal)} con recibo del estudio` : null,
    c.manoObraEstimada ? `${plata(c.manoObraEstimada)} ESTIMADO (quincenas sin recibo todavía)` : null,
  ].filter((p): p is string => p != null)
  return partes.length ? ` — ${partes.join(' + ')}` : ''
}

/**
 * EL DETALLE DEL COSTO DE LA MANO DE OBRA, con la cuenta a la vista.
 *
 * `inicioISO` es la primera fecha con horas del trabajo —la misma que publica `hh_obra`— y no se
 * vuelve a pedir: pedirla de nuevo sería una segunda definición del inicio de la obra.
 */
export function tituloManoObra(
  c: CostoDeObra | null | undefined, inicioISO: string | null | undefined,
): string | null {
  if (!c) return null
  if (!c.puedeVerTarifas) {
    return 'No puedo valorizar las horas de este trabajo: los recibos y las tarifas los lee Administración.'
  }
  const desde = `${inicioISO ? ` · desde ${diaMesISO(inicioISO)}` : ''}${c.corte ? ` hasta ${diaMesISO(c.corte)}` : ''}`
  if (c.manoObra == null) {
    const h = c.horasSinTarifa
    if (h == null) return null
    return `${fmtHoras(h)} h cargadas y SIN VALORIZAR${desde}. ${faltaParaValorizar(c)}.`
  }
  const base = `${fmtHoras(c.horasValorizadas ?? 0)} h${desde}: costo total empleador del recibo + parte en negro, `
    + `repartidos por horas${fraseRealEstimado(c)}`
  const sello = c.selladoHasta
    ? ` Quincenas selladas hasta ${diaMesISO(c.selladoHasta)}; la abierta, en vivo.`
    : ' Ninguna quincena sellada: todo en vivo.'
  if ((c.horasSinTarifa ?? 0) === 0) return `${base}.${sello} Horas propias: los subcontratos van aparte.`
  return `PARCIAL — ${base}.${sello} Quedan ${fmtHoras(c.horasSinTarifa ?? 0)} h sin valorizar: `
    + `${faltaParaValorizar(c)}.`
}

/** Horas sin decimales, en es-AR. El formato de plata lo pone `plata`, que ya es el del repo. */
function fmtHoras(n: number): string {
  return Math.round(n).toLocaleString('es-AR')
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LOS GASTOS DEL CLIENTE SIN OBRA ASIGNADA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Lo que `costo_sin_obra` publica por cliente. */
export interface GastoSinObra {
  clienteId: string
  materiales: number | null
  subcontratos: number | null
  nComprobantes: number
  comprometidoFuturo: number | null
  /** Los detalles (columna K) más grandes: es lo que permite cargar el alias que falta. */
  detalles: { detalle: string; total: number }[]
  corte: string | null
}

/**
 * `costo_sin_obra` → por cliente. `null` = NO SE PUDO LEER (rol, cara, o migración sin aplicar); un
 * `Map` vacío = ningún cliente tiene gastos sin obra. Son dos hechos y la fila los dice distinto.
 */
export function armarGastosSinObra(filas: unknown[] | null | undefined): Map<string, GastoSinObra> | null {
  if (filas == null) return null
  const m = new Map<string, GastoSinObra>()
  for (const f of filas) {
    const r = f as Record<string, unknown>
    const clienteId = texto(r.cliente_id)
    if (!clienteId) continue
    const detalles = Array.isArray(r.detalles)
      ? r.detalles.flatMap((d) => {
        const x = d as Record<string, unknown>
        const t = num(x.total)
        return texto(x.detalle) && t != null ? [{ detalle: texto(x.detalle) as string, total: t }] : []
      })
      : []
    m.set(clienteId, {
      clienteId, materiales: num(r.materiales), subcontratos: num(r.subcontratos),
      nComprobantes: entero(r.n_comprobantes), comprometidoFuturo: num(r.comprometido_futuro),
      detalles, corte: texto(r.corte)?.slice(0, 10) ?? null,
    })
  }
  return m
}

/** La suma que la fila «sin obra asignada» publica: materiales + subcontratos, lo que la K no atribuyó. */
export function importeSinObra(g: GastoSinObra | null | undefined): number | null {
  if (!g || (g.materiales == null && g.subcontratos == null)) return null
  return (g.materiales ?? 0) + (g.subcontratos ?? 0)
}

/** El `title` de la fila: por qué no tiene obra y cuáles son los detalles más grandes. */
export function tituloSinObra(g: GastoSinObra | null | undefined): string | null {
  if (!g) return null
  const detalles = g.detalles.map((d) => `${d.detalle} ${plata(d.total)}`).join(' · ')
  return `Compras de este cliente${aLaFecha(g.corte)} cuya columna K no nombra una de sus obras `
    + `(${g.nComprobantes} ${g.nComprobantes === 1 ? 'comprobante' : 'comprobantes'}). No se reparten: `
    + 'se asignan cargando el alias de la obra. '
    + (detalles ? `Los más grandes: ${detalles}.` : '')
    + (g.subcontratos ? ` Incluye ${plata(g.subcontratos)} de subcontratos.` : '')
    + fraseFuturo(g.comprometidoFuturo)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL PIE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * LA CELDA DE MATERIALES DE UN CLIENTE EN LA CARTERA. Vacío = no se pudo leer (misma regla que la
 * celda de la obra); «—» = se leyó y no hay ninguna compra.
 */
export function textoTotalMateriales(t: TotalesDelCliente): string {
  return t.legible ? plata(t.materiales) : ''
}

/** LA CELDA DE MANO DE OBRA DE UN CLIENTE: el total, «sin valorizar» o vacío, y si está incompleto. */
export function textoTotalManoObra(t: TotalesDelCliente): CeldaManoObra {
  if (!t.legible) return { texto: '', parcial: false, estimado: false }
  if (t.manoObra == null) {
    return t.horasSinValorizar > 0
      ? { texto: 'sin valorizar', parcial: true, estimado: false }
      : { texto: '—', parcial: false, estimado: false }
  }
  return { texto: plata(t.manoObra), parcial: t.manoObraParcial, estimado: t.manoObraEstimada > 0 }
}

/** El pie de la tabla: lo gastado por el cliente en todos sus trabajos. */
export interface TotalesDelCliente {
  /**
   * `false` = NO SE PUDO LEER (la cara no transporta los costos, o el rol no es Administración).
   *
   * Sin este campo el pie decía «—» y «sin valorizar» —«ningún trabajo tiene compras» y «falta
   * cargar un dato»— sobre un cliente del que no había leído NADA (captura de Quattropani, 12/09/2026).
   */
  legible: boolean
  /** Σ de lo asignado en Compras a sus obras MÁS lo que quedó sin obra. `null` = ninguna compra. */
  materiales: number | null
  /** La parte de `materiales` que es «sin obra asignada», para que el pie pueda decirlo. */
  materialesSinObra: number | null
  /** Σ de la mano de obra valorizada. `null` = no se pudo valorizar NINGUNA hora. */
  manoObra: number | null
  /** `true` = hay horas que quedaron afuera del total de mano de obra. */
  manoObraParcial: boolean
  /** La parte estimada del total de mano de obra. */
  manoObraEstimada: number
  /** Las horas que el total NO incluye, para poder decirlo en el pie. */
  horasSinValorizar: number
}

/**
 * LOS DOS TOTALES, SUMADOS DE LAS MISMAS FILAS QUE DIBUJA LA TABLA — incluida la fila sin obra.
 *
 * Cada trabajo publica LO SUYO —un adicional no suma a su obra mayor— así que sumar las filas no cuenta
 * dos veces el mismo peso ni el mismo jornal. La fila «sin obra asignada» ENTRA: sin ella el total del
 * cliente sería más chico que lo que Compras le imputa.
 *
 * UN TOTAL DE MANO DE OBRA AL QUE LE FALTAN HORAS LO DICE: sumar lo valorizado y publicarlo liso daría
 * un total que parece completo.
 */
export function totalesDelCliente(
  costos: ReadonlyMap<string, CostoDeObra> | null | undefined,
  obraIds: readonly string[],
  sinObra: GastoSinObra | null = null,
): TotalesDelCliente {
  const vacio: TotalesDelCliente = {
    legible: false, materiales: null, materialesSinObra: null, manoObra: null,
    manoObraParcial: false, manoObraEstimada: 0, horasSinValorizar: 0,
  }
  if (!costos) return vacio
  let materiales: number | null = null
  let manoObra: number | null = null
  let horasSinValorizar = 0
  let manoObraEstimada = 0
  for (const id of obraIds) {
    const c = costos.get(id)
    if (!c) continue
    if (c.materiales != null) materiales = (materiales ?? 0) + c.materiales
    if (c.manoObra != null) manoObra = (manoObra ?? 0) + c.manoObra
    horasSinValorizar += c.horasSinTarifa ?? 0
    manoObraEstimada += c.manoObraEstimada ?? 0
  }
  const materialesSinObra = importeSinObra(sinObra)
  if (materialesSinObra != null) materiales = (materiales ?? 0) + materialesSinObra
  return {
    legible: true, materiales, materialesSinObra, manoObra,
    manoObraParcial: horasSinValorizar > 0, manoObraEstimada, horasSinValorizar,
  }
}
