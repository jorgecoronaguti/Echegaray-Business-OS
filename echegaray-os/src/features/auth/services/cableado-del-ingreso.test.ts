import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// EL CABLEADO DEL INGRESO — la cadena que va de la URL a la pantalla de destino.
//
// ═══ EL AGUJERO QUE ESTO TAPA (auditoría del 08/09/2026) ═══
//
// `aterrizaje.test.ts` prueba la REGLA con 11 casos, y da rojo si la regla cambia. Pero no prueba
// que alguien la USE: si mañana se vuelve a escribir en `actions.ts`
//
//     redirect(rol === 'campo' ? '/hoy' : '/obras')
//
// los 11 tests siguen verdes —la función pura sigue siendo correcta, sólo que nadie la llama— y el
// E2E general también, porque su `ATERRIZAJE` es una unión que acepta `/obras` y `/administracion`.
// El defecto volvería entero con toda la suite en verde. Eso es exactamente lo que el auditor marcó.
//
// La cadena tiene TRES eslabones y los tres se rompen en silencio:
//
//   1. el middleware guarda `?volver=` cuando rebota a `/login`   (ya probado en rutas-publicas)
//   2. la PANTALLA lo pasa al formulario y el FORMULARIO lo manda  ← si se corta, el volver se pierde
//   3. la ACCIÓN decide con `aterrizajeDeIngreso`                  ← si se corta, vuelve el ternario
//
// ═══ QUÉ ES ESTO Y QUÉ NO ES ═══
//
// Es una invariante ESTÁTICA: lee la fuente y comprueba que el cable esté conectado. No ejecuta
// `loginAction`.
//
// LÍMITE DECLARADO, y es real: un test de ejecución sería más fuerte, pero `loginAction` es
// `'use server'` y depende de `next/navigation`, `next/cache` y del cliente de Supabase. Sustituir
// esos módulos necesita `mock.module`, que en el Node de este repo (v24) es `undefined` sin
// `--experimental-test-module-mocks` — comprobado, no supuesto — y `npm run orq:test` no pasa ese
// flag: el test no correría en la suite, o sea que no sería una red, sería un adorno. Lo que esta
// invariante NO puede ver es que la acción devuelva el destino correcto EN EJECUCIÓN; eso lo mira el
// E2E `tests/login-aterrizaje.spec.ts`, que entra de verdad con las tres identidades y compara la
// ruta EXACTA. Las dos juntas cubren la cadena; ninguna sola alcanza.
//
// Misma familia que `components/pantallas-auth.test.ts`, que ya vigila por fuente lo que ni el
// typecheck ni el lint pueden ver.

const RAIZ = new URL('../../../../', import.meta.url).pathname
const leer = (p: string) => readFileSync(RAIZ + p, 'utf8')
/** Sólo el código: un comentario que NOMBRA el ternario viejo para explicarlo no es el ternario. */
const codigo = (p: string) =>
  leer(p).split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n')

const ACCIONES = 'src/features/auth/services/actions.ts'
const FORMULARIO = 'src/features/auth/components/LoginForm.tsx'
const PANTALLA = 'src/app/(auth)/login/page.tsx'

// ── ESLABÓN 3 · LA ACCIÓN NO DECIDE SOLA

test('loginAction delega el destino en aterrizajeDeIngreso', () => {
  const src = codigo(ACCIONES)
  assert.match(
    src, /redirect\(\s*aterrizajeDeIngreso\(/,
    'loginAction ya no llama a aterrizajeDeIngreso: la regla quedó escrita y sin usar',
  )
})

test('loginAction LEE el volver del formulario', () => {
  // Sin esta línea el `?volver=` vuelve a ser un parámetro que nadie consume, que es como estaba
  // antes del 08/09/2026: el deep link se perdía en las tres identidades, medido.
  assert.match(
    codigo(ACCIONES), /formData\.get\('volver'\)/,
    'loginAction dejó de leer el volver: el deep link se pierde otra vez',
  )
})

test('NINGÚN destino de ingreso está escrito a mano en actions.ts', () => {
  // El defecto original, literal: `redirect(rol === 'campo' ? '/hoy' : '/obras')`. Y cualquier
  // variante — lo que se prohíbe es que la ACCIÓN elija una ruta de aterrizaje, venga con el ternario
  // o sin él.
  const src = codigo(ACCIONES)
  assert.doesNotMatch(
    src, /rol\s*===\s*'campo'/,
    'volvió el ternario del rol adentro de la acción: el aterrizaje se decide en aterrizaje.ts',
  )
  const rutas = [...src.matchAll(/redirect\(\s*'([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(
    rutas, ['/login?cerraste=1'],
    `redirect() con ruta escrita a mano: ${rutas.join(', ')}. La única admitida es la salida de `
      + 'logoutAction, que va a la puerta y no a un aterrizaje.',
  )
})

test('contrasenaNuevaAction usa la misma definición de inicio, no una propia', () => {
  // Es el otro camino que deja a alguien adentro: quien acaba de recuperar la contraseña ya tiene
  // sesión. Si acá se escribe otra ruta, hay dos inicios otra vez.
  assert.match(codigo(ACCIONES), /redirect\(\s*inicioDeRol\(/)
})

// ── ESLABÓN 2 · LA PANTALLA Y EL FORMULARIO LLEVAN EL `volver` HASTA LA ACCIÓN

test('la pantalla de login recibe el volver de la URL y se lo pasa al formulario', () => {
  const src = codigo(PANTALLA)
  // `[\s\S]` en vez del flag `s`: el target de TypeScript de este repo es anterior a es2018 y
  // `dotAll` no compila. Misma regla, sin depender de una opción del compilador.
  assert.match(src, /searchParams:\s*Promise<\{[\s\S]*volver\?/, 'la pantalla dejó de leer ?volver=')
  assert.match(src, /<LoginForm\s+volver=\{volver\}/, 'la pantalla no le pasa el volver al formulario')
})

test('el formulario manda el volver a la acción, y como campo oculto', () => {
  // Si viajara por la URL de la acción no llegaría: una Server Action se postea, no navega.
  assert.match(
    codigo(FORMULARIO), /type="hidden"\s+name="volver"/,
    'el formulario dejó de mandar el volver: la acción lo va a leer siempre vacío',
  )
})

// ── LA PUERTA DEL CLIENTE, EN LAS DOS DIRECCIONES

test('cada puerta enlaza a la otra: el cruce quedó cerrado en las dos direcciones', () => {
  assert.match(
    codigo(FORMULARIO), /href="\/portal\/login"/,
    'el login del OS dejó de ofrecerle el portal al cliente que se equivocó de puerta',
  )
  assert.match(
    codigo('src/app/portal/login/Formulario.tsx'), /href="\/login"/,
    'la puerta del cliente dejó de ofrecerle la salida a quien trabaja en Echegaray',
  )
})
