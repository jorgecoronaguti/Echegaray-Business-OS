// `_CAJA_ANEXO` — EL DETALLE DE CAJA, DONDE NO TAPA LA DECISIÓN.
//
// POR QUÉ EXISTE (05/08/2026). CAJA tenía 143 filas. El dueño lo dijo tres veces —*"está pésima…
// minimalista y de clase mundial"*— y dos rondas de mejoras incrementales no lo movieron, porque el
// problema no eran los defectos: eran el TAMAÑO y la ESTRUCTURA. Setenta de esas filas eran la vista
// del ANALISTA (conciliaciones, trazabilidad contra el extracto, el costo del descubierto al
// centavo) y el dueño necesita la del CFO: cuánta plata hay, hasta cuándo alcanza, quién la debe.
//
// NINGÚN CONTROL DESAPARECE — cambia dónde vive. CAJA publica el VEREDICTO de cada uno en una línea y
// el detalle está acá, entero. Un control que se borra para achicar una pestaña es exactamente el
// modo de falla que este archivo pasó meses cerrando.
//
// POR QUÉ NO ESTÁ OCULTA, contra la primera intención: esta pestaña tiene la ÚNICA celda de carga que
// se fue de CAJA —el "Dólar declarado por la empresa", opcional— y una celda que una persona escribe
// no puede vivir en una pestaña que no se ve. Lleva el prefijo `_`, que en este archivo ya significa
// "auxiliar, no se lee de corrido"; eso alcanza sin enterrar un input.
//
// LAS REFERENCIAS CRUZAN POR NOMBRE, NUNCA POR CELDA. Ver caja-anexo-nombres.mjs.

import * as BANCO from './banco-santander.mjs'
import { ANEXO, DESDE_CAJA, PESTANA_ANEXO } from './caja-anexo-nombres.mjs'
import { CARGA, CUENTAS, TIPO_CAMBIO, RANGO_TC } from './caja-disponibilidades.mjs'
import { TASAS, CARGO_VERIFICADO, tasaDiaria, costoConImpuestos } from './costo-descubierto.mjs'
import { formulaCanarioDetalle, formulaFechaDeCheque, formulaImporteEnCartera } from './cartera-cheques.mjs'
import {
  formulaCobrosPosteriores, formulaChequesDebitadosPosteriores, formulaComprasPagadasPosteriores,
  formulaJornalesBancoPosteriores, formulaOficinaBancoPosteriores, formulaOficinaSinCanal,
  formulaCobrosEfectivoPosteriores, formulaComprasEfectivoPosteriores, formulaDepositosEfectivoPosteriores,
  formulaJornalesEfectivoPosteriores, formulaOficinaEfectivoPosteriores, formulaExtraccionesEfectivoPosteriores,
  formulaFechaUltimoEfectivo,
} from './caja-posterior-al-corte.mjs'
import { anclaDeSalida } from './caja-ancla-por-instante.mjs'
import { filaHuecoDelExtracto } from './banco-detalle-declarado.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import {
  bloqueLiquidez, bloqueConciliacion, bloqueVencido, bloqueTrazabilidad, bloqueCalendarioCiego,
} from './caja-anexo-controles.mjs'
import { bloqueSeries } from './caja-anexo-series.mjs'
import { ALERTA } from './glifos.mjs'

export { PESTANA_ANEXO }

/** A concepto · B moneda · C importe origen · D número 2 · E importe en pesos · F fecha · G texto. */
// CATORCE COLUMNAS DESDE EL 20/08/2026. Eran siete y la serie de la necesidad diaria necesita siete
// más: el día, cinco baldes de salida y la cobranza. Con siete, `addChart` devolvía «Range
// '_CAJA_ANEXO'!H258:H288 exceeds grid limits» y NINGÚN gráfico se dibujaba — el lote es uno solo.
//
// LAS SIETE NUEVAS VAN DESPUÉS DE LA PROSA, no antes. La G es la columna de nota y de contadores, y
// el formateador la ubica como «la última» (`ANCHO_ANEXO - 1`); meter las series en el medio le
// corría el rótulo y dejaba los conteos sin formato de número. Ver el test de `fCuantos`.
//
// Y DIECISÉIS DESDE EL 28/08/2026: la necesidad diaria partió sus salidas en «Ya salió» (REAL) y los
// cinco rubros de lo que falta pagar, así que el bloque ocupa una columna más. El ancho NO se escribe
// dos veces: `COL_NECESIDAD` lo cuenta sobre `SALIDAS` y el test falla si esta constante se queda
// corta — que es exactamente el 400 de arriba, el que deja la pestaña SIN NINGÚN gráfico.
export const ANCHO_ANEXO = 16
/** La columna de prosa y contadores. Era «la última»; con la serie nueva atrás, hay que nombrarla. */
export const COL_NOTA = 7

/** Los rótulos del SELLO del conteo, letra por letra: son el ancla con la que el rescate y la
 *  corrida que sella encuentran sus celdas aunque el bloque se mueva. */
export const SELLO_EFECTIVO = {
  sello: '      · (−) lo que ya estaba adentro del conteo — SELLO',
  estado: '      ¿el sello está al día?',
  imposible: `      ${ALERTA} imposible: cuánto no se explica para que el cajón cierre`,
}

/**
 * EL RENGLÓN DE LA CARGA TARDÍA — el agujero que la ventana por fecha no puede ver, publicado.
 *
 * POR QUÉ ESTÁ EN LA PESTAÑA Y NO SÓLO EN EL LOG (15/08/2026). Este mismo archivo ya tiene la lección
 * escrita dos renglones más arriba: *"el auditor lo dice en el log del pipeline desde hace semanas y
 * nadie abre ese log"*. Un número que sólo existe en `journalctl` no existe.
 *
 * SU VALOR ES UN NÚMERO PEGADO, Y ES LEGÍTIMO — de la misma especie que el SELLO. Ninguna fórmula de
 * Sheets puede calcularlo: depende de CUÁNDO cambió una celda, y eso el archivo no lo sabe. Lo estampa
 * la corrida, igual que el sello, y por eso lleva al lado el INSTANTE en que se midió: un número de
 * observación sin su fecha se lee como si fuera de ahora, para siempre.
 */
export const CARGA_TARDIA = {
  rotulo: `      ${ALERTA} cargado tarde: pagos en efectivo anotados DESPUÉS del conteo sobre filas anteriores a él`,
  origen: 'La ventana por fecha no los ve: el cajón puede tener esto de menos. Puede ser un pago cargado sobre una fila vieja (plata que salió) o la corrección de un importe histórico (plata que nunca se movió). NO se resta solo: no se pueden distinguir. Lo mide el centinela comparando cada celda de pago contra el valor que tenía antes del conteo.',
}

/**
 * LOS DOS RENGLONES DE LA FECHA DEL CONTEO — de acá sale la columna D de las filas de efectivo de CAJA.
 *
 * POR QUÉ EXISTEN (16/08/2026). El dueño: *"no completaste las fechas de saldos"*. `CAJA!D7` y `D8` —el
 * 40% del disponible— estaban VACÍAS desde que él borró la celda donde las tipeaba, y con ellas vacías
 * el aviso de congelado de la tarjeta no podía dispararse nunca sobre esas dos filas: su condición
 * arranca con `ISNUMBER($D$n)`. La fecha no se le vuelve a pedir —él lo pidió así, textual: *"que no te
 * guíes en eso sino en lo q marca los timestamps del código"*— y ahora existe de dónde sacarla.
 *
 * SU VALOR ES UN NÚMERO PEGADO Y ES LEGÍTIMO, igual que el SELLO y la CARGA TARDÍA: ninguna fórmula de
 * Sheets puede saber CUÁNDO cambió una celda. Lo estampa la corrida desde `caja_conteo_observado`.
 *
 * VACÍO ES UN ESTADO VÁLIDO Y NO UN DEFECTO: sin conteo cargado no hubo conteo, y una fecha ahí sería
 * una afirmación sobre un hecho que no ocurrió. Es el caso de los dólares hoy (`CAJA_ARQUEO_USD` = 0).
 */
export const FECHA_DEL_CONTEO = {
  ars: '      · la fecha que CAJA publica para el conteo en pesos',
  usd: '      · la fecha que CAJA publica para el conteo en dólares',
  origen: 'La estampa la corrida desde el centinela: el DÍA del borde más viejo del intervalo en que se vio el conteo (resolución 2 h, el período del timer). No es el ancla del cálculo —ésa es el instante, en F del SELLO—: es la fecha que se muestra. Vacía = no hay conteo cargado, y entonces CAJA no publica fecha en vez de inventar una.',
}

/**
 * EL RENGLÓN DE LA FECHA QUE CAJA PUBLICA DE VERDAD EN `D7` (24/08/2026).
 *
 * El dueño: *"la fila 7 q marca el efectivo disponible me confunde con la fecha del saldo porque se
 * realizaron cobranzas en efectivo y pagos pero no me indica la fecha del ultimo movimiento de
 * efectivo"*. El renglón de arriba fecha el CONTEO; éste fecha el SALDO, que no es lo mismo desde que
 * el saldo se mueve solo con seis fuentes. Los dos quedan a la vista, uno debajo del otro, porque son
 * dos preguntas distintas: "¿cuándo contaste?" y "¿hasta cuándo llega este número?".
 *
 * A DIFERENCIA DE LOS DOS DE ARRIBA, ÉSTE ES UNA FÓRMULA Y NO UN NÚMERO PEGADO: no depende de saber
 * cuándo cambió una celda, sino de leer las mismas seis fuentes que el neto ya suma. Por eso no se
 * rescata ni se estampa — se recalcula solo cada vez que alguien abre el archivo, que es la única
 * forma de que no vuelva a envejecer en silencio.
 */
export const FECHA_ULTIMO_EFECTIVO = {
  rotulo: '      · la fecha del ÚLTIMO movimiento de efectivo — es la que CAJA publica en D7',
  origen: 'MAX del día del conteo y de la fecha de cada una de las seis fuentes del neto, con LOS MISMOS criterios y la MISMA ventana con que cada una entra al importe. Sin movimientos posteriores queda el día del conteo. OJO: OFICINA fecha por MES y JORNALES por QUINCENA — son las únicas fechas que esos bloques tienen.',
}

/**
 * LOS SEIS RENGLONES DEL HISTÓRICO DE EFECTIVO, declarados como datos y no como seis `push` sueltos.
 *
 * POR QUÉ SE DECLARAN ACÁ (14/08/2026). Sus rótulos dejaron de ser decoración: son el ancla con la que
 * el rescate encuentra el SELLO DE CADA RENGLÓN al regenerar la pestaña, igual que `SELLO_EFECTIVO`.
 * Escritos dos veces —uno en el generador y otro en el rescate— la primera corrección de estilo en uno
 * de los dos habría perdido el sello de esa línea sin dar un solo error.
 *
 * Todos van con arqueo `'0'` a propósito: SIN VENTANA DE FECHA. El día no puede ordenar dos hechos del
 * mismo día y un parcial que crece sobre una fila vieja es invisible para cualquier ventana; la única
 * ancla que funciona es un saldo sellado. Ver el bloque de abajo.
 *
 * ═══ `entra`: QUÉ RENGLONES PUEDEN SUBIR EL CAJÓN — Y POR QUÉ HACE FALTA SABERLO (15/08/2026) ═══
 *
 * No es una etiqueta descriptiva: es lo que hace calculable EL TECHO del efectivo. Un cajón no puede
 * tener más que lo contado más lo que ENTRÓ, y hasta hoy nadie miraba ese lado. El 15/08 la pestaña
 * publicó $58.646.092 sobre un conteo de $12.000.000 con las dos líneas de entrada quietas en cero:
 * un imposible tan claro como el negativo del 14/08, y con el signo que autoriza gastos en vez de
 * frenarlos. Ver `dictamenEfectivo` en caja-efectivo-fisico.mjs.
 */
export const HISTORICO_EFECTIVO_BASE = [
  { rotulo: '      · (+) cobrado en efectivo — desde el conteo', entra: true,
    fn: (A) => `=${formulaCobrosEfectivoPosteriores(A)}`,
    origen: 'Cobranzas: forma "Efectivo" Y estado "Cobrado"' },
  { rotulo: '      · (−) pagado en efectivo — desde el conteo', entra: false,
    fn: (A) => `=-(${formulaComprasEfectivoPosteriores(A)})`,
    origen: 'Compras en efectivo: el MONTO PAGADO, parcial o total' },
  { rotulo: '      · (−) jornales pagados en efectivo — desde el conteo', entra: false,
    fn: (A) => `=-(${formulaJornalesEfectivoPosteriores(A)})`,
    origen: 'Jornales por Quincena, columnas Adelanto y Total recibo' },
  { rotulo: '      · (−) sueldos de OFICINA en efectivo — desde el conteo', entra: false,
    fn: (A) => `=-(${formulaOficinaEfectivoPosteriores(A)})`,
    origen: 'Oficina: lo pagado menos lo que salió por banco' },
  // EL ESPEJO DEL DEPÓSITO: el billete deja la cuenta y entra al cajón, así que acá SUMA. La caja
  // física sólo sabía BAJAR hacia el banco y nunca subir desde él — una asimetría que sólo puede dar
  // de menos.
  { rotulo: '      · (+) extraído del banco — desde el conteo', entra: true,
    fn: (A) => `=${formulaExtraccionesEfectivoPosteriores(A)}`,
    origen: 'Réplica del extracto: débitos con concepto "extracción"' },
  { rotulo: '      · (−) depositado en el banco — desde el conteo', entra: false,
    fn: (A) => `=-(${formulaDepositosEfectivoPosteriores(A)})`,
    origen: 'Réplica del extracto: créditos con concepto "depósito de efectivo"' },
]

/**
 * LOS SEIS RENGLONES ACOTADOS AL INSTANTE DEL CONTEO (15/08/2026).
 *
 * EL DEFECTO: sumaban el histórico COMPLETO y el corte lo hacía una resta contra una foto (el SELLO).
 * Una resta de fotos no distingue "salió plata" de "se corrigió un dato de hace seis meses": el 15/08
 * la línea de jornales cambió $48,3M por una corrección y CAJA publicó $58.646.092 sobre un conteo de
 * $12.000.000. Y con el sello al día publicaba el conteo pelado, sin los movimientos.
 *
 * El dueño lo pidió así, textual: *"de ahí se tienen q producir las cargas o descargas según
 * corresponda"*. Eso es una ventana desde el instante del conteo, y cada movimiento entra por SU
 * fecha económica — una corrección sobre una fila de marzo no gana fecha de hoy, así que no entra.
 *
 * LO QUE LA VENTANA NO PUEDE, DICHO: un parcial que crece sobre una fila vieja no tiene fecha nueva.
 * El techo de `dictamenEfectivo` vigila esa punta.
 */
export function historicoEfectivo(ancla = '0') {
  // ═══ EL MISMO DÍA DEL CONTEO: ASIMÉTRICO, Y A PROPÓSITO (15/08/2026) ═══
  //
  // Ninguna fuente guarda hora (medido: 1 valor con parte horaria sobre 2.198), así que un hecho
  // fechado el día del conteo no se puede ubicar antes o después de él. Con corte estricto (`>`) se
  // cayó el cobro en efectivo de $8.234.758 del 14/08 —el día en que el dueño cargó su conteo— y la
  // caja quedó $8,2M por debajo de lo que puede tener.
  //
  // No se elige un borde para los dos lados: se elige EL LADO CONSERVADOR DE CADA UNO.
  //   · lo que SALE del cajón entra desde el día del conteo INCLUIDO (`>= día`): si el pago fue antes,
  //     el conteo ya lo reflejaba y restarlo de nuevo sólo puede mostrar de menos.
  //   · lo que ENTRA al cajón entra desde el día SIGUIENTE (`> día`): si el cobro fue después del
  //     conteo, mostrarlo de menos es prudente; si fuera al revés, estaríamos inventando billetes.
  //
  // El resultado siempre es el piso, nunca el techo. La plata del mismo día que queda afuera se
  // NOMBRA en la pestaña en vez de desaparecer — un dato que no se puede ubicar no es un dato que no
  // existe. El día que las fuentes traigan hora, esto se borra y manda el instante.
  // `anclaDeSalida` vive en caja-ancla-por-instante.mjs porque la lee también la fórmula que publica la
  // FECHA del último movimiento: las dos tienen que mirar EXACTAMENTE la misma ventana.
  const desdeElDia = anclaDeSalida(ancla)
  return HISTORICO_EFECTIVO_BASE.map((l) => ({ ...l, formula: l.fn(l.entra ? ancla : desdeElDia) }))
}

/** Compatibilidad: los consumidores que sólo necesitan rótulo/entra/origen. */
export const HISTORICO_EFECTIVO = HISTORICO_EFECTIVO_BASE
/**
 * LA CLAVE CON LA QUE UNA FILA SE RESCATA POR SU RÓTULO — la misma de los dos lados.
 *
 * ═══ EL SELLO NUNCA SE RESCATÓ, Y NADIE SE ENTERÓ (14/08/2026) ═══
 *
 * `rescatarAnexo` compara el rótulo leído del Sheet YA RECORTADO (`.trim()`) contra estas constantes,
 * que llevan seis espacios de sangría. Nunca coincidieron: medido contra la pestaña viva, los rótulos
 * conservan la sangría (`"      · (−) lo que ya estaba adentro del conteo — SELLO"`), así que el
 * rescate devolvía un mapa VACÍO y cada regeneración escribía 0 en el sello. Con el sello en 0
 * `necesitaSello` da verdadero siempre, y el anexo RESELLABA EN CADA CORRIDA contra el histórico de
 * ese instante: un sello rodante de dos horas, no un ancla en el conteo.
 *
 * QUÉ SIGNIFICABA ESO PARA LA PLATA: el efectivo publicado volvía al arqueo cada dos horas. Un pago de
 * $3.000.000 en billetes bajaba la caja hasta la corrida siguiente y después desaparecía adentro del
 * sello — la caja física mintiendo HACIA ARRIBA, en silencio, que es el modo de falla exacto que el
 * modelo del arqueo existe para evitar. Y es también la razón por la que el salto de OFICINA del 14/08
 * entró entero al neto: fue el movimiento de una sola ventana entre corridas.
 *
 * El test vive en `caja-anexo.test.mjs` y prueba el defecto: normaliza los dos lados, no uno.
 */
export const claveDeRotulo = (r) => String(r ?? '').trim()

/** Los anchos de columna, en píxeles. Los mismos que CAJA para que las dos se lean igual. */
export const ANCHOS_ANEXO = [420, 56, 140, 140, 140, 104, 260, 90, 124, 124, 124, 124, 124, 124, 140, 140]

const ars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

/**
 * LAS DOS PUNTAS DEL CAJÓN, COMO TROZOS DE FÓRMULA — el piso y el techo, armados una sola vez.
 *
 * Vive afuera de `bloqueMovimientos` porque lo usan tres celdas (el neto, el estado y el control) y
 * escribir la misma condición tres veces es cómo dos de ellas terminan diciendo cosas distintas: ya
 * pasó en este archivo con el desglose que contradecía a su total.
 *
 * EL TECHO SÓLO EXISTE SI SE PUEDE MEDIR. Necesita el sello de CADA renglón que carga el cajón (la
 * columna D). Con uno solo sin sellar, `N($D$x)` valdría 0, el delta sería el renglón entero y el
 * techo saldría gigante: un control que nunca dispara, que es peor que no tenerlo porque se lee como
 * verde. Por eso la condición arrastra `ISNUMBER` de todos ellos y el estado dice cuándo no se midió.
 *
 * @param {number} f0 primera fila del histórico
 * @returns {{cajon:string, techo:string, medible:string, roto:string, sinExplicar:string}}
 */
export function guardaDelCajon(f0) {
  const fSello = f0 + HISTORICO_EFECTIVO.length
  const cajon = `N(${DESDE_CAJA.arqueoArs})+SUM(C${f0}:C${fSello})`
  const entrada = HISTORICO_EFECTIVO.map((l, i) => (l.entra ? f0 + i : 0)).filter(Boolean)
  // Lo que ENTRÓ desde el sello: el valor de hoy del renglón menos el que tenía al sellarse.
  // Con ventana, `C` YA es lo que entró después del conteo: restarle su sello lo dejaba en negativo.
  const techo = `N(${DESDE_CAJA.arqueoArs})+${entrada.map((f) => `C${f}`).join('+')}`
  const medible = entrada.map((f) => `ISNUMBER($D$${f})`).join('*')
  return {
    cajon,
    techo,
    medible,
    roto: `((${cajon}<0)+(${medible})*(${cajon}>${techo})>0)`,
    // Cuánto no se explica, de la punta que sea. Las dos no pueden ser positivas a la vez.
    sinExplicar: `MAX(0;-(${cajon}))+(${medible})*MAX(0;(${cajon})-(${techo}))`,
  }
}

/**
 * El constructor de grilla del anexo. `push` devuelve el número de fila (1-based) de lo que acaba de
 * empujar, que es como todos los generadores de este archivo evitan anclar en una posición fija.
 *
 * TODA CELDA VACÍA SALE CON EL CENTINELA `VACIO`: significa "es mía y va vacía", que es lo que hace
 * que la fusión la limpie. Una celda AUSENTE (`undefined`) significa "es de una persona, no la toco".
 * La diferencia no es cosmética: ya borró el conteo del dueño una vez.
 */
function hoja(ctx) {
  const filas = []
  const h = {
    ...ctx,
    filas,
    get n() { return filas.length },
    push(c = []) {
      const r = [...c].map((x) => (x === h.AJENA ? undefined : (x === '' || x === undefined || x === null ? VACIO : x)))
      while (r.length < ANCHO_ANEXO) r.push(VACIO)
      r.length = ANCHO_ANEXO
      filas.push(r)
      return filas.length
    },
    AJENA: Symbol('celda de una persona: no la escribo ni la borro'),
  }
  return h
}

/**
 * A1 · EL DESGLOSE DE LOS MOVIMIENTOS POSTERIORES.
 *
 * CAJA muestra DOS netos —lo posterior al corte del extracto y lo posterior al arqueo— y los dos son
 * la razón por la que la caja se mueve sola cuando alguien toca Cobranzas. Sus once sumandos vivían
 * en CAJA, entre las cinco cuentas y el total, y eran la mitad del ruido del bloque 1: once renglones
 * que no suman nada leídos como si fueran cuentas.
 *
 * EL NETO DE EFECTIVO SE CALCULA ACÁ Y CAJA LO REFERENCIA POR NOMBRE (`ANEXO_EFECTIVO_NETO`), porque
 * es la mitad viva de `efectivo = arqueo + movimientos posteriores`. El neto BANCARIO se queda en
 * CAJA: ése sí suma al total de disponibilidades y un sumando del total no puede vivir afuera.
 */
function bloqueMovimientos(h) {
  const { push } = h
  const corte = DESDE_CAJA.bancoCorte
  push(['A1 · MOVIMIENTOS POSTERIORES — DE QUÉ SE COMPONEN LOS DOS NETOS DE CAJA'])
  push(['Concepto', 'Moneda', 'Importe', '', '', 'Fecha', 'De dónde sale'])

  // ═══ HASTA DÓNDE LLEGA EL DETALLE, ANTES DE EMPEZAR A SUMARLE COSAS (14/08/2026) ═══
  //
  // Todo este bloque parte del saldo del extracto y le suma lo que pasó después. Ese saldo es el
  // DECLARADO por el banco —correcto— pero los movimientos cargados no llegan a él: faltan $45.080,
  // anteriores al primer movimiento del extracto cargado. El auditor lo dice en el log del pipeline
  // desde hace semanas y nadie abre ese log. Va como PRIMERA línea del bloque, no al final: quien
  // reconcilie el detalle contra el saldo tiene que enterarse antes de empezar, no después de perder
  // una tarde buscando un error de carga que no existe.
  //
  // NO SE RESTA DE NADA. CAJA sigue mostrando el saldo del banco: un hueco declarado es información;
  // uno "corregido" por el OS sería un dato inventado. Ver lib/banco-detalle-declarado.mjs.
  push(filaHuecoDelExtracto())

  // LA FECHA VA GUARDADA CON ISNUMBER: `=CAJA_BANCO_CORTE` sobre una celda vacía devuelve 0, y el 0 con
  // formato de fecha se dibuja "30/12/1899". Es el defecto `fecha_cero` que el auditor de pantalla
  // reportaba en CAJA, y la causa es siempre la misma: una referencia cruda en una columna de fecha.
  push(['Posteriores al CORTE DEL EXTRACTO — el neto suma al total de CAJA', '', '', '', '',
    `=IF(ISNUMBER(${corte});${corte};"")`, ''])
  push(['   · (+) cobros acreditados después del corte', 'ARS',
    `=${formulaCobrosPosteriores(corte)}`, '', '', '',
    'Cobranzas en estado Cobrado (sin echeq), con fecha posterior al corte'])
  push(['   · (−) pagos debitados después del corte', 'ARS',
    `=-(${formulaChequesDebitadosPosteriores(corte)}+${formulaComprasPagadasPosteriores(corte)})`, '', '', '',
    'Cheques propios debitados + compras pagadas por transferencia o débito'])
  // LA NÓMINA EN SU PROPIO RENGLÓN: es la salida más grande y más regular de la empresa, y mezclarla
  // con los cheques la vuelve invisible justo cuando hay que explicar por qué bajó la caja.
  push(['   · (−) jornales pagados por transferencia después del corte', 'ARS',
    `=-(${formulaJornalesBancoPosteriores(corte)})`, '', '', '',
    'Jornales por Quincena, columna Banco, por su fecha en "Pagado el"'])
  push(['   · (−) sueldos de OFICINA por transferencia después del corte', 'ARS',
    `=-(${formulaOficinaBancoPosteriores(corte)})`, '', '', '',
    'Jornales por Quincena, bloque Oficina, columna Banco'])
  // EL CANAL NO DECLARADO SE NOMBRA, NO SE ADIVINA. No se resta de ninguna disponibilidad —no se sabe
  // de cuál— así que tiene que verse con nombre y monto. Se apaga sola en cuanto el mes tenga Banco o
  // Efectivo cargado. Y NO se reparte mitad y mitad porque suele ser así: eso sería fabricar el dato.
  const fSinCanal = push([`   ${ALERTA} sueldos de OFICINA pagados sin declarar por qué canal salieron`, 'ARS',
    `=${formulaOficinaSinCanal(corte)}`, '', '', '',
    'OFICINA_PAGADO de los meses sin OFICINA_BANCO cargado'])

  // ═══ EL ESPEJO DE EFECTIVO DEL BANCO — CON EL SELLO DEL CONTEO (07/08) ═══
  //
  // Decisión del dueño: "permitir carga manual de efectivo, pero de ahí mismo se tiene que hacer carga
  // y descarga de manera automática". El arqueo es el ANCLA — el corte de la caja física, igual que el
  // extracto es el del banco.
  //
  // POR QUÉ YA NO HAY VENTANAS DE FECHA. Medido en vivo dos veces en 24 horas, en los dos sentidos:
  // el conteo del mediodía no veía el pago de la tarde (ventana estricta), y el conteo de la tarde
  // volvía a restar un pago que ya tenía adentro (ventana inclusiva). El dueño: "yo sé que ahora hay
  // 5.920.000, ¿por qué no muestra eso mismo?". El día no puede ordenar dos hechos del mismo día, y
  // un parcial que crece sobre una fila vieja es invisible para cualquier ventana y para cualquier
  // frontera de filas. La única ancla que funciona es la del banco: UN SALDO SELLADO.
  //
  // CÓMO FUNCIONA. Cada renglón trae su HISTÓRICO COMPLETO (sin fechas). El renglón del SELLO resta
  // lo que ese histórico sumaba cuando se cargó el conteo — un número que el generador sella al
  // detectar un arqueo nuevo (caja-anexo-pestana.mjs). El neto es la SUMA de todos los renglones a
  // la vista: histórico ahora − histórico al conteo = lo que se movió desde que contaste. Una fila
  // nueva, un parcial que crece o una corrección mueven el delta al instante.
  //
  // Y MIENTRAS EL SELLO ESTÁ VIEJO (el dueño acaba de tipear un conteo nuevo), el sello se
  // autocancela: resta el histórico entero, el neto da 0 y la caja muestra EXACTAMENTE lo contado —
  // que es la verdad más nueva que existe. La próxima corrida sella y los movimientos corren de ahí.
  // Las filas se conocen antes de empujarlas: encabezado, neto, 6 históricos, el sello y el estado.
  const fSello = h.n + 9
  const fEstado = fSello + 1
  // ═══ EL ANCLA ES EL SELLO DEL CÓDIGO, NO UNA CELDA QUE ALGUIEN PUEDE BORRAR (15/08/2026) ═══
  //
  // El dueño borró la fecha del conteo en CAJA y lo dijo: *"te borré la fecha de los saldos en caja
  // para q no te guíes en eso sino en lo q marca los timestamps del código"*. Al borrarla, la guarda
  // `IF(NOT(ISNUMBER(CAJA_ARQUEO_ARS_FECHA));0;…)` se apagó, el neto quedó en 0 y el automático entero
  // dejó de funcionar — que es exactamente lo contrario de lo que pidió ("tiene q ser automático").
  //
  // Una celda de entrada que, al faltar, APAGA el mecanismo es un interruptor disfrazado de dato. El
  // ancla pasa a ser el INSTANTE QUE ESTAMPA LA CORRIDA en F del sello: si hay sello, hay ventana, y
  // ninguna edición del dueño puede volver a apagarla. La fecha tipeada deja de leerse.
  const ancla = `$F$${fSello}`
  push(['Posteriores al CONTEO — el neto entra a "Efectivo en pesos" de CAJA', '', '', '', '',
    `=IF(ISNUMBER(${ancla});${ancla};"")`, ''])
  const fNeto = h.n + 1
  const f0 = fNeto + 1
  // ¿El sello pertenece al conteo que está cargado? SÓLO POR EL VALOR. Comparar también la fecha —como
  // hacía— resellaba con la celda borrada (0 ≠ 46241) y se habría tragado TODOS los movimientos dentro
  // del conteo: el daño, no la cura. El disparador es que cambie el número que él tipea, nada más.
  const selloViejo = `(N($D$${fEstado})<>N(${DESDE_CAJA.arqueoArs}))`
  const sello = (campo, def = 0) => { const v = h.previo(SELLO_EFECTIVO.sello, campo); return v === '' ? def : v }
  const selloEstado = () => { const v = h.previo(SELLO_EFECTIVO.estado, 'selloValor'); return v === '' ? 0 : v }
  // ═══ EL NETO NO PUEDE PUBLICAR UN CAJÓN NEGATIVO (14/08/2026) ═══
  //
  // `crudo` es lo que se movió desde el sello; `cajon`, lo que quedaría en la caja física. El 14/08
  // ese cajón dio −$15.051.781 contra un conteo de $4.320.000 y CAJA DISPONIBLE se fue a −$194.181:
  // la línea de OFICINA empezó a leer su canal —cambio correcto— y trajo siete meses que ya estaban
  // adentro del arqueo, que el sello del 07/08 no descontaba porque esa línea valía $0 al sellarse.
  //
  // La guarda es la única afirmación que no necesita ninguna fecha: un cajón no puede tener menos de
  // cero. Cuando el resultado es imposible, el neto se degrada a 0 y la pestaña muestra EL CONTEO TAL
  // CUAL —el mismo estado seguro que ya tenía el "conteo nuevo sin sellar"—, y las dos líneas de abajo
  // gritan cuánto no se explica. Ver lib/caja-efectivo-fisico.mjs para por qué no se resella solo.
  const crudo = `SUM(C${f0}:C${fSello})`
  // LAS DOS PUNTAS, NO UNA (15/08). El 14/08 el cajón dio negativo y la guarda lo atajó; el 15/08 dio
  // $58.646.092 contra un conteo de $12.000.000 y pasó de largo, porque era positivo. Ver
  // `guardaDelCajon`: un cajón tampoco puede tener MÁS que lo contado más lo que entró.
  const G = guardaDelCajon(f0)
  const cajon = G.cajon
  push(['   ⇒ NETO de efectivo posterior al arqueo', 'ARS',
    `=IF(NOT(ISNUMBER(${ancla}));0;IF(${G.roto};0;${crudo}))`, '', '', '',
    'Es la mitad viva de: efectivo en caja = arqueo + movimientos posteriores'])
  // LOS SUMANDOS, UNO POR UNO — HISTÓRICO COMPLETO, sin ventana. El neto es la suma de lo que se ve,
  // así que el desglose no puede decir otra cosa que el total. En D, lo que ESE renglón valía cuando
  // se selló el conteo: la resta contra su C dice quién se movió, que es lo que el 14/08 no se podía
  // ver con un solo número sellado para los seis.
  for (const l of historicoEfectivo(`$F$${fSello}`)) push([l.rotulo, 'ARS', l.formula, 0, '', '', l.origen])  // D en 0: con ventana el sello por
    // renglón ya no resta nada. Dejarlo con la foto del histórico completo hacía que el TECHO diera
    // -$141.300.064 y el control gritara "imposible" sobre una caja perfectamente sana.
  // EL SELLO. D lleva el número sellado (lo escribe el generador, no una persona); F, la fecha del
  // conteo al que pertenece. Con el sello viejo se autocancela: resta el histórico entero y el neto
  // queda en 0 — la pestaña muestra el conteo tal cual, nunca un descuento que ya está adentro.
  // EL TOTAL MANDA sobre los seis sellos de arriba: los escribe la misma lectura, en el mismo batch, y
  // los de renglón son el diagnóstico. Si alguna vez discreparan, el que resta es éste.
  push([SELLO_EFECTIVO.sello, 'ARS',
    // CON VENTANA EL SELLO YA NO RESTA: los seis renglones cuentan sólo lo posterior al instante
    // sellado, así que restarles la foto del histórico los contaría dos veces y devolvía el conteo
    // pelado. Queda en 0 y conserva su única función viva: mientras el conteo esté SIN sellar,
    // autocancela el bloque para que la pestaña muestre el número tal cual lo contó el dueño.
    `=-IF((NOT(ISNUMBER(${ancla}))+${selloViejo}>0);SUM(C${f0}:C${fSello - 1});0)`,
    sello('selloNeto'), '', sello('selloFecha', ''),
    'lo que el histórico sumaba cuando se cargó el conteo; lo sella la corrida del anexo. F es EL MOMENTO en que la corrida lo vio: es el ancla, y no lo tipea nadie'])
  // EL ESTADO DICE TAMBIÉN CUÁNTO SE MOVIÓ. El 14/08 esta fila decía "✓ sellado al conteo del 07/08",
  // era verdad, y el número estaba roto igual: un sello vigente no dice nada sobre el histórico del
  // que depende. El monto movido al lado del ✓ es lo que convierte esa línea en un control.
  const movido = `TEXT(${crudo};"$#,##0")`
  // EL ESTADO NOMBRA LA PUNTA VIOLADA. "No cierra" manda a buscar al lado equivocado la mitad de las
  // veces: por abajo hay plata que salió y no se registró, por arriba hay un registro histórico que
  // cambió hacia atrás. Y cuando el techo no se pudo medir lo dice, en vez de callarse en verde.
  push([SELLO_EFECTIVO.estado, '',
    `=IF(NOT(ISNUMBER(${ancla}));"— todavía sin sellar: la próxima corrida estampa el momento y los movimientos corren desde ahí";IF(${selloViejo};"${ALERTA} conteo nuevo sin sellar: se muestra tal cual lo contaste; la próxima corrida sella y los movimientos corren desde ahí";`
    + `IF(${cajon}<0;"${ALERTA} IMPOSIBLE por abajo: el histórico se movió "&${movido}&" desde el sello y deja el cajón en "&TEXT(${cajon};"$#,##0")&": muestro el conteo tal cual. Hay un dato viejo mal cargado o el sello quedó desfasado";`
    + `IF(NOT(${G.medible});"${ALERTA} sin techo: falta el sello por renglón de las líneas que CARGAN el cajón, así que un efectivo inflado pasaría por posible";`
    + `IF(${cajon}>${G.techo};"${ALERTA} IMPOSIBLE por arriba: el cajón daría "&TEXT(${cajon};"$#,##0")&" y sólo entraron "&TEXT((${G.techo})-N(${DESDE_CAJA.arqueoArs});"$#,##0")&" desde el conteo: muestro el conteo tal cual. Un registro histórico cambió hacia atrás";`
    + `"✓ sellado al conteo del "&TEXT(N($F$${fSello});"dd/mm HH:mm")&" · el histórico se movió "&${movido}&" desde entonces")))))`,
    selloEstado(), '', '', 'compara el conteo cargado contra la copia sellada (D de esta fila y F del sello)'])
  // EL CONTROL, CON NOMBRE PROPIO Y EN LA COLUMNA DE PESOS: CAJA lo suma a sus alertas de "no cierra".
  // VA DEBAJO DEL SELLO Y NO ADENTRO DEL BLOQUE: todo lo que esté en la columna C entre el primer
  // histórico y el sello ENTRA AL NETO, y un control que se suma a lo que mide no es un control.
  const fImposible = push([SELLO_EFECTIVO.imposible, 'ARS', '', '',
    `=IF(NOT(ISNUMBER(${ancla}));0;${G.sinExplicar})`, '',
    'Un cajón no puede tener menos de cero pesos NI más que lo contado más lo que entró. Mientras esto no sea 0, el efectivo publicado es el conteo y NO el calculado.'])
  // ═══ LO QUE LA VENTANA NO PUEDE VER, CON NÚMERO (15/08/2026) ═══
  //
  // VA DEBAJO DEL SELLO Y FUERA DEL BLOQUE, por la misma razón que el renglón de arriba: todo lo que
  // esté en la columna C entre el primer histórico y el sello ENTRA AL NETO, y esto no se resta de
  // nada. Por eso el importe va en la columna E, igual que el control de lo imposible.
  //
  // E y F los estampa la corrida (ver caja-anexo-pestana.mjs); acá salen con lo que quedó de la
  // anterior, o el generador borraría la medición en cada regeneración.
  const tardia = (campo) => { const v = h.previo(CARGA_TARDIA.rotulo, campo); return v === '' ? '' : v }
  const fCargaTardia = push([CARGA_TARDIA.rotulo, 'ARS', '', '', tardia('importe'), tardia('medidoEn'),
    CARGA_TARDIA.origen])
  // LA FECHA QUE VE EL DUEÑO EN CAJA, con su valor RESCATADO de la corrida anterior. Si se emitiera
  // vacío y el estampado fallara (base caída, un 429), `CAJA!D7` quedaría en blanco hasta la corrida
  // siguiente: la fecha del saldo desaparecería de la portada por un problema de infraestructura.
  const fechaConteo = (campo) => { const v = h.previo(FECHA_DEL_CONTEO[campo], 'dia'); return v === '' ? '' : v }
  const fFechaArs = push([FECHA_DEL_CONTEO.ars, '', '', '', '', fechaConteo('ars'), FECHA_DEL_CONTEO.origen])
  const fFechaUsd = push([FECHA_DEL_CONTEO.usd, '', '', '', '', fechaConteo('usd'), FECHA_DEL_CONTEO.origen])
  // EL ANCLA QUE RECIBE ES LA MISMA QUE LA DE LOS SEIS RENGLONES —`$F$fSello`, el instante sellado— y
  // no una copia: si la fecha mirara otra ventana que el importe, publicaría frescura por plata que no
  // está contada, o se quedaría quieta con el saldo moviéndose. El PISO es el día que CAJA muestra
  // (`ANEXO_CONTEO_ARS_DIA`, dos filas arriba) y no `INT` del instante: el instante puede caer del otro
  // lado de la medianoche y publicaría un día que el conteo no tuvo.
  const fUltimoEfectivo = push([FECHA_ULTIMO_EFECTIVO.rotulo, '', '', '', '',
    formulaFechaUltimoEfectivo(ancla, { conteo: ANEXO.conteoArsDia }), FECHA_ULTIMO_EFECTIVO.origen])
  return {
    fNeto, fSinCanal, fSello, fEstado, fImposible, fCargaTardia, fFechaArs, fFechaUsd, fUltimoEfectivo,
    filasHistorico: [f0, fSello - 1],
  }
}

/**
 * A2 · LOS VALORES EN CARTERA, UNO POR UNO.
 *
 * Un total de $30.000.000 no se puede verificar ni gestionar: hay que saber de quién es cada cheque y
 * qué día entra. Cada fila le pregunta por SU cheque a la réplica `_CHEQUES_RAW`; nunca se pega un
 * importe. Cuando el 30/07 entró el cheque 514, la versión con el importe pegado siguió mostrando lo
 * de la semana pasada sin dar un solo error.
 */
function bloqueCartera(h) {
  const { push, cartera } = h
  push(['A2 · VALORES EN CARTERA, UNO POR UNO'])
  push(['Valor', 'Moneda', 'Importe', '', '', 'Se acredita', 'Estado'])
  const det0 = h.n + 1
  for (const e of cartera.enCartera) {
    const f = h.n + 1
    push([`Cheque ${e.numero} · ${e.emisor}`, 'ARS', formulaImporteEnCartera(e.numero), '', '',
      formulaFechaDeCheque(e.numero),
      `=IF(F${f}="";"";"entra en "&TEXT(F${f}-TODAY();"0")&" días")`])
  }
  const det1 = h.n
  // LOS QUE SALIERON DE LA CARTERA. No suman —por eso van sin importe— pero tienen que estar A LA
  // VISTA: son los $20.000.000 que el cuadro creía tener y ya no tiene.
  for (const e of cartera.endosados) {
    push([`Cheque ${e.numero} · YA NO ES NUESTRO — endosado${e.beneficiario ? ` a ${e.beneficiario}` : ''}`,
      '', '', '', '', formulaFechaDeCheque(e.numero), 'entregado a un tercero'])
  }
  // EL CANARIO DEL DETALLE. Las filas de arriba las escribe el generador; el total es una fórmula
  // viva. Si entra un cheque y esta pestaña no se regenera, el detalle listaría uno menos y NADIE lo
  // vería: el total seguiría estando bien.
  push([`⇒ ¿el detalle está al día? — si dice ${ALERTA}, corré la réplica y regenerá el anexo`, '', '', '', '', '',
    // CON CARTERA VACÍA EL RANGO SE INVIERTE ($C$20:$C$19) y el canario apuntaba a las filas de los
    // ENDOSADOS que se escriben justo después (dictamen 07/08: daba "✓" de casualidad porque todo era
    // cero — con un cheque en custodia hubiera sumado el renglón equivocado). Sin detalle, el rango
    // es un 0 literal: el canario compara la réplica contra "no listé ninguno", que es la verdad.
    formulaCanarioDetalle(det1 >= det0 ? det1 - det0 + 1 : 0,
      DESDE_CAJA.cartera, det1 >= det0 ? `$C$${det0}:$C$${det1}` : '0')])
  // EL CONTROL SALE DE OTRA FUENTE QUE EL TOTAL, o no controla nada. El total de la cartera lo da la
  // réplica del banco (`_CHEQUES_RAW`); esta línea le pregunta lo mismo a COBRANZAS. Los dos miran la
  // misma plata desde lados distintos, que es la única forma de que la diferencia signifique algo.
  const fControl = push(['⇒ Control: qué dice Cobranzas de estos cheques', '',
    CUENTAS.find((c) => c.control)?.control ?? '', '', '', '',
    'Cobranzas sabe que el echeq se cobró; no sabe qué pasó DESPUÉS con el valor'])
  // Cobranzas registra que el echeq se cobró —y es cierto— pero no sabe qué pasó DESPUÉS con el valor.
  // Si este número es mayor que el de la cartera, la diferencia son cheques que se endosaron.
  const fDifCartera = push(['⇒ Diferencia contra el banco (manda el banco)', '',
    `=C${fControl}-${DESDE_CAJA.cartera}`, '', '', '',
    'Distinto de cero = el cash flow espera como ingreso plata que ya se entregó'])
  return { fDifCartera, fControlCartera: fControl }
}

/**
 * A3 · CRÉDITO DISPONIBLE Y LO QUE CUESTA USARLO.
 *
 * Eran dos bloques y contestaban la misma pregunta con dos mitades. El que miraba el aire de $26,9M
 * tenía que bajar a otro bloque para enterarse de que tomarlo sale $1.506,85 por día por millón, y el
 * que miraba el costo no veía contra cuánto. Una decisión de financiamiento necesita las dos cifras a
 * la vez o no es una decisión.
 *
 * EL MARGEN DE TARJETA NO ES PLATA PROPIA: es capacidad de endeudarse. NIC 7 clasifica el uso del
 * descubierto como actividad de FINANCIACIÓN, y una línea no girada no es un activo de ninguna manera.
 */
function bloqueCredito(h) {
  const { push, refs } = h
  const TC = RANGO_TC
  push(['A3 · CRÉDITO DISPONIBLE Y LO QUE CUESTA USARLO — NO ES EFECTIVO'])
  push(['Línea', 'Moneda', 'Importe en origen', 'Tipo de cambio', 'Importe en pesos', 'Fecha', 'Origen'])
  const linea = (nombre, moneda, importe, origen, fecha = BANCO.CORTE) => {
    const f = h.n + 1
    return push([nombre, moneda, importe, moneda === 'USD' ? `=IF(ISNUMBER(C${f});${TC};"")` : '',
      `=IF(ISNUMBER(C${f});C${f}*IF(D${f}="";1;D${f});"")`, fecha, origen])
  }
  const T = BANCO.TARJETA
  // ═══ CADA LÍNEA CON LA FECHA DE SU FUENTE, NO CON LA DEL EXTRACTO (28/08) ═══
  //
  // `linea()` fecha por defecto con el corte del EXTRACTO DE LA CUENTA (22/07). La tarjeta tiene sus
  // propios documentos y sus propias fechas: el resumen cerrado el 20/08 (consumos, cuotas, lo que se
  // debita) y la captura del homebanking del 29/07 (el disponible, que el resumen no publica). Con la
  // fecha de la cuenta, la columna "Fecha" del anexo declaraba un origen que ninguno de los dos tiene.
  const alResumen = T.al || BANCO.CORTE
  const fLim = linea(CARGA.limiteTarjeta, 'ARS', T.limite, `Resumen Nro. ${T.resumen.numero} · ${T.cuenta}`, alResumen)
  linea('   · consumos del período, en pesos', 'ARS', T.consumidoPesos,
    `Cierra el ${T.cierra}, vence el ${T.vence} · débito automático: ${T.debitoAutomatico} · ${ars(T.resumen.aDebitarPesos)} con impuestos`, alResumen)
  // UN SOLO CUPO, CON CONSUMOS EN DOS MONEDAS: modelarlo como dos límites mostraba un aire que no existe.
  linea('   · consumos del período, en dólares', 'USD', T.consumidoDolares,
    'Suscripciones. Se debitan EN DÓLARES el mismo día que el resumen en pesos',
    T.consumidoDolaresAl || alResumen)
  linea('   · cuotas de compras anteriores que caen en períodos futuros', 'ARS', T.cuotasPendientes.restante,
    `${ars(T.cuotasPendientes.proximoPeriodo)} más caen en el próximo débito, el ${T.vence}`,
    T.cuotasPendientes.al || alResumen)
  // EL QUE DECLARA EL BANCO, no uno calculado: límite menos consumido daría otro número y no se
  // inventa la aritmética del resumen. Y es del HOMEBANKING, no del resumen: el resumen no lo trae.
  const fDisp = linea('⇒ Disponible para comprar', 'ARS', T.disponible,
    'Lo declara el homebanking; el resumen del banco no publica el disponible', T.disponibleAl || alResumen)
  const fCtrl = push(['   Control contra la pestaña Tarjeta de Credito', 'ARS',
    `=SUMPRODUCT((UPPER('${refs.tarjeta}'!$J$3:$J$400)<>"SI")*IF(ISNUMBER('${refs.tarjeta}'!$E$3:$E$400);'${refs.tarjeta}'!$E$3:$E$400;0))`,
    '', `=C${h.n + 1}`, '', `${refs.tarjeta}, columna DEBITADO distinta de SI`])
  // UN CONTROL QUE NO CONCLUYE NADA NO ES UN CONTROL: acá había dos números uno debajo del otro y
  // ninguna fila que dijera si coinciden. Son cortes distintos, así que un resto chico es normal; uno
  // grande es una compra que no se cargó.
  push(['⇒ Diferencia — el resumen contra la pestaña', 'ARS',
    `=(C${fLim + 1}+E${fLim + 2}+C${fLim + 3})-C${fCtrl}`, '', '', '', ''])

  const A = BANCO.ACUERDO
  const fAcu = linea(CARGA.acuerdo, 'ARS', A.importe,
    `Acuerdo N° ${A.numero}, ${A.estado} · vence el ${A.vence} · TNA ${(A.tna * 100).toFixed(2)}% · CFT ${(A.cft * 100).toFixed(2)}% anual`)
  const fAire = push(['⇒ AIRE TOTAL DISPONIBLE (tarjeta + acuerdo)', 'ARS', `=C${fDisp}+C${fAcu}`, '',
    `=E${fDisp}+E${fAcu}`, '', 'Deuda que todavía no se tomó, no plata'])

  // QUÉ CUESTA USARLO. El modelo no se estimó: reproduce al centavo el cargo que el banco hizo el
  // 14/07 (ver costo-descubierto.mjs). Por eso el bloque muestra la verificación al lado del cálculo:
  // una tasa copiada de una pantalla y una tasa que reproduce un cargo real no valen lo mismo.
  push(['   Qué cuesta usarlo — lo que corre por día con la cuenta en rojo'])
  const fTasa = push(['Tasa nominal anual del acuerdo', '', TASAS.tna, '', '', '',
    `Acuerdo N° ${A.numero} · CFT ${(A.cft * 100).toFixed(2)}% anual`])
  // LA TASA DIARIA SE CALCULA EN EL SHEET, no en JavaScript: si el banco cambia la TNA se corrige la
  // celda de arriba y este número se mueve solo, o queda mostrando el costo del acuerdo viejo.
  push(['Interés por día, por cada $1.000.000 en descubierto', 'ARS',
    `=1000000*$C$${fTasa}/${TASAS.base}`, '', `=C${h.n + 1}`, '',
    `${(TASAS.tna * 100).toFixed(0)}% ÷ 365 · con IVA e impuestos, ${ars(costoConImpuestos(1000000 * tasaDiaria()))} por día`])
  push(['⇒ Interés que se está generando HOY', 'ARS',
    `=IF(${DESDE_CAJA.bancoSaldo}>=0;0;-${DESDE_CAJA.bancoSaldo}*${TASAS.tna}/${TASAS.base}*(1+${TASAS.iva}+${TASAS.percepcion}))`,
    '', `=C${h.n + 1}`, '=TODAY()', 'Con IVA 10,5% y percepción 1,5% incluidos'])
  push(['      Últimos intereses que cobró el banco', 'ARS', CARGO_VERIFICADO.interes, '',
    `=C${h.n + 1}*(1+${TASAS.iva}+${TASAS.percepcion})`, CARGO_VERIFICADO.hasta,
    `${CARGO_VERIFICADO.desde} al ${CARGO_VERIFICADO.hasta} (${CARGO_VERIFICADO.dias} días) · con impuestos salieron ${ars(CARGO_VERIFICADO.total)}`])
  return { fDisp, fAcu, fAire }
}

/**
 * A9 · TIPO DE CAMBIO — sólo para valuar la cuenta en dólares.
 *
 * Está al final a propósito: la empresa cobra, paga y decide en pesos. El dólar acá no es una
 * posición, es una cuenta chica que hay que poder sumar al total.
 *
 * ES LA ÚNICA CELDA DE CARGA DEL ANEXO ("Dólar declarado", opcional) y por eso sale AJENA cuando no se
 * pudo leer nada: sin dato no se sobrescribe, que es el lado seguro para equivocarse.
 */
function bloqueTipoDeCambio(h) {
  const { push, previo, AJENA } = h
  push(['A9 · TIPO DE CAMBIO — SÓLO PARA VALUAR LA CUENTA EN DÓLARES'])
  push(['Concepto', '', 'Cotización', '', '', 'Fecha', 'Origen'])
  const fRef = push([TIPO_CAMBIO.referencia.nombre, '', TIPO_CAMBIO.referencia.formula, '', '',
    '=TODAY()', TIPO_CAMBIO.referencia.origen])
  const suyo = (campo) => { const v = previo(TIPO_CAMBIO.declarado.nombre, campo); return v === '' || v == null ? AJENA : v }
  const fDec = push([TIPO_CAMBIO.declarado.nombre, '', suyo('saldo'), AJENA, AJENA, suyo('fecha'),
    previo(TIPO_CAMBIO.declarado.nombre, 'origen') || TIPO_CAMBIO.declarado.origen])
  const fTC = push([TIPO_CAMBIO.uso.nombre, '', `=IF(C${fDec}<>"";C${fDec};C${fRef})`, '', '', '',
    TIPO_CAMBIO.uso.origen])
  return { fTC, fDec }
}

/**
 * LA GRILLA COMPLETA DEL ANEXO.
 *
 * @param {object} ctx refs (pestañas y filas del Cash Flow), cartera, conceptosCiegos, previo
 * @returns {{filas:Array, destinos:Array, totales:number[], ...coordenadas}}
 */
export function grillaAnexo(ctx = {}) {
  const h = hoja({
    refs: ctx.refs ?? {},
    cartera: ctx.cartera ?? { origen: '—', enCartera: [], endosados: [] },
    conceptosCiegos: ctx.conceptosCiegos ?? [],
    ch: ctx.refs?.cheques ?? 'Cheques Emitidos',
    // POR CLAVE NORMALIZADA: el rescate lee del Sheet y acá se pide con la constante del código. Los
    // dos lados tienen que normalizar igual, o un rótulo con sangría no se encuentra nunca — ver
    // `claveDeRotulo`, que es el defecto que dejó el sello sin rescatar desde que existe.
    previo: (rot, campo) => ctx.cargado?.get(claveDeRotulo(rot))?.[campo] ?? '',
  })
  h.push([`${PESTANA_ANEXO} — EL DETALLE Y LAS CONCILIACIONES DE CAJA`])
  // LA PESTAÑA DICE PARA QUÉ ES Y A QUIÉN SIRVE. Un auxiliar sin encabezado se lee como un resto.
  h.push(['CAJA muestra el veredicto de cada control en una línea; acá está el detalle que lo sostiene. Todo lo que cruza a CAJA lo hace por RANGO CON NOMBRE, así que este anexo se puede reordenar entero sin romper nada.'])

  const mov = bloqueMovimientos(h)
  const car = bloqueCartera(h)
  const cre = bloqueCredito(h)
  const liq = bloqueLiquidez(h)
  const con = bloqueConciliacion(h)
  const ven = bloqueVencido(h)
  const tra = bloqueTrazabilidad(h)
  const cal = bloqueCalendarioCiego(h)
  const tc = bloqueTipoDeCambio(h)
  // LAS SERIES DE LOS GRÁFICOS DE CAJA VAN ÚLTIMAS. Son 130 filas de matriz —una fila por día— y no
  // se leen: las lee un gráfico. Puestas arriba empujarían el detalle que sí se consulta. Viven acá y
  // no en CAJA porque la portada no admite una matriz, y no en una pestaña nueva porque el anexo ya
  // existe para exactamente esto. Ver lib/caja-anexo-series.mjs.
  const ser = bloqueSeries(h)

  // LOS NOMBRES SE DECLARAN CON SU FILA REAL, NO CON UNA CONSTANTE. Es lo único que hace que el anexo
  // pueda crecer sin romper CAJA — y la especie de cada uno se verifica DESPUÉS de publicar.
  const destinos = [
    { name: ANEXO.efectivoNeto, fila: mov.fNeto, col: 3 },
    // Las dos fechas de conteo van SIN especie: son fechas (seriales) y la de dólares está vacía
    // mientras no haya conteo. Ver ESPECIE_ANEXO en caja-anexo-nombres.mjs.
    { name: ANEXO.conteoArsDia, fila: mov.fFechaArs, col: 6 },
    { name: ANEXO.conteoUsdDia, fila: mov.fFechaUsd, col: 6 },
    // La fecha del último movimiento va SIN especie por lo mismo que las dos de arriba: es un serial y
    // "entero" no distingue una fecha de un contador. Ver PUEDE_ESTAR_VACIO en caja-anexo-nombres.mjs.
    { name: ANEXO.ultimoEfectivoDia, fila: mov.fUltimoEfectivo, col: 6 },
    { name: ANEXO.efectivoImposible, fila: mov.fImposible, col: 5 },
    { name: ANEXO.oficinaSinCanal, fila: mov.fSinCanal, col: 3 },
    { name: ANEXO.difEcheq, fila: car.fDifCartera, col: 3 },
    { name: ANEXO.tarjetaDisponible, fila: cre.fDisp, col: 5 },
    { name: ANEXO.acuerdo, fila: cre.fAcu, col: 5 },
    { name: ANEXO.aire, fila: cre.fAire, col: 5 },
    { name: ANEXO.diasDeCaja, fila: liq.fDias, col: 3, especie: 'entero' },
    { name: ANEXO.difConciliacion, fila: con.fDif, col: 5 },
    { name: ANEXO.vencidoSinConciliar, fila: ven.fTot, col: 3 },
    { name: ANEXO.efectivoSinExplicar, fila: tra.fSinExpl, col: 5 },
    { name: ANEXO.chequesSinFecha, fila: cal.fSinFecha, col: 4 },
    { name: ANEXO.chequesSinMarca, fila: cal.fSinMarca, col: 4 },
    { name: RANGO_TC, fila: tc.fTC, col: 3 },
  ]
  // LAS FILAS DE TOTAL, IDENTIFICADAS POR SU RÓTULO Y NO POR SU POSICIÓN: son las únicas que llevan
  // el signo "$" — un símbolo repetido en ochenta celdas deja de informar.
  const totales = h.filas
    .map((f, i) => (/^\s*(⇒|Total|TOTAL)/.test(String(f?.[0] ?? '')) ? i + 1 : 0))
    .filter(Boolean)
  // `series` va con su propio nombre y no esparcido como los demás: sus ocho coordenadas se usan
  // juntas, y esparcirlas invitaría a que una colisione con la de otro bloque sin que nada avise.
  return { filas: h.filas, destinos, totales, series: ser, fTC: tc.fTC, fDec: tc.fDec, ...mov, ...car, ...cre, ...liq, ...con, ...ven, ...tra, ...cal }
}
