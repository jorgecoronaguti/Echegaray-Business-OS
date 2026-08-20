// EL AUDITOR DE LO QUE EL BOT YA CARGÓ MAL — NÚCLEO PURO, SÓLO LECTURA, CERO MODELO.
//
// ═══ EL PEDIDO, TEXTUAL ═══
//
//   «tengo muchos comprobantes mal cargados, y tampoco me arreglas eso»
//
// Las reglas de qué está bien ya están en código y son determinísticas: la Categoría se DERIVA del
// comprobante (`categoria.mjs`), el Importe es Total − IVA por contrato (`carga-comprobantes.mjs`),
// la Obra y el Detalle salen del historial del proveedor (`imputacion-aprendida.mjs`) y la identidad
// de un comprobante es (proveedor, tipo, punto de venta, número, signo) (`lectura.mjs`). Lo que
// faltaba era correrlas HACIA ATRÁS, sobre las filas que ya están escritas.
//
// ═══ POR QUÉ NO CORRIGE ═══
//
// Textual del dueño: «compras es una pestaña q las cargas son realizadas desde aca, no hay revision
// valida». Compras es donde él carga a mano. Un script que la reescriba solo es la séptima pérdida
// de trabajo del dueño de este repo, y las seis anteriores están documentadas. Esto LISTA: fila por
// fila, qué dice hoy, qué debería decir y DE DÓNDE sale la corrección. La aplica una persona.
//
// ═══ QUÉ CUENTA COMO DEFECTO, Y QUÉ NO ═══
//
// Sólo se marca lo que se puede AFIRMAR desde el propio archivo. Una obra vacía no es un defecto por
// sí sola —el dueño decide a qué obra va—: es defecto cuando el historial de ESE proveedor la
// resuelve sin ambigüedad y el bot igual la dejó en blanco. Marcar todo lo vacío daría una lista de
// trescientas filas que nadie mira, que es lo mismo que no auditar.
//
// ═══ MEDIDO CONTRA EL ARCHIVO ENTERO (13/08): 371 DE 840 FILAS, Y LA MITAD NO ERAN DEFECTOS ═══
//
// La primera versión de este auditor marcó 371 filas de 840. Casi la mitad de la pestaña marcada
// mal es, casi siempre, el auditor midiendo mal — y lo era. Las tres reglas que se rehicieron, con
// la evidencia que las desmintió:
//
// 1. **Categoría, el lado que no se puede afirmar.** La regla iba para los dos lados: «hay
//    comprobante fiscal ⇒ B» y «no lo hay ⇒ N». El segundo lado marcó 163 filas, y 145 de ellas son
//    Sueldos (56), ARCA (35), SINDICATOS (24), Banco (12), FCL (12) y SAC (6): obligaciones
//    FORMALES que no tienen factura A/B/C y que el dueño marca B, correctamente. B/N no es "¿hay
//    papel?", es **blanco o negro**: las 87 filas que él marcó N son pagos a personas —FEMENIA,
//    DUPEC, Gerson Castro, Don Jorge, PEDRO TELLO— sin comprobante. Que falte el número en la
//    pestaña NO prueba que no haya comprobante, así que ese lado no se afirma más. Lo que sí se
//    puede afirmar, y reemplaza a los 163: una fila marcada B, sin tipo ni número, **de un
//    proveedor que en esta misma pestaña sí emite comprobantes fiscales**. Eso no dice "la
//    categoría está mal": dice "falta el respaldo", que es otra columna y otro arreglo.
//
// 2. **Detalle copiado del concepto.** 81 de los 82 hallazgos de detalle salían de «K está vacía y
//    L tiene texto ⇒ K debería decir L». Medido sobre las 643 filas que tienen las dos: **K es
//    igual a L en el 2%**. K es el DESTINO dentro de la obra ("Galpon 9", "Cierre Perimetral",
//    "Mamposteria") y L es qué se compró ("cemento x 30", "brocha"). Copiar L en K no sólo no
//    arregla nada: envenena el vocabulario vivo de la columna K, que es con lo que
//    `compras-vivas.mjs` resuelve la obra escrita a mano. La regla se retiró.
//
// 3. **Duplicados validados contra la propia pestaña.** 49 hallazgos, 23 grupos. Cruzados contra el
//    libro fiscal (`public.comprobantes_arca`), **13 grupos son REPARTOS**: una factura repartida
//    entre obras, donde la suma de las filas da exactamente el total del comprobante (Meglioli
//    0004-00000702: dos filas de $124.751 y el comprobante es de $249.502). Sólo 2 grupos son
//    duplicados de verdad —Ferretec 0008-00000333 y 0008-00000551, recargadas en julio—. Un control
//    no se valida contra la información que él mismo produce: el árbitro es el libro fiscal, y
//    cuando el libro no tiene el comprobante no se afirma "duplicado", se dice "a revisar".
//
// Lo que quedó y NO se tocó: la aritmética. Los 86 hallazgos son reales y tienen una sola causa —M
// se cargó como NETO GRAVADO y la percepción/ITC quedó afuera, así que O ≠ M + N—; el contrato de la
// columna dice M = Total − IVA con las percepciones ADENTRO de M.

import { tieneComprobanteFiscal } from './categoria.mjs'
import { numeroCanonico } from './lectura.mjs'
import { normalizar } from '../carga-comprobantes.mjs'
import { tipoDeCompras, importeDeCompras, FILA_BASE } from './compras-vivas.mjs'
import { perfilesDeImputacion, sugerirImputacion } from '../imputacion-aprendida.mjs'

/** Posición de cada columna DENTRO del rango `Compras!B4:O` (B = 0). Contrato con ese rango. */
export const EN = Object.freeze({
  categoria: 0, fecha: 1, mes: 2, proveedor: 3, modalidad: 4, tipo: 5, numero: 6,
  unidad: 7, obra: 8, detalle: 9, concepto: 10, importe: 11, iva: 12, total: 13,
})

export const RANGO = 'Compras!B4:O'

/** Los defectos que este auditor sabe encontrar. El resumen se agrupa por acá. */
export const DEFECTO = Object.freeze({
  CATEGORIA: 'categoria',
  DETALLE: 'detalle',
  OBRA: 'obra',
  ARITMETICA: 'aritmetica',
  TIPO: 'tipo',
  MODALIDAD: 'modalidad',
  DUPLICADO: 'duplicado',
  // La fila dice "en blanco" y la pestaña no tiene con qué respaldarlo, teniendo ese proveedor
  // comprobantes fiscales en otras filas. No es la categoría lo que está mal: es G y H lo que falta.
  RESPALDO: 'respaldo',
  // Los dos que no son de la fila sino del REGISTRO del bot: dice que cargó algo que no está, o
  // dice que está en una fila que tiene otra cosa. Ver `conciliarRegistro`.
  REGISTRO: 'registro',
  RESERVA: 'reserva',
})

/** Los dos únicos valores legítimos de la columna F ("Modalidad"), leídos del desplegable. */
const MODALIDADES = ['Pago', 'Cuenta Corriente']

/** Diferencia tolerada entre M y (O − N): debajo de un peso es el redondeo del comprobante. */
const TOLERANCIA = 1

/** Una fila cruda del rango → un registro con nombre. `i` es el índice dentro del rango. */
export function registroDeFila(r = [], i = 0) {
  const txt = (k) => String(r?.[EN[k]] ?? '').trim() || null
  return {
    fila: i + FILA_BASE,
    categoria: txt('categoria'),
    fecha: txt('fecha'),
    proveedor: txt('proveedor'),
    modalidad: txt('modalidad'),
    tipoCrudo: txt('tipo'),
    tipo: tipoDeCompras(r?.[EN.tipo]),
    numeroCrudo: txt('numero'),
    numero: numeroCanonico(r?.[EN.numero]),
    unidad: txt('unidad'),
    obra: txt('obra'),
    detalle: txt('detalle'),
    concepto: txt('concepto'),
    // LOS TRES IMPORTES POR LA MISMA PUERTA. `importeDeCompras` respeta el signo del negativo entre
    // paréntesis —así formatea el dueño una nota de crédito— y espera el valor FORMATEADO en es-AR,
    // que es como lee toda la pila de comprobantes (ver `RANGO` en `compras-vivas.mjs`). Leer esto
    // con UNFORMATTED_VALUE daba $6.693.389.999.999.999 donde había $6.693,39: el punto decimal del
    // número crudo se comía como separador de miles.
    importe: importeDeCompras(r?.[EN.importe]),
    iva: importeDeCompras(r?.[EN.iva]),
    total: importeDeCompras(r?.[EN.total]),
  }
}

/** ¿Esta fila tiene algo escrito? Una fila vacía del rango no es una compra. */
function hayFila(reg) {
  return Boolean(reg.proveedor || reg.numero || reg.total != null)
}

/**
 * LA IDENTIDAD DE UN COMPROBANTE, para buscar duplicados.
 *
 * Proveedor + tipo + punto de venta + número + SIGNO. El signo parte la clave porque una nota de
 * crédito puede llevar el mismo número que la factura que anula: sin él, corregir un duplicado
 * borraría la NC — el error de $41,9M que este repo ya pagó, al revés.
 *
 * Sin número no hay identidad: dos gastos del mismo proveedor por el mismo importe pueden ser dos
 * compras distintas, y unirlos es peor que dejarlos.
 */
export function identidad(reg = {}) {
  if (!reg.numero || !reg.proveedor) return null
  const signo = (reg.total ?? 0) < 0 ? '-' : '+'
  return `${normalizar(reg.proveedor)}|${reg.tipo ?? '?'}|${reg.numero}|${signo}`
}

/**
 * LA HUELLA CON LA QUE SE VUELVE A ENCONTRAR UN COMPROBANTE EN LA PESTAÑA.
 *
 * Proveedor + CORRELATIVO (los últimos 8 dígitos) + signo. Deliberadamente más tolerante que
 * `identidad`: el punto de venta es justo lo que se lee distinto de un lado y del otro —el registro
 * guardó `0001-00015177` y la celda dice `00015-00015177` para el mismo comprobante— y exigirlo
 * haría que la mitad de las filas se declararan "desaparecidas" por un cero.
 *
 * El correlativo sí discrimina: dos comprobantes del mismo proveedor con el mismo correlativo y el
 * mismo signo son el mismo papel.
 */
export function huella(reg = {}) {
  const n = numeroCanonico(reg.numero ?? reg.numeroCrudo)
  if (!n || !reg.proveedor) return null
  const signo = (Number(reg.total) || 0) < 0 ? '-' : '+'
  return `${normalizar(reg.proveedor)}|${n.split('-')[1]}|${signo}`
}

/**
 * EL CUIT DE UN LADO Y DEL OTRO — el del registro, o el que el nombre resuelve.
 *
 * El registro guarda el CUIT del comprobante; la pestaña Compras NO tiene columna de CUIT, así que
 * del lado de la celda hay que resolverlo desde el nombre. El mapa lo arma quien lee las fuentes
 * (`Proveedores!A:B` del Sheet, `public.proveedores`, el libro fiscal): acá no se consulta nada.
 * Sin mapa, esto devuelve el CUIT del registro y nada más — que es exactamente el comportamiento
 * anterior.
 */
function cuitDe(reg = {}, cuitPorProveedor = null) {
  const propio = String(reg?.cuit ?? '').replace(/\D/g, '')
  if (propio.length === 11) return propio
  const alias = String(cuitPorProveedor?.get?.(normalizar(reg?.proveedor ?? '')) ?? '').replace(/\D/g, '')
  return alias.length === 11 ? alias : null
}

/** El importe al centavo, como entero, para poder compararlo sin arrastrar el error del binario. */
const centavos = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n !== 0 ? Math.round(n * 100) : null
}

/**
 * LAS HUELLAS DE UN COMPROBANTE, EN ORDEN DE FUERZA. El cruce prueba la primera que exista.
 *
 * ═══ EL NOMBRE ES UNA ETIQUETA; EL CUIT ES LA IDENTIDAD (15/08) ═══
 *
 * `huella` sola empareja por NOMBRE normalizado, y el nombre de la celda no tiene por qué ser el del
 * registro: la columna E de Compras es un desplegable estricto y el registro guarda la razón social
 * del CUIT. Caso real medido, fila 846: la celda dice «AXION SERVICENTRO MEDIA AGUA» —el único AXION
 * que el desplegable tiene— y el registro «AXION SERVICENTRO DEL VALLE», que es el emisor por CUIT.
 * Mismo papel, mismo importe, mismo número; el vigía lo gritaba como «figura cargado y NO está en
 * Compras», que es el aviso más caro que tiene y era falso.
 *
 * Los tres niveles, del más fuerte al más débil:
 *
 *   1. `cuit:` — CUIT + correlativo + signo. La identidad real del proveedor. Requiere que el nombre
 *      de la celda resuelva a un CUIT por alguna fuente independiente del registro.
 *   2. `prov:` — nombre normalizado + correlativo + signo. Lo de siempre, intacto.
 *   3. `num:`  — número canónico COMPLETO (con punto de venta) + importe al centavo. No mira el
 *      nombre. Es la red que atrapa el caso de AXION HOY, donde ese CUIT no está en ninguna de las
 *      fuentes de nombres: dos papeles distintos con el mismo punto de venta, el mismo correlativo y
 *      el mismo importe al centavo no existen. Va última justamente porque exige el importe, y el
 *      importe es lo que a veces está mal leído (ver el caso Alumetal, ×100).
 *
 * @param {object} reg  una fila de Compras (`registroDeFila`) o una entrada del registro
 * @param {{cuitPorProveedor?:Map<string,string>}} [o]
 * @returns {string[]} puede ser vacío: sin número no hay huella de ninguna clase
 */
export function huellas(reg = {}, { cuitPorProveedor = null } = {}) {
  const n = numeroCanonico(reg.numero ?? reg.numeroCrudo)
  if (!n) return []
  const corr = n.split('-')[1]
  const signo = (Number(reg.total) || 0) < 0 ? '-' : '+'
  const out = []
  const c = cuitDe(reg, cuitPorProveedor)
  if (c) out.push(`cuit:${c}|${corr}|${signo}`)
  if (reg.proveedor) out.push(`prov:${normalizar(reg.proveedor)}|${corr}|${signo}`)
  const cts = centavos(reg.total)
  if (cts != null) out.push(`num:${n}|${cts}`)
  return out
}

/**
 * Índice de las filas de Compras por TODAS sus huellas. Lo comparten la conciliación y el reparador,
 * para que los dos emparejen exactamente igual: dos criterios distintos sobre la misma pregunta es
 * cómo un reparador termina escribiendo sobre una fila que el auditor nunca miró.
 *
 * @returns {Map<string, object[]>}
 */
export function indicePorHuella(registros = [], opciones = {}) {
  const m = new Map()
  for (const r of registros) {
    for (const h of huellas(r, opciones)) {
      if (!m.has(h)) m.set(h, [])
      m.get(h).push(r)
    }
  }
  return m
}

/**
 * Las filas de Compras candidatas para una entrada del registro, probando las huellas EN ORDEN.
 * La primera huella que tenga candidatos gana: no se mezclan niveles, porque mezclar el CUIT con el
 * nombre haría que un empate débil contamine un emparejamiento fuerte.
 *
 * @returns {{filas:object[], por:string|null}}  `por` es el nivel que emparejó (`cuit`/`prov`/`num`)
 */
export function candidatasEnCompras(entrada = {}, indice = new Map(), opciones = {}) {
  for (const h of huellas(entrada, opciones)) {
    const filas = indice.get(h)
    if (filas?.length) return { filas, por: h.split(':')[0] }
  }
  return { filas: [], por: null }
}

/**
 * ¿DÓNDE ESTÁ DE VERDAD CADA COMPROBANTE QUE EL BOT DICE HABER CARGADO?
 *
 * `comunicacion.comprobantes_cargados.fila` es INFORMATIVA por diseño —lo dice el comentario de la
 * migración: si alguien inserta filas arriba, envejece—. Medido contra el archivo el 13/08, envejeció:
 * el registro decía que la fila 811 era Alumetal por $201.494.007 y la 811 es RSV por $67.797,51, y
 * DOS comprobantes distintos reclamaban la fila 840.
 *
 * Un auditor que confiara en ese número auditaría la fila equivocada, o sea que le atribuiría al bot
 * defectos de filas que cargó el dueño. Así que la fila se RE-RESUELVE contra el archivo por la
 * huella del comprobante, y la discrepancia se reporta: es un hallazgo por derecho propio.
 *
 * @returns {Array<{clave, proveedor, numero, filaRegistrada, filaReal, estado}>}
 *   estados: `ok` · `fila_movida` · `no_esta` · `reserva_cargada` · `reserva_huerfana`
 */
export function conciliarRegistro(entradas = [], registros = [], opciones = {}) {
  // ═══ EMPAREJA POR CUIT ANTES QUE POR NOMBRE (15/08) ═══
  //
  // Ver `huellas`. El nombre de la celda sale del desplegable de Compras y el del registro sale del
  // padrón: cuando difieren —fila 846, AXION— esto declaraba `no_esta` un comprobante perfectamente
  // cargado, y `no_esta` es el aviso más caro que tiene el vigía («el costo de esa obra está
  // sobrestimado por ese importe»). Sin `opciones` el comportamiento es exactamente el anterior más
  // la red por número+importe.
  const indice = indicePorHuella(registros, opciones)
  // ═══ LA RED MÁS DÉBIL SE PUEDE CAER, Y ENTONCES NO SE AFIRMA (20/08/2026) ═══
  //
  // Seis comprobantes emparejan SÓLO por `num:` —número + importe al centavo— porque su nombre de
  // celda no es el del registro y su CUIT no está en ninguna fuente de nombres. Esa huella necesita
  // el IMPORTE del lado de la pestaña, y el importe de Compras vive en `O`, que es una FÓRMULA.
  //
  // Si la lectura no trae los importes —la pestaña recalculando justo después de una carga, un rango
  // que volvió corto— del lado de la pestaña no se puede construir una sola huella `num:`, y esos
  // seis pasan a `no_esta`: *«figuran cargados y NO están en Compras… el costo de esas obras está
  // sobrestimado»*. Es el aviso más caro que tiene el vigía y es FALSO: las filas están, con su
  // número y su importe, algunas desde hace días. Pasó el 20/08 con las filas 846, 857, 864, 870,
  // 872 y 875.
  //
  // Un control que no puede evaluar su propia clave no dice «no está»: dice que no pudo. Se mide
  // sobre el índice —¿construyó ALGUNA huella de número?— y no sobre lo que el llamador afirme.
  const hayRedDeNumero = [...indice.keys()].some((k) => k.startsWith('num:'))
  return (entradas ?? []).map((e) => {
    // `Number(null)` es 0 y `Number.isInteger(0)` es true: sin el `== null` de adelante, una RESERVA
    // sin fila se leería como «cargado en la fila 0» y los cinco comprobantes que se reservaron y
    // nunca se escribieron desaparecerían del informe. Es el caso que más importa de los cinco.
    const filaRegistrada = e.fila == null || !Number.isInteger(Number(e.fila)) ? null : Number(e.fila)
    const { filas: halladas, por } = candidatasEnCompras(e, indice, opciones)
    const filaReal = halladas.length === 1 ? halladas[0].fila : (halladas.find((h) => h.fila === filaRegistrada)?.fila ?? halladas[0]?.fila ?? null)
    let estado
    // Sin la red de número, un `no_esta` puede ser un nombre distinto de los dos lados y nada más.
    const sinPoderVerificar = !hayRedDeNumero && centavos(e.total) != null
    if (filaRegistrada == null) {
      estado = filaReal != null ? 'reserva_cargada' : (sinPoderVerificar ? 'no_verificable' : 'reserva_huerfana')
    } else if (filaReal == null) estado = sinPoderVerificar ? 'no_verificable' : 'no_esta'
    else if (filaReal !== filaRegistrada) estado = 'fila_movida'
    else estado = 'ok'
    return {
      clave: e.clave ?? null,
      proveedor: e.proveedor ?? null,
      numero: e.numero ?? null,
      total: e.total ?? null,
      filaRegistrada,
      filaReal,
      repetidas: halladas.length > 1 ? halladas.map((h) => h.fila) : null,
      // CON QUÉ se emparejó: `cuit`, `prov` o `num`. Es lo que permite mirar un veredicto y saber si
      // lo sostiene la identidad real del proveedor o sólo el texto de la celda.
      por: por ?? null,
      estado,
    }
  })
}

/** Los hallazgos que salen de la conciliación del registro, en el mismo formato que los demás. */
function deRegistro(conciliado = []) {
  const out = []
  for (const c of conciliado) {
    if (c.estado === 'ok') continue
    const quien = `${c.proveedor ?? '?'} ${c.numero ?? ''}`.trim()
    // EL IMPORTE VIAJA CON EL HALLAZGO. Sin él, «Alumetal 0031-00002661 no está en Compras» es una
    // molestia administrativa; con él es «el costo de esa obra está sobrestimado en $1.095.076,13», que
    // es lo que hace que alguien lo mire. `vigilancia.mjs` suma esta columna para priorizar.
    const conPlata = (h) => ({ ...h, total: c.total ?? null })
    if (c.estado === 'fila_movida') {
      out.push(conPlata({
        fila: c.filaReal, defecto: DEFECTO.REGISTRO, columna: '—', proveedor: c.proveedor,
        dice: `el registro dice fila ${c.filaRegistrada}`, deberia: `fila ${c.filaReal}`,
        origen: `${quien} está en la ${c.filaReal}; la ${c.filaRegistrada} tiene otro comprobante`,
      }))
    } else if (c.estado === 'no_esta') {
      out.push(conPlata({
        fila: c.filaRegistrada, defecto: DEFECTO.REGISTRO, columna: '—', proveedor: c.proveedor,
        dice: `registrado como cargado en la fila ${c.filaRegistrada}`, deberia: 'no está en Compras',
        origen: `${quien} no aparece en ninguna fila: el registro bloquea volver a cargarlo y el gasto no está`,
      }))
    } else if (c.estado === 'reserva_huerfana') {
      out.push(conPlata({
        fila: null, defecto: DEFECTO.RESERVA, columna: '—', proveedor: c.proveedor,
        dice: 'clave reservada sin fila', deberia: 'la fila donde quedó, o soltar la reserva',
        origen: `${quien} se reservó y la escritura no llegó a ocurrir: no está en Compras y no se puede volver a mandar`,
      }))
    } else if (c.estado === 'reserva_cargada') {
      out.push(conPlata({
        fila: c.filaReal, defecto: DEFECTO.RESERVA, columna: '—', proveedor: c.proveedor,
        dice: 'clave reservada sin fila', deberia: `fila ${c.filaReal}`,
        origen: `${quien} SÍ está en Compras (fila ${c.filaReal}) pero el registro se quedó sin anotar dónde`,
      }))
    }
  }
  return out
}

/**
 * Audita las filas de Compras que cargó el bot.
 *
 * @param {Array<Array>} filas   lo que devuelve `readSheetValues('Compras!B4:O')`
 * @param {{delBot?:Iterable<number>, perfiles?:object}} o
 *   `delBot`: números de fila de `comunicacion.comprobantes_cargados`. Sin él se auditan todas y se
 *   declara — auditar de más se ve; auditar de menos, no.
 *   `totalesFiscales`: correlativo → totales del libro fiscal. Sin él los grupos repetidos NO se
 *   declaran duplicados: se declaran "a revisar" (ver `deDuplicados`).
 *   `cuitPorProveedor`: nombre normalizado → CUIT, de fuentes independientes del registro. Sin él la
 *   conciliación empareja por nombre, y un nombre distinto de los dos lados produce un `no_esta`
 *   falso (ver `huellas`).
 * @returns {{hallazgos:Array, resumen:Object, filasDelBot:number, filasMal:number, alcance:string}}
 */
export function auditarCompras(filas = [], {
  delBot = null, registro = null, perfiles = null, motivoTodas = null, totalesFiscales = null,
  cuitPorProveedor = null,
} = {}) {
  const registros = filas.map(registroDeFila).filter(hayFila)

  // ═══ LA FILA SE RE-RESUELVE CONTRA EL ARCHIVO, NO SE CONFÍA DEL REGISTRO ═══
  //
  // Si viene el registro entero se concilia por huella y se auditan las filas donde el comprobante
  // ESTÁ, no donde el registro dice que quedó. La evidencia es el dato leído en su destino.
  const conciliado = registro ? conciliarRegistro(registro, registros, { cuitPorProveedor }) : null
  const filasDelRegistro = conciliado
    ? conciliado.map((c) => c.filaReal).filter(Number.isInteger)
    : (delBot ? [...delBot].map(Number) : null)

  const mias = filasDelRegistro ? new Set(filasDelRegistro) : null
  const alcance = mias
    ? 'filas cargadas por el bot'
    : `TODAS las filas de Compras (${motivoTodas ?? 'no se pudo leer el registro del bot'})`
  const auditables = registros.filter((r) => !mias || mias.has(r.fila))

  // El historial se aprende de TODAS las filas, no sólo de las auditables: lo que el dueño imputó a
  // mano es justamente la evidencia contra la que se juzga lo que cargó el bot. Un control validado
  // contra la información que él mismo produce no controla nada.
  const perf = perfiles ?? perfilesDeImputacion(registros.map((r) => ({
    proveedor: r.proveedor, unidad_negocio: r.unidad, obra_texto: r.obra,
    detalle: r.detalle, concepto: r.concepto, categoria: r.categoria,
  })))

  // QUIÉN FACTURA Y QUIÉN NO SALE DEL PROPIO ARCHIVO, no de una lista escrita a mano. Se aprende de
  // TODAS las filas por la misma razón que los perfiles de imputación: lo que el dueño cargó a mano
  // es la evidencia contra la que se juzga el resto.
  const facturadores = new Set()
  for (const r of registros) {
    if (tieneComprobanteFiscal({ tipo: r.tipo, numero: r.numeroCrudo, esNotaCredito: r.tipo === 'NC' })) {
      facturadores.add(normalizar(r.proveedor ?? ''))
    }
  }

  const hallazgos = []
  for (const r of auditables) {
    hallazgos.push(
      ...deCategoria(r), ...deRespaldo(r, facturadores), ...deAritmetica(r),
      ...deTipo(r), ...deModalidad(r), ...deImputacion(r, perf),
    )
  }
  const dup = deDuplicados(registros, mias, totalesFiscales)
  hallazgos.push(...dup.hallazgos)
  if (conciliado) hallazgos.push(...deRegistro(conciliado))

  const resumen = {}
  for (const h of hallazgos) resumen[h.defecto] = (resumen[h.defecto] ?? 0) + 1
  return {
    hallazgos: hallazgos.sort((a, b) => (a.fila ?? 1e9) - (b.fila ?? 1e9) || a.defecto.localeCompare(b.defecto)),
    resumen,
    filasDelBot: auditables.length,
    filasMal: new Set(hallazgos.map((h) => h.fila)).size,
    alcance,
    // Los repartos NO son hallazgos, pero declararlos importa: es la diferencia entre "el auditor no
    // los vio" y "los vio y los descartó con el libro fiscal delante".
    repartos: dup.repartos,
    ...(conciliado ? { conciliado } : {}),
  }
}

/**
 * LA CATEGORÍA (columna B) SE AFIRMA EN UN SOLO SENTIDO: hay comprobante fiscal ⇒ B.
 *
 * El caso conocido es la fila 840 —Rodamientos Cuyo, factura A 0012-00050057— que quedó en `N`: un
 * gasto documentado registrado como si fuera en negro. La regla no la inventa este archivo: es la
 * misma `categoriaDelComprobante` que usa la carga desde el 13/08.
 *
 * EL SENTIDO INVERSO NO SE AFIRMA. «No hay número en la pestaña» no es «no hay comprobante», y en
 * esta empresa hay 137 filas de obligaciones formales sin factura —Sueldos, ARCA, SINDICATOS, Banco,
 * FCL, SAC— que van B y están bien. Ver el encabezado: ese lado marcaba 163 filas y 145 eran sanas.
 * Lo que falta en las otras 18 no es la categoría: es el respaldo, y lo dice `deRespaldo`.
 */
function deCategoria(r) {
  const fiscal = tieneComprobanteFiscal({ tipo: r.tipo, numero: r.numeroCrudo, esNotaCredito: r.tipo === 'NC' })
  if (!fiscal || r.categoria === 'B') return []
  return [{
    fila: r.fila, defecto: DEFECTO.CATEGORIA, columna: 'B', proveedor: r.proveedor,
    dice: r.categoria ?? '(vacío)', deberia: 'B',
    origen: `hay comprobante fiscal: G dice «${r.tipoCrudo}» y H dice «${r.numeroCrudo}»`,
  }]
}

/**
 * FILA MARCADA "B" SIN NADA QUE LA RESPALDE, DE UN PROVEEDOR QUE SÍ FACTURA.
 *
 * Reemplaza al lado que la categoría ya no afirma, y se puede afirmar porque el criterio sale del
 * PROPIO archivo, no de una lista escrita a mano: «este proveedor emite comprobantes fiscales» es
 * verdad si tiene al menos una fila con tipo fiscal y número en esta misma pestaña. Sueldos, ARCA,
 * SINDICATOS, Banco, FCL, SAC y Google no tienen ninguna y quedan afuera solos; Corralón Progreso,
 * Combustibles Barcelo o Alumetal tienen decenas, así que una fila suya sin tipo ni número es un
 * comprobante que no se anotó.
 *
 * @param {Set<string>} facturadores  proveedores normalizados con al menos una fila fiscal
 */
function deRespaldo(r, facturadores) {
  // La letra del comprobante está y el número no. No hace falta mirar al proveedor: una factura A
  // sin número no se puede conciliar con ARCA ni deduplicar —es la fila 669, Alumetal, $18.166.380,84—
  // y el propio cargador frena una carga así por no tener clave de idempotencia.
  if (r.tipoCrudo && r.tipo !== 'N/A' && !r.numeroCrudo) {
    return [{
      fila: r.fila, defecto: DEFECTO.RESPALDO, columna: 'H', proveedor: r.proveedor,
      dice: `${r.tipoCrudo} sin número`, deberia: 'el número del comprobante',
      origen: 'sin número no se puede cruzar contra ARCA ni detectar si está cargado dos veces',
    }]
  }
  if (r.categoria !== 'B') return []
  if (r.tipoCrudo || r.numeroCrudo) return []
  if (!facturadores.has(normalizar(r.proveedor ?? ''))) return []
  return [{
    fila: r.fila, defecto: DEFECTO.RESPALDO, columna: 'G/H', proveedor: r.proveedor,
    dice: 'B sin tipo ni número', deberia: 'el tipo y el número del comprobante',
    origen: `${r.proveedor} emite comprobantes fiscales en otras filas de Compras: si esta va en blanco, falta anotar cuál la respalda`,
  }]
}

/** M = Total − IVA. Es contrato de la columna, no una opinión: absorbe percepciones e internos. */
function deAritmetica(r) {
  if (r.total == null || r.importe == null) return []
  const esperado = Math.round(((r.total ?? 0) - (r.iva ?? 0)) * 100) / 100
  if (Math.abs(esperado - r.importe) <= TOLERANCIA) return []
  return [{
    fila: r.fila, defecto: DEFECTO.ARITMETICA, columna: 'M', proveedor: r.proveedor,
    dice: r.importe, deberia: esperado,
    origen: `O (total) ${r.total} − N (IVA) ${r.iva ?? 0} = ${esperado}`,
  }]
}

/** El tipo (G) y el número (H) tienen que decir lo mismo sobre si hay comprobante fiscal. */
function deTipo(r) {
  const TIPOS = ['A', 'B', 'C', 'NC', 'N/A']
  if (r.tipoCrudo && !TIPOS.includes(r.tipo)) {
    return [{
      fila: r.fila, defecto: DEFECTO.TIPO, columna: 'G', proveedor: r.proveedor,
      dice: r.tipoCrudo, deberia: 'F A · F B · F C · N C · N/A',
      origen: 'el desplegable estricto de la columna G no tiene ese valor: la celda queda en rojo',
    }]
  }
  // ═══ LA FORMA SE MIDE SOBRE LA CELDA, NO SOBRE EL CANÓNICO (13/08) ═══
  //
  // Esto miraba `r.numero`, que es lo que devuelve `numeroCanonico`, y ése SIEMPRE devuelve la forma
  // `0000-00000000`: le da forma de comprobante fiscal a cualquier cosa. `W303094 C1-1V` —un plan de
  // pagos de ARCA— sale `0001-00000001` porque el regex enganchó el «1-1» de adentro, y la factura de
  // Google `5472332541` sale `0054-72332541`. Siete de los diecisiete hallazgos de tipo eran eso: el
  // auditor le reclamaba la letra de la factura a un plan de pagos y a una factura de Google.
  // El punto de venta y el guión tienen que estar EN LA CELDA para poder afirmar que es fiscal.
  const crudoFiscal = /^\s*\d{1,5}\s*-\s*\d{1,8}\s*$/.test(String(r.numeroCrudo ?? ''))
  if ((!r.tipoCrudo || r.tipo === 'N/A') && crudoFiscal && r.numero !== '0000-00000000') {
    return [{
      fila: r.fila, defecto: DEFECTO.TIPO, columna: 'G', proveedor: r.proveedor,
      dice: r.tipoCrudo ?? '(vacío)', deberia: 'la letra del comprobante (F A / F B / F C / N C)',
      origen: `H tiene un número de comprobante fiscal («${r.numeroCrudo}») y G no dice de qué tipo`,
    }]
  }
  return []
}

/** La modalidad (F) sale de la condición de venta del comprobante y tiene desplegable estricto. */
function deModalidad(r) {
  if (!r.modalidad) {
    return [{
      fila: r.fila, defecto: DEFECTO.MODALIDAD, columna: 'F', proveedor: r.proveedor,
      dice: '(vacío)', deberia: MODALIDADES.join(' · '),
      origen: 'la condición de venta del comprobante decide F, X y S; vacía, la fila no cae en ningún estado de pago',
    }]
  }
  if (!MODALIDADES.some((m) => normalizar(m) === normalizar(r.modalidad))) {
    return [{
      fila: r.fila, defecto: DEFECTO.MODALIDAD, columna: 'F', proveedor: r.proveedor,
      dice: r.modalidad, deberia: MODALIDADES.join(' · '),
      origen: 'el desplegable estricto de la columna F no tiene ese valor: la celda queda en rojo',
    }]
  }
  return []
}

/**
 * LA OBRA (J) Y EL DETALLE (K) VACÍOS CUANDO EL HISTORIAL LOS RESUELVE.
 *
 * No se marca «está vacío»: se marca «está vacío Y la lib de imputación aprendida lo afirma FIRME»
 * (`pide_confirmacion:false`, o sea n≥5 y ≥80% del historial de ese proveedor). Ésa es exactamente la
 * misma condición con la que la carga los habría llenado sola — si el historial alcanzaba y la celda
 * quedó vacía, algo no corrió.
 *
 * ═══ K NO SE LLENA CON L, Y ESO COSTÓ 81 FALSOS POSITIVOS (13/08) ═══
 *
 * Había una segunda fuente: «si L dice qué se compró, K se puede llenar con eso». Medido sobre las
 * 643 filas reales que tienen las dos columnas, **K es igual a L en el 2%**. No son la misma cosa: K
 * es el DESTINO dentro de la obra —"Galpon 9", "Cierre Perimetral", "Mamposteria", "combustible"— y
 * L es el renglón del comprobante —"cemento x 30", "brocha", "Ampolla Quimica"—. Copiar L en K
 * ensuciaría además el vocabulario vivo de la columna K, que es justo con lo que `compras-vivas.mjs`
 * resuelve la obra escrita a mano en el papel: el arreglo habría roto la lectura.
 */
function deImputacion(r, perfiles) {
  const out = []
  const s = sugerirImputacion({ proveedor: r.proveedor, concepto: r.concepto, obra: r.obra }, perfiles ?? {})
  if (!r.obra && s.obra?.sugerido && !s.obra.pide_confirmacion) {
    out.push({
      fila: r.fila, defecto: DEFECTO.OBRA, columna: 'J', proveedor: r.proveedor,
      dice: '(vacío)', deberia: s.obra.sugerido,
      origen: `${r.proveedor} se imputó a «${s.obra.sugerido}» en ${s.obra.n} de sus cargas (${Math.round((s.obra.share ?? 0) * 100)}%)`,
    })
  }
  if (!r.detalle && s.detalle?.sugerido && !s.detalle.pide_confirmacion) {
    out.push({
      fila: r.fila, defecto: DEFECTO.DETALLE, columna: 'K', proveedor: r.proveedor,
      dice: '(vacío)', deberia: s.detalle.sugerido,
      origen: `en esa obra, ${r.proveedor} usó «${s.detalle.sugerido}» ${s.detalle.n} vez/veces (${Math.round((s.detalle.share ?? 0) * 100)}%)`,
    })
  }
  return out
}

/** El correlativo con el que se busca un comprobante en el libro fiscal (últimos 8 dígitos). */
export function correlativo(numero) {
  const n = numeroCanonico(numero)
  return n ? n.split('-')[1] : null
}

/**
 * DOS FILAS PARA EL MISMO COMPROBANTE — O UNA FACTURA REPARTIDA ENTRE DOS OBRAS.
 *
 * Se busca sobre TODAS las filas, no sólo las del bot: el duplicado típico es una fila del bot contra
 * una que cargó el dueño a mano. Se reporta sólo si al menos una es del bot —es lo que este auditor
 * puede afirmar que salió de acá— y se nombran todas las filas del grupo, porque cuál se borra es una
 * decisión de la persona, no del script.
 *
 * ═══ EL ÁRBITRO NO PUEDE SER LA PROPIA PESTAÑA (13/08) ═══
 *
 * Repetir la identidad NO es duplicar: en esta empresa una factura se reparte entre obras y cada
 * parte es una fila. Medido contra `public.comprobantes_arca`, 13 de los 23 grupos que este auditor
 * marcaba eran repartos —Meglioli `0004-00000702` son dos filas de $124.751 y el comprobante es de
 * $249.502— y sólo 2 eran duplicados de verdad. El libro fiscal decide:
 *
 * · Σ de los totales de las filas ≈ el total del comprobante  → REPARTO. No es hallazgo.
 * · alguna fila sola ya lleva el total del comprobante         → DUPLICADO confirmado, con el monto
 *   contado de más.
 * · el libro no tiene ese comprobante                          → no se afirma: «a revisar».
 *
 * Y una fila del grupo SIN importes es un hallazgo aunque el reparto cierre: no suma plata, pero es
 * una fila fantasma que reclama la identidad de otra (fila 743 contra la 773).
 *
 * @param {Map<string, number[]>} [totalesFiscales]  correlativo → totales del libro fiscal
 */
function deDuplicados(registros, mias, totalesFiscales = null) {
  const grupos = new Map()
  for (const r of registros) {
    const k = identidad(r)
    if (!k) continue
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(r)
  }
  const out = []
  const repartos = []
  for (const [k, filas] of grupos) {
    if (filas.length < 2) continue
    if (mias && !filas.some((f) => mias.has(f.fila))) continue
    const nums = filas.map((f) => f.fila)
    const conImporte = filas.filter((f) => f.total != null)
    const suma = Math.round(conImporte.reduce((a, f) => a + (f.total ?? 0), 0) * 100) / 100
    const delLibro = totalesFiscales?.get(correlativo(filas[0].numero) ?? '') ?? null
    const cerca = (a, b) => Math.abs(a - b) <= TOLERANCIA + 0.5
    // No se exige que haya más de una fila CON importe: el caso 743/773 es una fila con los importes
    // y otra vacía, y ahí el reparto cierra igual — lo que sobra es la fila fantasma, no la plata.
    const esReparto = Boolean(delLibro?.length) && conImporte.length > 0 && delLibro.some((t) => cerca(t, suma))
    const dobleTotal = Boolean(delLibro?.length) && !esReparto
      && delLibro.some((t) => conImporte.filter((f) => cerca(f.total, t)).length > 1)

    for (const f of filas) {
      if (mias && !mias.has(f.fila)) continue
      // La fila sin importes duplica la identidad aunque el reparto cierre: no suma plata, ocupa un
      // lugar. Se dice exactamente eso y no "está duplicado el gasto", que sería falso.
      if (esReparto && f.total != null) continue
      const veredicto = f.total == null
        ? { deberia: `borrar la fila (los importes están en la ${conImporte[0]?.fila ?? '?'})`, por: 'fila sin importes que repite la identidad de otra' }
        : dobleTotal
          ? { deberia: `una sola fila (hoy son ${filas.length}: ${nums.join(', ')})`, por: `el libro fiscal dice que el comprobante es de ${delLibro[0]} y hay ${conImporte.length} filas con ese total: se contó de más` }
          : delLibro?.length
            ? { deberia: `revisar: el libro fiscal dice ${delLibro.join(' / ')} y las filas suman ${suma}`, por: 'la suma de las filas no coincide con el comprobante: puede ser un reparto incompleto o una fila de más' }
            : { deberia: `revisar (hoy son ${filas.length}: ${nums.join(', ')})`, por: 'el comprobante no está en el libro fiscal: no se puede afirmar si es un reparto o un duplicado' }
      out.push({
        fila: f.fila, defecto: DEFECTO.DUPLICADO, columna: '—', proveedor: f.proveedor,
        dice: `${f.proveedor} ${f.tipoCrudo ?? ''} ${f.numeroCrudo ?? ''} — ${f.total}`.replace(/\s+/g, ' ').trim(),
        deberia: veredicto.deberia,
        origen: `misma identidad (${k}) · ${veredicto.por}`,
      })
    }
    if (esReparto) repartos.push({ identidad: k, filas: nums, suma, total: delLibro[0] })
  }
  return { hallazgos: out, repartos }
}

/** El informe en texto, fila por fila y con su resumen. Es lo que el dueño mira. */
export function informe(r = {}) {
  const l = []
  l.push(`# Comprobantes mal cargados — ${r.filasMal ?? 0} fila(s) con al menos un defecto`)
  l.push('')
  l.push(`Alcance: ${r.alcance ?? '?'} · ${r.filasDelBot ?? 0} fila(s) auditadas.`)
  l.push('')
  const res = r.resumen ?? {}
  if (Object.keys(res).length) {
    l.push('| Defecto | Cuántos |')
    l.push('|---|---:|')
    for (const [k, n] of Object.entries(res).sort((a, b) => b[1] - a[1])) l.push(`| ${k} | ${n} |`)
    l.push('')
  } else {
    l.push('_No se encontró ningún defecto._')
    return l.join('\n')
  }
  l.push('| Fila | Col | Proveedor | Dice hoy | Debería decir | De dónde sale |')
  l.push('|---:|---|---|---|---|---|')
  for (const h of r.hallazgos ?? []) {
    l.push(`| ${h.fila} | ${h.columna} | ${h.proveedor ?? '—'} | ${h.dice} | ${h.deberia} | ${h.origen} |`)
  }
  return l.join('\n')
}
