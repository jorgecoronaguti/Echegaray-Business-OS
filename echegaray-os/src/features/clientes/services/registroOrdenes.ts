// EL REGISTRO DE ÓRDENES DEL CLIENTE — la OC como compromiso con saldo, la OP como pago a conciliar.
//
// ═══ EL PEDIDO (dueño, 13/09/2026) ═══
//
// «Un desastre la sección Órdenes de compra y pago, es como tirar documentos y archivos sin sentido
// alguno. Revisar el funcionamiento de un CRM en general y aplicarlo.» La solapa listaba PDFs
// agrupados por trabajo con un conteo arriba: contestaba «qué papeles llegaron» y no «cuánto me
// queda por facturar contra lo que el cliente autorizó», que es para lo que existe una OC.
//
// Un ERP de proyectos trata la orden como un REGISTRO con estado y saldo, y el archivo como su
// evidencia. Eso es este archivo: puro, sin base ni pantalla, y la única definición del registro.
//
// ═══ QUÉ NO DECIDE ═══
//
//   · QUÉ ES UNA ORDEN, sus copias y sus vínculos: `agruparPapeles` (papelesCliente.ts).
//   · QUÉ OC CITA CADA FILA DE COBRANZAS: `public.oc_declarada()`, que llega ya resuelta como
//     `orden_declarada` desde `cobranza_imputacion`. `ordenDeLaFila` (cobranzasCliente.ts) es OTRA
//     regla —más estricta, para dibujar la columna— y no lee «53312775 6A», el formato de ARCOR: usarla
//     acá dejaría a ARCOR sin nada facturado contra sus 40 OC.
//   · QUÉ ESTÁ COBRADO: `es_cobrada()` en la base (`esta_cobrada`).
//
// ═══ LO QUE NO SE PUEDE ATAR NO SE REPARTE ═══
//
// Una fila de Cobranzas que no declara OC, o que declara una OC sin papel (la 2135 de Messina), va a
// «sin imputar» con su importe. Repartirla entre las OC de su obra a ojo sería fabricar un saldo.

import { z } from 'zod'
import type { FilaCobranza } from './cobranzasCliente.ts'
import {
  anclaDeOrden, canonico, corto, hrefDelPapel, VARIAS_OBRAS, type Orden, type PapelesDelCliente,
} from './papelesCliente.ts'
import { jerarquiaDeObras, type ObraConPadre } from './obrasAdicionales.ts'

/** Una fila de `cliente_cobranza` con la OC que declara según `cobranza_imputacion`. */
export interface CobranzaConOrden extends FilaCobranza {
  /** Canónico («2-2173») o `null` = la columna H no declara ninguna. */
  orden_declarada: string | null
}

/** Hasta un peso de diferencia es la misma cifra: el Sheet redondea al centavo y la OC también. */
export const TOLERANCIA = 1

export type EstadoOC =
  | 'sin-dato' | 'sin-importe' | 'otra-moneda' | 'sin-facturar' | 'parcial' | 'facturada' | 'excedida'

// ═══ LO FACTURADO ES UN MÍNIMO, Y EL SALDO UN MÁXIMO (medido el 13/09/2026) ═══
//
// Sólo suma lo que Cobranzas CITA. La pestaña no es completa hacia atrás: las OC 1122 y 865 de
// Messina (2025) no tienen ninguna fila que las cite y las OP 2983 y 2151 dicen que se pagaron. Por
// eso el estado de una OC sin citas NO es «vigente» —afirmaría que no se facturó— sino lo que se
// sabe: «sin factura citada». Tampoco se empareja por importe OP↔OC para taparlo: acertaría a veces
// y dibujaría una inferencia como hecho.
export const ROTULO_ESTADO: Record<EstadoOC, string> = {
  'sin-dato': 'sin lectura',
  'sin-importe': 'sin importe',
  'otra-moneda': 'en U$S',
  'sin-facturar': 'sin factura citada',
  parcial: 'facturada parcial',
  facturada: 'facturada total',
  excedida: 'facturado de más',
}

/** Un renglón de Cobranzas, reducido a lo que el registro necesita para citarlo. */
export interface Renglon {
  fila: string | null
  obraId: string | null
  comprobante: string | null
  fecha: string | null
  /** En la unidad de la OC contra la que se mide: con IVA salvo que la OC declare neto. */
  importe: number | null
  circuito: 'B' | 'N'
  emitida: boolean
  cobrada: boolean
}

export interface FilaOC {
  ancla: string
  numeroCorto: string | null
  numeroCanonico: string | null
  fecha: string | null
  obraId: string | null
  importe: number | null
  moneda: string | null
  /** `true` = el importe de la OC es SIN IVA (ARCOR) y se compara contra el neto facturado. */
  neto: boolean
  /** `null` = Cobranzas no se pudo leer. `0` = se leyó y ninguna factura cita esta OC. */
  facturado: number | null
  cobrado: number | null
  /** Filas B que citan la OC con emisión futura: programado, todavía no facturado. */
  aFacturar: number | null
  /** Filas N que la citan. No es facturado (circuito sin comprobante) y no descuenta saldo. */
  enN: number | null
  saldo: number | null
  estado: EstadoOC
  renglones: Renglon[]
  pagadaPor: string[]
  href: string
  enDrive: boolean
  copias: number
}

export interface FilaOP {
  ancla: string
  numeroCorto: string | null
  fecha: string | null
  obraId: string | null
  /** Lo que la OP declara pagar. `null` = el PDF no lo dice. */
  importe: number | null
  moneda: string | null
  /** Σ de sus certificados; `null` = no llegó ninguno o alguno no trae importe. Nunca cero. */
  retenciones: number | null
  nRetenciones: number
  neto: number | null
  /** Las facturas que la OP cita. Vacío = no consta (la cita de la OP no se extrae todavía). */
  facturas: string[]
  /** Alguna de sus facturas figura cobrada en Cobranzas. */
  cobroAtado: boolean
  href: string
  enDrive: boolean
}

export interface Registro {
  oc: FilaOC[]
  op: FilaOP[]
  /** Renglones B de Cobranzas que no se atan a ninguna OC con papel. */
  sinImputar: Renglon[]
  /** OC citadas en Cobranzas que no tienen papel en `cliente_orden`. */
  ocSinPapel: string[]
  /** Cobros de Cobranzas que ninguna OP cita. */
  cobrosSinOP: Renglon[]
  cobranzasLeidas: boolean
}

/** Redondea al centavo y normaliza −0: un saldo no puede ser «menos cero». */
const alCentavo = (n: number): number => Math.round(n * 100) / 100 || 0

const suma = (v: (number | null)[]): number | null => {
  const con = v.filter((x): x is number => x != null)
  return con.length ? con.reduce((a, b) => a + b, 0) : null
}

/** Emitida = tiene comprobante, o su fecha de emisión ya pasó. Una B futura es un plan. */
function emitida(f: FilaCobranza, hoy: string): boolean {
  if (f.numero_comprobante && f.numero_comprobante.trim()) return true
  return Boolean(f.fecha_emision && f.fecha_emision.slice(0, 10) <= hoy)
}

function renglonDe(f: FilaCobranza, hoy: string, neto: boolean): Renglon {
  return {
    fila: f.fila,
    obraId: f.obra_id,
    comprobante: corto(f.numero_comprobante),
    fecha: f.fecha_emision,
    importe: neto ? f.monto_neto : f.total_bruto,
    circuito: f.categoria === 'B' ? 'B' : 'N',
    emitida: emitida(f, hoy),
    cobrada: f.esta_cobrada,
  }
}

export function estadoDeOC(
  { importe, moneda, facturado }: { importe: number | null; moneda: string | null; facturado: number | null },
): EstadoOC {
  if (facturado === null) return 'sin-dato'
  if (importe === null) return 'sin-importe'
  if (moneda === 'USD') return 'otra-moneda'
  if (facturado <= TOLERANCIA) return 'sin-facturar'
  if (facturado > importe + TOLERANCIA) return 'excedida'
  if (facturado >= importe - TOLERANCIA) return 'facturada'
  return 'parcial'
}

function filaOC(o: Orden, citan: FilaCobranza[] | null, neto: boolean, hoy: string): FilaOC {
  const renglones = (citan ?? []).map((f) => renglonDe(f, hoy, neto))
  const b = renglones.filter((r) => r.circuito === 'B')
  const facturado = citan === null ? null : (suma(b.filter((r) => r.emitida).map((r) => r.importe)) ?? 0)
  const cobrado = citan === null ? null : (suma(b.filter((r) => r.cobrada).map((r) => r.importe)) ?? 0)
  const estado = estadoDeOC({ importe: o.importe, moneda: o.moneda, facturado })
  const comparable = !['sin-dato', 'sin-importe', 'otra-moneda'].includes(estado)
  return {
    ancla: anclaDeOrden(o),
    numeroCorto: o.numeroCorto,
    numeroCanonico: o.numeroCanonico,
    fecha: o.fecha,
    obraId: o.obraId === VARIAS_OBRAS ? null : o.obraId,
    importe: o.importe,
    moneda: o.moneda,
    neto,
    facturado,
    cobrado,
    aFacturar: suma(b.filter((r) => !r.emitida).map((r) => r.importe)),
    enN: suma(renglones.filter((r) => r.circuito === 'N').map((r) => r.importe)),
    // AL CENTAVO: 24.309.950,07 − (Σ de dos facturas en coma flotante) daba −0,0000001 y la pantalla
    // escribía «$ -0» (captura del 13/09/2026, OC 2266).
    saldo: comparable && o.importe !== null && facturado !== null ? alCentavo(o.importe - facturado) : null,
    estado,
    renglones,
    pagadaPor: o.pagadaPor,
    href: hrefDelPapel({ driveFileId: o.driveFileId, archivoId: o.archivoId }),
    enDrive: Boolean(o.driveFileId),
    copias: o.ids.length,
  }
}

function filaOP(o: Orden, cobranzas: readonly FilaCobranza[]): FilaOP {
  const conImporte = o.retenciones.map((r) => r.importe)
  const retenciones = conImporte.length && conImporte.every((v) => v != null) ? suma(conImporte) : null
  const facturas = new Set(o.facturas.map((f) => f.numeroCanonico).filter((x): x is string => Boolean(x)))
  return {
    ancla: anclaDeOrden(o),
    numeroCorto: o.numeroCorto,
    fecha: o.fecha,
    obraId: o.obraId,
    importe: o.importe,
    moneda: o.moneda,
    retenciones,
    nRetenciones: o.retenciones.length,
    neto: o.importe !== null && retenciones !== null ? o.importe - retenciones : null,
    facturas: o.facturas.map((f) => f.numeroCorto ?? 's/n'),
    cobroAtado: cobranzas.some((f) => f.esta_cobrada && facturas.has(canonico(f.numero_comprobante) ?? '')),
    href: hrefDelPapel({ driveFileId: o.driveFileId, archivoId: o.archivoId }),
    enDrive: Boolean(o.driveFileId),
  }
}

/**
 * EL REGISTRO ENTERO DE UN CLIENTE.
 *
 * `cobranzas === null` = no se pudo leer: cada OC sale `sin-dato` y sin saldo, nunca con cero
 * facturado. `netas` = ids de `cliente_orden` con `importe_es_neto`; una OC es neta si lo es
 * cualquiera de sus copias (la marca es del cliente, no del mail).
 */
export function armarRegistro({ papeles, cobranzas, netas, hoy }: {
  papeles: PapelesDelCliente
  cobranzas: readonly CobranzaConOrden[] | null
  netas: ReadonlySet<string>
  hoy: string
}): Registro {
  const vivas = (cobranzas ?? []).filter((f) => !f.esta_cancelada)
  const porOC = new Map<string, CobranzaConOrden[]>()
  for (const f of vivas) {
    const n = canonico(f.orden_declarada)
    if (n) porOC.set(n, [...(porOC.get(n) ?? []), f])
  }
  const conPapel = new Set(papeles.oc.map((o) => o.numeroCanonico).filter(Boolean))
  const oc = papeles.oc.map((o) => filaOC(
    o,
    cobranzas === null ? null : (o.numeroCanonico ? porOC.get(o.numeroCanonico) ?? [] : []),
    o.ids.some((id) => netas.has(id)),
    hoy,
  ))
  const op = papeles.op.map((o) => filaOP(o, vivas))
  const citadas = new Set(papeles.op.flatMap((o) => o.facturas.map((f) => f.numeroCanonico)))
  return {
    oc,
    op,
    sinImputar: vivas
      .filter((f) => f.categoria === 'B' && !conPapel.has(canonico(f.orden_declarada) ?? ''))
      .map((f) => renglonDe(f, hoy, false)),
    ocSinPapel: [...porOC.keys()].filter((n) => !conPapel.has(n)).map((n) => n.split('-').pop() ?? n),
    cobrosSinOP: vivas
      .filter((f) => f.esta_cobrada && !citadas.has(canonico(f.numero_comprobante)))
      .map((f) => renglonDe(f, hoy, false)),
    cobranzasLeidas: cobranzas !== null,
  }
}

// ── LOS TOTALES ─────────────────────────────────────────────────────────────────────────────────

export interface TotalOC {
  n: number
  importe: number | null
  facturado: number | null
  cobrado: number | null
  saldo: number | null
  /** Alguna OC no suma (sin importe, en U$S, sin lectura) o se mezclan neto y con IVA. */
  incompleto: boolean
}

/**
 * UN TOTAL NO MEZCLA UNIDADES. Neto con IVA sumados darían un número que no es ninguno de los dos:
 * si el grupo mezcla, los importes salen `null` y el total se declara incompleto.
 */
export function totalDeOC(filas: readonly FilaOC[]): TotalOC {
  const sumables = filas.filter((f) => f.saldo !== null)
  const mezcla = new Set(sumables.map((f) => f.neto)).size > 1
  const de = (k: 'importe' | 'facturado' | 'cobrado' | 'saldo') =>
    (mezcla ? null : suma(sumables.map((f) => f[k])))
  return {
    n: filas.length,
    importe: de('importe'),
    facturado: de('facturado'),
    cobrado: de('cobrado'),
    saldo: de('saldo'),
    incompleto: mezcla || sumables.length < filas.length,
  }
}

/** El total de lo que se DIBUJA: los grupos ya filtrados, con la misma regla que cada grupo. */
export function totalDeGrupos(grupos: readonly GrupoRegistro[]): TotalOC {
  return totalDeOC(grupos.flatMap((g) => g.oc))
}

/** Σ de renglones con IVA. `null` = ninguno trae importe. */
export function importeDeRenglones(r: readonly Renglon[]): number | null {
  return suma(r.map((x) => x.importe))
}

export interface TotalOP { n: number; importe: number | null; incompleto: boolean }

export function totalDeOP(filas: readonly FilaOP[]): TotalOP {
  const con = filas.filter((f) => f.importe !== null && f.moneda !== 'USD')
  return { n: filas.length, importe: suma(con.map((f) => f.importe)), incompleto: con.length < filas.length }
}

// ── POR TRABAJO ─────────────────────────────────────────────────────────────────────────────────

/** La clave del grupo de lo que no tiene trabajo: OP de varias obras o papeles sin atribuir. */
export const SIN_TRABAJO = 'sin-trabajo'

export interface ObraDelRegistro extends ObraConPadre { nombre: string }

export interface GrupoRegistro {
  clave: string
  nombre: string
  nivel: 0 | 1
  esAdicional: boolean
  oc: FilaOC[]
  op: FilaOP[]
  totalOC: TotalOC
  totalOP: TotalOP
}

/**
 * EN EL ORDEN DE LA FICHA, con los adicionales debajo de su obra mayor (`jerarquiaDeObras`, la misma
 * función que usa Trabajos). Sólo los trabajos con alguna orden; lo que cuelga de una obra que no
 * está en la lista va con su id, y lo sin trabajo cierra.
 */
export function agruparRegistro(reg: Registro, obras: readonly ObraDelRegistro[]): GrupoRegistro[] {
  const claveDe = (id: string | null) => (id && id !== VARIAS_OBRAS ? id : SIN_TRABAJO)
  const grupo = (clave: string, nombre: string, nivel: 0 | 1, esAdicional: boolean): GrupoRegistro => {
    const oc = reg.oc.filter((o) => claveDe(o.obraId) === clave)
    const op = reg.op.filter((o) => claveDe(o.obraId) === clave)
    return { clave, nombre, nivel, esAdicional, oc, op, totalOC: totalDeOC(oc), totalOP: totalDeOP(op) }
  }
  const conocidas = jerarquiaDeObras([...obras])
    .map((f) => grupo(f.obra.obra_id, f.obra.nombre, f.nivel, f.esAdicional))
  const vistas = new Set(obras.map((o) => o.obra_id))
  const ajenas = [...new Set([...reg.oc, ...reg.op].map((o) => claveDe(o.obraId)))]
    .filter((c) => c !== SIN_TRABAJO && !vistas.has(c))
    .map((c) => grupo(c, c, 0, false))
  return [...conocidas, ...ajenas, grupo(SIN_TRABAJO, 'Sin trabajo asignado', 0, false)]
    .filter((g) => g.oc.length || g.op.length)
}

// ── LOS FILTROS ─────────────────────────────────────────────────────────────────────────────────

export interface FiltroRegistro { obra: string | null; estado: EstadoOC | null; periodo: string | null }

const ESQUEMA_FILTRO = z.object({
  oobra: z.string().max(120).regex(/^[\w-]+$/).optional().catch(undefined),
  oestado: z.enum(Object.keys(ROTULO_ESTADO) as [EstadoOC, ...EstadoOC[]]).optional().catch(undefined),
  operiodo: z.string().regex(/^\d{4}$/).optional().catch(undefined),
})

/** Lo que viene en la URL es entrada de usuario: un valor que no valida se ignora, no se interpreta. */
export function leerFiltro(q: Record<string, unknown>): FiltroRegistro {
  const f = ESQUEMA_FILTRO.parse({ oobra: q.oobra, oestado: q.oestado, operiodo: q.operiodo })
  return { obra: f.oobra ?? null, estado: f.oestado ?? null, periodo: f.operiodo ?? null }
}

/** Los años que tienen alguna orden, del más nuevo al más viejo. */
export function periodosDe(reg: Registro): string[] {
  const anios = [...reg.oc, ...reg.op].map((o) => o.fecha?.slice(0, 4)).filter((a): a is string => Boolean(a))
  return [...new Set(anios)].sort().reverse()
}

/**
 * EL REGISTRO RECORTADO. Elegir una obra mayor trae también sus adicionales: son parte del mismo
 * compromiso con el cliente. El estado recorta sólo las OC (una OP no tiene saldo).
 */
export function filtrarRegistro(
  reg: Registro, f: FiltroRegistro, obras: readonly ObraDelRegistro[],
): Registro {
  const padre = new Map(obras.map((o) => [o.obra_id, o.obra_padre_id ?? null]))
  const deObra = (id: string | null) => {
    if (!f.obra) return true
    if (f.obra === SIN_TRABAJO) return !id || id === VARIAS_OBRAS
    return id === f.obra || (id !== null && padre.get(id) === f.obra)
  }
  const dePeriodo = (fecha: string | null) => !f.periodo || fecha?.slice(0, 4) === f.periodo
  return {
    ...reg,
    oc: reg.oc.filter((o) => deObra(o.obraId) && dePeriodo(o.fecha) && (!f.estado || o.estado === f.estado)),
    op: reg.op.filter((o) => deObra(o.obraId) && dePeriodo(o.fecha)),
    sinImputar: reg.sinImputar.filter((r) => deObra(r.obraId) && dePeriodo(r.fecha)),
    cobrosSinOP: reg.cobrosSinOP.filter((r) => deObra(r.obraId) && dePeriodo(r.fecha)),
  }
}
