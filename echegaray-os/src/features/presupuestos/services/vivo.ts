// EL PRESUPUESTO VIVO — lo que el encabezado del entorno afirma, derivado de las MISMAS filas.
//
// ═══ POR QUÉ ESTO ES UN SERVICE Y NO TRES CONTADORES EN LA PANTALLA ═══
//
// El encabezado del entorno xsas hace tres afirmaciones fuertes —cuánta certeza hay, qué parte del
// precio está firme y cuánto depende de lo que falta— y las tres son la clase de número que después
// se repite en una reunión. Contarlas dentro del `.tsx` las volvería inverificables: la única forma
// de probarlas sería abrir un navegador. Acá son funciones puras con tests, y la pantalla las dibuja.
//
// ═══ EL PRECIO FIRME NO SE SUMA ACÁ ═══
//
// `costo_directo` de `cotizacion_cascada` es `coalesce(sum(subtotal), 0)`: sólo suma las partidas
// que YA se pueden valorizar. Entonces el precio que sale de esa cascada **ya es** el precio firme,
// y volver a sumarlo acá daría un segundo camino al mismo número —el defecto del Excel, donde la
// misma cascada vivía dos veces y difería 13 %—. Lo que esta capa aporta es la CUENTA: cuántas filas
// están adentro de ese precio y cuántas quedaron afuera, para que el número no se lea como completo.
//
// ═══ NULL NUNCA ES CERO (REGLAS-DATOS §1, §2, §25) ═══
//
// Ninguna función de acá devuelve `0` para decir «no sé». Las pendientes se CUENTAN; su plata se
// suma sólo cuando existe, y cuando no existe se declara cuántas quedaron sin medir.

import type { CascadaMotor, Cola, Gate, IssueCola, PartidaDelMotor } from './cotizadorPuente.ts'
import type { Escalon } from './cascada.ts'

/**
 * El estado de una fila en el vocabulario del contrato v5, con UN color por fila (nunca por celda).
 *
 * `propuesto` está en la tabla porque es del contrato, pero esta pantalla NO puede producirlo:
 * `cotizacion_partida` no distingue lo que propuso xsas de lo que se calculó de la base maestra.
 * Devolverlo sin fuente sería inventar una procedencia (REGLAS-DATOS §3, §4).
 */
export type EstadoFila = 'confirmado' | 'extraido' | 'propuesto' | 'falta' | 'ambiguo' | 'excluido'

/** Los tokens del contrato. Amarillo no está: es acción primaria, selección y evidencia, no estado. */
export const COLOR_FILA: Record<EstadoFila, string> = {
  confirmado: '#067647',
  extraido: '#3A3A38',
  propuesto: '#175CD3',
  falta: '#B42318',
  ambiguo: '#B54708',
  excluido: '#91918B',
}

/**
 * LOS HUECOS DE UNA FILA, POR SU NOMBRE.
 *
 * «Sin precio» y «sin cómputo» son problemas DISTINTOS y se dicen distinto (§2): arreglar uno es
 * medir un plano y arreglar el otro es pedirle un número a un proveedor.
 */
export function huecosDe(p: PartidaDelMotor): string[] {
  const h: string[] = []
  if (p.cantidad === null) h.push('sin cómputo')
  if (p.sinAnalisis) h.push('sin análisis')
  if (p.subcontratada && p.precioSubcontrato === null) h.push('sin precio de subcontrato')
  return h
}

/** Una partida excluida por una decisión de alcance no cotiza: no es un hueco, es una decisión. */
export function estaExcluida(p: PartidaDelMotor): boolean {
  return p.alcance === 'EXCLUIDO'
}

/**
 * ¿ESTA FILA IMPIDE QUE HAYA UN PRECIO?
 *
 * ═══ NO TODO HUECO ES UN PROBLEMA DE PRECIO (medido contra la base, 03/09/2026) ═══
 *
 * La primera versión pintaba «con problema» cualquier fila con un hueco, y `sin análisis` es uno.
 * En COT-2026-001 —26 partidas importadas con `costo_unitario` cargado a mano y sin análisis— el
 * encabezado publicaba «26 con problema» y, dos centímetros más a la derecha, «26 partidas adentro
 * del precio». Las dos cosas eran ciertas y juntas no significaban nada.
 *
 * La certeza mide UNA cosa: si el número se puede sostener. Sin cantidad no hay número; sin importe
 * tampoco; un subcontrato sin precio deja un agujero. Que la fila no tenga genealogía es un problema
 * DISTINTO —§16: la oferta no puede contener costos sin genealogía— y se cuenta aparte, con su
 * nombre, en vez de mezclarse con el que impide cotizar.
 */
export function bloqueaElPrecio(p: PartidaDelMotor): boolean {
  if (p.cantidad === null) return true
  if (p.subcontratada && p.precioSubcontrato === null) return true
  return p.subtotal === null
}

/**
 * EL MOTIVO POR EL QUE UNA FILA NO ESTÁ RESUELTA — UNO SOLO, Y EN ESTE ORDEN.
 *
 * ═══ POR QUÉ UNA SOLA FUNCIÓN Y NO DOS CONTEOS ═══
 *
 * La certeza contaba «ambiguas» con el alcance ANTES del precio y los pendientes contaban «sin
 * alcance» con el precio antes del alcance. Una fila sin cantidad Y sin alcance caía en un casillero
 * distinto en cada lado, así que la misma franja publicaba dos números para la misma cosa. Ahora hay
 * una sola función y los dos conteos salen de ella: no pueden diferir porque no hay dos lugares.
 *
 * El orden es el del trabajo real: primero hay que poder valorizarla —sin cantidad no hay número que
 * discutir— y recién después tiene sentido preguntar si entra en el alcance.
 */
export type MotivoFila = 'excluida' | 'sin_valorizar' | 'sin_alcance' | 'confirmada' | 'extraida'

export function motivoDeFila(p: PartidaDelMotor): MotivoFila {
  if (estaExcluida(p)) return 'excluida'
  if (bloqueaElPrecio(p)) return 'sin_valorizar'
  // `null` es «nadie declaró», igual que POR_DEFINIR: sólo INCLUIDO es una decisión tomada.
  if (p.alcance !== 'INCLUIDO') return 'sin_alcance'
  // `congelada` es la ÚNICA marca de fijación que la fila trae. No es una confirmación humana con
  // autor y fecha —eso el modelo todavía no lo guarda— y por eso `Certeza.criterio` lo dice.
  if (p.congelada) return 'confirmada'
  return 'extraida'
}

const ESTADO_DE_MOTIVO: Record<MotivoFila, EstadoFila> = {
  excluida: 'excluido',
  sin_valorizar: 'falta',
  sin_alcance: 'ambiguo',
  confirmada: 'confirmado',
  extraida: 'extraido',
}

export function estadoDeFila(p: PartidaDelMotor): EstadoFila {
  return ESTADO_DE_MOTIVO[motivoDeFila(p)]
}

export interface Certeza {
  /** Partidas dentro del alcance. Las excluidas se cuentan aparte: no son incertidumbre. */
  total: number
  confirmadas: number
  porConfirmar: number
  /**
   * `ambiguas + faltantes`. Se conserva para la lectura rápida, pero NO se muestra solo: «con
   * problema» no dice qué problema, y los dos se arreglan de maneras opuestas —uno declarando el
   * alcance con el cliente, el otro midiendo o pidiendo un precio—.
   */
  conProblema: number
  /** Nadie declaró si entran en el alcance. Lo dice el motor, no esta capa. */
  ambiguas: number
  /** No se pueden valorizar: sin cómputo, sin importe, o subcontrato sin precio. */
  faltantes: number
  excluidas: number
  /**
   * Filas valorizadas que NO tienen análisis detrás: el número existe pero no se puede recorrer
   * hacia atrás (§16, §21). No impide cotizar, así que no entra en `conProblema` — pero tampoco se
   * calla, porque es lo que separa un presupuesto explicable de uno tipeado.
   */
  sinGenealogia: number
  /** Cómo se leyó «confirmada». Se muestra: una certeza sin criterio no se puede discutir. */
  criterio: string
}

const CRITERIO = 'Confirmada = composición fijada en la fila. `cotizacion_partida` no guarda todavía'
  + ' autor ni fecha de confirmación, así que ese acto humano no se puede mostrar.'

/** LA CERTEZA OBSERVABLE — contada de las filas, no un score. */
export function certezaDe(partidas: readonly PartidaDelMotor[]): Certeza {
  const motivos = partidas.map(motivoDeFila)
  const dentro = motivos.filter((m) => m !== 'excluida')
  const cuantas = (m: MotivoFila) => dentro.filter((x) => x === m).length
  return {
    total: dentro.length,
    confirmadas: cuantas('confirmada'),
    porConfirmar: cuantas('extraida'),
    conProblema: cuantas('sin_valorizar') + cuantas('sin_alcance'),
    // El MISMO número que `pendientesDe().sinAlcance`: sale de `motivoDeFila`, no de un filtro
    // paralelo. Un test lo afirma, porque es exactamente lo que se desincronizó una vez.
    ambiguas: cuantas('sin_alcance'),
    faltantes: cuantas('sin_valorizar'),
    excluidas: motivos.filter((m) => m === 'excluida').length,
    sinGenealogia: partidas.filter((p) => !estaExcluida(p) && !bloqueaElPrecio(p) && p.sinAnalisis).length,
    criterio: CRITERIO,
  }
}

export interface Firmeza {
  /** Filas que el costo directo YA contiene: tienen cantidad y tienen importe valorizado. */
  firmes: number
  /** Filas dentro del alcance que NO suman todavía. El precio de arriba no las incluye. */
  pendientes: number
  /**
   * La plata CONOCIDA de esas pendientes: el precio de subcontrato que está cargado y que la vista
   * no valoriza (`coalesce(costo_unitario, analisis)` no mira el subcontrato). `null` si no hay una
   * sola pendiente con monto — nunca `0`, que diría que lo que falta no cuesta nada.
   */
  montoPendienteConocido: number | null
  /** Cuántas pendientes no traen ni un monto: de ésas no se sabe cuánto van a mover el precio. */
  pendientesSinMonto: number
}

/**
 * QUÉ PARTE DEL PRESUPUESTO ESTÁ ADENTRO DEL PRECIO.
 *
 * «Firme» es lo que la vista pudo valorizar: cantidad no nula Y subtotal no nulo. Es exactamente el
 * conjunto que `costo_directo` sumó, así que la cuenta y el precio hablan del mismo universo.
 */
export function firmezaDe(partidas: readonly PartidaDelMotor[]): Firmeza {
  const dentro = partidas.filter((p) => !estaExcluida(p))
  const firmes = dentro.filter((p) => p.cantidad !== null && p.subtotal !== null)
  const pendientes = dentro.filter((p) => p.cantidad === null || p.subtotal === null)
  const conMonto = pendientes
    .map((p) => p.precioSubcontrato)
    .filter((v): v is number => v !== null && Number.isFinite(v))
  return {
    firmes: firmes.length,
    pendientes: pendientes.length,
    montoPendienteConocido: conMonto.length === 0 ? null : conMonto.reduce((a, b) => a + b, 0),
    pendientesSinMonto: pendientes.length - conMonto.length,
  }
}

/**
 * EL PRECIO FIRME — el de la cascada, publicado sólo cuando hay algo firme detrás.
 *
 * Sin una sola fila valorizada la vista igual devuelve un número (su `coalesce` produce 0 y la
 * cascada lo multiplica por el coeficiente). Ese número no es un precio: es la ausencia de uno, y
 * publicarlo diría que la empresa ofertó gratis.
 */
export function precioFirmeDe(cascada: CascadaMotor | null, f: Firmeza): number | null {
  if (f.firmes === 0) return null
  const v = cascada?.ventaSinIva
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return null
  return v
}

/** La traducción de los tipos de issue del motor. UNA sola, para que el chip y la cola coincidan. */
export const ROTULO_ISSUE: Record<string, string> = {
  FALTA_DATO: 'sin dato',
  CONFLICTO: 'en conflicto',
  AMBIGUO: 'ambiguas',
  SIN_PRECIO: 'sin precio',
  PRECIO_DESACTUALIZADO: 'con precio viejo',
  SUBCONTRATO_SIN_PRECIO: 'con subcontrato sin precio',
  OUTLIER_PENDING: 'con un cambio atípico sin resolver',
  COMMERCIAL_DECISION: 'con una decisión comercial abierta',
  UNIDAD_INCOMPATIBLE: 'con unidad incompatible',
  EXCLUSION_CON_COMPUTO: 'excluidas pero computadas',
  SIN_PARTIDA: 'sin partida',
  CANTIDAD_CRITICA_AUSENTE: 'sin cómputo',
  FUGA_ENTRE_CLIENTES: 'con dato de otro cliente',
  SIN_PRECIO_CALCULABLE: 'sin precio calculable',
  SIN_ALCANCE: 'sin alcance declarado',
  SIN_VALORIZAR: 'sin poder valorizar',
}

/** Hacia dónde puede mover el precio resolver este pendiente. */
export type Direccion = 'suma' | 'resta' | 'incierta'

export interface Pendiente {
  /** La fila a la que pertenece. `null` = es de la cotización entera, no de una partida. */
  partidaId: string | null
  /** Con qué rótulo se agrupa y se cuenta. */
  clave: string
  /**
   * `suma` — todavía NO está en el precio; resolverlo lo agranda.
   * `resta` — YA está en el precio sin que nadie lo decidiera; resolverlo puede sacarlo.
   * `incierta` — está en el precio pero el dato puede cambiar (precio viejo, conflicto).
   */
  direccion: Direccion
  /** Cuánta plata mueve, al costo. `null` = no se midió; nunca cero. */
  monto: number | null
}

export interface Pendientes {
  /**
   * ═══ UNA SOLA DEFINICIÓN, Y POR ESO UN SOLO NÚMERO ═══
   *
   * Pendiente = todo lo que todavía puede mover el precio, venga de donde venga: los issues que
   * levantó el motor Y los huecos que delatan las filas, **unidos y deduplicados por partida**.
   *
   * Antes eran dos cuentas independientes —el chip contaba la cola, el bloque contaba las filas— y
   * se contradecían en las dos direcciones: tres precios vencidos en la cola daban chip 3 y «nada
   * pendiente», y tres partidas sin cantidad ni alcance daban chip «Nada pendiente» y 3 pendientes.
   * Con la unión, `total === 0` si y sólo si no hay nada de ninguno de los dos lados.
   */
  total: number
  /** QUÉ cuenta ese número. Un número pelado al lado de «nada pendiente» es una contradicción. */
  resumen: string

  /** Cuántos de esos pendientes mueven el precio hacia cada lado. */
  puedenSumar: number
  puedenRestar: number
  inciertos: number
  /** Lo que está adentro del precio sin decidir y podría salir. `null` si no se midió. */
  montoQuePuedeSalir: number | null
  /** Lo conocido que todavía no entró al precio. `null` si no se midió. */
  montoQuePuedeEntrar: number | null
  /** Cuántos pendientes no traen monto. De ésos no se sabe cuánto mueven. */
  sinMedir: number

  /** El MISMO número que `certezaDe().ambiguas`: los dos salen de `motivoDeFila`. */
  sinAlcance: number
  /** El MISMO número que `certezaDe().faltantes`. */
  sinValorizar: number

  criterio: string
  items: Pendiente[]
}

const CRITERIO_PENDIENTES = 'Pendiente = todo lo que todavía puede mover el precio: los issues del'
  + ' motor y los huecos de las filas, unidos y sin contar dos veces la misma partida. Los montos son'
  + ' al costo, no al precio de venta.'

/**
 * LOS PENDIENTES — la unión, deduplicada por partida.
 *
 * La fila manda sobre el issue cuando hablan de la misma partida: la fila sabe si el número está o
 * no está adentro del precio, que es lo que decide la DIRECCIÓN. El issue aporta las partidas que la
 * fila ve sanas —un precio vencido, un conflicto de documentos— y los pendientes que no son de
 * ninguna fila, como «el precio de venta da $0».
 */
export function pendientesDe(
  partidas: readonly PartidaDelMotor[], cola: Pick<Cola, 'issues' | 'total'>,
): Pendientes {
  const items: Pendiente[] = []
  const cubiertas = new Set<string>()

  for (const p of partidas) {
    const motivo = motivoDeFila(p)
    if (motivo === 'sin_valorizar') {
      // No suma todavía: lo conocido es el precio de subcontrato que la vista no valoriza.
      items.push({ partidaId: p.id, clave: 'SIN_VALORIZAR', direccion: 'suma', monto: p.precioSubcontrato })
      cubiertas.add(p.id)
    } else if (motivo === 'sin_alcance') {
      // Ya está sumada —la cascada no sabe nada de alcance—, así que decidirla puede RESTAR.
      items.push({ partidaId: p.id, clave: 'SIN_ALCANCE', direccion: 'resta', monto: p.subtotal })
      cubiertas.add(p.id)
    }
  }

  for (const i of cola.issues) {
    const pid = i.evidence?.partidaId ?? null
    // Una partida ya contada no se cuenta otra vez: el chip mide PARTIDAS por resolver, no avisos.
    if (pid !== null && cubiertas.has(pid)) continue
    if (pid !== null) cubiertas.add(pid)
    items.push({ partidaId: pid, clave: claveDeIssue(i), direccion: 'incierta', monto: i.impact })
  }

  const de = (d: Direccion) => items.filter((x) => x.direccion === d)
  const suma = (xs: Pendiente[]) => {
    const montos = xs.map((x) => x.monto).filter((v): v is number => v !== null && Number.isFinite(v))
    return montos.length === 0 ? null : montos.reduce((a, b) => a + b, 0)
  }

  return {
    total: items.length,
    resumen: resumenDePendientes(items),
    puedenSumar: de('suma').length,
    puedenRestar: de('resta').length,
    inciertos: de('incierta').length,
    montoQuePuedeSalir: suma(de('resta')),
    montoQuePuedeEntrar: suma(de('suma')),
    sinMedir: items.filter((x) => x.monto === null).length,
    sinAlcance: items.filter((x) => x.clave === 'SIN_ALCANCE').length,
    sinValorizar: items.filter((x) => x.clave === 'SIN_VALORIZAR').length,
    criterio: CRITERIO_PENDIENTES,
  items: items,
  }
}

/**
 * QUÉ HAY PENDIENTE, EN UNA LÍNEA.
 *
 * Un solo motivo se nombra entero («26 sin alcance declarado»); varios se resumen por los dos más
 * numerosos. Nunca se publica un número sin decir de qué es.
 */
export function resumenDePendientes(items: readonly Pendiente[]): string {
  if (items.length === 0) return 'Nada pendiente'
  const porClave = new Map<string, number>()
  for (const i of items) porClave.set(i.clave, (porClave.get(i.clave) ?? 0) + 1)
  const grupos = [...porClave.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const nombre = (t: string) => ROTULO_ISSUE[t] ?? t.toLowerCase().replace(/_/g, ' ')

  if (grupos.length === 1) return `${items.length} ${nombre(grupos[0][0])}`
  const dos = grupos.slice(0, 2).map(([t, n]) => `${n} ${nombre(t)}`).join(' · ')
  return `${items.length} para resolver · ${dos}${grupos.length > 2 ? '…' : ''}`
}

/**
 * LA CLAVE CON LA QUE SE AGRUPA UN ISSUE — más fina que su `type`, y sin adivinar.
 *
 * El motor emite `FALTA_DATO` tanto para «nadie declaró si esto entra en el alcance» como para
 * cualquier otro dato ausente, así que el rótulo salía «26 sin dato»: cierto y sin filo. Lo que
 * distingue el caso es la ACCIÓN RECOMENDADA que el propio motor adjunta —`include_scope`—, no una
 * heurística sobre el texto del detalle. Si el motor deja de mandarla, esto vuelve a decir «sin
 * dato»: se degrada a menos preciso, nunca a incorrecto.
 */
export function claveDeIssue(i: Pick<IssueCola, 'type' | 'recommended_action'>): string {
  if (i.type === 'FALTA_DATO' && i.recommended_action === 'include_scope') return 'SIN_ALCANCE'
  return i.type
}

/**
 * LA CASCADA, PARTIDA EN LOS DOS BLOQUES DEL CONTRATO.
 *
 * INGENIERÍA es lo que la obra cuesta puesta en marcha; DECISIÓN COMERCIAL es lo que la empresa
 * decide cobrar encima. El IVA no es ninguna de las dos —es lo único normativo de la cascada— y por
 * eso sale en su propio tramo en vez de disfrazarse de decisión.
 */
export function partirCascada(escalones: readonly Escalon[]): {
  ingenieria: Escalon[]
  comercial: Escalon[]
  fiscal: Escalon[]
} {
  const ING = new Set(['costo_directo', 'gastos_generales', 'costo_industrial'])
  const FISCAL = new Set(['iva', 'venta_final'])
  return {
    ingenieria: escalones.filter((e) => ING.has(e.clave)),
    comercial: escalones.filter((e) => !ING.has(e.clave) && !FISCAL.has(e.clave)),
    fiscal: escalones.filter((e) => FISCAL.has(e.clave)),
  }
}

export interface Bloqueo {
  tipo: string
  entidad: string
  detalle: string | null
  impacto: number | null
  /** A qué fila lleva. `null` cuando el bloqueo es de la cotización entera, no de una partida. */
  partidaId: string | null
}

/**
 * LOS BLOQUEOS DE ENVÍO, CON A DÓNDE IR.
 *
 * Nunca un botón gris sin explicación: el mismo lugar dice qué falta y cada faltante lleva a su
 * problema. El gate es el que decide —es el mismo que corre en la base al congelar—; la cola sólo
 * aporta de qué FILA salió cada bloqueo, que el gate no arrastra.
 *
 * El emparejamiento es por (tipo, entidad) y CONSUMIENDO: dos partidas con la misma descripción y
 * el mismo hueco producen dos bloqueos, y cada uno tiene que llevar a la suya.
 */
export function bloqueosDeEnvio(gate: Gate, cola: Cola): Bloqueo[] {
  const porClave = new Map<string, (string | null)[]>()
  for (const i of cola.bloqueantes) {
    const k = `${i.type} ${i.entity}`
    const cola_ = porClave.get(k)
    if (cola_) cola_.push(i.evidence?.partidaId ?? null)
    else porClave.set(k, [i.evidence?.partidaId ?? null])
  }
  return gate.blocking_issues.map((b) => ({
    tipo: b.tipo,
    entidad: b.entidad,
    detalle: b.detalle,
    impacto: b.impacto,
    partidaId: porClave.get(`${b.tipo} ${b.entidad}`)?.shift() ?? null,
  }))
}
