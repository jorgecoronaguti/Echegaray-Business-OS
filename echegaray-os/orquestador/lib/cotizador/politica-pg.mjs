// EL BORDE DE LA POLÍTICA VERSIONADA Y LOS INDIRECTOS — lo único de estos dos módulos que toca la base.
//
// Mismo diseño que `pg.mjs`: `politica-version.mjs` e `indirectos.mjs` son PUROS y se pueden correr
// sin red; acá se traduce entre las filas y esa forma, y nada más. No calcula, no corrige, no
// completa. Una fila con `valor` en NULL llega como NULL — decidir qué significa es del motor.
//
// ⚠ NO ES PARA LA WEB. Igual que `pg.mjs`: el `query` que recibe es el pool del servidor y la RLS no
// se evalúa. Uso legítimo: scripts, informes, tests y el worker. Desde una ruta de Next la escritura
// la hace el caller con SU credencial.

import { componenteDePolitica, versionDePolitica, referenciaDePolitica, overrideDeCotizacion, coincideConLaVersion } from './politica-version.mjs'
import { conceptoIndirecto, estructuraIndirecta, indirectoCalculado, indirectoAplicado } from './indirectos.mjs'
import { VIGENCIA_SUBCONTRATO } from './costo.mjs'

const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ? String(v).slice(0, 10) : null))
const num = (v) => (v === null || v === undefined ? null : Number(v))

/** UNA versión de política, con sus componentes. Si `version` es `null`, la VIGENTE. */
export async function leerVersionDePolitica({ query }, version = null) {
  const v = await query(
    version === null
      ? `select id, version, estado, vigente, vigencia_desde, fuente, publicada_por, publicada_por_declarado, notas
           from public.politica_comercial_version where vigente`
      : `select id, version, estado, vigente, vigencia_desde, fuente, publicada_por, publicada_por_declarado, notas
           from public.politica_comercial_version where version = $1`,
    version === null ? [] : [Number(version)])
  const fila = v.rows[0]
  if (!fila) return null
  const cs = await query(
    `select concepto, clave, valor, normativo, fuente, estado, conflicto, notas
       from public.politica_comercial_componente where politica_version_id = $1 order by concepto, clave`, [fila.id])
  return versionDePolitica({
    version: fila.version, estado: fila.estado, fuente: fila.fuente,
    vigenciaDesde: iso(fila.vigencia_desde),
    // La firma real si la hay; si no, la declarada por la siembra. Perder la distinción sería fingir
    // que una migración es una persona.
    publicadaPor: fila.publicada_por ?? fila.publicada_por_declarado ?? null,
    notas: fila.notas,
    componentes: cs.rows.map((c) => componenteDePolitica({
      clave: c.clave, valor: num(c.valor), fuente: c.fuente, estado: c.estado, conflicto: c.conflicto, notas: c.notas,
    })),
  })
}

/** El catálogo entero, para resolver la referencia de una cotización vieja. */
export async function leerCatalogoDePoliticas({ query }) {
  const vs = await query(`select version from public.politica_comercial_version order by version`)
  const salida = []
  for (const { version } of vs.rows) salida.push(await leerVersionDePolitica({ query }, version))
  return salida.filter(Boolean)
}

/** La referencia de una cotización y sus overrides, en la forma que `politicaEfectiva()` consume. */
export async function leerPoliticaDeCotizacion({ query }, cotizacionId) {
  const r = await query(
    `select politica_version_id, version, congelada_en from public.cotizacion_politica_ref where cotizacion_id = $1`, [cotizacionId])
  const fila = r.rows[0] ?? null
  const os = await query(
    `select clave, valor, autorizado_por, motivo, evidencia, fecha
       from public.cotizacion_politica_override where cotizacion_id = $1 order by clave`, [cotizacionId])
  return {
    referencia: fila ? referenciaDePolitica({ cotizacionId, version: fila.version, congeladaEn: fila.congelada_en }) : null,
    overrides: os.rows.map((o) => overrideDeCotizacion({
      clave: o.clave, valor: num(o.valor), autorizadoPor: o.autorizado_por,
      motivo: o.motivo, evidencia: o.evidencia, fecha: iso(o.fecha),
    })),
  }
}

/** La estructura de indirectos vigente, con su denominador y sus conceptos. */
export async function leerEstructuraIndirecta({ query }) {
  const e = await query(
    `select id, version, costo_directo_anual, fuente, vigencia_desde from public.indirecto_estructura where vigente`)
  const fila = e.rows[0]
  if (!fila) return null
  const cs = await query(
    `select concepto, bloque, base, monto_anual, pct, monto, fuente, notas
       from public.indirecto_concepto where estructura_id = $1 order by bloque, concepto`, [fila.id])
  return estructuraIndirecta({
    version: fila.version, fuente: fila.fuente, vigenciaDesde: iso(fila.vigencia_desde),
    costoDirectoAnual: num(fila.costo_directo_anual),
    conceptos: cs.rows.map((c) => conceptoIndirecto({
      concepto: c.concepto, bloque: c.bloque, base: c.base, fuente: c.fuente, notas: c.notas,
      montoAnual: num(c.monto_anual), pct: num(c.pct), monto: num(c.monto),
    })),
  })
}

/** El indirecto aplicado que quedó guardado para una cotización, con su override completo o sin él. */
export async function leerIndirectoDeCotizacion({ query }, cotizacionId) {
  const r = await query(
    `select pct_calculado, pct_aplicado, override_actor, override_motivo, override_evidencia, override_fecha
       from public.cotizacion_indirecto where cotizacion_id = $1`, [cotizacionId])
  const f = r.rows[0]
  if (!f) return null
  return {
    pctCalculado: num(f.pct_calculado), pctAplicado: num(f.pct_aplicado),
    override: f.override_actor
      ? { valor: num(f.pct_aplicado), actor: f.override_actor, motivo: f.override_motivo, evidencia: f.override_evidencia, fecha: iso(f.override_fecha) }
      : null,
  }
}

/** La tabla de vigencia por tipo de subcontrato. Un tipo sin fila NO está: cae en GENERAL y el motor
 *  declara que ese vencimiento es un supuesto. */
export async function leerVigenciaDeSubcontratos({ query }) {
  const r = await query(`select tipo, dias from public.subcontrato_vigencia_default`)
  if (!r.rows.length) return { ...VIGENCIA_SUBCONTRATO }
  return Object.fromEntries(r.rows.map((x) => [x.tipo, Number(x.dias)]))
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA ESCRITURA — lo que faltaba, y por eso «ninguna cotización las referencia todavía»
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Este archivo tenía cinco lectores y CERO escritores. `cotizacion_politica_ref` y
// `cotizacion_indirecto` existen desde el 29/08 con 0 filas, y la DoD lo leía como una decisión
// pendiente de la empresa: «la cascada sigue tomando la vigente». No era eso. No había por dónde
// escribir la referencia aunque alguien quisiera.
//
// ⚠ Lo mismo que arriba: NO ES PARA LA WEB. El `query` es el pool del servidor y la RLS no se
// evalúa. Desde una ruta de Next la escritura la hace el caller con SU credencial.

/**
 * DEJAR ESCRITO QUÉ VERSIÓN DE POLÍTICA USÓ ESTA COTIZACIÓN.
 *
 * Guarda el NÚMERO de versión y el id de la fila, no los porcentajes. Es toda la diferencia: si
 * copiara los valores, publicar una política nueva no cambiaría el precio de las ofertas viejas
 * —bien— pero tampoco se podría auditar contra qué versión se cotizó —mal—. La referencia contesta
 * las dos.
 *
 * Idempotente por cotización: cotizar dos veces no crea dos referencias. `congeladaEn` sólo se
 * escribe una vez — una cotización congelada no cambia de política, y `coalesce` lo hace cumplir en
 * la base y no en el que llama.
 */
export async function escribirReferenciaDePolitica({ query }, { cotizacionId, version, congeladaEn = null } = {}) {
  if (!cotizacionId) throw new Error('una referencia de política sin cotización no apunta a nada')
  const v = await query('select id, version from public.politica_comercial_version where version = $1', [Number(version)])
  const fila = v.rows[0]
  if (!fila) return { escrita: false, porQue: `la política v${version} no existe: no se puede referenciar lo que no está en el catálogo` }
  const r = await query(
    `insert into public.cotizacion_politica_ref (cotizacion_id, politica_version_id, version, congelada_en)
     values ($1, $2, $3, $4)
     on conflict (cotizacion_id) do update
       set politica_version_id = excluded.politica_version_id,
           version = excluded.version,
           congelada_en = coalesce(public.cotizacion_politica_ref.congelada_en, excluded.congelada_en)
     returning version, congelada_en`,
    [cotizacionId, fila.id, fila.version, congeladaEn])
  return { escrita: true, version: r.rows[0].version, congeladaEn: r.rows[0].congelada_en, porQue: null }
}

/**
 * DEJAR ESCRITOS LOS DOS INDIRECTOS DE ESTA COTIZACIÓN.
 *
 * `pctCalculado` y `pctAplicado` van a COLUMNAS DISTINTAS y las dos pueden ser NULL. Un calculado en
 * NULL es «la estructura no alcanza para calcularlo» y NO es cero: por eso no hay `?? 0` en ninguna
 * parte de esta función. Hoy, con los 14 conceptos reales sin valor, lo que se guarda es exactamente
 * ese par de nulos con su estructura al lado — que es más información que no guardar nada.
 *
 * El override sólo se escribe COMPLETO: `override_actor` es un uuid de persona, y sin actor los
 * otros tres campos no se guardan tampoco. Un override a medias en la base es peor que ninguno.
 */
export async function escribirIndirectoDeCotizacion({ query }, { cotizacionId, estructuraId = null, pctCalculado = null, pctAplicado = null, override = null } = {}) {
  if (!cotizacionId) throw new Error('un indirecto sin cotización no se puede guardar')
  const completo = Boolean(override?.actor && override?.motivo && override?.evidencia && override?.fecha)
  const r = await query(
    `insert into public.cotizacion_indirecto
       (cotizacion_id, estructura_id, pct_calculado, pct_aplicado, override_actor, override_motivo, override_evidencia, override_fecha)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (cotizacion_id) do update
       set estructura_id = excluded.estructura_id, pct_calculado = excluded.pct_calculado,
           pct_aplicado = excluded.pct_aplicado, override_actor = excluded.override_actor,
           override_motivo = excluded.override_motivo, override_evidencia = excluded.override_evidencia,
           override_fecha = excluded.override_fecha
     returning pct_calculado, pct_aplicado, override_actor`,
    [cotizacionId, estructuraId, pctCalculado, pctAplicado,
      completo ? override.actor : null, completo ? override.motivo : null,
      completo ? override.evidencia : null, completo ? override.fecha : null])
  const f = r.rows[0]
  return {
    escrito: true,
    pctCalculado: f.pct_calculado === null ? null : Number(f.pct_calculado),
    pctAplicado: f.pct_aplicado === null ? null : Number(f.pct_aplicado),
    overrideEscrito: f.override_actor !== null,
    porQue: override && !completo ? 'el override venía incompleto y NO se escribió: en la base, un override a medias es peor que ninguno' : null,
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL REGISTRO — lo que corre cuando se escribe una cotización, y por eso deja de no correr nunca
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Medido el 03/09/2026: `cotizacion_politica_ref` y `cotizacion_indirecto` tenían 0 filas sobre las
// 19 cotizaciones de la base. Los lectores existían, los escritores de arriba también, y ningún
// camino productivo los llamaba — sólo un script de escenario que hace rollback. El commit e7e6160c
// había arreglado el ReferenceError del orquestador de once etapas, pero ese orquestador tampoco
// corre en producción: los dos caminos vivos (la web y el handler `cotizacion.plano`) van por
// `plano/cotizacion-v0.mjs` y la vista `cotizacion_cascada`.
//
// Esta función es el enganche que faltaba, y se llama desde `persistir()` — el único lugar por donde
// una cotización nace del motor. NO cambia el precio: los ocho porcentajes ya se copiaron y la
// cascada los sigue leyendo de la fila. Lo que agrega es CONTRA QUÉ se cotizó.

const NADA = Object.freeze({ escrita: false, escrito: false, porQue: null })

/** Los ocho porcentajes que la cotización copió, en las claves que usa el motor. */
async function pctsDeLaCotizacion({ query }, cotizacionId) {
  const r = await query(
    `select pct_gastos_generales, pct_beneficio, pct_financiero, factor_financiero,
            pct_iibb, pct_ganancias, pct_cheque, pct_iva
       from public.cotizaciones where id = $1`, [cotizacionId])
  const f = r.rows[0]
  if (!f) return null
  return {
    pctGastosGenerales: num(f.pct_gastos_generales), pctBeneficio: num(f.pct_beneficio),
    pctFinanciero: num(f.pct_financiero), factorFinanciero: num(f.factor_financiero),
    pctIibb: num(f.pct_iibb), pctGanancias: num(f.pct_ganancias),
    pctCheque: num(f.pct_cheque), pctIva: num(f.pct_iva),
  }
}

/** El costo directo que la vista canónica calculó para esta cotización — el denominador del
 *  indirecto por obra. `null` si la cotización todavía no tiene partidas valorizadas. */
async function costoDirectoDe({ query }, cotizacionId) {
  const r = await query('select costo_directo from public.cotizacion_cascada where id = $1', [cotizacionId])
  const v = num(r.rows[0]?.costo_directo)
  return v && v > 0 ? v : null
}

/**
 * DEJAR ESCRITO CONTRA QUÉ POLÍTICA Y CONTRA QUÉ ESTRUCTURA DE INDIRECTOS SE COTIZÓ.
 *
 * Devuelve `{ politica, indirecto }`, cada uno con su `porQue` cuando no se escribió. Ninguna de las
 * dos escrituras es condición de que la cotización exista: una oferta ya escrita no se tira porque
 * su registro de auditoría no pudo hacerse, pero el motivo se publica en vez de desaparecer.
 *
 * ═══ LA REFERENCIA SE ESCRIBE SÓLO SI ES VERDAD ═══
 *
 * `coincideConLaVersion` compara los siete porcentajes comerciales que la cotización copió contra los
 * de la versión vigente. Si difieren, NO se referencia: decir «se cotizó con la v1» cuando el
 * beneficio se negoció distinto es peor que no decir nada, porque parece auditado.
 *
 * ═══ EL INDIRECTO SE CALCULA DE VERDAD, Y HOY DA NULL ═══
 *
 * `indirectoCalculado` corre sobre los 14 conceptos reales de `indirecto_concepto`. Los 14 están sin
 * valor y `indirecto_estructura.costo_directo_anual` también, así que el resultado es `null` con 14
 * huecos nombrados — y ese `null` es una MEDICIÓN, no una ausencia. El 27 % que la cascada aplica de
 * verdad sigue en `cotizaciones.pct_gastos_generales`, y el par (aplicado 0,27 · calculado null) es
 * exactamente el hallazgo que `indirectos.mjs` ya nombra: un override sin registrar del 26,98 % de la
 * hoja GG que nadie firmó. Escribirlo como `pct_aplicado` sin override sería tipear otra vez el mismo
 * número sin explicarlo — la constraint `indirecto_aplicado_explicado` existe para eso.
 */
export async function registrarPoliticaEIndirecto({ query }, { cotizacionId, congeladaEn = null } = {}) {
  if (!cotizacionId) throw new Error('no se puede registrar la política de una cotización que no existe')
  const pcts = await pctsDeLaCotizacion({ query }, cotizacionId)
  if (!pcts) return { politica: { ...NADA, porQue: 'la cotización no está en la base' }, indirecto: { ...NADA, porQue: 'la cotización no está en la base' } }

  const version = await leerVersionDePolitica({ query })
  const veredicto = coincideConLaVersion({ pcts, version })
  const politica = veredicto.coincide
    ? await escribirReferenciaDePolitica({ query }, { cotizacionId, version: version.version, congeladaEn })
    : { escrita: false, porQue: veredicto.porQue, diferencias: veredicto.diferencias, faltan: veredicto.faltan }

  const estructura = await leerEstructuraIndirecta({ query })
  if (!estructura) {
    return { politica, indirecto: { ...NADA, porQue: 'no hay estructura de indirectos vigente: no hay contra qué registrar el indirecto de esta cotización' } }
  }
  const e = await query('select id from public.indirecto_estructura where vigente')
  const calc = indirectoCalculado({ estructura, costoDirectoObra: await costoDirectoDe({ query }, cotizacionId) })
  const aplicado = indirectoAplicado({ calculado: calc })
  const indirecto = await escribirIndirectoDeCotizacion({ query }, {
    cotizacionId, estructuraId: e.rows[0]?.id ?? null,
    pctCalculado: aplicado.calculado, pctAplicado: aplicado.aplicado,
  })
  return { politica, indirecto: { ...indirecto, porQue: indirecto.porQue ?? aplicado.porQue, nHuecos: calc.nHuecos } }
}
