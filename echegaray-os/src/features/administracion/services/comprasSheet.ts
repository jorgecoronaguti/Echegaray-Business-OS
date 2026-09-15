// LO QUE LA PANTALLA 24 DECIDE SOBRE UNA FILA DE LA PESTAÑA COMPRAS. Puro, y por eso probado.
//
// ═══ POR QUÉ LA LISTA CAMBIÓ DE FUENTE (25/08/2026) ═══
//
// Hasta hoy la pantalla listaba `comprobante_compra` —la vista del libro de compras de ARCA— y su
// texto de ayuda afirmaba que «la pestaña Compras del Sheet es una proyección de lo mismo, no una
// segunda versión». Medido el 25/08, eso es falso: ARCA tiene 632 comprobantes y la pestaña 882
// filas. La diferencia no es ruido, es todo lo que ARCA no puede tener — el gasto sin factura, los
// sueldos, los impuestos, las boletas, y la imputación a obra que escribe el dueño a mano.
//
// El pedido fue explícito: «la sección compras en app.ecsas tiene que replicar toda la información
// que actualmente se concentra en pestaña Compras». Así que la lista es la pestaña. El control
// fiscal contra ARCA sigue siendo otra pregunta y sigue teniendo su lugar; lo que no puede seguir es
// que la pantalla llame «Compras» a una población distinta de la que el dueño llama Compras.
//
// ═══ «PROYECTADO» NO ES UN GASTO HECHO ═══
//
// El mockup dibuja tres estados (A pagar · Pagado · Retenido) y la pestaña tiene cuatro
// (Pagado 821 · Proyectado 39 · Pendiente 16 · ELIMINADO 6). «Proyectado» es una PROYECCIÓN: el
// dueño la escribe para que la caja la vea venir, y todavía no existe como obligación. Meterla en la
// pastilla de «A pagar» la presentaría como un hecho, que es exactamente lo que las reglas de este
// sistema prohíben. Lleva pastilla propia, apagada, y no suma en «A pagar».

/** La paleta del canónico `24`, líneas 195-197. */
const TONO = {
  pagado: { color: '#067647', fondo: '#F1F9F4', borde: '#D6EBDF' },
  aPagar: { color: '#B54708', fondo: '#FDF6EE', borde: '#F0E1CD' },
  alerta: { color: '#B42318', fondo: '#FEF6F5', borde: '#F3DDDA' },
  neutro: { color: '#6B6B67', fondo: '#FAFAF8', borde: '#E7E6E2' },
} as const

export interface Pastilla { texto: string; color: string; fondo: string; borde: string }

/** El estado que el dueño escribe en la columna «Estado» de su pestaña. */
export const ESTADO = {
  PAGADO: 'Pagado',
  PENDIENTE: 'Pendiente',
  PROYECTADO: 'Proyectado',
  ANULADA: 'ELIMINADO',
} as const

/**
 * ¿LA PLATA DE ESTA COMPRA YA SALIÓ? Un solo criterio para toda la pantalla.
 *
 * Existe porque la lista muestra una columna de fecha de pago y la fuente NO TIENE una: la única
 * fecha ligada al pago es Q («Fecha prevista de pago (día)»), que en una fila paga es el día en que
 * se pagó y en una impaga es una intención. Medido el 15/09/2026 sobre las 891 filas vivas: las 41
 * pendientes tienen esa fecha cargada y 40 con día FUTURO. Sin este predicado, la columna afirma 41
 * pagos que no ocurrieron.
 *
 * MIRA EL ESTADO, NO LA FECHA NI EL MONTO. `monto_pagado > 0` incluiría las 3 pendientes con un pago
 * parcial —plata que salió, deuda que sigue viva— y llamarlas «pagadas» taparía el saldo. El estado
 * es lo que el dueño escribe cuando cierra el pago, y es el mismo que cuenta el chip «A pagar».
 *
 * FALLA CERRADO: lo que la pestaña no dice NO está pagado. Una fila sin estado se dibuja como
 * impaga, que es el error que se puede ver y corregir; al revés se esconde solo.
 */
export const estaPagada = (estado: string | null | undefined): boolean =>
  estado?.trim() === ESTADO.PAGADO

/**
 * LA PASTILLA DE UNA FILA. Nunca inventa un estado: lo que la pestaña no dice se dibuja «Sin
 * estado» y apagado, no se asume pagado ni pendiente.
 */
export function pastillaDe(estado: string | null): Pastilla {
  switch (estado?.trim()) {
    case ESTADO.PAGADO: return { texto: 'Pagado', ...TONO.pagado }
    case ESTADO.PENDIENTE: return { texto: 'A pagar', ...TONO.aPagar }
    case ESTADO.PROYECTADO: return { texto: 'Proyectado', ...TONO.neutro }
    case ESTADO.ANULADA: return { texto: 'Anulada', ...TONO.alerta }
    default: return { texto: 'Sin estado', ...TONO.neutro }
  }
}

/** Lo mínimo que necesita saberse de una fila para contarla, filtrarla y sumarla. */
/**
 * LAS TRES «OBRAS» QUE NO SON OBRAS — costo de estructura de la empresa.
 *
 * `24 · Compras v2` las marca con un chip al lado del destino, y el motivo es económico: un gasto
 * imputado a `F931`, `Taller` o `Almacen` no encarece ninguna obra, encarece la empresa. Leerlos
 * como obra al comparar presupuesto contra realidad castiga a la obra equivocada.
 *
 * NO es una constante inventada en el front: los tres son valores REALES de la columna
 * «Cliente / Asignación» de la pestaña, medidos el 25/08/2026 — F931 15 filas, Taller 58,
 * Almacen 24. La lista vive acá y no en el componente porque es una regla de negocio, no un estilo.
 * `Almacén` con tilde no está en la pestaña; se acepta igual porque el día que alguien lo escriba
 * así el chip tiene que seguir apareciendo.
 */
const ESTRUCTURA = new Set(['f931', 'taller', 'almacen', 'almacén'])

/** ¿Este destino es costo de la empresa y no de una obra? */
export function esEstructura(obra: string | null | undefined): boolean {
  return ESTRUCTURA.has(String(obra ?? '').trim().toLowerCase())
}

export interface Filtrable {
  /** EL RENGLÓN DE LA PESTAÑA — y el orden en que el gasto entró. Ver `porOrdenDeCarga`. */
  fila: number
  /** La fecha del COMPROBANTE. No ordena la lista: sólo desempata renglones iguales. */
  fecha?: string | null
  estado: string | null
  /**
   * LA OBRA RESUELTA, no el texto de la columna J (15/09/2026). El chip «Sin obra» preguntaba
   * `!obra_texto`, y la J está escrita en 947 de 947 filas —dice el CLIENTE, no la obra—, así que el
   * chip contaba 0 y prometía que no quedaba nada por imputar. Lo que de verdad falta imputar es lo
   * que no tiene `obra_id` ni destino en Supabase, que es lo que este campo trae.
   */
  obra?: { rotulo: string | null } | null
  anulada: boolean
  total: number | null
  tiene_adjunto?: boolean
  /**
   * LOS PAPELES DE LA FILA, y con ellos la ÚNICA fecha de carga que esta pantalla puede leer.
   * Ausente = no se sabe cuándo entró, y entonces manda el renglón. Ver `fechaDeCarga`.
   */
  adjuntos?: readonly { subido_at?: string | null }[]
}

export const FILTROS = ['todo', 'recienCargadas', 'aPagar', 'sinObra', 'sinComprobante', 'sueltos'] as const
export type FiltroSheet = (typeof FILTROS)[number]

export const ROTULO: Record<FiltroSheet, string> = {
  todo: 'Todo',
  recienCargadas: 'Recién cargados',
  aPagar: 'A pagar',
  sinObra: 'Sin obra',
  sinComprobante: 'Sin comprobante',
  sueltos: 'Comprobantes sin vincular',
}

/** El filtro de la URL, cerrado: cualquier cosa rara vuelve a «todo». */
export function filtroDe(v: string | null | undefined): FiltroSheet {
  return (FILTROS as readonly string[]).includes(String(v)) ? (v as FiltroSheet) : 'todo'
}

/**
 * ¿Esta fila entra en esta vista?
 *
 * LAS ANULADAS NO ENTRAN EN NINGÚN FILTRO SALVO «TODO», y se replican igual para que la cuenta de
 * arriba cierre contra la pestaña. Que el dueño las vea en su Sheet y la pantalla las esconda del
 * conteo total sería mentir por omisión; que aparezcan en «A pagar» sería peor.
 */
export function pasa(f: Filtrable, filtro: FiltroSheet, recien?: ReadonlySet<number>): boolean {
  if (filtro === 'todo') return true
  if (f.anulada) return false
  switch (filtro) {
    case 'aPagar': return f.estado === ESTADO.PENDIENTE
    case 'sinObra': return !f.obra?.rotulo
    case 'sinComprobante': return f.tiene_adjunto !== true
    // SIN EL CONJUNTO NO HAY CORTE, Y NO PASA NADIE. «Recién cargadas» es una propiedad de la
    // POBLACIÓN —qué entró último, ver `clavesRecienCargadas`—, no de la fila: una fila sola no
    // puede saber si está entre las últimas. Devolver `true` sin el conjunto sería el chip «Todo».
    case 'recienCargadas': return recien != null && recien.has(f.fila)
    default: return true
  }
}

export interface Totales {
  nTotal: number
  nSinObra: number
  nSinComprobante: number
  aPagar: number
  total: number
  /**
   * CUÁNTAS FILAS VIVAS NO TIENEN IMPORTE, y por lo tanto quedan FUERA de `total` y de `aPagar`.
   *
   * Existe porque la suma trata el `null` como 0 —no puede hacer otra cosa— y sin este número el
   * total se lee como si estuviera completo. Un total al que le falta algo y no lo dice es peor que
   * no tener total: alguien lo compara contra el Sheet, no cierra, y no hay forma de saber por qué.
   */
  sinImporte: number
}

/**
 * LOS NÚMEROS DEL PIE. Las anuladas NO suman: sus importes están en cero en la pestaña, así que
 * incluirlas no cambiaría el total — pero sí cambiaría los CONTEOS, y «6 sin obra» que en realidad
 * son 6 filas muertas manda a alguien a trabajar sobre nada.
 */
export function totalesDe(filas: Filtrable[]): Totales {
  const vivas = filas.filter((f) => !f.anulada)
  return {
    nTotal: filas.length,
    nSinObra: vivas.filter((f) => !f.obra?.rotulo).length,
    nSinComprobante: vivas.filter((f) => f.tiene_adjunto !== true).length,
    aPagar: vivas.filter((f) => f.estado === ESTADO.PENDIENTE).reduce((s, f) => s + (f.total ?? 0), 0),
    total: vivas.reduce((s, f) => s + (f.total ?? 0), 0),
    sinImporte: vivas.filter((f) => f.total == null).length,
  }
}

/**
 * El conteo de cada chip, sobre la población entera y no sobre la página que se está mirando.
 *
 * `recien` ENTRA YA CALCULADO cuando quien llama también lo va a usar para filtrar. No es una
 * optimización: desde que el corte mira la fecha de carga, calcularlo dos veces son dos lecturas del
 * reloj, y el número del chip podría no ser el de la lista que el chip abre. Un control no se valida
 * contra una segunda evaluación de sí mismo.
 */
export function conteosDe(
  filas: Filtrable[], recien?: ReadonlySet<number>,
): Record<FiltroSheet, number> {
  return {
    todo: filas.length,
    recienCargadas: (recien ?? clavesRecienCargadas(filas)).size,
    aPagar: filas.filter((f) => pasa(f, 'aPagar')).length,
    sinObra: filas.filter((f) => pasa(f, 'sinObra')).length,
    sinComprobante: filas.filter((f) => pasa(f, 'sinComprobante')).length,
    sueltos: 0,
  }
}

/**
 * EL ORDEN POR DEFECTO DE LA LISTA: LO ÚLTIMO QUE ENTRÓ, ARRIBA.
 *
 * ═══ EL DEFECTO MEDIDO (08/09/2026, producción) ═══
 *
 * La lista ordenaba por FECHA DEL COMPROBANTE y dibujaba 200 de 809. El dueño carga comprobantes por
 * el chat, el bot los agrega al final de la pestaña, y una factura de mayo cargada hoy caía en la
 * fila 930 pero en el puesto ~600 de la lista: quedaba debajo del corte y el aviso de «609 más sin
 * dibujar» estaba al pie. La conclusión desde la pantalla era «no se cargó» — que es exactamente lo
 * que el orden estaba escondiendo.
 *
 * `fila` ES el orden de carga: la pestaña sólo crece por abajo, así que un número de renglón más
 * alto es un gasto que entró después. No hace falta una columna `creado_at` que la pestaña no tiene.
 *
 * La fecha queda de DESEMPATE y no de criterio principal. Hoy no desempata nunca —la fila es única—
 * y está escrita igual porque es el contrato: si mañana dos filas comparten renglón, la más nueva va
 * primero. Lo que la columna «Fecha» muestra sigue siendo la fecha del comprobante: se cambió el
 * orden, no el dato.
 */
export function porOrdenDeCarga(
  a: { fila: number; fecha?: string | null },
  b: { fila: number; fecha?: string | null },
): number {
  if (b.fila !== a.fila) return b.fila - a.fila
  return String(b.fecha ?? '').localeCompare(String(a.fecha ?? ''))
}

/** La lista ordenada por carga. Copia: ordenar en el lugar mutaría la población de los conteos. */
export function ordenarPorCarga<T extends { fila: number; fecha?: string | null }>(filas: T[]): T[] {
  return [...filas].sort(porOrdenDeCarga)
}

/**
 * CUÁNTAS FILAS SON «RECIÉN CARGADAS».
 *
 * 30 y no 10: el bot descarga un fajo entero de una vez —14 comprobantes en la jornada del 07-08/09—
 * y un corte de 10 dejaría la mitad de un fajo afuera del chip que existe para verlo. Tampoco 100:
 * eso ya es la lista.
 */
export const RECIEN_CARGADAS = 30

/**
 * LA VENTANA DE «CARGA RECIENTE», EN DÍAS.
 *
 * 14 y no 7: el dueño entra a la pantalla a confirmar que lo que mandó por el chat llegó, y no entra
 * todos los días. Una ventana de una semana deja afuera el fajo del lunes anterior justo cuando
 * alguien vuelve a preguntar por él. Tampoco 30: a esa altura el chip deja de ser una cola de
 * trabajo y pasa a ser el mes.
 */
export const DIAS_DE_CARGA_RECIENTE = 14

/**
 * CUÁNDO ENTRÓ ESTA FILA, según lo único que la pantalla puede leer.
 *
 * El registro del bot vive en `comunicacion.comprobantes_cargados` y tiene el `creado_at` exacto,
 * pero ese schema no está expuesto a PostgREST y `authenticated` no tiene SELECT sobre él (medido
 * el 15/09/2026 contra `information_schema.role_table_grants`: sólo `postgres`). Abrirlo sería tocar
 * permisos para un chip. `compra_adjunto` SÍ lo está, ya viaja en el mismo `Promise.all` de
 * `getComprasSheet`, y su `subido_at` es el momento en que el papel se guardó — que para todo lo que
 * entra por el chat es el mismo acto de carga: verificado sobre las 22 filas del 01-07/09, el
 * `subido_at` del papel coincide día por día con el `creado_at` del registro del bot.
 *
 * El MÁXIMO y no el mínimo: si a una fila se le agregó un segundo papel, lo último que pasó con esa
 * compra es lo que la vuelve trabajo pendiente de revisar.
 *
 * `null` = esta fila no tiene papel y por lo tanto NO SE SABE cuándo entró. No se inventa una fecha:
 * el renglón decide por ella (ver `clavesRecienCargadas`).
 */
export function fechaDeCarga(f: Pick<Filtrable, 'adjuntos'>): string | null {
  let ultima: string | null = null
  for (const a of f.adjuntos ?? []) {
    const s = a.subido_at
    if (!s || Number.isNaN(Date.parse(s))) continue
    if (ultima == null || Date.parse(s) > Date.parse(ultima)) ultima = s
  }
  return ultima
}

/**
 * LAS QUE ENTRARON ÚLTIMO — POR FECHA DE CARGA, Y EL RENGLÓN COMO RESPALDO.
 *
 * ═══ EL DEFECTO MEDIDO (15/09/2026, base de producción) ═══
 *
 * El corte eran «las últimas `n` POR RENGLÓN», y el renglón dejó de ser el orden de carga el día que
 * la pestaña se reordenó por fecha (08/09/2026). Los 22 comprobantes que el bot cargó entre el 01 y
 * el 07/09 habían entrado en las filas 935-958 y el reordenamiento los movió a las 907-930; las
 * últimas 30 por renglón pasaron a ser las 933-962. Resultado: 22 comprobantes que el bot SÍ cargó
 * —están en la base, con su papel— desaparecieron del chip que existe para verlos, y la conclusión
 * desde la pantalla fue «no se replicaron».
 *
 * El comentario de `porOrdenDeCarga` decía «la pestaña sólo crece por abajo, así que un número de
 * renglón más alto es un gasto que entró después». Eso era cierto hasta que alguien ordenó la
 * pestaña. Una premisa que depende de que nadie toque el Sheet no es una premisa.
 *
 * ═══ EL CRITERIO ═══
 *
 * Reciente por carga = las de los últimos `DIAS_DE_CARGA_RECIENTE` días, O las últimas `n` cargas,
 * LO QUE SEA MÁS. Las dos mitades existen por un motivo distinto: la ventana de días es la que
 * responde «¿llegó lo que mandé?» y el piso de `n` es el que impide que una semana sin cargar nada
 * deje el chip en cero y parezca que el bot se rompió.
 *
 * ═══ POR QUÉ ES UNIÓN Y NO REEMPLAZO ═══
 *
 * El renglón sigue contando. Las cargas que el dueño escribe a mano en el Sheet no dejan papel, así
 * que NO tienen fecha de carga: si el criterio fuera sólo la fecha, desaparecerían del chip — que es
 * el mismo defecto que este arreglo corrige, con la víctima cambiada. Sumar en vez de reemplazar
 * hace que el chip sólo pueda crecer: nada de lo que hoy se ve se deja de ver. Medido sobre la base
 * viva: 30 filas por renglón + 44 por fecha de carga = 53 distintas.
 *
 * Las anuladas no entran, igual que en el resto de los cortes: el chip es una cola de trabajo —«esto
 * acaba de llegar, revisalo»— y una fila muerta no se revisa.
 *
 * `ahora` ENTRA POR PARÁMETRO y no se lee adentro: un corte que consulta el reloj del sistema sólo
 * se puede probar contra el mundo de hoy, y un test así se pone rojo solo dentro de 14 días.
 */
export function clavesRecienCargadas(
  filas: Filtrable[],
  n: number = RECIEN_CARGADAS,
  ahora: Date = new Date(),
): Set<number> {
  const vivas = filas.filter((f) => !f.anulada)
  // El respaldo: el criterio viejo, intacto.
  const porRenglon = [...vivas].sort(porOrdenDeCarga).slice(0, n)
  const conCarga = vivas
    .map((f) => ({ fila: f.fila, cuando: Date.parse(fechaDeCarga(f) ?? '') }))
    .filter((x) => !Number.isNaN(x.cuando))
    .sort((a, b) => b.cuando - a.cuando)
  const desde = ahora.getTime() - DIAS_DE_CARGA_RECIENTE * 24 * 60 * 60 * 1000
  const enVentana = conCarga.filter((x) => x.cuando >= desde)
  // «Lo que sea más»: la ventana si alcanza para `n`, y si no las `n` últimas cargas aunque sean
  // viejas. Nunca menos de lo que el piso garantiza.
  const porCarga = enVentana.length >= n ? enVentana : conCarga.slice(0, n)
  return new Set([...porCarga.map((x) => x.fila), ...porRenglon.map((f) => f.fila)])
}

/**
 * CÓMO SE MUESTRA UN ADJUNTO. Un `null` significa «no hay papel», y eso se DICE — no se dibuja un
 * hueco. La miniatura sólo para lo que es imagen: un PDF renderizado como `<img>` se ve roto.
 */
export function claseDeAdjunto(mediaType: string | null | undefined): 'imagen' | 'pdf' | 'otro' | 'ninguno' {
  const t = String(mediaType ?? '').toLowerCase()
  if (!t) return 'ninguno'
  if (t === 'application/pdf') return 'pdf'
  if (t.startsWith('image/')) return 'imagen'
  return 'otro'
}

/**
 * CUÁNTAS FILAS SE DIBUJAN DE UNA SOLA VEZ.
 *
 * ═══ EL DEFECTO MEDIDO (06/09/2026, producción) ═══
 *
 * La pantalla dibujaba las 947 filas juntas: 43.871px de alto, 947 filas de grilla con su enlace,
 * su pastilla y su botón de papel. Funciona —y por eso nadie lo miró— pero es la página más pesada
 * del OS y en el teléfono se nota. No hay un scroll virtual acá: la lista es un Server Component y
 * volverla cliente para virtualizarla costaría el prerender entero.
 *
 * ═══ POR QUÉ 200 Y NO UN PAGINADOR ═══
 *
 * El canvas NO dibuja un paginador, y agregarle un control que el contrato no tiene a la pantalla
 * cuyo trabajo es parecerse al contrato sería cambiar el problema de lugar. Lo que el canvas SÍ
 * dibuja es su pie diciendo «6 de 882»: mostrar un recorte y decir cuánto es el todo es su propio
 * vocabulario. 200 filas son ~8.800px — cinco pantallas de scroll, que es lo que alguien recorre
 * antes de filtrar.
 *
 * ═══ EL ENLACE DIRECTO MANDA SOBRE EL TOPE ═══
 *
 * `?s=<fila>` abre una fila concreta y se usa: si esa fila cayera fuera del recorte, el enlace
 * llevaría a una lista donde la fila abierta no está — el panel diría una cosa y la lista otra. Por
 * eso el corte se estira hasta incluirla. Cuesta el alto de esa fila en adelante, y es el único
 * caso en que el tope cede.
 */
export const TOPE_EN_PANTALLA = 200

export interface Recorte<T> {
  enPantalla: T[]
  /** Las que quedaron fuera del recorte. 0 = se está viendo todo lo que coincide. */
  ocultas: number
}

export function recorteDeLista<T extends { fila: number }>(
  filas: T[],
  { tope = TOPE_EN_PANTALLA, abierta = null, todo = false }:
  { tope?: number; abierta?: number | null; todo?: boolean } = {},
): Recorte<T> {
  if (todo || filas.length <= tope) return { enPantalla: filas, ocultas: 0 }
  const donde = abierta == null ? -1 : filas.findIndex((f) => f.fila === abierta)
  const corte = Math.max(tope, donde + 1)
  return { enPantalla: filas.slice(0, corte), ocultas: filas.length - corte }
}

/**
 * EL PAPEL DE CADA FILA — SÓLO POR CLAVE. Puro.
 *
 * ═══ EL DEFECTO QUE ESTO SACA (10/09/2026, reportado por el dueño) ═══
 *
 * Acá había un atajo: si la clave de la fila no encontraba ningún adjunto, se buscaba POR NÚMERO DE
 * RENGLÓN (`porFila.get(c.fila)`). Ese atajo es exactamente lo que la migración de `compra_adjunto`
 * prohíbe en su propio comentario —«`fila_compras` se guarda como pista de la última posición
 * conocida, NUNCA como vínculo»— porque el ID de la pestaña es `=ROW()-4` y una fila insertada
 * arriba corre todos los renglones de abajo.
 *
 * Medido sobre la base viva antes del arreglo: 5 filas recibían su papel únicamente por ese atajo, y
 * en una de ellas —la fila 932, Lliteras, CUIT 30708390557— el papel colgado era un comprobante
 * leído con CUIT 20349213347. La pantalla mostraba, con cara de hecho, el comprobante de otro.
 *
 * La conciliación de claves (`c:<cuit>|…` contra `p:<proveedor>|…` del mismo comprobante) NO se hace
 * acá: se hace una sola vez, en el sync, contra el espejo recién escrito
 * (`orquestador/lib/comprobantes/reconciliar-adjuntos.mjs`). Dos definiciones de «este papel es de
 * esta compra» serían dos verdades, y la pantalla no es el lugar donde se decide una identidad.
 */
export function papelesDeCadaFila<
  F extends { fila: number; clave: string | null },
  A extends { compra_clave: string | null },
>(filas: F[], adjuntos: A[]): (F & { adjuntos: A[]; tiene_adjunto: boolean })[] {
  const porClave = new Map<string, A[]>()
  for (const a of adjuntos) {
    if (!a.compra_clave) continue
    const l = porClave.get(a.compra_clave) ?? []
    l.push(a)
    porClave.set(a.compra_clave, l)
  }
  return filas.map((c) => {
    const suyos = (c.clave ? porClave.get(c.clave) : null) ?? []
    return { ...c, adjuntos: suyos, tiene_adjunto: suyos.length > 0 }
  })
}

/**
 * LOS PAPELES QUE NO ENCONTRARON SU FILA — la sub-vista de trabajo de la pestaña.
 *
 * Cada uno de éstos es un gasto cuyo respaldo está guardado pero colgado de nada, y sólo una persona
 * puede decir de cuál es.
 *
 * ═══ POR QUÉ ES UN FILTRO Y NO UNA CONSULTA (12/09/2026) ═══
 *
 * Era un viaje aparte a PostgREST: `compra_adjunto` con `compra_clave is null`. El problema es que
 * `papelesDeCadaFila` ya recibe la tabla ENTERA de adjuntos —la pide `getComprasSheet` en el mismo
 * `Promise.all`— y descarta justo estas filas. O sea que las 15 filas sueltas viajaban dos veces, en
 * dos viajes, y el segundo costaba 158-204 ms medidos (y 277 ms en la carga en frío) para traer datos
 * que ya estaban en el proceso.
 *
 * El orden —lo último subido arriba— lo fijaba el `order('subido_at', desc)` de esa consulta y ahora
 * lo fija esta función: es la MISMA regla, escrita donde se puede probar sin base.
 */
export function papelesSinFila<A extends { compra_clave: string | null; subido_at?: string | null }>(
  adjuntos: A[],
): A[] {
  return adjuntos
    .filter((a) => !a.compra_clave)
    // `subido_at` nulo va al final: un papel sin fecha de subida no puede encabezar «lo último que
    // entró». `localeCompare` sobre el ISO de Postgres ordena bien porque es lexicográfico.
    .sort((x, y) => (y.subido_at ?? '').localeCompare(x.subido_at ?? ''))
}
