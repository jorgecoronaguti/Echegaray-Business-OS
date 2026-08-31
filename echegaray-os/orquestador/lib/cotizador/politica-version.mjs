// LA POLÍTICA COMERCIAL VERSIONADA — la cotización REFERENCIA una versión, no copia sus números.
//
// ═══ QUÉ CAMBIA RESPECTO DE LO QUE HAY ═══
//
// `parametro_comercial` ya versiona los ocho porcentajes, pero `cotizaciones` los COPIA a ocho
// columnas propias. La copia resuelve bien un problema real —una obra negocia distinto sin obligar a
// crear una versión de la política— y crea otro: ocho números sueltos en una fila no dicen QUÉ se
// negoció ni QUIÉN lo autorizó. Con 64 cotizaciones históricas medidas, los porcentajes difieren
// entre obras y no hay una sola línea que explique por qué.
//
// Acá la cotización guarda DOS COSAS: la REFERENCIA a la versión de política, y la lista de
// OVERRIDES con autor, motivo y evidencia. El resultado numérico es idéntico al de copiar —los
// mismos ocho porcentajes— y además contesta «¿de dónde salió este 19 %?».
//
// La inmutabilidad no la garantiza este archivo: la garantiza que una versión PUBLICADA no se pueda
// UPDATE-ar en la base. Acá se garantiza lo otro: que publicar una versión nueva no toque a las
// cotizaciones que referencian la anterior.
//
// ═══ SEIS CONCEPTOS, NO OCHO PORCENTAJES ═══
//
// BENEFICIO · RIESGO · CONTINGENCIA · FINANCIACIÓN · IMPUESTOS · OTROS. Los ocho porcentajes del
// libro se reparten entre cuatro de esos seis. RIESGO y CONTINGENCIA **no tienen escalón en la
// cascada del libro**: eso no es un olvido de este archivo, es un hallazgo sobre cómo cotiza la
// empresa — hoy están implícitos adentro del 22 % de beneficio y nadie puede decir cuánto de ese 22
// es ganancia y cuánto es colchón. Se declaran en `null` (que NO es cero) y, si alguien les pone un
// valor, `proyectarACascada` se NIEGA a calcular en vez de tirarlos a la basura en silencio.
//
// ═══ MARGEN NO ES MARKUP, Y ACÁ SON DOS FUNCIONES ═══
//
//     markup sobre costo:   precio = costo × (1 + m)
//     margen sobre venta:   precio = costo ÷ (1 − m)
//
// Con el mismo 30 % la primera da 130 y la segunda 142,86. Quien aplica «30 %» sobre el costo
// creyendo que gana 30 % gana 23,08 %. Es el error más caro de una presupuestación y por eso las dos
// fórmulas tienen nombres distintos, resultados distintos y un test que prueba que el motor no las
// intercambia.

import { ESTADO, TIPO_ISSUE, SEVERIDAD, issue, PERMISO } from './contrato.mjs'
import { PARAMETROS, esNormativo, politicaComercial } from './comercial.mjs'

const redondear = (n, d = 6) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 10 ** d) / 10 ** d)
const hayNumero = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))

/** Los seis conceptos en los que se separa la política. Que `IMPUESTOS` sea uno solo y tenga cuatro
 *  claves adentro es a propósito: son todos plata de terceros y se discuten juntos. */
export const CONCEPTO = Object.freeze({
  BENEFICIO: 'BENEFICIO', RIESGO: 'RIESGO', CONTINGENCIA: 'CONTINGENCIA',
  FINANCIACION: 'FINANCIACION', IMPUESTOS: 'IMPUESTOS', OTROS: 'OTROS',
})

/** A qué concepto pertenece cada clave. `pctGastosGenerales` NO está: el indirecto no es política
 *  comercial, se CALCULA en `indirectos.mjs` y entra a la cascada como resultado, no como decisión. */
export const CONCEPTO_DE_CLAVE = Object.freeze({
  pctBeneficio: CONCEPTO.BENEFICIO,
  pctRiesgo: CONCEPTO.RIESGO,
  pctContingencia: CONCEPTO.CONTINGENCIA,
  pctFinanciero: CONCEPTO.FINANCIACION,
  factorFinanciero: CONCEPTO.FINANCIACION,
  pctIibb: CONCEPTO.IMPUESTOS,
  pctGanancias: CONCEPTO.IMPUESTOS,
  pctCheque: CONCEPTO.IMPUESTOS,
  pctIva: CONCEPTO.IMPUESTOS,
  margenObjetivoPct: CONCEPTO.OTROS,
})

/** Las claves que la cascada del libro sabe ejecutar. Las otras existen en la política y todavía no
 *  tienen escalón: la lista es la frontera entre lo que se decide y lo que se puede calcular. */
export const CLAVES_DE_CASCADA = Object.freeze([...PARAMETROS])
export const SIN_ESCALON = Object.freeze(['pctRiesgo', 'pctContingencia'])

export const ESTADO_VERSION = Object.freeze({ BORRADOR: 'BORRADOR', PUBLICADA: 'PUBLICADA', REEMPLAZADA: 'REEMPLAZADA' })

/**
 * UN COMPONENTE DE LA POLÍTICA. PURA, congelada.
 *
 * `valor` puede ser `null` y eso NO es cero: es «la empresa no decidió este número». `conflicto`
 * lleva el texto cuando dos fuentes dicen cosas distintas y ninguna gana — el caso real es
 * `margenObjetivoPct`, que vale 17 en el código productivo y 12 en el handoff de diseño.
 */
export function componenteDePolitica({ clave, valor = null, fuente, estado = null, conflicto = null, notas = null } = {}) {
  const concepto = CONCEPTO_DE_CLAVE[clave]
  if (!concepto) throw new Error(`«${clave}» no es una clave de la política comercial. Las claves son ${Object.keys(CONCEPTO_DE_CLAVE).join(', ')}`)
  if (!fuente) throw new Error(`el componente «${clave}» no declara fuente: un porcentaje con el que cotiza la empresa sin origen no se puede defender`)
  if (valor !== null && valor !== undefined && (!Number.isFinite(Number(valor)) || Number(valor) < 0)) {
    throw new Error(`«${valor}» no es un valor válido para ${clave}`)
  }
  const hay = hayNumero(valor)
  const est = estado ?? (conflicto ? ESTADO.CONFLICTO : (hay ? ESTADO.CONFIRMADO : ESTADO.FALTA_DATO))
  if (conflicto && est !== ESTADO.CONFLICTO) throw new Error(`«${clave}» declara un conflicto y un estado ${est}: un conflicto no se resuelve cambiándole el rótulo`)
  return Object.freeze({
    clave, concepto, valor: hay ? Number(valor) : null,
    normativo: esNormativo(clave), fuente: String(fuente), estado: est, conflicto, notas,
  })
}

/**
 * UNA VERSIÓN DE LA POLÍTICA COMERCIAL. PURA, congelada.
 *
 * PUBLICADA exige quién la publicó: es la decisión de la que cuelgan todas las ofertas de la empresa
 * y el contrato ya dice que `set_global_policy` pide `GLOBAL_POLICY_WRITE`. Una versión sin firma se
 * queda en BORRADOR y no la puede referenciar ninguna cotización.
 */
export function versionDePolitica({
  version, componentes = [], fuente, estado = ESTADO_VERSION.BORRADOR,
  vigenciaDesde = null, publicadaPor = null, notas = null,
} = {}) {
  if (!Number.isInteger(Number(version)) || Number(version) < 1) throw new Error(`«${version}» no es un número de versión de política`)
  if (!fuente) throw new Error('una versión de política sin fuente no se puede defender ni auditar')
  if (!Object.values(ESTADO_VERSION).includes(estado)) throw new Error(`estado de versión desconocido: ${estado}`)
  if (estado === ESTADO_VERSION.PUBLICADA && !publicadaPor) {
    throw new Error('una política PUBLICADA sin quién la publicó no se puede oponer a nadie: publicar exige GLOBAL_POLICY_WRITE y ese permiso lo ejerce una persona')
  }
  const claves = componentes.map((c) => c.clave)
  const dup = claves.filter((c, i, a) => a.indexOf(c) !== i)
  if (dup.length) throw new Error(`la versión ${version} define dos veces ${[...new Set(dup)].join(', ')}: dos valores del mismo porcentaje no dicen cuál se usó`)
  const porClave = Object.fromEntries(componentes.map((c) => [c.clave, c]))
  return Object.freeze({
    version: Number(version), estado, fuente: String(fuente), vigenciaDesde, publicadaPor, notas,
    componentes: Object.freeze([...componentes]),
    porClave: Object.freeze(porClave),
    /** Los seis conceptos con sus claves adentro. Es la vista que pide §11: se discute por concepto,
     *  no por una lista plana de porcentajes. */
    porConcepto: Object.freeze(Object.fromEntries(Object.values(CONCEPTO).map((k) =>
      [k, Object.freeze(componentes.filter((c) => c.concepto === k))]))),
  })
}

/**
 * LA REFERENCIA DE UNA COTIZACIÓN A UNA VERSIÓN DE POLÍTICA. PURA.
 *
 * Guarda el NÚMERO DE VERSIÓN, no «la vigente». Es toda la diferencia: una oferta de agosto se
 * defiende con la política de agosto, y si la referencia fuera «la vigente», publicar una política
 * nueva reescribiría el precio de cada oferta ya emitida.
 */
export function referenciaDePolitica({ cotizacionId, version, congeladaEn = null } = {}) {
  if (!cotizacionId) throw new Error('una referencia de política sin cotización no apunta a nada')
  if (!Number.isInteger(Number(version)) || Number(version) < 1) throw new Error(`«${version}» no es un número de versión de política`)
  return Object.freeze({ cotizacionId, version: Number(version), congeladaEn })
}

/**
 * RESOLVER UNA REFERENCIA CONTRA EL CATÁLOGO DE VERSIONES. PURA.
 *
 * Busca POR NÚMERO. Nunca por `vigente`: ese atajo es exactamente el que haría que una cotización
 * congelada cambiara de precio cuando la empresa cambia su política.
 */
export function resolverReferencia(ref, catalogo = []) {
  const v = catalogo.find((x) => x.version === ref?.version) ?? null
  if (!v) return { ok: false, version: null, porQue: `la cotización referencia la política v${ref?.version} y esa versión no está en el catálogo: el precio NO se recalcula contra otra` }
  if (v.estado === ESTADO_VERSION.BORRADOR) {
    return { ok: false, version: null, porQue: `la política v${ref.version} está en BORRADOR: una cotización no se puede apoyar en una política que nadie publicó` }
  }
  return { ok: true, version: v, porQue: null }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LOS OVERRIDES POR COTIZACIÓN — autorización y auditoría, o no aplican
// ══════════════════════════════════════════════════════════════════════════════════════════════

export const CAMPOS_OVERRIDE = Object.freeze(['autorizadoPor', 'motivo', 'evidencia', 'fecha'])

/**
 * UN OVERRIDE DE ESTA COTIZACIÓN SOBRE LA POLÍTICA REFERENCIADA. PURA.
 *
 * Devuelve `{ ok, override, faltan, porQue }` — no tira — porque un override incompleto es un caso
 * corriente y el motor tiene que poder descartarlo diciendo qué le falta.
 */
export function overrideDeCotizacion({ clave, valor, autorizadoPor = null, motivo = null, evidencia = null, fecha = null } = {}) {
  const no = (porQue, faltan = []) => ({ ok: false, override: null, faltan, porQue })
  if (!CONCEPTO_DE_CLAVE[clave]) return no(`«${clave}» no es una clave de la política comercial`, ['clave'])
  if (esNormativo(clave)) return no(`el ${clave} es NORMATIVO: no se negocia por cotización. Si cambió la alícuota, cambia la política de la empresa`, [])
  if (!hayNumero(valor) || Number(valor) < 0) return no(`«${valor}» no es un valor válido para ${clave}`, ['valor'])
  const traido = { autorizadoPor, motivo, evidencia, fecha }
  const faltan = CAMPOS_OVERRIDE.filter((k) => !traido[k])
  if (faltan.length) return no(`el override de ${clave} no trae ${faltan.join(', ')}: sin autorización y auditoría NO se aplica`, faltan)
  return {
    ok: true, faltan: [], porQue: null,
    override: Object.freeze({
      clave, concepto: CONCEPTO_DE_CLAVE[clave], valor: Number(valor),
      autorizadoPor: String(autorizadoPor), motivo: String(motivo), evidencia: String(evidencia),
      fecha: String(fecha).slice(0, 10), permisoExigido: PERMISO.COMMERCIAL_WRITE,
    }),
  }
}

/**
 * LA POLÍTICA EFECTIVA DE UNA COTIZACIÓN: la versión referenciada + sus overrides. PURA.
 *
 * `aplicados` y `rechazados` salen los dos. Un override rechazado por falta de autorización no
 * desaparece: queda a la vista con lo que le faltaba, porque «se intentó y no se pudo» y «nunca se
 * intentó» dicen cosas distintas sobre cómo se armó el precio.
 */
export function politicaEfectiva({ version, overrides = [] } = {}) {
  if (!version) throw new Error('no hay versión de política referenciada: una cotización sin política no tiene precio')
  const aplicados = []
  const rechazados = []
  const valores = Object.fromEntries(version.componentes.map((c) => [c.clave, c.valor]))
  for (const o of overrides) {
    if (!o?.ok) { rechazados.push({ intento: o ?? null, porQue: o?.porQue ?? 'override sin forma' }); continue }
    aplicados.push({ ...o.override, valorAnterior: valores[o.override.clave] ?? null })
    valores[o.override.clave] = o.override.valor
  }
  return Object.freeze({
    versionReferenciada: version.version,
    fuenteDeLaVersion: version.fuente,
    valores: Object.freeze(valores),
    aplicados: Object.freeze(aplicados),
    rechazados: Object.freeze(rechazados),
    issues: Object.freeze(rechazados.map((r) => issue({
      type: TIPO_ISSUE.COMMERCIAL_DECISION, severity: SEVERIDAD.ALTA,
      entity: `override · ${r.intento?.override?.clave ?? 'política comercial'}`,
      detalle: r.porQue, recommended_action: 'commercial_override',
    }))),
  })
}

/**
 * PROYECTAR UNA POLÍTICA EFECTIVA SOBRE LA CASCADA DEL LIBRO. PURA.
 *
 * `pctGastosGenerales` entra por afuera **a propósito**: es el INDIRECTO APLICADO que calcula
 * `indirectos.mjs`, no una decisión comercial. Que sea un argumento y no un campo de la política es
 * lo que impide que alguien lo tipee acá y se pierda la estructura que lo explica.
 *
 * Se NIEGA a proyectar cuando la versión declara riesgo o contingencia: la cascada del libro no
 * tiene un escalón para ellos y meterlos adentro del beneficio confundiría dos conceptos que §11
 * manda separar. Devuelve el motivo y la lista, no un precio con un colchón desaparecido.
 */
export function proyectarACascada({ efectiva, pctGastosGenerales } = {}) {
  if (!efectiva) throw new Error('no hay política efectiva que proyectar')
  const v = efectiva.valores
  const declaradosSinEscalon = SIN_ESCALON.filter((k) => hayNumero(v[k]) && Number(v[k]) > 0)
  const faltan = CLAVES_DE_CASCADA.filter((k) => k !== 'pctGastosGenerales' && !hayNumero(v[k]))
  const no = (porQue, extra) => Object.freeze({ politica: null, estado: ESTADO.CONFLICTO, porQue, sinRepresentar: Object.freeze(declaradosSinEscalon), faltan: Object.freeze(faltan), ...extra })
  if (declaradosSinEscalon.length) {
    return no(`la política declara ${declaradosSinEscalon.join(' y ')} y la cascada del libro no tiene un escalón para ellos. NO se calcula el precio: sumarlos al beneficio confundiría el colchón con la ganancia, y descartarlos publicaría un precio sin el riesgo que la empresa decidió cobrar`)
  }
  if (faltan.length) {
    return Object.freeze({ politica: null, estado: ESTADO.FALTA_DATO, sinRepresentar: Object.freeze([]), faltan: Object.freeze(faltan), porQue: `la política referenciada no define ${faltan.join(', ')}: sin esos porcentajes no hay precio, y NO valen cero` })
  }
  if (!hayNumero(pctGastosGenerales)) {
    return Object.freeze({ politica: null, estado: ESTADO.FALTA_DATO, sinRepresentar: Object.freeze([]), faltan: Object.freeze(['pctGastosGenerales']), porQue: 'el indirecto aplicado no se pudo afirmar: sin estructura de indirectos el precio NO se calcula, y el indirecto NO es cero' })
  }
  return Object.freeze({
    estado: ESTADO.CALCULADO, porQue: null, sinRepresentar: Object.freeze([]), faltan: Object.freeze([]),
    politica: politicaComercial({
      version: efectiva.versionReferenciada, origen: 'QUOTE',
      fuente: `política v${efectiva.versionReferenciada} (${efectiva.fuenteDeLaVersion})${efectiva.aplicados.length ? ` + ${efectiva.aplicados.length} override(s) de esta cotización` : ''}`,
      pctGastosGenerales: Number(pctGastosGenerales),
      pctBeneficio: v.pctBeneficio, pctFinanciero: v.pctFinanciero, factorFinanciero: v.factorFinanciero,
      pctIibb: v.pctIibb, pctGanancias: v.pctGanancias, pctCheque: v.pctCheque, pctIva: v.pctIva,
    }),
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// MARGEN SOBRE VENTA ≠ MARKUP SOBRE COSTO
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** `precio = costo × (1 + m)`. Es lo que hace el libro con el 22 % de beneficio. PURA. */
export function precioDesdeMarkup({ costo, markup } = {}) {
  if (!hayNumero(costo) || !hayNumero(markup)) return null
  return redondear(Number(costo) * (1 + Number(markup)), 2)
}

/** `precio = costo ÷ (1 − m)`. Es lo que hace falta para GANAR ese porcentaje sobre la venta. PURA.
 *  Un margen ≥ 1 no tiene precio finito: se devuelve `null` en vez de un infinito disfrazado. */
export function precioDesdeMargenSobreVenta({ costo, margen } = {}) {
  if (!hayNumero(costo) || !hayNumero(margen) || Number(margen) >= 1) return null
  return redondear(Number(costo) / (1 - Number(margen)), 2)
}

// ═══ LAS DOS CONVERSIONES NO REDONDEAN ═══
//
// Redondear un RATIO a seis decimales y después multiplicarlo por plata mete el error en el número
// que se cobra: sobre una obra de $100 M, 1e-6 de error son $100, y encadenar dos conversiones lo
// duplica. Lo detectó el test de ida y vuelta —`margenDeMarkup(markupDeMargen(0,05))` daba 0,049999—.
// El redondeo va donde termina la cuenta: en el PRECIO, a dos decimales.

/** Qué margen sobre la venta deja un markup sobre el costo: `m = k ÷ (1 + k)`. PURA. */
export function margenDeMarkup(markup) {
  if (!hayNumero(markup)) return null
  return Number(markup) / (1 + Number(markup))
}

/** Qué markup sobre el costo hace falta para un margen sobre la venta: `k = m ÷ (1 − m)`. PURA. */
export function markupDeMargen(margen) {
  if (!hayNumero(margen) || Number(margen) >= 1) return null
  return Number(margen) / (1 - Number(margen))
}

/** El margen sobre la venta que EFECTIVAMENTE dejó un precio. PURA. */
export function margenSobreVenta({ precio, costo } = {}) {
  if (!hayNumero(precio) || !hayNumero(costo) || Number(precio) <= 0) return null
  return redondear((Number(precio) - Number(costo)) / Number(precio))
}

/** El markup sobre el costo que EFECTIVAMENTE se aplicó. PURA. */
export function markupSobreCosto({ precio, costo } = {}) {
  if (!hayNumero(precio) || !hayNumero(costo) || Number(costo) <= 0) return null
  return redondear((Number(precio) - Number(costo)) / Number(costo))
}

/**
 * ¿ESTE PRESUPUESTO LLEGA AL MARGEN OBJETIVO DE LA EMPRESA? PURA.
 *
 * Devuelve CONFLICTO —no un veredicto— cuando el umbral está en conflicto. Es el caso real de
 * `margen_objetivo_pct`: 17 en el código productivo, 12 en el handoff de diseño, sin evidencia de
 * cuál decidió el dueño. Juzgar un precio contra un umbral que la empresa no decidió es fabricar una
 * autoridad que no existe, y elegir uno de los dos «para poder responder» es peor: el número que
 * saliera parecería una regla.
 */
export function cumpleMargenObjetivo({ version, margenLogrado } = {}) {
  const c = version?.porClave?.margenObjetivoPct ?? null
  if (!c) return { estado: ESTADO.FALTA_DATO, cumple: null, porQue: 'la política no declara margen objetivo: no hay contra qué comparar' }
  if (c.estado === ESTADO.CONFLICTO) {
    return { estado: ESTADO.CONFLICTO, cumple: null, umbral: null, porQue: `el margen objetivo está en CONFLICTO y no se puede juzgar este precio contra él: ${c.conflicto}` }
  }
  if (!hayNumero(c.valor) || !hayNumero(margenLogrado)) {
    return { estado: ESTADO.FALTA_DATO, cumple: null, umbral: c.valor, porQue: 'falta el umbral o el margen logrado' }
  }
  return { estado: ESTADO.CALCULADO, cumple: Number(margenLogrado) >= Number(c.valor), umbral: Number(c.valor), margenLogrado: Number(margenLogrado), porQue: null }
}
