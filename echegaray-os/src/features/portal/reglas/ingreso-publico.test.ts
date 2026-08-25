import test from 'node:test'
import assert from 'node:assert/strict'
import { esRutaPublica } from '../../auth/types/index.ts'
import { RUTA_PORTAL, RUTA_PORTAL_INGRESAR, rutaObraPortal } from '../rutas.ts'

// EL INGRESO DEL CLIENTE ES PÚBLICO. EL PORTAL NO.
//
// `esRutaPublica` abre una ruta Y TODO LO QUE CUELGA DE ELLA (`pathname.startsWith(r + '/')`). Poner
// `/portal` en la lista blanca —el error natural, porque «el portal es del cliente»— abriría
// `/portal` y `/portal/obra/<id>` a cualquier anónimo: la obra, el avance y los importes de un
// cliente, servidos sin sesión. Es el mismo defecto que ya se pagó con `/flujo-caja` respondiendo
// 200 a un `curl` sin cookies el 17/08.
//
// Este test se pone rojo si alguien cambia la entrada por el prefijo.

test('pedir el link de ingreso no exige sesión', () => {
  assert.equal(esRutaPublica(RUTA_PORTAL_INGRESAR), true,
    'el cliente no tiene contraseña: si esto pide sesión, el portal no se puede abrir nunca')
})

test('el portal en sí NO es público — ni la obra del cliente', () => {
  assert.equal(esRutaPublica(RUTA_PORTAL), false)
  assert.equal(esRutaPublica(rutaObraPortal('11111111-1111-1111-1111-111111111111')), false)
  for (const r of ['/portal/pagos', '/portal/ingresar-todo', '/portal-ingresar']) {
    assert.equal(esRutaPublica(r), false, `${r} quedó pública sin que nadie lo decidiera`)
  }
})
