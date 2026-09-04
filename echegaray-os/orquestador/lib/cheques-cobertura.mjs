import { hallarPestana } from './sheet-pestanas.mjs'
// EL CRITERIO DE RESPALDO NO SE REESCRIBE ACÁ: es el mismo que el cruce contra ARCA usa cuando a una
// fila de Compras le falta el número. Una segunda copia es como empezó la divergencia que
// lib/cobertura-arca.mjs vino a cerrar.
import { candidatasPorImporte } from './cobertura-arca.mjs'
import { normNombre } from './razon-social.mjs'
import { ALERTA } from './glifos.mjs'

// ¿LOS CHEQUES Y LA TARJETA ESTÁN CONTEMPLADOS EN EL CASH FLOW, O SON PLATA INVISIBLE?
//
// LA PREGUNTA DEL DUEÑO (20/07): "¿qué pasó con los cheques a cubrir en los cash flows, en qué
// concepto están?" y "¿todo lo que se contempla en Compras está en algún concepto del cash flow?".
//
// MI RESPUESTA ANTERIOR ESTABA MAL A MEDIAS. Excluí los cheques del cash flow diciendo "el cheque es
// CÓMO se paga, no qué se compró". Eso es cierto — pero SÓLO si la factura que el cheque paga está
// cargada en Compras. Al medirlo:
//
//   CHEQUES   89 filas · $71.900.300
//     · 39 ($38.388.505) tienen su factura en Compras → ya están en el cash flow, en el rubro que le
//       toque a esa factura. Sumarlos otra vez duplicaría.
//     · 50 ($33.511.796) NO tienen factura en Compras → son pagos reales que el cash flow NO ve.
//   TARJETA   29 filas · $8.785.691
//     · 24 ($7.437.350) están en Compras · 5 ($1.348.341) no.
//
// O sea: la respuesta correcta no es "sumarlos" ni "ignorarlos". Es medir cuánto de cada uno ya está
// contemplado, y mostrar el resto como trabajo pendiente de carga. Un cheque sin factura en Compras
// no es un problema del cash flow: es una compra que nadie registró.
//
// LA LLAVE ES EL NÚMERO DE COMPROBANTE, no el monto. Cruzar por proveedor+monto daba sólo 2 matches
// de 89 — porque un cheque suele pagar una parte de una factura, o varias facturas juntas. Por
// comprobante dan 39. El número de comprobante es el único identificador que comparten las dos
// planillas.

/**
 * Normaliza un número de comprobante para poder cruzarlo entre planillas.
 * "0001-000036", "1-36" y "00001-0000036" son el MISMO comprobante: punto de venta 1, número 36.
 * Por eso se limpia cada parte por separado — sacar los ceros de la cadena entera daba "1000036"
 * contra "10000036" y el match fallaba justo en los comprobantes con más relleno.
 */
export const normComprobante = (s) => String(s ?? '')
  .split(/[^0-9]+/)
  .filter(Boolean)
  .map((p) => p.replace(/^0+/, '') || '0')
  .join('-')

/**
 * ¿Esta clave sirve para cruzar, o es demasiado pobre y va a dar matches falsos?
 *
 * Sirve si tiene DOS partes (punto de venta + número, el formato de una factura argentina) o si es
 * un número largo. Contar sólo dígitos era el criterio equivocado: la factura "00045-00000009" se
 * normaliza a "45-9" — tres dígitos — y quedaba descartada, con lo cual las 12 cuotas de la tarjeta
 * de Modica figuraban como "sin factura en Compras" cuando la factura estaba ahí.
 */
export const esLlaveUtil = (k) => k.includes('-') || k.replace(/-/g, '').length >= 5

/**
 * `esLlaveUtil` TRADUCIDA A FÓRMULA, para que el Sheet pueda partir en dos el bloque de lo no marcado.
 *
 * POR QUÉ HACE FALTA UNA SEGUNDA ESCRITURA DE LA MISMA REGLA. El cruce se hace en código porque
 * normalizar "0001-000036" contra "1-36" en una celda sería ilegible; pero el renglón "el OS todavía
 * no miró esta fila" tiene que moverse SOLO —si se congelara en un número pegado envejecería igual
 * que la marca que vino a vigilar—. Vive pegada a su gemela de código a propósito: son dos líneas que
 * se leen juntas o divergen. `pin-esLlaveUtil` en el test las ata a la misma tabla de casos.
 *
 * La expresión es la de arriba, término a término: tiene un guión, O mide cinco o más caracteres.
 * (1-…)*(1-…) en vez de OR(), que en Sheets no es array-safe y devolvería un único booleano.
 *
 * LA APROXIMACIÓN, DECLARADA: la gemela de código cuenta DÍGITOS y ésta cuenta CARACTERES, porque
 * contar dígitos en una celda exige recorrer el texto y eso no es array-safe adentro de un
 * SUMPRODUCT. Difieren sólo si alguien escribe cinco o más caracteres SIN un solo dígito ("pendiente")
 * — no hay ninguno hoy en el registro. El renglón que parte es un DIAGNÓSTICO, no un importe del
 * cuadro: los dos pedazos suman lo mismo pase lo que pase, y lo único que se movería es de qué lado
 * del renglón cae una fila.
 * @param {string} rango rango de la columna del N° de comprobante (ya con pestaña y $)
 * @returns {string} expresión (sin '='), array-safe, en locale es_AR
 */
export function expresionTieneNumero(rango) {
  const texto = `(${rango}&"")`
  const soloDigitos = `LEN(SUBSTITUTE(${texto};"-";""))`
  return `(1-(1-ISNUMBER(FIND("-";${texto})))*(1-(${soloDigitos}>=5)))`
}

/**
 * TOLERANCIA DEL CRUCE DE RESPALDO PARA UN CHEQUE: cero por ciento, o sea un peso de piso.
 *
 * ARCA usa 3% porque compara el neto del libro contra el Total de Compras. Un cheque no tiene esa
 * diferencia: paga un importe y ese importe se escribe. MEDIDO el 05/08 con 3%: seis cheques de
 * $750.000 de Corralón Progreso emparejaron contra una única factura de $744.526. Un importe redondo
 * es un pago a cuenta, no el total de una factura, y un emparejamiento falso acá es CARO: le dice al
 * calendario "este cheque ya viaja dentro de su rubro", lo saca de los egresos y SUBE el piso —
 * que es el número con el que se decide cuánta plata se inmoviliza.
 */
export const TOL_CHEQUE = 0
/** Cuántos días puede haber entre la factura y el cheque que la paga. El mismo proveedor factura el
 *  mismo importe varias veces al año; sin ventana, el cruce elige la primera del año. */
export const VENTANA_DIAS_CHEQUE = 60

/**
 * NÚCLEO PURO: los instrumentos SIN N° de comprobante que IGUAL se pueden atribuir a una fila de
 * Compras, por proveedor + importe + fecha cercana.
 *
 * ES UNA INFERENCIA Y SE DEVUELVE COMO TAL, en una lista separada de los cruzados por número. La
 * llave buena identifica una factura; esto sólo dice "hay una fila de Compras que es exactamente
 * esta plata, del mismo proveedor, en el mismo momento".
 *
 * ═══ LA GUARDA DE AMBIGÜEDAD, QUE ES LO QUE SEPARA UNA INFERENCIA DE UNA MONEDA AL AIRE ═══
 *
 * Si por un (proveedor, importe) hay MÁS cheques que facturas candidatas, no se infiere ninguno.
 * Sin esta guarda, seis cheques iguales contra una factura terminan con uno emparejado —el primero
 * que pasó— y cinco no: el emparejado es arbitrario, y encima es el que baja el egreso del cuadro.
 * Preferir el hueco declarado antes que la atribución arbitraria no es prudencia decorativa: el
 * hueco se puede cerrar cargando un dato, la atribución falsa no se ve nunca más.
 *
 * @param {Array<{fila:number, proveedor?:string, monto:number, comprobante?:string, fecha?:Date|number|null}>} instrumentos
 * @param {Array<{fila:number, prov:string, total:number, fecha?:number|null}>} filasCompras con el
 *   proveedor YA normalizado por el llamador, igual que pide `cruzar` en lib/cobertura-arca.mjs
 * @returns {{inferidos:Map<number,{filaCompras:number, total:number}>, ambiguos:Array, sinRespaldo:Array}}
 */
export function inferirRespaldo(instrumentos = [], filasCompras = [], { norm = normNombre, tol = TOL_CHEQUE, ventanaDias = VENTANA_DIAS_CHEQUE } = {}) {
  const sinLlave = instrumentos.filter((i) => !esLlaveUtil(normComprobante(i.comprobante)))
  // Se agrupa por (proveedor, importe al peso) porque la ambigüedad es una propiedad del GRUPO, no
  // de cada cheque: sólo mirando el grupo entero se sabe si alcanzan las facturas para todos.
  // La clave del grupo usa el CUIT cuando el cheque lo trae: dos cheques del mismo CUIT son del
  // mismo proveedor aunque uno diga «DUPEC» y el otro «DUBOS UGARTE PEDRO LUIS RAUL», y agruparlos
  // por nombre los partía en dos grupos que competían por las mismas facturas.
  const cuit11 = (v) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 11 ? d : null }
  const grupos = new Map()
  for (const i of sinLlave) {
    const k = `${cuit11(i.cuit) ?? norm(i.proveedor)}|${Math.round(Number(i.monto) || 0)}`
    grupos.set(k, [...(grupos.get(k) ?? []), i])
  }
  const usadas = new Set()
  const inferidos = new Map()
  const ambiguos = []
  const sinRespaldo = []
  for (const grupo of grupos.values()) {
    const busca = (i, u) => candidatasPorImporte(
      { prov: norm(i.proveedor), cuit: i.cuit, total: Number(i.monto) || 0, fecha: serialDe(i.fecha) },
      filasCompras, { usadas: u, tol, ventanaDias })
    // Las candidatas del grupo ANTES de consumir ninguna: es contra ese universo que se mide si
    // alcanzan. Medirlo después de consumir declaraba ambiguo al segundo de dos pares perfectos.
    const universo = new Set(grupo.flatMap((i) => busca(i, usadas)).map((f) => f.fila))
    if (!universo.size) { sinRespaldo.push(...grupo); continue }
    if (grupo.length > universo.size) { ambiguos.push(...grupo); continue }
    for (const i of grupo) {
      const [cand] = busca(i, usadas)
      if (!cand) { sinRespaldo.push(i); continue }
      usadas.add(cand.fila)
      inferidos.set(i.fila, { filaCompras: cand.fila, total: Number(cand.total) || 0 })
    }
  }
  return { inferidos, ambiguos, sinRespaldo }
}

/** La fecha de un instrumento como serial de Sheets, venga como Date o como serial. PURA.
 *  Sin esto, comparar un Date contra el serial de Compras da NaN y la ventana no filtra nada. */
export function serialDe(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (v instanceof Date && !Number.isNaN(+v)) return Math.round((Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) - Date.UTC(1899, 11, 30)) / 86400000)
  return null
}

/**
 * NÚCLEO PURO: reparte instrumentos de pago (cheques, tarjeta) entre los que YA están contemplados
 * en Compras y los que no.
 * @param {Array<{comprobante?:string, monto:number, proveedor?:string, fecha_pago?:string, debitado?:string}>} instrumentos
 * @param {Set<string>} comprobantesEnCompras claves ya normalizadas
 * @param {{inferidos?:Map<number,object>}} opciones `inferidos` lo produce `inferirRespaldo`: las
 *   filas sin N° que igual se pudieron atribuir a una factura. Salen de `sin_numero_comprobante` —
 *   dejarlas en los dos lados contaría la misma plata dos veces en el bloque del cash flow.
 * @returns {{contemplados:Array, sin_registrar:Array, total:number, monto_contemplado:number, monto_sin_registrar:number, sin_numero:number}}
 */
export function repartirCobertura(instrumentos = [], comprobantesEnCompras = new Set(), { inferidos = new Map() } = {}) {
  // TRES grupos, no dos. La diferencia importa y casi la paso por alto: de los 50 cheques que no
  // matchean, 40 ($21.880.254) simplemente NO TIENEN número de comprobante cargado — su factura
  // puede estar perfectamente en Compras y no hay forma de saberlo. Sólo 10 ($11.631.542) tienen
  // número y ese número no aparece en Compras: ésos sí son, con seguridad, facturas sin cargar.
  // Decir "$33,5M sin registrar" mezcla un problema confirmado con una ignorancia, y exagera.
  const contemplados = []
  const faltaFactura = []
  const sinNumero = []
  const inferidosArr = []
  for (const i of instrumentos) {
    const k = normComprobante(i.comprobante)
    if (!esLlaveUtil(k)) (inferidos.has(i.fila) ? inferidosArr : sinNumero).push(i)
    else if (comprobantesEnCompras.has(k)) contemplados.push(i)
    else faltaFactura.push(i)
  }
  const suma = (a) => a.reduce((s, x) => s + (Number(x.monto) || 0), 0)
  return {
    contemplados,
    // LOS INFERIDOS NO SE MEZCLAN CON LOS CONTEMPLADOS. Los primeros son un HECHO (el número de la
    // factura está en Compras); éstos son una atribución por proveedor + importe. Sumarlos juntos
    // convertiría una inferencia en un hecho con sólo pasar por una función.
    inferidos: inferidosArr,
    falta_factura: faltaFactura,
    sin_numero_comprobante: sinNumero,
    // Se mantiene por compatibilidad: todo lo que NO se pudo confirmar como contemplado.
    sin_registrar: [...faltaFactura, ...sinNumero],
    total: suma(instrumentos),
    monto_contemplado: suma(contemplados),
    monto_inferido: suma(inferidosArr),
    monto_falta_factura: suma(faltaFactura),
    monto_sin_numero: suma(sinNumero),
    monto_sin_registrar: suma(faltaFactura) + suma(sinNumero),
    sin_numero: sinNumero.length,
  }
}

/**
 * NÚCLEO PURO: los cheques que todavía hay que CUBRIR, agrupados por mes de pago.
 * Es una pregunta de tesorería distinta de la anterior: no importa si la factura está registrada,
 * importa cuánta plata tiene que haber en la cuenta y cuándo. Un cheque emitido y no debitado es un
 * compromiso en firme — más firme que una factura con fecha prevista.
 * @param {Array} instrumentos con {monto, fecha_pago:'YYYY-MM', debitado}
 * @returns {{por_mes:Array<{mes:string, cantidad:number, monto:number}>, total:number}}
 */
export function aCubrirPorMes(instrumentos = []) {
  const acc = new Map()
  let total = 0
  for (const i of instrumentos) {
    // "DEBITADO = SI" ya salió de la cuenta. Lo demás está pendiente de cubrir.
    if (String(i.debitado ?? '').trim().toUpperCase() === 'SI') continue
    const mes = String(i.fecha_pago ?? '').trim() || '(sin fecha)'
    const m = Number(i.monto) || 0
    total += m
    // EL AÑO Y EL MES DE VERDAD, cuando se conocen. El rótulo "julio 26" que se ve en la pestaña es
    // FORMATO: la celda tiene una fecha adentro. Agrupar por el texto funciona en código y falla en
    // una fórmula del Sheet, que compara contra el valor real — daba $0 en las cuatro filas.
    const d = i.fecha instanceof Date && !Number.isNaN(+i.fecha) ? i.fecha : null
    const a = acc.get(mes) ?? { mes, cantidad: 0, monto: 0, anio: d?.getFullYear() ?? null, num: d ? d.getMonth() + 1 : null }
    a.cantidad++; a.monto += m
    acc.set(mes, a)
  }
  // Se ordena por la fecha real cuando existe: alfabéticamente, "agosto" va antes que "julio".
  const por_mes = [...acc.values()].sort((a, b) => (
    a.anio && b.anio ? (a.anio - b.anio) || (a.num - b.num) : a.mes.localeCompare(b.mes)
  ))
  return { por_mes, total }
}

/**
 * NÚCLEO PURO: los instrumentos SIN factura en Compras, con su fecha real de pago.
 *
 * POR QUÉ HACE FALTA UNA LÍNEA EN EL CASH FLOW Y NO ALCANZA CON MEDIRLO. El bloque de medición del
 * pie contesta "cuánto falta cargar", pero el cuadro de arriba —el que se mira para decidir— seguía
 * sin ver esa plata. Y son pagos que salen de la cuenta igual: $12.979.883 confirmados.
 *
 * NO PUEDE DUPLICAR, POR CONSTRUCCIÓN. Sólo entran los instrumentos cuyo número de comprobante NO
 * está en Compras. Si estuviera, ya viajó al cash flow por el rubro de esa factura y acá no aparece.
 * Es la única forma de sumar cheques sin romper la regla de oro: el que ya está contemplado, se
 * excluye solo.
 *
 * @param {Array} instrumentos con {comprobante, monto, fecha} — fecha es la de PAGO, no la de emisión
 * @param {Set<string>} comprobantesEnCompras claves ya normalizadas
 * @returns {Array<{fecha:Date, monto:number, proveedor:string}>}
 */
export function faltaFacturaConFecha(instrumentos = [], comprobantesEnCompras = new Set()) {
  const { falta_factura: falta } = repartirCobertura(instrumentos, comprobantesEnCompras)
  return falta.filter((i) => i.fecha instanceof Date && !Number.isNaN(i.fecha.getTime()))
    .map((i) => ({ fecha: i.fecha, monto: Number(i.monto) || 0, proveedor: i.proveedor ?? '' }))
}

/**
 * LAS MARCAS QUE EL OS ESCRIBE AL LADO DE CADA CHEQUE Y DE CADA CONSUMO DE TARJETA.
 *
 * POR QUÉ SON CONSTANTES Y NO TEXTOS SUELTOS (21/07). El cash flow SUMA por estas marcas: la línea
 * "Pagos con cheque y tarjeta sin factura registrada" dejó de ser un número pegado y pasó a ser una
 * fórmula que cuenta las filas marcadas. Si el texto cambia de un lado y no del otro, la fórmula da
 * $0 y nadie se entera — que es exactamente la forma de fallar que este cambio vino a sacar.
 *
 * El cruce sigue haciéndose en código, no en fórmula: normalizar "0001-000036" contra "1-36" en una
 * celda sería ilegible. Lo que cambia es que el resultado del cruce queda ESCRITO fila por fila —
 * visible, filtrable, verificable— y el total lo hace el Sheet sumando esas filas.
 */
export const MARCAS = {
  ok: '✓ su factura está en Compras',
  // ═══ POR QUÉ ESTA MARCA ES DISTINTA DE LA DE ARRIBA Y NO UN ✓ MÁS (05/08) ═══
  // El glifo es lo único que se mira cuando se filtra la pestaña. Un ✓ acá diría "está verificado"
  // sobre algo que se dedujo del importe: la regla de oro nº 2 —nunca presentar una estimación como
  // un hecho— se rompe en el glifo, no en el texto que nadie lee.
  inferido: '≈ INFERIDO — sin N°, pero hay una factura del mismo proveedor por el mismo importe',
  // LA ALERTA SALE DE `glifos.mjs` Y NO SE TIPEA ACÁ. El `⚠` con el que se publicaron estas dos
  // marcas no lo dibuja el exportador a PDF: en el papel decían "FALTA cargar la factura…" sin la
  // señal que hace que alguien mire. Quién las reconoce ya publicadas —el cash flow, la piel, la
  // huella— tolera los dos glifos mientras la columna M no se regenere; ver `comparaMarca`.
  falta: `${ALERTA} FALTA cargar la factura en Compras — este pago no lo ve el cash flow`,
  sinNumero: `${ALERTA} sin N° de comprobante — no se puede cruzar`,
}

/**
 * NÚCLEO PURO: qué marca le toca a un instrumento de pago.
 * @param {string} comprobante
 * @param {Set<string>} comprobantesEnCompras claves ya normalizadas
 * @param {boolean} [inferido] si `inferirRespaldo` le encontró una factura por proveedor + importe
 */
export function marcaDe(comprobante, comprobantesEnCompras = new Set(), inferido = false) {
  const k = normComprobante(comprobante)
  if (!esLlaveUtil(k)) return inferido ? MARCAS.inferido : MARCAS.sinNumero
  return comprobantesEnCompras.has(k) ? MARCAS.ok : MARCAS.falta
}

/**
 * NÚCLEO PURO: LA DESCOMPOSICIÓN QUE DECIDE, y por qué no alcanza con las marcas.
 *
 * ═══ EL DEFECTO QUE ESTO CIERRA (05/08) ═══
 *
 * La marca de la pestaña es una FOTO: la escribe el agente cuando corre y no se mueve sola. Medido
 * contra el Sheet real: la columna decía "al 24/7/2026" y las OCHO filas cargadas después de esa
 * fecha —$38.377.479, todas ECHEQ con vencimiento en agosto— no tenían ninguna marca. El término de
 * cheques del calendario suma por la marca "FALTA", así que esos ocho no entraban por ningún lado; y
 * el verificador independiente, que clasificaba "todo lo que no dice FALTA ya tiene su factura", los
 * contaba como cubiertos. Dos vistas distintas del mismo hecho, las dos equivocadas por omisión.
 *
 * LA CAUSA NO ES EL CRUCE: es la ANTIGÜEDAD de la marca. Por eso esta función NO lee marcas —
 * recalcula el estado desde el dato crudo— y devuelve el grupo `sinMarca` aparte, que es la medida
 * de cuánto se está decidiendo con una foto vieja.
 *
 * @param {Array} instrumentos con {fila, monto, comprobante, debitado, marca}
 * @param {Set<string>} comprobantesEnCompras
 * @param {Map<number,object>} inferidos de `inferirRespaldo`
 * @returns {{ok:Array, inferidos:Array, falta:Array, hueco:Array, sinMarca:Array, montos:object}}
 */
export function estadoDeCobertura(instrumentos = [], comprobantesEnCompras = new Set(), inferidos = new Map()) {
  const g = { ok: [], inferidos: [], falta: [], hueco: [], sinMarca: [] }
  for (const i of instrumentos) {
    const m = marcaDe(i.comprobante, comprobantesEnCompras, inferidos.has(i.fila))
    if (m === MARCAS.ok) g.ok.push(i)
    else if (m === MARCAS.inferido) g.inferidos.push(i)
    else if (m === MARCAS.falta) g.falta.push(i)
    else g.hueco.push(i)
    // `sinMarca` cruza los otros cuatro grupos a propósito: no es un estado de cobertura, es un
    // estado del OS —"nadie miró esta fila todavía"— y su monto es el que el calendario ignora.
    if (!String(i.marca ?? '').trim()) g.sinMarca.push(i)
  }
  const suma = (a) => a.reduce((s, x) => s + (Number(x.monto) || 0), 0)
  const montos = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, suma(v)]))
  return { ...g, montos }
}

/**
 * NÚCLEO PURO: cuánto de una lista cae en una ventana [desde, hasta).
 * El límite superior es EXCLUYENTE para que ningún pago caiga en dos columnas del cash flow.
 * @param {Array<{fecha:Date, monto:number}>} items
 * @returns {number}
 */
export function montoEnVentana(items = [], desde, hasta) {
  return items.reduce((s, i) => (i.fecha >= desde && i.fecha < hasta ? s + i.monto : s), 0)
}

// Se re-exporta para no romper a quien ya la importaba de acá; su casa es sheet-pestanas.mjs.
export { hallarPestana }
