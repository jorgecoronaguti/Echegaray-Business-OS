// LO QUE SE SUMA ENTRE OBRAS — y lo que NUNCA entra a una suma.
//
// Los cajones «sin obra asignada» se suman a lo que salió para obras, pero no entran a ningún ratio POR
// OBRA: repartirlos sería decidir a qué obra fue una compra que Compras no supo decir. Un ratio sin sus
// dos patas no se publica: `queda` sólo existe con presupuesto Y consumo del MISMO rubro, `$/hora` sólo
// con mano de obra imputada Y horas. El contrato viaja como referencia, nunca como presupuesto.
import { horasTexto, millones, pctEntero } from './formato.ts'
import { rotuloEstimada, type AusenciaPrecio, type ObraAnalitica } from './obras.ts'
import { SIN_PRESUPUESTO, SIN_PRESUPUESTO_RUBRO, type Rubro } from './presupuesto.ts'

const sumaNula = (xs: (number | null)[]): number | null =>
  xs.every((x) => x == null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0)

// ─── Resumen ────────────────────────────────────────────────────────────────────────────────────

export interface CifrasResumen {
  /** Σ de lo comparable (MO+CS y MA) de las obras con presupuesto: contra esto se mide. */
  presupuestado: number | null
  /** Σ de lo consumido en ESOS rubros. */
  consumido: number | null
  /** presupuestado − consumido. `null` sin las dos patas. */
  queda: number | null
  /** TODO lo consumido por las obras: la misma cifra que suma la columna CONSUMIDO de la tabla. */
  consumoTotal: number | null
  /** Lo gastado en obras que no tiene presupuesto con qué compararse (obra o rubro sin presupuesto). */
  consumoSinPresupuesto: number | null
  /** Σ del costo cotizado total de las cotizaciones aprobadas (todos los rubros): referencia. */
  costoCotizado: number | null
  contrato: number | null
  sinObraAsignada: number | null
  obrasSinPresupuesto: number
}

/**
 * LOS CAJONES DE LOS CLIENTES QUE LA VISTA MUESTRA. `sin_obra` llega de toda la base; si se suma
 * entero, la tarjeta «sin obra asignada» publica plata de un cliente que no tiene ninguna fila y las
 * filas no cierran con las cifras de arriba (auditoría 17/09/2026).
 */
export function cajonesDeLosClientes<T>(cajones: ReadonlyMap<string, T>, obras: ObraAnalitica[]): Map<string, T> {
  const visibles = new Set(obras.map((o) => o.clienteId))
  return new Map([...cajones.entries()].filter(([id]) => visibles.has(id)))
}

export function cifrasResumen(obras: ObraAnalitica[], sinObra: ReadonlyMap<string, number | null>): CifrasResumen {
  const conPres = obras.filter((o) => o.presupuesto != null)
  const presupuestado = sumaNula(conPres.map((o) => o.presupuesto))
  const consumido = sumaNula(conPres.map((o) => o.consumoComparable))
  const total = sumaNula(obras.map((o) => o.gasto.total))
  return {
    presupuestado, consumido, consumoTotal: total,
    queda: presupuestado != null ? presupuestado - (consumido ?? 0) : null,
    consumoSinPresupuesto: total != null ? total - (consumido ?? 0) : null,
    costoCotizado: sumaNula(obras.map((o) => o.costoCotizado)),
    contrato: sumaNula(obras.map((o) => o.precio)),
    sinObraAsignada: sumaNula([...sinObra.values()]),
    obrasSinPresupuesto: obras.length - conPres.length,
  }
}

// ─── Lo contratado contra lo gastado ────────────────────────────────────────────────────────────
//
// ═══ LA OTRA PREGUNTA, LA QUE EL DUEÑO PIDIÓ EL 17/09/2026 ═══
//
// «Lo que quiero es más claridad en la pestaña Resumen de lo contratado vs lo que se va gastando».
// Es una lectura DISTINTA de presupuestado contra consumido y las dos se publican:
//
//   CONTRATADO − GASTADO   lo que el cliente se comprometió a pagar menos lo que costó hasta hoy.
//   PRESUPUESTADO − CONSUMIDO   el costo previsto menos el costo incurrido: el desvío.
//
// Mezclarlas esconde una de las dos. Por eso viven en dos funciones y en dos secciones.
//
// ═══ LAS TRES REGLAS QUE ESTA CUENTA NO PUEDE ROMPER ═══
//
// 1. CONTRATADO ES EL PRECIO, NUNCA LO FACTURADO. Lo decide `precioDe` (obras.ts): el contrato
//    desglosado, o el precio que OBRAS declara. La suma viva de Cobranzas NO es precio —el dueño ya
//    rechazó una columna que la publicaba: Instalación Eléctrica vale $ 40 M y lleva $ 20 M
//    facturados, y con lo facturado la obra aparentaba perder plata contra su costo.
// 2. UNA OBRA SIN PRECIO NO SE RELLENA. Ni con su presupuesto ni con lo facturado: queda AFUERA de
//    la cuenta, y lo que gastó se dice aparte. Un contratado que no incluye una obra no puede
//    compararse contra un gastado que sí la incluye.
// 3. EL QUEDA NO ES EL MARGEN FINAL. La obra está en curso: falta costo por incurrir. Es lo que
//    queda del precio para cubrirlo. La pantalla lo dice con esas palabras.

/** Una obra que no entra a la cuenta del contrato, con la palabra que dice por qué. */
export interface ObraSinPrecio { id: string; nombre: string; ausencia: AusenciaPrecio; gasto: number | null }

export interface ContraContrato {
  /** Cuántas obras tienen precio contratado: las únicas de esta cuenta. */
  conPrecio: number
  /** Σ del precio de esas obras. `null` = ninguna lo tiene. */
  contratado: number | null
  /** Σ de lo gastado EN ESAS MISMAS obras. `null` = ninguna tiene precio. */
  gastado: number | null
  /** contratado − gastado: lo que queda del precio para el costo que falta. */
  queda: number | null
  /** gastado ÷ contratado. `null` sin las dos patas. */
  pct: number | null
  /** Las obras que quedaron afuera, con su palabra y lo que gastaron. */
  sinPrecio: ObraSinPrecio[]
  /** Σ de lo gastado por las obras sin precio: está afuera de la cuenta y se dice. */
  gastadoSinPrecio: number | null
}

/** LO CONTRATADO CONTRA LO GASTADO, sólo con las obras que tienen precio (regla 2 de arriba). */
export function contraContrato(obras: ObraAnalitica[]): ContraContrato {
  const con = obras.filter((o) => o.precio != null)
  const sin = obras.filter((o) => o.precio == null)
  const contratado = sumaNula(con.map((o) => o.precio))
  const gastado = con.length ? sumaNula(con.map((o) => o.gasto.total)) : null
  return {
    conPrecio: con.length, contratado, gastado,
    queda: contratado != null ? contratado - (gastado ?? 0) : null,
    pct: contratado != null && contratado > 0 && gastado != null ? gastado / contratado : null,
    sinPrecio: sin.map((o) => ({ id: o.id, nombre: o.nombre, ausencia: o.ausencia ?? 'sin precio', gasto: o.gasto.total })),
    gastadoSinPrecio: sin.length ? sumaNula(sin.map((o) => o.gasto.total)) : null,
  }
}

export type FilaContrato = ContraContrato & {
  clienteId: string
  nombre: string
  obras: number
  /** Lo gastado en las obras CON precio, abierto por rubro: la barra gruesa del diseño. */
  manoObra: number | null
  subcontratos: number | null
  materiales: number | null
  /** Cuántas de las obras con precio están contratadas en dólares (valuadas al tipo de cambio de hoy). */
  enDolares: number
  obraPrincipal: string
}

/**
 * LA MISMA CUENTA, CLIENTE POR CLIENTE, en el orden de la lista de presupuestado (del que más gastó al
 * que menos): las dos listas del Resumen se leen una debajo de la otra y un cliente tiene que estar en
 * el mismo lugar en las dos.
 */
export function contratoPorCliente(obras: ObraAnalitica[]): FilaContrato[] {
  const m = new Map<string, ObraAnalitica[]>()
  for (const o of obras) m.set(o.clienteId, [...(m.get(o.clienteId) ?? []), o])
  return [...m.values()].map((lista): FilaContrato => {
    const con = lista.filter((o) => o.precio != null)
    return {
      ...contraContrato(lista),
      clienteId: lista[0].clienteId, nombre: lista[0].clienteNombre, obras: lista.length,
      manoObra: sumaNula(con.map((o) => o.gasto.manoObra)),
      subcontratos: sumaNula(con.map((o) => o.gasto.subcontratos)),
      materiales: sumaNula(con.map((o) => o.gasto.materiales)),
      enDolares: con.filter((o) => o.precioEnDolares).length,
      obraPrincipal: [...lista].sort((a, b) => (b.gasto.total ?? 0) - (a.gasto.total ?? 0))[0].id,
    }
  }).sort((a, b) => {
    const ga = a.obras ? (a.gastado ?? 0) + (a.gastadoSinPrecio ?? 0) : 0
    const gb = b.obras ? (b.gastado ?? 0) + (b.gastadoSinPrecio ?? 0) : 0
    return gb - ga || (b.contratado ?? -1) - (a.contratado ?? -1) || a.nombre.localeCompare(b.nombre, 'es')
  })
}

export interface ControlDeObra {
  obra: ObraAnalitica
  presupuesto: number | null
  /** Consumo de los rubros presupuestados. */
  consumido: number | null
  /** Consumo que no tiene presupuesto con qué compararse (rubro sin presupuesto u obra sin presupuesto). */
  sinPresupuesto: number
  pct: number | null
  queda: number | null
}

/**
 * EL GRÁFICO DEL RESUMEN: cada obra, su presupuesto contra lo consumido en los mismos rubros, y aparte
 * lo que consumió sin presupuesto. Ordenadas por % consumido; las que no se pueden medir, al final.
 */
export function controlPorObra(obras: ObraAnalitica[]): ControlDeObra[] {
  return obras.map((o): ControlDeObra => ({
    obra: o, presupuesto: o.presupuesto, consumido: o.presupuesto != null ? o.consumoComparable : null,
    sinPresupuesto: Math.max(0, (o.gasto.total ?? 0) - (o.presupuesto != null ? (o.consumoComparable ?? 0) : 0)),
    pct: o.avanceGasto,
    queda: o.presupuesto != null ? o.presupuesto - (o.consumoComparable ?? 0) : null,
  })).sort((a, b) => {
    if (a.pct == null && b.pct == null) return (b.obra.gasto.total ?? 0) - (a.obra.gasto.total ?? 0)
    if (a.pct == null) return 1
    if (b.pct == null) return -1
    return b.pct - a.pct
  })
}

// ─── Resumen: la forma del diseño v6 ────────────────────────────────────────────────────────────
//
// Dueño, 17/09/2026: «respetá el diseño que te pasé, no inventes». El Resumen es el de Analíticas v6
// (vista «global»): cinco cifras, una fila por cliente con la barra fina de lo presupuestado y la gruesa
// de lo consumido apilada por rubro y sin obra, de qué está hecho el gasto, las obras que más consumen y
// lo que la base no puede afirmar. Donde el diseño decía «contratado» va PRESUPUESTADO: es lo que el
// dueño pidió controlar.

export type LecturaCliente =
  | { tipo: 'queda' | 'excedido'; monto: number; conPresupuesto: number; obras: number }
  | { tipo: 'sinPresupuesto' }

export interface FilaDeCliente {
  clienteId: string
  nombre: string
  obras: number
  conPresupuesto: number
  presupuestado: number | null
  manoObra: number | null
  subcontratos: number | null
  materiales: number | null
  /** El cajón del cliente: consumo que Compras no pudo poner en una obra. Se dibuja, no se reparte. */
  sinObra: number | null
  /** Obras + sin obra: el largo de la barra gruesa. */
  total: number | null
  horas: number | null
  lectura: LecturaCliente
  /** La obra que más consumió: adonde abre la fila. */
  obraPrincipal: string
}

/**
 * UNA FILA POR CLIENTE, de la que más consumió a la que menos. Lo que queda compara lo presupuestado
 * contra lo consumido EN LOS MISMOS RUBROS de las obras con presupuesto (ver `cifrasResumen`): el cajón
 * sin obra y las obras sin presupuesto se ven en la barra pero no entran al queda.
 */
export function resumenPorCliente(obras: ObraAnalitica[], sinObra: ReadonlyMap<string, number | null>): FilaDeCliente[] {
  const m = new Map<string, ObraAnalitica[]>()
  for (const o of obras) m.set(o.clienteId, [...(m.get(o.clienteId) ?? []), o])
  return [...m.values()].map((lista): FilaDeCliente => {
    const conPres = lista.filter((o) => o.presupuesto != null)
    const presupuestado = sumaNula(conPres.map((o) => o.presupuesto))
    const manoObra = sumaNula(lista.map((o) => o.gasto.manoObra))
    const subcontratos = sumaNula(lista.map((o) => o.gasto.subcontratos))
    const materiales = sumaNula(lista.map((o) => o.gasto.materiales))
    const so = sinObra.get(lista[0].clienteId) ?? null
    const queda = presupuestado != null ? presupuestado - (sumaNula(conPres.map((o) => o.consumoComparable)) ?? 0) : null
    return {
      clienteId: lista[0].clienteId, nombre: lista[0].clienteNombre, obras: lista.length, conPresupuesto: conPres.length,
      presupuestado, manoObra, subcontratos, materiales, sinObra: so,
      total: sumaNula([manoObra, subcontratos, materiales, so]),
      horas: sumaNula(lista.map((o) => o.gasto.horas)),
      lectura: queda == null ? { tipo: 'sinPresupuesto' }
        : { tipo: queda < 0 ? 'excedido' : 'queda', monto: Math.abs(queda), conPresupuesto: conPres.length, obras: lista.length },
      obraPrincipal: [...lista].sort((a, b) => (b.gasto.total ?? 0) - (a.gasto.total ?? 0))[0].id,
    }
  }).sort((a, b) => (b.total ?? 0) - (a.total ?? 0) || a.nombre.localeCompare(b.nombre, 'es'))
}

export interface Composicion { nombre: string; manoObra: number; subcontratos: number; materiales: number; total: number }

/** DE QUÉ ESTÁ HECHO EL GASTO: la empresa y cada cliente con consumo, a 100 %. Sin el cajón sin obra. */
export function composicionDelGasto(obras: ObraAnalitica[], clientes: FilaDeCliente[]): Composicion[] {
  const de = (nombre: string, lista: ObraAnalitica[]): Composicion => {
    const mo = lista.reduce((a, o) => a + (o.gasto.manoObra ?? 0), 0)
    const sub = lista.reduce((a, o) => a + (o.gasto.subcontratos ?? 0), 0)
    const mat = lista.reduce((a, o) => a + (o.gasto.materiales ?? 0), 0)
    return { nombre, manoObra: mo, subcontratos: sub, materiales: mat, total: mo + sub + mat }
  }
  return [de('Empresa', obras), ...clientes.map((c) => de(c.nombre, obras.filter((o) => o.clienteId === c.clienteId)))]
    .filter((x) => x.total > 0)
}

/** LAS OBRAS QUE MÁS CONSUMEN: las `n` primeras por consumido; las que no consumieron no entran. */
export function obrasQueMasConsumen(obras: ObraAnalitica[], n = 8): ObraAnalitica[] {
  return obras.filter((o) => (o.gasto.total ?? 0) > 0).sort((a, b) => (b.gasto.total ?? 0) - (a.gasto.total ?? 0)).slice(0, n)
}

/** La mano de obra de varias obras sumada, con su parte estimada: para rotular un total. */
export function manoObraDe(obras: ObraAnalitica[]): { manoObra: number | null; manoObraEstimada: number | null } {
  const con = obras.filter((o) => o.gasto.manoObra != null)
  if (!con.length) return { manoObra: null, manoObraEstimada: null }
  const est = con.reduce((x, o) => x + (o.gasto.manoObraEstimada ?? 0), 0)
  return { manoObra: con.reduce((x, o) => x + (o.gasto.manoObra ?? 0), 0), manoObraEstimada: est > 0 ? est : null }
}

// ─── Obras: rubro contra rubro ──────────────────────────────────────────────────────────────────

export type Item = Rubro | 'horas'
export const ITEMS: { clave: Item; rotulo: string }[] = [
  { clave: 'manoObra', rotulo: 'Mano de obra' },
  { clave: 'materiales', rotulo: 'Materiales' },
  { clave: 'subcontratos', rotulo: 'Subcontratos' },
  { clave: 'otros', rotulo: 'Otros' },
  { clave: 'horas', rotulo: 'Horas hombre' },
]

/** ¿La obra cotizó MA (materiales, equipos, fletes Y subcontratos: la plantilla no los separa)? */
export const conMA = (o: ObraAnalitica): boolean => (o.presupuestoRubros?.materiales ?? null) != null

export const INCLUIDO_EN_MATERIALES = 'incluido en materiales de la cotización'

/**
 * EL QUEDA DE MATERIALES Y SUBCONTRATOS, UNA SOLA VEZ (dueño, 17/09/2026: subcontratos se ve aparte).
 * Los rubros se muestran separados, pero el presupuesto no separa subcontratos: MA los incluye. Medir
 * materiales solos contra MA daría un excedido falso, y repartir MA sería inventar. Por eso lo que queda
 * se calcula MA − (materiales + subcontratos) y se dice debajo de los dos. `null` sin MA.
 */
export function quedaMaterialesYSubcontratos(o: ObraAnalitica): { cotizado: number; consumido: number | null; pct: number | null; lectura: Celda['lectura'] } | null {
  const ma = o.presupuestoRubros?.materiales ?? null
  if (ma == null) return null
  const consumido = sumaNula([o.gasto.materiales, o.gasto.subcontratos])
  return { cotizado: ma, consumido, pct: ma > 0 && consumido != null ? consumido / ma : null, lectura: lecturaDe(ma, consumido) }
}

export interface Celda {
  /** Lo gastado (pesos, u horas en HH). `null` = no hay registro. */
  gastado: number | null
  /**
   * Por qué no hay gastado: «otros» no tiene fuente de consumo — no es que alguien no cargó, es que el
   * OS no lleva ese rubro por separado. Decía «sin registrar», que se leía como un olvido (17/09/2026).
   */
  gastadoAusente: 'no se carga aparte' | null
  /** `true` = el presupuesto de este rubro es INFERENCIA. */
  estimado: boolean
  cotizado: number | null
  /** La palabra de lo cotizado cuando no hay número. */
  cotizadoAusente: string | null
  /** gastado ÷ cotizado; `null` sin las dos patas. */
  pct: number | null
  lectura: { tipo: 'queda' | 'excedido' | 'sinMovimiento' | 'sinPresupuesto' | 'sinConsumo'; monto: number | null } | null
  /** «62 % estimada»: la parte estimada de la mano de obra consumida. */
  consumoEstimado: string | null
}

/** Una celda armada con sus dos patas: lo que queda, lo excedido o por qué no se puede decir. */
export function lecturaDe(cotizado: number | null, gastado: number | null): Celda['lectura'] {
  if (cotizado == null || cotizado <= 0) return gastado != null && gastado > 0 ? { tipo: 'sinPresupuesto', monto: null } : null
  if (gastado == null || gastado <= 0) return { tipo: 'sinMovimiento', monto: null }
  return gastado > cotizado ? { tipo: 'excedido', monto: gastado - cotizado } : { tipo: 'queda', monto: cotizado - gastado }
}

export function celda(o: ObraAnalitica, item: Item): Celda {
  if (item === 'horas') {
    const hh = o.hhPresupuestadas
    return {
      // «sin previsión» se leía como un error de la pantalla; la cotización simplemente no previó horas.
      gastado: o.gasto.horas, gastadoAusente: null, estimado: false, cotizado: hh, cotizadoAusente: hh == null ? 'la cotización no previó horas' : null,
      pct: hh != null && o.gasto.horas != null ? o.gasto.horas / hh : null, lectura: hh == null ? null : lecturaDe(hh, o.gasto.horas), consumoEstimado: null,
    }
  }
  const g = item === 'otros' ? null : o.gasto[item]
  const cot = o.presupuestoRubros?.[item] ?? null
  // CON MA, materiales y subcontratos no se leen por separado: su queda es uno solo (arriba).
  if ((item === 'materiales' || item === 'subcontratos') && conMA(o)) {
    return {
      gastado: g, gastadoAusente: null, estimado: o.rubrosEstimados.includes('materiales'),
      cotizado: item === 'materiales' ? cot : null, cotizadoAusente: item === 'subcontratos' ? INCLUIDO_EN_MATERIALES : null,
      pct: null, lectura: null, consumoEstimado: null,
    }
  }
  // SIN PRESUPUESTO APROBADO se dice el motivo de la obra; CON presupuesto y sin este rubro, que el
  // rubro no se cotizó aparte (Quattropani: sólo MO+CS; subcontratos van dentro de MA en la plantilla).
  const desglosado = Object.values(o.presupuestoRubros ?? {}).some((v) => v != null)
  const ausente = cot != null ? null : desglosado ? SIN_PRESUPUESTO_RUBRO : (o.motivoPresupuesto ?? SIN_PRESUPUESTO)
  return {
    gastado: g, gastadoAusente: item === 'otros' ? 'no se carga aparte' : null, estimado: o.rubrosEstimados.includes(item),
    cotizado: cot, cotizadoAusente: ausente,
    pct: cot != null && cot > 0 && g != null ? g / cot : null,
    lectura: item === 'otros' && cot != null ? { tipo: 'sinConsumo', monto: null } : lecturaDe(cot, g),
    consumoEstimado: item === 'manoObra' ? rotuloEstimada(o.gasto) : null,
  }
}

/**
 * LA ÚLTIMA LÍNEA DE UN RUBRO: qué le pasó a ese rubro, dicho siempre y en el mismo lugar.
 *
 * Dueño, 17/09/2026: la lectura aparecía «solo en algunos». Tres de los cinco rubros quedaban mudos o
 * contestaban con una palabra que se leía como un error del sistema («sin registrar», «sin previsión»).
 * Acá ninguno queda sin cerrar: o dice qué queda, o dice dónde se dice, o dice por qué no se puede
 * decir. Materiales y Subcontratos REMITEN al queda combinado porque la cotización no los separa (ver
 * `quedaMaterialesYSubcontratos`): medir materiales solo contra MA daría un excedido falso.
 *
 * Nunca devuelve la cadena vacía. Eso es lo que prueba el test.
 */
export type TonoCierre = 'muted' | 'neg' | 'warn' | 'faint'

export function cierreDeRubro(c: Celda, item: Item): { texto: string; tono: TonoCierre } {
  const fmt = item === 'horas' ? horasTexto : millones
  const l = c.lectura
  // EL MOTIVO LARGO VA UNA VEZ, en la cabecera; en cada rubro, la palabra corta.
  const corto = c.cotizadoAusente === SIN_PRESUPUESTO_RUBRO || c.cotizadoAusente === INCLUIDO_EN_MATERIALES ? c.cotizadoAusente : 'sin presupuesto'
  if (l?.tipo === 'queda') return { texto: `queda ${fmt(l.monto)} · ${pctEntero(c.pct)} consumido`, tono: 'muted' }
  if (l?.tipo === 'excedido') return { texto: `excedido en ${fmt(l.monto)}`, tono: 'neg' }
  if (l?.tipo === 'sinMovimiento') return { texto: 'sin movimiento', tono: 'muted' }
  if (l?.tipo === 'sinPresupuesto') return { texto: `consumo ${corto}`, tono: 'warn' }
  if (l?.tipo === 'sinConsumo') return { texto: 'sin consumo registrado con qué comparar', tono: 'faint' }
  if (item === 'materiales' && c.cotizado != null) return { texto: 'lo que queda se dice abajo, junto con subcontratos', tono: 'muted' }
  if (item === 'subcontratos' && c.cotizadoAusente === INCLUIDO_EN_MATERIALES) return { texto: 'cotizado dentro de materiales · lo que queda se dice abajo', tono: 'muted' }
  if (item === 'otros') return { texto: 'la cotización no abre este rubro', tono: 'faint' }
  if (c.cotizado == null && c.cotizadoAusente) {
    return { texto: c.cotizadoAusente === SIN_PRESUPUESTO_RUBRO ? 'este rubro no se cotizó aparte' : c.cotizadoAusente, tono: 'faint' }
  }
  return { texto: 'sin nada con qué compararlo', tono: 'faint' }
}

// ─── Costo por hora ─────────────────────────────────────────────────────────────────────

export const UMBRAL_HORA_CARA = 0.2

export interface PuntoHora { obra: ObraAnalitica; porHora: number; contraEmpresa: number }

/**
 * $/HORA = mano de obra imputada ÷ horas valorizadas, SÓLO con las dos y SÓLO si la mano de obra es
 * toda con recibo. Es COSTO de la hora, no productividad. La empresa es el cociente de las sumas —no
 * el promedio de cocientes—, para que una obra de 10 h no pese como una de 3.000.
 *
 * UNA MANO DE OBRA ESTIMADA NO MIDE NADA (auditoría 17/09/2026, D2): la estimación ES horas × tarifa,
 * así que dividirla por las horas devuelve la tarifa. Esas obras salen en `noMedidas`, con su parte
 * estimada, y no entran ni a los puntos ni a la línea de la empresa.
 */
export function costoPorHora(obras: ObraAnalitica[]): { empresa: number | null; puntos: PuntoHora[]; noMedidas: ObraAnalitica[] } {
  const con = obras.filter((o) => (o.gasto.manoObra ?? 0) > 0 && (o.gasto.horasValorizadas ?? 0) > 0)
  const medidas = con.filter((o) => (o.gasto.manoObraEstimada ?? 0) <= 0)
  const mo = medidas.reduce((a, o) => a + (o.gasto.manoObra ?? 0), 0)
  const h = medidas.reduce((a, o) => a + (o.gasto.horasValorizadas ?? 0), 0)
  const empresa = h > 0 ? mo / h : null
  const puntos = medidas.map((o) => {
    const porHora = (o.gasto.manoObra ?? 0) / (o.gasto.horasValorizadas ?? 1)
    return { obra: o, porHora, contraEmpresa: empresa ? porHora / empresa - 1 : 0 }
  })
  return { empresa, puntos: puntos.sort((a, b) => b.porHora - a.porHora), noMedidas: con.filter((o) => !medidas.includes(o)) }
}

/** El $/hora de UNA obra para la tabla: `null` si falta una pata o si la mano de obra tiene parte estimada. */
export function porHoraMedido(o: ObraAnalitica): number | null {
  if (!o.gasto.manoObra || !o.gasto.horasValorizadas || (o.gasto.manoObraEstimada ?? 0) > 0) return null
  return o.gasto.manoObra / o.gasto.horasValorizadas
}
