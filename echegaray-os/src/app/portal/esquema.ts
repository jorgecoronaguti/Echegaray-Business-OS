// EL ESQUEMA DE PAGO, LEÍDO POR EL PORTAL — `public.esquema_pago` es la fuente, no `pago_programado`.
//
// ═══ POR QUÉ (26/08/2026) ═══
//
// El portal nació con `pago_programado`, una tabla propia. La pantalla 32 de la ficha del cliente ya
// administraba el mismo concepto en `esquema_pago`: administración movía una fecha ahí y el cliente
// seguía viendo la vieja. LA FICHA DEL CLIENTE GANA — el portal lee lo que ella publica.
//
// ═══ EL PREDICADO DE PUBLICACIÓN NO SE INVENTA ACÁ ═══
//
// Está escrito en la policy `esquema_pago_select` de la migración `20260825T1240`: el cliente ve
// `visible_portal AND publicado_at IS NOT NULL`. Se copia tal cual y por eso se copia: el portal
// entra con la clave de servicio —el cliente no tiene usuario de Supabase— y esa clave NO pasa por
// RLS. Si acá el predicado fuera distinto, el portal mostraría exactamente lo que la base le prohíbe
// al mismo cliente cuando entra por el otro camino.
//
// `cambio_pendiente` NO oculta la fila: significa que hay ediciones posteriores a la publicación, y
// la policy no lo mira. Esconder la fila dejaría al cliente sin un pago que ya le fue comunicado.

import { publicablesDelCliente, publicadaAlCliente } from '../../../orquestador/lib/portal/publicacion.mjs'
import { rotuloPublicable } from '../../../orquestador/lib/portal/rotulo-publicable.mjs'
import type { EstadoPago, Pago, TipoPago } from './cronograma'

/**
 * La fila de `esquema_pago` como llega de la base.
 *
 * `moneda`, `factura_numero` y `recibo_numero` son OPCIONALES en el tipo porque llegan en una
 * migración que todavía no se aplicó. Un tipo que las diera por seguras haría que, el día que
 * falten, el portal sume dólares como pesos sin avisar.
 */
export interface FilaEsquema {
  id: string
  obra_id: string | null
  /** La fila FÍSICA de la pestaña Cobranzas de la que salió. `null` = la sembró `portal-sembrar`. */
  cobranza_fila?: number | null
  concepto: string
  fecha: string | null
  neto?: string | number | null
  iva?: string | number | null
  historico?: boolean | null
  monto: number | string | null
  reparo: number | string | null
  estado: string
  medio: string | null
  visible_portal: boolean
  publicado_at: string | null
  cambio_pendiente: boolean
  orden: number
  moneda?: string | null
  factura_numero?: string | null
  recibo_numero?: string | null
}

/**
 * Un pago del portal que sabe de qué obra es. `obraId` `null` = la fila no tiene obra asignada.
 *
 * `obraCerrada` es el estado CANÓNICO de la obra (`obra_canonica.estado`), el mismo que parte la
 * lista del Inicio. Viaja con el pago porque la pantalla lo necesita para dos cosas distintas: no
 * mandar a «obras anteriores» una obra viva que ya se cobró, y decir «obra terminada · saldo
 * pendiente» cuando queda algo por cobrar de una que sí terminó.
 */
export type PagoConObra = Pago & { obraId: string | null; obraNombre: string; obraCerrada: boolean }

/**
 * LO QUE EL CLIENTE PUEDE VER — el predicado de la policy `esquema_pago_select`, importado.
 *
 * Estaba escrito acá y otra vez en `publicacion.mjs` (el control del sync). Dos copias del mismo
 * predicado son dos definiciones: el día que la policy cambie, una de las dos se queda con la regla
 * vieja y nadie se entera, porque las dos siguen en verde. Ahora existe una sola y las dos la leen.
 */
export const publicadoAlPortal = (f: Pick<FilaEsquema, 'visible_portal' | 'publicado_at'>): boolean =>
  publicadaAlCliente(f) === true

/**
 * QUÉ CLASE DE PAGO ES. `esquema_pago` no tiene columna `tipo` —la pestaña Cobranzas tampoco— así
 * que sale del `estado` y, en último lugar, del texto que escribió administración.
 *
 * `retenido` ES el fondo de reparo: lo dice el CHECK de la columna («retenido = fondo de reparo
 * esperando recepción definitiva»). La columna `reparo` NO alcanza para marcarlo: ahí vive cuánto se
 * le retiene A UN PAGO, y un certificado con retención sigue siendo un certificado que el cliente
 * debe pagar. Sacarlo de «pendiente» por tener reparo subestimaría la deuda.
 */
export function tipoDelPago(f: Pick<FilaEsquema, 'estado' | 'concepto'>): TipoPago {
  if (f.estado === 'retenido') return 'fondo_reparo'
  if (/anticipo/i.test(f.concepto)) return 'anticipo'
  if (/certificad/i.test(f.concepto)) return 'certificado'
  return 'otro'
}

/**
 * EL ESTADO QUE FIJA LA BASE — que es el que declaró la columna O de Cobranzas.
 *
 * ═══ LA PANTALLA NO PUEDE CONTRADECIR AL SHEET (26/08/2026) ═══
 *
 * El estado se decidía en TRES lugares: el Sheet lo declaraba, el sembrador lo tiraba y volvía a
 * derivarlo de la fecha, y acá se derivaba una tercera vez. El resultado es que la columna O no
 * llegaba nunca al cliente: las filas marcadas «Proyectado» —acordadas y todavía sin facturar— se
 * publicaban con la misma cara que una deuda exigible. Ahora `esquema_pago.estado` ES lo que dice el
 * Sheet, y acá sólo se traduce.
 *
 * `a_vencer` y `vencido` son la ÚNICA excepción, y no es una segunda opinión: son la misma fila con
 * la fecha de un lado o del otro de hoy, el propio Sheet los calcula así en su columna V
 * (`Q<TODAY()`), y la fecha es la palanca que administración mueve en la ficha del cliente. Si acá
 * se leyera el estado guardado, una fecha corrida al futuro dejaría la fila en rojo hasta la próxima
 * corrida del sync. Es la misma decisión que toma `estadoVigente` en la pantalla 32.
 *
 * `retenido` es el fondo de reparo: plata que la empresa retiene, no una deuda que el cliente tenga
 * que pagar. Pintarlo «vencido» porque pasó su fecha le reclamaría algo que nadie le está pidiendo.
 */
export function estadoFijadoDe(f: Pick<FilaEsquema, 'estado'>): EstadoPago | null {
  if (f.estado === 'cobrado') return 'pagado'
  if (f.estado === 'previsto') return 'sin_factura'
  if (f.estado === 'retenido') return 'programado'
  return null
}

/** `numeric` de Postgres llega como string. `null` sigue siendo `null`, nunca 0. */
const aNumero = (v: number | string | null | undefined): number | null =>
  v == null || v === '' ? null : Number(v)

/**
 * Una fila del esquema como la dibuja el portal.
 *
 * `fecha` es UNA sola columna —espejo de la columna Q de Cobranzas— y hace de las dos del portal: es
 * la fecha de cobro cuando el estado es `cobrado` y la prevista en todos los demás casos. Copiarla a
 * las dos a la vez haría que un pago cobrado apareciera además como pendiente.
 *
 * @param obraNombre `''` cuando la fila no tiene obra o su id no resuelve. NO se rellena con un
 *   texto inventado: un rótulo fabricado en una tabla de cobranzas se lee como el nombre real.
 */
export function aPagoDelPortal(f: FilaEsquema, obraNombre: string, obraCerrada = false): PagoConObra {
  const cobrado = f.estado === 'cobrado'
  return {
    id: f.id,
    obraId: f.obra_id,
    obraNombre,
    obraCerrada,
    orden: f.orden,
    tipo: tipoDelPago(f),
    // EL CONCEPTO SE PUBLICA SI ES UN CONCEPTO. «RECLAMAR OC!» es una nota que administración se
    // escribió a sí misma en la columna I de Cobranzas, y el portal la copiaba a la cara del cliente.
    // La regla vive en `rotulo-publicable.mjs` porque la usa también el informe del sync.
    rotulo: rotuloPublicable({
      concepto: f.concepto,
      obraNombre,
      fecha: f.fecha,
      facturaNumero: f.factura_numero ?? null,
    }),
    monto: aNumero(f.monto),
    // El cliente factura con IVA discriminado: un único importe no le sirve para conciliar contra su
    // propia contabilidad. Se publican los tres y la pantalla los muestra juntos.
    neto: aNumero(f.neto),
    iva: aNumero(f.iva),
    historico: f.historico === true,
    // Sin la columna `moneda` (migración sin aplicar) se asume ARS, que es su default declarado.
    moneda: f.moneda === 'USD' ? 'USD' : 'ARS',
    // `esquema_pago` guarda UNA fecha: la del pago. Cuando está cobrado ES la fecha en que se pagó,
    // y también es la que ese pago tenía prevista — no son dos hechos distintos, es el mismo día.
    // Ponerla sólo en `fechaPago` dejaba la columna de fechas del cronograma en «sin fecha» para
    // todo lo ya pagado: el cliente veía su anticipo cobrado sin poder decir cuándo lo pagó.
    fechaPrevista: f.fecha,
    fechaPago: cobrado ? f.fecha : null,
    facturaNumero: f.factura_numero ?? null,
    reciboNumero: f.recibo_numero ?? null,
    // El esquema no guarda la devolución del fondo de reparo: la pantalla 32 no la administra. Se
    // deja en null en vez de derivarla de la fecha, que sería inventar un compromiso con el cliente.
    devolucionEn: null,
    devueltoEn: null,
    estadoFijado: estadoFijadoDe(f),
  }
}

/**
 * TODO LO QUE ESTE ACCESO PUEDE VER DEL ESQUEMA, ya ordenado.
 *
 * `orden` primero y `fecha` de desempate: es el mismo criterio de `getEsquema` en la pantalla 32, y
 * ordenar distinto haría que administración y el cliente leyeran el plan en dos secuencias.
 *
 * @param alcanza qué obras abre este acceso. Se aplica ACÁ y no en el `where`: el filtro por obra es
 *   una decisión de permiso y tiene que poder probarse sin base.
 */
export function pagosDelEsquema(
  filas: FilaEsquema[],
  nombres: Map<string, string>,
  alcanza: (obraId: string | null) => boolean,
  /** Las obras del cliente con `obra_canonica.estado = 'cerrada'`. Vacío = ninguna terminada. */
  cerradas: ReadonlySet<string> = new Set<string>(),
): PagoConObra[] {
  // EL CORTE DEL DUEÑO MANDA, FILA POR FILA. `clientes.portal_cobros_desde` es una fecha que él puso
  // a mano para decidir DESDE CUÁNDO el cliente ve sus pagos, y el sembrador marca `historico` con
  // ese criterio. Reescribir esa marca —«si la obra sigue viva, todos sus pagos son actuales»— le
  // devolvía al cliente los cinco cobros anteriores al 01/07 que el corte existía para no mostrar.
  // Lo que se ajusta es el CONTRATO, no los pagos: ver `contratoDelConjunto`.
  //
  // `publicablesDelCliente` aplica ANTES los dos invariantes de duplicado —el espejo en pesos de una
  // fila en dólares y una sola fila por `cobranza_fila`—, sobre el conjunto ENTERO del cliente. El
  // alcance por obra se aplica después: un acceso acotado no puede cambiar cuál de dos copias gana,
  // o dos contactos del mismo cliente verían dos importes distintos del mismo cobro.
  return anterioresPorObraTerminada(publicablesDelCliente(filas)
    .filter((f: FilaEsquema) => alcanza(f.obra_id))
    .sort((a: FilaEsquema, b: FilaEsquema) => a.orden - b.orden
      || (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999'))
    .map((f: FilaEsquema) => aPagoDelPortal(
      f,
      (f.obra_id ? nombres.get(f.obra_id) : null) ?? '',
      f.obra_id ? cerradas.has(f.obra_id) : false,
    )))
}

/**
 * UNA OBRA ANTERIOR ES UNA OBRA TERMINADA Y COBRADA — y «terminada» lo dice el registro de obras.
 *
 * ═══ HABÍA DOS DEFINICIONES DE «OBRA TERMINADA» Y SE CONTRADECÍAN (10/09/2026) ═══
 *
 * El Inicio partía la lista con `obra_canonica.estado = 'cerrada'`; Pagos usaba otra regla propia
 * —«una obra sin pagos pendientes es una obra anterior», del 27/08— y el mismo cliente leía dos
 * cosas opuestas en dos pantallas. Medido en Messina:
 *
 *   BSA - Adicional      CERRADA, con $7.228.782 por cobrar   → Pagos la mostraba como obra en curso
 *   ME - PISOS 120 M²    ACTIVA, cobrada al día               → Pagos la mandaba a «obras anteriores»,
 *                                                               con el pie «trabajo anterior que ya
 *                                                               nos pagó» sobre una obra que sigue
 *                                                               abierta
 *
 * La regla del 27/08 resolvía un problema real —«tomá sólo lo pendiente, sólo esas obras»: una obra
 * cerrada y cobrada no puede ocupar el pie con su contrato— pero lo resolvía con el dato equivocado.
 * Que no queden pagos NO significa que la obra terminó: significa que está al día.
 *
 * LA DEFINICIÓN CANÓNICA ES `obra_canonica.estado`, la misma que usa el Inicio, y las dos condiciones
 * se piden juntas:
 *
 *   · obra CERRADA y sin pagos pendientes  → obra anterior (sección gris, fuera de los totales).
 *   · obra CERRADA con saldo pendiente     → sección principal, rotulada «obra terminada · saldo
 *                                            pendiente». Es plata que el cliente todavía debe: la
 *                                            última pantalla donde puede desaparecer es la suya.
 *   · obra ACTIVA, cobrada o no            → sección principal. Siempre.
 *
 * `historico` que YA venía en `true` no se toca: ése es el corte `portal_cobros_desde` del dueño, que
 * es una ventana de tiempo y no un estado de obra.
 */
export function anterioresPorObraTerminada(pagos: PagoConObra[]): PagoConObra[] {
  const conPendiente = new Set<string>()
  // Cobrado = tiene fecha de pago, o alguien lo fijó como pagado a mano. No se usa `estadoDePago`
  // porque necesitaría la fecha de hoy y esto no depende de cuándo se mire: un pago cobrado en junio
  // sigue cobrado en agosto.
  const cobrado = (p: PagoConObra) => p.fechaPago != null || p.estadoFijado === 'pagado'
  for (const p of pagos) if (p.obraId && !p.historico && !cobrado(p)) conPendiente.add(p.obraId)
  return pagos.map((p) =>
    p.obraId && p.obraCerrada && !conPendiente.has(p.obraId) ? { ...p, historico: true } : p)
}

/** ¿Este pago es el saldo pendiente de una obra que ya se terminó? Lo dice la pantalla, textual. */
export const esSaldoDeObraTerminada = (p: PagoConObra): boolean =>
  p.obraCerrada && !p.historico && p.fechaPago == null && p.estadoFijado !== 'pagado'

/**
 * SEGUNDA CERRADURA DE `puede_ver_montos`: el importe NO SALE de la capa de datos.
 *
 * Las pantallas ya no dibujan ni una columna de plata cuando el acceso no la tiene, y aun así el
 * monto se retira acá. No es redundancia decorativa: la pantalla se cambia todos los días y basta
 * un `pesos(p.monto)` distraído en una fila nueva para publicarle a un contacto del cliente lo que
 * su empresa está pagando. Si el dato no viajó, no hay nada que se pueda escapar.
 *
 * Se pone en `null`, NO en 0. Cero afirma que no vale nada; null es «acá no hay dato para vos», y
 * la pantalla que lo recibe no imprime ningún número.
 */
export const sinImportes = (pagos: PagoConObra[]): PagoConObra[] =>
  // NETO E IVA TAMBIÉN SON PLATA. Retirar sólo el total dejaba el importe publicado en la columna de
  // al lado a un contacto que justamente no puede verlo.
  pagos.map((p) => ({ ...p, monto: null, neto: null, iva: null }))

export interface BloqueDeObra {
  /** `null` = las filas que el esquema dejó sin obra. */
  obraId: string | null
  nombre: string
  pagos: PagoConObra[]
}

export const SIN_OBRA = 'Sin obra asignada'

/**
 * LOS PAGOS AGRUPADOS POR OBRA, con las filas sin obra en su propio bloque y al final.
 *
 * `esquema_pago` es POR CLIENTE y su `obra_id` es opcional: hay pagos acordados con el cliente que
 * no cuelgan de ninguna obra todavía. Descartarlos escondería plata comprometida, y repartirlos
 * entre las obras inventaría a cuál pertenece cada uno. Van juntos, dichos como lo que son.
 */
export function agruparPorObra(pagos: PagoConObra[]): BloqueDeObra[] {
  const bloques = new Map<string, BloqueDeObra>()
  for (const p of pagos) {
    // Una obra cuyo id no resolvió a nombre cae en el mismo bloque que las que no tienen obra: el
    // portal no puede nombrarla, y un bloque con título vacío no le dice nada al cliente.
    const clave = p.obraId && p.obraNombre ? p.obraId : ' sin-obra'
    const previo = bloques.get(clave)
    if (previo) previo.pagos.push(p)
    else bloques.set(clave, { obraId: clave === ' sin-obra' ? null : p.obraId, nombre: p.obraNombre || SIN_OBRA, pagos: [p] })
  }
  return [...bloques.values()].sort(
    (a, b) => Number(a.obraId === null) - Number(b.obraId === null) || a.nombre.localeCompare(b.nombre, 'es'),
  )
}

/** Las obras que puede elegir el filtro: `[id, nombre]`, ordenadas por nombre. */
export type ObraQueFiltra = [id: string, nombre: string]

/**
 * LAS OBRAS QUE OFRECE EL FILTRO — las que tienen pagos EN CURSO.
 *
 * Ofrecer una obra que filtra a cero es un botón que lleva a nada, y una obra anterior no tiene
 * pastilla propia: sus pagos viven en la sección de abajo, que existe justamente para eso.
 */
export function obrasQueFiltran(pagos: PagoConObra[]): ObraQueFiltra[] {
  const vistas = new Map<string, string>()
  for (const p of pagos) if (p.obraId && !p.historico && !vistas.has(p.obraId)) vistas.set(p.obraId, p.obraNombre)
  return [...vistas.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
}

/** Las tres listas que la pantalla de Pagos dibuja, todas del mismo alcance. */
export type PagosEnPantalla = {
  /** TODO lo del alcance elegido: es la base de los totales del pie y del calendario. */
  todos: PagoConObra[]
  /** Lo de las obras en curso — el listado principal. */
  enCurso: PagoConObra[]
  /** Lo de obras anteriores — la sección gris de abajo. */
  anteriores: PagoConObra[]
}

/**
 * EL ALCANCE DE LA PANTALLA, DECIDIDO UNA SOLA VEZ.
 *
 * ═══ CON UNA OBRA ELEGIDA, TODO ES DE ESA OBRA (27/08/2026) ═══
 *
 * Textual del dueño: «no podemos mezclar lo que dice pagos de obras anteriores cuando se está
 * filtrando para ver lo específico de cada obra». El filtro se aplicaba tarde y por partes: el
 * listado principal sí lo respetaba, pero la sección de obras anteriores, su total, el conteo del
 * encabezado y el «próximo pago» seguían siendo del cliente entero. En un cliente con cuatro obras
 * eso significa que al pedir una, la pantalla seguía mostrando plata de otra.
 *
 * Las tres listas salen de acá y de un solo `filter`, para que no exista la posibilidad de que una
 * se olvide del filtro. Que `anteriores` quede vacía con una obra elegida no es casualidad ni un
 * caso a mano: `anterioresPorObraTerminada` ya decidió que los pagos de una obra terminada son de una obra
 * en curso, y `obrasQueFiltran` sólo ofrece obras en curso. El invariante se prueba, no se supone.
 *
 * @param obraId `null` = sin filtro: entran todas las obras Y los pagos que no cuelgan de ninguna.
 */
export function pagosEnPantalla(pagos: PagoConObra[], obraId: string | null): PagosEnPantalla {
  const todos = obraId ? pagos.filter((p) => p.obraId === obraId) : pagos
  return {
    todos,
    enCurso: todos.filter((p) => !p.historico),
    anteriores: todos.filter((p) => p.historico),
  }
}

/** Lo contratado de una obra, en la moneda en que se firmó. */
export type ContratoDeObra = { monto: number | null; moneda: 'ARS' | 'USD' }

/** El contrato del conjunto, y de cuántas obras salió. */
export type ContratoDelConjunto = ContratoDeObra & {
  /** Cuántas obras aportaron su contrato a la suma. */
  obras: number
  /** Cuántas quedaron afuera por no tener contrato cargado. La pantalla lo DICE en vez de callarlo. */
  sinContrato: number
  /** Lo cobrado ANTES del corte del portal, que ya se descontó del contrato de arriba. La pantalla
   *  lo dice: un contrato que aparece más chico sin explicación es un contrato que nadie reconoce. */
  cobradoAntes: number
}

/**
 * ¿ESTA OBRA SIGUE EN JUEGO? — la pregunta que decide qué ve el cliente.
 *
 * ═══ LA REGLA, DEL DUEÑO Y TEXTUAL (27/08/2026) ═══
 *
 * *«tomá sólo lo pendiente, sólo esas obras»*. Una obra sin un solo pago pendiente está terminada y
 * cobrada: no tiene por qué ocupar el pie con su contrato ni con lo que se cobró. «Galpones,
 * Mampostería, Cancha de Padel» se cerró el 21/08 con su último cobro y arrastraba $204.361.104 de
 * contrato a un pie que debía hablar de las TRES obras que siguen abiertas.
 *
 * QUÉ CAMBIÓ EL 10/09/2026: se preguntaba por PAGOS PENDIENTES, y eso era una SEGUNDA definición de
 * obra terminada que contradecía a la del Inicio. Ahora la obra está en juego mientras tenga algún
 * pago no histórico, y quién es histórico lo decide `anterioresPorObraTerminada` con la canónica —
 * `obra_canonica.estado`— más la condición de estar al día.
 *
 * Un bloque SIN pagos es una obra cuyo cronograma todavía no se cargó, no una obra terminada: su
 * contrato cuenta. (`[].every()` es `true` por vacuidad y confundiría los dos casos.)
 */
export function obraEnCurso(b: BloqueDeObra): boolean {
  if (!b.pagos.length) return true
  // NO se vuelve a preguntar «¿le queda algo por cobrar?»: ésa era la segunda definición de obra
  // terminada. `anterioresPorObraTerminada` ya marcó `historico` con la canónica —cerrada Y al día—
  // y acá sólo se lee esa marca. Preguntarlo de nuevo dejaba fuera del contrato a una obra ACTIVA
  // que estaba cobrada al día, que es exactamente el caso de ME - PISOS 120 M².
  return b.pagos.some((p) => !p.historico)
}

/**
 * EL CONTRATO DEL CLIENTE ES LA SUMA DE LOS DE SUS OBRAS EN CURSO.
 *
 * ═══ TRES REGLAS, LAS TRES APRENDIDAS DE UN PIE QUE MENTÍA (26/08/2026) ═══
 *
 * 1 · UNA OBRA SIN CONTRATO NO ANULA A LAS OTRAS. Devolvía `null` en cuanto una faltaba, y a La
 *     Estrella —Galpón 9 por $49,7 M y Oficina y Fábrica de Palitos por $246,1 M, las dos cargadas—
 *     le escribía «CONTRATO sin cargar» porque una tercera obra vieja no lo tiene. Callar dos
 *     contratos ciertos para no publicar uno incompleto deja al cliente con menos verdad, no con
 *     más. Ahora se suman los que hay y se DICE cuántos faltan: un total con su cobertura al lado no
 *     se confunde con un total completo.
 *
 * 2 · LAS OBRAS ANTERIORES NO SUMAN. `resumenDeCobro` descarta sus cobros —son trabajo previo— así
 *     que meter su contrato en la suma comparaba un contrato con los pagos de otro. En San Francisco
 *     eran los $204,4 M de «Galpones, Mampostería, Cancha de Padel»: el pie publicaba $299,7 M
 *     contratados contra un «pagado» que no incluía sus cinco cobros históricos.
 *
 * 3 · QUE UN COBRO NO TENGA OBRA NO DICE NADA SOBRE EL CONTRATO. Los bloques sin obra —«Saldo obras
 *     San Francisco», «de todas las obras»— se ignoran acá; ya estaban ignorados y sigue igual.
 *
 * `null` sólo cuando NINGUNA obra tiene contrato, o cuando las que lo tienen no comparten moneda:
 * sumar dólares con pesos daría un número que no existe.
 */
export function contratoDelConjunto(
  bloques: BloqueDeObra[],
  contratos: Map<string, ContratoDeObra>,
): ContratoDelConjunto | null {
  // Una obra cuyos cobros son TODOS históricos está fuera de los totales: su contrato también. Se
  // pregunta por «ninguno en curso» y no por «alguno en curso» a propósito: un bloque sin cobros
  // todavía no es una obra anterior — es una obra cuyo cronograma no se cargó, y su contrato cuenta.
  // (`[].every()` es `true` por vacuidad: preguntar sólo por «todos históricos» descartaría también
  //  los bloques vacíos, que es el caso opuesto. Se pide explícitamente que no queden cobros.)
  const conObra = bloques.filter((b) => b.obraId !== null && obraEnCurso(b))
  if (!conObra.length) return null
  let total = 0
  let moneda: 'ARS' | 'USD' | null = null
  let obras = 0
  let sinContrato = 0
  // ═══ EL CONTRATO SE MUESTRA NETO DE LO QUE SE COBRÓ ANTES DEL CORTE ═══
  //
  // Si el cliente no ve los pagos anteriores al corte, tampoco puede ver el contrato que esos pagos
  // ya cancelaron: la resta le quedaría como saldo pendiente y le estaríamos reclamando algo que
  // pagó. Los dos lados del pie hablan de la MISMA ventana — desde el corte hasta hoy.
  let cobradoAntes = 0
  for (const b of conObra) {
    const c = contratos.get(b.obraId as string)
    if (!c || c.monto == null) { sinContrato++; continue }
    // Monedas distintas entre obras: no hay un total que se pueda escribir.
    if (moneda && c.moneda !== moneda) return null
    moneda = c.moneda
    const previo = b.pagos.filter((p) => p.historico).reduce((s, p) => s + netoDelPago(p), 0)
    cobradoAntes += previo
    // Nunca negativo: si lo cobrado antes del corte supera el contrato cargado, el contrato está mal
    // y publicar un número negativo sería propagar el error a la cara del cliente.
    total += Math.max(0, c.monto - previo)
    obras++
  }
  return moneda ? { monto: total, moneda, obras, sinContrato, cobradoAntes } : null
}

/** El neto de un pago: sin IVA. El contrato de `obra_canonica` es NETO, así que la resta tiene que
 *  ser contra netos o compara peras con manzanas. */
function netoDelPago(p: { neto?: number | null; monto?: number | null; iva?: number | null }): number {
  if (p.neto != null) return p.neto
  if (p.monto == null) return 0
  return p.iva != null ? p.monto - p.iva : p.monto
}

/**
 * DE QUIÉN ES ESE CONTRATO — el pie de la cifra, y la razón de que exista este texto.
 *
 * ═══ TRES NÚMEROS DISTINTOS SE LLAMABAN «CONTRATO» (10/09/2026) ═══
 *
 * El mismo cliente leía «$31,85 M contrato» en el esquema de pago de la ficha, «$156.174.253
 * contratado» en `/clientes`, y «CONTRATO $12.692.935 + IVA de 3 obras» en su portal. Los dos
 * primeros eran un defecto de fuente y están arreglados. El tercero NO es el mismo concepto y no
 * hay que fusionarlo: es la suma de lo contratado de las obras EN CURSO QUE TIENEN CRONOGRAMA
 * PUBLICADO —lo único contra lo que el pie de esa pantalla puede comparar sus pagos— y se mide en
 * la moneda en que se firmó cada una.
 *
 * Lo que no se puede es seguir llamándolo «contrato» a secas. Un número que se llama igual que
 * otro y vale un orden de magnitud menos no es un dato: es una discusión.
 */
export function alcanceDelContrato({ obras, sinContrato }: { obras: number; sinContrato: number }): string {
  const base = `de ${obras === 1 ? '1 obra' : `${obras} obras`} con cronograma publicado`
  if (!sinContrato) return base
  return `${base} · ${sinContrato === 1 ? '1 obra sin contrato cargado' : `${sinContrato} obras sin contrato cargado`}`
}
