// LA PUERTA DE EGRESO PUEDE DECIR QUE NO, Y HAY QUE PROBAR QUE PUEDE.
// Un control que nunca da rojo no es un control. Cada caso de acá tiene su mutación:
// si se borra un patrón o una ruta de la lista, el test correspondiente pasa a rojo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { revisarEgreso, dominioDe } from './politica-codigo.mjs'

test('deja salir un fragmento de UI sin datos adentro', () => {
  const r = revisarEgreso({ ruta: 'src/features/x/components/Tabla.tsx', texto: "const COLUMNAS = ['Persona', 'Horas']" })
  assert.equal(r.permitido, true, r.porQue)
  assert.equal(r.dominio, 'codigo-ui')
})

test('deja salir un spec de test', () => {
  const r = revisarEgreso({ ruta: 'tests/liquidacion-fidelidad.spec.ts', texto: "await expect(t).toContainText('Saldo')" })
  assert.equal(r.permitido, true, r.porQue)
  assert.equal(r.sensibilidad, 'INTERNAL')
})

test('NO deja salir una migración, aunque el texto sea inocente', () => {
  const r = revisarEgreso({ ruta: 'supabase/migrations/2026_x.sql', texto: 'select 1' })
  assert.equal(r.permitido, false)
})

test('NO deja salir el núcleo del orquestador sin autorización del dueño', () => {
  const r = revisarEgreso({ ruta: 'orquestador/lib/ml/router.mjs', texto: 'export const A = 1' })
  assert.equal(r.permitido, false)
  assert.match(r.porQue, /CONFIDENTIAL/)
})

test('la autorización explícita del dueño destraba CONFIDENTIAL pero NO destraba RESTRICTED', () => {
  const ok = revisarEgreso({ ruta: 'orquestador/lib/ml/router.mjs', texto: 'export const A = 1', autorizadoPorElDueno: true })
  assert.equal(ok.permitido, true, ok.porQue)
  const no = revisarEgreso({ ruta: 'supabase/migrations/a.sql', texto: 'select 1', autorizadoPorElDueno: true })
  assert.equal(no.permitido, false, 'RESTRICTED no se destraba con la autorización')
})

// EL CASO QUE YA PASÓ: un archivo permitido con un dato real adentro.
for (const [nombre, texto] of [
  ['token HF', 'const t = "hf_ABCDEFGHIJKLMNOPQRSTUVWX"'],
  ['CUIT', 'const cuit = "30-71234567-4"'],
  ['cadena de conexión', 'postgresql://admin:clave123@db.host:5432/x'],
  ['clave privada', '-----BEGIN RSA PRIVATE KEY-----\nMII'],
  ['JWT', 'const j = "eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NTY.abc"'],
  ['service role', 'service_role_key: "sbp_abcdefghijklmnop"'],
  ['CBU', 'const cbu = "0720123488000012345678"'],
  ['email real', 'contacto: "jorge@ecsas.com.ar"'],
]) {
  test(`NO deja salir un .tsx que adentro tiene ${nombre}`, () => {
    const r = revisarEgreso({ ruta: 'src/components/A.tsx', texto })
    assert.equal(r.permitido, false, `debía bloquear por ${nombre}, dijo: ${r.porQue}`)
    assert.ok(r.hallazgos.length > 0, 'tiene que decir QUÉ encontró')
  })
}

test('ni la autorización del dueño deja salir un secreto', () => {
  const r = revisarEgreso({ ruta: 'src/components/A.tsx', texto: 'hf_ABCDEFGHIJKLMNOPQRSTUVWX', autorizadoPorElDueno: true })
  assert.equal(r.permitido, false, 'el escaneo del fragmento gana sobre la autorización del dominio')
})

test('sin ruta no sale nada (falla cerrado)', () => {
  assert.equal(revisarEgreso({ texto: 'hola' }).permitido, false)
})

test('local y Claude no pasan por la puerta de egreso', () => {
  assert.equal(revisarEgreso({ ruta: 'supabase/migrations/a.sql', texto: 'select 1', proveedor: 'claude' }).permitido, true)
  assert.equal(revisarEgreso({ ruta: 'supabase/migrations/a.sql', texto: 'select 1', proveedor: 'local' }).permitido, true)
})

test('clasificación de dominios', () => {
  assert.equal(dominioDe('supabase/migrations/a.sql'), 'migraciones')
  assert.equal(dominioDe('tests/a.spec.ts'), 'codigo-tests')
  assert.equal(dominioDe('src/features/a/components/B.tsx'), 'codigo-ui')
  assert.equal(dominioDe('orquestador/lib/ml/x.mjs'), 'codigo-nucleo')
  assert.equal(dominioDe('scripts/x.mjs'), 'codigo-utilidades')
})
