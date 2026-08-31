// LA PESTAÑA "Compras" VIVA — para no cargar dos veces lo que ya está cargado, y para saber cómo
// imputa esta empresa.
//
// ═══ POR QUÉ NO ALCANZA EL REGISTRO PROPIO (03/08) ═══
//
// `comunicacion.comprobantes_cargados` sólo sabe de lo que entró POR EL CHAT. El comprobante de
// Corralón que el dueño mandó a `comprobantes-gastos` ya estaba en Compras fila 802 — cargado por
// Claude Code con el mismo pipeline. El registro del chat no lo tenía, así que la idempotencia no
// podía verlo, y el bot se ofreció a cargarlo de nuevo. El dueño ya se había quejado antes de
// mandar uno cargado y no recibir aviso.
//
// La barrera tiene que mirar el DESTINO, no el registro de lo que hizo uno mismo. La evidencia de
// que un gasto está cargado es la fila de Compras, no la anotación propia de haberlo cargado.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO ARREGLA (03/08, ticket de combustible) ═══
//
// El dueño mandó un TIQUE FACTURA "A" de Combustibles Barcelo, `00113-00014219`, $64.006,07. Ya
// estaba en Compras fila 800, con el mismo número y el mismo total al centavo. El bot no lo detectó
// y ofreció "Confirmar y cargar".
//
// La causa NO fue que faltara mirar Compras: se miraba. Fue que las dos pasadas de búsqueda
// dependían de datos que ese ticket no tenía:
//   · la pasada por número exigía el TIPO ("A"), y de un tique la visión no siempre lo saca — el
//     mensaje decía "comprobante 00113-…", no "F A 00113-…": el tipo venía en null;
//   · la pasada por proveedor+fecha+importe DESCARTABA a propósito las filas con el mismo número,
//     dando por hecho que ésas ya las había cazado la primera.
// Entre las dos dejaron ciego justo el caso más obvio: el mismo número y el mismo total.
//
// Y el agravante: un tique de estación de servicio **puede legítimamente no estar en ARCA**. El bot
// dijo "no figura en ARCA" y siguió. Que no esté en ARCA no dice NADA sobre si ya está cargado —
// cuando ARCA no lo encuentra es cuando MÁS falta hace mirar la pestaña viva.
//
// ═══ LA REGLA, AHORA ═══
//
// **Se busca SIEMPRE, con ARCA o sin ARCA, y por varias claves**, de la más fuerte a la más débil:
//   (CUIT|proveedor, número) · (número, total) · (CUIT|proveedor, fecha, total) · (fecha, total)
// Ninguna exige el tipo, ninguna exige el CUIT y ninguna exige ARCA. Lo que cambia según la clave no
// es SI se busca, sino con cuánta certeza se afirma:
//   · CARGADO  = es éste. Certeza suficiente para no volver a cargarlo.
//   · PROBABLE = puede ser éste. No se decide solo: se muestra la fila y se pregunta.
//
// ═══ CUIT: LA IDENTIDAD CORRECTA QUE EL DESTINO NO GUARDA ═══
//
// El identificador de un proveedor es el CUIT, pero **la pestaña Compras no tiene columna de CUIT**:
// su identidad es el nombre del desplegable estricto (que es, además, el valor al que `matchProveedor`
// ya tradujo lo que leyó la foto). Por eso las claves "por CUIT" se resuelven con un mapa
// nombre→CUIT OPCIONAL: cuando alguien puede proveerlo, el CUIT manda sobre el nombre; cuando no, la
// identidad es el nombre y se dice. No se inventa una columna que el Sheet no tiene.
//
// Es SÓLO LECTURA. Ni una escritura, ni una fórmula: el freno de mano de Sheets no lo afecta.

import { numeroCanonico, fechaDeLectura, soloDigitos, claseDeComprobante } from './lectura.mjs'
import { normalizar, aNumero, redondear2 } from '../carga-comprobantes.mjs'
import { escalaDeTotales } from './aritmetica.mjs'

/**
 * Rango mínimo suficiente: B categoría … O total. La fila del Sheet es el índice + esta base.
 *
 * Arrancaba en C. La columna B (Categoría) se sumó el 04/08 porque toda fila que cargó el bot quedó
 * SIN categoría, y la única forma legítima de saber qué categoría le corresponde a un proveedor es
 * la que ya usó este dueño con ese proveedor. Una columna más en una lectura que ya se hacía no
 * cuesta nada; una segunda lectura del Sheet para lo mismo, sí.
 */
export const RANGO = 'Compras!B4:O'
export const FILA_BASE = 4

/** Posición de cada dato DENTRO del rango leído (B = 0). Contrato con `RANGO`. */
const EN = { categoria: 0, fecha: 1, proveedor: 3, tipo: 5, numero: 6, unidad: 7, obra: 8, detalle: 9, concepto: 10, total: 13 }

/** Tolerancia de importe. Debajo de esto es el redondeo del comprobante, no otra compra. */
const TOLERANCIA = 0.5

export const HALLAZGO = Object.freeze({
  CARGADO: 'cargado',   // es éste: no se vuelve a cargar
  PROBABLE: 'probable', // puede ser éste: se pregunta con botones
})

/**
 * Importe de una celda de Compras. Un negativo del Sheet viene ENTRE PARÉNTESIS —así lo formatea el
 * dueño— y `aNumero` se come el paréntesis y devuelve el positivo. Una nota de crédito leída como
 * compra es el error de $41,9M que este repo ya pagó: acá el signo se respeta.
 */
export function importeDeCompras(v) {
  // ═══ UN NÚMERO YA ES UN NÚMERO (13/08) ═══
  //
  // Sin esta línea, `String(6000.02)` da "6000.02" y el parser es-AR se come el punto como separador
  // de miles: 6.000,02 se convierte en 600.002, cien veces más. No pasaba porque este rango se lee
  // FORMATEADO; se descubrió al leerlo con `UNFORMATTED_VALUE` desde el auditor, donde $6.693,39
  // apareció como $6.693.389.999.999.999. Un parser que multiplica por cien según cómo lo llamaron es
  // una bomba con temporizador: la fuente no puede depender del render que eligió el llamador.
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '')
  const n = aNumero(s)
  if (n == null) return null
  return /\(.*\)/.test(s) ? -Math.abs(n) : n
}

/** El tipo de la columna G ("F A", "N C") → la letra que usa la lectura ('A', 'NC'). */
export function tipoDeCompras(v) {
  const s = normalizar(v).replace(/\s+/g, '')
  if (!s) return null
  if (s === 'nc') return 'NC'
  const m = s.replace(/^f/, '').match(/^([abc])$/)
  return m ? m[1].toUpperCase() : s.toUpperCase()
}

/**
 * Filas crudas del rango → índice consultable. NÚCLEO PURO.
 *
 * @param {Array<Array<string>>} filas  lo que devuelve `readSheetValues(RANGO)`
 * @param {{cuitPorProveedor?:Object|Map}} [o]  nombre de proveedor normalizado → CUIT, si se sabe
 */
export function indexarCompras(filas = [], { cuitPorProveedor = null } = {}) {
  const cuitDe = lectorDeCuit(cuitPorProveedor)
  // LAS CLAVES NO LLEVAN NI EL TIPO NI EL PROVEEDOR. Un índice que los mete en la clave sólo puede
  // contestar preguntas que traigan esos datos, y el ticket que motivó este arreglo no traía el tipo.
  // Se indexa por lo que SIEMPRE se puede leer de una foto —el número, la fecha y el total— y la
  // identidad del proveedor se evalúa después, sobre cada candidata.
  const porNumero = new Map()
  const porFechaTotal = new Map()
  // POR FECHA SOLA. Es el índice que hacía falta para la pasada de "un dígito de distancia": ahí el
  // número está mal leído (no sirve `porNumero`) y el importe TAMBIÉN está mal leído (no sirve
  // `porFechaTotal`). Lo único que quedó en pie es el día y el proveedor.
  const porFecha = new Map()
  const totalesPorProveedor = new Map()
  const registros = []
  let n = 0
  filas.forEach((r, i) => {
    const numero = numeroCanonico(r?.[EN.numero])
    const proveedor = normalizar(r?.[EN.proveedor])
    if (!numero && !proveedor) return
    n++
    const reg = {
      fila: i + FILA_BASE,
      hoja: 'Compras',
      proveedor: String(r?.[EN.proveedor] ?? '').trim() || null,
      cuit: cuitDe(proveedor),
      categoria: String(r?.[EN.categoria] ?? '').trim() || null,
      tipo: tipoDeCompras(r?.[EN.tipo]),
      numero,
      fecha: fechaDeLectura(r?.[EN.fecha]),
      total: importeDeCompras(r?.[EN.total]),
      unidad: String(r?.[EN.unidad] ?? '').trim() || null,
      obra: String(r?.[EN.obra] ?? '').trim() || null,
      detalle: String(r?.[EN.detalle] ?? '').trim() || null,
      concepto: String(r?.[EN.concepto] ?? '').trim() || null,
    }
    registros.push(reg)
    if (numero) empujar(porNumero, numero, reg)
    if (reg.fecha && reg.total != null) empujar(porFechaTotal, `${reg.fecha}|${redondear2(reg.total)}`, reg)
    if (reg.fecha) empujar(porFecha, reg.fecha, reg)
    if (proveedor && reg.total != null) {
      const l = totalesPorProveedor.get(proveedor)
      if (l) l.push(reg.total); else totalesPorProveedor.set(proveedor, [reg.total])
    }
  })
  // Una sola lectura del Sheet alimenta TODO lo que hace falta: el duplicado, el vocabulario con el
  // que se resuelve lo escrito a mano, la historia de imputación con la que se aprende, y la escala
  // de cada proveedor con la que se detecta un importe fuera de rango.
  const usosDeObra = usosDeObraEnCompras(filas)
  return {
    porNumero,
    porFechaTotal,
    porFecha,
    filas: n,
    // LOS VALORES REALES DE LA COLUMNA J. Ver `usosDeObraEnCompras`: son la fuente canónica de la
    // obra cuando el desplegable no se puede leer, y la evidencia de cómo se escribe cada una.
    obras: Object.keys(usosDeObra),
    usosDeObra,
    detalles: detallesPorObra(filas),
    usosDeDetalle: usosDeDetallePorObra(filas),
    escalaPorProveedor: escalasDe(totalesPorProveedor),
    historia: registros.map(aHistoria),
  }
}

/** proveedor normalizado → `{n, max}` de sus totales. Ver `aritmetica.mjs`. */
function escalasDe(totalesPorProveedor) {
  const out = {}
  for (const [prov, totales] of totalesPorProveedor) out[prov] = escalaDeTotales(totales)
  return out
}

/**
 * La escala histórica del proveedor de ESTE comprobante, con la misma noción de identidad que usa el
 * duplicado: primero el nombre normalizado, y si no hay, el nombre del desplegable ya matcheado.
 *
 * Devuelve `{n:0, max:0}` cuando no se sabe nada de ese proveedor — que es lo que hace que el control
 * no opine sobre un proveedor nuevo, en vez de tratarlo como si su máximo fuera cero.
 */
export function escalaDelProveedor(comprobante = {}, indice = {}) {
  const p = normalizar(comprobante?.proveedor)
  if (!p) return { n: 0, max: 0 }
  return indice?.escalaPorProveedor?.[p] ?? { n: 0, max: 0 }
}

function lectorDeCuit(mapa) {
  if (!mapa) return () => null
  const get = mapa instanceof Map ? (k) => mapa.get(k) : (k) => mapa[k]
  return (proveedorNorm) => {
    if (!proveedorNorm) return null
    const c = soloDigitos(get(proveedorNorm) ?? '')
    return c.length === 11 ? c : null
  }
}

function empujar(mapa, clave, reg) {
  const ya = mapa.get(clave)
  if (ya) ya.push(reg); else mapa.set(clave, [reg])
}

/**
 * ¿La fila de Compras es del MISMO proveedor que el comprobante leído?
 *
 * Tres respuestas, no dos: `desconocido` no es `distinto`. Un ticket sin nombre legible no puede
 * afirmar que la fila 800 sea de otro; sólo puede no aportar. Tratar "no sé" como "no" es la forma
 * de perder un duplicado, y como "sí", la de inventar uno.
 */
export function identidadProveedor(comprobante = {}, reg = {}) {
  const ca = soloDigitos(comprobante.cuit)
  const cb = soloDigitos(reg.cuit)
  // El CUIT manda cuando los dos lados lo tienen: es el identificador real del proveedor.
  if (ca.length === 11 && cb.length === 11) return ca === cb ? 'igual' : 'distinto'
  const a = normalizar(comprobante.proveedor)
  const b = normalizar(reg.proveedor)
  if (!a || !b) return 'desconocido'
  if (a === b) return 'igual'
  // "Combustibles Barcelo" contra "COMBUSTIBLES BARCELO SRL": el mismo criterio de contención que
  // usa `matchProveedor` contra el desplegable, para no partir la identidad por un sufijo.
  const min = Math.min(a.length, b.length)
  if (min >= 4 && (a.includes(b) || b.includes(a))) return 'igual'
  return 'distinto'
}

/**
 * EL INSTRUMENTO de una fila de Compras: `F`, `NC` o `ND`. Parte la identidad en tres.
 *
 * Antes era un booleano «¿es nota de crédito?», y con eso la NOTA DE DÉBITO caía en la misma bolsa
 * que la factura: una `ND 0038-00002807` se daba por la misma fila que la `F A 0038-00002807`. Son
 * dos gastos distintos y los dos suman. Ver `claseDeComprobante` en `lectura.mjs`, que es la única
 * definición y la comparten la clave de idempotencia y esta búsqueda.
 */
function claseDeFila(tipo) {
  return claseDeComprobante({ tipo })
}

/** ¿Los dos importes son el mismo? null = alguno no se sabe (no se puede afirmar ni negar). */
function importeCierra(a, b) {
  if (a == null || b == null) return null
  return Math.abs(redondear2(a - b)) <= TOLERANCIA
}

/**
 * ¿Estos dos importes pueden salir del MISMO papel?
 *
 * Sí cuando cierran, cuando alguno no se sabe (no saber no es saber que son distintos), o cuando uno
 * es el otro corrido de coma: `2014940.07` y `201494007` son la misma factura leída con y sin coma,
 * y ése es el error que el OCR comete de verdad. Diez mil contra ocho mil no lo es.
 */
function puedeSerElMismoPapel(a, b) {
  if (a == null || b == null) return true
  if (importeCierra(a, b)) return true
  const x = Math.abs(Number(a)), y = Math.abs(Number(b))
  if (!(x > 0) || !(y > 0)) return false
  const grande = Math.max(x, y), chico = Math.min(x, y)
  // Hasta cuatro lugares: una coma corrida, un punto de miles comido, o los dos.
  for (let k = 1; k <= 4; k++) {
    if (Math.abs(grande - chico * 10 ** k) <= TOLERANCIA * 10 ** k) return true
  }
  return false
}

/**
 * ¿Este comprobante ya está en Compras? Devuelve null, un `CARGADO` o un `PROBABLE`.
 *
 * NO DEPENDE DE ARCA, NI DEL TIPO, NI DEL CUIT. Corre siempre, con lo que haya leído la foto.
 *
 * @param {object} comprobante  el normalizado por `lectura.mjs`
 * @param {{porNumero:Map, porFechaTotal:Map}} indice
 */
export function buscarEnCompras(comprobante = {}, indice = {}) {
  const numero = numeroCanonico(comprobante.numero)
  const tipo = claseDeComprobante(comprobante) === 'F' ? (comprobante.tipo ?? null) : claseDeComprobante(comprobante)
  const fecha = comprobante.fecha ?? null
  const total = comprobante.total == null ? null : redondear2(comprobante.total)
  const sinProveedor = !normalizar(comprobante.proveedor) && soloDigitos(comprobante.cuit).length !== 11

  // ── 1) POR NÚMERO ──────────────────────────────────────────────────────────
  // Un mismo número lo pueden emitir dos proveedores distintos (0001-00000123 lo tiene medio mundo),
  // así que la fila candidata tiene que aguantar además la identidad del proveedor o el importe.
  if (numero) {
    const cands = (indice.porNumero?.get(numero) ?? [])
      .map((r) => ({ r, quien: identidadProveedor(comprobante, r), cierra: importeCierra(total, r.total) }))
      .filter((c) => c.quien !== 'distinto')
      // ═══ EL SIGNO PARTE LA CLAVE (13/08) ═══
      //
      // Una NOTA DE CRÉDITO comparte numeración con las facturas: el mismo proveedor puede emitir la
      // factura A 0113-00010490 y la nota de crédito A 0113-00010490. Sin esta línea, la nota de
      // crédito se daba por "ya cargada" contra la factura y NO entraba nunca — o al revés. Este repo
      // ya pagó dos veces la misma lección: «el número no identifica un cheque» (FISICO 313 ≠ ECHEQ
      // 313, la clave era (instrumento, número)) y «CUIT + número no identifica sin el signo», que
      // costó $41,9M contando notas de crédito como compras.
      //
      // Sólo excluye cuando las DOS puntas saben qué son. Si la fila de Compras no trae el tipo
      // legible —muchas viejas no lo traen— no se afirma nada y la candidata sigue viva, igual que
      // antes: no saber no es saber que son distintas.
      .filter((c) => !(tipo && c.r.tipo && claseDeFila(tipo) !== claseDeFila(c.r.tipo)))
    // (proveedor|CUIT, número) con el importe que cierra, o (número, total) cuando no se sabe quién
    // es: en los dos casos es ÉSTE. Es la clave que cazaba el ticket de Barcelo y no se disparaba.
    const seguras = cands.filter((c) => c.cierra === true || (c.cierra == null && c.quien === 'igual'))
    if (seguras.length) return hallazgo(HALLAZGO.CARGADO, seguras, viaNumero(seguras[0], tipo))
    // Mismo número y mismo proveedor con OTRO importe: un proveedor no emite dos comprobantes con el
    // mismo punto de venta y número. O es éste con un importe mal tipeado, o es una fila mal cargada.
    // Las dos salidas son caras: se pregunta.
    const dudosas = cands.filter((c) => c.quien === 'igual')
    if (dudosas.length) return hallazgo(HALLAZGO.PROBABLE, dudosas, 'proveedor+numero (el importe no cierra)')
  }

  // ── 2) POR FECHA + TOTAL ───────────────────────────────────────────────────
  if (fecha && total != null) {
    const cands = (indice.porFechaTotal?.get(`${fecha}|${total}`) ?? [])
      .map((r) => ({ r, quien: identidadProveedor(comprobante, r) }))
      // El mismo número ya lo resolvió la pasada de arriba; acá interesa el que trae OTRO número
      // (o ninguno), que es el duplicado con un dígito mal leído.
      .filter((c) => !numero || !c.r.numero || c.r.numero !== numero)
    const mismos = cands.filter((c) => c.quien === 'igual')
    // ═══ Y SI ADEMÁS COINCIDE EL CORRELATIVO, NO ES UN "PROBABLE": ES ÉSE (14/08) ═══
    //
    // Mismo proveedor, mismo día, mismo importe al centavo y los mismos ocho dígitos de correlativo,
    // difiriendo sólo en el punto de venta —que es el grupo de dígitos que el OCR más equivoca—. Caso
    // real: `0015-00015751` contra la fila 841, que dice `0001-00015751`, VILLA DEL PINO por
    // $99.998,98 el 12/08. Preguntarle eso al dueño es hacerle revisar un comprobante que el sistema
    // ya sabe cuál es, que es exactamente el trabajo que pidió no hacer.
    //
    // Que dos comprobantes distintos del mismo emisor coincidan el mismo día, en el importe exacto Y
    // en los ocho dígitos del correlativo no es un caso raro: es imposible en la práctica.
    if (numero) {
      const gemelos = mismos.filter((c) => mismoCorrelativo(numero, c.r.numero))
      if (gemelos.length) return hallazgo(HALLAZGO.CARGADO, gemelos, 'proveedor+fecha+importe+correlativo')
    }
    if (mismos.length) return hallazgo(HALLAZGO.PROBABLE, mismos, 'proveedor+fecha+importe')
    // Sin proveedor legible, fecha y total exactos siguen siendo una pista que hay que mostrar. Con
    // proveedor legible y distinto, no: dos compras del mismo día por la misma plata a proveedores
    // distintos es una coincidencia, no un duplicado, y una alarma que suena siempre deja de leerse.
    if (sinProveedor && cands.length) return hallazgo(HALLAZGO.PROBABLE, cands, 'fecha+importe')
  }

  // ── 3) MISMO PROVEEDOR, MISMO DÍA, NÚMERO A UN DÍGITO ──────────────────────
  //
  // ═══ EL DUPLICADO NO PUEDE DEPENDER DE QUE EL NÚMERO ESTÉ BIEN LEÍDO (04/08) ═══
  //
  // ALUMETAL, 31/07/2026. El papel decía `0038-00025942` y $2.014.940,07. El modelo leyó
  // `0036-00025942` y $201.494.007. Esa factura YA estaba en Compras, fila 797.
  //
  // Las dos pasadas de arriba fallaron por la misma razón y en cascada: la del número, porque el
  // número leído era otro; la de fecha+importe, porque el importe leído TAMBIÉN era otro. Cada una
  // suponía que al menos uno de los dos datos estaba bien, y no lo estaba ninguno. El resultado fue
  // $201M falsos entrando al Flujo de Caja sobre un gasto que ya estaba registrado.
  //
  // Lo que sí quedó en pie —y es mucho— es que un OCR se equivoca en UN dígito, no en el número
  // entero: `0036` contra `0038`. Mismo proveedor, mismo día, un carácter de diferencia.
  //
  // ES UN "PROBABLE", NO UN "CARGADO", y tiene que serlo: dos facturas CONSECUTIVAS del mismo
  // proveedor el mismo día (`...3370` y `...3371`) también difieren en un dígito y son dos compras
  // distintas y legítimas. Por eso no se descarta nada solo: se muestra la fila candidata con su
  // número, su fecha y su importe, y quien mira el papel contesta en un segundo. El costo del falso
  // positivo es una pregunta; el del falso negativo ya se midió y fueron $201M.
  //
  // ═══ …PERO EL IMPORTE TIENE QUE PODER SER EL MISMO PAPEL (31/08) ═══
  //
  // Medido en producción ese día, un solo fajo: `0006-00003450` por $8.073,24 frenado contra la fila
  // 918 (`0006-00003453`, $7.000), `0004-00003773` por $13.358,08 contra la 917 ($4.903,22) y
  // `0006-00003452` por $65.000 contra la 918 otra vez. Los tres del mismo corralón, el mismo día, y
  // ninguno era un duplicado: $86.431,32 retenidos esperando una respuesta a una pregunta que no
  // había que hacer. Un proveedor de obra factura cinco o seis veces por día y sus números son
  // consecutivos: la regla de "un dígito" sola convierte eso en una alarma permanente, y una alarma
  // que suena siempre deja de leerse.
  //
  // El caso ALUMETAL que creó esta pasada sigue cubierto, y por eso el filtro NO es "el importe
  // cierra": ahí el importe también estaba mal leído ($201.494.007 contra $2.014.940,07). Pero
  // estaba mal leído POR UNA COMA — los dígitos eran los mismos. Ese es el modo de falla del OCR y
  // se reconoce solo. Dos importes que no cierran ni por escala son dos compras distintas.
  if (numero && fecha) {
    const cands = (indice.porFecha?.get(fecha) ?? [])
      .filter((r) => r.numero && r.numero !== numero
        && (difiereEnUnCaracter(numero, r.numero) || mismoCorrelativo(numero, r.numero)))
      .map((r) => ({ r, quien: identidadProveedor(comprobante, r) }))
      .filter((c) => c.quien === 'igual')
      .filter((c) => puedeSerElMismoPapel(total, c.r.total))
    if (cands.length) {
      const via = difiereEnUnCaracter(numero, cands[0].r.numero)
        ? 'proveedor+fecha+numero a un digito'
        : 'proveedor+fecha+correlativo (otro punto de venta)'
      return hallazgo(HALLAZGO.PROBABLE, cands, via)
    }
  }
  return null
}

/**
 * ¿Los dos números tienen el MISMO correlativo y distinto punto de venta?
 *
 * ═══ POR QUÉ NO ALCANZABA "A UN DÍGITO" (14/08) ═══
 *
 * El punto de venta es el grupo de dígitos que el OCR más equivoca —es chico, va arriba y muchas
 * veces está impreso con otro cuerpo—. Medido en los fajos reales: `0015-00015751` contra
 * `0001-00015751` (VILLA DEL PINO, la misma foto leída dos veces) y `0001-00002807` contra
 * `0038-00002807` (Trielec). Los dos primeros difieren en DOS caracteres, así que la pasada de "un
 * dígito" no los agarraba; el correlativo, en cambio, coincide entero en los ocho.
 *
 * Sigue siendo un PROBABLE y no un CARGADO: un proveedor con dos puntos de venta puede llegar al
 * mismo correlativo en los dos. Pero además tiene que ser el MISMO PROVEEDOR y el MISMO DÍA, y esa
 * coincidencia triple es rarísima. El costo del falso positivo es una pregunta; el del falso
 * negativo, un gasto contado dos veces.
 */
export function mismoCorrelativo(a, b) {
  const x = String(a ?? ''); const y = String(b ?? '')
  if (x.length < 9 || y.length < 9 || x === y) return false
  return x.slice(-8) === y.slice(-8) && x.slice(0, -8) !== y.slice(0, -8)
}

/**
 * ¿Estos dos números canónicos difieren en a lo sumo UN carácter? Sustitución, agregado o faltante.
 *
 * No se calcula la distancia de edición real: sólo hace falta saber si es ≤1, y así el costo es
 * lineal. Es el mismo criterio que `imputacion.mjs` usa para tolerar un error de tipeo en un rótulo,
 * pero acá no se importa de allá a propósito: aquello tolera para ACERTAR un match y esto sospecha
 * para PREGUNTAR. Que las dos reglas puedan cambiar por separado, sin arrastrarse, vale las diez
 * líneas.
 */
export function difiereEnUnCaracter(a, b) {
  const x = String(a ?? '')
  const y = String(b ?? '')
  if (x === y) return true
  const [largo, corto] = x.length >= y.length ? [x, y] : [y, x]
  if (largo.length - corto.length > 1) return false
  let i = 0; let j = 0; let fallas = 0
  while (i < largo.length && j < corto.length) {
    if (largo[i] === corto[j]) { i++; j++; continue }
    if (++fallas > 1) return false
    if (largo.length === corto.length) { i++; j++ } else { i++ }
  }
  return fallas + (largo.length - i) + (corto.length - j) <= 1
}

function viaNumero(mejor, tipo) {
  if (tipo && mejor.r.tipo && tipo === mejor.r.tipo) return 'tipo+numero'
  if (mejor.quien === 'igual') return soloDigitos(mejor.r.cuit).length === 11 ? 'cuit+numero' : 'proveedor+numero'
  return 'numero+total'
}

function hallazgo(que, cands, via) {
  return { que, ...cands[0].r, via, otras: cands.length - 1 }
}

/**
 * Lee la pestaña viva y devuelve el índice. Nunca lanza: si Google no contesta, se declara en `ok`.
 * No poder mirar Compras NO es lo mismo que "no está cargado", y quien llame tiene que distinguirlo
 * — el mensaje lo dice en vez de dejar creer que se miró.
 *
 * @param {object} google  cliente de `lib/google.mjs`
 */
export async function indiceDeCompras(google, { fileId, cuitPorProveedor = null } = {}) {
  const id = fileId || process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
  const vacio = {
    porNumero: new Map(), porFechaTotal: new Map(), porFecha: new Map(), filas: 0,
    obras: [], usosDeObra: {},
    detalles: {}, usosDeDetalle: {}, escalaPorProveedor: {}, historia: [],
  }
  if (typeof google?.readSheetValues !== 'function') return { ok: false, ...vacio, error: 'sin cliente de Google' }
  try {
    return { ok: true, ...indexarCompras(await google.readSheetValues(id, RANGO), { cuitPorProveedor }) }
  } catch (e) {
    return { ok: false, ...vacio, error: String(e?.message ?? e).slice(0, 200) }
  }
}

/**
 * El vocabulario VIVO de la columna K por obra, para poder resolver lo escrito a mano.
 * Se arma del mismo índice: una sola lectura del Sheet alimenta el duplicado y la imputación.
 *
 * @returns {Object<string,string[]>} obra → detalles ya usados, del más usado al menos
 */
export function detallesPorObra(filas = []) {
  const out = {}
  for (const [obra, m] of contarDetalles(filas)) {
    out[obra] = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d)
  }
  return out
}

/**
 * Lo mismo, pero con el CONTEO. Es lo que distingue el vocabulario de una obra del ruido que alguien
 * escribió una vez en esa columna.
 *
 * ═══ POR QUÉ HACE FALTA CONTAR (04/08) ═══
 *
 * El bot escribió `Rodrigo Echegaray` en la columna K. No es un frente, ni un vehículo, ni un rubro:
 * es un nombre de persona que estaba en las observaciones de la factura. Como la columna K no tiene
 * desplegable, su única lista legítima es lo que ya se usó — y "ya se usó" incluye lo que alguien
 * escribió UNA vez.
 *
 * La regla que separa una cosa de la otra sin tener que clasificar textos: **para completarse solo,
 * un detalle tiene que ser vocabulario de esa obra, o sea haber aparecido más de una vez. Para
 * OFRECERSE en el menú, con una vez alcanza** — ahí decide una persona, que es exactamente la
 * diferencia. Un frente real ("Planta de BSA", "Camion - 608D") aparece decenas de veces; el ruido,
 * una sola.
 *
 * @returns {Object<string, Object<string, number>>} obra → detalle → cuántas veces
 */
export function usosDeDetallePorObra(filas = []) {
  const out = {}
  for (const [obra, m] of contarDetalles(filas)) out[obra] = Object.fromEntries(m)
  return out
}

/**
 * LOS VALORES REALES DE LA COLUMNA J, con su conteo. La otra cara del desplegable.
 *
 * ═══ POR QUÉ NO ALCANZA EL DESPLEGABLE (05/08) ═══
 *
 * `listas.mjs` lee la lista de la columna J pidiendo la METADATA de validación de un rango chico.
 * Cuando Google no contesta esa llamada —o cuando el rango se mueve— la lista vuelve VACÍA, y con la
 * lista vacía `matchUnico` no puede afirmar nada: el bot deja de resolver la obra escrita a mano y,
 * peor, el formulario de Corregir dejaba entrar el texto libre («Estrella» donde la columna dice
 * «LA ESTRELLA»).
 *
 * Pero la columna J tiene 293 filas escritas por el dueño, y ahí está el vocabulario canónico REAL:
 * el valor tal como él lo escribe. Es la misma lectura que ya se hace para buscar el duplicado, así
 * que no cuesta una consulta más.
 *
 * NO REEMPLAZA AL DESPLEGABLE, LO RESPALDA. El desplegable es lo que la celda va a aceptar sin
 * quedar en rojo, y por eso manda; esto es la evidencia de qué se escribió de verdad, y sirve para
 * (a) resolver la obra cuando el desplegable no se pudo leer y (b) descubrir un valor legítimo que
 * el desplegable todavía no tiene.
 *
 * @returns {Object<string, number>} valor exacto de la columna J → cuántas filas lo usan
 */
export function usosDeObraEnCompras(filas = []) {
  const out = {}
  for (const r of filas) {
    const obra = String(r?.[EN.obra] ?? '').trim()
    if (!obra) continue
    out[obra] = (out[obra] ?? 0) + 1
  }
  return out
}

/** Cuántas filas tiene que tener una obra de la columna J para tomarse como vocabulario canónico. */
export const MIN_USOS_OBRA = 2

/**
 * Las obras de la columna J que son vocabulario y no un tipeo suelto: usadas `min` veces o más.
 *
 * El umbral es el mismo criterio que `detallesFirmes` y por la misma razón: una obra real aparece
 * decenas de veces en 293 filas; un valor mal escrito una sola vez —justamente el «Estrella» que
 * escribió el bot esta semana— aparece una. Sin el umbral, el error de ayer se convertiría en el
 * vocabulario de mañana.
 */
export function obrasFirmes(usos = {}, min = MIN_USOS_OBRA) {
  return Object.entries(usos ?? {}).filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).map(([o]) => o)
}

/** Cuántas veces la usó cada obra un detalle antes de completarlo solo. Ver `usosDeDetallePorObra`. */
export const MIN_USOS_DETALLE = 2

/** obra → detalles que la obra usó al menos `min` veces, del más usado al menos. */
export function detallesFirmes(usos = {}, min = MIN_USOS_DETALLE) {
  const out = {}
  for (const [obra, m] of Object.entries(usos ?? {})) {
    const l = Object.entries(m ?? {}).filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).map(([d]) => d)
    if (l.length) out[obra] = l
  }
  return out
}

function contarDetalles(filas = []) {
  const cuenta = new Map()
  for (const r of filas) {
    const obra = String(r?.[EN.obra] ?? '').trim()
    const det = String(r?.[EN.detalle] ?? '').trim()
    if (!obra || !det) continue
    if (!cuenta.has(obra)) cuenta.set(obra, new Map())
    const m = cuenta.get(obra)
    m.set(det, (m.get(det) ?? 0) + 1)
  }
  return cuenta
}

/**
 * Las filas de Compras con la forma que espera `imputacion-aprendida.mjs` (`indice.historia`).
 *
 * POR QUÉ ACÁ Y NO OTRA TABLA. La lib que APRENDE cómo imputa el dueño ya existe y es la única que
 * sabe hacerlo (perfiles por proveedor, umbrales calibrados, confianza declarada). Lo que le faltaba
 * no era inteligencia: era que alguien le pasara la historia CON el detalle de la columna K.
 * `public.costos_obra` —su feeder original— espeja Compras pero PEGA detalle y concepto en un solo
 * campo (`sync-compras.mjs`) y sólo guarda las filas que ya tienen obra. La pestaña viva los tiene
 * separados y los tiene todos.
 *
 * Entonces: la historia sale de la MISMA lectura que ya se hace para el duplicado, y el que aprende
 * sigue siendo uno solo. Cero consultas de más, cero segunda implementación.
 *
 * `historiaDeCompras(filas)` —un envoltorio que hacía `indexarCompras(filas).historia`— se borró el
 * 05/08: no lo llamaba nadie salvo su propio test. Una segunda puerta de entrada al mismo índice es
 * una invitación a leer la pestaña dos veces.
 */
function aHistoria(reg) {
  return {
    proveedor: reg.proveedor,
    unidad_negocio: reg.unidad,
    obra_texto: reg.obra,
    detalle: reg.detalle,
    concepto: reg.concepto,
    // La CATEGORÍA (columna B) viaja desde el 04/08: es la cuarta columna que toda fila cargada por
    // el bot dejaba vacía, y la aprende el mismo módulo que aprende las otras tres.
    categoria: reg.categoria,
  }
}
