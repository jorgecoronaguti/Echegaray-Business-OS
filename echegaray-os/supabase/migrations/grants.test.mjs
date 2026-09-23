// UNA TABLA NUEVA SIN GRANT NO EXISTE PARA LA APP (cambio de Supabase del 30/10/2026).
//
// Desde 20260923T2000 los privilegios por defecto reparten DML a `authenticated` y `service_role`,
// pero un privilegio por defecto es una red, no un contrato: si la migración se aplica a mano con
// otro rol, o si alguien vuelve a angostar el default, la tabla nace muda y la pantalla dice
// «permission denied». Y la RLS es la otra mitad: con grant y sin RLS, la tabla muestra todo a
// cualquiera con sesión; con RLS y sin política, devuelve cero filas indistinguibles de un cero real.
//
// Por eso cada migración POSTERIOR a 20260923T2000 que crea una tabla en `public` tiene que traer,
// en el MISMO archivo: `grant … on <tabla>`, `alter table <tabla> enable row level security` y al
// menos una `create policy … on <tabla>`. No se leen las anteriores: están aplicadas y el ledger
// (`public.migracion_aplicada`) marca por hash cualquier edición posterior.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const DESDE = '20260923T2000'

/** Saca comentarios `-- …` y `/* … *​/`; lo que queda es SQL que se puede leer con expresiones. */
const sinComentarios = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*--.*$/gm, ' ')

/** `public.x`, `"public"."x"`, `x` → `x`. */
const nombrePelado = (s) => s.replace(/"/g, '').replace(/^public\./, '').toLowerCase()

/**
 * Qué tablas crea el archivo en `public` y qué le falta a cada una.
 * @returns {{tabla: string, falta: string[]}[]} vacío = la migración cumple.
 */
export function faltantes(sql) {
  const s = sinComentarios(sql)
  const creadas = new Set()
  // `create table [if not exists] [public.]x` — nunca temp/unlogged (no salen por la Data API) ni
  // tablas de otros esquemas.
  const re = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?public"?\.)?"?[a-z_][a-z0-9_]*"?)\s*\(/gi
  for (const m of s.matchAll(re)) {
    const crudo = m[1]
    if (/^"?[a-z_]+"?\./i.test(crudo) && !/^"?public"?\./i.test(crudo)) continue
    creadas.add(nombrePelado(crudo))
  }
  const resultado = []
  for (const tabla of creadas) {
    const t = `(?:"?public"?\\.)?"?${tabla}"?\\b`
    const falta = []
    if (!new RegExp(`\\bgrant\\b[^;]*?\\bon\\s+(?:table\\s+)?${t}`, 'i').test(s)) falta.push('grant')
    if (!new RegExp(`\\balter\\s+table\\s+(?:only\\s+)?${t}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(s)) falta.push('enable row level security')
    if (!new RegExp(`\\bcreate\\s+policy\\b[^;]*?\\bon\\s+${t}`, 'i').test(s)) falta.push('create policy')
    if (falta.length) resultado.push({ tabla, falta })
  }
  return resultado
}

test('una tabla con grant, RLS y política pasa', () => {
  assert.deepEqual(faltantes(`
    create table if not exists public.cosa (id uuid primary key);
    alter table public.cosa enable row level security;
    create policy cosa_lee on public.cosa for select to authenticated using (true);
    grant select, insert on public.cosa to authenticated;
  `), [])
})

test('una tabla sin grant falla por el grant, y sin RLS ni política lo dice todo', () => {
  assert.deepEqual(faltantes(`create table public.cosa (id int);`),
    [{ tabla: 'cosa', falta: ['grant', 'enable row level security', 'create policy'] }])
  assert.deepEqual(faltantes(`
    create table cosa (id int);
    alter table cosa enable row level security;
    create policy p on cosa for select using (true);
  `), [{ tabla: 'cosa', falta: ['grant'] }])
})

test('el grant tiene que ser sobre ESA tabla: uno sobre otra no la salva', () => {
  assert.deepEqual(faltantes(`
    create table public.cosa (id int);
    grant select on public.otra to authenticated;
    alter table public.cosa enable row level security;
    create policy p on public.cosa for select using (true);
  `), [{ tabla: 'cosa', falta: ['grant'] }])
})

test('lo comentado, lo temporal y lo de otro esquema no cuentan', () => {
  assert.deepEqual(faltantes(`
    -- create table public.fantasma (id int);
    /* create table public.otro_fantasma (id int); */
    create temp table pasajera (id int);
    create table orq.interna (id int);
  `), [])
})

test(`toda migración posterior a ${DESDE} que crea una tabla en public le da grant, RLS y política`, () => {
  const archivos = readdirSync(DIR).filter((f) => f.endsWith('.sql') && f > DESDE).sort()
  const fallas = []
  for (const f of archivos) {
    for (const { tabla, falta } of faltantes(readFileSync(join(DIR, f), 'utf8'))) {
      fallas.push(`${f}: public.${tabla} sin ${falta.join(', ')}`)
    }
  }
  assert.deepEqual(fallas, [], 'una tabla nueva sin grant no existe para la Data API; sin RLS muestra todo; sin política devuelve cero filas:\n  ' + fallas.join('\n  '))
})
