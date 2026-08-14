// UNA FACTURA EMITIDA QUE COBRANZAS NO TIENE — CUÁLES SON DE VERDAD.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO CIERRA (14/08/2026) ═══
//
// El pipeline avisaba, cada dos horas y desde hacía días: *"6 factura(s) emitidas que Cobranzas no
// tiene, $129.499.724"*. Es una cifra que asusta —y tiene que asustar, porque plata facturada con CAE
// que el flujo de cobranzas no sigue es plata que nadie va a reclamar— pero medida contra el archivo
// vivo ese día, de los $129.499.724 sólo $54.625.304,80 eran un agujero. Las otras cuatro facturas
// estaban cargadas:
//
//   · 0001-00000219 · $65.678.419,31 · Quattropani  → en Cobranzas fila 61 con el N° tipeado "219"
//   · 0001-00000053 ·  $9.099.200,00 · ARCOR        → en Cobranzas fila 49 con el N° tipeado "53"
//   · 0001-00000212 ·     $96.800,00 · MACRO        → en Cobranzas fila 58, mismo importe exacto y
//                                                     mismo cliente, pero con OTRO número
//
// LA CAUSA ES UNA ASIMETRÍA, NO UN DESCUIDO. El cruce contra COMPRAS tiene dos pasadas desde el 21/07
// —por número, y por proveedor + importe cuando el número no está cargado— porque 223 filas de
// Compras no tienen número. El cruce contra COBRANZAS tenía UNA sola, y encima la única que la
// planilla no cumple: el dueño tipea el número de factura sin su punto de venta ("219", no
// "0001-00000219"), que es la forma en que lo dice el talonario. `esLlaveUtil` descarta esa llave por
// corta, así que esas filas ni siquiera entraban al conjunto contra el que se compara.
//
// ═══ POR QUÉ TRES BOLSAS Y NO UNA ═══
//
//     UN AVISO QUE SIEMPRE ESTÁ PRENDIDO NO SE LEE, Y CON ÉL DEJA DE LEERSE EL DÍA QUE ES CIERTO.
//
// Es la misma lección que ya costó el registro de decisiones del dueño en este mismo control. Pero
// silenciar las cuatro tampoco sirve: dos son un problema de CARGA (el número está incompleto) y una
// es una CONTRADICCIÓN que sólo puede resolver el dueño (mismo importe, mismo cliente, otro número).
// Meterlas en la misma bolsa que las que faltan de verdad borra tres decisiones distintas.
//
//   sinRastro         ← ni por número, ni por número suelto, ni por importe. ES el agujero.
//   porNumeroSuelto   ← está, con el N° tipeado sin el punto de venta. Se arregla en Cobranzas.
//   porImporte        ← mismo importe exacto bajo OTRO número. Lo decide el dueño: o es la misma
//                       factura mal numerada, o son dos comprobantes distintos por la misma plata.
//
// ═══ LO QUE DELIBERADAMENTE NO HACE ═══
//
// No empareja por importe APROXIMADO. El cruce contra Compras usa 3% de tolerancia porque compara el
// `imp_total` del libro contra un Total que se carga a mano con neto, IVA y ajustes. Acá los dos lados
// salen del mismo comprobante: el importe o es idéntico o son facturas distintas. Con tolerancia, dos
// certificados consecutivos de la misma obra —que se parecen en el monto por construcción— se
// emparejarían entre sí y el agujero se taparía solo.

/** Cuánto puede diferir un importe para seguir siendo LA MISMA plata. Un peso: sólo flotantes. */
export const TOL_PESO = 1

/**
 * NÚCLEO PURO: el último tramo numérico de una llave normalizada.
 *
 * `normComprobante('0001-00000219')` da `'1-219'` y el dueño tipea `'219'`: el número de factura sin
 * su punto de venta. Se compara ese tramo, no la llave entera.
 *
 * SÓLO CUENTA CUANDO EL LADO DE LA PLANILLA TRAE UN SOLO TRAMO. Si Cobranzas trae `'1-219'` ya se
 * emparejó por la llave buena, y aceptar el tramo suelto ahí abriría la puerta a que `'2-219'`
 * (otro punto de venta) se cruce contra `'1-219'`. La empresa factura por un solo punto de venta —el
 * 0001— pero eso es un hecho de hoy, no una garantía, y este archivo no puede depender de él.
 *
 * @param {string} llave ya normalizada ("1-219")
 * @returns {string} el tramo final ("219"), o '' si no hay
 */
export const numeroSuelto = (llave) => String(llave ?? '').split('-').filter(Boolean).pop() ?? ''

/**
 * NÚCLEO PURO: separar las facturas emitidas que Cobranzas no tiene, por QUÉ no las tiene.
 *
 * @param {Array<{comprobante:string, llave:string, importe:number}>} emitidas las de ARCA que la
 *   primera pasada (por llave) no encontró. `llave` viene ya normalizada por el llamador.
 * @param {Array<{fila:number, llave:string, importe:number}>} filasCobranzas las filas de Cobranzas
 *   con algo cargado, con su llave ya normalizada (aunque sea corta: acá SÍ sirve).
 * @returns {{sinRastro:Array, porNumeroSuelto:Array, porImporte:Array}}
 */
export function clasificarVentasSinCobranza(emitidas = [], filasCobranzas = []) {
  const sinRastro = []; const porNumeroSuelto = []; const porImporte = []
  // CADA FILA DE COBRANZAS SE CONSUME UNA SOLA VEZ, igual que en `cruzar`. Sin esto, dos facturas del
  // mismo importe se emparejan las dos contra la misma fila y el faltante vuelve a mentir — ahora
  // hacia abajo, que es el lado peligroso: un agujero tapado no se ve nunca.
  const usadas = new Set()
  for (const e of emitidas) {
    const suelto = numeroSuelto(e?.llave)
    const porNum = suelto && filasCobranzas.find((c) => !usadas.has(c.fila)
      // El lado de la planilla tiene que traer UN SOLO tramo: ver `numeroSuelto`.
      && !String(c.llave ?? '').includes('-') && String(c.llave ?? '') === suelto)
    if (porNum) { usadas.add(porNum.fila); porNumeroSuelto.push({ ...e, fila: porNum.fila }); continue }
    const monto = Number(e?.importe) || 0
    const porImp = filasCobranzas.find((c) => !usadas.has(c.fila)
      && Math.abs((Number(c.importe) || 0) - monto) <= TOL_PESO)
    if (porImp) { usadas.add(porImp.fila); porImporte.push({ ...e, fila: porImp.fila, llaveEnCobranzas: porImp.llave }); continue }
    sinRastro.push(e)
  }
  return { sinRastro, porNumeroSuelto, porImporte }
}
