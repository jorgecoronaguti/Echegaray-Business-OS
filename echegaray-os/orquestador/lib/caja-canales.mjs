// EL CANAL POR EL QUE CADA MÉTODO DE PAGO LLEGA —O NO LLEGA— AL SALDO DE CAJA.
//
// ═══ POR QUÉ EXISTE (06/08/2026) ═══
//
// El dueño pidió verificar que Compras "con sus distintos métodos de pago" y Cobranzas estén
// CONECTADAS a CAJA y produzcan IMPACTO EN LOS SALDOS. La respuesta no es una lista de pestañas: es
// una PARTICIÓN por método. Cada peso que se mueve tiene que caer en exactamente un canal, y los
// canales son cuatro:
//
//     1. el saldo del extracto        · fecha ≤ corte: el banco ya lo publicó
//     2. "Movimientos posteriores al corte" · transferencia y débito con fecha > corte (CMP.tiposBanco)
//     3. el arqueo + ANEXO_EFECTIVO_NETO   · el efectivo, con su propio ancla (la fecha del arqueo)
//     4. el libro, como COMPROMETIDO       · el instrumento diferido que todavía no debitó
//
// Y hay un quinto caso que NO es un canal, es un agujero: un pago que no cae en ninguno. Ése es el
// que este archivo existe para hacer visible.
//
// ═══ EL AGUJERO MEDIDO, QUE ES POR LO QUE ESTO SE ESCRIBIÓ ═══
//
// Medido sobre el archivo vivo el 06/08/2026, con corte del extracto en el serial 46240:
//
//     Compras f671  Alumetal  echeq   $946.981   fecha de caja 46264   Estado "Pagado"
//     Compras f794  FEMENIA   echeq  $1.839.200  fecha de caja 46264   Estado "Pagado"
//     Compras f817  DUPEC     echeq   $469.565   fecha de caja 46242   Estado "Pagado"
//     Compras f815  Hormiserv cheque −$686.070   fecha de caja 46249   (nota de crédito)
//                                     ─────────
//                                     $2.569.676 neto
//
// Esas cuatro filas no estaban en NINGUNA parte del cuadro:
//   · el saldo del banco no las tiene — el extracto termina en el corte y el cheque no debitó;
//   · la línea "Movimientos posteriores al corte" mira SÓLO Transferencia y Débito de Compras, y
//     del lado de los cheques sólo los marcados DEBITADO="SI" (medido: $0 después del corte);
//   · el libro las emitía con estado REAL —porque Compras dice "Pagado"— y CAJA COMPROMETIDA, CAJA
//     PROYECTADA 30 DÍAS y la escalera de vencimientos filtran por COMPROMETIDO/PROYECTADO/VENCIDO:
//     un REAL queda afuera de las tres por diseño, porque se asume que ya está en el saldo.
//
// LA CAUSA RAÍZ es una confusión de significado, no un error de fórmula: **"Pagado" con un cheque no
// quiere decir que la plata salió**. Quiere decir que la obligación se canceló con un instrumento que
// sale de la cuenta EL DÍA QUE SE DEBITA. Entre la firma y el débito, eso es un COMPROMISO — que es
// exactamente lo que `deChequesEmitidos` ya declara para el cheque sin factura ("firmado y entregado
// salió de tus manos, no de tu cuenta"). Las dos puertas tenían que decir lo mismo y decían distinto.
//
// ═══ POR QUÉ LA LISTA DE MEDIOS BANCARIOS SE IMPORTA Y NO SE TIPEA ═══
//
// `CMP.tiposBanco` es lo que la fórmula VIVA de CAJA suma en la línea de posteriores al corte. Si acá
// se tipeara una segunda lista, el día que alguien agregue "Depósito" a la fórmula este archivo
// seguiría diciendo que ese medio no toca el banco, y el veredicto quedaría verde sobre un hueco. Es
// el mismo motivo por el que COL_FECHA_CAJA vive en un solo lado: escritor y lector, una definición.

import { CMP } from './caja-posterior-al-corte.mjs'

/**
 * NÚCLEO PURO: el instrumento con el que se pagó, a partir del texto de "Tipo pago" de Compras.
 *
 * EL ORDEN IMPORTA Y NO ES ARBITRARIO: "Echeq" se pregunta ANTES que "cheque" porque un e-cheque
 * contiene la palabra cheque, y confundirlos manda la fila al canal equivocado. Es el mismo orden que
 * ya usaba `deCompras` en línea; se movió acá para que el extractor y el verificador de conectividad
 * no puedan discrepar sobre qué es cada método.
 *
 * @param {string} tipoPago el texto de la columna P de Compras
 * @returns {'echeq'|'cheque'|'transferencia'|'efectivo'|'tarjeta'|'debito'|'desconocido'}
 */
export function instrumentoDePago(tipoPago) {
  const t = String(tipoPago ?? '').trim().toLowerCase()
  if (/echeq/.test(t)) return 'echeq'
  if (/cheque/.test(t)) return 'cheque'
  if (/transfer/.test(t)) return 'transferencia'
  if (/efectivo/.test(t)) return 'efectivo'
  if (/tarjeta/.test(t)) return 'tarjeta'
  if (/d[eé]bito/.test(t)) return 'debito'
  return 'desconocido'
}

/** Los instrumentos que la línea "Movimientos posteriores al corte" RESTA del banco. Derivados de la
 *  fórmula viva, no tipeados: ver el bloque de arriba. */
export const INSTRUMENTOS_BANCO = Object.freeze(CMP.tiposBanco.map(instrumentoDePago))

/**
 * Los instrumentos que NO salen de la cuenta el día que se registra el pago: el cheque y el e-cheque
 * salen el día que se debitan, y la tarjeta el día que el banco cobra el resumen. Entre una fecha y
 * la otra la plata sigue estando en la cuenta y el compromiso ya existe.
 */
export const INSTRUMENTOS_DIFERIDOS = Object.freeze(['cheque', 'echeq', 'tarjeta'])

/** El efectivo tiene su propio canal y su propia ancla (la fecha del arqueo, no la del extracto). */
export const INSTRUMENTO_EFECTIVO = 'efectivo'

/**
 * NÚCLEO PURO: el estado con el que un pago de Compras entra al libro.
 *
 * LA REGLA, EN UNA ORACIÓN: un pago sólo es REAL si la plata pudo haber salido de verdad. Con
 * transferencia, débito o efectivo eso pasa el mismo día —y las líneas de disponibilidad de CAJA los
 * descuentan—; con un instrumento diferido pasa recién el día del débito.
 *
 * `desconocido` va con los diferidos A PROPÓSITO: si el método no está declarado no se puede afirmar
 * por qué canal salió, y afirmar REAL sobre una fecha futura es presentar una estimación como un
 * hecho. Medido el 06/08: 5 filas de Compras "Pagado" sin tipo de pago por $497.529 (todas con fecha
 * anterior al corte hoy, así que no cambian ningún número — pero la próxima puede no estarlo).
 *
 * SIN CORTE NO SE DECIDE NADA. Si no hay fecha de corte, no existe la ventana "después del corte" y
 * degradar a COMPROMETIDO todo el histórico convertiría años de pagos hechos en compromisos vivos.
 *
 * @param {{instrumento:string, pagado:boolean, fecha:number, corte:number|null}} m
 * @returns {'REAL'|'COMPROMETIDO'|'PROYECTADO'}
 */
export function estadoDeEgreso({ instrumento, pagado, fecha, corte } = {}) {
  if (!pagado) return 'PROYECTADO'
  if (!Number.isFinite(fecha) || !Number.isFinite(corte)) return 'REAL'
  if (fecha <= corte) return 'REAL'
  const diferido = INSTRUMENTOS_DIFERIDOS.includes(instrumento) || instrumento === 'desconocido'
  return diferido ? 'COMPROMETIDO' : 'REAL'
}

/** Los canales, con el nombre de la línea de CAJA que los absorbe. Para el informe, no para decidir. */
export const CANAL = Object.freeze({
  extracto: 'el saldo del banco (el extracto ya lo contiene)',
  posteriores: 'la línea "Movimientos posteriores al corte"',
  efectivo: 'el arqueo + ANEXO_EFECTIVO_NETO (caja física)',
  libro: 'el libro, como COMPROMETIDO/PROYECTADO (escalera y tarjetas)',
  cartera: 'la línea "Valores a depositar" — SI el valor está cargado en _CHEQUES_RAW',
  ninguno: 'NINGUNO — esta plata no está en el saldo ni en la proyección',
})

/**
 * NÚCLEO PURO: EL CONTROL. ¿Qué línea de CAJA absorbe este movimiento?
 *
 * ═══ POR QUÉ ESTO NO SE VALIDA CONTRA LO QUE PRODUCE ═══
 *
 * La cobertura NO se pregunta "¿qué estado le puso el extractor?" y se contesta con el propio
 * extractor. Se cruzan DOS productores independientes:
 *
 *   · del lado del SHEET: qué suman las fórmulas vivas — `CMP.tiposBanco` para la línea de
 *     posteriores, el literal "Efectivo" para la caja física, y la ventana `fecha ≤ corte` para el
 *     saldo del extracto;
 *   · del lado del LIBRO: el estado del movimiento (un COMPROMETIDO/PROYECTADO/VENCIDO lo ve la
 *     escalera; un REAL, no).
 *
 * Un movimiento está cubierto si ALGUNO de los dos lo tiene. Si ninguno lo tiene, es un hueco — y ése
 * es el veredicto que no puede salir de una sola fuente, porque cada fuente por separado se ve bien.
 *
 * @param {{estado:string, instrumento:string, fecha:number, signo?:number, importe?:number}} mov
 * @param {{corte:number|null}} ventana el corte del extracto
 * @returns {{canal:string, cubierto:boolean}}
 */
export function canalDeMovimiento(mov = {}, { corte = null } = {}) {
  const { estado, instrumento, fecha } = mov
  // Lo que no es un hecho lo ve la proyección: la escalera, la tarjeta COMPROMETIDA y el calendario
  // filtran exactamente por estos tres estados.
  if (estado !== 'REAL') return { canal: CANAL.libro, cubierto: true }
  if (!Number.isFinite(fecha) || !Number.isFinite(corte)) return { canal: CANAL.extracto, cubierto: true }
  if (fecha <= corte) return { canal: CANAL.extracto, cubierto: true }
  if (INSTRUMENTOS_BANCO.includes(instrumento)) return { canal: CANAL.posteriores, cubierto: true }
  if (instrumento === INSTRUMENTO_EFECTIVO) return { canal: CANAL.efectivo, cubierto: true }
  // UN VALOR QUE ENTRA NO SE TRATA COMO UNO QUE SALE. Un echeq COBRADO con acreditación posterior al
  // corte no es un hueco del extractor: la línea de cobros lo excluye a propósito porque su canal es
  // "Valores a depositar", y esa línea sale de _CHEQUES_RAW, no de Cobranzas. Declararlo NINGUNO acá
  // sería acusar al diseño; lo que hay que probar es otra cosa —que el valor esté cargado en la
  // réplica de cheques— y eso lo cruza el verificador contra esa otra fuente. Ver `faltanteEnCartera`.
  if (mov.signo === 1) return { canal: CANAL.cartera, cubierto: true }
  return { canal: CANAL.ninguno, cubierto: false }
}

/**
 * NÚCLEO PURO: el veredicto por método, con la plata de cada uno. Es lo que imprime el verificador.
 *
 * El monto es lo que decide: un método "conectado" que mueve $0 y uno desconectado que mueve $40M no
 * se distinguen contando filas. Por eso cada renglón lleva su importe en la ventana viva.
 *
 * @param {Array} movimientos los del libro (deCompras / deCobranzas), ya extraídos
 * @param {{corte:number|null}} ventana
 * @returns {Array<{metodo:string, canal:string, cubierto:boolean, filas:number, monto:number}>}
 */
export function veredictoPorMetodo(movimientos = [], { corte = null } = {}) {
  const acc = new Map()
  for (const m of movimientos) {
    const { canal, cubierto } = canalDeMovimiento(m, { corte })
    const k = `${m.instrumento ?? 'desconocido'}|${canal}`
    const a = acc.get(k) ?? { metodo: m.instrumento ?? 'desconocido', canal, cubierto, filas: 0, monto: 0 }
    a.filas++
    a.monto += (Number(m.importe) || 0) * (Number(m.signo) || 1)
    acc.set(k, a)
  }
  // Los huecos primero: es lo que hay que mirar, no lo que hay que buscar.
  return [...acc.values()].sort((a, b) => (a.cubierto === b.cubierto
    ? Math.abs(b.monto) - Math.abs(a.monto)
    : (a.cubierto ? 1 : -1)))
}

/**
 * NÚCLEO PURO: EL SEGUNDO CONTROL — ¿los valores que se esperan cobrar están cargados en la cartera?
 *
 * ═══ EL DEFECTO QUE ESTO ENCONTRÓ (06/08) ═══
 *
 * `formulaCobrosPosteriores` excluye los echeq del saldo bancario con un argumento explícito: *"un
 * echeq cobrado con fecha de acreditación futura ya está contado en Valores a depositar"*. Esa frase
 * es una PRECONDICIÓN, y nadie la estaba verificando. Medido en el archivo vivo:
 *
 *     Cobranzas f43 y f48 · LA ESTRELLA · echeq · $10.000.000 c/u · acreditan 46249 y 46265
 *     _CHEQUES_RAW "En custodia" con fecha de pago posterior al corte: $0
 *
 * Son los dos echeq que el código conocía como ENDOSADOS a Alumetal — la marca "ENDOSADO A ALUMETAL"
 * vivía en la columna BB de Cobranzas y HOY ESA COLUMNA ESTÁ VACÍA. Sin la marca, el libro los toma
 * como cobros reales; sin el valor en la réplica de cheques, la cartera no los tiene. $20.000.000 que
 * la pestaña espera cobrar y ninguna línea de CAJA muestra.
 *
 * SE CRUZAN DOS FUENTES DISTINTAS a propósito: Cobranzas (lo que se espera) contra _CHEQUES_RAW (los
 * valores que están en la mano). Preguntarle a Cobranzas si Cobranzas está completa no prueba nada.
 *
 * @param {Array} movimientos los del libro
 * @param {number} carteraPosterior total de _CHEQUES_RAW en custodia con fecha de pago > corte
 * @param {{corte:number|null}} ventana
 * @returns {{esperado:number, enCartera:number, falta:number}}
 */
export function faltanteEnCartera(movimientos = [], carteraPosterior = 0, { corte = null } = {}) {
  const esperado = movimientos
    .filter((m) => m.signo === 1 && m.estado === 'REAL' && Number.isFinite(corte) && m.fecha > corte
      && INSTRUMENTOS_DIFERIDOS.includes(m.instrumento))
    .reduce((a, m) => a + (Number(m.importe) || 0), 0)
  return { esperado, enCartera: carteraPosterior, falta: Math.max(0, esperado - carteraPosterior) }
}
