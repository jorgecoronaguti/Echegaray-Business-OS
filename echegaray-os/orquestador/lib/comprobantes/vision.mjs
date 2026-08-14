// LA ÚNICA LLAMADA A UN MODELO DE TODO ESTE MÓDULO.
//
// Leer una foto de una factura es visión: no hay forma determinística de hacerlo, y por eso acá sí
// se llama a la API. Está en un archivo aparte de `lectura.mjs` —que es puro— para que el permiso
// termine EXACTAMENTE acá: la puerta de permisos, el agrupado, la idempotencia y la escritura no
// pueden alcanzar este archivo ni por un import transitivo, y hay un test que lo verifica
// (`comunicacion/comprobantes/cero-modelo.test.mjs`).
//
// ═══ UNA LECTURA BARATA, Y UN SEGUNDO PAR DE OJOS SÓLO CUANDO LA PRIMERA DUDÓ (03/08) ═══
//
// Medido sobre la foto real que falló (IMG_7530.jpg, un ticket de Corralón fotografiado ACOSTADO):
// el modelo barato leyó el número `0004-00036542` en vez de `0004-00003642`, no vio la anotación
// manuscrita "Messinas BSA" —que es la obra— y copió el total en el lugar del neto. Con el prompt
// corregido siguió sin verla. El modelo grande, con el mismo prompt, leyó bien el número y vio la
// anotación.
//
// La respuesta NO es pagar el modelo grande en cada foto: la mayoría de los comprobantes se leen
// bien y barato. La respuesta es una ESCALERA con un disparador DETERMINÍSTICO —`necesitaRevision`,
// que no consulta a nadie: mira si el total falta, si la aritmética no cierra, si el comprobante se
// declaró ilegible o si no apareció ninguna anotación manuscrita—. Cuando la primera lectura duda,
// y sólo entonces, se pide la segunda.
//
// Y las dos lecturas se FUSIONAN campo por campo, no se reemplaza una por la otra: en la medición el
// modelo grande acertó el número y la anotación, y el chico acertó el nombre del proveedor. Tirar la
// primera lectura entera habría cambiado un defecto por otro.

import { aNumero } from '../carga-comprobantes.mjs'
import { identidadDelComprobante } from './aritmetica.mjs'

/** Modelo de lectura. Barato a propósito: leer un ticket es extracción, no razonamiento. */
export const MODELO_LECTURA = process.env.ORQ_COMPROBANTES_MODELO || 'claude-haiku-4-5-20251001'

/** Modelo de REVISIÓN. Sólo se usa cuando la primera lectura dudó. */
export const MODELO_REVISION = process.env.ORQ_COMPROBANTES_MODELO_REVISION || 'claude-sonnet-4-5-20250929'

/**
 * Bloque de contenido para la API de Anthropic. Imagen → `image`; PDF → `document`.
 * Devuelve null para lo que no se puede mirar (un .docx, un audio): se avisa, no se adivina.
 */
export function bloqueAdjunto({ data, mediaType } = {}) {
  if (!data || !mediaType) return null
  if (mediaType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
  }
  if (/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) {
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data } }
  }
  return null
}

/**
 * EL PROMPT. Corto y cerrado: se le pide extraer, no interpretar.
 *
 * Cada bloque está acá por un defecto REAL medido contra la foto que falló, no por prolijidad:
 *
 *   · LA FOTO VIENE GIRADA. El ticket que falló estaba acostado 90°: el modelo leía un dígito de
 *     más. Decirle que la gire mentalmente y que recorra los cuatro márgenes cambia lo que mira.
 *   · LO MANUSCRITO ES LA OBRA. Va PRIMERO y con su porqué, no como un renglón al final. Es el dato
 *     más importante de la empresa y el único que nunca viene impreso.
 *   · SE TRANSCRIBE, NO SE INTERPRETA. La obra la decide el matcheo contra el desplegable estricto
 *     (`imputacion.mjs`), nunca el modelo. Un modelo que elige la obra imputa plata por su cuenta.
 *   · NO SE INVENTA PARA NO DEJAR UN NULL. Se probó una versión que exigía "nunca devuelvas null si
 *     hay tinta manuscrita" y el modelo empezó a FABRICAR importes ($62.049,32 donde decía
 *     $62.000,00). Un null es una pregunta; un número inventado es una carga mal hecha. Por eso el
 *     prompt dice explícitamente que dudar está permitido.
 *   · EL COMPROBANTE TRAE DOS CUIT. El del emisor y el de Echegaray, que es el comprador. El modelo
 *     devolvía el del comprador como emisor.
 *   · EL TOTAL Y EL NETO. Sin el total, la percepción de IIBB/SUSS se pierde (M = Total − IVA); y el
 *     modelo copiaba el total en el lugar del neto, lo que hacía que nada cerrara.
 *   · EL CAE. 14 dígitos, y es la clave más fuerte que existe para conciliar contra ARCA.
 */
export const PROMPT_LECTURA = [
  'Sos un asistente administrativo de una constructora argentina. Mirá el comprobante de compra y',
  'extraé SÓLO lo que se ve. Nunca completes un dato que no esté impreso o escrito en el papel.',
  '',
  'LA FOTO PUEDE VENIR GIRADA (90°, 180° o torcida) y el papel puede estar arrugado o doblado.',
  'Giralá mentalmente y leela igual: un ticket acostado se lee de abajo hacia arriba. Antes de',
  'contestar recorré los CUATRO márgenes de la hoja, no sólo el bloque impreso del centro.',
  '',
  'LO ESCRITO A MANO ES EL DATO MÁS IMPORTANTE DE ESTE TRABAJO.',
  'En esta empresa alguien anota A MANO, sobre el comprobante, la obra o el cliente al que va el',
  'gasto. Es lo único que nunca viene impreso, porque el proveedor no sabe a qué obra se imputa.',
  'Suele estar arriba a la izquierda, pero puede estar en cualquier margen, torcido, con birome, en',
  'otro sentido que el texto impreso o al lado del logo. Buscalo SIEMPRE.',
  'Transcribilo TAL CUAL, letra por letra, sin corregirlo ni interpretarlo: si está en plural va en',
  'plural, si está abreviado va abreviado. Eso va en "anotacion_manuscrita" y no se toca. Si más',
  'abajo te doy las listas de las columnas, además vas a IMPUTAR el gasto usando esta anotación —',
  'pero la transcripción literal viaja igual y aparte. Si hay varias, separalas con " · ".',
  'Si de verdad no hay nada escrito a mano, poné null: es una respuesta válida.',
  '',
  'LO MANUSCRITO TRAE HASTA TRES COSAS EN UN MISMO RENGLÓN, y hay que separarlas:',
  '  1) LA OBRA o el cliente — ej. "Estrella", "Messinas", "SF." (San Francisco).',
  '  2) EL FRENTE, VEHÍCULO O MÁQUINA dentro de esa obra — ej. "pisos - galpón 9", "Camion BSA",',
  '     "Autoelevador", "Toyota EEA885" (una patente es un vehículo), "Ford XLS".',
  '  3) LA CONDICIÓN DE VENTA — cómo se paga. "c/c", "cta cte", "cte", "cuenta corriente" quieren',
  '     decir CUENTA CORRIENTE (queda pendiente de pago); "contado", "efectivo", "pagado", "pago"',
  '     quieren decir CONTADO (ya se pagó). Eso va en "condicion_manuscrita" con una de esas dos',
  '     palabras exactas: "Cuenta Corriente" o "Contado". Si la mano no lo dice, null.',
  'Ejemplo real: "Estrella / pisos - galpón 9 / c/c" son las tres: obra, frente y condición.',
  '',
  'LA CONDICIÓN ESCRITA A MANO NO ES LA IMPRESA Y NO SE MEZCLAN. "condicion_venta" es la que está',
  'IMPRESA en el papel; "condicion_manuscrita" es la que alguien escribió con birome. Pueden',
  'contradecirse y está bien: se contestan las dos por separado y del lado del sistema se decide.',
  '',
  'MANUSCRITO ES TINTA, NO UN CAMPO IMPRESO. Los campos "Observaciones", "Señor/es", "Vendedor",',
  '"Remito", "Transportista" o "Retira" están IMPRESOS y los completa el proveedor: un nombre de',
  'persona que sale de ahí NO es una anotación manuscrita y NO se imputa con él. Pasó: se cargó',
  '"Rodrigo Echegaray" como si fuera el frente de una obra. Si dudás de si algo está escrito a mano,',
  'poné null.',
  '',
  'DUDAR ESTÁ PERMITIDO; INVENTAR NO. Si un dato no se lee, poné null y explicalo en "dudas".',
  'Nunca completes un importe, un número ni una letra "para que quede algo": un dato inventado se',
  'convierte en plata mal cargada, y un null se convierte en una pregunta que alguien contesta.',
  '',
  'Formato de números: es-AR. El punto separa miles y la coma es el decimal ("28.479,30").',
  'Copiá los importes TAL COMO ESTÁN IMPRESOS, con su punto y su coma. No los conviertas.',
  'Las fechas, en DD/MM/AAAA.',
  '',
  'Reglas:',
  '· El NÚMERO DE COMPROBANTE se copia DÍGITO POR DÍGITO. Tiene la forma 0000-00000000: cuatro',
  '  dígitos de punto de venta, guion, y OCHO dígitos de correlativo. Contá los ceros del medio y',
  '  verificá que después del guion haya exactamente ocho dígitos. Un dígito de más convierte esta',
  '  factura en otra distinta.',
  '· La LETRA está pegada a la palabra del comprobante, arriba: "FACTURA A", "FACTURA B",',
'  "TIQUE FACTURA A", "TIQUE FACTURA B". En un tique fiscal la letra viene DESPUÉS de "TIQUE',
'  FACTURA" y suele traer al lado un código entre paréntesis ("Cod. 081", "Cod. 082") — el código',
'  NO es la letra. Buscala siempre: sin letra el comprobante no se puede cargar y alguien tiene que',
'  ponerla a mano. Si de verdad no está impresa, poné null (no la deduzcas del CUIT ni del IVA).',
'· El EMISOR es quien VENDE: el proveedor, arriba del todo, con su logo. El comprobante también',
  '  trae el CUIT del COMPRADOR, que es ECHEGARAY CONSTRUCCIONES S.A.S.: ése NO es el emisor y nunca',
  '  va en "cuit". Si ves dos CUIT, el del emisor es el que NO es Echegaray.',
  '· El TOTAL es obligatorio: es el número más grande y prominente, el que tiene que cerrar con la',
  '  plata que salió. Si no se lee, poné legible=false y decilo en "dudas".',
  '· ANTES DE CONTESTAR, SUMÁ: neto gravado + IVA + otros tributos tiene que dar EXACTAMENTE el total.',
  '  Si no da, hay un número mal copiado y casi siempre es la coma: $2.014.940,07 leído como',
  '  $201.494.007 (dos ceros de más) o $686.070,00 leído como $686,07. Volvé a mirar los decimales de',
  '  cada importe y corregí el que esté mal. Un comprobante cuyos números no cierran NO SE CARGA, así',
  '  que dejarlo mal no ahorra trabajo: lo duplica.',
  '· NETO GRAVADO es el subtotal SIN IVA (aparece como "ST1", "Subtotal" o "Neto"). Tiene que cumplir',
  '  neto + IVA + otros tributos = total. Si lo que anotaste no cierra, volvé a mirar: lo más común',
  '  es haber copiado el total en el lugar del neto.',
  '· El IVA va DISCRIMINADO por alícuota: iva_21 y iva_105 por separado. Si la factura no discrimina',
  '  IVA (una factura B o C, un ticket), poné 0 en las dos.',
  '· Percepciones (IIBB, SUSS), impuestos internos y otros tributos van juntos en otros_tributos.',
  '· El CAE es el "Cód. Autorización Electrónico": 14 dígitos, abajo, cerca del código de barras o',
  '  del QR. Copialo entero si está; si no lo ves entero, poné null.',
  '· El CONCEPTO SALE DE LOS RENGLONES DEL COMPROBANTE — los artículos facturados, en el medio del',
  '  papel, con su cantidad y su precio. NUNCA del nombre del proveedor ni del rubro que sugiere ese',
  '  nombre. Pasó: se leyó el emisor como "COMESTIBLES BARCELO" (era "Combustibles Barcelo") y el',
  '  concepto salió "Comestibles y bebidas" para una carga de COMBUSTIBLE. Si los renglones no se',
  '  leen, poné null: qué se compró no se deduce de quién lo vendió.',
  '· Si es NOTA DE CRÉDITO poné es_nota_credito=true. No cambies el signo de los importes: copialos',
  '  positivos tal como figuran.',
  '· LA NOTA DE LA COMPRA ("detalle_libre") — una línea corta con lo que el papel dice de ESTA compra',
  '  en concreto, que es lo que en esta empresa se escribe en la columna "Detalles / Obra". Poné lo',
  '  que el comprobante traiga, en este orden y separado con " · ":',
  '    · QUÉ y CUÁNTO, con su unidad: litros, kilos, metros, bolsas, unidades. Si son varios',
  '      artículos, unilos con " + ". Ej.: "Diesel 500 (26,5135 l) + Nafta Super (9,17 l)".',
  '    · EL VENCIMIENTO, si lo trae. Ej.: "vto 04/08".',
  '    · QUIÉN RETIRA, si figura. Ej.: "retira Rodrigo".',
  '    · SI YA ESTÁ PAGADA: con qué se pagó, EN QUÉ FECHA y con qué NÚMERO DE OPERACIÓN, cuando el',
  '      papel los diga. Ej.: "Pagada 07/08 MP tarjeta de débito · op. 4471".',
  '  Sale de los RENGLONES y de los datos impresos del comprobante, NUNCA del nombre del proveedor ni',
  '  del rubro que ese nombre sugiere. No repitas acá la anotación manuscrita: ésa ya viaja entera en',
  '  "anotacion_manuscrita". Si el papel no da para una línea útil, poné null: una nota inventada es',
  '  peor que una celda vacía.',
  '· UN ARCHIVO, UN COMPROBANTE. Si en esta imagen o en este PDF hay MÁS DE UN comprobante DISTINTO',
  '  (dos tickets sobre la mesa, un PDF con varias facturas), contestá SÓLO por el primero y poné',
  '  varios_comprobantes=true y cuantos_comprobantes=<cuántos contás>. No los mezcles en un solo JSON:',
  '  sumar dos facturas en una fila es plata mal cargada. Las páginas de UN MISMO comprobante (el',
  '  frente y el dorso, una factura de dos hojas con el mismo número) NO cuentan como varios.',
  '',
  'Respondé SÓLO este JSON, sin texto alrededor:',
  '{"emisor":"<razón social del que VENDE>","cuit":"<11 dígitos del emisor, o null>",',
  '"letra":"<A|B|C|null>","es_nota_credito":<true|false>,"numero":"<0000-00000000 o null>",',
  '"cae":"<14 dígitos o null>","fecha":"<DD/MM/AAAA o null>",',
  '"neto_gravado":"<importe o null>","iva_21":"<importe o null>","iva_105":"<importe o null>",',
  '"otros_tributos":"<importe o null>","total":"<importe o null>",',
  '"condicion_venta":"<Contado|Cuenta Corriente|null — la IMPRESA>",',
  '"condicion_manuscrita":"<Contado|Cuenta Corriente|null — la ESCRITA A MANO>",',
  '"forma_pago":"<lo que diga, o null>",',
  '"concepto":"<QUÉ SE COMPRÓ: los artículos, en pocas palabras. Nunca la dirección ni el rubro',
  'del proveedor>","detalle_libre":"<la nota de la compra, o null>",',
  '"anotacion_manuscrita":"<tal cual, o null>",',
  '"varios_comprobantes":<true|false>,"cuantos_comprobantes":<número o null>,',
  '"legible":<true|false>,"dudas":["<qué no pudiste leer>"]}',
].join('\n')

const vacio = (v) => v == null || String(v).trim() === '' || /^(null|n\/a|-|—)$/i.test(String(v).trim())

/**
 * ¿Esta lectura merece un segundo par de ojos? DETERMINÍSTICO: no consulta a nadie.
 *
 * Los cuatro disparadores son los cuatro síntomas que tuvo la lectura que falló en producción.
 * El de la anotación es el más caro de los cuatro —la mayoría de los comprobantes no tienen nada
 * escrito— y está igual: la obra es el dato que decide a qué obra se le carga el costo, y no verla
 * cuando está es exactamente el defecto que se está arreglando.
 */
/**
 * EL BLOQUE DE IMPUTACIÓN — las listas REALES de cada columna, delante del modelo mientras lee.
 *
 * ═══ POR QUÉ (04/08) ═══
 *
 * El modelo transcribía la anotación a mano y ahí terminaba su trabajo: devolvía "HW DX 2018" y el
 * matcheo estricto de después no encontraba ninguna obra que se llamara así, así que el comprobante
 * entraba sin imputar. Pero "HW DX 2018" no es una obra: es un VEHÍCULO, y quien mira la foto
 * sabiendo que existe una obra "Vehiculos / Maquinas" y un detalle "Camion - 608D" lo resuelve en un
 * segundo. Eso es exactamente lo que hace una persona, y lo único que le faltaba al modelo era la
 * lista — leía a ciegas.
 *
 * NO ES ADIVINAR: se le dan los valores EXACTOS de los desplegables y sólo puede devolver uno de
 * ellos o null. Lo que elija se vuelve a validar contra la misma lista del lado del OS, así que un
 * valor inventado no llega a una celda. Y la transcripción literal sigue viajando aparte: si después
 * hay que discutir la imputación, está lo que el papel decía.
 *
 * @param {{obras?:string[], unidades?:string[], categorias?:string[], tiposPago?:string[],
 *          detalles?:Object<string,string[]>}} v
 */
export function bloqueImputacion(v = {}) {
  const obras = (v.obras ?? []).filter(Boolean)
  const unidades = (v.unidades ?? []).filter(Boolean)
  const tiposPago = (v.tiposPago ?? []).filter(Boolean)
  const detalles = Object.entries(v.detalles ?? {}).filter(([, l]) => (l ?? []).length)
  if (!obras.length && !unidades.length) return null

  const l = ['', 'AHORA IMPUTÁ EL GASTO. Esto es lo que hace una persona cuando mira el papel: decide',
    'a qué obra va y de qué tipo de costo es. Lo escrito a mano es la pista principal, y muchas veces',
    'NO es el nombre de la obra sino un VEHÍCULO, una máquina, un frente de trabajo o una persona.',
    '',
    'REGLA DURA: elegí un valor EXACTO de las listas de abajo, copiado tal cual (mayúsculas, tildes y',
    'espacios incluidos), o poné null. Nunca escribas un valor que no esté en la lista y nunca elijas',
    '"el más parecido" para no dejarlo vacío: un gasto imputado a la obra equivocada es peor que uno',
    'sin imputar, porque nadie lo va a revisar. Si dudás entre dos, poné null y decilo en "dudas".']

  if (obras.length) l.push('', `OBRA / CLIENTE (columna J) — valores válidos:\n${obras.map((o) => `  · ${o}`).join('\n')}`)
  if (unidades.length) l.push('', `UNIDAD DE NEGOCIO (columna I) — qué clase de costo es:\n${unidades.map((o) => `  · ${o}`).join('\n')}`)
  // ═══ LA CATEGORÍA (COLUMNA B) YA NO SE PREGUNTA (13/08) ═══
  //
  // Acá se le pasaba el desplegable de la columna B con el rótulo «qué se compró, en el vocabulario de
  // la empresa». Ese desplegable son DOS valores —`B` y `N`, blanco y negro— y preguntarle a un modelo
  // qué se compró ofreciéndole esas dos opciones no puede terminar bien: contestó `N` para una FACTURA
  // A (fila 840, Rodamientos Cuyo), o sea marcó como en negro un gasto documentado. Se deriva sin
  // modelo en `categoria.mjs`: hay comprobante fiscal ⇒ B, no lo hay ⇒ N.
  if (detalles.length) {
    l.push('', 'DETALLE / OBRA (columna K) — el frente, vehículo o rubro DENTRO de la obra. Estos son los',
      'que ya se usaron en cada una; elegí uno sólo si la obra que elegiste es la suya. NUNCA un nombre',
      'de persona ni un texto de las observaciones de la factura:')
    for (const [obra, vals] of detalles.slice(0, 30)) l.push(`  ${obra}: ${vals.slice(0, 15).join(' | ')}`)
  }
  // ═══ LA NOTA COMPUESTA DE K SE PIDE SIEMPRE, Y POR ESO NO ESTÁ ACÁ (14/08) ═══
  //
  // Estaba en este bloque, y este bloque tiene dos condiciones que no tienen NADA que ver con ella:
  // sólo se arma si `vocabulario` llegó, y sólo se agrega si hay obras o unidades (ver el `return
  // null` de arriba). O sea: un fallo leyendo los desplegables del Sheet apagaba también la única
  // instrucción que llena la columna K —que es texto libre y no depende de ninguna lista—.
  //
  // Y había un segundo defecto, más silencioso: `PROMPT_LECTURA` termina diciendo «Respondé SÓLO este
  // JSON» con un esquema CERRADO, y recién después venía «Agregá al JSON: ...detalle_libre...». Dos
  // instrucciones que se contradicen, y la primera es la que cierra la lista de campos.
  //
  // Ahora la nota vive en `PROMPT_LECTURA`, con su clave en el esquema base: se pide en toda lectura,
  // haya o no desplegables, y no compite con nada. Acá queda sólo lo que de verdad es elegir de una
  // lista cerrada.
  // EL TIPO DE PAGO ES EL QUE MÁS BASURA METIÓ. Es la única de estas columnas cuyo valor SÍ está
  // impreso en el papel, y por eso el modelo copiaba lo que veía cerca ("Importe", "30 DIAS FECHA
  // FACTURA") en vez de elegir de la lista. Se le dice explícitamente que es una lista cerrada y que
  // el plazo de pago no es una forma de pago.
  if (tiposPago.length) {
    l.push('', `TIPO DE PAGO (columna P) — CON QUÉ se pagó, no CUÁNDO. Sólo estos valores:\n${tiposPago.map((o) => `  · ${o}`).join('\n')}`,
      'Un plazo ("30 DIAS FECHA FACTURA"), una condición ("Cuenta Corriente") o un rótulo de la factura',
      '("Importe") NO son formas de pago: ahí va null. Si el papel no dice con qué se pagó, va null.')
  }
  l.push('', 'Agregá al JSON: "obra":"<exacto de la lista o null>","unidad_negocio":"<exacto o null>",',
    '"detalle_obra":"<exacto de la lista de la obra elegida, o null>",',
    '"forma_pago":"<exacto de la lista de tipo de pago, o null>",',
    '"por_que_esa_obra":"<en qué te basaste, en 10 palabras>"')
  return l.join('\n')
}

export function necesitaRevision(crudo = {}) {
  const motivos = []
  if (crudo?.legible === false) motivos.push('la lectura se declaró ilegible')
  if (vacio(crudo?.total)) motivos.push('no leyó el total')
  if (vacio(crudo?.numero)) motivos.push('no leyó el número')
  if (vacio(crudo?.fecha)) motivos.push('no leyó la fecha')
  // LA MISMA IDENTIDAD QUE DESPUÉS DECIDE SI SE ESCRIBE (`faltantes.mjs`), calculada por la MISMA
  // función. Acá su consecuencia es pedir el modelo grande; allá, no cargar. Dos consecuencias, una
  // sola cuenta: si cada una tuviera la suya, el que avisa y el que bloquea podrían discrepar sobre
  // el mismo papel.
  const ar = identidadDelComprobante({
    neto: aNumero(crudo?.neto_gravado),
    iva: (aNumero(crudo?.iva_21) ?? 0) + (aNumero(crudo?.iva_105) ?? 0),
    otros: aNumero(crudo?.otros_tributos),
    total: aNumero(crudo?.total),
  })
  if (ar.verificable && !ar.cierra) motivos.push('neto + IVA no cierra con el total')
  if (vacio(crudo?.anotacion_manuscrita)) motivos.push('no encontró ninguna anotación manuscrita')
  return motivos
}

/**
 * Fusiona la revisión sobre la primera lectura. Campo por campo, la revisión manda cuando dice algo.
 *
 * `emisor_alt` guarda el nombre que leyó la OTRA pasada. No es redundancia: en la medición real una
 * pasada leyó "Néstor Rubén Corralón Progreso" —que matchea el desplegable— y la otra "MATERIALES DE
 * CONSTRUCCION", que no. Quien decide cuál vale es el desplegable ESTRICTO de Compras, no el modelo,
 * y para eso necesita ver las dos.
 */
export function fusionar(primera = {}, revision = {}) {
  const out = { ...primera }
  for (const [k, v] of Object.entries(revision)) {
    if (k === 'dudas' || k === 'legible' || k === 'varios_comprobantes') continue
    if (!vacio(v)) out[k] = v
  }
  out.legible = primera?.legible !== false && revision?.legible !== false
  // ALCANZA CON QUE UNA PASADA HAYA VISTO DOS. Si se fusionara como el resto de los campos, un `false`
  // de la revisión borraría el aviso de la primera y el segundo comprobante volvería a perderse en
  // silencio — que es justo lo que este campo existe para impedir. Se acumula, como `legible`.
  out.varios_comprobantes = primera?.varios_comprobantes === true || revision?.varios_comprobantes === true
  out.dudas = [...new Set([...(primera?.dudas ?? []), ...(revision?.dudas ?? [])].map((d) => String(d)))].slice(0, 6)
  const alt = [primera?.emisor, revision?.emisor].filter((e) => !vacio(e)).map((e) => String(e).trim())
  if (alt.length === 2 && alt[0] !== alt[1]) out.emisor_alt = alt.find((e) => e !== out.emisor) ?? null
  return out
}

// ═══ EL PARÁMETRO QUE MATÓ LA LECTURA ENTERA (13/08) ═══
//
// El dueño cambió `ORQ_COMPROBANTES_MODELO` a `claude-opus-5` —el modelo grande, el mismo que mira
// la foto cuando la carga se hace por Claude Code— y a partir de ese momento el bot dejó de leer
// TODOS los comprobantes. Ni uno. Medido contra la API real, con los 8 comprobantes del 13/08:
//
//   400 · {"type":"invalid_request_error","message":"`temperature` is deprecated for this model."}
//
// `temperature: 0` viajaba fijo en el cuerpo. En los modelos de la generación actual (opus-5,
// sonnet-5, opus-4-7 y posteriores) los parámetros de muestreo NO se aceptan: la request se rechaza
// entera. El síntoma del lado del dueño no dice nada de esto —«no pude leer el comprobante»—, así
// que un cambio de una palabra en un `.env` apaga la capacidad sin un solo error visible.
//
// LA REGLA: el cuerpo lleva SÓLO lo que hace falta, y lo opcional se manda únicamente a los modelos
// que se sabe que lo aceptan. Un modelo nuevo, desconocido, recibe el cuerpo pelado y ANDA. Al revés
// —mandar de más y confiar en que el modelo lo tolere— es lo que rompió esto.

/**
 * Modelos que todavía aceptan `temperature`. Es una lista CERRADA a propósito: lo que no está acá
 * recibe el cuerpo pelado. Preferimos perder el determinismo del `temperature: 0` en un modelo
 * desconocido antes que perder la lectura entera.
 */
const ACEPTAN_TEMPERATURE = /(haiku|claude-3|sonnet-4-5|sonnet-4-6|opus-4-5|opus-4-6)/i

/** El cuerpo de la request. `pelado` deja sólo lo obligatorio: es el reintento tras un 400. */
export function cuerpoDeLectura({ modelo, maxTokens, bloque, prompt, pelado = false } = {}) {
  const cuerpo = {
    model: modelo,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: [bloque, { type: 'text', text: prompt }] }],
  }
  if (!pelado && ACEPTAN_TEMPERATURE.test(String(modelo ?? ''))) cuerpo.temperature = 0
  return cuerpo
}

/**
 * El mensaje del 400 de la API, para que el motivo llegue al log en vez de morir en el status.
 *
 * LEER EL CUERPO NUNCA PUEDE TUMBAR EL DIAGNÓSTICO. `res.text` es opcional en la Response mínima que
 * devuelve cualquier doble de test y en algún runtime viejo; si no está, se informa igual con el
 * status. Que la lectura del motivo del error se convierta a su vez en un error —«res.text is not a
 * function» donde debía decir «falló (429)»— manda a buscar el problema al lugar equivocado.
 */
async function motivoDeLaApi(res) {
  if (typeof res?.text !== 'function') return null
  const texto = await res.text().catch(() => '')
  try {
    const j = JSON.parse(texto)
    return String(j?.error?.message ?? '').slice(0, 160) || null
  } catch { return String(texto ?? '').slice(0, 160) || null }
}

/** Una sola llamada al modelo. Devuelve el JSON crudo o `{error}`; nunca lanza. */
async function unaLectura(bloque, { apiKey, fetchImpl, modelo, maxTokens, prompt = PROMPT_LECTURA }) {
  const pedir = async (pelado) => fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(cuerpoDeLectura({ modelo, maxTokens, bloque, prompt, pelado })),
  })
  try {
    let res = await pedir(false)
    // ═══ Y SI IGUAL LO RECHAZA, SE INSISTE UNA VEZ CON EL CUERPO PELADO ═══
    //
    // La lista de arriba envejece: mañana sale un modelo que deja de aceptar otra cosa. Un 400 es
    // siempre un problema del CUERPO —no de la foto ni del crédito—, así que se reintenta una sola
    // vez sin nada opcional. Si eso anda, el comprobante se leyó igual y el dueño no se enteró.
    if (res.status === 400) res = await pedir(true)
    if (!res.ok) {
      const motivo = await motivoDeLaApi(res)
      return { ok: false, error: `la lectura del comprobante falló (${res.status})${motivo ? `: ${motivo}` : ''}` }
    }
    const j = await res.json()
    const texto = (j?.content ?? []).filter((b) => b?.type === 'text').map((b) => b.text).join('\n')
    const m = String(texto ?? '').match(/\{[\s\S]*\}/)
    // UN JSON CORTADO NO ES UN JSON. Con los modelos que razonan, `max_tokens` es el techo de
    // pensamiento + respuesta: si queda corto, la llave abre y nunca cierra. Se dice cuál fue el
    // motivo en vez de "no pude interpretar", que manda a buscar el problema a la foto.
    if (!m) {
      const cortado = j?.stop_reason === 'max_tokens'
      return { ok: false, error: cortado ? 'la lectura quedó cortada por el límite de tokens' : 'no pude interpretar el comprobante' }
    }
    try {
      return { ok: true, crudo: JSON.parse(m[0]) }
    } catch {
      return { ok: false, error: j?.stop_reason === 'max_tokens' ? 'la lectura quedó cortada por el límite de tokens' : 'no pude interpretar el comprobante' }
    }
  } catch (e) {
    return { ok: false, error: `no pude leer el comprobante: ${String(e?.message ?? e).slice(0, 120)}` }
  }
}

/**
 * Lee UN adjunto con el modelo de visión, con revisión si la primera lectura dudó.
 *
 * Falla devolviendo `{error}` y nunca lanza: un adjunto ilegible no puede tumbar el fajo entero —
 * los otros tres comprobantes de la misma tanda se cargan igual y éste se reporta.
 *
 * Si la REVISIÓN falla (sin crédito, la API caída), se devuelve la primera lectura y se declara en
 * `revision.error`. Perder la segunda opinión no puede convertirse en no leer nada.
 *
 * @param {{data:string, mediaType:string, nombre?:string}} adjunto  base64 + tipo
 * `vocabulario` son las listas de los desplegables de Compras. Van al prompt para que el modelo
 * pueda IMPUTAR lo escrito a mano y no sólo transcribirlo (ver `bloqueImputacion`). Sin ellas se lee
 * igual que antes: es opcional a propósito, para que un fallo leyendo el Sheet no impida leer la foto.
 *
 * @param {{apiKey?:string, fetchImpl?:Function, modelo?:string, modeloRevision?:string|null, maxTokens?:number, vocabulario?:object}} [ctx]
 * @returns {Promise<{ok:true, crudo:object, revision?:object}|{ok:false, error:string}>}
 */
export async function leerAdjunto(adjunto, ctx = {}) {
  const {
    apiKey = process.env.ANTHROPIC_API_KEY,
    fetchImpl = globalThis.fetch,
    modelo = MODELO_LECTURA,
    modeloRevision = MODELO_REVISION,
    // EL TECHO ES DE PENSAMIENTO + RESPUESTA. Con los modelos que razonan por defecto (opus-5), los
    // 1.600 de antes se los podía comer el pensamiento y devolver un JSON cortado a la mitad, que
    // acá se ve igual que un comprobante ilegible. El JSON completo son ~600 tokens; el resto es
    // aire para que el modelo mire la foto con calma.
    maxTokens = 6000,
    vocabulario = null,
  } = ctx
  const bloque = bloqueAdjunto(adjunto)
  if (!bloque) return { ok: false, error: `no puedo mirar un archivo ${adjunto?.mediaType ?? 'sin tipo'}` }
  if (!apiKey || typeof fetchImpl !== 'function') return { ok: false, error: 'no hay lectura de comprobantes disponible ahora' }

  const imputacion = vocabulario ? bloqueImputacion(vocabulario) : null
  const opciones = { apiKey, fetchImpl, modelo, maxTokens, prompt: imputacion ? `${PROMPT_LECTURA}\n${imputacion}` : PROMPT_LECTURA }
  const primera = await unaLectura(bloque, opciones)
  if (!primera.ok) return primera

  const motivos = necesitaRevision(primera.crudo)
  if (!motivos.length || !modeloRevision || modeloRevision === modelo) {
    return { ok: true, crudo: primera.crudo, revision: { hubo: false, motivos } }
  }

  const segunda = await unaLectura(bloque, { ...opciones, modelo: modeloRevision })
  if (!segunda.ok) {
    return { ok: true, crudo: primera.crudo, revision: { hubo: false, motivos, error: segunda.error } }
  }
  return {
    ok: true,
    crudo: fusionar(primera.crudo, segunda.crudo),
    revision: { hubo: true, motivos, modelo: modeloRevision },
  }
}
