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
  obra_texto: string | null
  anulada: boolean
  total: number | null
  tiene_adjunto?: boolean
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
    case 'sinObra': return !f.obra_texto?.trim()
    case 'sinComprobante': return f.tiene_adjunto !== true
    // SIN EL CONJUNTO NO HAY CORTE, Y NO PASA NADIE. «Recién cargadas» es una propiedad de la
    // POBLACIÓN —las últimas 30 de la pestaña—, no de la fila: una fila sola no puede saber si está
    // entre las últimas. Devolver `true` cuando falta el conjunto convertiría el chip en «Todo».
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
    nSinObra: vivas.filter((f) => !f.obra_texto?.trim()).length,
    nSinComprobante: vivas.filter((f) => f.tiene_adjunto !== true).length,
    aPagar: vivas.filter((f) => f.estado === ESTADO.PENDIENTE).reduce((s, f) => s + (f.total ?? 0), 0),
    total: vivas.reduce((s, f) => s + (f.total ?? 0), 0),
    sinImporte: vivas.filter((f) => f.total == null).length,
  }
}

/** El conteo de cada chip, sobre la población entera y no sobre la página que se está mirando. */
export function conteosDe(filas: Filtrable[]): Record<FiltroSheet, number> {
  return {
    todo: filas.length,
    recienCargadas: clavesRecienCargadas(filas).size,
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
 * LAS ÚLTIMAS `n` QUE ENTRARON, por número de renglón.
 *
 * Las anuladas no entran, igual que en el resto de los cortes: el chip es una cola de trabajo —«esto
 * acaba de llegar, revisalo»— y una fila muerta no se revisa. Por eso el conteo del chip es
 * exactamente `n` mientras haya `n` filas vivas.
 */
export function clavesRecienCargadas(filas: Filtrable[], n: number = RECIEN_CARGADAS): Set<number> {
  return new Set(
    filas.filter((f) => !f.anulada).sort(porOrdenDeCarga).slice(0, n).map((f) => f.fila),
  )
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
