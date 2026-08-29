// UNA COTIZACIÓN SE RECONOCE POR LO QUE DICE, NO POR DÓNDE LO DICE. PURO — sin red, sin modelo.
//
// ═══ EL PROBLEMA QUE CERRABA 48 ARCHIVOS ═══
//
// El lector de cotizaciones de ECSAS (`cotizacion-ecsas.mjs`) pide las pestañas `Análisis`,
// `Presupuesto` y `GG`, y lee cada columna por su LETRA. Es correcto para la plantilla interna, y no
// puede leer nada más. Las cotizaciones que ARCOR manda en SU formato —una sola pestaña, «Planilla
// de cotización» o «ARSJ Oficinas 2023», con los encabezados en la fila 6 o en la 7 según el año—
// quedaban afuera con el motivo «formato diferente», que no dice nada y no se puede arreglar.
//
// ═══ LA REGLA: EL ENCABEZADO ES EL CONTRATO, NO LA COORDENADA ═══
//
// Las dos familias de ARCOR y la interna de ECSAS dicen LO MISMO con otras palabras y en otro lugar:
//
//   «ÍTEM · DESCRIPCIÓN · UNIDAD · CANTIDAD · MATERIAL · MANO DE OBRA · PRECIO UNITARIO · …»
//   «Ítem · Elementos a presupuestar · Unidad · Cantidad · Material / Equipo · Mano de Obra · …»
//
// Se busca la FILA que más roles reconoce, se mapea cada rol a su columna, y a partir de ahí la
// geometría deja de importar: si mañana ARCOR agrega una columna al principio, el lector la sigue.
// Fijar `C` para descripción y `E` para cantidad es lo que hay que no hacer.
//
// ═══ UNA CELDA EN ERROR NUNCA ES UN NÚMERO ═══
//
// `celda.mjs` ya explica por qué, con el caso medido: un `#DIV/0!` cuyo valor cacheado vale 7 entra
// como si fuera plata y tapa el hallazgo verdadero, que es que esa oferta NO TIENE TOTAL. Acá se
// respeta esa envoltura: un importe en error sale como error y no suma.
import { esErrorDeCelda, textoDelError } from './celda.mjs'

/** Qué significa cada columna. Es el vocabulario común entre plantillas distintas. */
export const ROL = Object.freeze({
  ITEM: 'ITEM', DESCRIPCION: 'DESCRIPCION', UNIDAD: 'UNIDAD', CANTIDAD: 'CANTIDAD',
  MATERIAL: 'MATERIAL', MANO_DE_OBRA: 'MANO_DE_OBRA', PRECIO_UNITARIO: 'PRECIO_UNITARIO',
  PRECIO_ITEM: 'PRECIO_ITEM', PRECIO_RUBRO: 'PRECIO_RUBRO',
})

/**
 * CÓMO SE ESCRIBE CADA ROL EN LAS PLANILLAS REALES.
 *
 * Cada sinónimo salió de un encabezado que existe en la carpeta de Drive. Inventar sinónimos
 * plausibles hace que el detector enganche donde no debe, y un encabezado mal detectado corre TODAS
 * las columnas: es peor que no detectar nada.
 */
export const SINONIMOS = Object.freeze({
  [ROL.ITEM]: ['item', 'itm', 'n', 'nro', 'numero', 'num', 'codigo', 'cod', 'orden'],
  [ROL.DESCRIPCION]: ['descripcion', 'elementos a presupuestar', 'detalle', 'designacion', 'concepto', 'tarea', 'tareas', 'trabajos', 'rubro / item', 'denominacion', 'elemento', 'elementos'],
  [ROL.UNIDAD]: ['unidad', 'un', 'unid', 'u med', 'u de medida', 'unidad de medida', 'umed'],
  [ROL.CANTIDAD]: ['cantidad', 'cant', 'cantidades', 'metrado', 'computo'],
  [ROL.MATERIAL]: ['material', 'materiales', 'material equipo', 'material / equipo', 'materiales y equipos', 'insumos'],
  [ROL.MANO_DE_OBRA]: ['mano de obra', 'm o', 'mo', 'manodeobra'],
  [ROL.PRECIO_UNITARIO]: ['precio unitario', 'precio unit', 'p unitario', 'unitario', 'costo unitario'],
  [ROL.PRECIO_ITEM]: ['precio del item', 'precio item', 'importe', 'total item', 'parcial', 'subtotal item'],
  [ROL.PRECIO_RUBRO]: ['precio del rubro', 'total rubro', 'total del rubro', 'subtotal rubro'],
})

/** Sin acentos, sin puntuación y con un solo espacio: dos encabezados que se escriben distinto y
 *  significan lo mismo tienen que caer en la misma cadena. PURA. */
export const clave = (v) => String(v ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const INDICE_SINONIMOS = new Map(Object.entries(SINONIMOS).flatMap(([rol, ns]) => ns.map((n) => [n, rol])))

/** El largo mínimo de un sinónimo para poder matchear por PREFIJO. `un`, `mo` y `n` son sinónimos
 *  legítimos y a la vez el principio de media lengua castellana: dejarlos matchear por prefijo
 *  convierte «Nombre del proveedor» en una columna de ítem. */
export const PREFIJO_MINIMO = 6

/** Y el largo máximo del ENCABEZADO ENTERO para poder matchear por prefijo. «Unidad de negocio a la
 *  que provee» empieza con «unidad» y no es una columna de unidad de medida: es una pregunta del
 *  formulario de alta de proveedores. Una cola de más de dos o tres palabras ya cambia el
 *  significado, y este tope es la forma barata de decirlo. */
export const PREFIJO_MAX_LARGO = 26

/** Los sinónimos que sí pueden matchear por prefijo, del más largo al más corto: «cantidad
 *  contratada» tiene que ganarle a «cantidad» si algún día se agrega el primero. */
const PREFIJABLES = Object.entries(SINONIMOS)
  .flatMap(([rol, ns]) => ns.filter((n) => n.length >= PREFIJO_MINIMO).map((n) => [n, rol]))
  .sort((a, b) => b[0].length - a[0].length)

/**
 * EL ROL DE UN TEXTO DE ENCABEZADO, O `null`. PURA.
 *
 * Primero la igualdad exacta; recién si no hay, el prefijo. Los encabezados reales agregan una cola
 * que no cambia el significado —«DESCRIPCIÓN DE LA OBRA», «Cantidad Contratada», «Unid.»— y exigir
 * igualdad exacta dejaba afuera planillas enteras por una palabra de más.
 */
export function rolDeEncabezado(v) {
  if (esErrorDeCelda(v)) return null
  const k = clave(v)
  if (!k || k.length > 34) return null
  const exacto = INDICE_SINONIMOS.get(k)
  if (exacto) return exacto
  if (k.length > PREFIJO_MAX_LARGO) return null
  const porPrefijo = PREFIJABLES.find(([n]) => k.startsWith(`${n} `))
  return porPrefijo?.[1] ?? null
}

/** Cuántos roles DISTINTOS reconoce una fila, y en qué columna cae cada uno. PURA. */
export function rolesDeFila(fila = []) {
  const columnas = {}
  fila.forEach((celda, i) => {
    const rol = rolDeEncabezado(celda)
    // El primero gana: una planilla con dos columnas «Cantidad» —pasa cuando alguien copió un
    // bloque— usa la de la izquierda, que es la del cuerpo.
    if (rol && columnas[rol] === undefined) columnas[rol] = i
  })
  return columnas
}

/** El mínimo de roles para creerle a una fila que es el encabezado. Con dos, cualquier fila que diga
 *  «Total» y «Unidad» pasaría; con cuatro, no entra la planilla que no trae precios. */
export const ROLES_MINIMOS = 3

/** Los roles que no pueden faltar: sin descripción no hay ítem que nombrar, y sin unidad ni cantidad
 *  lo que hay es una lista, no una cotización. */
export const IMPRESCINDIBLES = Object.freeze([ROL.DESCRIPCION])

/**
 * DÓNDE ESTÁ EL ENCABEZADO. PURA.
 *
 * Se recorren las primeras filas y gana la que más roles reconoce. No se toma la primera que llega a
 * los mínimos: en las planillas de ARCOR las filas 2 a 4 traen «Proyecto:», «Obra Civil:» y
 * «Contacto:», y alguna de ellas puede enganchar dos roles por casualidad.
 */
export function detectarEncabezado(filas = [], { maxFilas = 40, minimos = ROLES_MINIMOS } = {}) {
  let mejor = null
  const hasta = Math.min(filas.length, maxFilas)
  for (let f = 0; f < hasta; f++) {
    const columnas = rolesDeFila(filas[f] ?? [])
    const cuantos = Object.keys(columnas).length
    if (cuantos > (mejor?.cuantos ?? 0)) mejor = { fila: f, columnas, cuantos }
  }
  if (!mejor || mejor.cuantos < minimos) {
    return { ok: false, porQue: `ninguna de las primeras ${hasta} filas reconoce ${minimos} encabezados de cotización (la mejor reconoció ${mejor?.cuantos ?? 0}: ${Object.keys(mejor?.columnas ?? {}).join(', ') || 'ninguno'})` }
  }
  const faltan = IMPRESCINDIBLES.filter((r) => mejor.columnas[r] === undefined)
  if (faltan.length) return { ok: false, porQue: `la fila ${mejor.fila + 1} reconoce ${mejor.cuantos} encabezados pero ninguno es ${faltan.join(' ni ')}: sin eso no se sabe qué se está cotizando` }
  return { ok: true, ...mejor, porQue: `fila ${mejor.fila + 1}: ${Object.entries(mejor.columnas).map(([r, c]) => `${r}→col ${c + 1}`).join(' · ')}` }
}

/** El valor de una columna de una fila, respetando la envoltura de error. PURA. */
export const celdaDe = (fila, col) => (col === undefined || fila === undefined ? null : fila[col] ?? null)

/** El texto de una celda; una celda en error devuelve su texto de error, nunca su valor. PURA. */
export const textoDe = (v) => (esErrorDeCelda(v) ? textoDelError(v) : (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim()))

/** Una agrupación de miles INEQUÍVOCA: hacen falta DOS grupos —`12.345.678`—, porque con uno solo
 *  (`1.234`) las dos lecturas son legítimas y eso se declara, no se decide. PURA. */
const agrupado = (t, sep) => new RegExp(`^-?\\d{1,3}(?:\\${sep}\\d{3}){2,}$`).test(t)

/**
 * EL NÚMERO DE UNA CELDA, O `null` CON EL MOTIVO. PURA.
 *
 * `null` no es 0. Una cantidad ausente y una cantidad cero son dos cosas distintas: la primera es un
 * ítem sin computar y la segunda es un ítem que se decidió no hacer.
 *
 * ═══ QUÉ SEPARADOR ES EL DECIMAL NO SE PUEDE ASUMIR ═══
 *
 * El OS trabaja en locale es_AR, pero estos libros NO: `xlsx` devolvió `$ 828,512.40` de una planilla
 * de ARCOR —coma de miles, punto decimal— porque el formato de celda es en-US. Asumir es_AR convierte
 * $828.512,40 en $828,51: tres órdenes de magnitud, sin error y sin aviso.
 *
 * La regla es la única defendible sin adivinar: cuando aparecen los dos separadores, el ÚLTIMO es el
 * decimal. Cuando aparece uno solo y separa exactamente grupos de tres, es de miles. Y cuando aparece
 * uno solo separando tres dígitos UNA vez —`1,234`— las dos lecturas son legítimas: se devuelve una y
 * se declara `ambiguo` con la otra, en vez de elegir a dedo y callarse.
 */
export function numeroDe(v) {
  if (esErrorDeCelda(v)) return { valor: null, porQue: `la celda está en ${textoDelError(v)}: su valor cacheado no es un número` }
  if (v === null || v === undefined || v === '') return { valor: null, porQue: 'la celda está vacía' }
  if (typeof v === 'number') return Number.isFinite(v) ? { valor: v } : { valor: null, porQue: 'el número no es finito' }
  const t = String(v).replace(/[^\d,.\-]/g, '').replace(/(?!^)-/g, '')
  if (!/\d/.test(t)) return { valor: null, porQue: `«${String(v).slice(0, 30)}» no tiene ninguna cifra` }
  const punto = t.lastIndexOf('.')
  const coma = t.lastIndexOf(',')
  let decimal = null
  let ambiguo = null
  if (punto >= 0 && coma >= 0) decimal = punto > coma ? '.' : ','
  else if (punto >= 0 || coma >= 0) {
    const sep = punto >= 0 ? '.' : ','
    if (agrupado(t, sep)) decimal = null
    else if (/^-?\d{1,3}[.,]\d{3}$/.test(t)) {
      // Se devuelve la lectura de MILES porque es la que domina en estos libros, y se declara la otra.
      decimal = null
      ambiguo = { otraLectura: Number(`${t.split(sep)[0]}.${t.split(sep)[1]}`), porQue: `«${t}» separa exactamente tres dígitos una sola vez: «${sep}» puede ser el separador de miles o el decimal` }
    } else decimal = sep
  }
  const limpio = decimal ? t.split(decimal).join('#').replace(/[.,]/g, '').replace('#', '.') : t.replace(/[.,]/g, '')
  const n = Number(limpio)
  if (!Number.isFinite(n)) return { valor: null, porQue: `«${String(v).slice(0, 30)}» no se pudo leer como número` }
  return ambiguo ? { valor: n, ambiguo } : { valor: n }
}

export const TIPO_FILA = Object.freeze({ RUBRO: 'RUBRO', ITEM: 'ITEM', CIERRE: 'CIERRE', NOTA: 'NOTA', VACIA: 'VACIA' })

/**
 * QUÉ CLASE DE PLANILLA ES, AUNQUE LAS TRES TENGAN LA MISMA FORMA.
 *
 * Un certificado de obra tiene ítem, unidad, cantidad y precio unitario igual que una cotización, y
 * NO es una cotización: sus cantidades son las EJECUTADAS y su precio ya está acordado. Meterlo en
 * el corpus de «cómo cotiza ECSAS» ensucia la práctica con números que nadie decidió al cotizar. Un
 * cómputo tampoco lo es: no tiene precio y por eso no puede enseñar nada sobre precios.
 */
export const CLASE_PLANILLA = Object.freeze({ COTIZACION: 'COTIZACION', CERTIFICADO: 'CERTIFICADO', COMPUTO: 'COMPUTO' })

const ROLES_CON_PRECIO = Object.freeze([ROL.PRECIO_UNITARIO, ROL.PRECIO_ITEM, ROL.PRECIO_RUBRO, ROL.MATERIAL, ROL.MANO_DE_OBRA])

/** Lo que el NOMBRE del archivo dice que es. Es una pista, no la respuesta: en este data room hay
 *  «Planilla de computo» que traen precio unitario y total. PURA. */
export function clasePorNombre(nombre) {
  const k = clave(nombre)
  if (/certificad/.test(k)) return CLASE_PLANILLA.CERTIFICADO
  if (/computo|comput/.test(k)) return CLASE_PLANILLA.COMPUTO
  if (/cotizacion|presupuesto|oferta/.test(k)) return CLASE_PLANILLA.COTIZACION
  return null
}

/**
 * LA CLASE DE LA PLANILLA. PURA.
 *
 * Decide la ESTRUCTURA —el encabezado y lo que dice arriba de él, que es donde estas plantillas
 * ponen su título— porque es lo único medido. Cuando el NOMBRE del archivo dice otra cosa, esa
 * contradicción se DECLARA en `discrepancia` y no se resuelve en silencio: «Computo de
 * Materiales.xlsx» con una columna `$ unitario` es un cómputo valorizado, y quién tiene razón lo
 * decide quien lo use, no este módulo.
 */
export function clasePlanilla(filas = [], encabezado = {}, { nombre = null } = {}) {
  const titulo = filas.slice(0, encabezado.fila ?? 0).flat().map(textoDe).join(' ')
  const conPrecio = ROLES_CON_PRECIO.filter((r) => (encabezado.columnas ?? {})[r] !== undefined)
  const r = /certificad/i.test(titulo)
    ? { clase: CLASE_PLANILLA.CERTIFICADO, porQue: 'arriba del encabezado dice «certificado»: sus cantidades son las EJECUTADAS y su precio ya estaba acordado' }
    : !conPrecio.length
      ? { clase: CLASE_PLANILLA.COMPUTO, porQue: 'el encabezado no tiene ninguna columna de precio ni de material: mide, no cotiza' }
      : { clase: CLASE_PLANILLA.COTIZACION, porQue: `el encabezado trae ${conPrecio.join(', ')}` }
  const porNombre = clasePorNombre(nombre)
  if (!porNombre || porNombre === r.clase) return r
  return { ...r, discrepancia: `la estructura dice ${r.clase} (${r.porQue}) y el nombre «${nombre}» dice ${porNombre}: se toma la estructura, que es lo único medido, y la contradicción queda declarada` }
}

/**
 * LOS CONCEPTOS DEL CIERRE ECONÓMICO, TAL COMO LOS ESCRIBE LA PLANILLA.
 *
 * No son «impuestos»: son las líneas que convierten el costo directo en precio, y cada una tiene un
 * significado distinto para el negocio. Reconocerlas es lo que permite después contestar «¿con qué
 * beneficio se cotizó esta obra?» sin abrir el archivo.
 */
export const CONCEPTOS_DE_CIERRE = Object.freeze([
  // `sub\s?totales?` NO matcheaba «Subtotal»: el `?` cae sobre la `s` de «totale-s», así que exigía
  // el plural. La grafía más común de estas planillas es la singular, y caía como nota suelta.
  ['SUBTOTAL', /^(sub\s?total(es)?|subtotal(es)? industrial|costo directo)$/],
  ['GASTOS_GENERALES', /^(gg|gastos generales|g generales)$/],
  ['BENEFICIO', /^(beneficio|utilidad|margen)$/],
  ['COSTO_FINANCIERO', /^(costo financiero|financiamiento|financiero)$/],
  ['INGRESOS_BRUTOS', /^(iibb|ingresos brutos|i i b b)$/],
  ['GANANCIAS', /^(ganancias|imp ganancias|impuesto a las ganancias)$/],
  ['IMPUESTO_AL_CHEQUE', /^(imp cheque|impuesto al cheque|imp al cheque|ley 25413)$/],
  ['IVA', /^(iva|i v a|iva 21|iva 10 5)$/],
  ['TOTAL', /^(total|total general|precio final|precio sin iva|monto total)$/],
  ['ANTICIPO', /^(anticipo|anticipo finan|anticipo financiero)$/],
  ['PLAZO', /^(plazo|plazo de obra|plazo de ejecucion)$/],
])

/** El concepto de cierre que nombra un texto, o `null`. PURA. */
export function conceptoDeCierre(v) {
  const k = clave(v)
  if (!k) return null
  for (const [nombre, re] of CONCEPTOS_DE_CIERRE) if (re.test(k)) return nombre
  return null
}

/** Los rótulos con los que estas planillas abren una observación de alcance. PURA. */
export const ROTULOS_DE_NOTA = /^(nota\s*\d*|notas|observacion(es)?|aclaracion(es)?|condicion(es)? de pago|forma de pago|plazo de obra|validez de la oferta|validez|alcance|incluye|no incluye|excluye)\b/

/** ¿Este texto abre una nota de alcance? PURA. */
export const esRotuloDeNota = (v) => ROTULOS_DE_NOTA.test(clave(v))

/**
 * QUÉ ES CADA FILA DEL CUERPO. PURA.
 *
 * Un RUBRO y un ÍTEM se distinguen por la UNIDAD, no por el formato de la numeración: en ARCOR el
 * rubro es `1` y el ítem `1.1`, pero en las plantillas viejas el ítem se calcula con `=B9+0,01` y
 * cuando la fórmula se rompe sale `#REF!`. La unidad, en cambio, la escribe siempre una persona.
 */
export function clasificarFila(fila = [], columnas = {}) {
  const desc = textoDe(celdaDe(fila, columnas[ROL.DESCRIPCION]))
  const unidad = textoDe(celdaDe(fila, columnas[ROL.UNIDAD]))
  const cant = numeroDe(celdaDe(fila, columnas[ROL.CANTIDAD])).valor
  const hayAlgo = fila.some((c) => textoDe(c) !== '')
  if (!hayAlgo) return { tipo: TIPO_FILA.VACIA }
  if (desc && (unidad || cant !== null)) return { tipo: TIPO_FILA.ITEM }
  const cierre = fila.map(conceptoDeCierre).find(Boolean)
  if (cierre) return { tipo: TIPO_FILA.CIERRE, concepto: cierre }
  if (fila.some(esRotuloDeNota)) return { tipo: TIPO_FILA.NOTA }
  if (desc) return { tipo: TIPO_FILA.RUBRO }
  return { tipo: TIPO_FILA.NOTA }
}

/** Un ítem leído, con sus importes y con lo que NO se pudo leer dicho como tal. PURA. */
function itemDe(fila, columnas, { hoja, numero }) {
  const leer = (rol) => numeroDe(celdaDe(fila, columnas[rol]))
  const cantidad = leer(ROL.CANTIDAD)
  const unitario = leer(ROL.PRECIO_UNITARIO)
  const importe = leer(ROL.PRECIO_ITEM)
  const errores = [ROL.CANTIDAD, ROL.PRECIO_UNITARIO, ROL.PRECIO_ITEM, ROL.MATERIAL, ROL.MANO_DE_OBRA]
    .filter((r) => esErrorDeCelda(celdaDe(fila, columnas[r])))
    .map((r) => ({ rol: r, error: textoDelError(celdaDe(fila, columnas[r])) }))
  return {
    hoja, fila: numero,
    item: textoDe(celdaDe(fila, columnas[ROL.ITEM])) || null,
    descripcion: textoDe(celdaDe(fila, columnas[ROL.DESCRIPCION])),
    unidad: textoDe(celdaDe(fila, columnas[ROL.UNIDAD])) || null,
    cantidad: cantidad.valor,
    material: leer(ROL.MATERIAL).valor,
    manoDeObra: leer(ROL.MANO_DE_OBRA).valor,
    precioUnitario: unitario.valor,
    importe: importe.valor,
    errores,
    ambiguos: [['cantidad', cantidad], ['precioUnitario', unitario], ['importe', importe]]
      .filter(([, n]) => n.ambiguo).map(([campo, n]) => ({ campo, ...n.ambiguo })),
    sinCantidad: cantidad.valor === null ? cantidad.porQue : null,
    sinPrecio: unitario.valor === null && importe.valor === null ? 'ni precio unitario ni importe' : null,
  }
}

/**
 * LEER UNA PLANILLA DE COTIZACIÓN, VENGA COMO VENGA. PURA.
 *
 * `filas` es una grilla de valores —lo que devuelve `leerPlanilla` de una pestaña de Excel, o lo que
 * devuelve `leerDocx` de una tabla de Word—. Que las dos entren por acá no es una comodidad: es lo
 * que evita tener dos definiciones de «qué es un ítem de cotización» según de dónde vino.
 */
export function leerPlanillaSemantica(filas = [], { hoja = null, nombre = null, minimos = ROLES_MINIMOS } = {}) {
  const enc = detectarEncabezado(filas, { minimos })
  if (!enc.ok) return { ok: false, hoja, porQue: enc.porQue }
  const cl = clasePlanilla(filas, enc, { nombre })
  const items = []
  const rubros = []
  const cierre = []
  const notas = []
  let rubro = null
  for (let f = enc.fila + 1; f < filas.length; f++) {
    const fila = filas[f] ?? []
    const c = clasificarFila(fila, enc.columnas)
    if (c.tipo === TIPO_FILA.VACIA) continue
    if (c.tipo === TIPO_FILA.RUBRO) {
      rubro = { hoja, fila: f + 1, item: textoDe(celdaDe(fila, enc.columnas[ROL.ITEM])) || null, titulo: textoDe(celdaDe(fila, enc.columnas[ROL.DESCRIPCION])), total: numeroDe(celdaDe(fila, enc.columnas[ROL.PRECIO_RUBRO])).valor }
      rubros.push(rubro)
      continue
    }
    if (c.tipo === TIPO_FILA.ITEM) { items.push({ ...itemDe(fila, enc.columnas, { hoja, numero: f + 1 }), rubro: rubro?.titulo ?? null }); continue }
    if (c.tipo === TIPO_FILA.CIERRE) {
      const numeros = fila.map(numeroDe).filter((n) => n.valor !== null).map((n) => n.valor)
      cierre.push({ hoja, fila: f + 1, concepto: c.concepto, valores: numeros, literal: fila.map(textoDe).filter(Boolean).join(' | ').slice(0, 200) })
      continue
    }
    const literal = fila.map(textoDe).filter(Boolean).join(' ').trim()
    if (literal.length >= 12) notas.push({ hoja, fila: f + 1, texto: literal.slice(0, 400) })
  }
  return {
    ok: true, hoja, encabezado: enc, items, rubros, cierre, notas,
    clase: cl.clase, porQueClase: cl.porQue, discrepancia: cl.discrepancia ?? null,
    conError: items.filter((i) => i.errores.length).length,
    sinPrecio: items.filter((i) => i.sinPrecio).length,
    porQue: `${cl.clase} · ${enc.porQue} · ${rubros.length} rubro(s) · ${items.length} ítem(s) · ${cierre.length} línea(s) de cierre · ${notas.length} nota(s)`,
  }
}

/**
 * CUÁNTO SE PARECE UNA PESTAÑA A LA COTIZACIÓN DEL LIBRO. PURA.
 *
 * ═══ NO GANA LA QUE TIENE MÁS FILAS ═══
 *
 * Medido: en los libros internos de ECSAS la pestaña `Análisis` deja 1.327 «ítems» —es la
 * composición de precios, una fila por insumo por partida— y `Presupuesto` deja 40. Elegir por
 * cantidad de filas devuelve el análisis de precios y llama a eso «la cotización», que es un error
 * de concepto, no de conteo. Lo que distingue a la cotización es la ESTRUCTURA COMPLETA: rubros
 * agrupando ítems y un cierre económico abajo.
 */
export function puntajeDeCotizacion(r) {
  if (!r?.ok || !r.items.length) return -1
  return (r.rubros.length ? 3 : 0)
    + (r.cierre.length ? 3 : 0)
    + (r.notas.length ? 1 : 0)
    + Object.keys(r.encabezado.columnas).length
    + (r.clase === CLASE_PLANILLA.COTIZACION ? 2 : 0)
}

/** La pestaña de cotización de un libro entero. PURA. */
export function leerLibro(hojas = {}, { nombre = null } = {}) {
  const intentos = Object.entries(hojas).map(([hoja, filas]) => leerPlanillaSemantica(filas ?? [], { hoja, nombre }))
  const buenos = intentos.filter((r) => r.ok && r.items.length)
  if (!buenos.length) {
    const conEncabezado = intentos.filter((r) => r.ok)
    return {
      ok: false,
      porQue: conEncabezado.length
        ? `${conEncabezado.length} pestaña(s) tienen encabezado y ninguna fila de abajo tiene descripción con unidad o cantidad: ${conEncabezado.map((r) => `«${r.hoja}» (${r.encabezado.porQue})`).join(' · ').slice(0, 300)}`
        : `ninguna de las ${intentos.length} pestaña(s) tiene encabezado de cotización — ${intentos.map((r) => `«${r.hoja}»: ${r.porQue}`).join(' · ').slice(0, 300)}`,
      intentos,
    }
  }
  const elegida = buenos.sort((a, b) => puntajeDeCotizacion(b) - puntajeDeCotizacion(a) || b.items.length - a.items.length || String(a.hoja).localeCompare(String(b.hoja)))[0]
  return { ...elegida, otras: buenos.filter((r) => r !== elegida).map((r) => ({ hoja: r.hoja, clase: r.clase, items: r.items.length, puntaje: puntajeDeCotizacion(r) })) }
}
