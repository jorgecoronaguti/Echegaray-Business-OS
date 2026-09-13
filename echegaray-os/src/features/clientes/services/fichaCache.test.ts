// LA CACHÉ DE LA FICHA NO SE PIERDE NI SE PUDRE POR UNA MIGRACIÓN POSTERIOR.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
// Desde 20260913T1500, `pantalla_cliente` y `hh_de_obra` son ENVOLTORIOS que leen
// `ficha_cliente_cache`, y el cálculo vive en `pantalla_cliente_en_vivo` y `hh_de_obra_en_vivo`. La
// costumbre del repo —copiar la definición viva y redefinir la RPC entera— rompe eso de dos maneras
// que no tiran ningún error:
//
//   1 · UNA MIGRACIÓN QUE REDEFINE LA RPC CON EL CUERPO ENTERO borra el envoltorio: la ficha vuelve a
//       planificarse en frío en cada pedido (2–10 s, 113 s bajo carga) y el cron sigue llenando una
//       tabla que ya nadie lee. La última definición de cada RPC tiene que seguir leyendo la caché.
//   2 · UNA MIGRACIÓN QUE CAMBIA EL CÁLCULO Y NO VACÍA LA CACHÉ sirve el número viejo hasta diez
//       minutos, con la pantalla diciendo «datos de hace 3 min» sobre una regla que ya no rige.
//
// Lee el TEXTO de las migraciones: el orden del nombre de archivo ES el orden de la cadena
// (`.claude/rules/migraciones.md`), y la última que define una función es la que queda viva.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('../../../../supabase/migrations/', import.meta.url))
const DESDE = '20260913T1500_ficha_del_cliente_desde_cache.sql'
const archivos = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
const texto = (f: string) => readFileSync(DIR + f, 'utf8')

function define(sql: string, firma: string): boolean {
  return new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${firma}\\s*\\(`, 'i').test(sql)
}

/** El cuerpo de la última definición de `firma`, desde su `create` hasta el `$function$;` que la cierra. */
function ultimaDefinicion(firma: string): { archivo: string; cuerpo: string } {
  const archivo = archivos.filter((f) => define(texto(f), firma)).at(-1)
  assert.ok(archivo, `ninguna migración define ${firma}`)
  const sql = texto(archivo)
  const i = sql.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${firma}\\s*\\(`, 'i'))
  const fin = sql.indexOf('$function$;', i)
  return { archivo, cuerpo: sql.slice(i, fin < 0 ? undefined : fin) }
}

test('la migración de la caché está en la cadena', () => {
  assert.ok(archivos.includes(DESDE))
})

for (const rpc of ['pantalla_cliente', 'hh_de_obra']) {
  test(`la última definición de ${rpc} sigue leyendo la caché`, () => {
    const { archivo, cuerpo } = ultimaDefinicion(rpc)
    assert.ok(archivo >= DESDE, `${rpc} la define por última vez ${archivo}, anterior a la caché`)
    assert.match(cuerpo, /ficha_cliente_cache_leer\(/,
      `${archivo} redefine ${rpc} sin leer la caché: la ficha vuelve a planificarse en frío en cada pedido. `
      + `El cálculo se cambia en ${rpc}_en_vivo.`)
    assert.match(cuerpo, new RegExp(`${rpc}_en_vivo\\(`), `${archivo}: ${rpc} ya no delega en ${rpc}_en_vivo`)
  })
}

test('toda migración posterior que cambia un cálculo cacheado vacía la caché', () => {
  const posteriores = archivos.filter((f) => f > DESDE)
  for (const f of posteriores) {
    const sql = texto(f)
    if (!define(sql, 'pantalla_cliente_en_vivo') && !define(sql, 'hh_de_obra_en_vivo')) continue
    assert.match(sql, /delete\s+from\s+public\.ficha_cliente_cache|invalidar_ficha_cliente_cache\(\s*null|refrescar_ficha_cliente_cache\(/i,
      `${f} cambia lo que calcula la ficha o el desglose y no vacía ficha_cliente_cache: `
      + 'Dirección vería el cálculo viejo hasta diez minutos')
  }
})

test('el barrido reconoce una redefinición que pisa el envoltorio (el control puede dar rojo)', () => {
  const pisada = 'create or replace function public.pantalla_cliente(p_slug text, p_solapa text)\n'
    + 'returns jsonb language plpgsql as $function$ begin return (select 1); end $function$;'
  assert.ok(define(pisada, 'pantalla_cliente'))
  assert.doesNotMatch(pisada, /ficha_cliente_cache_leer\(/)
})
