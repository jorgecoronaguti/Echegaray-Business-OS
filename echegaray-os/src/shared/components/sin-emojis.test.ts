import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

// «NUNCA EMOJIS» — EL CRITERIO DE ACEPTACIÓN DEL PASO 1, COMO CONTROL QUE CORRE.
//
// El §11 del Design System lo dice en una línea: «Una acción = un icono en toda la plataforma. El
// stack NO usa librería: los dibuja a mano. Trazo 1.6, viewBox 24×24, currentColor. Nunca emojis.»
// Y la razón no es estética: un emoji lo dibuja cada sistema operativo a su manera, cambia de color
// solo, no hereda el token de texto y no se puede alinear con una tipografía tabular.
//
// Este test existe porque el criterio ya se había cumplido y se volvió a romper. Medido el
// 25/08/2026 sobre `src/`: siete archivos habían vuelto a poner un emoji en el JSX —💵 en el título
// de «Cargar saldo», 📅 en el Calendario, 📄 en Reportes, 🔎 en el chip de sugerencia, 🔧 y 📦 como
// `icon` de una fila, y seis emojis distintos codificando las categorías de confianza de un
// reporte, que nadie decodifica. Todos tenían su icono ya dibujado en `shared/components/iconos.tsx`.
//
// LO QUE ESTE TEST NO PRUEBA: que el icono elegido sea el correcto para esa acción («una acción = un
// icono» no lo verifica una expresión regular), ni que la pantalla se vea bien. Prueba una sola
// cosa, la que se cuela sola en un refactor: que no vuelva a entrar un pictograma al JSX.

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** El rango pictográfico de Unicode. Deja afuera a propósito los símbolos tipográficos que el OS sí
 *  usa —✓ ✔ ▲ △ ○ ◔ ≈ · — que no son emojis: son glifos de la fuente, heredan color y tamaño. */
const PICTOGRAMA = /[\u{1F300}-\u{1FAFF}\u{1F004}-\u{1F0CF}]/u

function tsx(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada.startsWith('.')) continue
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) tsx(ruta, salida)
    else if (entrada.endsWith('.tsx')) salida.push(ruta)
  }
  return salida
}

/**
 * El código de un archivo, sin sus comentarios: documentar QUÉ emoji se quitó es correcto y no es
 * JSX — este mismo test lo hace en su cabecera.
 *
 * Recorre el archivo llevando el estado del bloque abierto en vez de mirar cada línea suelta. La
 * versión ingenua —«cortar en el primer `//` o `*`»— sólo ve la línea que ABRE el comentario y
 * delata las de continuación, que no empiezan con nada. Se descubrió acusando al comentario de
 * `ReporteVista.tsx` que enumera los seis emojis que ese archivo dejó de usar.
 */
function soloCodigo(fuente: string): string[] {
  const salida: string[] = []
  let enBloque = false
  for (const linea of fuente.split('\n')) {
    let visible = ''
    for (let i = 0; i < linea.length; i++) {
      if (enBloque) {
        if (linea.startsWith('*/', i)) { enBloque = false; i++ }
      } else if (linea.startsWith('/*', i)) { enBloque = true; i++ }
      else if (linea.startsWith('//', i)) break
      else visible += linea[i]
    }
    salida.push(visible)
  }
  return salida
}

test('ningún .tsx del OS tiene un emoji fuera de un comentario', () => {
  const culpables: string[] = []
  for (const archivo of tsx(join(RAIZ, 'src'))) {
    const fuente = readFileSync(archivo, 'utf8')
    const codigo = soloCodigo(fuente)
    const originales = fuente.split('\n')
    for (let i = 0; i < codigo.length; i++) {
      if (PICTOGRAMA.test(codigo[i])) {
        culpables.push(`${relative(RAIZ, archivo)}:${i + 1}  ${originales[i].trim().slice(0, 90)}`)
      }
    }
  }
  assert.deepEqual(
    culpables, [],
    `Emoji en JSX. Usá el icono canónico de '@/shared/components/iconos':\n${culpables.join('\n')}`,
  )
})

test('el test se pondría rojo con un emoji de verdad (si no, no prueba nada)', () => {
  const delata = (fuente: string) => soloCodigo(fuente).some((l) => PICTOGRAMA.test(l))
  assert.ok(delata('<span>📦</span>'))
  assert.ok(delata('icon="🔧"'))
  assert.ok(!delata('// antes decía 📦'), 'la línea de comentario no se mira')
  assert.ok(!delata('{/* el bloque JSX\n    de varias líneas: ✅ 🧮 ⏰\n    tampoco */}'),
    'la continuación de un bloque tampoco — es el falso positivo que rompió la primera versión')
  assert.ok(delata('{/* cerrado */} <span>📦</span>'), 'lo que viene DESPUÉS del cierre sí se mira')
  assert.ok(!delata('<span>✓ Pagado</span>'), 'el tilde tipográfico no es un emoji')
  assert.ok(!delata('<span>▲ Vencido · △ Por vencer · ○ Vigente</span>'))
})
