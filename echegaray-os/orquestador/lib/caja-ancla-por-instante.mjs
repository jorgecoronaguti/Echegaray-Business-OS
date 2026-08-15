// EL ANCLA DEL CONTEO: UN DÍA QUE ORDENA, UN INSTANTE QUE DESEMPATA.
//
// ═══ EL PEDIDO (15/08/2026) ═══
//
// El dueño: *"la carga del saldo de caja en pesos (no en banco) es manual, pero el sheet tiene q poder
// contemplar el momento (timestamp) en el q se hizo la carga por un tema de conteo y desde ahi hacer
// los descargos correspondientes de compras o incluso la carga de cobranzas. tiene q ser automatico el
// funcionamiento"*.
//
// ═══ LO PRIMERO QUE MEDÍ, PORQUE DECIDE TODO EL DISEÑO ═══
//
// Un sello con hora sólo sirve si lo que se compara contra él TAMBIÉN tiene hora. Leído del archivo
// real el 15/08, columna por columna, con `UNFORMATTED_VALUE` (un serial con hora tiene parte decimal):
//
//     Compras!C   "fecha de carga" ....  852 valores ·  1 con hora  (46184,3333)
//     Compras!AD  "fecha de caja" .....  852 valores ·  0 con hora
//     Cobranzas!Q "fecha de cobro" ....   91 valores ·  0 con hora
//     _BANCO_RAW!A "fecha del mov." ...  403 valores ·  0 con hora
//
// NINGUNA fuente de movimientos de efectivo guarda la hora. El único valor con parte horaria de los
// 1.346 medidos es un accidente de tipeo. Así que un ancla con instante NO SE PUEDE COMPARAR contra
// los movimientos: la comparación existiría, daría un número, y ese número sería inventado.
//
// Por eso este archivo hace exactamente dos cosas, y ninguna más:
//   · ordena por DÍA, que es la granularidad que el dato tiene de verdad;
//   · aísla el empate del mismo día y lo resuelve con un criterio CONSERVADOR Y DECLARADO, dejando
//     preparado el desempate por hora para cuando la hora exista (ver AL FINAL: qué falta).
//
// ═══ LA HIPÓTESIS QUE ME PIDIERON CONFIRMAR O DESTRUIR — CONFIRMADA A MEDIAS, Y LA MITAD IMPORTA ═══
//
// La hipótesis: *"con un ancla que sea un INSTANTE, la ambigüedad se achica mucho, porque se pueden
// ORDENAR los eventos en vez de adivinar si un cambio es movimiento nuevo o corrección de un dato
// viejo"*.
//
// CONFIRMADO que la ambigüedad es real y que es el error dominante. DESTRUIDO que la resuelva el
// instante DEL ANCLA. Lo que da la inmunidad es que cada movimiento se juzgue por SU PROPIA FECHA
// ECONÓMICA — el día en que el billete se movió — y no por si su número apareció o no desde el último
// sello. Un registro histórico que se corrige hoy NO gana fecha de hoy: sigue teniendo la de su
// quincena, y por eso una ventana por fecha lo deja afuera pase lo que pase con el total.
//
// LA MEDICIÓN, del archivo real el 15/08. `_CAJA_ANEXO` publicaba un neto de +$46.646.092 sobre un
// conteo de $12.000.000, y CAJA mostraba $58.646.092 de efectivo. Abierto renglón por renglón (C = el
// histórico de hoy, D = el mismo renglón congelado en el sello del 07/08):
//
//     cobrado en efectivo ........   153.300.064  vs   153.300.064  →           0
//     pagado en efectivo .........  (148.203.781) vs  (148.203.781) →           0
//     jornales en efectivo .......   (50.561.448) vs   (98.848.165) → +48.286.717
//     sueldos de OFICINA .........   (18.981.060) vs   (17.340.435) →  (1.640.625)
//     depositado en el banco .....   (20.996.000) vs   (20.996.000) →           0
//
// Cobranzas no se movió un peso y los pagos tampoco: el 100% del "efectivo que entró desde el conteo"
// es la línea de jornales cambiando hacia atrás. Verificado el porqué contra los rangos con nombre:
// de las 15 quincenas, 8 tienen `JORNALES_REAL_PAGADO` VACÍO —las de 30/04 en adelante— y sus
// adelantos y recibos suman $48.639.117, que por eso dejaron de contar. Es una corrección de datos
// históricos leída por el modelo como billetes entrando al cajón.
//
// Y ACÁ ESTÁ LA PRUEBA DE QUE LA VENTANA POR FECHA ERA INMUNE: de esas 15 quincenas, NINGUNA tiene
// fecha de pago posterior al 07/08 (las 7 con fecha van del 16/02 al 17/07; las otras 8 no tienen).
// Con ventana por fecha económica la línea de jornales aporta $0 al efectivo posterior al conteo —
// con el dato roto y con el dato arreglado, igual. La inmunidad es por construcción, no por suerte.
//
// ═══ CUÁNTO CUESTA CADA MODELO, MEDIDO ═══
//
//     el sello publica hoy .....................  $58.646.092
//     la ventana por fecha daría ...............  $14.304.188   (ver caja-efectivo-fisico.test.mjs)
//     error del modelo vigente .................  $44.341.904
//     ambigüedad del mismo día, el 07/08 .......      $960.000   ← todo lo que la ventana no ordena
//
// El repo cambió, el 07/08, de un modelo con un punto ciego de $960.000 a uno con un punto ciego de
// $44,3 millones. Cuarenta y seis veces peor. La decisión fue correcta en su motivo —el mismo día no
// se puede ordenar— y equivocada en su alcance: se tiró la ventana entera para tapar su borde.
//
// ═══ EL CRITERIO DEL MISMO DÍA: CONSERVADOR Y DECLARADO ═══
//
// Cuando un movimiento cae EL MISMO DÍA del conteo y no tiene hora, el dato para decidir no existe.
// No se inventa: se elige el lado que no puede hacer daño, y se declara.
//
//   · una SALIDA del mismo día ENTRA a la ventana (se descarga del cajón);
//   · una ENTRADA del mismo día NO entra (se asume ya contada por el dueño).
//
// Las dos empujan el número publicado HACIA ABAJO. Es asimétrico a propósito: éste es el número con
// el que se decide qué se paga. Errar por defecto cuesta un pago postergado; errar por exceso cuesta
// un pago rebotado y un descubierto a 62,78%. Y el borde se corrige solo en el conteo siguiente.
//
// LO QUE ESTO NO ES: no es "elegir el lado cómodo". El lado cómodo era el de hoy, que asume el pago
// del mismo día DENTRO del conteo ("pagaste, después contaste") y por eso nunca lo descuenta — el
// defecto exacto que el dueño reportó. El conservador es el que se paga con un número más chico.

/**
 * LO MEDIDO, COMO DATO Y NO COMO PROSA. El test lo cita para que el día que una fuente empiece a
 * guardar la hora, alguien tenga que venir acá a cambiarlo — y al cambiarlo, lea el criterio.
 * `conHora` es cuántos valores tenían parte horaria sobre `medidos` totales, el 15/08/2026.
 */
export const HORA_EN_LAS_FUENTES = [
  { fuente: 'Compras!C', que: 'fecha de carga', medidos: 852, conHora: 1 },
  { fuente: 'Compras!AD', que: 'fecha de caja', medidos: 852, conHora: 0 },
  { fuente: 'Cobranzas!Q', que: 'fecha de cobro', medidos: 91, conHora: 0 },
  { fuente: '_BANCO_RAW!A', que: 'fecha del movimiento', medidos: 403, conHora: 0 },
]

/** ¿Alguna fuente guarda la hora de forma utilizable? Hoy no, y el modelo lo dice en voz alta. */
export const HAY_HORA_EN_LOS_MOVIMIENTOS =
  HORA_EN_LAS_FUENTES.every((f) => f.conHora / f.medidos > 0.5)

/** El criterio del empate, escrito una sola vez para que la pestaña y el test citen lo mismo. */
export const CRITERIO_MISMO_DIA =
  'un movimiento del MISMO día del conteo, sin hora, se resuelve conservador: las SALIDAS entran a la '
  + 'ventana (descargan el cajón) y las ENTRADAS no entran (se asumen ya contadas). Las dos bajan el '
  + 'número publicado, que es el lado seguro para el que decide qué pagar.'

/** El día de un serial de Sheets, descartando la parte horaria si la tuviera. */
export const diaDe = (serial) => (Number.isFinite(serial) ? Math.trunc(serial) : NaN)

/** ¿Este serial trae hora de verdad? Un `1e-9` de tolerancia: los seriales viajan como flotantes. */
export const tieneHora = (serial) =>
  Number.isFinite(serial) && Math.abs(serial - Math.trunc(serial)) > 1e-9

/**
 * NÚCLEO PURO: ¿dónde cae este movimiento respecto del conteo?
 *
 * Devuelve el DIAGNÓSTICO, no la decisión: quién lo llama necesita poder mostrar cuánto quedó en el
 * empate, y un booleano no deja mostrarlo. El 07/08 ese empate fueron $960.000 de pagos en efectivo —
 * un número que hoy nadie ve porque el modelo lo resuelve en silencio.
 *
 * @param {{fecha:number, entra?:boolean}} mov `fecha` es el serial de la fecha ECONÓMICA del
 *   movimiento (cuándo se movió el billete), no cuándo se cargó la fila. `entra` = suma al cajón.
 * @param {{dia:number, instante?:number}} ancla el conteo: su día y, si existe, el instante sellado
 * @returns {'sin-fecha'|'sin-ancla'|'dentro'|'posterior'|'mismo-dia'}
 */
export function clasificar(mov = {}, ancla = {}) {
  const f = Number(mov.fecha)
  const d = diaDe(Number(ancla.dia))
  if (!Number.isFinite(d)) return 'sin-ancla'
  // SIN FECHA NO HAY VENTANA. Es la misma guarda `ISNUMBER` que ya llevan las fórmulas: una fecha
  // vacía compara como cero y metería el histórico entero adentro de la ventana.
  if (!Number.isFinite(f)) return 'sin-fecha'
  if (diaDe(f) > d) return 'posterior'
  if (diaDe(f) < d) return 'dentro'
  return 'mismo-dia'
}

/**
 * NÚCLEO PURO: ¿este movimiento descarga o carga el cajón desde el conteo? — LA DECISIÓN.
 *
 * El desempate por hora está escrito y hoy nunca corre: sólo se activa cuando el movimiento Y el ancla
 * traen instante. No es código muerto por adelantado — es el único tramo que hay que dejar listo para
 * que el pedido del dueño se cumpla entero el día que la hora exista, y su ausencia se mide sola
 * (`HAY_HORA_EN_LOS_MOVIMIENTOS`) en vez de descubrirse cuando el número esté mal.
 *
 * @param {{fecha:number, entra?:boolean, instante?:number}} mov
 * @param {{dia:number, instante?:number}} ancla
 * @returns {{entra:boolean, motivo:string, ambiguo:boolean}}
 */
export function entraALaVentana(mov = {}, ancla = {}) {
  const donde = clasificar(mov, ancla)
  if (donde === 'posterior') return { entra: true, motivo: 'posterior al conteo', ambiguo: false }
  if (donde === 'dentro') return { entra: false, motivo: 'anterior al conteo: ya estaba adentro', ambiguo: false }
  if (donde !== 'mismo-dia') return { entra: false, motivo: donde === 'sin-fecha' ? 'sin fecha no hay ventana' : 'sin conteo cargado', ambiguo: false }
  // EL MISMO DÍA, CON HORA DE LOS DOS LADOS: se ordena de verdad y deja de ser un empate.
  if (tieneHora(mov.instante ?? mov.fecha) && tieneHora(ancla.instante)) {
    const t = tieneHora(mov.instante) ? mov.instante : mov.fecha
    return { entra: t > ancla.instante, motivo: 'ordenado por hora contra el instante del conteo', ambiguo: false }
  }
  // EL EMPATE. El criterio declarado, y marcado como ambiguo para que se pueda MOSTRAR cuánto es.
  return { entra: !mov.entra, motivo: CRITERIO_MISMO_DIA, ambiguo: true }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL LADO DE LAS FÓRMULAS
//
// La comparación va contra `INT(ancla)` y no contra `ancla` pelado por una razón que hoy no se ve:
// la celda del conteo guarda un día, pero el día que guarde un instante —que es a dónde va esto— un
// `>` crudo empezaría a comparar contra "07/08 a las 14:30" y todos los movimientos del 07/08, que
// valen 46241,0 exacto, caerían del lado equivocado sin un solo error a la vista. `INT` fija la
// unidad de la comparación en el DÍA, que es la única que el dato del otro lado tiene.

/** El comparador de la ventana según el criterio declarado. Entradas exclusivas, salidas inclusivas. */
export const comparadorDeVentana = (entra) => (entra ? '>' : '>=')

/**
 * El FACTOR de fórmula que decide si un movimiento está en la ventana. Va parentizado y listo para
 * multiplicar dentro de un SUMPRODUCT.
 *
 * POR QUÉ LA RAMA INCLUSIVA ARRASTRA `*(fecha>0)`. Las fechas de este archivo se coaccionan con
 * `IFERROR(DATEVALUE(...);N(...))`, y N() de una celda vacía devuelve CERO. Con `>=` y un ancla en 0
 * —que es como el anexo pide el histórico completo— un cero es mayor o igual que un cero: cada fila
 * SIN fecha entraría a la ventana. La versión exclusiva no tenía el problema porque 0>0 es falso, así
 * que el guard nace junto con el `>=` y no después de que alguien lo descubra en la caja.
 *
 * @param {string} fecha expresión ya armada de la fecha del movimiento (puede ser un rango coaccionado)
 * @param {string} ancla referencia A1 a la celda del conteo (ej. '$D$7') o un literal
 * @param {boolean} entra si el movimiento CARGA el cajón (cobro, extracción)
 */
export const ventanaDelConteo = (fecha, ancla, entra = false) =>
  (entra
    ? `(${fecha}>INT(${ancla}))`
    : `(${fecha}>=INT(${ancla}))*(${fecha}>0)`)

/**
 * El trozo que aísla EL EMPATE: los movimientos que caen exactamente el día del conteo.
 *
 * No es decoración ni un renglón "informativo": es la única forma de que el criterio conservador se
 * pueda auditar. Sin esta línea el dueño ve un número y no puede saber cuánto de él se decidió por
 * una regla en vez de por un dato. El 07/08 habría dicho $960.000, y el día que diga $29.091.548
 * —el bruto del 31/07— quien lo mire sabe que tiene que volver a contar.
 */
export const mismoDiaQueElConteo = (fecha, ancla) => `INT(${fecha})=INT(${ancla})`

/**
 * EL SELLO DEL INSTANTE: el dueño tipea un número, el OS estampa cuándo lo vio.
 *
 * No le pide la hora a nadie —ése era el punto del pedido— y no la deduce del movimiento: registra el
 * único instante que el OS conoce de primera mano, el de su propia lectura. Sirve para dos cosas
 * distintas y conviene no confundirlas:
 *
 *   1. HOY, como TRAZA: cuánto tardó el OS en ver un conteo nuevo. Con el timer cada 2 h, un conteo
 *      tipeado a las 09:10 se sella a las 10:00 y todo lo cargado en el medio quedaba absorbido por
 *      el sello viejo. La traza es lo que permite ver ese hueco en vez de discutirlo.
 *   2. MAÑANA, como DESEMPATE, cuando los movimientos tengan hora — ver `entraALaVentana`.
 *
 * Devuelve un serial de Sheets (días desde 1899-12-30) EN HORA DE ARGENTINA, que es el huso del
 * archivo: un serial calculado en UTC se dibujaría tres horas adelantado y un conteo de las 22:00
 * aparecería como del día siguiente.
 *
 * @param {Date|number} [ahora]
 * @returns {number} serial con parte horaria
 */
export function instanteDelSello(ahora = new Date()) {
  const ms = ahora instanceof Date ? ahora.getTime() : Number(ahora)
  if (!Number.isFinite(ms)) throw new Error('instanteDelSello necesita una fecha válida')
  const AR = -3 * 60 * 60 * 1000 // Argentina no aplica horario de verano desde 2009
  return (ms + AR - Date.UTC(1899, 11, 30)) / 86400000
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// "TENÉS Q PODER SABER EN Q MOMENTO ANOTÉ LO Q PUSE" — LO QUE SE PUEDE AVERIGUAR, Y LO QUE NO
//
// El dueño no va a tipear una hora, y tiene razón: el OS tiene que averiguarla. La vía obvia es el
// historial de Drive, que el cliente ya expone (`listarRevisiones` / `exportarRevision`). LA MEDÍ
// SOBRE EL ARCHIVO REAL el 15/08/2026 y no sirve — y no por cara, sino porque el dato NO ESTÁ:
//
//     listarRevisiones('Flujo de Caja - Cash Flow')  →  2 revisiones. Dos.
//       id 32559 · 2026-08-15T10:09:02Z · echegaray-os-workspace@…iam.gserviceaccount.com
//       id 32773 · 2026-08-15T13:47:08Z · echegaray-os-workspace@…iam.gserviceaccount.com
//
// Tres cosas, y cada una sola ya alcanza para descartar la vía exacta:
//
//   1. LA MÁS VIEJA ES DE HOY. El conteo vigente se tipeó el 07/08. El historial no llega ni cerca:
//      Drive PODA las revisiones de los archivos nativos de Google. El "historial de versiones" que
//      se ve en la interfaz NO es este API — es un registro interno que la API v3 no publica.
//   2. LAS DOS SON DE LA CUENTA DE SERVICIO, o sea del propio OS. Ninguna edición del dueño quedó
//      como revisión propia, así que `lastModifyingUser` nunca lo va a nombrar.
//   3. LOS IDs SALTAN DE 32559 A 32773 en tres horas y media: 214 revisiones internas que existieron
//      y que la API no devuelve. No es un problema de paginado ni de permisos; están podadas.
//
// (Costo, por si alguna vez cambia: `listarRevisiones` 2,5 s; `exportarRevision` 7,1 s y 1,22 MB por
// revisión. Con historial completo, una búsqueda hacia atrás sería cara pero viable. Hoy es imposible,
// que es distinto de cara.)
//
// LO QUE SÍ SE PUEDE AFIRMAR, Y ES UN HECHO, NO UNA ESTIMACIÓN: el conteo se anotó ENTRE la última vez
// que el OS miró y lo vio viejo, y esta vez que lo mira y lo ve nuevo. Eso no es un instante: es un
// INTERVALO, y decirlo como intervalo es la diferencia entre informar y fabricar precisión. El ancho
// del intervalo es el período con que corre el anexo, y se mide solo (no se supone) porque el extremo
// de la izquierda sale de la marca que dejó la corrida anterior.

/**
 * NÚCLEO PURO: el momento del conteo, como el INTERVALO que de verdad se conoce.
 *
 * `hasta` es el instante en que esta corrida vio el valor nuevo; `desde`, aquél en que la corrida
 * anterior todavía lo vio viejo. Sin marca previa el intervalo queda abierto por izquierda y se dice
 * así — un intervalo abierto informa; uno cerrado a ojo miente.
 *
 * PARA QUÉ SIRVE HOY, sin exagerar: para contestar la pregunta del dueño con un dato verificable y
 * para acotar la ventana ciega. NO cambia ningún número mientras los movimientos no tengan hora
 * (`HAY_HORA_EN_LOS_MOVIMIENTOS` = false): no hay nada contra qué ordenarlo. El día que la tengan,
 * `entraALaVentana` usa `desde` —el extremo temprano, el conservador— y el desempate empieza a correr
 * sin tocar una línea más.
 *
 * @param {{visto:number, vistoPrevio?:number}} m seriales de Sheets con parte horaria
 * @returns {{desde:number|null, hasta:number, horas:number|null, acotado:boolean, texto:string}}
 */
export function ventanaDelSello({ visto, vistoPrevio } = {}) {
  if (!Number.isFinite(visto)) throw new Error('ventanaDelSello necesita el instante en que se vio el conteo')
  const acotado = Number.isFinite(vistoPrevio) && vistoPrevio < visto
  const horas = acotado ? (visto - vistoPrevio) * 24 : null
  const reloj = (s) => {
    const ms = Math.round((s - Math.trunc(s)) * 86400) * 1000
    const hh = String(Math.floor(ms / 3600000)).padStart(2, '0')
    const mm = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0')
    return `${hh}:${mm}`
  }
  const texto = acotado
    ? `lo anotaste entre las ${reloj(vistoPrevio)} y las ${reloj(visto)} — ventana de ${horas < 1 ? `${Math.round(horas * 60)} min` : `${horas.toFixed(1)} h`}`
    : `lo vi por primera vez a las ${reloj(visto)}; no sé desde cuándo estaba (no hay marca de la corrida anterior)`
  return { desde: acotado ? vistoPrevio : null, hasta: visto, horas, acotado, texto }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// QUÉ FALTA PARA QUE EL PEDIDO SE CUMPLA ENTERO — el gap declarado, no escondido
//
// El dueño pidió que el conteo se selle con su momento Y que desde ese momento los descargos salgan
// solos. La segunda mitad ya funciona por día. La primera sólo se vuelve útil el día que un movimiento
// de efectivo traiga la hora en que ocurrió, y eso es un dato que hoy NADIE escribe.
//
// EL ANTECEDENTE QUE SÍ LO TIENE: los pedidos de materiales guardan hora y por eso su cronología se
// usa como evidencia para ordenar eventos de caja. Es la prueba de que el dato es alcanzable, no una
// aspiración.
//
// LAS TRES PUERTAS, y qué haría falta en cada una:
//
//   · Compras — la carga la hace el OS (`cargar-comprobantes-compras.mjs`). Puede estampar el
//     instante de la carga sin pedirle nada a nadie. NO es la hora del pago, y confundirlas sería el
//     error de siempre: la hora de carga sólo ordena contra el sello, no contra el billete.
//   · Cobranzas — las tipea una persona. Sin un disparador `onEdit` en el propio archivo (Apps
//     Script, que no se puede instalar desde acá) no hay instante posible.
//   · _BANCO_RAW — el extracto del Santander publica el día, no la hora. El dato no existe en origen.
//
// CONCLUSIÓN HONESTA: la hora del PAGO en efectivo no va a existir salvo que alguien la tipee, y no
// hay que pedírsela a nadie por $960.000 de empate al día. Lo que sí conviene es la hora de CARGA en
// las puertas que el OS ya escribe, porque es gratis y porque hace auditable el hueco entre que el
// dueño cuenta y el OS mira.
