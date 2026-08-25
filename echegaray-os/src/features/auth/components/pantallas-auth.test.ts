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

test('la primaria de cada pantalla sin sesión es AMARILLA DE MARCA, venga de donde venga', () => {
  // ═══ CAMBIO DE REGLA, 24/08/2026 — el mockup gana ═══
  //
  // Esta regla exigía `<Boton variante="primaria" tamano="acceso">` del design system de
  // escritorio. `M01 · Login.dc.html` mide la primaria en `minHeight:56` con `background:#FDC900`
  // y su propio icono adentro; el `Boton` del DS no dibuja eso, así que `LoginForm` la porta con
  // los tokens del teléfono (`C.marca`, `R.control`).
  //
  // Lo que la regla PROTEGE no cambió: que ninguna de las cuatro pantallas sin sesión invente el
  // color de su acción. Antes eso se comprobaba pidiendo el componente; ahora se comprueba pidiendo
  // el TOKEN — `variante="primaria"` (el DS) o `C.marca` (el kit del teléfono). Un `bg-black`
  // vuelve a poner esto en rojo, que es el defecto que costó la entrega del 23/08.
  const fallas: string[] = []
  for (const archivo of FORMULARIOS) {
    const fuente = readFileSync(join(DIR, archivo), 'utf8')
    const conDS = /variante="primaria"/.test(fuente) && /tamano="acceso"/.test(fuente)
    const conTokens = /C\.marca/.test(fuente)
    if (!conDS && !conTokens) {
      fallas.push(`${archivo}: la primaria no usa ni el Boton del DS ni el amarillo de marca`)
    }
    // Un `<button type="submit">` con su color escrito a mano es exactamente cómo volvería el
    // `bg-black`. Se permite el botón propio SÓLO si el amarillo sale del token.
    if (/<button[^>]*type="submit"/.test(fuente) && !conTokens) {
      fallas.push(`${archivo}: primaria escrita a mano sin el token de marca`)
    }
  }
  assert.deepEqual(fallas, [], `\n${fallas.join('\n')}\n`)
})

test('los campos sin sesión no inventan su borde: DS o tokens del teléfono', () => {
  // Misma razón que arriba. `M01 · Login.dc.html` dibuja el campo como una caja de
  // `1.5px solid` con radio 12 y el `input` SIN borde propio; `CAMPO` del DS es otra cosa (34px,
  // borde en el input). Se acepta cualquiera de las dos, y se sigue prohibiendo el borde inventado.
  const fallas: string[] = []
  for (const archivo of FORMULARIOS) {
    const fuente = readFileSync(join(DIR, archivo), 'utf8')
    const conDS = /className=\{CAMPO\}/.test(fuente)
    const conTokens = /C\.linea/.test(fuente)
    if (!conDS && !conTokens) fallas.push(`${archivo}: los campos no usan CAMPO ni los tokens del teléfono`)
  }
  assert.deepEqual(fallas, [], `\n${fallas.join('\n')}\n`)
})

test('NINGÚN COLOR ESCRITO A MANO en las pantallas sin sesión', () => {
  // La regla nueva que reemplaza a «usá el componente»: el color puede venir de una clase del DS o
  // de una constante de `shared/components/movil/tokens`, pero NUNCA de un `#RRGGBB` tipeado en el
  // archivo. Ése es el mecanismo exacto por el que la primera pantalla del sistema terminó de otro
  // color que las 42 restantes — y ahora que el porte es con estilos en línea, es más fácil que antes.
  const fallas: string[] = []
  for (const archivo of FORMULARIOS) {
    const codigo = readFileSync(join(DIR, archivo), 'utf8')
      .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')
    const hex = codigo.match(/#[0-9A-Fa-f]{6}\b/g)
    if (hex) fallas.push(`${archivo}: color escrito a mano ${[...new Set(hex)].join(', ')}`)
  }
  assert.deepEqual(fallas, [], `\n${fallas.join('\n')}\n`)
})
