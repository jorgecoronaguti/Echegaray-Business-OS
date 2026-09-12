// LO QUE LLEVA GASTADO CADA TRABAJO, COMO LO DIBUJA LA FICHA DEL CLIENTE.
//
// ═══ POR QUÉ EXISTE (dueño, 12/09/2026) ═══
//
// «Necesito que cada obra tenga, así como las HH que lleva, los costos de obra aparejados: en una
// columna que sume materiales gastados y mano de obra en otra.»
//
// ═══ LA REGLA QUE ESTE ARCHIVO DEFIENDE ═══
//
// Ninguna ausencia se dibuja como un cero, y son CUATRO ausencias distintas que se leen distinto:
//
//   · el trabajo no tiene nada imputado      → «—»              (la base contestó: ninguna compra)
//   · no puedo leerlo (rol)                  → vacío            (`costo_obra` llega `null`)
//   · tiene horas y NO se pueden valorizar   → «sin valorizar»  (falta cargar alícuotas o tarifas)
//   · se valorizó una parte                  → el importe en ámbar, y el `title` dice cuánto falta
//
// El tercero y el cuarto son lo que hay HOY: medido el 12/09/2026, `costo_hora_alicuota` está vacía
// —sin una sola alícuota no hay multiplicador, y sin multiplicador la hora no tiene costo— y
// `persona_tarifa` arranca el 01/09/2026 contra horas cargadas desde el 05/01/2026. Un $ 0 ahí se
// leería como «esta obra no tuvo mano de obra» sobre una obra con 9.293 horas.
//
// Los números NO se calculan acá: los trae `costo_obra` de `pantalla_cliente`, que lee las MISMAS
// filas de Compras que `obra_costo_real` y valoriza las horas con la regla de la solapa «Costo a la
// obra» de Liquidación. Este archivo convierte, da formato y decide qué dice cada hueco.

// LAS RUTAS VAN RELATIVAS Y CON EXTENSIÓN: el alias `@/` lo resuelve el bundler, no `node --test`.
import { plata } from '../../../shared/utils/format.ts'
import { diaMesISO } from '../../../shared/utils/fecha.ts'

/** Lo que la clave `costo_obra` publica por trabajo. */
export interface CostoDeObra {
  obraId: string
  /** Σ de las compras imputadas al trabajo, sin nómina, sin anuladas y sin subcontratos. */
  materiales: number | null
  /** Mano de obra FACTURADA por terceros (rubro «Subcontratos y mano de obra»). No es material y no
   *  es la mano de obra propia: viaja aparte para que no desaparezca al excluirla. */
  subcontratos: number | null
  nComprobantes: number
  /** ISO `YYYY-MM-DD` del último comprobante imputado. */
  ultimoComprobante: string | null
  /** Horas propias × tarifa vigente × multiplicador de cargas. `null` = no se pudo valorizar NADA. */
  manoObra: number | null
  /** Las horas que hay detrás de `manoObra`. */
  horasValorizadas: number | null
  /** Las horas que NO se pudieron valorizar: sin tarifa vigente o sin multiplicador a su fecha. */
  horasSinTarifa: number | null
  personasSinTarifa: number
  /** El multiplicador vigente HOY. `null` = no hay ninguna alícuota de costo cargada. */
  multiplicador: number | null
  /** `false` = la RLS de `persona_tarifa`/`costo_hora_alicuota` (`liquida_sueldos()`) no deja leer
   *  las tarifas. Es «no puedo», no «falta cargarlas», y la celda lo dibuja distinto. */
  puedeVerTarifas: boolean
}

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
      horasValorizadas: num(r.horas_valorizadas),
      horasSinTarifa: num(r.horas_sin_tarifa),
      personasSinTarifa: entero(r.personas_sin_tarifa),
      multiplicador: num(r.multiplicador),
      puedeVerTarifas: r.puede_ver_tarifas !== false,
    })
  }
  return m
}

/** MATERIALES: el importe o «—». Sin decimales y en es-AR, como el resto de la columna de plata. */
export function textoMateriales(c: CostoDeObra | null | undefined): string {
  return plata(c?.materiales ?? null)
}

/** El detalle que respalda el importe de materiales. `null` cuando no hay nada que respaldar. */
export function tituloMateriales(c: CostoDeObra | null | undefined): string | null {
  if (!c || c.materiales == null) return null
  const partes = [
    'Compras imputadas a la obra',
    `${c.nComprobantes} ${c.nComprobantes === 1 ? 'comprobante' : 'comprobantes'}`,
    c.ultimoComprobante ? `último ${diaMesISO(c.ultimoComprobante)}` : null,
  ].filter((p) => p != null)
  // QUÉ NO ENTRA, DICHO EN LA CELDA: sin esta frase, la diferencia contra el «costo real» de la ficha
  // de la obra —que sí suma la nómina imputada— se lee como un error de alguno de los dos.
  let t = `${partes.join(' · ')}. Materiales y servicios de obra: no entran nómina, cargas, ARCA `
    + 'ni financiero.'
  if (c.subcontratos != null) {
    // LOS SUBCONTRATOS NO DESAPARECEN AL EXCLUIRLOS. Son mano de obra facturada por un tercero: no
    // son material, y tampoco pueden sumarse a la columna de al lado, que son las horas PROPIAS.
    t += ` Aparte, ${plata(c.subcontratos)} de subcontratos y mano de obra facturada, que no son `
      + 'material ni salen de las horas propias.'
  }
  return t
}

/** Lo que dibuja la celda de mano de obra, con de dónde salió cada variante. */
export interface CeldaManoObra {
  /** El importe, «sin valorizar», «—» o '' (vacío = no puedo leerlo). */
  texto: string
  /** `true` = el número está incompleto o falta cargar un dato: la celda va en ámbar. */
  parcial: boolean
}

/**
 * MANO DE OBRA: el costo de las horas propias, o la palabra que dice por qué no hay número.
 *
 * «Sin valorizar» es una PALABRA y no un cero porque el hueco es de DATO y se puede resolver hoy:
 * faltan las alícuotas de costo o la tarifa de alguien. Un «$ 0» diría que la obra no tuvo mano de
 * obra, que es la afirmación opuesta.
 */
export function textoManoObra(c: CostoDeObra | null | undefined): CeldaManoObra {
  if (!c) return { texto: '—', parcial: false }
  // NO PUEDO LEER LAS TARIFAS: vacío, igual que las HH de un rol sin permiso. «Sin valorizar» diría
  // que falta cargar un dato, y lo que falta es el permiso.
  if (!c.puedeVerTarifas) return { texto: '', parcial: false }
  const conHoras = (c.horasValorizadas ?? 0) + (c.horasSinTarifa ?? 0) > 0
  if (c.manoObra == null) {
    return conHoras ? { texto: 'sin valorizar', parcial: true } : { texto: '—', parcial: false }
  }
  return { texto: plata(c.manoObra), parcial: (c.horasSinTarifa ?? 0) > 0 }
}

/** Lo que falta para poder valorizar. Vacío = no falta nada. */
function faltaParaValorizar(c: CostoDeObra): string[] {
  return [
    c.multiplicador == null
      ? 'faltan las alícuotas de costo (cargas, ART, fondo de cese, seguro, no trabajado pago), '
        + 'que se cargan en Administración → Liquidación'
      : null,
    c.personasSinTarifa > 0
      ? `${c.personasSinTarifa} ${c.personasSinTarifa === 1 ? 'persona' : 'personas'} sin valor hora `
        + 'vigente a la fecha en que trabajó'
      : null,
  ].filter((x): x is string => x != null)
}

/**
 * EL DETALLE DEL COSTO DE LA MANO DE OBRA, con la cuenta a la vista.
 *
 * `inicioISO` es la primera fecha con horas del trabajo —la misma que publica `hh_obra`— y no se
 * vuelve a pedir: el `title` la necesita para decir desde cuándo se acumula, y pedirla de nuevo
 * sería una segunda definición del inicio de la obra.
 */
export function tituloManoObra(
  c: CostoDeObra | null | undefined, inicioISO: string | null | undefined,
): string | null {
  if (!c) return null
  if (!c.puedeVerTarifas) {
    return 'No puedo valorizar las horas de este trabajo: las tarifas y las alícuotas las lee '
      + 'Administración.'
  }
  const desde = inicioISO ? ` · desde ${diaMesISO(inicioISO)}` : ''
  const falta = faltaParaValorizar(c)
  if (c.manoObra == null) {
    const h = c.horasSinTarifa
    if (h == null) return null
    return `${fmtHoras(h)} h cargadas y SIN VALORIZAR${desde}. ${falta.join('; ')}.`
  }
  const base = `${fmtHoras(c.horasValorizadas ?? 0)} h × tarifa vigente × cargas`
    + `${c.multiplicador == null ? '' : ` (×${c.multiplicador.toLocaleString('es-AR', { maximumFractionDigits: 3 })})`}`
    + desde
  if ((c.horasSinTarifa ?? 0) === 0) return `${base}. Horas propias: los subcontratos van aparte.`
  return `PARCIAL — ${base}. Quedan ${fmtHoras(c.horasSinTarifa ?? 0)} h sin valorizar: `
    + `${falta.join('; ')}.`
}

/** Horas sin decimales, en es-AR. El formato de plata lo pone `plata`, que ya es el del repo. */
function fmtHoras(n: number): string {
  return Math.round(n).toLocaleString('es-AR')
}

/** El pie de la tabla: lo gastado por el cliente en todos sus trabajos. */
export interface TotalesDelCliente {
  /** Σ de lo imputado en Compras. `null` = ningún trabajo tiene una compra imputada. */
  materiales: number | null
  /** Σ de la mano de obra valorizada. `null` = no se pudo valorizar NINGUNA hora. */
  manoObra: number | null
  /** `true` = hay horas que quedaron afuera del total de mano de obra. */
  manoObraParcial: boolean
  /** Las horas que el total NO incluye, para poder decirlo en el pie. */
  horasSinValorizar: number
}

/**
 * LOS DOS TOTALES, SUMADOS DE LAS MISMAS FILAS QUE DIBUJA LA TABLA.
 *
 * No se piden a la base por la razón de siempre: cada trabajo publica LO SUYO —un adicional no suma
 * a su obra mayor— así que sumar las filas no cuenta dos veces el mismo peso ni el mismo jornal.
 *
 * UN TOTAL DE MANO DE OBRA AL QUE LE FALTAN HORAS LO DICE. Sumar lo valorizado y publicarlo liso
 * daría un total que parece completo: es el mismo defecto que la solapa «Costo a la obra» evita
 * diciendo «N obras sin costo publicable».
 */
export function totalesDelCliente(
  costos: ReadonlyMap<string, CostoDeObra> | null | undefined,
  obraIds: readonly string[],
): TotalesDelCliente {
  const vacio: TotalesDelCliente = {
    materiales: null, manoObra: null, manoObraParcial: false, horasSinValorizar: 0,
  }
  if (!costos) return vacio
  let materiales: number | null = null
  let manoObra: number | null = null
  let horasSinValorizar = 0
  for (const id of obraIds) {
    const c = costos.get(id)
    if (!c) continue
    if (c.materiales != null) materiales = (materiales ?? 0) + c.materiales
    if (c.manoObra != null) manoObra = (manoObra ?? 0) + c.manoObra
    horasSinValorizar += c.horasSinTarifa ?? 0
  }
  return { materiales, manoObra, manoObraParcial: horasSinValorizar > 0, horasSinValorizar }
}
