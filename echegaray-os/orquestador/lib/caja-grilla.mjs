// LA GRILLA DE CAJA — LA POSICIÓN, EN UNA PANTALLA.
//
// ═══ POR QUÉ SE REHIZO ENTERA (05/08/2026) ═══
//
// El dueño lo dijo tres veces con la misma palabra: *"quiero toda una caja nueva, tenés que rehacerla,
// está pésima… desde cero… minimalista y de clase mundial… eficiente y conectada a todas las
// pestañas"*. Ya se habían hecho dos rondas de mejoras incrementales sobre esta pestaña, cada una
// cerrando defectos reales, y el diagnóstico no cambió. Cuando el mismo pedido vuelve después de dos
// arreglos, el problema no son los defectos.
//
// EL DEFECTO ERA EL TAMAÑO: 143 filas. Setenta de ellas eran el anexo del ANALISTA —conciliaciones,
// trazabilidad contra el extracto, el costo del descubierto al centavo—; el CFO necesita cuatro cifras
// y un calendario. Todo eso se mudó ENTERO a `_CAJA_ANEXO` (ver lib/caja-anexo.mjs): ningún control
// desapareció, cambió dónde vive, y CAJA publica el veredicto de cada uno en una línea.
//
// EL OBJETIVO ES DURO Y SE MIDE: **45 filas**, sin una sola en blanco, y las cuatro cifras que deciden
// se leen sin scrollear. Un test lo verifica en frío; si un bloque nuevo la pasa, el test se pone rojo
// y hay que decidir qué sale, no dejarla crecer otra vez.
//
// ═══ LO QUE CRUZA A `_CAJA_ANEXO` LO HACE POR NOMBRE ═══
//
// Un intento anterior no movió el anexo porque los bloques de arriba lo referenciaban por celda
// (`=C90`, `=E99`). Tenía razón en el riesgo. La salida es dejar de referenciar por celda: cada cifra
// que cruza la frontera tiene UN nombre y el nombre es el contrato (lib/caja-anexo-nombres.mjs), así
// que el anexo puede cambiar de forma sin romper nada.
//
// ═══ CADA BLOQUE DECLARA LA FECHA DE SU FUENTE ═══
//
// La pestaña mezcla un arqueo del 04/08, un extracto del 05/08 y un resumen de tarjeta del 22/07. Eso
// es legítimo —son fuentes distintas y ninguna le presta su frescura a la otra— pero tiene que estar
// DICHO. Cada título de bloque lleva su fecha, calculada, en la columna de la derecha.

import * as BANCO from './banco-santander.mjs'
import { ANEXO, DESDE_CAJA } from './caja-anexo-nombres.mjs'
import { CUENTAS, RANGO_TC } from './caja-disponibilidades.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import { rotuloAlDia } from './fecha-de-frescura.mjs'
import {
  formulaFrescuraCaja, formulaNetaPosterior, formulaUltimoSaldo, formulaFechaCorte,
  formulaCobrosUsdEfectivoPosteriores,
} from './caja-posterior-al-corte.mjs'
import { formulaCartera, formulaCarteraTramo } from './cartera-cheques.mjs'
import { expresionSaleEnVentana } from './calendario-egresos.mjs'
import { inciertoHasta } from './caja-anexo-controles.mjs'
// LA ESCALERA DE VENCIMIENTOS VIVE EN SU PROPIO ARCHIVO: la consumen el calendario de acá, el bloque de
// cobertura 30/60/90 y el conciliador que compara tramo por tramo contra la planilla.
import {
  BORDES, PISO_CAJA, DESDE_SIEMPRE, desdeTramo, hastaTramo, resolutorDeTramo, cobranzasEsperadasTramo,
} from './caja-calendario.mjs'

export { BORDES, cobranzasEsperadasTramo }

/**
 * ¿ESTA FILA ES EL TÍTULO DE UN BLOQUE?
 *
 * El título casi siempre es texto plano ("3 · CALENDARIO — …"), pero el del ARQUEO es una FÓRMULA: es
 * el único bloque que puede estar vacío por culpa de un dato que sólo carga una persona, y cuando lo
 * está tiene que gritarlo en su propio título —"⚠ SIN ARQUEO: LA CAJA FÍSICA VALE $0"— porque si no la
 * caja física publica $0 sin que nada lo diga. Reconocerlo con `/^\d+ · /` dejaba ese bloque afuera
 * del formato y de los tres tests que cuentan bloques. La regla vive acá, exportada, en vez de repetida
 * en cuatro archivos con cuatro criterios que se van separando.
 */
export const esTituloDeBloque = (t) => /^\d+ · /.test(String(t ?? '').trim())
  || /^=IF\(.*?"\d+ · /.test(String(t ?? '').trim())

/** El objetivo del rediseño, escrito donde se puede verificar. Una pantalla, sin scrollear. */
export const FILAS_MAXIMAS = 45

/**
 * EL CONTRATO DE LAS COLUMNAS — UNA COLUMNA, UN SIGNIFICADO, DE ARRIBA ABAJO.
 *
 * ═══ ÉSTE ERA EL DEFECTO DE FONDO (05/08/2026) ═══
 *
 * El dueño rechazó esta pestaña siete veces con la misma frase —*"no has clarificado nada"*,
 * *"necesito claridad en caja"*, *"no me da seguridad nada de lo que expresa"*— y las rondas
 * anteriores buscaron el problema en los defectos de pantalla, en el tamaño y en los rótulos. No
 * estaba ahí. Mirando el render, la columna E decía *saldo en pesos* en el bloque 1, *neto del tramo*
 * en el 3, *caja + cobranzas* en el 4 y *monto del control* en el 5; la F decía *fecha del saldo*,
 * *queda después* y *hasta*. **Cinco significados por columna.** Con eso no hay forma de leer una
 * columna de un vistazo, que es exactamente lo que se hace en una planilla financiera: se escanea
 * hacia abajo. No es un problema de estilo, es de gramática.
 *
 *   A · el concepto                       E · EL NÚMERO QUE DECIDE, siempre en pesos
 *   B · moneda / unidad                   F · la fecha, siempre
 *   C y D · los dos insumos del bloque
 *
 * La E y la F son FIJAS y no se negocian: la E se lee sola de arriba abajo —disponible por cuenta,
 * total, con cuánto quedo en cada tramo, cuánto me sobra en cada horizonte, cuánto no cierra— y la F
 * alinea todas las fechas de la pestaña en una sola columna.
 *
 * La C y la D son los dos insumos de cada bloque y ahí sí cambian de nombre, porque un saldo y un
 * flujo no tienen los mismos insumos: en el bloque de saldos son *importe en su moneda* y *tipo de
 * cambio*; en los de flujo, *entra* y *sale*. Lo que no puede cambiar es la columna donde termina el
 * resultado — y eso es lo que estaba roto.
 *
 * ═══ Y NO HAY COLUMNA G ═══
 *
 * El dueño: *"la columna G entera no sirve para nada"*. Tenía razón, y la causa es la misma: era la
 * columna sin significado propio —decía "vivo", "1 días", "percibido", "salen en el calendario",
 * "2,89 ×", "cae en: Esta semana"—, un cajón donde caía todo lo que no entraba en otro lado. Lo poco
 * que valía se mudó a la columna que le corresponde: las fechas a la F, los montos a la E, y el
 * veredicto de un control al RÓTULO de su propia fila, que es donde se lee sin cruzar la pantalla.
 */
export const ANCHO = 8
/**
 * LA COLUMNA H NO LLEVA CONTENIDO, Y ES A PROPÓSITO. El dueño, textual: *"esas aclaraciones de mierda
 * yo siempre las saco y elimino todo lo q vos anotas en columna h"*. Sigue emitiéndose con el
 * centinela —en vez de dejar de emitirse— para que la intención quede DECLARADA: la columna es del
 * generador y va vacía, así la fusión limpia lo que quedó de las corridas viejas.
 */
export const COL_PROSA = 7
/**
 * Los anchos, en píxeles. Suman 1.140: entran en una pantalla sin scroll horizontal.
 *
 * ═══ EL REPARTO SE CORRIGIÓ MIRANDO EL RENDER (05/08) ═══
 *
 * `auditar-pantalla.mjs` marcó seis textos cortados sobre la pestaña escrita. La columna del rótulo
 * tenía 380px (≈66 caracteres) y la del VEREDICTO 156px (≈27): al revés de lo que necesita este
 * diseño. Los rótulos de bloque desbordan libres sobre las columnas vacías de al lado, así que la A
 * puede ceder; el veredicto NO desborda —a su derecha está el centinela de 24px— y es el que dice
 * "⚠ hay $12.188.441 sin marcar". Un aviso cortado no avisa.
 *
 * Los rótulos también se acortaron: ensanchar hasta que entre cualquier frase es cómo una pestaña
 * termina pidiendo scroll horizontal.
 */
// Suman 964px: entran holgados en una pantalla, sin scroll horizontal. La E es la más ancha porque
// es la que se lee —el número que decide— y la G queda en 0 porque ya no existe como columna.
export const ANCHOS = [340, 58, 148, 148, 166, 104, 0, 24]

const C_IMP = 'C', C_TC = 'D', C_PESOS = 'E'

/** La valuación estándar de una fila de cuenta: importe en su moneda × tipo de cambio. */
const saldoEnPesos = (f) => `=IF(C${f}="";"";C${f}*IF(D${f}="";1;D${f}))`

/** Cuánto vale hoy una cuenta según el banco, cuando la réplica del extracto no está. */
const saldoDeBanco = (c) => (c.banco === 'cartera' ? BANCO.totalEcheqs(BANCO.enCartera()) : BANCO.CUENTA[c.banco])

/**
 * LA GRILLA DE CAJA. Pura: sin red, sin base, sin escribir una celda.
 *
 * @param {Map} cargado lo que una persona ya tenía escrito, por rótulo de cuenta
 * @param {object} refs pestañas y filas del archivo, resueltas por rótulo (lib/caja-refs.mjs)
 */
export function grilla(cargado, refs) {
  const filas = []
  /** Las filas en dólares, para pintarlas distinto: "U$S 581,39" dibujado "$581" es un error de
   *  lectura de tres órdenes de magnitud, y sólo se ve mirando la pantalla. */
  const usd = []
  /** Una celda que NO es mía. `push` convierte toda vacía en el centinela VACIO ("es mía y va vacía",
   *  y por eso la fusión la limpia); `AJENA` sale como `undefined`, que la fusión PRESERVA. La
   *  diferencia no es cosmética: con VACIO, la primera corrida le borraba el conteo al dueño. */
  const AJENA = Symbol('celda del dueño: no la escribo ni la borro')
  const push = (c = []) => {
    const r = [...c].map((x) => (x === AJENA ? undefined : (x === '' || x === undefined || x === null ? VACIO : x)))
    while (r.length < ANCHO) r.push(VACIO)
    r.length = ANCHO
    // VACIAR_COLUMNA_G — ver el comentario de ANCHOS: la columna de anotaciones se retiró entera.
    // Se vacía acá, en el único punto por donde pasan TODAS las filas, en vez de en los cuarenta
    // `push` que la escribían: así no queda ninguna suelta el día que alguien agregue un bloque.
    r[6] = VACIO
    // EL PORTÓN DE LA COLUMNA DE PROSA, en el único lugar por el que pasan TODAS las filas. Puesto en
    // cada llamada sería un acuerdo que la próxima llamada olvida — y ya se olvidó una vez, por un merge.
    r[COL_PROSA] = VACIO
    filas.push(r)
    if (r[1] === 'USD') usd.push(filas.length)
    return filas.length
  }
  const previo = (cuenta, campo) => cargado.get(cuenta)?.[campo] ?? ''
  if (!refs?.filasCal) throw new Error('caja-grilla: faltan las filas de "Impuestos y Financieros" (IVA/IIBB): sin ellas el calendario sería ciego al egreso más grande del cuatrimestre')

  // ── 1 · EL TITULAR ──────────────────────────────────────────────────────────────────────────────
  //
  // LA FECHA SALE DEL DATO, NO DEL RELOJ. Era `new Date()`: declaraba la frescura de la CORRIDA, no la
  // del dato, y con el pipeline detenido eso es una mentira que se lee como un hecho. Ahora es la más
  // nueva de LAS TRES PUERTAS que mueven esta caja (extracto, compras pagadas, cobranzas), calculada
  // por Sheets: cambia cuando cambia el dato, sin que corra nadie.
  push(['POSICIÓN DE CAJA', '', '', '', '', rotuloAlDia('Dato', formulaFrescuraCaja({ bancoRaw: refs.bancoRaw }))])
  // ═══ TRES CIFRAS, NO CUATRO, Y CADA UNA CONTESTA UNA PREGUNTA QUE EL DUEÑO HIZO ═══
  //
  //   · CUÁNTO HAY HOY          →  "¿cuánta plata tengo?"
  //   · EL PISO, Y CUÁNDO       →  "¿cuál es el punto más bajo?" Es el techo de lo que se puede
  //                                inmovilizar y el plazo máximo del instrumento: si la caja toca su
  //                                mínimo el 12/08, ningún plazo fijo puede vencer el 13.
  //   · QUÉ QUEDA A FIN DE MES  →  *"¿cuánto me va a quedar a fin de mes al cubrir todas las
  //                                obligaciones?"* — textual, y es la que más veces repitió.
  //
  // ERAN CUATRO Y LA CUARTA ESTABA VACÍA. "COLOCABLE" mostraba *"⚠ cargá la caja mínima en 01_Valores
  // Iniciales"* en vez de un número: un cuarto del titular ocupado por un pedido de configuración. Es
  // un dato de segundo orden —el piso menos la reserva operativa— y bajó al bloque de cobertura, que
  // es donde se decide si alcanza. El titular es para lo que se mira primero.
  //
  // EL RÓTULO Y SU DEFINICIÓN VIVEN EN LA MISMA CELDA, separados por un salto de línea, y son
  // FÓRMULAS: la fecha del piso y la del cierre del mes cambian solas. Un pie escrito a mano con una
  // fecha adentro es un número pegado que envejece sin avisar.
  const fTitulos = push(['@ROT1', '', '@ROT2', '', '@ROT3'])
  const fCifras = push(['@TOTAL', '', '@PISO', '', '@FINDEMES'])

  // ── 2 · DISPONIBILIDADES ────────────────────────────────────────────────────────────────────────
  //
  // EL VOCABULARIO ES EL DE UN ESTADO DE LIQUIDEZ, no el de una conversación: DISPONIBILIDADES, no
  // "la plata que hay". El día que este cuadro lo mire un banco o un contador, tiene que entenderse solo.
  push(['1 · DISPONIBILIDADES POR CUENTA', '', '', '', '',
    rotuloAlDia('Extracto', refs.bancoRaw ? formulaFechaCorte(refs.bancoRaw).slice(1) : '0')])
  const cab1 = push(['Cuenta', 'Moneda', 'En su moneda', 'Tipo de cambio', 'Saldo en pesos', 'Fecha del saldo'])
  const d0 = filas.length + 1
  const amarillas = []
  let fBancoPesos = 0
  // LA FILA DE LA CARTERA SE GUARDA POR NOMBRE, NO SE DEDUCE DE LA POSICIÓN. Antes la alerta de echeqs
  // restaba "la última fila del bloque", que era la cartera sólo porque estaba última; el día que se
  // agregó otra fila, empezó a restar cero y mostró $30.000.000 de cheques entregados siendo $20.000.000.
  let fCartera = 0
  for (const c of CUENTAS) {
    const f = filas.length + 1
    if (c.banco === 'saldoPesos') fBancoPesos = f
    if (c.banco === 'cartera') fCartera = f
    if (!c.formula && !c.banco) amarillas.push(f)
    push([
      c.nombre,
      c.moneda,
      // EL SALDO DEL BANCO ES UNA FÓRMULA CONTRA LA RÉPLICA DEL EXTRACTO, NO UN NÚMERO PEGADO: un saldo
      // pegado sólo cambia cuando corre el agente, y encima calla si la réplica se actualizó y el
      // código no. Si la réplica no existe todavía, cae al número declarado: mejor un dato viejo
      // declarado que un #REF! que rompe el total y los dos cash flow que lo leen.
      c.banco === 'saldoPesos' && refs.bancoRaw ? formulaUltimoSaldo(refs.bancoRaw)
        : c.banco === 'cartera' ? '@CARTERA'
          : c.banco ? saldoDeBanco(c) : (c.formula ?? previo(c.nombre, 'saldo')),
      // El tipo de cambio se muestra sólo si hay algo que convertir: una cotización al lado de una
      // celda vacía es ruido que se lee como si hubiera un saldo.
      c.moneda === 'USD' ? `=IF(ISNUMBER(${C_IMP}${f});${RANGO_TC};"")` : '',
      `=IF(${C_IMP}${f}="";"";${C_IMP}${f}*IF(${C_TC}${f}="";1;${C_TC}${f}))`,
      // ═══ CADA CUENTA SE FECHA CON SU PROPIA FUENTE ═══
      //
      // El dueño, tres veces: *"aún noto desactualizadas las fechas"*. El defecto no era que estuvieran
      // viejas: TRES cuentas se fechaban con la fuente de OTRA. Las cajas decían =TODAY() —que afirma
      // que contaste el cajón hoy y deja la alarma de antigüedad clavada en 0 días— y "Valores a
      // depositar" usaba la fecha de corte del EXTRACTO, que no sabe nada de cheques que no entraron.
      c.banco === 'saldoPesos' && refs.bancoRaw ? formulaFechaCorte(refs.bancoRaw)
        : c.banco === 'cartera' ? '=TODAY()'
          : c.banco ? BANCO.CORTE
            : c.arqueo ? `=IF(ISNUMBER(${c.arqueo});${c.arqueo};"")`
              : (c.formula ? '=TODAY()' : previo(c.nombre, 'fecha')),
      // LA ANTIGÜEDAD NO SE ESCRIBE, SE PINTA. Era una columna de texto ("1 días", "⚠ 14 días") y fue
      // parte de lo que el dueño mandó a sacar. El dato importa —un saldo de hace catorce días no vale
      // lo mismo que el de hoy— pero ya está en la fecha de al lado: alcanza con que la fecha vieja se
      // vea distinta. Lo hace el formato condicional en `caja-pestana.mjs` y no gasta ni una columna.
    ])
  }
  // ═══ LA LÍNEA QUE HACE QUE LA CAJA SE MUEVA ═══
  //
  // El dueño: *"no se ajustan los saldos en caja a medida que toco cobranzas"*. Era estructural: el
  // saldo del banco es una foto del extracto a SU fecha de corte y todo lo que pasa después no existía
  // en la pestaña. Esta fila es la ventana que el extracto no cubre, así que suma al total sin duplicar
  // nada. Es NETA a propósito: con un solo lado la caja crecería y nunca bajaría.
  //
  // SUS CUATRO SUMANDOS SE FUERON A `_CAJA_ANEXO`: son el desglose de este número, no cuentas, y
  // leídos entre las cinco cuentas y el total eran la mitad del ruido de este bloque.
  const fPost = fBancoPesos && refs.bancoRaw ? filas.length + 1 : 0
  if (fPost) {
    push(['Movimientos posteriores al corte', 'ARS',
      formulaNetaPosterior(`$F$${fBancoPesos}`), '', `=${C_IMP}${fPost}`, '=TODAY()'])
  }
  const d1 = filas.length

  // ═══ Y ACÁ LLEGA EL EFECTIVO A LA CELDA QUE EL DUEÑO MIRA ═══
  //
  // El dueño: *"se realiza una cobranza marcada como 'efectivo', ese valor tiene q cargarse en 'caja'
  // directamente. ahora lo suma pero no carga en la celda de 'caja en pesos' como corresponde"*. La
  // columna de origen pasa a ser el saldo VIVO —arqueo declarado más lo que se movió desde entonces—
  // y la de pesos lo valúa como cualquier otra cuenta. El neto lo calcula el anexo y se cita POR
  // NOMBRE: es el único sumando de esta pestaña que vive afuera, y por eso tiene nombre propio.
  filas[d0 - 1][2] = `=N(${DESDE_CAJA.arqueoArs})+N(${ANEXO.efectivoNeto})`
  // LA FECHA ES LA DEL ARQUEO, NO HOY: un conteo fechado hoy afirma que se contó hoy, sea cierto o no,
  // y deja la única fila que sólo cambia cuando una persona abre el cajón sin poder avisar de vieja.
  filas[d0 - 1][5] = `=IF(ISNUMBER(${DESDE_CAJA.arqueoArsFecha});${DESDE_CAJA.arqueoArsFecha};"")`
  filas[d0 - 1][4] = saldoEnPesos(d0)
  // Y LO MISMO PARA EL CAJÓN EN DÓLARES: sin esto, U$S 15.000 cobrados en efectivo entraban al cajón
  // de PESOS como $15.000 — el importe correcto en la moneda equivocada, que no da error.
  const dUsd = filas.findIndex((f) => /^caja en d[oó]lares/i.test(String(f?.[0] ?? '').trim())) + 1
  if (dUsd) {
    filas[dUsd - 1][2] = `=N(${DESDE_CAJA.arqueoUsd})+IF(NOT(ISNUMBER(${DESDE_CAJA.arqueoUsdFecha}));0;${formulaCobrosUsdEfectivoPosteriores(DESDE_CAJA.arqueoUsdFecha)})`
    filas[dUsd - 1][3] = `=IF(ISNUMBER(C${dUsd});${RANGO_TC};"")`
    filas[dUsd - 1][4] = saldoEnPesos(dUsd)
    filas[dUsd - 1][5] = `=IF(ISNUMBER(${DESDE_CAJA.arqueoUsdFecha});${DESDE_CAJA.arqueoUsdFecha};"")`
  }

  // PERCIBIDO: el total excluye los Valores a depositar (echeq en custodia, sin acreditar). No son caja
  // de hoy — entran en el calendario cuando se acreditan. Es también el "Efectivo al inicio" que usan
  // los dos cash flow, y su fecha es la MÁS RECIENTE del bloque: el monto y su fecha viven en la misma
  // fila porque separarlos ya dejó las dos líneas más importantes del cuadro vacías los doce meses.
  const fTotal = push(['⇒ Total disponibilidades — criterio percibido', '', '', '',
    `=SUM(${C_PESOS}${d0}:${C_PESOS}${d1})${fCartera ? `-${C_PESOS}${fCartera}` : ''}`,
    `=IFERROR(MAX($F$${d0}:$F$${d1});"")`])
  // PERCIBIDO OTRA VEZ: la disponibilidad de hoy NO resta los cheques emitidos, porque un cheque
  // librado que el banco todavía no debitó NO salió de la cuenta. Que no se reste es correcto; que no
  // se DIGA es lo que hacía desconfiar —"Total" y "Disponibilidad neta" daban el mismo número con esta
  // línea en el medio—. El rótulo ahora lo dice y la fila memo no suma.
  const fCh = push(['Cheques emitidos sin debitar ‖ no restan acá', 'ARS',
    '', '',
    `=SUMPRODUCT((UPPER('${refs.cheques}'!$K$2:$K$400)<>"SI")*IF(ISNUMBER('${refs.cheques}'!$F$2:$F$400);'${refs.cheques}'!$F$2:$F$400;0))`])

  // ── 3 · EL ARQUEO ───────────────────────────────────────────────────────────────────────────────
  //
  // ES LA ÚNICA CELDA DE CAPTURA DE LA PESTAÑA: acá el dueño TIPEA y todo lo demás son fórmulas. Estuvo
  // último, después de nueve bloques de conciliaciones, así que para registrar un conteo había que
  // bajar por todo el anexo — y la fecha del arqueo es el ancla de la que cuelga TODO el efectivo del
  // bloque 1 (sin ella la caja física vale $0 por diseño).
  //
  // EL CONTEO VIAJA CON SU BLOQUE, NO SE QUEDA EN LA FILA. Hasta el 03/08 estas celdas salían ausentes
  // ("que la fusión preserve lo que tipeó"), y eso sólo es cierto MIENTRAS EL BLOQUE NO SE MUEVE: la
  // fusión preserva por POSICIÓN. Una corrida metió cuatro filas arriba, el bloque bajó, el conteo se
  // quedó en la fila vieja y los rangos con nombre se republicaron en una celda vacía: la caja física
  // ($39,28M) se fue a cero sin un solo #ERROR. Ahora se RE-EMITE en su fila nueva desde lo que se leyó
  // al empezar; si no se pudo leer nada, vuelve a salir AJENA — sin dato no se sobrescribe.
  // ═══ EL AVISO MIRA EL IMPORTE, NO LA FECHA (05/08) ═══
  //
  // Primero condicionaba el aviso a que hubiera FECHA de conteo, y la corrida real lo desmintió: el
  // dueño había cargado $12.000.000 y U$S 15.600 sin fechar el conteo. El título gritaba "⚠ SIN
  // ARQUEO: LA CAJA FÍSICA VALE $0" arriba de dos celdas con plata adentro, que además ya estaba
  // sumada al total. Un aviso que contradice la fila de al lado destruye la confianza en las dos.
  //
  // Lo que hace que la caja física valga $0 es que NO HAYA IMPORTE. La falta de fecha es otra cosa —el
  // conteo no se puede envejecer— y se dice como lo que es, sin negar el dato que sí está.
  const fArq0 = push([`=IF(N(${DESDE_CAJA.arqueoArs})+N(${DESDE_CAJA.arqueoUsd})=0;"2 · ARQUEO DE LA CAJA FÍSICA — ⚠ SIN CONTEO CARGADO: LA CAJA FÍSICA VALE $0";IF(ISNUMBER(${DESDE_CAJA.arqueoArsFecha});"2 · ARQUEO DE LA CAJA FÍSICA — SE CARGA A MANO";"2 · ARQUEO DE LA CAJA FÍSICA — SE CARGA A MANO · ⚠ falta la fecha del conteo"))`,
    '', '', '', '',
    `=IF(ISNUMBER(${DESDE_CAJA.arqueoArsFecha});${DESDE_CAJA.arqueoArsFecha};"")`])
  const suyoOAusente = (rot, campo) => { const v = previo(rot, campo); return v === '' || v === null || v === undefined ? AJENA : v }
  const arq = (rot, mon) => [rot, mon, suyoOAusente(rot, 'saldo'), AJENA, AJENA, suyoOAusente(rot, 'fecha'), AJENA]
  const fArqArs = push(arq('Caja en pesos — contado', 'ARS'))
  const fArqUsd = push(arq('Caja en dólares — contado', 'USD'))
  const fArq1 = filas.length

  // ── 4 · EL CALENDARIO ───────────────────────────────────────────────────────────────────────────
  //
  // ES UNA ESCALERA DE VENCIMIENTOS (maturity ladder), que es como un banco mira su liquidez: cada
  // tramo dice qué entra, qué sale, cuál es el neto y —lo que la hace útil— con cuánta plata queda la
  // empresa DESPUÉS. La pregunta no es "cuánto debo" sino "en qué semana me quedo corto".
  push(['3 · CALENDARIO — EN QUÉ SEMANA ME QUEDO CORTO', '', '', '', '',
    `=IF(ISNUMBER(${DESDE_CAJA.fecha});${DESDE_CAJA.fecha};"")`])
  const resolutor = (k) => resolutorDeTramo(k, refs.filasCal)
  // LA COLUMNA "SALE" ES EL CUADRO DEL CASH FLOW, CORTADO POR TRAMO. Hasta el 04/08 este calendario
  // tenía su PROPIA lista de egresos y el cash flow otra: dos listas de la misma plata clasificadas por
  // ejes distintos daban $41.704.351 de desacuerdo sobre el mismo mes, y el que veía de MENOS era el
  // que produce el PISO. Por construcción ya no pueden discrepar en QUÉ cuentan, sólo en CUÁNDO — que
  // es la pregunta que este calendario existe para contestar. Y falla cerrado: una línea del cuadro que
  // no se sepa resolver rompe el generador en vez de desaparecer en silencio.
  const saleDelTramo = (k) => `=${expresionSaleEnVentana(desdeTramo(k), hastaTramo(k), resolutor(k))}`

  // ═══ SE FUE LA COLUMNA "NETO DEL TRAMO" (05/08) ═══
  //
  // Era `=C−D`: una resta que el lector hace solo y que ocupaba la columna del resultado. Peor: dejaba
  // el número que SÍ decide —con cuánta plata quedo— desplazado a la F, la columna de las fechas. Con
  // el neto afuera, "Queda después" ocupa la E y la escalera se lee de un vistazo bajando por una sola
  // columna, que es la única forma de contestar *¿en qué semana me quedo corto?* sin sumar mentalmente.
  push(['Tramo', '', 'Entra', 'Sale', 'Queda después', 'Hasta'])
  const cal0 = filas.length + 1
  // EL TRAMO QUE CIERRA EL MES, ANCLADO A SU RÓTULO Y NO A SU POSICIÓN: si mañana se agrega un tramo
  // intermedio, `cal0 + 3` apuntaría a otra cosa y el titular mentiría sin romper ninguna suma.
  let fFinMes = 0
  BORDES.forEach(([rotulo], k) => {
    const f = cal0 + k
    if (rotulo === 'Resto de este mes') fFinMes = f
    push([rotulo, '', `@ENTRA${k}`, saleDelTramo(k),
      // La posición acumulada arranca en la disponibilidad: de nada sirve un neto de tramo si no se ve
      // contra la plata que hay.
      k === 0 ? `=${DESDE_CAJA.total}+$C${f}-$D${f}` : `=$E${f - 1}+$C${f}-$D${f}`,
      // LA FECHA DEL BORDE ES UNA FECHA, NO UN TEXTO "dd/mm". Escrita como texto no se podía comparar,
      // ni ordenar, ni alinear con las otras fechas de la pestaña — y la columna F ahora es la columna
      // de las fechas de toda CAJA. El último tramo no tiene borde: es "de acá en adelante".
      BORDES[k][1] ? `=${BORDES[k][1]}` : ''])
  })
  const cal1 = filas.length
  const calTotal = push(['⇒ Total del horizonte', '', `=SUM($C${cal0}:$C${cal1})`, `=SUM($D${cal0}:$D${cal1})`,
    `=$E${cal1}`, ''])

  // ═══ ENTRE QUÉ Y QUÉ ESTÁ PARADO EL PISO ═══
  //
  // El punto más bajo se calcula con lo que se PUEDE AFIRMAR: el término de cheques suma sólo los
  // marcados "FALTA la factura". Pero hay dos grupos cuya cobertura NO se sabe —los sin N° de
  // comprobante y los que el OS todavía no miró— y con el piso solo esa ignorancia se lee como certeza.
  // Es el número con el que se decide cuánta plata se inmoviliza: no puede publicarse sin su banda.
  //
  // LA PUNTA DE ABAJO ES EXACTA, NO EL PISO MENOS UN TOTAL: se recalcula el MÍNIMO restando en cada
  // tramo lo incierto ACUMULADO hasta ese borde. Restarle al piso el total de lo incierto habría estado
  // mal en cuanto el punto más bajo no fuera el último tramo — le cargaría plata que sale después.
  //
  // ERAN OCHO RENGLONES Y AHORA SON DOS. Los seis que se fueron (los tres del riesgo de cobertura, el
  // declarado de ya debitados, los conceptos sin fuente y los cheques sin fecha) están enteros en
  // `_CAJA_ANEXO` bloque A8, y su veredicto está en el bloque 6 de acá.
  const fPeor = push(['@ROTPISO', '',
    '',
    // LO QUE PODRÍA SALIR DE MÁS, en la columna de lo que SALE: es exactamente eso. La punta de abajo
    // de la banda es E−D, así que el lector no tiene que creer en un tercer número que no puede atar.
    `=$E${filas.length + 1}-MIN(${BORDES.map((_, k) => `$E${cal0 + k}-(${inciertoHasta(hastaTramo(k), DESDE_SIEMPRE)})`).join(';')})`,
    `=MIN($E${cal0}:$E${cal1})`,
    `=IFERROR(INDEX($F$${cal0}:$F$${cal1};MATCH(MIN($E$${cal0}:$E$${cal1});$E$${cal0}:$E$${cal1};0));"")`])
  // ═══ PREVISTO CONTRA REAL — LA VARIANZA, EN LA PRIMERA PANTALLA ═══
  //
  // Es KPI de primer orden en cualquier tesorería y en este archivo no existía en ninguna parte. La
  // versión honesta que el Sheet PUEDE sostener es ésta: el tramo VENCIDO es, por definición, lo que
  // estaba previsto para una fecha que ya pasó. Lo que sigue ahí es el desvío — plata que se esperaba
  // mover y no se movió, o que se movió y nadie marcó.
  //
  // LO QUE ESTA LÍNEA NO ES, dicho antes de que se lo crea nadie: no compara el forecast de la semana
  // pasada contra el real de ésta. Esa comparación necesita las predicciones congeladas de
  // `public.finanzas_caja_negra` replicadas en el archivo, y esa réplica hoy no existe. Sin ella, un
  // "previsto" escrito acá sería un número inventado.
  push([`=IF(N(${ANEXO.vencidoSinConciliar})=0;"· previsto contra real — al día: no quedó nada vencido sin marcar";"· previsto contra real — venció y sigue sin marcarse como cobrado o pagado")`,
    '', '', '', `=N(${ANEXO.vencidoSinConciliar})`, ''])
  const calFin = filas.length

  // ── 5 · ¿ALCANZA? ───────────────────────────────────────────────────────────────────────────────
  //
  // El calendario contesta CUÁNDO. Falta la pregunta que el tesorero hace después y que decide si hay
  // que salir a cobrar o a pedir plata: ¿ALCANZA? Es el indicador `(caja + cobranzas comprometidas) /
  // obligaciones del período`. Los dos lados salen de las MISMAS expresiones que arma el calendario:
  // una segunda definición de "obligaciones" es exactamente lo que costó los $41,7M.
  //
  // 30/60/90 Y NO LOS TRAMOS DEL CALENDARIO, a propósito: son los horizontes con los que se negocia con
  // un banco y con un proveedor, y no se mueven con el almanaque. Las tres ventanas ARRANCAN en el
  // corte del extracto, así que lo ya vencido pesa en las tres: una obligación atrasada no deja de
  // existir porque pasó su fecha.
  // ═══ SE MIDE EN PESOS, NO EN VECES (05/08) ═══
  //
  // La columna publicaba "2,89 ×" y era el otro lugar donde la pestaña dejaba de contestar la pregunta
  // del dueño. Él la hizo así, textual: *"¿cuánto me va a quedar a fin de mes al cubrir todas las
  // obligaciones?"*. La respuesta a eso es una cifra en pesos, no un múltiplo — y encima el múltiplo
  // obligaba a una columna de más, porque el sobrante en pesos no estaba en ninguna parte. Ahora la E
  // dice CUÁNTO SOBRA, que es lo que se decide, y si sobra menos que cero se ve solo: es negativo.
  const fCob0 = push(['4 · ¿ALCANZA? — CUÁNTO SOBRA DESPUÉS DE PAGAR'])
  push(['Horizonte', '', 'Caja + cobranzas', 'Obligaciones', 'Sobra', 'Hasta'])
  const fCobDesde = filas.length + 1
  for (const dias of [30, 60, 90]) {
    const f = filas.length + 1
    const hasta = `TODAY()+${dias}`
    push([`A ${dias} días`, '',
      // `.slice(1)` porque formulaCarteraTramo devuelve la fórmula con su "=" y acá es un sumando.
      `=${DESDE_CAJA.total}+${formulaCarteraTramo(null, hasta).slice(1)}+${cobranzasEsperadasTramo(null, hasta)}`,
      `=${expresionSaleEnVentana(PISO_CAJA, hasta, resolutor(0))}`,
      `=$C${f}-$D${f}`,
      `=${hasta}`])
  }
  const fCobHasta = filas.length
  // EL CRÉDITO NO ES EFECTIVO, y por eso está DEBAJO de la cobertura y no al lado de un saldo. NIC 7
  // clasifica el uso del descubierto como actividad de FINANCIACIÓN; una línea no girada no es un
  // activo de ninguna manera: es un compromiso del banco. El desglose —cupo, consumos, cuotas y lo que
  // cuesta el descubierto por día— vive en `_CAJA_ANEXO` A3.
  const fCredito = push([`=IF(N(${ANEXO.diasDeCaja})=0;"Crédito disponible sin usar ‖ NO es efectivo";"Crédito disponible sin usar ‖ NO es efectivo · alcanza para "&TEXT(N(${ANEXO.diasDeCaja});"0")&" días de caja")`,
    'ARS', '', '', `=N(${ANEXO.aire})`, ''])
  // ═══ LO COLOCABLE BAJÓ ACÁ DESDE EL TITULAR ═══
  //
  // Es el piso MENOS la reserva operativa: el techo real de lo que se puede inmovilizar en un plazo
  // fijo o una caución. Estaba arriba ocupando un cuarto del titular y mostrando un pedido de
  // configuración en vez de un número. Acá abajo está donde se decide —al lado de "¿alcanza?"— y el
  // día que la caja mínima no esté cargada, lo dice esta línea sola en vez de la primera pantalla.
  //
  // MAX(0;…) y no la resta cruda: si el piso ya está por debajo del mínimo, lo colocable es CERO, no un
  // número negativo que se leería como "hay que conseguir esto".
  const fColocable = push([`=IF(N(${DESDE_CAJA.minima})<=0;"Colocable a plazo ‖ ⚠ cargá la caja mínima en 01_Valores Iniciales";"Colocable a plazo ‖ el piso menos la reserva operativa de "&TEXT(${DESDE_CAJA.minima};"$#,##0"))`,
    // SIN "ARS" EN LA B: el rótulo de esta fila es largo y desborda libre mientras la celda de al lado
    // esté vacía. Con la moneda puesta se cortaba justo en "…la reserva operativa de", que es donde
    // empieza a decir cuánto. Toda la pestaña es en pesos salvo lo que se marca: la excepción se marca.
    '', '', '',
    `=IF(N(${DESDE_CAJA.minima})<=0;"";MAX(0;$E$${fPeor}-${DESDE_CAJA.minima}))`,
    // Y HASTA CUÁNDO SE PUEDE COLOCAR: la fecha del piso es el vencimiento máximo del instrumento. Sin
    // ella, "colocable $X" invita a un plazo fijo que vence después del día en que hace falta la plata.
    `=$F$${fPeor}`])

  // ── LA CONCENTRACIÓN DE COBRANZA SE FUE DE ACÁ (05/08) ──────────────────────────────────────────
  //
  // El dueño: *"no quiero nada de cobranza en caja, sólo datos de caja"*. Tenía razón y el criterio es
  // más fuerte que la preferencia: CAJA contesta *cuánta plata hay y hasta cuándo alcanza*. De quién
  // depende el cobro es riesgo COMERCIAL — decide otra cosa, se mira en otro momento y la mezcla le
  // roba la primera pantalla al número que sí se decide acá.
  //
  // El ranking por cliente vive en el Cash Flow Semanal, que es el cuadro que proyecta el ingreso, y
  // el detalle por estado en `_CAJA_ANEXO`. No se perdió: cambió de lugar.
  //
  // Lo que SÍ se queda es la cobranza como INSUMO de la cobertura (bloque 4): "¿la caja más lo que
  // voy a cobrar alcanza para lo que tengo que pagar?" es una pregunta de caja, no de cobranza.

  // ── 7 · LOS CONTROLES, EN VEREDICTO ─────────────────────────────────────────────────────────────
  //
  // ERAN SIETE BLOQUES Y SETENTA FILAS. Cada uno sigue existiendo entero en `_CAJA_ANEXO`; acá queda lo
  // único que se decide mirando: si hay algo roto y de qué tamaño. Un cuadro de control que ocupa la
  // mitad de la pestaña deja de leerse — y una alerta que suena siempre le saca crédito a las que sí
  // importan.
  //
  // LAS DOS LÍNEAS AGRUPAN POR LO QUE HAY QUE HACER, no por bloque de origen, porque eso es lo que
  // decide: la primera es plata que no cuadra (hay que buscarla), la segunda es información que falta
  // (hay que cargarla). La columna de la derecha NOMBRA cuál manda, con su monto: sin eso el total
  // agrupado sería exactamente el "número mudo" que este archivo persigue.
  const fCtrl0 = push(['5 · CONTROLES — el detalle en _CAJA_ANEXO'])
  const noCierra = [ANEXO.difEcheq, ANEXO.difConciliacion, ANEXO.efectivoSinExplicar]
  const falta = [ANEXO.vencidoSinConciliar, ANEXO.oficinaSinCanal, ANEXO.chequesSinMarca, ANEXO.chequesSinFecha]
  const suma = (ns) => ns.map((x) => `ABS(N(${x}))`).join('+')
  /** El nombre del peor, con su monto: un total agrupado sin culpable no habilita ninguna acción. */
  const cual = (pares) => pares.reduceRight(
    (acc, [nombre, etiqueta]) => `IF(ABS(N(${nombre}))=@MX;"${etiqueta}: "&TEXT(ABS(N(${nombre}));"$#,##0");${acc})`, '""')
  const veredicto = (pares) => {
    const mx = `MAX(${pares.map(([n]) => `ABS(N(${n}))`).join(';')})`
    return `=IF(${mx}=0;"✓ en cero";${cual(pares).replaceAll('@MX', mx)})`
  }
  // ═══ EL VEREDICTO SE MUDÓ AL RÓTULO, Y EL MONTO A LA COLUMNA DEL MONTO (05/08) ═══
  //
  // El veredicto vivía en la G —"efectivo sin depositar: $2.310.646"— y el total agrupado en la C. Para
  // leer un control había que cruzar la pantalla entera y encima el mismo número aparecía dos veces con
  // dos agregaciones distintas. Ahora el rótulo NOMBRA cuál manda y la E dice cuánto suma el grupo: se
  // lee de izquierda a derecha en una línea, y la E sigue siendo la columna del número que decide.
  //
  // LAS ETIQUETAS SON CORTAS A PROPÓSITO: entran completas en el rótulo. El nombre largo de cada control
  // está en su bloque del anexo, que es donde se va a mirar el detalle.
  push([`=IF(${suma(noCierra)}=0;"· plata que no cierra — ✓ en cero";"· plata que no cierra — hay que ir a buscarla · manda "&${veredicto([[ANEXO.difEcheq, 'echeqs entregados'],
    [ANEXO.difConciliacion, 'CAJA vs Cash Flow'],
    [ANEXO.efectivoSinExplicar, 'efectivo sin depositar']]).slice(1)})`,
  '', '', '', `=${suma(noCierra)}`, ''])
  const fCtrl1 = push([`=IF(${suma(falta)}=0;"· información que falta — ✓ en cero";"· información que falta — hay que cargarla · manda "&${veredicto([[ANEXO.vencidoSinConciliar, 'vencido sin conciliar'],
    [ANEXO.oficinaSinCanal, 'OFICINA sin canal'],
    [ANEXO.chequesSinMarca, 'cheques sin marca'],
    [ANEXO.chequesSinFecha, 'cheques sin fecha']]).slice(1)})`,
  '', '', '', `=${suma(falta)}`, ''])

  // ── EL PANEL SE RESUELVE ACÁ, cuando ya se sabe en qué fila quedó cada total. Son REFERENCIAS, no
  // copias: si el detalle cambia, el titular cambia con él.
  const nl = '&CHAR(10)&'
  const PANEL = {
    '@ROT1': `="CUÁNTO HAY HOY"${nl}"caja y bancos, criterio percibido"`,
    // EL PISO DICE EN QUÉ TRAMO CAE, no sólo cuándo: "cae en Esta semana" es accionable y "12/08" no.
    // Sale del MISMO MATCH que calcula el piso, así que no puede quedar apuntando a otro tramo.
    // OJO CON EL `&`: `nl` YA TERMINA EN UNO. Escrito `${'${nl}'}&IFERROR(...)` produce `&CHAR(10)&&IFERROR`,
    // que no parsea: la celda queda en #ERROR! y la regla de "error en rojo" la pinta de rosa. Es
    // exactamente lo que pasó en la primera corrida real — el titular del piso salió en rojo y parecía
    // un problema de formato condicional heredado. Era un ampersand.
    '@ROT2': `="EL PISO — EL PUNTO MÁS BAJO"${nl}IFERROR("cae en: "&INDEX($A$${cal0}:$A$${cal1};MATCH(MIN($E$${cal0}:$E$${cal1});$E$${cal0}:$E$${cal1};0));"sin calendario")`,
    '@ROT3': `="QUÉ QUEDA A FIN DE MES"${nl}"pagado todo lo que vence hasta el "&TEXT($F$${fFinMes};"dd/mm")`,
    '@TOTAL': `=${C_PESOS}${fTotal}`,
    '@PISO': `=$E$${fPeor}`,
    // La posición acumulada al final del tramo que cubre este mes. NO es una cuenta nueva: es la misma
    // celda "Queda después" que ya calcula el calendario, mostrada donde se decide.
    '@FINDEMES': `=$E$${fFinMes}`,
    // EL RÓTULO DEL PISO DICE LA BANDA, porque el piso solo se lee como certeza y no lo es: hay cheques
    // cuya cobertura no se sabe. La punta de abajo es E−D en esa misma fila, así que el lector puede
    // atarla a lo que ve. Si no hay incertidumbre, la frase no aparece: una banda de ancho cero es ruido.
    '@ROTPISO': `=IF($D$${fPeor}<=0;"· el piso del recorrido";"· el piso del recorrido — puede bajar hasta "&TEXT($E$${fPeor}-$D$${fPeor};"$#,##0")&" si los cheques sin cobertura conocida salen")`,
    // LA CARTERA SALE DE LA FUENTE, NO DEL DETALLE: era `=SUM($C$47:$C$47)` sobre importes pegados, así
    // que entró el cheque 514 y el total siguió en $10.000.000 con $10.290.000 en cartera. Ahora es un
    // SUMIFS de rango abierto sobre `_CHEQUES_RAW`: entra un cheque y lo toma sin que corra nadie.
    '@CARTERA': formulaCartera(),
    // LO QUE ENTRA INCLUYE LAS COBRANZAS ESPERADAS, no sólo la cartera. Proyectar la nómina hasta
    // diciembre del lado que SALE y mirar sólo los cheques del lado que ENTRA daba un "piso" de
    // $727.278 — un número que no es un piso: es "si no entra nada más en cinco meses". No es
    // optimismo, es simetría.
    ...Object.fromEntries(BORDES.map((_, k) => [`@ENTRA${k}`,
      `=${formulaCarteraTramo(k === 0 ? null : BORDES[k - 1][1], BORDES[k][1] || null).slice(1)}`
        + `+${cobranzasEsperadasTramo(k === 0 ? null : BORDES[k - 1][1], BORDES[k][1] || null)}`])),
  }
  for (const f of filas) f.forEach((c, j) => { if (typeof c === 'string' && PANEL[c]) f[j] = PANEL[c] })

  // LAS FILAS DE TOTAL, IDENTIFICADAS POR SU RÓTULO Y NO POR SU POSICIÓN. Son las únicas que llevan el
  // signo "$": un símbolo repetido en ochenta celdas deja de informar.
  const totales = filas.map((f, i) => (/^\s*(⇒|Total|TOTAL)/.test(String(f?.[0] ?? '')) ? i + 1 : 0)).filter(Boolean)
  return {
    filas, totales, usd, amarillas,
    fTitulos, fCifras, d0, d1, cab1, fTotal, fCh, fCartera, fBancoPesos,
    fArq0, fArq1, fArqArs, fArqUsd,
    cal0, cal1, calTotal, calFin, fPeor, fFinMes,
    fCob0, fCobDesde, fCobHasta, fCredito, fColocable, fCtrl0, fCtrl1,
  }
}
