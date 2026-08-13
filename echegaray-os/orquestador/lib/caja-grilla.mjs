// LA PORTADA EJECUTIVA DE CAJA — LA POSICIÓN DE TESORERÍA EN UNA PANTALLA, SIN SCROLLEAR.
//
// ═══ POR QUÉ SE REHIZO OTRA VEZ (05/08/2026) ═══
//
// El rediseño anterior bajó la pestaña de 143 filas a 45 mudando el anexo del analista a
// `_CAJA_ANEXO`. Resolvió el tamaño y no resolvió lo otro. El dueño, textual: *"no quiero que
// parezca una planilla. Quiero que parezca un producto de Treasury de nivel JPMorgan / Stripe
// Treasury / Mercury / Brex / Kyriba. Debe ocupar prácticamente una pantalla completa sin
// desplazarse. Portada ejecutiva. Dirección debe entender la situación en menos de cinco segundos"*.
//
// CUARENTA Y CINCO FILAS DE TABLA SIGUEN SIENDO UNA TABLA. Lo que separa un tablero de tesorería de
// una planilla no es el tamaño: es que arriba haya POCOS NÚMEROS GRANDES y no cinco cuadros. Acá
// quedan veinte filas: el titular, las cuatro tarjetas, dos paneles lado a lado —las cuentas y la escalera de
// vencimientos— y dos listas cortas, alertas y acciones. Nada más. Todo lo que era conciliación,
// arqueo detallado, auditoría o control vive en `_CAJA_ANEXO` y se asoma acá como una línea de alerta.
//
// ═══ EL CAMBIO ESTRUCTURAL: DOS PANELES EN LA MISMA FILA ═══
//
// El diseño anterior apilaba bloque sobre bloque, y por eso una pestaña honesta necesitaba 45 filas.
// Un producto no apila: distribuye. Las columnas A–D son el panel de CUENTAS y las F–I el panel de
// VENCIMIENTOS, sobre las MISMAS filas. Eso corta a la mitad el alto sin sacar un solo dato.
//
// ═══ EL 06/08: DISPONIBLE = OPERATIVO, INVERTIDO APARTE (orden del dueño, estilo JPM) ═══
//
// Las filas de Balanz llevan ‖ y el total ya no las suma; la tarjeta INVERTIDO (segunda) las cita.
// Todo lo que cuelga de CAJA_TOTAL_DISPONIBLE —la escalera, el peor caso, los dos cash flow, el
// control A5 del anexo— pasa a medir LIQUIDEZ OPERATIVA, que es el número correcto para decidir pagos.
//
//   A · el concepto            F · el tramo
//   B · importe en su moneda   G · hasta cuándo (fecha)
//   C · SALDO EN PESOS         H · el neto del tramo
//   D · la fecha del dato      I · CON CUÁNTO QUEDO DESPUÉS
//                              J · el margen: del generador, y va vacío
//
// La gramática de columnas del rediseño anterior —"una columna, un significado, de arriba abajo"— se
// conserva DENTRO de cada panel, que es donde el ojo escanea. La C se lee sola de arriba abajo (los
// saldos) y la I también (la posición tramo a tramo). La E queda vacía a propósito: es el aire entre
// los dos paneles, y es lo que hace que se lean como dos cosas y no como una tabla de nueve columnas.
//
// ═══ LO QUE NO CAMBIÓ, Y NO PUEDE CAMBIAR ═══
//
// · Los rangos con nombre que publica la pestaña (`CAJA_TOTAL_DISPONIBLE`, `CAJA_FECHA_SALDO`, los
//   cuatro del arqueo, el saldo y el corte del banco, la cartera). Los consumen los dos cash flow,
//   el anexo y tres tableros: un nombre que se mueve rompe cosas que no se ven desde acá.
// · Los DOS rótulos de captura del arqueo, letra por letra. Son el ancla con la que el rescate
//   encuentra lo que el dueño tipeó; renombrarlos es perderle el conteo en la primera corrida.
// · El rótulo "Total disponibilidades", que `cash-briefing` y `ubicarCaja` buscan por texto.
// · La fusión Regla 0 / `escribirPreservando` / centinela VACIO: acá se decide QUÉ dice cada celda,
//   nunca cómo se escribe.

import * as BANCO from './banco-santander.mjs'
import { ANEXO, DESDE_CAJA } from './caja-anexo-nombres.mjs'
import { CUENTAS, RANGO_TC } from './caja-disponibilidades.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import { rotuloAlDia } from './fecha-de-frescura.mjs'
import {
  formulaFrescuraCaja, formulaNetaPosterior, formulaUltimoSaldo, formulaFechaCorte,
  formulaCobrosUsdEfectivoPosteriores,
} from './caja-posterior-al-corte.mjs'
import { formulaCartera } from './cartera-cheques.mjs'
import { inciertoHasta } from './caja-anexo-controles.mjs'
import { terminoLibro } from './libro-sumas.mjs'
import { tarjetas, NO_REAL } from './caja-tarjetas.mjs'
import { alertas, acciones } from './caja-avisos.mjs'
// LA ESCALERA DE VENCIMIENTOS VIVE EN SU PROPIO ARCHIVO: la consumen el panel de acá y el conciliador
// que compara tramo por tramo contra la planilla.
import { BORDES, DESDE_SIEMPRE, desdeTramo, hastaTramo } from './caja-calendario.mjs'

// `conciliar-caja-vs-cashflow.mjs` compara tramo por tramo contra lo que muestra la planilla y toma
// los rótulos de acá. Un conciliador con su propia copia deja de comparar el día que uno de los dos
// renombra un tramo, y reporta un desvío que no existe — o calla uno que sí.
export { BORDES }

/**
 * ¿ESTA CELDA ES EL TÍTULO DE UN BLOQUE?
 *
 * Dos formas legítimas: texto plano ("3 · ALERTAS CRÍTICAS") o una FÓRMULA que compone el número del
 * bloque con la frescura de su fuente (`="1 · DISTRIBUCIÓN POR CUENTAS · Extracto al …"`). La segunda
 * no es un capricho: la fecha de cada fuente tiene que salir del DATO y no del reloj de la corrida,
 * así que el título es calculado. Reconocer sólo la primera dejaba dos bloques afuera del formato.
 */
export const esTituloDeBloque = (t) => {
  const s = String(t ?? '').trim()
  return /^\d+ · /.test(s) || /^=.*?"\d+ · /.test(s)
}

/**
 * EL OBJETIVO, ESCRITO DONDE SE PUEDE VERIFICAR. Veinte filas de contenido más dos de margen: si un
 * bloque nuevo la pasa, el test se pone rojo y hay que decidir QUÉ SALE al anexo. Así fue como esta
 * pestaña llegó a 143 filas: nadie tenía que decidir nada para agregar.
 */
export const FILAS_MAXIMAS = 22

/** El ancho de la grilla. Diez columnas: cuatro del panel izquierdo, el aire, cuatro del derecho, el margen. */
export const ANCHO = 10

/**
 * LA COLUMNA J ES DEL GENERADOR Y VA VACÍA, SIEMPRE.
 *
 * El dueño, textual sobre la vieja columna de anotaciones: *"esas aclaraciones de mierda yo siempre
 * las saco"*. Sigue emitiéndose con el centinela —en vez de dejar de emitirse— para que la fusión
 * limpie lo que dejaron las corridas viejas: una celda AUSENTE se preserva, una con centinela se
 * limpia. Es la diferencia entre "no es mía" y "es mía y va vacía".
 */
export const COL_PROSA = 9

/**
 * Los anchos, en píxeles. Suman 1.120: entran en una pantalla sin scroll horizontal.
 *
 * LA A ES LA MÁS ANCHA porque lleva los rótulos largos ("Valores a depositar ‖ no suma al total", 38
 * caracteres). La E vale 18: es aire, no una columna. La J vale 32 y no 0 porque una columna de ancho
 * cero se comporta como oculta, y en esta pestaña ninguna fila y ninguna columna se ocultan.
 *
 * LAS TARJETAS SE MONTAN SOBRE ESTOS MISMOS ANCHOS, de a pares (A:B, C:D, E:F, G:H; la I:J quedó sin
 * tarjeta cuando el dueño borró la quinta). La primera queda más ancha que las otras y es a
 * propósito: "caja disponible" es la cifra que se mira primero y en cualquier tablero de tesorería
 * es la que ocupa más lugar.
 */
export const ANCHOS = [224, 118, 130, 86, 18, 180, 82, 120, 130, 32]

/** Las columnas donde vive PLATA. Un test recorre la grilla y exige que cada una sea una fórmula. */
export const COLS_PLATA = Object.freeze([1, 2, 7, 8])
/** Las columnas donde vive una FECHA. Formato de fecha en toda la pestaña, sin excepciones por bloque. */
export const COLS_FECHA = Object.freeze([3, 6])
/**
 * Las cuatro columnas donde ancla cada tarjeta. Se merge con la de al lado.
 *
 * ERAN CINCO (06/08): el dueño borró RIESGO (G2:G4) y CUELLO (I2:I4) de la pestaña, y pidió el orden
 * del tesorero de JPM — disponible operativo, invertido, comprometida, proyectada. La quinta columna
 * de tarjetas (I) queda vacía: el borrado del CUELLO se respeta y ninguna tarjeta se corre ahí.
 */
// CINCO SLOTS de nuevo (06/08, orden del dueño): disponible · comprometida · LIBRE · invertido ·
// proyectada — "invertido y proyectada al final", y la LIBRE contesta cuánto se puede usar entero.
export const COLS_TARJETA = Object.freeze([0, 2, 4, 6, 8])

/** Cuánto vale hoy una cuenta según el banco, cuando la réplica del extracto no está. */
const saldoDeBanco = (c) => (c.banco === 'cartera' ? BANCO.totalEcheqs(BANCO.enCartera())
  : c.banco === 'balanzArs' ? BANCO.BALANZ.ars
    : c.banco === 'balanzUsd' ? BANCO.BALANZ.usd
      : BANCO.CUENTA[c.banco])

/** CADA FUENTE FECHA CON SU PROPIO CORTE. El corte global es el del extracto de julio: fechar con él
 *  la cuenta USD (movida el 05/08) o Balanz (aportada el 05/08) afirma una frescura que no es la del
 *  dato — el defecto exacto que el dueño señaló tres veces ("aún noto desactualizadas las fechas"). */
const corteDeBanco = (c) => (c.banco === 'saldoDolares' ? (BANCO.CUENTA.corteDolares ?? BANCO.CORTE)
  : c.banco === 'balanzArs' || c.banco === 'balanzUsd' ? BANCO.BALANZ.corte
    : BANCO.CORTE)

/**
 * LA GRILLA DE CAJA. Pura: sin red, sin base, sin escribir una celda.
 *
 * @param {Map} cargado lo que una persona ya tenía escrito, por rótulo de cuenta
 * @param {object} refs pestañas y filas del archivo, resueltas por rótulo (lib/caja-refs.mjs)
 */
export function grilla(cargado, refs) {
  // FALLA CERRADO SI FALTA EL CALENDARIO FISCAL. La escalera ya no lee esa pestaña —lee el libro—
  // pero el libro sólo conoce el IVA/IIBB si la pestaña existe para que su extractor la lea, y ése es
  // el egreso más grande del cuatrimestre. Sin ella, la escalera no daría error: daría un piso más
  // alto que el real, que es el modo de falla que ya costó $41,7M. Cuesta una línea comprobarlo.
  if (!refs?.filasCal) {
    throw new Error('caja-grilla: faltan las filas de "Impuestos y Financieros" (IVA/IIBB): sin esa pestaña el libro no ve el egreso más grande del cuatrimestre y el piso sube sin que se haya pagado nada')
  }
  const previo = (cuenta, campo) => cargado?.get(cuenta)?.[campo] ?? ''
  /** Una celda que NO es mía: sale `undefined` y la fusión la PRESERVA. Con el centinela VACIO la
   *  primera corrida le borraba el conteo al dueño — la diferencia no es cosmética. */
  const AJENA = Symbol('celda del dueño: no la escribo ni la borro')
  const suyoOAusente = (rot, campo) => {
    const v = previo(rot, campo)
    return v === '' || v === null || v === undefined ? AJENA : v
  }

  // ── EL PANEL IZQUIERDO: LAS CUENTAS ─────────────────────────────────────────────────────────────
  //
  // Cuatro columnas y ni una más. La de "tipo de cambio" del diseño anterior se fue: era una columna
  // entera para publicar el mismo número cinco veces, y la valuación de una cuenta en dólares se
  // entiende igual escrita en su propia celda (`importe × TIPO_CAMBIO_USD`). El tipo de cambio se
  // sigue viendo, en su bloque de `_CAJA_ANEXO`, que es su dueño.
  const izq = []
  const usd = []
  let fBancoPesos = 0
  let fCartera = 0
  let fBalanzArs = 0
  let fBalanzUsd = 0
  let fArqArs = 0
  let fArqUsd = 0
  // LAS FILAS ‖ QUE EL TOTAL RESTA. Antes era sólo la cartera y estaba escrita a mano en la fórmula
  // del total; hoy son tres (cartera + las dos de Balanz) y salen de la declaración `noSuma` de cada
  // cuenta: agregar una cuarta fila que no suma es declararla, no acordarse de tocar el total.
  const noSuman = []
  const FILA_0 = 7 // la primera fila de datos: título + 3 de tarjetas + títulos de bloque + encabezado
  for (const c of CUENTAS) {
    const f = FILA_0 + izq.length
    if (c.banco === 'saldoPesos') fBancoPesos = f
    if (c.banco === 'cartera') fCartera = f
    if (c.banco === 'balanzArs') fBalanzArs = f
    if (c.banco === 'balanzUsd') fBalanzUsd = f
    if (c.noSuma) noSuman.push(f)
    if (c.moneda === 'USD') usd.push(f)
    // EL IMPORTE EN SU MONEDA ES EL HECHO; el saldo en pesos es el CÁLCULO. Un saldo en dólares
    // metido a la fuerza en una columna de pesos es un dato falso, y en Argentina se vuelve falso más
    // rápido que en ningún lado: por eso las dos celdas conviven en vez de guardar sólo el convertido.
    // EL CONTEO SE TIPEA EN LA MISMA FILA QUE LO MUESTRA (07/08, orden del dueño: "refleja lo que
    // dice el arqueo y que de ahí surjan las restas, sacá una de las dos celdas"). B es el conteo a
    // mano (amarilla), C el vivo (conteo + movimientos), D la fecha del conteo (amarilla). La fila
    // aparte del arqueo se fue: dos filas con casi el mismo número eran la confusión.
    // Un conteo que llega como FÓRMULA no es un conteo: es el residuo de la fila calculada del
    // diseño anterior, y re-emitirlo en B armaría una referencia circular (B sumándose a sí misma
    // vía el neto). Se descarta y la celda queda del dueño.
    const conteo = (campo) => {
      const v = suyoOAusente(c.nombre, campo)
      return typeof v === 'string' && v.trim().startsWith('=') ? AJENA : v
    }
    if (c.arqueo === DESDE_CAJA.arqueoArsFecha) fArqArs = f
    if (c.arqueo === DESDE_CAJA.arqueoUsdFecha) fArqUsd = f
    const origen = c.banco === 'saldoPesos' && refs.bancoRaw ? formulaUltimoSaldo(refs.bancoRaw)
      : c.banco === 'cartera' ? formulaCartera()
        : c.banco ? saldoDeBanco(c)
          : c.arqueo ? conteo('saldo')
            : (c.formula ?? previo(c.nombre, 'saldo'))
    // El efectivo VIVO: el conteo tipeado en B más lo que se movió desde entonces. El neto lo
    // calcula el anexo y se cita POR NOMBRE — es el único sumando de esta pestaña que vive afuera.
    // En dólares se suman los cobros USD en efectivo y recién ahí se valúa: sin eso, U$S 15.000
    // cobrados en efectivo entraban al cajón de PESOS como $15.000 — el importe correcto en la
    // moneda equivocada, que no da error y está mal por tres órdenes de magnitud.
    const pesos = c.arqueo === DESDE_CAJA.arqueoArsFecha
      ? `=N(B${f})+N(${ANEXO.efectivoNeto})`
      : c.arqueo === DESDE_CAJA.arqueoUsdFecha
        ? `=(N(B${f})+IF(NOT(ISNUMBER(${DESDE_CAJA.arqueoUsdFecha}));0;${formulaCobrosUsdEfectivoPosteriores(DESDE_CAJA.arqueoUsdFecha)}))*${RANGO_TC}`
        : c.moneda === 'USD' ? `=IF(ISNUMBER(B${f});B${f}*${RANGO_TC};"")` : `=IF(ISNUMBER(B${f});B${f};"")`
    izq.push([
      c.nombre,
      origen,
      pesos,
      // CADA CUENTA SE FECHA CON SU PROPIA FUENTE. El dueño, tres veces: *"aún noto desactualizadas
      // las fechas"*. El defecto no era que estuvieran viejas: tres cuentas se fechaban con la fuente
      // de OTRA. Un conteo de caja fechado con TODAY() afirma que se contó hoy, sea cierto o no.
      c.banco === 'saldoPesos' && refs.bancoRaw ? formulaFechaCorte(refs.bancoRaw)
        : c.banco === 'cartera' ? '=TODAY()'
          : c.banco ? corteDeBanco(c)
            : c.arqueo ? conteo('fecha')
              : (c.formula ? '=TODAY()' : previo(c.nombre, 'fecha')),
    ])
  }
  // LA LÍNEA QUE HACE QUE LA CAJA SE MUEVA. El dueño: *"no se ajustan los saldos en caja a medida que
  // toco cobranzas"*. Era estructural: el saldo del banco es una foto a SU fecha de corte y todo lo
  // posterior no existía en la pestaña. Es NETA a propósito: con un solo lado la caja crecería y
  // nunca bajaría. Sus cuatro sumandos son el desglose y viven en `_CAJA_ANEXO`.
  const fPost = fBancoPesos && refs.bancoRaw ? FILA_0 + izq.length : 0
  if (fPost) izq.push(['Movimientos posteriores al corte', formulaNetaPosterior(`$D$${fBancoPesos}`), `=B${fPost}`, '=TODAY()'])
  const d0 = FILA_0
  const d1 = FILA_0 + izq.length - 1

  // ── EL PANEL DERECHO: LA ESCALERA DE VENCIMIENTOS ───────────────────────────────────────────────
  //
  // Es una maturity ladder, que es como un banco mira su liquidez: cada tramo dice cuánto se mueve y
  // —lo que la hace útil— con cuánta plata queda la empresa DESPUÉS. La pregunta no es "cuánto debo"
  // sino "en qué semana me quedo corto", y eso sólo se ve acumulando.
  //
  // ═══ EL NETO SALE DEL LIBRO, NO DE SEIS FUENTES ═══
  //
  // Hasta ayer cada tramo sumaba por su cuenta cheques, jornales, oficina, impuestos y cobranzas: seis
  // expresiones de cuatrocientos caracteres por celda, y una definición de "lo que sale esta semana"
  // que ya había discrepado en $41.704.351 contra el Cash Flow. Ahora es UN `terminoLibro` sobre
  // `_MOVIMIENTOS`, que es la misma fuente de la que cuelgan las tres vistas. Si mañana aparece un
  // concepto nuevo, entra por el libro y aparece acá sin tocar este archivo.
  //
  // `REAL` queda afuera: ya está adentro del saldo del banco y de la línea de movimientos posteriores.
  //
  // ═══ EL PRIMER TRAMO ABRE EN EL SERIAL 0, NO EN EL CORTE DEL EXTRACTO ═══
  //
  // Un cheque librado hace un mes y todavía sin presentar es plata que VA A SALIR, y su fecha quedó
  // atrás. Si "Vencido" arrancara en el corte, ese cheque no caería en ningún tramo y desaparecería
  // de la escalera entera: el piso subiría sin que se haya pagado nada. El diseño anterior necesitaba
  // para esto la columna DEBITADO de cada pestaña de instrumentos; con el libro alcanza el ESTADO,
  // porque lo que ya salió de la cuenta está marcado REAL y REAL está excluido. La otra mitad del
  // invariante —no restar dos veces lo que el banco ya debitó— la garantiza esa misma exclusión.
  const der = []
  let fFinMes = 0
  BORDES.forEach(([rotulo], k) => {
    const f = FILA_0 + k
    if (rotulo === 'Resto de este mes') fFinMes = f
    der.push([
      rotulo,
      // LA COLUMNA "Hasta" MUESTRA EL ÚLTIMO DÍA INCLUIDO (borde − 1), no el borde: el borde es
      // excluido y mostrarlo hacía leer "Hasta 13/08" para un tramo que termina el 12. En
      // castellano, "hasta" incluye.
      BORDES[k][1] ? `=(${BORDES[k][1]})-1` : '',
      `=${terminoLibro({ desde: k === 0 ? DESDE_SIEMPRE : desdeTramo(k), hasta: hastaTramo(k), estados: NO_REAL })}`,
      // La posición acumulada arranca en la disponibilidad: un neto de tramo sin la plata que hay
      // detrás no contesta nada.
      k === 0 ? `=${DESDE_CAJA.total}+$H${f}` : `=$I${f - 1}+$H${f}`,
    ])
  })
  const lad0 = FILA_0
  const lad1 = FILA_0 + der.length - 1

  // ── LAS DOS FILAS DE CIERRE DE LOS PANELES ──────────────────────────────────────────────────────
  const fCierre = FILA_0 + Math.max(izq.length, der.length)
  // PERCIBIDO Y OPERATIVO: el total excluye TODAS las filas ‖ — los Valores a depositar (echeq en
  // custodia, sin acreditar: no son caja hasta que se acreditan) y desde el 06/08 las dos de Balanz
  // (orden del dueño: la caja disponible es SÓLO banco y efectivo; lo invertido se discrimina, como
  // en el panel operating-vs-invested de JPM Access). Queda = banco ARS + banco USD + efectivo ARS +
  // efectivo USD + movimientos posteriores al corte. Es el número con el que se decide un pago — más
  // conservador, y es el correcto: una comitente no cubre un cheque mañana. Es también el "Efectivo
  // al inicio" de los dos cash flow, y su fecha vive en la MISMA fila que el monto: separarlos ya
  // dejó las dos líneas más importantes de los dos cuadros vacías durante doce meses.
  //
  // EL RÓTULO ARRANCA EN "Total disponibilidades" Y NO EN "⇒": `cash-briefing` y `ubicarCaja` lo
  // buscan por texto desde el principio de la celda. El "⇒" del diseño anterior los dejó a los dos
  // sin encontrarlo, y los dos cayeron a su respaldo en silencio.
  const totalIzq = ['Total disponibilidades ‖ percibido',
    '', `=SUM(C${d0}:C${d1})${noSuman.map((f) => `-C${f}`).join('')}`, `=IFERROR(MAX($D$${d0}:$D$${d1});"")`]
  // EL PISO NO SE PUBLICA SOLO. Se calcula con lo que se PUEDE AFIRMAR, y hay dos grupos de cheques
  // cuya cobertura no se sabe: con el piso a secas esa ignorancia se lee como certeza, y con este
  // número se decide cuánta plata se inmoviliza. La punta de abajo es EXACTA —se recalcula el mínimo
  // restando en cada tramo lo incierto ACUMULADO hasta ese borde—, no el piso menos un total: eso
  // habría estado mal en cuanto el punto más bajo no fuera el último tramo.
  const peorCaso = `=MIN(${BORDES.map((_, k) => `$I${lad0 + k}-(${inciertoHasta(hastaTramo(k), DESDE_SIEMPRE)})`).join(';')})`
  const totalDer = [
    `=IF($H${fCierre}>=$I${fCierre};"⇒ Piso del recorrido";"⇒ Peor caso · piso")`,
    `=IFERROR(INDEX($G$${lad0}:$G$${lad1};MATCH(MIN($I$${lad0}:$I$${lad1});$I$${lad0}:$I$${lad1};0));"")`,
    peorCaso,
    `=MIN($I$${lad0}:$I$${lad1})`,
  ]

  // ── LAS TARJETAS, QUE SE RESUELVEN CUANDO YA SE SABE EN QUÉ FILA QUEDÓ CADA TOTAL ───────────────
  //
  // INVERTIDO cita las celdas C de las filas Balanz del panel — la MISMA fuente que se ve tres filas
  // abajo, no una segunda copia de la posición. El día que llegue el extracto de Balanz y la grilla
  // cambie el saldo, la tarjeta cambia con ella.
  const T = tarjetas({
    total: `$C$${fCierre}`,
    fecha: `$D$${fCierre}`,
    // Si la fila desaparece de CUENTAS, la referencia sale vacía y `tarjetas` FALLA CERRADO: mejor
    // romper acá que publicar una tarjeta que apunta a `$C$0`.
    invArs: fBalanzArs ? `$C$${fBalanzArs}` : '',
    invUsd: fBalanzUsd ? `$C$${fBalanzUsd}` : '',
    invFecha: fBalanzArs ? `$D$${fBalanzArs}` : '',
    // LIBRE = el mínimo del recorrido: el piso simple de la fila de cierre y la fecha del punto
    // más bajo. El "peor caso" ($H) se queda en la escalera; la tarjeta publica lo medido.
    pisoSimple: `$I$${fCierre}`,
    pisoFecha: `$G$${fCierre}`,
    // La última fila de Compras que el libro incorporó: detrás de ella, COMPROMETIDA suma en vivo
    // las pendientes nuevas (la puntada que faltaba para que pagar no toque LIBRE). Sin el dato, la
    // tarjeta omite el término y queda como era.
    fronteraCompras: refs?.fronteraCompras,
  })
  const porTarjeta = (campo) => {
    const fila = Array.from({ length: ANCHO }, () => '')
    COLS_TARJETA.forEach((col, i) => { fila[col] = T[i][campo] })
    return fila
  }

  // ── EL ARMADO ───────────────────────────────────────────────────────────────────────────────────
  const filas = []
  const push = (celdas = []) => {
    const r = [...celdas].map((x) => (x === AJENA ? undefined : (x === '' || x === undefined || x === null ? VACIO : x)))
    while (r.length < ANCHO) r.push(VACIO)
    r.length = ANCHO
    // EL PORTÓN DE LA COLUMNA DE PROSA, en el único lugar por el que pasan TODAS las filas. Puesto en
    // cada llamada sería un acuerdo que la próxima llamada olvida — y ya se olvidó una vez, por un merge.
    r[COL_PROSA] = VACIO
    filas.push(r)
    return filas.length
  }
  /** Una fila que combina el panel izquierdo (4 celdas) con el derecho (4 celdas) y el aire del medio. */
  const banda = (i = [], d = []) => push([...[0, 1, 2, 3].map((k) => i[k] ?? ''), '', ...[0, 1, 2, 3].map((k) => d[k] ?? '')])

  // 1 · EL TITULAR. La fecha sale del DATO y no del reloj: es la más nueva de las tres puertas que
  // mueven esta caja (extracto, compras pagadas, cobranzas), calculada por Sheets. Con el pipeline
  // detenido, una fecha de corrida es una mentira que se lee como un hecho.
  const fTitulo = push(['POSICIÓN DE CAJA', '', '', '', '',
    rotuloAlDia('Dato', formulaFrescuraCaja({ bancoRaw: refs.bancoRaw }))])
  const fRotulos = push(porTarjeta('rotulo'))
  const fCifras = push(porTarjeta('valor'))
  const fContexto = push(porTarjeta('contexto'))

  const frescuraExtracto = refs.bancoRaw
    ? rotuloAlDia('Extracto', formulaFechaCorte(refs.bancoRaw).slice(1)).slice(1)
    : '"sin réplica del extracto"'
  const fBloques12 = banda(
    [`="1 · DISTRIBUCIÓN POR CUENTAS   "&${frescuraExtracto}`],
    [`="2 · PRÓXIMOS VENCIMIENTOS   "&IF(ISNUMBER(${DESDE_CAJA.fecha});"desde el corte del "&TEXT(${DESDE_CAJA.fecha};"dd/mm");"⚠ sin fecha de corte")`])
  const fCab = banda(
    ['Cuenta', 'Importe en origen', 'Saldo en pesos', 'Fecha del saldo'],
    ['Tramo', 'Hasta', 'Neto', 'Saldo después'])
  for (let k = 0; k < Math.max(izq.length, der.length); k++) banda(izq[k], der[k])
  banda(totalIzq, totalDer)

  // EL ARQUEO YA NO TIENE FILA PROPIA (07/08): el conteo se tipea en B/D de las filas "Efectivo en
  // …" del bloque de cuentas, que son las únicas amarillas. El conteo cargado bajo los rótulos
  // viejos ("Caja en pesos — contado", "Arqueo en pesos — conteo a mano") llega igual: el rescate lo
  // traduce con ALIAS antes de que la grilla lo busque por el nombre de la cuenta.
  const fBloques34 = banda(['3 · ALERTAS CRÍTICAS'], ['4 · ACCIONES RECOMENDADAS'])
  const A = alertas({ piso: `$I$${fCierre}`, fechaPiso: `$G$${fCierre}` })
  const AC = acciones({ piso: `$I$${fCierre}`, fechaPiso: `$G$${fCierre}` })
  const fAviso0 = filas.length + 1
  for (let k = 0; k < Math.max(A.length, AC.length); k++) banda([A[k] ?? ''], [AC[k] ?? ''])
  const fAviso1 = filas.length

  // LAS FILAS DE CIERRE, IDENTIFICADAS POR SU RÓTULO Y NO POR SU POSICIÓN. Son las únicas que llevan
  // el signo "$": un símbolo repetido en cincuenta celdas deja de informar.
  const esTotal = (v) => /^\s*(⇒|Total|TOTAL)/.test(String(v ?? '')) || /^=IF\(\$H\d+>=\$I\d+;"⇒/.test(String(v ?? ''))
  const totales = filas.map((f, i) => (esTotal(f?.[0]) || esTotal(f?.[5]) ? i + 1 : 0)).filter(Boolean)

  return {
    filas,
    totales,
    usd,
    // SÓLO EL ARQUEO ES AMARILLO. En el diseño anterior también se pintaban "Caja en pesos" y "Caja en
    // dólares", que son CALCULADAS: amarillo significa "acá podés escribir", y escribir ahí borraba
    // una fórmula. Que el color mienta sobre quién es dueño de la celda es peor que no tener color.
    amarillas: [fArqArs, fArqUsd],
    fTitulo, fRotulos, fCifras, fContexto,
    fBloques12, fCab, fBloques34,
    d0, d1, lad0, lad1, fCierre, fFinMes,
    fArqArs, fArqUsd, fAviso0, fAviso1,
    fBancoPesos, fCartera, fBalanzArs, fBalanzUsd, fPost, noSuman,
    tarjetas: T,
  }
}
