// EL NOMBRE DE UNA PERSONA SE ESCRIBE EN UN SOLO LUGAR (dueño, 24/09/2026: «noto nombres distintos en
// distintas secciones de la app»). La regla y el porqué, en `nombre.ts`.
//
// Dos partes:
//   1. la función: lo que devuelve para los casos reales del plantel;
//   2. la fuente: ninguna pantalla vuelve a dibujar el legajo crudo, a leer `perfiles.nombre` para
//      decir «quién», ni a cortar un nombre por su cuenta. Si alguien lo hace, esto se pone rojo y
//      dice el archivo y la línea.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { diccionarioDeUsuarios, nombreDePersona, nombreDePersonaONull, nombreDePila, nombreDeUsuario, nombreLegal, SIN_NOMBRE } from './nombre.ts'

test('con la fila, manda el nombre para mostrar; sin él, el legajo (dueño 24/09: «Emiliano Maldonado»)', () => {
  const emi = { nombre_completo: 'MALDONADO BATISTA EMILIANO MIGUEL', nombre_para_mostrar: 'Emiliano Maldonado' }
  assert.equal(nombreDePersona(emi), 'Emiliano Maldonado')
  assert.equal(nombreDePersona({ ...emi, nombre_para_mostrar: '  ' }), 'Maldonado Batista Emiliano Miguel')
  assert.equal(nombreDePersona({ ...emi, nombre_para_mostrar: null }), 'Maldonado Batista Emiliano Miguel')
  assert.equal(nombreLegal(emi.nombre_completo), 'Maldonado Batista Emiliano Miguel', 'el legal sigue a mano para recibos y fichas')
  assert.equal(nombreDePersona({ nombre_completo: null, nombre_para_mostrar: null }), SIN_NOMBRE)
})

test('el legajo (sin nombre para mostrar) se escribe en oración y en su orden', () => {
  assert.equal(nombreDePersona('MALDONADO BATISTA EMILIANO MIGUEL'), 'Maldonado Batista Emiliano Miguel')
  assert.equal(nombreDePersona('NIEVAS VILLEGAS JUAN PABLO'), 'Nievas Villegas Juan Pablo')
  assert.equal(nombreDePersona('CORONA GUTIERREZ JORGE'), 'Corona Gutierrez Jorge')
  assert.equal(nombreDePersona('  GONZALEZ   TOBARES EMILIANO '), 'Gonzalez Tobares Emiliano')
  // Lo de la ex `nombreEnTitulo` de Obras sigue valiendo: partículas, guiones, lo ya escrito se respeta.
  assert.equal(nombreDePersona('JUAN DE LA FUENTE'), 'Juan de la Fuente')
  assert.equal(nombreDePersona('MARÍA DEL CARMEN PÉREZ Y GÓMEZ'), 'María del Carmen Pérez y Gómez')
  assert.equal(nombreDePersona('ÁNGEL GARCÍA-LÓPEZ'), 'Ángel García-López')
  assert.equal(nombreDePersona('Rubén Quiroga'), 'Rubén Quiroga')
  assert.equal(nombreDePersona(''), SIN_NOMBRE)
  assert.equal(nombreDePersona(null), SIN_NOMBRE)
  assert.equal(nombreDePersonaONull('  '), null)
})

test('un usuario con persona se llama como su persona; sin persona, como su cuenta; sin nada, se dice', () => {
  // `nombres_de_usuarios()` ya resolvió el vínculo en la base: acá llega el legajo o el nombre de la cuenta.
  const d = diccionarioDeUsuarios([
    { id: 'u-emi', nombre: 'MALDONADO BATISTA EMILIANO MIGUEL' },
    { id: 'u-sistema', nombre: 'Casilla de compras' },
    { id: 'u-vacio', nombre: null },
  ])
  assert.equal(d.get('u-emi'), 'Maldonado Batista Emiliano Miguel')
  assert.equal(d.get('u-sistema'), 'Casilla de compras')
  assert.equal(d.has('u-vacio'), false)
  assert.equal(nombreDeUsuario(null, 'compras@ecsas.com.ar'), 'compras')
  assert.equal(nombreDeUsuario(null, null), 'alguien')
})

test('el saludo usa el nombre de pila de la cuenta, nunca la primera palabra del legajo (un apellido)', () => {
  assert.equal(nombreDePila('Jorge Corona Gutierrez'), 'Jorge')
  assert.equal(nombreDePila(null, 'hys@ecsas.com.ar'), 'Hys')
  assert.equal(nombreDePila(null, null), '')
})

// ─── La fuente ────────────────────────────────────────────────────────────────────────────────────

const SRC = new URL('../../', import.meta.url).pathname
const PROPIOS = new Set(['shared/personas/nombre.ts', 'shared/personas/nombresDeUsuarios.ts'])
// El portal del cliente lo trabaja otro frente (y no muestra personas del plantel).
const FUERA = /^(app\/portal|features\/portal)\//

const archivos = (): string[] =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !PROPIOS.has(f) && !FUERA.test(f))

/** [archivo:línea] de cada renglón que cumple `re` y no lleva `salvo`. */
function hallazgos(re: RegExp, salvo?: RegExp, soloEn?: (f: string) => boolean): string[] {
  const out: string[] = []
  for (const f of archivos()) {
    if (soloEn && !soloEn(f)) continue
    readFileSync(join(SRC, f), 'utf8').split('\n').forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return
      // `defaultValue=` edita el legajo (el dato, no su dibujo); `// crudo:` es la excepción declarada.
      if (/defaultValue=|\/\/ crudo:/.test(l)) return
      if (re.test(l) && !(salvo && salvo.test(l))) out.push(`${f}:${i + 1}  ${l.trim().slice(0, 110)}`)
    })
  }
  return out
}

const FORMATEA = /nombreDePersona(ONull)?\(|nombreDeUsuario\(/

test('ninguna pantalla dibuja el legajo crudo: `{x.nombre_completo}` pasa por nombreDePersona', () => {
  const crudos = hallazgos(/\{\s*[\w.?!]*\.nombre_completo\s*(\?\?[^}]*)?\}|\$\{\s*[\w.?!]*\.nombre_completo\s*\}/, FORMATEA,
    (f) => f.endsWith('.tsx'))
  assert.deepEqual(crudos, [], 'legajo dibujado sin nombreDePersona')
})

test('ningún servicio publica el legajo crudo como «nombre» de una persona', () => {
  const crudos = hallazgos(/\bnombre\s*:\s*(String\()?[\w.?!]*\.nombre_completo\b/, FORMATEA)
  assert.deepEqual(crudos, [], 'nombre: x.nombre_completo sin nombreDePersona')
})

test('nadie formatea un nombre por su cuenta: ni oracion() sobre el legajo, ni cortes, ni otro nombreCorto', () => {
  assert.deepEqual(hallazgos(/oracion\([^)]*nombre_completo/), [], 'oracion(nombre_completo): usar nombreDePersona')
  // Pasarle el legajo SUELTO saltea el nombre para mostrar: se le pasa la fila (o nombreLegal si se
  // quiere el nombre legal a propósito).
  assert.deepEqual(hallazgos(/nombreDePersona(ONull)?\([\w.?!]*\.nombre_completo\b/), [], 'nombreDePersona(x.nombre_completo): pasar la fila x')
  assert.deepEqual(hallazgos(/(function|const)\s+(nombreCorto|nombreEnTitulo|nombreParaMostrar|primerNombre|nombreDePila|nombreDePersona)\b\s*[=(]/), [],
    'formateador de nombres propio')
  assert.deepEqual(hallazgos(/nombre[\w?.]*\)?\.split\((' '|\/\\s\+\/)\)(\[0\]|\.slice\(-1\))/), [], 'corte de un nombre a mano')
})

test('«quién» se lee por el vínculo usuario → persona (nombres_de_usuarios), no de `perfiles.nombre`', () => {
  // Las que quedan leen o escriben la CUENTA misma (su edición, la propia sesión, el portal), no
  // ponen el nombre de alguien al lado de lo que hizo.
  const PERMITIDOS = new Set([
    'features/usuarios/services/usuariosActions.ts',   // edita perfiles.nombre
    'features/usuarios/services/usuariosService.ts',   // la pantalla de cuentas: muestra y edita la cuenta
    'features/mi-cuenta/services/miCuentaService.ts',  // el perfil propio
    'features/mi-cuenta/services/actions.ts',          // el perfil propio
    'features/administracion/services/accesoService.ts', // la cuenta de ESTA persona, en su ficha
    'app/api/xsas/route.ts',                           // el actor que se le pasa al OS
  ])
  const sueltos = hallazgos(/from\('perfiles'\)\s*\.select\('[^']*\bnombre\b/, undefined, (f) => !PERMITIDOS.has(f))
  assert.deepEqual(sueltos, [], 'lectura de perfiles.nombre para decir quién: usar nombresDeUsuarios()')
})
