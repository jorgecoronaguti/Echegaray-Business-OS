// EL BORDE DE LA POLÍTICA VERSIONADA Y LOS INDIRECTOS — lo único de estos dos módulos que toca la base.
//
// Mismo diseño que `pg.mjs`: `politica-version.mjs` e `indirectos.mjs` son PUROS y se pueden correr
// sin red; acá se traduce entre las filas y esa forma, y nada más. No calcula, no corrige, no
// completa. Una fila con `valor` en NULL llega como NULL — decidir qué significa es del motor.
//
// ⚠ NO ES PARA LA WEB. Igual que `pg.mjs`: el `query` que recibe es el pool del servidor y la RLS no
// se evalúa. Uso legítimo: scripts, informes, tests y el worker. Desde una ruta de Next la escritura
// la hace el caller con SU credencial.

import { componenteDePolitica, versionDePolitica, referenciaDePolitica, overrideDeCotizacion } from './politica-version.mjs'
import { conceptoIndirecto, estructuraIndirecta } from './indirectos.mjs'
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
