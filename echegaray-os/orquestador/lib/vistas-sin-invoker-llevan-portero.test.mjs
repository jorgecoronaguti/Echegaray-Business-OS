// NINGUNA VISTA NUEVA CORRE COMO SU DUEÑO SIN PORTERO — regla estática, sin base.
//
// ═══ POR QUÉ EXISTE (13/09/2026) ═══
//
// `create view` sin `security_invoker` corre como `postgres` POR DEFAULT y saltea el RLS de todas
// sus tablas. El auditor de cierre lo midió con la sesión de un perfil campo: `nomina_por_mes`,
// `egreso_por_area`, `obra_economia_cartera`, `finanzas_scorecard_vigente` y los recuperos de ART
// publicaban plata a cualquier autenticado. `vistas-security-invoker.test.mjs` mira el catálogo
// pero sólo si hay base, y sólo las vistas que ya conoce. Ésta corre en cualquier checkout y mira
// TODAS las vistas que definen las migraciones: la definición que manda es la ÚLTIMA de cada una.
//
// Una vista pasa si (a) corre con `security_invoker`, (b) lleva un portero en su WHERE
// (`ve_economia`, `liquida_sueldos`, `es_administracion`, `ve_obra`, o `mi_persona_id` para las
// propias), o (c) está en LISTA_BLANCA con su razón escrita. Un `when ve_economia()` dentro de un
// CASE NO cuenta: enmascara una columna y deja pasar la fila con las demás — así estaba
// `obra_economia_cartera`, publicando costos con el contratado en null.
//
// QUÉ LA PONE ROJA: una vista nueva sin ninguna de las tres; revertir `20260913T1200` (las seis de
// ECONOMICAS vuelven a su definición sin portero); o una entrada de LISTA_BLANCA que ya no hace falta.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(import.meta.dirname, '..', '..', 'supabase', 'migrations')

/** Las que `20260913T1200` cerró. Si alguna pierde el portero, volvió la fuga medida. */
const ECONOMICAS = [
  'obra_economia_cartera', 'egreso_por_area', 'finanzas_scorecard_vigente',
  'nomina_por_mes', 'recupero_art_por_mes', 'recupero_art_sin_imputar',
]

/** Corren como su dueño sin portero, a sabiendas. Agregar una acá es una decisión: va con su razón. */
const LISTA_BLANCA = {
  actividad_avance: 'avance físico por actividad (cantidades, partes, pasos); cero plata',
  aprendizaje_activo: 'reglas de aprendizaje vigentes del OS; cero plata',
  factor_ajuste: 'índices públicos (IPC, CAC) acumulados; dato publicado, no de ECSAS',
  factor_ajuste_canario: 'control del factor de ajuste sobre índices públicos',
  v_capacidades_xsas: 'catálogo de capacidades del asistente; cero plata',
  v_drive_busqueda_alias: 'métricas de búsqueda en Drive; cero plata',
  v_drive_busqueda_metricas: 'métricas de búsqueda en Drive; cero plata',
  v_drive_busqueda_documentos: 'métricas de búsqueda en Drive; cero plata',
  persona_plantel: 'desescalada declarada en vistas-security-invoker: cinco columnas sin plata',
  biblioteca_completa: 'catálogo de skills del OS; cero plata',
  conocimiento_por_area: 'conocimiento por área del OS; cero plata',
  // Las cuatro de abajo SÍ tienen plata, y quedan acá por un hecho medido y no por criterio: el
  // 13/09/2026 NO estaban entre las vistas que `authenticated` puede leer (catálogo, has_table_privilege).
  // Si alguien les concede SELECT, esta lista deja de ser cierta: la vigila el test pg de 20260913T1200.
  calendario_caja: 'con plata; sin grant a authenticated (medido 13/09)',
  egreso_rubro_mes: 'con plata; sin grant a authenticated (medido 13/09)',
  proyeccion_egreso: 'con plata; sin grant a authenticated (medido 13/09)',
  comprobante_sin_registrar: 'con plata; sin grant a authenticated (medido 13/09)',
}

const PORTERO = /\b(?:where|and|or)\s+\(*\s*(?:select\s+)?(?:public\.)?(?:ve_economia|liquida_sueldos|es_administracion|ve_obra)\s*\(|mi_persona_id\s*\(/i
const INVOKER = /security_invoker\s*=\s*(?:true|on)/i

/** La última definición de cada vista de `public`, en orden de migración. */
export function ultimasDefiniciones(archivos) {
  const ultima = new Map()
  for (const { nombre, sql: crudo } of archivos) {
    const sql = crudo.replace(/--[^\n]*/g, '')
    const crea = /create\s+(?:or\s+replace\s+)?view\s+(?:"?(\w+)"?\.)?"?(\w+)"?([\s\S]*?);[ \t]*(?:\n|$)/gi
    for (const m of sql.matchAll(crea)) {
      if (m[1] && m[1].toLowerCase() !== 'public') continue
      ultima.set(m[2].toLowerCase(), { archivo: nombre, cuerpo: m[3], invoker: INVOKER.test(m[3]) })
    }
    const alter = /alter\s+view\s+(?:public\.)?"?(\w+)"?\s+set\s*\(\s*security_invoker\s*=\s*(true|on|false|off)/gi
    for (const m of sql.matchAll(alter)) {
      const u = ultima.get(m[1].toLowerCase())
      if (u) u.invoker = /true|on/i.test(m[2])
    }
  }
  return ultima
}

export const tienePortero = (cuerpo) => PORTERO.test(cuerpo)

const archivos = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  .map((nombre) => ({ nombre, sql: readFileSync(join(DIR, nombre), 'utf8') }))
const vistas = ultimasDefiniciones(archivos)
const sinCerradura = [...vistas].filter(([, u]) => !u.invoker && !tienePortero(u.cuerpo)).map(([v]) => v).sort()

test('ninguna vista corre como su dueño sin portero ni razón declarada', () => {
  const nuevas = sinCerradura.filter((v) => !(v in LISTA_BLANCA))
  assert.deepEqual(nuevas, [],
    'estas vistas saltean el RLS sin portero: agregá `with (security_invoker = true)`, un portero ' +
    'en el WHERE, o una razón en LISTA_BLANCA')
})

test('las seis vistas económicas de 20260913T1200 llevan el portero en su definición vigente', () => {
  for (const v of ECONOMICAS) {
    const u = vistas.get(v)
    assert.ok(u, `\`${v}\` no está definida en ninguna migración`)
    assert.ok(tienePortero(u.cuerpo), `\`${v}\` (${u.archivo}) volvió a publicar plata sin portero`)
  }
})

test('la lista blanca no guarda vistas que ya no la necesitan', () => {
  const sobran = Object.keys(LISTA_BLANCA).filter((v) => !sinCerradura.includes(v))
  assert.deepEqual(sobran, [], 'estas entradas ya tienen cerradura o no existen: sacalas de la lista')
})

test('el detector no confunde un CASE que enmascara con un portero', () => {
  // El caso real de `obra_economia_cartera` antes de 20260913T1200: si esto diera portero, la regla
  // de arriba no habría podido ver la fuga que midió el auditor.
  assert.equal(tienePortero('select case when ve_economia() or auth.uid() is null then x end, costo_mo from t'), false)
  assert.equal(tienePortero('select * from t where ((select public.ve_economia()) or (select auth.uid()) is null)'), true)
  assert.equal(tienePortero('select * from t where x = 1 and ve_economia()'), true)
  assert.equal(tienePortero('select * from t where p.id = mi_persona_id()'), true)
})
