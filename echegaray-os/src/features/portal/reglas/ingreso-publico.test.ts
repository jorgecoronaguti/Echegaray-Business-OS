import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { esRutaPublica } from '../../auth/types/index.ts'
import { RUTA_PORTAL, RUTA_PORTAL_INGRESAR } from '../rutas.ts'

// EL PORTAL PASA POR EL MIDDLEWARE, PERO NO SE ABRE SOLO.
//
// ═══ QUÉ CAMBIÓ (26/08/2026) ═══
//
// Hasta hoy este archivo exigía que `/portal` NO estuviera en la lista blanca, y tenía razón para el
// portal de entonces: el cliente era un usuario de Supabase con rol `cliente`, así que la sesión del
// OS era su credencial y sacarle la exigencia lo publicaba.
//
// El portal nuevo cambió el modelo de acceso, no la garantía. El cliente NO tiene usuario de
// Supabase: entra con el mail que el administrador le cargó en la ficha más un código. Con `/portal`
// fuera de la lista blanca el middleware lo mandaba al `/login` DEL OS —la pantalla de la empresa,
// con su formulario de contraseña— y no tenía cuenta con qué contestarle.
//
// ═══ LA GARANTÍA SE MUDÓ, NO SE PERDIÓ ═══
//
// Ahora la impone cada pantalla: `sesionDelPortal()` valida una cookie firmada con HMAC y, sin ella,
// redirige a `/portal/login`. Este test verifica ESO —que ninguna pantalla del portal sirva datos sin
// pedir la sesión— leyendo el fuente, que es donde se ve si alguien agrega una pantalla y se olvida.
// Sin esta comprobación, el día que alguien sume `/portal/algo` sin el chequeo, la ruta queda abierta
// y no lo dice nadie: es el mismo modo de falla que ya se pagó con `/flujo-caja` contestando 200 a un
// `curl` sin cookies el 17/08.

const DENTRO = new URL('../../../app/portal/(dentro)/', import.meta.url)

/** Todas las `page.tsx` que cuelgan del grupo con sesión. */
function pantallasConSesion(dir = DENTRO): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(dir)) {
    const hijo = new URL(`${entrada}${statSync(new URL(entrada, dir)).isDirectory() ? '/' : ''}`, dir)
    if (hijo.pathname.endsWith('/')) salida.push(...pantallasConSesion(hijo))
    else if (entrada === 'page.tsx' || entrada === 'layout.tsx') salida.push(hijo.pathname)
  }
  return salida
}

test('el ingreso del cliente no exige la sesión del OS', () => {
  assert.equal(esRutaPublica(RUTA_PORTAL_INGRESAR), true)
  // El portal nuevo: sin esto, el middleware manda al login de la empresa a alguien que no tiene cuenta.
  assert.equal(esRutaPublica(RUTA_PORTAL), true)
})

test('«público» en el middleware NO alcanza a nada del OS', () => {
  // Lo que se abrió es `/portal` y lo que cuelga de él. Que no se haya colado nada más.
  for (const r of ['/administracion', '/obras', '/flujo-caja', '/clientes', '/documentos', '/portales']) {
    assert.equal(esRutaPublica(r), false, `${r} quedó pública sin que nadie lo decidiera`)
  }
})

test('TODA pantalla del portal pide la sesión del portal — ninguna sirve datos sin ella', () => {
  const pantallas = pantallasConSesion()
  assert.ok(pantallas.length >= 6, `esperaba al menos 6 pantallas, encontré ${pantallas.length}`)
  for (const ruta of pantallas) {
    const src = readFileSync(ruta, 'utf8')
    const corta = ruta.slice(ruta.indexOf('(dentro)'))
    // «Salir» es la excepción declarada: es un formulario que sólo borra la cookie. No lee ni un dato
    // del cliente, así que pedirle sesión para poder cerrarla no protege nada.
    if (corta.includes('/salir/')) continue
    assert.match(src, /sesionDelPortal\(\)/, `${corta} no pide la sesión del portal`)
    assert.match(src, /redirect\('\/portal\/login'\)/, `${corta} no redirige al login sin sesión`)
  }
})

test('la sesión del portal no es la del OS: se valida firmada, no por Supabase', () => {
  const sesion = readFileSync(new URL('../../../app/portal/sesion.ts', import.meta.url), 'utf8')
  assert.match(sesion, /timingSafeEqual/, 'la firma se compara en tiempo constante')
  // Falla CERRADO: sin secreto no se firma nada, y sin firma no hay sesión.
  assert.match(sesion, /no puede firmar sesiones/)
})
