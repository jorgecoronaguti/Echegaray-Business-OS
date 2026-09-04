// LA LIBRE DISPONIBILIDAD DE IVA, PROYECTADA HASTA FIN DE AÑO.
//
// POR QUÉ EXISTE (04/08). El dueño: "faltan proyecciones de gastos, impuestos, cargas sociales está
// todo mal". Medido sobre el Sheet real: en "Impuestos y Financieros" la sección 1 sólo tiene los
// meses con DDJJ F.2051 presentada — enero a julio. De agosto a diciembre las celdas están VACÍAS,
// no en cero. Y el "Cash Flow Mensual" lee esa fila con N(), que convierte una celda vacía en 0 sin
// avisar: el cuadro proyecta $0 de IVA para los últimos cinco meses del año.
//
// LA CAUSA NO ERA UN MODELO FALTANTE, ERA UN CABLE SUELTO. `impuestos-pestana.mjs` calculaba la
// proyección (posicionIvaCompleta) y se la pasaba a `grilla(iva, …)` como primer parámetro — que
// nunca la usa. El resultado se imprimía por consola en --dry y se tiraba. El motor existía, andaba,
// y su salida no llegaba a ninguna celda.
//
// POR QUÉ NO SE REUSÓ posicion-iva.mjs. Son DOS números distintos y confundirlos es el error:
//   · posicion-iva.mjs arrastra el saldo TÉCNICO calculado sobre los comprobantes de ARCA.
//   · esta capacidad arrastra la LIBRE DISPONIBILIDAD que declara la DDJJ F.2051 presentada.
// El saldo técnico a favor queda inmovilizado y no se compensa libremente; la libre disponibilidad
// sí absorbe la posición del mes siguiente. Proyectar el pago en efectivo desde el saldo técnico da
// un número que no es el que la empresa va a pagar. El ancla es la DDJJ, que es fuente primaria.
// La posición técnica de ARCA sigue calculándose, pero como CONTROL INDEPENDIENTE de la DDJJ — no
// como su insumo (un control no se valida contra la información que produce).
//
// TODO LO QUE SALE DE ACÁ ES PROYECCIÓN, NUNCA HECHO. Cada mes proyectado viaja con el texto del
// supuesto del que salió, y el llamador está obligado a mostrarlo: es la diferencia entre un número
// y un número que se puede discutir.

/** El período 'YYYY-MM' del mes N del año. PURA. */
export const periodoDe = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}`

/**
 * ¿Es una alícuota utilizable? Se acepta la fracción (0,21), nunca el porcentaje (21).
 *
 * NO HAY ALÍCUOTA POR DEFECTO, Y ES A PROPÓSITO. La skill de impuestos lo prohíbe: ninguna alícuota
 * se afirma vigente sin verificarla, y el OS no está en condiciones de verificar una norma cada vez
 * que corre un generador. Así que el OS no la afirma: la LEE de un parámetro declarado en el Sheet,
 * que es de quien sí puede firmarla (el dueño con su contador). Si el parámetro no está, esto
 * devuelve false y el generador se niega a proyectar — antes que inventar un 21% enterrado en una
 * fórmula, que es exactamente lo que el dueño pidió que no pasara.
 * PURA.
 */
export function alicuotaValida(a) {
  const n = Number(a)
  return Number.isFinite(n) && n > 0 && n < 1
}

/**
 * El factor que extrae el IVA contenido en un importe BRUTO (con IVA adentro).
 *
 * Las líneas del cash flow son de caja: lo que entra y sale del banco, IVA incluido. El débito y el
 * crédito fiscal se miden sobre el NETO. Con alícuota a, de un bruto B el impuesto es B·a/(1+a) —
 * no B·a, que sobreestima el IVA un 21% y es el error clásico de este cálculo.
 * PURA.
 */
export const factorIvaSobreBruto = (alicuota) => alicuota / (1 + alicuota)

/**
 * NÚCLEO PURO: arrastra la libre disponibilidad mes a mes y dice cuándo se agota.
 *
 * La aritmética es la del propio cuadro, no una invención:
 *   libre disponibilidad del mes = la del mes anterior + crédito fiscal − débito fiscal
 * y cuando esa cuenta da negativo, lo negativo es IVA QUE SE PAGA EN EFECTIVO y el saldo queda en 0.
 * Es la misma regla que las filas 28/29 de la sección de Ingresos Brutos ya aplican desde julio.
 *
 * @param {Array<{periodo:string, debito:number, credito:number, libre_disp?:number}>} reales
 *        los meses con DDJJ presentada (o con período cerrado y comprobantes completos). El último
 *        de la lista aporta el saldo del que arranca la proyección.
 * @param {Array<{periodo:string, base_debito:number, base_credito:number, supuesto:string}>} futuros
 *        los meses a proyectar, con sus BASES EN BRUTO (importes de caja, IVA incluido).
 * @param {number} alicuota fracción (0,21), declarada — nunca por defecto.
 * @returns {Array} un registro por mes, real o proyectado, con `es_proyeccion` y `supuesto`.
 */
export function proyectarLibreDisponibilidad(reales = [], futuros = [], alicuota) {
  if (!alicuotaValida(alicuota)) {
    throw new Error('iva-libre-disponibilidad: alícuota no declarada o fuera de rango (0<a<1). '
      + 'No se proyecta con un número inventado — declarala en Parámetros.')
  }
  const f = factorIvaSobreBruto(alicuota)
  const salida = []
  let saldo = 0
  for (const m of reales) {
    // La libre disponibilidad REAL manda sobre la calculada: la DDJJ ya la trae y es el dato
    // oficial. Recalcularla acá sería producir una segunda versión del mismo número.
    saldo = Number.isFinite(Number(m.libre_disp))
      ? Number(m.libre_disp)
      : Math.max(0, saldo + (Number(m.credito) || 0) - (Number(m.debito) || 0))
    salida.push({ ...m, es_proyeccion: false, libre_disp: saldo })
  }
  for (const m of futuros) {
    const debito = (Number(m.base_debito) || 0) * f
    const credito = (Number(m.base_credito) || 0) * f
    const neto = saldo + credito - debito
    const aPagar = Math.max(0, -neto)
    saldo = Math.max(0, neto)
    salida.push({
      periodo: m.periodo,
      es_proyeccion: true,
      debito,
      credito,
      a_pagar_efectivo: aPagar,
      libre_disp: saldo,
      supuesto: m.supuesto,
    })
  }
  return salida
}

/**
 * El primer mes en que la empresa pasa a pagar IVA en efectivo, o null si no pasa en el horizonte.
 * Es LA pregunta del dueño ("en algún mes cercano la empresa empieza a pagar IVA"), así que tiene
 * nombre propio en vez de quedar escondida dentro de un map del llamador. PURA.
 */
export function mesEnQueSeAgota(proyeccion = []) {
  const m = proyeccion.find((x) => (Number(x.a_pagar_efectivo) || 0) > 0)
  return m ? m.periodo : null
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LAS FÓRMULAS QUE VAN AL SHEET
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// LA PROYECCIÓN SE ESCRIBE COMO FÓRMULA, NO COMO VALOR. Los meses REALES sí van como valor: salen de
// la DDJJ presentada y el número oficial no se recalcula. Pero un mes proyectado se deduce de celdas
// que ya están en este mismo archivo (las cobranzas y las compras que el cash flow ya proyecta), y
// pegarlo como número lo congela: al día siguiente el dueño mueve una cobranza esperada y el IVA
// proyectado se queda con la foto vieja sin que nada avise. Además sería un número pegado más, que
// es lo que este archivo viene sacando de todas las pestañas.
//
// Locale es_AR: separador de argumentos `;`, coma decimal. Nunca comas.

/** El nombre del parámetro de alícuota. Es el contrato con la pestaña Parámetros: una sola vez acá. */
export const RANGO_ALICUOTA_IVA = 'ALICUOTA_IVA'

/** La expresión que extrae el IVA de un importe bruto, con la alícuota tomada del rango con nombre. */
const factorFormula = () => `${RANGO_ALICUOTA_IVA}/(1+${RANGO_ALICUOTA_IVA})`

/**
 * Fórmula del DÉBITO fiscal proyectado de un mes: el IVA contenido en las cobranzas que el cash flow
 * ya da por cobradas o esperadas para ese mes.
 * @param {string[]} celdasBruto celdas del cash flow con la cobranza bruta (ej. ["'Cash Flow Mensual'!I$6"])
 */
export function formulaDebitoProyectado(celdasBruto = []) {
  if (!celdasBruto.length) throw new Error('iva-libre-disponibilidad: sin celdas de cobranza no hay débito que proyectar')
  return `=(${celdasBruto.map((c) => `N(${c})`).join('+')})*${factorFormula()}`
}

/**
 * El débito cuando el IVA no hay que DERIVARLO porque la fuente ya lo declara.
 *
 * Cobranzas escribe el IVA de cada factura en su columna K. Multiplicar eso por
 * `alícuota/(1+alícuota)` lo volvería a convertir, y aplicarle el factor a un importe **neto de
 * retenciones** —que es lo que hacía— mezcla caja con base imponible. Acá se suma y nada más.
 */
export function formulaDebitoDeclarado(terminos = []) {
  if (!terminos.length) throw new Error('iva-libre-disponibilidad: sin términos no hay débito declarado que sumar')
  return `=${terminos.map((t) => `N(${t})`).join('+')}`
}

/**
 * Fórmula del CRÉDITO fiscal proyectado de un mes.
 *
 * OJO CON QUÉ COMPRAS ENTRAN. Sólo las que tienen FACTURA: sin comprobante no hay crédito fiscal que
 * computar. Por eso el llamador NO pasa el total de "Pagos a proveedores" sino sus sub-líneas con
 * factura, y deja afuera "Cheques sin factura cargada" y "Cuotas de tarjeta sin factura cargada" —
 * que el propio cuadro ya nombra como lo que son. Sumarlas inflaría el crédito y haría desaparecer
 * un pago de IVA que sí va a ocurrir.
 * @param {string[]} celdasBruto celdas del cash flow con la compra bruta con factura
 */
export function formulaCreditoProyectado(celdasBruto = []) {
  if (!celdasBruto.length) throw new Error('iva-libre-disponibilidad: sin celdas de compra no hay crédito que proyectar')
  return `=(${celdasBruto.map((c) => `N(${c})`).join('+')})*${factorFormula()}`
}

/**
 * Fórmula del IVA A PAGAR EN EFECTIVO de un mes proyectado: lo que la libre disponibilidad del mes
 * anterior no alcanza a absorber. Es la fila que el cash flow lee.
 * @param {string} colDebito celda del débito del mes (ej. 'I16')
 * @param {string} colCredito celda del crédito del mes
 * @param {string} celdaSaldoPrevio celda de libre disponibilidad del mes ANTERIOR (ej. 'H19')
 */
export function formulaAPagarProyectado(colDebito, colCredito, celdaSaldoPrevio) {
  return `=MAX(0;${colDebito}-${colCredito}-N(${celdaSaldoPrevio}))`
}

/**
 * Fórmula de la LIBRE DISPONIBILIDAD que queda al cierre de un mes proyectado.
 * MAX(0;…) porque un saldo a favor no se vuelve negativo: cuando se agota, lo que sobra se paga y el
 * saldo queda en cero. Sin el MAX el arrastre seguiría restando un saldo inexistente y el cuadro
 * mostraría a la empresa pagando de menos todos los meses siguientes.
 */
export function formulaLibreDispProyectada(celdaSaldoPrevio, colDebito, colCredito) {
  return `=MAX(0;N(${celdaSaldoPrevio})+${colCredito}-${colDebito})`
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL ANCLA: DESDE QUÉ MES SE PROYECTA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// NO SE PROYECTA "DESPUÉS DE LA ÚLTIMA DDJJ PRESENTADA", SE PROYECTA DESPUÉS DEL ÚLTIMO MES QUE YA
// TIENE DATO EN LA PESTAÑA. La diferencia costó caro y hay que verla.
//
// Al 04/08 la columna de julio de "Impuestos y Financieros" tiene débito $23.623.112, crédito
// $11.328.238 y libre disponibilidad $7.050.036, con la leyenda "⚠ PROYECCIÓN — DDJJ vence 20/08".
// Ese texto no lo produce ningún generador de este repo: lo escribió una persona. Pero en Drive no
// hay F.2051 de julio, así que para el generador julio "no existe" y le escribiría el centinela
// VACIO — que limpia. Y `respetar-ediciones` NO lo salva: por diseño sólo respeta RÓTULOS DE TEXTO,
// nunca importes. O sea que la corrida siguiente le borraba a una persona tres números que había
// calculado a mano, y encima dejaba el aviso de arriba huérfano.
//
// Peor todavía para el resultado: julio es justo el mes que hace de ancla. Sin él la proyección
// arrancaría del saldo de junio ($19,3M) en vez del de julio ($7,05M), y el cuadro diría que el
// saldo a favor aguanta hasta fin de año cuando en realidad se agota el mes que viene.
//
// La regla, entonces: un mes con dato en la hoja es DATO, venga de la DDJJ o de una persona.

// LO QUE PUEDE ACOMPAÑAR A UN IMPORTE es_AR Y NO LO DESMIENTE: el símbolo de moneda, espacios
// (incluido el duro que mete Sheets), el signo, los separadores de miles y de decimales. Cualquier
// otro carácter —una letra, una barra, un glifo— dice que la celda NO es un importe.
const AJENO_A_UN_IMPORTE = /[^0-9.,\-+$\s ]/

/**
 * ¿Hay un número utilizable en esta celda? Un "—", un texto o un vacío no lo son. PURA.
 *
 * ═══ UN TEXTO CON DÍGITOS ADENTRO NO ES UN IMPORTE (17/08) ═══
 *
 * La guarda anterior era "¿tiene algún dígito?", puesta para que el rótulo "DDJJ presentada" no se
 * colara (sin dígitos, `Number('')` da 0 y 0 es finito). Pero filtraba por la ausencia de dígitos, no
 * por la presencia de texto, así que dejaba entrar todo lo que tuviera un número adentro. Medido en el
 * archivo real el 17/08:
 *
 *   · "⚠ vence 20/08"   → valía $2.008     ← la leyenda que el dueño tipeó en la celda del saldo
 *   · "20/07·N…6115"    → valía $20.076.115 ← la fila "DDJJ presentada" que escribe ESTE generador
 *
 * El primero anclaba la proyección entera de IVA en julio con $2.008 de libre disponibilidad, cuando
 * el último saldo real es el de junio: $19.344.911. Un número inventado a partir de una fecha,
 * gobernando cinco meses de proyección y el saldo a favor que publica la portada.
 *
 * Ahora la pregunta se da vuelta: un importe es un número, o una cadena que ES ÍNTEGRAMENTE un
 * importe. Que contenga uno no alcanza.
 */
export function esNumero(v) {
  if (v === null || v === undefined) return false
  if (typeof v === 'number') return Number.isFinite(v)
  const s = String(v).trim()
  if (!s || s === '—' || s === '-') return false
  if (!/\d/.test(s)) return false
  if (AJENO_A_UN_IMPORTE.test(s)) return false
  // es_AR: miles con punto, decimales con coma, y el símbolo de moneda adelante.
  const n = Number(s.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n)
}

/** El número de una celda es_AR, o null si no hay. PURA. */
export function aNumero(v) {
  if (!esNumero(v)) return null
  if (typeof v === 'number') return v
  return Number(String(v).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'))
}

/**
 * NÚCLEO PURO: desde qué mes se puede proyectar y con qué saldo se arranca.
 *
 * @param {Array} filaLibreDisp la fila de libre disponibilidad tal como está HOY en la hoja,
 *        desde la columna B (enero). Se acepta cruda: valores formateados, "—" o vacíos.
 * @param {number[]} mesesConDDJJ los meses que sí tienen F.2051 en Drive.
 * @returns {{ultimoMesConDato:number|null, libreDisp:number|null, mesesAProyectar:number[],
 *            textoDondeVaImporte:Array<{mes:number, valor:string}>}}
 */
export function anclaDeProyeccion(filaLibreDisp = [], mesesConDDJJ = []) {
  let ultimo = null
  let saldo = null
  // DESCARTAR EN SILENCIO ES LA MITAD DEL DEFECTO. Que "⚠ vence 20/08" deje de valer $2.008 evita el
  // número inventado, pero si además se ignora sin decir nada, al dueño se le recalcula la columna que
  // escribió a mano y nadie le dice por qué. Lo que no es un importe pero TAMPOCO es ausencia
  // (vacío, "—") se devuelve nombrado, para que la pestaña lo declare como el hueco que es.
  const textoDondeVaImporte = []
  for (let m = 1; m <= 12; m++) {
    const v = filaLibreDisp[m - 1]
    if (esNumero(v)) { ultimo = m; saldo = aNumero(v); continue }
    const s = String(v ?? '').trim()
    if (s && s !== '—' && s !== '-') textoDondeVaImporte.push({ mes: m, valor: s })
  }
  // La DDJJ presentada también cuenta, aunque la hoja todavía no la muestre (primera corrida).
  for (const m of mesesConDDJJ) if (ultimo === null || m > ultimo) ultimo = m
  const mesesAProyectar = ultimo === null ? [] : []
  if (ultimo !== null) for (let m = ultimo + 1; m <= 12; m++) mesesAProyectar.push(m)
  return { ultimoMesConDato: ultimo, libreDisp: saldo, mesesAProyectar, textoDondeVaImporte }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// ¿SIGUEN LOS DOS CASH FLOW LEYENDO LA FILA QUE CREEN LEER?
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ EXISTE (04/08). Los dos cash flow referencian esta pestaña por NÚMERO DE FILA
// ('Impuestos y Financieros'!I$18 y !I$28), no por rótulo: el rótulo se resuelve una sola vez, cuando
// se los regenera. Si el generador de impuestos corre solo y mueve esas filas, los cash flow siguen
// apuntando al número viejo y leen la fila de al lado — sin #REF, sin error, sin aviso. Ya pasó el
// 30/07: se renombró una fila razonando sobre la 18 y los dos cuadros quedaron sin poder regenerarse.
//
// LA SALIDA OBVIA ERA "CORRÉ TAMBIÉN cash-flow-rehacer.mjs", Y ES PEOR QUE EL PROBLEMA. Ese script
// reescribe las dos pestañas ENTERAS, y el dueño borró líneas a mano en las dos: rehacerlas puede
// resucitárselas. Cambiar un riesgo silencioso por uno que le devuelve trabajo que él eliminó no es
// un arreglo.
//
// Así que en vez de rehacer, se VERIFICA. Antes de escribir se lee a qué fila apuntan hoy los cash
// flow y se compara con la fila donde el generador va a dejar cada rótulo. Si coinciden, no hay nada
// que regenerar. Si no coinciden, no se escribe: escribir sería justamente el momento en que las
// referencias se rompen.

/**
 * Las filas de una pestaña a las que apunta un conjunto de fórmulas. PURA.
 * @param {string[]} formulas p.ej. ["=N('Impuestos y Financieros'!I$18)+N('Impuestos y Financieros'!I$28)"]
 * @param {string} pestana el nombre tal como aparece en la referencia
 * @returns {number[]} las filas distintas, ordenadas
 */
export function filasReferenciadas(formulas = [], pestana = 'Impuestos y Financieros') {
  const re = new RegExp(`'${pestana.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'!\\$?[A-Z]{1,2}\\$?(\\d+)`, 'g')
  const filas = new Set()
  for (const f of formulas) for (const m of String(f ?? '').matchAll(re)) filas.add(Number(m[1]))
  return [...filas].sort((a, b) => a - b)
}

/**
 * ¿ESTÁN LOS DOS RÓTULOS DEL CONTRATO, UNA SOLA VEZ CADA UNO, EN LA GRILLA QUE SE VA A ESCRIBIR? PURA.
 *
 * ═══ POR QUÉ HACÍA FALTA (06/08) ═══
 *
 * `contratoDeFilas` (abajo) protegía el consumo POR NÚMERO DE FILA, que era como los cash flow leían
 * esta pestaña. Ese consumo se terminó: hoy CERO celdas de "Cash Flow Mensual", "Cash Flow Semanal" y
 * "CAJA" referencian "Impuestos y Financieros" por fórmula. Con la lista de referencias vacía,
 * `contratoDeFilas` cae siempre en la rama "ningún cash flow referencia esta pestaña todavía → ok",
 * y la guarda más cara del generador —dos lecturas de A1:BZ60 por corrida— pasaba SIEMPRE.
 *
 * El consumo real se mudó a JavaScript y es POR RÓTULO, en cinco lugares: `caja-refs`,
 * `libro-movimientos-pestana`, `cash-flow-rehacer`, `conciliar-caja-vs-cashflow` y `cash-flow-mapa`.
 * Los cinco buscan el texto exacto en la columna A y los cinco rompen si no lo encuentran. Entonces
 * lo que hay que proteger no es la FILA: es que el TEXTO exista y sea único.
 *
 * Un rótulo DUPLICADO es tan malo como uno faltante y no rompe a nadie: los cinco consumidores usan
 * `findIndex`, así que se quedarían con la primera aparición — que puede ser el hero, una nota o un
 * bloque de control — y leerían doce meses de otra cosa sin un solo error.
 *
 * @param {Array<Array>} filas la grilla que se va a escribir
 * @param {{iva:string, iibb:string}} rotulos los del contrato (CALENDARIO_IMPUESTOS.rotulos)
 * @returns {{ok:boolean, motivo:string, destino:{iva:number|null, iibb:number|null}}}
 */
export function contratoDeRotulos(filas = [], rotulos = {}) {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const donde = (rot) => filas.reduce((a, f, i) => (norm(f?.[0]) === norm(rot) ? [...a, i + 1] : a), [])
  const problemas = []
  const destino = { iva: null, iibb: null }
  for (const [clave, rot] of Object.entries(rotulos)) {
    const hits = donde(rot)
    if (hits.length === 0) problemas.push(`"${rot}" no aparece en la columna A`)
    else if (hits.length > 1) problemas.push(`"${rot}" aparece ${hits.length} veces (filas ${hits.join(', ')}): los consumidores toman la primera`)
    else destino[clave] = hits[0]
  }
  if (problemas.length) {
    return {
      ok: false,
      destino,
      motivo: `${problemas.join(' · ')}. Cinco consumidores ubican estas dos filas POR TEXTO; sin el texto `
        + 'exacto y único, el IVA/IIBB a pagar vale $0 y el piso de caja sube sin que se haya pagado nada.',
    }
  }
  return { ok: true, destino, motivo: `los dos rótulos del calendario fiscal están una sola vez (filas ${destino.iva} y ${destino.iibb})` }
}

/**
 * ¿Puede escribirse la pestaña sin romper lo que los cash flow ya referencian? PURA.
 *
 * @param {number[]} referenciadas las filas que los cash flow leen hoy
 * @param {{iva:number, iibb:number}} destino dónde va a quedar cada rótulo después de escribir
 * @returns {{ok:boolean, motivo:string}}
 */
export function contratoDeFilas(referenciadas = [], destino = {}) {
  const { iva, iibb } = destino
  if (!iva || !iibb) return { ok: false, motivo: 'no sé en qué fila van a quedar "IVA a pagar" y "IIBB a pagar"' }
  // Si todavía nadie referencia nada (primera escritura, o cash flow sin generar), no hay contrato
  // que romper: se escribe y el cash flow se resolverá por rótulo cuando le toque.
  if (!referenciadas.length) return { ok: true, motivo: 'ningún cash flow referencia esta pestaña todavía' }
  const faltan = [['IVA a pagar', iva], ['IIBB a pagar', iibb]]
    .filter(([, f]) => !referenciadas.includes(f))
    .map(([n, f]) => `${n} va a quedar en la fila ${f} y ningún cash flow la lee`)
  if (faltan.length) {
    return {
      ok: false,
      motivo: `${faltan.join(' · ')}. Los cash flow leen hoy las filas ${referenciadas.join(', ')}. `
        + 'Escribir así dejaría los dos cuadros leyendo una fila equivocada, sin error y sin aviso.',
    }
  }
  return { ok: true, motivo: `las filas ${iva} y ${iibb} son las que los cash flow ya leen: no hace falta regenerarlos` }
}

/** El texto que acompaña a cada mes proyectado. NUNCA se escribe un mes proyectado sin él. PURA. */
export function supuestoDelMes({ cobranzas = [], compras = [] } = {}) {
  return `PROYECCIÓN — débito = IVA contenido en ${cobranzas.join(' + ') || 'las cobranzas del cash flow'}`
    + ` · crédito = IVA contenido en ${compras.join(' + ') || 'las compras con factura del cash flow'}`
    + ` · alícuota del rango ${RANGO_ALICUOTA_IVA} (Parámetros) · saldo arrastrado del mes anterior.`
}
