import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// EL PORTAL EMITE LOS DOS ÁRBOLES — EL CSS TIENE QUE APAGAR UNO. REGLA SOBRE EL FUENTE.
//
// `29` (1280) y `30` (390) son la misma pantalla con otra composición, y el componente emite las
// dos: elegir en JavaScript exige medir la ventana, que sólo se sabe en el navegador, y el servidor
// mandaría un árbol y el cliente otro.
//
// El defecto que esto atrapa es el modo de fallar de ese diseño: si la media query no apaga, la
// pantalla muestra LAS DOS versiones, una debajo de la otra — el portal duplicado, con dos barras de
// navegación y dos listas de certificados. Y como los bloques llevan `display:flex` INLINE (copiado
// del mockup), la regla que los apaga NECESITA `!important`: sin él, el estilo inline gana y el
// efecto es exactamente el mismo. Las dos condiciones se miden acá.
//
// Es una regla sobre el fuente, como `canon/grilla-en-telefono.test.ts`: medir el corte de verdad
// exige navegador y dos viewports y tarda minutos; esto cuesta milisegundos y caza el defecto donde
// se escribe. NO prueba que a 390 se vea bien — eso lo prueba un navegador, y queda declarado.

const RAIZ = new URL('../../../..', import.meta.url).pathname
const CSS = join(RAIZ, 'src/app/(portal)/portal.css')
const COMPONENTES = join(RAIZ, 'src/features/portal/components')

const css = readFileSync(CSS, 'utf8')
const sinEspacios = (s: string) => s.replace(/\s+/g, '')

test('la media query del teléfono apaga el árbol de escritorio, con !important', () => {
  const bloque = css.match(/@media \(max-width: 899px\) \{([\s\S]*?)\n\}/)
  assert.ok(bloque, 'no está el corte de 899px: el teléfono dibujaría también la pantalla de 1280')
  assert.ok(
    sinEspacios(bloque[1]).includes('.portal-escritorio{display:none!important;}'),
    'sin `!important` el `display:flex` inline del bloque gana y el portal se dibuja dos veces',
  )
})

test('la media query del escritorio apaga el árbol del teléfono, con !important', () => {
  const bloque = css.match(/@media \(min-width: 900px\) \{([\s\S]*?)\n\}/)
  assert.ok(bloque, 'no está el corte de 900px')
  assert.ok(
    sinEspacios(bloque[1]).includes('.portal-movil{display:none!important;}'),
    'sin `!important` el `display:flex` inline de la barra de abajo gana y aparece en el escritorio',
  )
})

test('el portal sigue emitiendo LAS DOS composiciones', () => {
  const shell = readFileSync(join(COMPONENTES, 'PortalCliente.tsx'), 'utf8')
  assert.ok(shell.includes('portal-escritorio'), 'se perdió el árbol del 29')
  assert.ok(shell.includes('portal-movil'), 'se perdió el árbol del 30')
})

test('toda clase `portal-…` que usan los componentes está definida en portal.css', () => {
  // El defecto: renombrar una clase en el CSS y dejar el TSX con la vieja. El bloque no se apaga
  // nunca y nadie lo ve hasta que alguien abre el portal en un teléfono.
  const usadas = new Set<string>()
  for (const nombre of readdirSync(COMPONENTES)) {
    if (!nombre.endsWith('.tsx')) continue
    const src = readFileSync(join(COMPONENTES, nombre), 'utf8')
    for (const m of src.matchAll(/className="([^"]*)"/g)) {
      for (const clase of m[1].split(/\s+/)) if (clase.startsWith('portal-')) usadas.add(clase)
    }
  }
  assert.ok(usadas.size >= 4, `se esperaban las clases del porte y hay ${usadas.size}`)
  for (const clase of usadas) {
    assert.ok(css.includes(`.${clase}`), `\`${clase}\` se usa en un componente y no existe en portal.css`)
  }
})
