import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// LAS PANTALLAS SIN SESIÓN USAN EL DESIGN SYSTEM — medido, no recordado.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// Hasta el 23/08/2026 el login dibujaba su primaria con `bg-black text-white` y sus campos con
// `rounded border px-3 py-2`. No se veía roto: se veía como otra aplicación. Y era la PRIMERA
// pantalla del sistema, o sea la que enseña de qué color es la acción — negro acá, amarillo de
// marca en las otras 42.
//
// Ese defecto es invisible para `typecheck` y para `eslint`, y la prueba de conformidad visual
// (`tests/design-v2-conformidad.spec.ts`) NO puede verlo: entra con sesión, y con sesión `/login`
// redirige. O sea que las cuatro pantallas sin sesión son justamente las que ninguna regla mira.
// Ésta las mira.
//
// ═══ POR QUÉ LEE LA FUENTE Y NO EL DOM ═══
//
// Medir el color renderizado exigiría un navegador y un servidor levantado. Lo que se quiere
// prohibir es la CLASE cruda, que está en el texto del archivo: la regla es exacta para eso y
// cuesta milisegundos. Revertir cualquiera de los cuatro archivos a `bg-black` pone esto en rojo.
//
// LÍMITE DECLARADO: esto prueba que la clase prohibida no está y que el control del DS sí está. No
// prueba el píxel renderizado — eso lo tiene que mirar alguien con la pantalla delante.

const DIR = new URL('.', import.meta.url).pathname

/** Los formularios de las cuatro rutas sin sesión: login, alta, recuperar, contraseña nueva. */
const FORMULARIOS = readdirSync(DIR).filter((n) => n.endsWith('Form.tsx'))

// Clases de utilidad que afirman un color o una medida FUERA de los tokens del OS. `bg-black` y
// `text-white` sueltas son el caso concreto que ya pasó; los rojos y grises de Tailwind son el
// mismo error con otro nombre — el rojo del OS es #B42318 y vive en `text-neg` porque es el mismo
// rojo del impedimento de obra.
const PROHIBIDAS = [
  /\bbg-black\b/,
  /\btext-red-\d/,
  /\btext-gray-\d/,
  /\bbg-gray-\d/,
  // `rounded border` a secas: radio y borde por defecto de Tailwind en vez de `rounded-control` +
  // `border-line-strong`, que es lo que dibuja un campo en el resto del OS.
  /className="rounded border/,
]

test('hay cuatro formularios sin sesión que mirar', () => {
  // Si alguien los renombra o los mueve, las reglas de abajo pasarían en verde sin mirar nada.
  assert.equal(
    FORMULARIOS.length, 4,
    `se encontraron ${FORMULARIOS.length} formularios sin sesión: ${FORMULARIOS.join(', ')}`,
  )
})

test('ninguna pantalla sin sesión inventa su propio color ni su propio borde', () => {
  const fallas: string[] = []
  for (const archivo of FORMULARIOS) {
    const fuente = readFileSync(join(DIR, archivo), 'utf8')
    for (const patron of PROHIBIDAS) {
      // El comentario de cabecera de cada archivo NOMBRA la clase vieja para explicar qué se
      // arregló. Se mira sólo el código: las líneas que empiezan con `//` no dibujan nada.
      const codigo = fuente.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')
      if (patron.test(codigo)) fallas.push(`${archivo}: ${patron}`)
    }
  }
  assert.deepEqual(fallas, [], `\n${fallas.join('\n')}\n`)
})

test('la primaria de cada pantalla sin sesión es la del design system, a 52px', () => {
  const fallas: string[] = []
  for (const archivo of FORMULARIOS) {
    const fuente = readFileSync(join(DIR, archivo), 'utf8')
    // Un `<button type="submit">` escrito a mano es exactamente cómo volvería el `bg-black`.
    if (/<button[^>]*type="submit"/.test(fuente)) fallas.push(`${archivo}: la primaria no es <Boton>`)
    if (!/tamano="acceso"/.test(fuente)) fallas.push(`${archivo}: la primaria no usa el tamaño acceso (52px)`)
    if (!/variante="primaria"/.test(fuente)) fallas.push(`${archivo}: la primaria no es la amarilla de marca`)
  }
  assert.deepEqual(fallas, [], `\n${fallas.join('\n')}\n`)
})

test('los campos sin sesión usan CAMPO del design system', () => {
  const fallas: string[] = []
  for (const archivo of FORMULARIOS) {
    const fuente = readFileSync(join(DIR, archivo), 'utf8')
    if (!/className=\{CAMPO\}/.test(fuente)) fallas.push(`${archivo}: los campos no usan CAMPO`)
  }
  assert.deepEqual(fallas, [], `\n${fallas.join('\n')}\n`)
})
