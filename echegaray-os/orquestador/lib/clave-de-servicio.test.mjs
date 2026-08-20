// EL NOMBRE DE LA CLAVE DE SERVICIO, Y LA GARANTÍA DE QUE NUNCA VIAJA AL NAVEGADOR.
//
// `/administracion/usuarios` daba 500 en producción porque leía UN nombre fijo. Este test fija las
// dos mitades del arreglo: que se reconozcan los nombres que Supabase y la integración de Vercel
// usan hoy, y —la que importa— que **ninguno de ellos empiece con `NEXT_PUBLIC_`**, que es lo que
// convertiría una clave que saltea el RLS en un dato del navegador.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const SRC = fs.readFileSync(new URL('../../src/lib/supabase/admin.ts', import.meta.url), 'utf8')

test('ningún nombre de la clave de servicio es público', () => {
  const nombres = [...SRC.matchAll(/'(SUPABASE_[A-Z_]+)'/g)].map((m) => m[1])
  assert.ok(nombres.length >= 3, 'se perdieron los nombres conocidos de la clave de servicio')
  const publicos = nombres.filter((n) => n.startsWith('NEXT_PUBLIC'))
  assert.deepEqual(publicos, [],
    `estos nombres llegarían al navegador con una clave que saltea el RLS: ${publicos.join(', ')}`)
})

test('la forma admite el prefijo de tienda de la integración de Vercel', () => {
  const forma = /^SUPABASE_[A-Z0-9_]*(SERVICE_ROLE_KEY|SECRET_KEY|SERVICE_KEY)$/
  for (const bueno of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY',
    'SUPABASE_ECHEGARAY_SERVICE_ROLE_KEY', 'SUPABASE_X7K_SECRET_KEY']) {
    assert.ok(forma.test(bueno), `${bueno} tendría que reconocerse`)
  }
  for (const malo of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_URL',
    'SUPABASE_JWT_SECRET_ROTATION']) {
    assert.ok(!forma.test(malo), `${malo} NO tendría que confundirse con la clave de servicio`)
  }
})

test('el mensaje de falta no acarrea ningún valor', () => {
  // Un `throw new Error(\`... ${key}\`)` publicaría la clave en los logs del servidor. El mensaje
  // sólo puede nombrar variables.
  const lanzas = [...SRC.matchAll(/throw new Error\(([\s\S]*?)\)\n/g)].map((m) => m[1])
  for (const l of lanzas) {
    assert.ok(!/process\.env\[[^\]]+\]\s*}/.test(l) && !/\$\{key\}/.test(l),
      `un mensaje de error interpola un valor de entorno: ${l.slice(0, 120)}`)
  }
})
