// UN COMPROBANTE LEÍDO → el objeto que el cargador ya sabe escribir. NÚCLEO PURO.
//
// ═══ QUÉ RESUELVE ═══
//
// El dueño saca una foto y la manda al canal. Entre esa foto y la fila de "Compras" hay una sola
// pregunta difícil: **qué números son cuáles**. Todo lo demás ya existe —el contrato de columnas
// (`lib/carga-comprobantes.mjs`) y el cargador (`scripts/cargar-comprobantes-compras.mjs`)— y no se
// reescribe acá.
//
// ═══ LAS DOS REGLAS DURAS DEL REPO, Y POR QUÉ VIVEN EN ESTE ARCHIVO ═══
//
// 1. **M = Total − IVA.** No la aplica este archivo: la aplica `valoresInput`. Lo que sí es
//    responsabilidad de acá es GARANTIZAR QUE EL TOTAL VIAJE. Si el total no llega, `valoresInput`
//    cae al neto crudo del comprobante y la percepción de IIBB/SUSS —o el impuesto interno del
//    combustible— queda afuera del Total del Sheet. Esa es, textual, la carga MAL hecha que este
//    repo ya pagó. Por eso `normalizar` rechaza un comprobante sin total.
//
// 2. **UNA NOTA DE CRÉDITO VA CON SIGNO NEGATIVO.** Contarlas como compras costó $41,9M de error y
//    $7,2M de IVA sin declarar. El signo se aplica ACÁ, sobre los importes leídos, y no en
//    `valoresInput`: así el cargador de línea de comandos —que recibe fajos armados a mano y tiene
//    sus propios tests— sigue comportándose exactamente igual que antes. Un comprobante que sale de
//    este archivo ya trae el signo puesto, venga por el chat o por donde sea.
//
// ═══ ACÁ NO HAY MODELO ═══
//
// La llamada de visión vive en `vision.mjs`, al lado. Están separados a propósito y hay un test que
// lo hace cumplir: la clave de idempotencia, el signo, la obra y la validación las usan la puerta,
// el agrupado y la escritura, y ninguno de esos caminos puede terminar arrastrando el cliente de un
// modelo por un import. Un modelo en un camino que tiene que ser determinístico es lo más grave que
// puede pasar en este subsistema.
//
// ═══ LO QUE NO HACE ═══
//
// No inventa. Si la foto no dice la obra, `obra` queda en null y alguien la pregunta. Si el emisor
// no está en el desplegable estricto, se marca y se pregunta. Un dato que el papel no muestra no
// existe: es la regla de oro #1 del OS.

import { aNumero, redondear2, normalizar } from '../carga-comprobantes.mjs'
import { valido as cuitValido } from '../cuit.mjs'
import { matchUnico } from './imputacion.mjs'

/** Formatos que un modelo de visión puede mirar TAL CUAL. La API no acepta ningún otro. */
export const MEDIA_SOPORTADOS = Object.freeze([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
])

/**
 * Lo que se ACEPTA en el canal: lo mirable más lo convertible.
 *
 * ═══ EL IPHONE MANDA HEIC Y SE DESCARTABA EN SILENCIO (13/08) ═══
 *
 * De ocho archivos que mandó el dueño, siete eran `.HEIC` y el bot cargó tres sin decir nada de los
 * otros cinco. HEIC es el formato POR DEFECTO de la cámara del iPhone: no es un caso borde, es el
 * caso normal. Se convierte a JPEG antes de mirarlo (`imagen.mjs`) —la API tampoco lo acepta— y si no
 * se puede convertir, el archivo se NOMBRA en el resumen con su motivo. Nunca desaparece.
 */
export const MEDIA_ACEPTADOS = Object.freeze([
  ...MEDIA_SOPORTADOS, 'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
])

/**
 * El tipo por la EXTENSIÓN del nombre, o null.
 *
 * Mattermost devuelve el `mime_type` que declaró el cliente que subió el archivo, y para un `.HEIC`
 * del iPhone eso llega vacío o como `application/octet-stream` según por dónde entre. La extensión es
 * la otra evidencia y es la que el dueño ve escrita en su pantalla.
 */
export function tipoPorExtension(nombre) {
  const ext = String(nombre ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (!ext) return null
  return {
    heic: 'image/heic', heif: 'image/heif',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    pdf: 'application/pdf',
  }[ext] ?? null
}

/** Techo de tamaño por adjunto. Arriba de esto la API rechaza y no vale la pena intentarlo. */
export const MAX_BYTES_ADJUNTO = 5 * 1024 * 1024

/**
 * El CUIT de la propia empresa. Todo comprobante de compra lo trae —Echegaray es el COMPRADOR— y el
 * modelo de visión lo devolvía como si fuera el del emisor. Un CUIT de emisor igual a éste no es un
 * dato dudoso: es, con certeza, el dato equivocado, y se descarta.
 */
export const CUIT_EMPRESA = String(process.env.ORQ_CUIT_EMPRESA || '30716304643').replace(/\D/g, '')

/** Sólo dígitos. Un CUIT con guiones y uno sin guiones son el mismo CUIT. */
export function soloDigitos(v) {
  return String(v ?? '').replace(/\D/g, '')
}

/**
 * Número de comprobante canónico: `PPPP-NNNNNNNN`.
 *
 * POR QUÉ NORMALIZAR. La misma factura se lee "0113-00010489", "113-10489" y "0113 00010489" según
 * cómo salga la foto. Si la clave de idempotencia se armara con el texto crudo, el mismo comprobante
 * mandado dos veces entraría dos veces — que es exactamente lo que hay que impedir. Devuelve null si
 * no hay dígitos: sin número no hay clave, y eso se trata aparte.
 */
export function numeroCanonico(v) {
  const s = String(v ?? '').trim()
  if (!s) return null
  const m = s.match(/(\d{1,5})\s*[-–/ ]\s*(\d{1,10})/)
  if (m) return `${puntoDeVenta(m[1])}-${m[2].padStart(8, '0')}`
  const d = soloDigitos(s)
  if (!d) return null
  // Sin separador: los últimos 8 dígitos son el correlativo y lo de adelante, el punto de venta.
  if (d.length > 8) return `${puntoDeVenta(d.slice(0, d.length - 8))}-${d.slice(-8)}`
  return `0000-${d.padStart(8, '0')}`
}

/**
 * EL PUNTO DE VENTA, A CUATRO DÍGITOS. Los ceros de más NO son parte de la identidad.
 *
 * ═══ EL DEFECTO (medido el 14/08 sobre los fajos reales) ═══
 *
 * `padStart(4)` sobre lo que devuelve el OCR conserva los ceros que el papel imprime de más: un
 * ticket que dice `00016-00029784` daba la clave `c:30549581710|00016-00029784` y el mismo ticket
 * leído `0016-00029784` daba `c:30549581710|0016-00029784`. **Dos claves para un solo comprobante**:
 *
 *   · `colapsarRepetidos` no unía las dos fotos del mismo papel — el dueño veía dos líneas;
 *   · `yaCargados` no encontraba el que ya estaba — y ahí se duplica un gasto en el Flujo de Fondos;
 *   · el chequeo contra `comprobantes_arca` fallaba, porque ARCA guarda `punto_venta` SIN ceros a la
 *     izquierda y `numeroDeArca` lo devuelve a cuatro dígitos (`0016`). O sea: las dos mitades del
 *     mismo control estaban escribiendo el número distinto.
 *
 * Casos reales en los fajos del 13 y 14/08: `00113-00014352` (Combustibles Barcelo) y
 * `00016-00029784` (Clavero/Axion, tres fotos del mismo ticket que no colapsaron).
 *
 * Un punto de venta con más de cuatro dígitos SIGNIFICATIVOS se respeta tal cual —la numeración
 * electrónica nueva los admite—; lo que se saca son los ceros de relleno, exactamente como los saca
 * ARCA. La regla es: la identidad es el NÚMERO, no cómo lo imprimió la impresora fiscal.
 */
export function puntoDeVenta(v) {
  const d = soloDigitos(v).replace(/^0+/, '')
  return (d || '0').padStart(4, '0')
}

/**
 * Las OTRAS formas en que esta misma clave se pudo haber guardado antes de que el punto de venta se
 * normalizara. Vacío si no hay ninguna.
 *
 * NO ES COSMÉTICA: el registro `comunicacion.comprobantes_cargados` tiene claves escritas con la
 * forma vieja (dos, al 14/08: `c:33708332599|00113-00014352` y `c:27326890397|00001-00000052`). Si
 * la búsqueda preguntara sólo por la forma nueva, esos dos comprobantes se podrían volver a cargar
 * —un gasto duplicado— justo por haber arreglado la clave. Se pregunta por las dos y no hace falta
 * ninguna migración: el código anda antes y después de que la base se limpie, si es que se limpia.
 */
export function clavesEquivalentes(clave) {
  const s = String(clave ?? '')
  const m = s.match(/^(.*\|)(\d{4})-(\d{8})$/)
  if (!m) return []
  const [, prefijo, pv, correlativo] = m
  const sinCeros = pv.replace(/^0+/, '') || '0'
  const out = new Set()
  // Las formas que producía el `padStart(4)` viejo: el punto de venta con 5 y 6 dígitos de relleno.
  for (const largo of [5, 6]) out.add(`${prefijo}${sinCeros.padStart(largo, '0')}-${correlativo}`)
  out.delete(s)
  return [...out]
}

/**
 * Letra del comprobante → el valor que espera el desplegable G, vía `tipoComprobante`.
 * Una nota de crédito es 'NC' cualquiera sea su letra: el desplegable tiene un solo "N C".
 */
export function tipoDesdeLectura({ letra, esNotaCredito, esNotaDebito } = {}) {
  if (esNotaCredito) return 'NC'
  if (esNotaDebito) return 'ND'
  const s = String(letra ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  if (!s) return null
  if (/NOTA\s*(DE\s*)?CREDITO|^N\s*\/?\s*C$|^NC/.test(s)) return 'NC'
  // ═══ LA NOTA DE DÉBITO NO ES UNA FACTURA, Y COMPARTE SU NUMERACIÓN (14/08) ═══
  //
  // Es el instrumento con el que llegan los intereses, las diferencias de cambio y los recargos. La
  // numeración corre por (tipo, punto de venta): un proveedor puede emitir la `FA 0038-00002807` y la
  // `ND A 0038-00002807`, y son dos gastos distintos. Sin distinguirla, la ND choca contra la clave de
  // la factura y el bot contesta «ya estaba cargado» sobre un gasto que nunca entró — un mensaje de
  // éxito tapando plata perdida. Es la tercera vez que este repo paga la misma lección: la identidad
  // es (INSTRUMENTO, número), nunca el número solo.
  if (/NOTA\s*(DE\s*)?DEBITO|^N\s*\/?\s*D$|^ND\b/.test(s)) return 'ND'
  // Se saca la palabra del comprobante y queda la letra. Filtrar por caracteres ("quedate con las
  // A, B y C") parece equivalente y no lo es: sobre "FACTURA B" deja "ACAB" y devuelve una A. El
  // test lo agarró antes de que un gasto quedara con el tipo de comprobante equivocado.
  const limpio = s.replace(/FACTURAS?|FACT|FAC|COMPROBANTE|TICKET|\bF\b/g, ' ').trim()
  const m = limpio.match(/\b([ABC])\b/)
  return m ? m[1] : null
}

/**
 * OBRA desde la anotación manuscrita, contra la lista ESTRICTA del desplegable J.
 *
 * NO INFIERE NADA. "Estrella" escrito a mano matchea la obra "Estrella" del desplegable; un
 * comprobante sin anotación devuelve null y el bot pregunta. Inferir la obra por el proveedor o por
 * la fecha sería fabricar imputación contable, que es la peor forma de fabricar un dato: no se nota
 * hasta que el margen de la obra está mal.
 *
 * El matcheo —exacto, por contención, y por palabras tolerando plural y error de tipeo— vive en
 * `imputacion.mjs`, que es el que también resuelve el detalle de la columna K. Acá queda la puerta
 * angosta que usa el formulario de "Corregir": una obra, o null.
 *
 * @param {string|null} anotacion  lo que el modelo transcribió, tal cual
 * @param {string[]} obras         valores exactos del desplegable estricto
 * @returns {{valor:string, via:string}|null}
 */
export function obraDeAnotacion(anotacion, obras = []) {
  return matchUnico(anotacion, obras)
}

/**
 * CAE canónico: **exactamente 14 dígitos**, o null.
 *
 * Es el dato más fuerte que trae un comprobante electrónico —identifica uno y sólo uno en todo
 * ARCA— y por eso mismo un CAE mal leído es peligroso: conciliaría contra otra factura. Medido
 * sobre las 558 filas de `comprobantes_arca`, TODOS tienen 14 dígitos. Cualquier otra cosa que
 * devuelva la visión (el CUIT del comprador, un pedazo del código de barras) se descarta.
 */
export function caeCanonico(v) {
  const d = soloDigitos(v)
  return d.length === 14 ? d : null
}

/**
 * Clave de idempotencia de un comprobante: **(CUIT emisor, tipo, número)**.
 *
 * Es una sola cadena y NO una tupla de columnas anulables a propósito. En este repo ya vivió un
 * índice único sobre 206 NULLs sin restringir nada: con `cuit` nulo, `unique (cuit,tipo,numero)` deja
 * entrar el mismo comprobante infinitas veces. Acá la columna es TEXT NOT NULL y el único que decide
 * su forma es esta función.
 *
 * Si no hay CUIT (un ticket que no lo imprime), se degrada al nombre del proveedor normalizado y se
 * DECLARA en el prefijo: `p:` es una clave más débil y quien la lea tiene que saberlo.
 *
 * @returns {{clave:string, fuerte:boolean}|null}  null = no hay con qué deduplicar
 */
/**
 * EL INSTRUMENTO del comprobante: `NC`, `ND` o `F` (factura, tique, boleta — todo lo que SUMA).
 *
 * ═══ POR QUÉ ES UNA CLASE Y NO UN BOOLEANO, Y POR QUÉ LA LETRA NO ENTRA ═══
 *
 * La numeración corre por (tipo, punto de venta). Con un booleano `esNotaCredito` sólo hay dos
 * bolsas, y la NOTA DE DÉBITO cae en la misma que la factura: `ND A 0038-00002807` y
 * `FA 0038-00002807` del mismo proveedor daban la MISMA clave, así que la segunda que llegaba se
 * rechazaba como "ya cargada". Tres instrumentos, tres bolsas.
 *
 * La LETRA (A/B/C) sigue afuera, y eso no es una omisión: es la decisión del 04/08. Es el dato menos
 * confiable del papel —una sola letra, en un tique térmico— y hacerla parte de la identidad convirtió
 * un problema de OCR en un gasto perdido (el tique de Barcelo del 03/08). Un comprobante cuya letra
 * no se leyó cae en la MISMA bolsa que uno cuya letra sí se leyó, que es lo que impide que el mismo
 * papel entre dos veces por haberse leído distinto.
 */
export function claseDeComprobante({ tipo, esNotaCredito, esNotaDebito } = {}) {
  if (esNotaCredito === true) return 'NC'
  if (esNotaDebito === true) return 'ND'
  const t = String(tipo ?? '').toUpperCase().replace(/[^A-Z]/g, '')
  if (t === 'NC') return 'NC'
  if (t === 'ND') return 'ND'
  return 'F'
}

export function claveComprobante({ cuit, tipo, numero, proveedor, esNotaCredito, esNotaDebito } = {}) {
  const n = numeroCanonico(numero)
  if (!n) return null
  // ═══ LA LETRA NO PUEDE ANULAR LA CLAVE (04/08) ═══
  //
  // Acá decía `if (!n || !t) return null`: sin letra no había clave, y sin clave `escribirFajo`
  // salteaba el comprobante en silencio y contestaba "ya estaba cargado". Es exactamente lo que pasó
  // con el tique de Combustibles Barcelo del 03/08 ($60.000,02): "TIQUE FACTURA A" no es "FACTURA A"
  // y la visión devolvió la letra vacía.
  //
  // La letra es el dato MENOS confiable del papel —es una sola letra, en un tique térmico, muchas
  // veces borroneada— y hacer depender de ella la identidad del comprobante convierte un problema de
  // OCR en un gasto perdido. La identidad real es (EMISOR, punto de venta, número): la numeración
  // corre por punto de venta, y ningún proveedor nos manda una A y una B con el mismo punto de venta
  // y el mismo correlativo.
  //
  // Lo que SÍ se mantiene separado es la NOTA DE CRÉDITO: comparte numeración con las facturas y
  // confundir una con otra ya costó $41,9M. Va en la clave por su propio flag, que no depende de que
  // se lea ninguna letra.
  // La FACTURA no lleva marca, y eso es a propósito: es la bolsa que ya tenían todas las claves
  // escritas en `comunicacion.comprobantes_cargados`. Agregarle una marca habría invalidado el
  // registro entero y todo lo ya cargado se habría podido cargar de nuevo. Las notas —que antes
  // colisionaban— sí la llevan.
  const clase = claseDeComprobante({ tipo, esNotaCredito, esNotaDebito })
  const marca = clase === 'F' ? '' : `${clase}|`
  const c = soloDigitos(cuit)
  if (c.length === 11) return { clave: `c:${c}|${marca}${n}`, fuerte: true }
  const p = normalizar(proveedor)
  if (!p) return null
  return { clave: `p:${p}|${marca}${n}`, fuerte: false }
}

/** Problemas que impiden ARMAR el comprobante. Distintos de los de `validar` del cargador. */
export const FALTA = Object.freeze({
  TOTAL: 'total',
  FECHA: 'fecha',
  PROVEEDOR: 'proveedor',
  NUMERO: 'numero',
  ILEGIBLE: 'ilegible',
})

/**
 * Lectura cruda del modelo → comprobante normalizado, **con el signo ya aplicado**.
 *
 * Lo que devuelve entra tal cual a `valoresInput` del contrato de columnas. Los importes salen como
 * NÚMEROS (no como texto es-AR) porque el signo hay que poder aplicarlo, y multiplicar un string por
 * −1 es cómo se fabrica un NaN silencioso.
 *
 * @param {object} crudo  el JSON que devolvió el modelo
 * @returns {{comprobante:object, faltantes:string[], dudas:string[]}}
 */
export function normalizar_lectura(crudo = {}) {
  // ═══ LA LETRA Y EL FLAG PUEDEN CONTRADECIRSE, Y EL SIGNO NO PUEDE DEPENDER DE UNO SOLO (04/08) ═══
  //
  // Acá decía `const esNC = crudo.es_nota_credito === true`, y el tipo se calculaba después mirando
  // TAMBIÉN la letra. O sea que una lectura con `letra:"NOTA DE CREDITO A"` y `es_nota_credito:false`
  // —que es lo que devuelve el modelo cuando ve el rótulo pero se olvida del flag— salía de acá con
  // `tipo:'NC'` y los importes en POSITIVO: una nota de crédito contada como compra. Es exactamente
  // el error que ya costó $41,9M en este repo, y el 04/08 volvió a pasar con la nota de HORMISERV.
  //
  // El signo se decide con las DOS señales: alcanza con que una diga nota de crédito. Que sobre-marque
  // una factura como NC es un error visible al instante (un gasto en negativo salta); que sub-marque
  // una nota de crédito es invisible hasta que no cierra el IVA del ejercicio.
  const tipo = tipoDesdeLectura({
    letra: crudo.letra,
    esNotaCredito: crudo.es_nota_credito === true,
    esNotaDebito: crudo.es_nota_debito === true,
  })
  const esNC = crudo.es_nota_credito === true || tipo === 'NC'
  // LA NOTA DE DÉBITO NO CAMBIA EL SIGNO: suma, igual que una factura. Lo único que cambia es la
  // IDENTIDAD —comparte numeración con la factura— y por eso viaja hasta la clave. Confundir las dos
  // cosas sería el error de $41,9M al revés: restar un gasto que suma.
  const esND = !esNC && (crudo.es_nota_debito === true || tipo === 'ND')
  const signo = esNC ? -1 : 1
  const con = (v) => { const n = aNumero(v); return n == null ? null : redondear2(Math.abs(n) * signo) }

  const iva21 = con(crudo.iva_21) ?? 0
  const iva105 = con(crudo.iva_105) ?? 0
  // El IVA que va a la columna N es la SUMA de las alícuotas. Se leen por separado igual, y viajan
  // en `detalle`, porque controlar contra ARCA exige saber cuánto salió a cada alícuota.
  const iva = redondear2(iva21 + iva105)
  const total = con(crudo.total)
  const neto = con(crudo.neto_gravado)
  const otros = con(crudo.otros_tributos) ?? 0

  const proveedor = String(crudo.emisor ?? '').trim() || null
  const cuit = soloDigitos(crudo.cuit)
  const numero = numeroCanonico(crudo.numero)
  const fecha = fechaDeLectura(crudo.fecha)

  const faltantes = []
  if (crudo.legible === false) faltantes.push(FALTA.ILEGIBLE)
  if (total == null) faltantes.push(FALTA.TOTAL)
  if (!fecha) faltantes.push(FALTA.FECHA)
  if (!proveedor) faltantes.push(FALTA.PROVEEDOR)
  if (!numero) faltantes.push(FALTA.NUMERO)

  return {
    comprobante: {
      proveedor,
      // El nombre que leyó la OTRA pasada de visión, cuando hubo revisión y las dos difieren. Quien
      // decide cuál vale es el desplegable ESTRICTO de Compras, no el modelo: `armarItem` prueba las
      // dos y se queda con la que matchea.
      proveedorAlt: textoODefault(crudo.emisor_alt),
      // ═══ EL DÍGITO VERIFICADOR, PORQUE ESTE CUIT ES PARTE DE UNA CLAVE (26/08/2026) ═══
      //
      // La única validación era «tiene 11 dígitos». Un dígito mal leído por OCR pasa ese filtro, y
      // este CUIT entra en `claveComprobante()`: con un dígito cambiado la clave es OTRA, la barrera
      // de duplicados no ve el duplicado, y el mismo gasto se carga dos veces. Encima `faltantes.mjs`
      // deja pasar una fila sin nombre de proveedor confiando justamente en este número.
      //
      // `valido()` corre el módulo-11 y ya existía, testeado, en `lib/cuit.mjs`. Un CUIT que no cierra
      // se descarta como si no se hubiera leído —que es la verdad— en vez de propagarse como dato.
      cuit: cuit.length === 11 && cuit !== CUIT_EMPRESA && cuitValido(cuit) ? cuit : null,
      tipo,
      esNotaCredito: esNC,
      esNotaDebito: esND,
      numero,
      // El CAE viaja aunque hoy no se escriba en ninguna celda: es la clave con la que se concilia
      // contra ARCA, y es la que permite decir "el número que leí estaba mal, el bueno es éste".
      cae: caeCanonico(crudo.cae),
      fecha,
      // `neto` va informativo: `valoresInput` DERIVA M = total − iva cuando hay total, y ese es el
      // camino correcto. Se conserva para poder mostrar la discrepancia (la percepción absorbida).
      neto,
      iva: iva === 0 ? null : iva,
      total,
      otrosTributos: otros === 0 ? null : otros,
      condicion: textoODefault(crudo.condicion_venta),
      // LO QUE LA VISIÓN AISLÓ COMO CONDICIÓN ESCRITA A MANO, aparte de la impresa. Viaja crudo:
      // quien lo convierte en «Cuenta Corriente» o «Contado» es `condicionDeAnotacion`, y quien
      // decide que le gana a la impresa es `armarItem`. Acá no se decide, se transporta.
      condicionManuscrita: textoODefault(crudo.condicion_manuscrita),
      formaPago: textoODefault(crudo.forma_pago),
      concepto: textoODefault(crudo.concepto),
      anotacion: textoODefault(crudo.anotacion_manuscrita),
      // ═══ EL ARCHIVO TRAÍA MÁS DE UN COMPROBANTE (13/08) ═══
      //
      // Un adjunto produce UN ítem: dos tickets sobre la mesa en la misma foto, o un PDF con cinco
      // facturas, se leían como uno solo y los otros desaparecían sin que nada lo dijera. No se
      // resuelve leyendo varios de un archivo —eso cambia el contrato de la visión y de la
      // idempotencia—: se resuelve DECLARÁNDOLO, para que el dueño mande los otros por separado en vez
      // de darlos por cargados. Un gasto perdido en silencio es el peor resultado de este flujo.
      // ═══ EL PAPEL QUE NO ES UNA FACTURA (21/08) ═══
      //
      // Dos presupuestos de CON-SEC llegaron por el chat; el modelo ESCRIBIÓ «no es una factura: es
      // un presupuesto/remito» en las dudas… y el flujo igual los encaminó a carga, eligiendo encima
      // el precio «de lista» entre dos totales impresos. La duda en texto libre no gobierna nada:
      // el dato tiene que viajar como CAMPO para que `faltantes.mjs` lo pueda frenar.
      esPresupuestoORemito: crudo.es_presupuesto_o_remito === true,
      variosComprobantes: crudo.varios_comprobantes === true,
      cuantosComprobantes: Number.isFinite(Number(crudo.cuantos_comprobantes))
        ? Number(crudo.cuantos_comprobantes) : null,
      detalle: { iva21: iva21 || null, iva105: iva105 || null },
    },
    faltantes,
    dudas: Array.isArray(crudo.dudas) ? crudo.dudas.map((d) => String(d).slice(0, 160)).slice(0, 5) : [],
  }
}

/** Alias en camelCase, que es como se escribe el resto del repo. */
export const normalizarLectura = normalizar_lectura

/** Cómo se marca en la columna L lo que estaba escrito a mano. Es contrato, no formato. */
export const MARCA_A_MANO = '· a mano:'

/**
 * EL CONCEPTO DE LA COLUMNA L, CON LA TRANSCRIPCIÓN LITERAL DE LO ESCRITO A MANO.
 *
 * ═══ DECISIÓN DEL DUEÑO (04/08) ═══
 *
 * `<descripción de lo comprado> · a mano: "<transcripción literal>"`. Así lo cargó él a mano los
 * siete comprobantes de ese día: `· a mano: "Ford XLS"`, `· a mano: "Estrella c/c"`,
 * `· a mano: "SF. Cuenta cte"`, `· a mano: "Camion · Corpodos Pagos"`.
 *
 * LA TRANSCRIPCIÓN VA SIEMPRE, AUNQUE ADEMÁS SE HAYA USADO PARA IMPUTAR. Ese es todo el punto: la
 * anotación es la que decide a qué obra y a qué frente se le carga el gasto, y esa decisión se
 * discute meses después, cuando el margen de la obra no cierra. Si lo único que quedó es el resultado
 * de la imputación —"MESSINA / Planta de BSA"— no hay contra qué discutirla: hay que ir a buscar la
 * foto. Con el papel transcripto en la fila, la discusión se da mirando la fila.
 *
 * Es IDEMPOTENTE: un concepto que ya trae su marca no la recibe dos veces. El fajo se puede reescribir
 * (Corregir, reintento) y un concepto que se va agrandando en cada pasada es un dato que se degrada.
 */
export function conceptoConAnotacion({ concepto, anotacion } = {}) {
  const a = String(anotacion ?? '').trim()
  const c = String(concepto ?? '').trim()
  if (!a) return c || null
  if (c.includes(MARCA_A_MANO)) return c
  const marca = `${MARCA_A_MANO} "${a.slice(0, 120)}"`
  return (c ? `${c} ${marca}` : marca).slice(0, 300)
}

/** Cómo se marca en la columna L el proveedor que el desplegable no tiene. Es contrato, no formato. */
export const MARCA_PROVEEDOR = '· proveedor s/lista:'

/**
 * EL NOMBRE QUE EL DESPLEGABLE NO TIENE, TRANSCRIPTO EN EL CONCEPTO.
 *
 * Cuando el proveedor no está en la lista estricta, la celda E queda VACÍA a propósito: un valor
 * fuera del desplegable deja la celda en rojo y parte en dos la cuenta corriente del proveedor en
 * todos los cruces. Pero el nombre está impreso en el papel y es el dato con el que el dueño va a
 * completar esa celda, así que no se puede tirar: se transcribe, literal y con su CUIT.
 *
 * NO ES INVENTAR NADA: es copiar lo que dice el membrete a una celda de texto libre. Lo que sería
 * inventar es elegirle un nombre parecido de la lista.
 *
 * IDEMPOTENTE, igual que `conceptoConAnotacion`: el fajo se reescribe en cada pasada y un concepto
 * que se agranda solo es un dato que se degrada.
 */
export function conceptoConProveedorLeido(concepto, { proveedor, cuit } = {}) {
  const nombre = String(proveedor ?? '').trim()
  const base = String(concepto ?? '').trim()
  if (!nombre || base.includes(MARCA_PROVEEDOR)) return base || null
  const c = soloDigitos(cuit)
  const marca = `${MARCA_PROVEEDOR} "${nombre.slice(0, 80)}"${c.length === 11 ? ` CUIT ${c}` : ''}`
  return (base ? `${base} ${marca}` : marca).slice(0, 300)
}

function textoODefault(v) {
  const s = String(v ?? '').trim()
  return s && !/^(null|n\/a|-|—)$/i.test(s) ? s : null
}

/** Fecha del comprobante → DD/MM/AAAA, o null. Un año de dos dígitos se completa a 20xx. */
export function fechaDeLectura(v) {
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    const d = Number(m[1]); const mes = Number(m[2])
    if (d < 1 || d > 31 || mes < 1 || mes > 12) return null
    return `${String(d).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${y}`
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}`
  return null
}

