// ALTA AUTOMÁTICA DE UN PROVEEDOR QUE NO ESTABA — LA IDENTIDAD ES EL CUIT, NO EL NOMBRE.
//
// ═══ POR QUÉ EXISTE (25/08/2026) ═══
//
// Cuando `matchProveedor` no engancha, la fila entra a Compras con un proveedor que el desplegable
// estricto no tiene: la celda queda fuera del vocabulario de todos los cruces y el gasto se registra
// sin dueño. El dueño lo pidió con estas palabras: *"si hay algún proveedor que no encuentra del
// listado (exactamente o con sus variantes) tiene que haber un CUIT por proveedor pero a veces puede
// variar su nombre, que lo cree y lo cargue en pestaña compras del sheet flujo de fondos y en compras
// de app.ecsas"*.
//
// LA REGLA, Y ES TODA LA REGLA: **un proveedor ES su CUIT**. Una factura trae la razón social del
// padrón y el desplegable el nombre de fantasía, y no tienen por qué parecerse —«DUBOS UGARTE PEDRO
// LUIS RAUL» es DUPEC, «PEREZ GARCIA MARISOL BIBIANA» es Corralón Progreso—. De ahí salen tres
// caminos y sólo tres:
//
//   1. EL CUIT YA SE CONOCE  → no nace ningún proveedor. El nombre que va a la celda es el CANÓNICO
//      (el que ya usa el maestro o la pestaña `Proveedores`), nunca la variante recién leída, y la
//      variante queda registrada como alias. Crear uno nuevo acá partiría en dos la cuenta corriente
//      de un proveedor vivo — es el error caro.
//   2. EL CUIT ES VÁLIDO Y NUEVO → alta: fila en `public.proveedores`, alias del nombre del papel, y
//      el nombre sumado al desplegable de la columna E.
//   3. NO HAY CUIT UTILIZABLE → no nace nada. Sin identidad no hay alta: inventar un proveedor a
//      partir de un nombre borroso es exactamente el error que este archivo evita.
//
// ═══ POR QUÉ ESTO NO CONTRADICE «`proveedor_alias` LA ESCRIBE UNA PERSONA» ═══
//
// La tabla dice que ningún emparejador automático la escribe, y sigue siendo verdad: lo prohibido es
// vincular POR PARECIDO, que es donde nacen las imputaciones inventadas. Acá no se compara ningún
// texto con ningún texto — se compara un CUIT con un CUIT, que es identidad exacta y no admite
// grados. Los alias que escribe este módulo quedan marcados con `MARCA_AUTOMATICA` en `notas` para
// que se puedan distinguir, auditar y deshacer sin tener que adivinar de dónde salieron.
//
// NÚCLEO PURO salvo la última función: entra lo que ya se leyó, sale la decisión. Es lo que permite
// probar los cinco modos de falla sin Google, sin Postgres y sin escribir una celda.

import {
  cuitDigitoVerificadorOk,
  cuitTieneForma,
  normalizarCuit,
  normalizarNombreProveedor,
} from './proveedor-identidad.mjs'

/** Qué le pasó a un proveedor que el desplegable no tenía. */
export const CAMINO = Object.freeze({
  /** El CUIT ya está en el maestro: se imputa al que estaba y se registra la variante. */
  EXISTENTE: 'existente',
  /** CUIT válido que no conocía nadie: nace el proveedor. */
  ALTA: 'alta',
  /** Sin CUIT utilizable no hay alta posible. Queda como estaba y se declara. */
  SIN_IDENTIDAD: 'sin_identidad',
  /** El CUIT alcanza pero el nombre choca con otro proveedor: lo resuelve una persona. */
  CONFLICTO: 'conflicto',
})

/** Prefijo estable de `proveedor_alias.notas` para todo lo que escribió este módulo. */
export const MARCA_AUTOMATICA = 'alta automática por CUIT'

/** Tope de valores de un desplegable ONE_OF_LIST embebido. Por encima, Sheets deja de dibujarlo. */
export const MAX_OPCIONES_DESPLEGABLE = 500

const mapaGet = (m, k) => (m instanceof Map ? m.get(k) : m?.[k])

/** Un CUIT que sirve para identificar: once dígitos y con el DV que declara ARCA. */
function cuitUtilizable(cuit) {
  return cuitTieneForma(cuit) && cuitDigitoVerificadorOk(cuit)
}

const aliasDe = (nombre, alias = []) =>
  alias.find((x) => normalizarNombreProveedor(x?.nombre_norm) === normalizarNombreProveedor(nombre)) ?? null

/** «Esto no es un proveedor», ya decidido por una persona. */
function marcadoNoEsProveedor(nombre, alias) {
  return aliasDe(nombre, alias)?.estado === 'no_es_proveedor'
}

/** El proveedor al que una PERSONA ya mandó este texto, si lo hizo y si el proveedor sigue vivo. */
function proveedorDelAlias(nombreLeido, alias = [], proveedores = []) {
  const a = aliasDe(nombreLeido, alias)
  if (!a || a.estado !== 'vinculado' || !a.proveedor_id) return null
  return proveedores.find((p) => p?.id === a.proveedor_id) ?? null
}

/**
 * QUÉ HACER CON UN PROVEEDOR QUE NO MATCHEÓ. Una decisión por comprobante, pura y determinística:
 * dos comprobantes del mismo CUIT reciben exactamente la misma, y por eso el lote se deduplica solo.
 *
 * @param {{nombre?:string, cuit?:string}} leido        lo que dijo el papel
 * @param {{porCuit?:Map|object, proveedores?:Array, alias?:Array}} conocidos
 *   `porCuit`      CUIT → nombre canónico de la pestaña `Proveedores` del Sheet
 *   `proveedores`  el maestro de Postgres: [{ id, nombre, cuit }]
 *   `alias`        lo ya resuelto: [{ nombre_norm, proveedor_id, estado }]
 * @returns {{camino:string, motivo:string, cuit:string|null, nombreCanonico:string|null,
 *            proveedorId:string|null, nombreLeido:string, aliasNuevo:boolean}}
 */
export function resolverNoMatcheado(leido = {}, conocidos = {}) {
  const nombreLeido = String(leido.nombre ?? '').trim()
  const cuit = normalizarCuit(leido.cuit)
  const base = { cuit: cuit || null, nombreCanonico: null, proveedorId: null, nombreLeido, aliasNuevo: false }
  const sin = (motivo) => ({ ...base, camino: CAMINO.SIN_IDENTIDAD, motivo })

  if (!normalizarNombreProveedor(nombreLeido)) return sin('sin_nombre')

  const { proveedores = [], alias = [] } = conocidos
  const enMaestro = cuitUtilizable(cuit) ? proveedores.find((p) => normalizarCuit(p?.cuit) === cuit) ?? null : null

  const yaDecidido = enMaestro ? null : loQueAlguienYaDecidio({ nombreLeido, cuit, base }, conocidos)
  if (yaDecidido) return yaDecidido

  if (!cuit) return sin('sin_cuit')
  if (!cuitTieneForma(cuit)) return sin('cuit_ilegible')
  // EL DÍGITO VERIFICADOR SÍ FRENA ACÁ, Y EN LA PANTALLA NO. En el alta manual hay una persona que
  // ve la advertencia y decide; en ésta no hay nadie mirando, y un CUIT con DV inválido leído de una
  // foto es casi siempre un dígito que el OCR se comió. Darlo de alta crearía un proveedor duplicado
  // con un CUIT distinto — el único duplicado que el índice único NO puede ver.
  if (!cuitDigitoVerificadorOk(cuit)) return sin('cuit_dv')

  const delSheet = mapaGet(conocidos.porCuit, cuit) ?? null
  // El maestro manda sobre el Sheet: es la fuente de `app.ecsas` y la que tiene el id con el que se
  // cuelga el alias. El Sheet sólo aporta el nombre cuando el maestro todavía no lo tiene.
  const nombreCanonico = String(enMaestro?.nombre ?? delSheet ?? nombreLeido).trim()
  const norm = normalizarNombreProveedor(nombreCanonico)

  const choqueNombre = proveedores.find(
    (p) => normalizarNombreProveedor(p?.nombre) === norm && (!enMaestro || p?.id !== enMaestro.id),
  )
  const aliasNuevo = conflictoDeAlias(nombreLeido, nombreCanonico, enMaestro?.id ?? null, alias) === null
    && normalizarNombreProveedor(nombreLeido) !== norm

  if (enMaestro) {
    return { ...base, camino: CAMINO.EXISTENTE, motivo: 'cuit_en_maestro', nombreCanonico, proveedorId: enMaestro.id, aliasNuevo }
  }
  // El nombre canónico ya es de OTRO CUIT (o de un proveedor sin CUIT cargado). Dar el alta acá
  // reventaría contra `proveedores_nombre_unico`, y pisarle el CUIT al que estaba sería decidir sobre
  // una identidad ajena a partir de un OCR. Se declara y lo resuelve una persona.
  if (choqueNombre) {
    return { ...base, camino: CAMINO.CONFLICTO, motivo: 'nombre_ocupado', nombreCanonico, proveedorId: null, aliasNuevo: false }
  }
  return { ...base, camino: CAMINO.ALTA, motivo: delSheet ? 'cuit_en_sheet' : 'cuit_nuevo', nombreCanonico, aliasNuevo }
}

/**
 * ═══ ANTES DEL ALTA SE AGOTA LO QUE YA EXISTE ═══
 *
 * Si una PERSONA ya escribió que este texto es tal proveedor (`proveedor_alias`), esa decisión vale
 * más que cualquier alta automática y no se recalcula. Se mira incluso cuando el CUIT no se pudo
 * leer: es la única vía por la que un papel con el CUIT ilegible se imputa bien igual.
 *
 * Devuelve la resolución cerrada, o null si nadie decidió nada sobre este texto.
 */
function loQueAlguienYaDecidio({ nombreLeido, cuit, base }, { alias = [], proveedores = [] } = {}) {
  // «SUELDOS», «ARCA», «BANCO»: alguien ya dijo que no son proveedores. Es una decisión tomada, no
  // una ausencia de dato, y ningún alta automática la puede revertir.
  if (marcadoNoEsProveedor(nombreLeido, alias)) {
    return { ...base, camino: CAMINO.SIN_IDENTIDAD, motivo: 'marcado_no_es_proveedor' }
  }
  const p = proveedorDelAlias(nombreLeido, alias, proveedores)
  if (!p) return null
  // El papel trae un CUIT válido que pertenece a OTRO. La firma de la persona y el padrón se
  // contradicen: no se elige entre las dos, se declara.
  if (cuitUtilizable(cuit) && normalizarCuit(p.cuit) && normalizarCuit(p.cuit) !== cuit) {
    return { ...base, camino: CAMINO.CONFLICTO, motivo: 'alias_contradice_cuit', nombreCanonico: String(p.nombre).trim(), proveedorId: p.id }
  }
  return { ...base, camino: CAMINO.EXISTENTE, motivo: 'alias_manual', nombreCanonico: String(p.nombre).trim(), proveedorId: p.id }
}

/**
 * ¿Este texto ya está resuelto hacia OTRO proveedor? Devuelve el alias que estorba, o null.
 *
 * Un alias no puede pisar a otro: el índice único de `nombre_norm` lo impediría igual, pero el
 * mensaje sería un `23505` que no dice nada. Y si el alias existente apunta al MISMO proveedor, no
 * hay conflicto ni hay nada que escribir.
 */
export function conflictoDeAlias(nombreLeido, nombreCanonico, proveedorId, alias = []) {
  const norm = normalizarNombreProveedor(nombreLeido)
  if (!norm || norm === normalizarNombreProveedor(nombreCanonico)) return null
  const previo = aliasDe(nombreLeido, alias)
  if (!previo) return null
  if (previo.estado === 'vinculado' && proveedorId && previo.proveedor_id === proveedorId) return null
  return previo
}

/**
 * ¿QUIÉN OCUPA YA ESTA IDENTIDAD? Una sola definición para las dos caras.
 *
 * La usa el alta automática de acá y el formulario de `app.ecsas`
 * (`administracion/services/proveedoresActions.ts`). Escrita dos veces serían dos respuestas
 * posibles a «¿este proveedor ya está?», que es justo el duplicado que se quiere evitar.
 *
 * @param {Array<{id?:string, nombre?:string, cuit?:string|null}>} proveedores
 * @param {{nombre?:string, cuit?:string|null, excluirId?:string|null}} identidad
 * @returns {{por:'cuit'|'nombre', proveedor:{id?:string, nombre?:string, cuit?:string|null}}|null}
 */
export function identidadOcupadaPor(proveedores = [], identidad = {}) {
  const { nombre = '', cuit = null, excluirId = null } = identidad
  const c = normalizarCuit(cuit)
  const otros = proveedores.filter((p) => !excluirId || p?.id !== excluirId)
  if (c) {
    const porCuit = otros.find((p) => normalizarCuit(p?.cuit) === c)
    if (porCuit) return { por: 'cuit', proveedor: porCuit }
  }
  const norm = normalizarNombreProveedor(nombre)
  // El nombre se compara NORMALIZADO, que es como lo compara el índice único de la base: comparando
  // el texto crudo, «Alumetal» y «ALUMETAL» pasarían el control y reventarían contra Postgres.
  const porNombre = norm ? otros.find((p) => normalizarNombreProveedor(p?.nombre) === norm) : null
  return porNombre ? { por: 'nombre', proveedor: porNombre } : null
}

/**
 * LAS RESOLUCIONES DEL LOTE → EL PLAN, DEDUPLICADO.
 *
 * Dos comprobantes del mismo proveedor nuevo dan de alta UNA vez: la clave es el CUIT, no el nombre,
 * así que dos grafías distintas del mismo CUIT siguen siendo un alta sola con dos alias.
 *
 * Y un mismo texto que en la misma tanda apunta a dos CUIT distintos no se vincula a ninguno: un
 * nombre no puede ser dos proveedores, y elegir uno sería acertar la mitad de las veces sin decirlo.
 *
 * @param {Array<ReturnType<typeof resolverNoMatcheado>>} resoluciones
 * @returns {{altas:Array, existentes:Array, alias:Array, sinIdentidad:Array, conflictos:Array, nombres:string[]}}
 */
export function planDeAltas(resoluciones = []) {
  const altas = new Map(); const existentes = new Map()
  const alias = new Map(); const ambiguos = new Set()
  const sinIdentidad = new Map(); const conflictos = new Map()

  for (const r of resoluciones) {
    if (r?.camino === CAMINO.SIN_IDENTIDAD) { juntar(sinIdentidad, r.nombreLeido, r); continue }
    if (r?.camino === CAMINO.CONFLICTO) { juntar(conflictos, `${r.cuit}·${r.nombreCanonico}`, r); continue }
    if (r?.camino === CAMINO.ALTA) juntar(altas, r.cuit, { cuit: r.cuit, nombre: r.nombreCanonico, motivo: r.motivo })
    else if (r?.camino === CAMINO.EXISTENTE) juntar(existentes, r.cuit, { cuit: r.cuit, nombre: r.nombreCanonico, proveedorId: r.proveedorId })
    if (!r?.aliasNuevo) continue
    const clave = normalizarNombreProveedor(r.nombreLeido)
    const previo = alias.get(clave)
    if (previo && previo.cuit !== r.cuit) { ambiguos.add(clave); continue }
    alias.set(clave, { nombre_norm: clave, nombre_origen: r.nombreLeido, cuit: r.cuit, proveedorId: r.proveedorId ?? null })
  }
  for (const clave of ambiguos) alias.delete(clave)
  return {
    altas: [...altas.values()],
    existentes: [...existentes.values()],
    alias: [...alias.values()],
    sinIdentidad: [...sinIdentidad.values()],
    conflictos: [...conflictos.values()],
    ambiguos: [...ambiguos],
    // Los nombres que la columna E va a necesitar. El de un proveedor que ya existía va igual: si
    // llegó hasta acá es porque el desplegable NO lo tenía, y sin él la celda queda en rojo.
    nombres: [...new Set([...altas.values(), ...existentes.values()].map((x) => x.nombre))],
  }
}

function juntar(mapa, clave, valor) {
  if (clave != null && !mapa.has(clave)) mapa.set(clave, valor)
}

// ═══ EL DESPLEGABLE DE LA COLUMNA E ES LA OPERACIÓN DELICADA ═══
//
// No es un rango: son 138 valores EMBEBIDOS en la regla de validación, así que sumar uno obliga a
// reescribir la lista ENTERA sobre toda la columna. Si se arma mal, se rompe el desplegable de una
// pestaña que el dueño usa todos los días, y no lo grita: las celdas viejas siguen mostrando su
// texto y sólo la próxima edición descubre que el valor ya no está permitido.
//
// Por eso esto es una función pura con guardas que FALLAN FUERTE, y no un `[...lista, ...nuevos]` en
// el medio de un `main()`: perder un valor es peor que no agregar ninguno.

/**
 * La lista final del desplegable: los que ya estaban, EN SU ORDEN, más los que faltaban.
 *
 * @param {string[]} lista    los valores vivos leídos del Sheet
 * @param {string[]} nombres  los que hay que asegurar
 * @returns {{lista:string[], agregados:string[]}}
 * @throws si la lista viva viene vacía, si un valor no es texto usable, o si el resultado no
 *         contiene a todos los originales — los tres son «no escribas nada».
 */
export function ampliarDesplegable(lista = [], nombres = []) {
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new Error('no se leyó el desplegable vivo de Compras!E — sin la lista completa no se reescribe la validación')
  }
  const final = lista.map(limpio)
  const vistos = new Set(final.map((v) => normalizarNombreProveedor(v)))
  const agregados = []
  for (const n of nombres) {
    const v = limpio(n)
    const k = normalizarNombreProveedor(v)
    if (!k || vistos.has(k)) continue
    vistos.add(k); final.push(v); agregados.push(v)
  }
  if (final.length > MAX_OPCIONES_DESPLEGABLE) {
    throw new Error(`el desplegable quedaría con ${final.length} valores (tope ${MAX_OPCIONES_DESPLEGABLE})`)
  }
  // LA GUARDA QUE IMPORTA: ninguno de los que estaban se puede haber caído. Se comprueba sobre el
  // resultado, no sobre el razonamiento que lo produjo.
  for (const v of lista) {
    if (!final.includes(limpio(v))) throw new Error(`la lista nueva perdió "${v}" — no se toca la validación`)
  }
  return { lista: final, agregados }
}

/** Un valor del desplegable: texto de una sola línea y no vacío. Un salto de línea rompe la regla. */
function limpio(v) {
  const s = String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) throw new Error('un valor del desplegable quedó vacío')
  return s
}

/**
 * El pedido `setDataValidation` de la columna E, ya armado. Separado de la red para poder probar el
 * rango y la regla sin tocar el Sheet.
 *
 * @param {{sheetId:number, lista:string[], filas:number, columna:number, desdeFila:number}} o
 *   `filas` = cuántas filas cubre la validación (el alto de la grilla); `desdeFila` es 1-based.
 */
export function requestValidacionProveedores({ sheetId, lista = [], filas = 0, columna = 4, desdeFila = 4 } = {}) {
  if (!Number.isInteger(sheetId)) throw new Error('falta el sheetId de Compras')
  if (!lista.length) throw new Error('lista vacía: eso borraría el desplegable de la columna E')
  const hasta = Math.max(filas, desdeFila)
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: desdeFila - 1, endRowIndex: hasta, startColumnIndex: columna, endColumnIndex: columna + 1 },
      rule: {
        condition: { type: 'ONE_OF_LIST', values: lista.map((v) => ({ userEnteredValue: limpio(v) })) },
        strict: true,
        showCustomUi: true,
      },
    },
  }
}

// ═══ LA ESCRITURA EN POSTGRES — LA ÚNICA PARTE QUE NO ES PURA ═══
//
// EL DUPLICADO LO IMPIDE LA BASE, NO ESTE CÓDIGO. `on conflict do nothing` sin columna objetivo
// cubre los DOS índices únicos de la tabla (`proveedores_cuit_unico` y `proveedores_nombre_unico`):
// si otro proceso ganó la carrera, el insert no devuelve fila y se relee por CUIT. Nombrar el
// conflicto (`on conflict (cuit)`) dejaría escapar el choque por nombre como una excepción cruda.

/**
 * Aplica el plan. `query` se inyecta para poder correrlo dentro de una transacción de prueba.
 *
 * @param {ReturnType<typeof planDeAltas>} plan
 * @param {{query:Function, comprobante?:string}} o
 * @returns {Promise<{creados:Array, yaEstaban:Array, alias:Array, rechazos:Array}>}
 */
export async function aplicarAltas(plan, { query, comprobante = null } = {}) {
  if (typeof query !== 'function') throw new Error('aplicarAltas necesita un `query`')
  const out = { creados: [], yaEstaban: [], alias: [], rechazos: [] }
  const porCuit = new Map()
  for (const e of plan?.existentes ?? []) if (e.proveedorId) porCuit.set(e.cuit, e.proveedorId)

  for (const a of plan?.altas ?? []) {
    const r = await insertarProveedor(query, a)
    if (r.id) porCuit.set(a.cuit, r.id)
    if (r.creado) out.creados.push({ ...a, id: r.id })
    else if (r.id) out.yaEstaban.push({ ...a, id: r.id })
    else out.rechazos.push({ ...a, motivo: 'nombre_ocupado_en_la_base' })
  }
  for (const al of plan?.alias ?? []) {
    const proveedorId = al.proveedorId ?? porCuit.get(al.cuit) ?? null
    if (!proveedorId) { out.rechazos.push({ ...al, motivo: 'sin_proveedor_al_que_colgarlo' }); continue }
    const notas = `${MARCA_AUTOMATICA} ${al.cuit}${comprobante ? ` · ${comprobante}` : ''}`
    // `on conflict do nothing` sobre `proveedor_alias_nombre_unico`: si alguien ya resolvió ese
    // texto —a mano o en otra corrida— su decisión manda y acá no pasa nada.
    const { rows } = await query(
      `insert into public.proveedor_alias (nombre_norm, nombre_origen, proveedor_id, estado, notas)
       values ($1, $2, $3, 'vinculado', $4)
       on conflict do nothing returning id`,
      [al.nombre_norm, al.nombre_origen, proveedorId, notas],
    )
    if (rows?.[0]?.id) out.alias.push({ ...al, id: rows[0].id, proveedorId })
    else out.rechazos.push({ ...al, motivo: 'el_nombre_ya_estaba_resuelto' })
  }
  return out
}

async function insertarProveedor(query, { nombre, cuit }) {
  const { rows } = await query(
    `insert into public.proveedores (nombre, cuit) values ($1, $2)
     on conflict do nothing returning id`,
    [nombre, cuit],
  )
  if (rows?.[0]?.id) return { id: rows[0].id, creado: true }
  // No devolvió fila: o el CUIT ya estaba (carrera) o el NOMBRE choca con otro proveedor. Se
  // distingue releyendo por CUIT, que es la identidad; el choque por nombre queda como rechazo.
  const previo = await query('select id from public.proveedores where cuit = $1', [cuit])
  return { id: previo.rows?.[0]?.id ?? null, creado: false }
}
