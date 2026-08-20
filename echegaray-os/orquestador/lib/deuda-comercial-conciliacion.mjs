// LA DEUDA COMERCIAL SE CALCULA EN DOS LADOS. ACÁ SE DECIDE CUÁL MANDA Y SE MIDE LA DIFERENCIA.
//
// ═══ EL DEFECTO, MEDIDO (17/08/2026) ═══
//
// `auditar-conexion-flujo.mjs`: *"SIN DUEÑO Y LEÍDA · Proveedores · la lee: Materiales"* y lo mismo
// al revés. `Proveedores` y `Materiales` se leen SÓLO entre ellas: un circuito cerrado que no llega
// ni a CAJA ni a ninguno de los dos Cash Flow. Mientras tanto, la tarjeta "DEUDA ATRASADA Y DEL MES"
// vuelve a armar lo que se debe desde `_MOVIMIENTOS`, por otro camino y desde el mismo origen.
//
//   Proveedores!B11                 $12.497.040 · 17 facturas
//   componente comercial del libro  $13.678.022 · 13 filas
//   diferencia NETA                  $1.180.982   ← 9%: se lee como un redondeo
//   diferencia BRUTA                $18.300.332   ← 15 veces más
//   filas que las dos ven igual      3 de 27
//
// ═══ Y LO QUE LA DESCOMPOSICIÓN ENCONTRÓ ADENTRO — EL 68% DE LA DEUDA PUBLICADA COMO PRESUPUESTO ═══
//
// El neto chico era una casualidad de dos conjuntos que casi no se tocan. Abierto fila por fila:
//
//   3 facturas VENCIDAS       $3.937.365  las dos fuentes las ven igual. Es TODO lo que coincide.
//   14 facturas DEL MES       $8.559.675  el libro las tiene como PROYECTADO → la tarjeta las publica
//                                         como PLAN DE GASTO, no como deuda.
//   10 facturas ya pagadas    $9.740.657  con cheque/echeq sin debitar: el libro sí, Proveedores no.
//
// La causa está en una línea: `estadoDeEgreso` devuelve `PROYECTADO` para TODA compra no pagada, y
// `estadoContraCorte` sólo la asciende a `VENCIDO` cuando la fecha ya pasó. Entonces `PROYECTADO`
// significa dos cosas a la vez: *"materiales estimados que nadie debe"* y *"factura de Alumetal
// 0038-00025942 por $2.014.940,07 con echeq al 31/08"*. El 16/08 se sacó `PROYECTADO` de la tarjeta
// de deuda —con razón: adentro había "Estructura esperada" y "Recurrente esperado · Movistar"— y en
// el mismo movimiento se fueron catorce facturas reales.
//
// El rótulo dice "DEUDA ATRASADA Y DEL MES" y de la comercial DEL MES no hay nada: sólo la atrasada.
//
// ═══ LA DECISIÓN: NO SON EL MISMO CONCEPTO, Y POR ESO LA FUENTE ÚNICA NO ES "UNA DE LAS DOS GANA" ═══
//
// La primera lectura —dos cálculos del mismo número, hay que borrar uno— es falsa, y borrar el que
// sobra habría destruido información. Las dos contestan preguntas distintas:
//
//   Proveedores  ¿LE DEBO ESTA FACTURA AL PROVEEDOR?  Un cheque entregado la cancela: el proveedor ya
//                tiene el instrumento en la mano. Sin techo de fecha: es la posición entera.
//   el libro     ¿ESTA PLATA YA SALIÓ DEL BANCO?      Ese mismo cheque sigue pesando hasta que debita.
//                Con ventana: lo que vence hasta fin de mes.
//
// La factura de Alumetal f671 ($946.981,47, "Pagado" con cheque al 30/08) es deuda cero para el
// proveedor y $946.981,47 de caja reservada. Las dos tienen razón. Lo que estaba mal no era que
// existieran dos números: era que NADIE MEDÍA EL PUENTE entre ellos.
//
// ENTONCES, LA FUENTE PRIMARIA DE LA **DEUDA COMERCIAL** ES `Proveedores` (esto es, la aritmética de
// `deuda-por-tramos.mjs`, que es quien emite la fórmula de `Compras!AL`), por tres razones medidas:
//
//   1. Es la única que lee las columnas de pago parcial completas: `O − T − max(U;0) − max(W;0)`. El
//      libro usa `pendienteDeCompra` = `O − T` y no mira U ni W. Hoy no cambia ningún peso (las 143
//      filas con U/W positivo están todas "Pagado"), pero son dos definiciones vivas de "cuánto falta
//      de esta factura" y sólo una puede ser la definición.
//   2. Tiene aging y medio de pago cuadrados contra el mismo total (`Proveedores!A13` lo verifica en
//      la propia pestaña), y el libro no.
//   3. Es fórmula viva sobre Compras: se corrige la factura y el número se mueve solo.
//
// Y CAJA **NO PUBLICA DEUDA COMERCIAL**: publica compromiso de caja. Lo que le falta a CAJA no es
// dejar de calcular — es que el componente comercial de su libro se pueda derivar de la fuente
// primaria por una identidad cuyos términos estén todos nombrados. Eso es lo que `conciliar` mide.
//
// ═══ LO QUE ESTE ARCHIVO **NO** HACE, Y ES DELIBERADO ═══
//
// NO ARREGLA LA TARJETA. El arreglo se ve en una línea —partir `PROYECTADO` en dos estados, o hacer
// que la tarjeta de deuda sume las compras comerciales Pendientes aunque estén PROYECTADAS— y sube el
// titular $8.559.675 sobre el número con el que el dueño decide qué paga esta semana. Es efecto
// económico: lo firma él, no un generador. Y ya se corrigió tres veces por creer que el problema era
// la frase; la cuarta no se hace a ciegas.
//
// TAMPOCO CONECTA CAJA A `Proveedores`. La conexión de fuente única exige antes decidir qué hace la
// tarjeta con las 10 facturas pagadas con instrumento sin debitar, que son caja y no son deuda: si
// CAJA leyera `Proveedores!B11` a secas perdería $9.740.657 de plata comprometida. Esa decisión es
// del dueño y el control la deja medida en vez de suponerla.
//
// PASO SIGUIENTE DECLARADO, y está escrito también en `caja-tarjetas.mjs` al lado del criterio que
// incumple —una limitación en el archivo equivocado no vale—:
//
//   1. separar en el libro la compra CARGADA Y NO PAGADA del gasto ESTIMADO. Hoy comparten estado.
//   2. con eso hecho, la tarjeta de deuda vuelve a poder sumar la deuda comercial del mes.
//   3. recién entonces tiene sentido preguntarse si CAJA lee `Proveedores` o `Proveedores` cuelga del
//      libro. Antes, cualquiera de las dos conexiones propaga el mismo error más rápido.

import { columnasDeCompras, estaPagada } from './libro-extractores-compras.mjs'
import { COL, esComercial, clasificar, saldoDeLaFila } from './deuda-por-tramos.mjs'

/** Los estados del libro que son DEUDA. Se importaría de `caja-tarjetas.mjs`, pero ese módulo emite
 *  fórmulas de Sheets y arrastrarlo acá ataría el control a la capa de presentación. */
export const ESTADOS_DEUDA = Object.freeze(['COMPROMETIDO', 'VENCIDO'])

/** La pestaña de origen del componente comercial dentro del libro. */
export const ORIGEN = 'Compras'

/** Un peso de tolerancia: los importes son flotantes y no se compara con cero pelado. */
export const TOL = 1

/**
 * LOS MOTIVOS DE LA DIFERENCIA. La clave se usa en los tests y en el informe; la glosa la lee el
 * dueño. `SIN_CLASIFICAR` existe a propósito: un control que sólo conoce los casos que ya vio se
 * calla justo cuando aparece uno nuevo.
 */
export const MOTIVOS = Object.freeze({
  FALTA_EL_COMPROBANTE: 'FALTA_EL_COMPROBANTE',
  PUBLICADA_COMO_PLAN: 'PUBLICADA_COMO_PLAN',
  SIN_FECHA_DE_CAJA: 'SIN_FECHA_DE_CAJA',
  NO_EMITIDA: 'NO_EMITIDA',
  FECHA_DISTINTA: 'FECHA_DISTINTA',
  PAGADA_SIN_DEBITAR: 'PAGADA_SIN_DEBITAR',
  ARITMETICA: 'ARITMETICA',
  SIN_CLASIFICAR: 'SIN_CLASIFICAR',
})

/**
 * QUÉ SIGNIFICA CADA MOTIVO Y SI HAY ALGO QUE ARREGLAR.
 *
 * `defecto: false` NO es indulgencia: es lo que hace que el control sirva. Un control que grita todos
 * los días sobre una diferencia de criterio correcta deja de leerse en una semana, y entonces tampoco
 * se lee el día que grita por algo real.
 */
export const GLOSA = Object.freeze({
  [MOTIVOS.FALTA_EL_COMPROBANTE]: {
    defecto: true,
    texto: 'Proveedores la cuenta como deuda y CAJA no puede: la fila no tiene N° de comprobante, '
      + 'y sin ese dato el libro no puede afirmar que hay una factura. SE ARREGLA LLENANDO LA CELDA '
      + '"N° Comprobante" en Compras — no hay nada que tocar en el código.',
  },
  [MOTIVOS.PUBLICADA_COMO_PLAN]: {
    defecto: true,
    texto: 'factura cargada, con comprobante y con vencimiento, que el libro tiene como PROYECTADO. '
      + 'La tarjeta la publica como PLAN DE GASTO y no como deuda: "nadie debe esto" es falso.',
  },
  [MOTIVOS.SIN_FECHA_DE_CAJA]: {
    defecto: true,
    texto: 'deuda comercial viva que el libro NO emite: la columna "Fecha de caja" está vacía. '
      + 'CAJA subdeclara esta plata y nada lo avisa.',
  },
  [MOTIVOS.NO_EMITIDA]: {
    defecto: true,
    texto: 'la factura tiene Fecha de caja dentro de la ventana y aun así el libro no la trae. '
      + 'Alguna regla del extractor se la comió: hay que ir a mirar cuál.',
  },
  [MOTIVOS.FECHA_DISTINTA]: {
    defecto: false,
    texto: 'la fecha prevista de pago y la fecha de caja caen en meses distintos: la misma factura '
      + 'entra en la ventana de una fuente y no en la de la otra. No es plata perdida.',
  },
  [MOTIVOS.PAGADA_SIN_DEBITAR]: {
    defecto: false,
    texto: 'pagada con un instrumento diferido que todavía no debitó. Ya no se le debe al proveedor '
      + '(Proveedores no la cuenta) y la plata no salió del banco (el libro sí). Las dos tienen razón.',
  },
  [MOTIVOS.ARITMETICA]: {
    defecto: true,
    texto: 'las dos fuentes calculan un saldo distinto para LA MISMA factura. Un concepto con dos '
      + 'definiciones vivas: sólo una puede quedar.',
  },
  [MOTIVOS.SIN_CLASIFICAR]: {
    defecto: true,
    texto: 'diferencia que este control no sabe explicar. Mientras no tenga motivo, se mira a mano.',
  },
})

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const txt = (v) => String(v ?? '').trim()
const redondo = (n) => Math.round(n * 100) / 100

/**
 * ¿ESTA FECHA ENTRA EN LA VENTANA?
 *
 * SIN FECHA ENTRA. Es el mismo criterio que `cuotasEnCheque` ya aplica a un cheque sin fecha de pago:
 * *"un compromiso sin fecha no es uno que no vence, es uno que puede vencer mañana"*. Dejarla afuera
 * sería la forma más barata de hacer cerrar el control, escondiendo justo la deuda peor controlada.
 *
 * @param {number} serial 0 o NaN cuando la celda está vacía
 * @param {number} hasta serial EXCLUIDO (mismo criterio `hasta` del repo)
 */
export const enVentana = (serial, hasta) => !(serial > 0) || serial < hasta

/**
 * EL LADO `Proveedores`: la deuda comercial fila por fila, con la aritmética que emite `Compras!AL`.
 *
 * @param {any[][]} compras la pestaña entera, UNFORMATTED_VALUE
 * @param {number} hasta serial excluido; `Infinity` para la posición entera
 * @returns {Map<number, {saldo:number, proveedor:string, fechaPago:number}>} por fila de Compras (1-based)
 */
export function deudaComercial(compras = [], hasta = Infinity) {
  const out = new Map()
  for (let i = 3; i < compras.length; i++) {
    const f = compras[i] ?? []
    if (!txt(f[COL.proveedor]) || !esComercial(f)) continue
    if (clasificar(f) !== 'deuda') continue
    const fechaPago = num(f[COL.fechaPago])
    if (!enVentana(fechaPago, hasta)) continue
    out.set(i + 1, { saldo: redondo(saldoDeLaFila(f)), proveedor: txt(f[COL.proveedor]), fechaPago })
  }
  return out
}

/**
 * EL LADO CAJA: el componente comercial del libro, leído de `_MOVIMIENTOS` PUBLICADO.
 *
 * Se lee el archivo y no se recalcula el extractor a propósito: la evidencia es del EFECTO. Un libro
 * viejo, un paso que dejó de correr o una fila que el generador nunca escribió aparecen acá; contra
 * una segunda corrida del extractor, no aparecerían nunca.
 *
 * Comercial se decide por la MISMA columna que usa `Proveedores` (`AJ · ¿Proveedor comercial? (OS)`),
 * yendo a la fila de Compras que el movimiento declara en su columna `Fila`. Sin ese ida y vuelta
 * habría que decidir por rubro, que es otro criterio y ya serían tres.
 *
 * ═══ POR QUÉ DEVUELVE TAMBIÉN LO QUE **NO** ES DEUDA ═══
 *
 * `fuera` son los mismos egresos comerciales en un estado que la tarjeta de DEUDA no suma —hoy,
 * PROYECTADO—. Sin ese segundo mapa, una factura publicada como plan de gasto se vería idéntica a una
 * que el libro perdió, y son dos problemas distintos con dos arreglos distintos. Un control que no
 * puede separarlos manda a buscar la falla al lugar equivocado.
 *
 * @param {any[][]} movimientos `_MOVIMIENTOS` entera, con su encabezado en la fila 1
 * @param {any[][]} compras
 * @param {number} hasta serial excluido
 * @returns {{deuda:Map<number,{importe:number,estado:string,fecha:number}>, fuera:Map<number,object>}}
 */
export function compromisoComercial(movimientos = [], compras = [], hasta = Infinity) {
  const h = (movimientos[0] ?? []).map((x) => txt(x))
  const ix = (n) => h.indexOf(n)
  const c = { fecha: ix('Fecha'), signo: ix('Signo'), importe: ix('Importe'), estado: ix('Estado'), origen: ix('Origen'), fila: ix('Fila') }
  // FALLA CERRADO. Con un `-1` suelto se leería la columna A como si fuera el importe: un informe
  // plausible y equivocado, que es peor que ninguno.
  const faltan = Object.entries(c).filter(([, v]) => v < 0).map(([k]) => k)
  if (faltan.length) throw new Error(`deuda-comercial: _MOVIMIENTOS no tiene las columnas ${faltan.join(', ')}`)

  const esDeuda = new Set(ESTADOS_DEUDA)
  const deuda = new Map()
  const fuera = new Map()
  for (let i = 1; i < movimientos.length; i++) {
    const m = movimientos[i] ?? []
    if (txt(m[c.origen]) !== ORIGEN) continue
    if (num(m[c.signo]) !== -1) continue
    const estado = txt(m[c.estado])
    // REAL es plata que ya salió del banco: no es deuda ni es plan, y no tiene nada que hacer acá.
    if (estado === 'REAL') continue
    const fecha = num(m[c.fecha])
    if (!enVentana(fecha, hasta)) continue
    // La columna `Fila` puede venir como "636 · cheque 12": una factura partida en cuotas de cheque.
    const fila = Number(txt(m[c.fila]).split('·')[0].trim())
    if (!Number.isFinite(fila) || fila < 4) continue
    if (!esComercial(compras[fila - 1] ?? [])) continue
    const destino = esDeuda.has(estado) ? deuda : fuera
    const prev = destino.get(fila) ?? { importe: 0, estado, fecha }
    prev.importe = redondo(prev.importe + num(m[c.importe]))
    destino.set(fila, prev)
  }
  return { deuda, fuera }
}

/** El motivo de que ESTA fila difiera. Puro: recibe lo que ya se sabe de los dos lados. */
function motivoDe({ f, cols, pv, lv, hasta, comoPlan }) {
  const fechaCaja = num(f[cols.fechaCaja])
  if (lv === 0 && pv > 0) {
    // EL ORDEN IMPORTA: si el libro la tiene como plan, la fecha de caja está bien y el extractor la
    // emitió. Preguntar por la fecha primero contestaría "NO_EMITIDA" sobre una fila que sí se emitió.
    //
    // Y ANTES QUE ESO, EL DATO QUE FALTA. Una fila sin comprobante queda como plan A PROPÓSITO —el
    // libro no inventa una factura que nadie tipeó—, y decirle "PUBLICADA_COMO_PLAN" mandaría a
    // arreglar el código cuando lo que hay que hacer es llenar una celda.
    if (comoPlan) {
      return txt(f[cols.comprobante]) === '' ? MOTIVOS.FALTA_EL_COMPROBANTE : MOTIVOS.PUBLICADA_COMO_PLAN
    }
    if (!(fechaCaja > 0)) return MOTIVOS.SIN_FECHA_DE_CAJA
    if (!enVentana(fechaCaja, hasta)) return MOTIVOS.FECHA_DISTINTA
    return MOTIVOS.NO_EMITIDA
  }
  if (pv === 0 && lv > 0 && estaPagada(f[cols.estado])) return MOTIVOS.PAGADA_SIN_DEBITAR
  if (pv > 0 && lv > 0 && Math.abs(saldoDeLaFila(f) - lv) <= TOL) return MOTIVOS.FECHA_DISTINTA
  if (pv > 0 && lv > 0) return MOTIVOS.ARITMETICA
  return MOTIVOS.SIN_CLASIFICAR
}

/**
 * LA CONCILIACIÓN: las dos fuentes sobre la MISMA ventana, y cada peso de diferencia con su motivo.
 *
 * `residuo` se calcula contra los DOS TOTALES agregados y no contra la suma de las filas: si la
 * descomposición se saltea una, la resta no cierra y el control se pone rojo en vez de mentir prolijo.
 *
 * @param {object} arg
 * @param {any[][]} arg.compras
 * @param {any[][]} arg.movimientos
 * @param {number} arg.hasta serial EXCLUIDO de la ventana
 * @param {number} [arg.publicado] el valor de `Proveedores!B11` leído del archivo, para la fidelidad
 */
export function conciliar({ compras = [], movimientos = [], hasta = Infinity, publicado = null } = {}) {
  const cols = columnasDeCompras(compras)
  const enVent = deudaComercial(compras, hasta)
  const total = deudaComercial(compras, Infinity)
  const { deuda: libro, fuera } = compromisoComercial(movimientos, compras, hasta)

  const suma = (m, k) => redondo([...m.values()].reduce((a, v) => a + v[k], 0))
  const proveedores = { monto: suma(enVent, 'saldo'), n: enVent.size }
  const proveedoresTotal = { monto: suma(total, 'saldo'), n: total.size }
  const componente = { monto: suma(libro, 'importe'), n: libro.size }

  const acum = new Map()
  let bruto = 0
  let enAmbas = 0
  for (const fila of [...new Set([...enVent.keys(), ...libro.keys()])].sort((a, b) => a - b)) {
    const pv = enVent.get(fila)?.saldo ?? 0
    const lv = libro.get(fila)?.importe ?? 0
    const dif = redondo(pv - lv)
    if (Math.abs(dif) <= TOL) { enAmbas++; continue }
    bruto = redondo(bruto + Math.abs(dif))
    const f = compras[fila - 1] ?? []
    const clave = motivoDe({ f, cols, pv, lv, hasta, comoPlan: fuera.has(fila) })
    const m = acum.get(clave) ?? { clave, defecto: GLOSA[clave].defecto, glosa: GLOSA[clave].texto, monto: 0, filas: [] }
    m.monto = redondo(m.monto + dif)
    m.filas.push({
      fila, proveedor: txt(f[COL.proveedor]), comprobante: txt(f[COL.comprobante]),
      estado: txt(f[COL.estado]), fechaPago: num(f[COL.fechaPago]), fechaCaja: num(f[cols.fechaCaja]),
      // El estado que le puso el LIBRO, que es distinto del que dice Compras y es el que decide si la
      // tarjeta la suma. Sin él, el informe manda a mirar la factura cuando el problema está acá.
      estadoLibro: libro.get(fila)?.estado ?? fuera.get(fila)?.estado ?? '—',
      proveedoresDice: pv, libroDice: lv, dif,
    })
    acum.set(clave, m)
  }

  const motivos = [...acum.values()].sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))
  const neto = redondo(proveedores.monto - componente.monto)
  const residuo = redondo(neto - motivos.reduce((a, m) => a + m.monto, 0))

  return {
    hasta,
    proveedores,
    proveedoresTotal,
    libro: componente,
    neto,
    bruto,
    enAmbas,
    motivos,
    residuo,
    // NULL Y NO `true` CUANDO NO SE PUDO COMPARAR: un control que no leyó la celda publicada no puede
    // afirmar que coincide con ella. Falla hacia "no sé", nunca hacia "está bien".
    fiel: publicado === null || publicado === undefined
      ? null
      : Math.abs(num(publicado) - proveedoresTotal.monto) <= TOL,
    publicado: publicado ?? null,
    hayDefecto: motivos.some((m) => m.defecto) || Math.abs(residuo) > TOL,
  }
}
