import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// LOS OBJETIVOS TÁCTILES DE LOS DOS PRODUCTOS DE TELÉFONO, MEDIDOS POR UNA REGLA.
//
// `LAYOUT_RESPONSIVE.md` §Mobile: *«Objetivos táctiles ≥44px (campos y primaria 48px)»*. Hasta hoy
// eso se cumplía por costumbre y se verificaba mirando una captura — que es exactamente la forma en
// que un `h-[32px]` se cuela en la pantalla que se usa parada, con guante y con una mano.
//
// ═══ POR QUÉ ES UNA REGLA SOBRE EL FUENTE Y NO SOBRE EL DOM ═══
//
// Medir el alto REAL exige un navegador, y el navegador ya mide otras cosas en
// `tests/design-v2-conformidad.spec.ts` (~15 min con la app levantada). Esta regla cuesta 20ms y
// caza el defecto donde se escribe: un alto declarado por debajo del piso. No reemplaza a la
// medición del navegador —un elemento sin alto declarado puede quedar corto igual— y por eso el
// límite se declara acá abajo en vez de dar el asunto por cerrado.
//
// ═══ QUÉ DEFECTO ATRAPA CADA UNA ═══
//
// 1. Un control interactivo con alto propio menor a 44 (el chip de 26px, el enlace de 16px).
// 2. Un `Boton`/`BotonEnlace` que se fija el alto por `className` en vez de por `tamano`. Es el bug
//    que `Boton.tsx` documenta: dos reglas de alto del mismo grupo compitiendo las ordena Tailwind,
//    no quien escribe, y el botón mide 48 «a veces». Pasó en los dos formularios de `/campo`.
// 3. Un destino tocable de `/campo` sin piso declarado: la migaja «← Campo» vivía sin alto y se
//    fallaba con el pulgar.

const RAIZ = new URL('../../..', import.meta.url).pathname
// 23/08/2026 · SE SUMA EL PERFIL EMPLEADO. Es el tercer producto de teléfono del OS y hasta hoy sus
// altos se cumplían por costumbre: el topbar de detalle, la flecha de volver de 48×48 y los tabs de
// 58px se escriben a mano, y un `h-[36px]` en cualquiera de los tres se ve bien en el navegador de
// escritorio y se falla con el pulgar en obra.
const PRODUCTOS = [
  'src/app/campo', 'src/app/(jefe)', 'src/features/jefe',
  'src/app/(empleado)', 'src/features/empleado',
]

/** Lo que se toca. `Boton`/`BotonEnlace` traen su alto del sistema y se miran en la regla 2. */
const INTERACTIVOS = ['a', 'button', 'input', 'select', 'textarea', 'Link']

const PISO = 44

function fuentes(dir: string): string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta))
    else if (nombre.endsWith('.tsx')) salida.push(ruta)
  }
  return salida
}

/** Los archivos partidos en «etiqueta que abre» + todo lo suyo hasta la etiqueta siguiente. Como
 *  cualquier hijo abre su propio trozo, las clases que aparecen acá son las de ESTA etiqueta. */
function etiquetas(fuente: string): { tag: string; cuerpo: string }[] {
  return fuente
    .split('<')
    .map((trozo) => ({ tag: (trozo.match(/^\/?([A-Za-z][\w.]*)/) ?? [])[1] ?? '', cuerpo: trozo }))
    .filter((x) => x.tag !== '')
}

/**
 * Los altos que una etiqueta se declara a sí misma **para el teléfono**, en px.
 *
 * Las variantes de punto de corte NO cuentan: `lg:h-[40px]` es la altura del control en escritorio,
 * donde el puntero es un mouse de un píxel y 40px es la medida del sistema. Exigirle 44 al escritorio
 * no protege ningún pulgar y empuja a la solución equivocada —agrandar el botón de la pantalla que
 * no se toca—. Por eso el alto sólo cuenta cuando abre clase, no cuando lo precede un `xx:`.
 */
function altos(cuerpo: string): number[] {
  if (!cuerpo.includes('className=')) return []
  const clases = cuerpo.slice(cuerpo.indexOf('className='))
  return [...clases.matchAll(/(?:^|[\s'"`])(?:min-)?h-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]))
}

const ARCHIVOS = PRODUCTOS.flatMap((p) => fuentes(join(RAIZ, p)))

test('NINGÚN CONTROL QUE SE TOCA DECLARA MENOS DE 44px de alto', () => {
  const chicos: string[] = []
  for (const ruta of ARCHIVOS) {
    for (const { tag, cuerpo } of etiquetas(readFileSync(ruta, 'utf8'))) {
      if (!INTERACTIVOS.includes(tag)) continue
      for (const alto of altos(cuerpo)) {
        if (alto < PISO) chicos.push(`${ruta.replace(RAIZ, '')}: <${tag}> declara ${alto}px`)
      }
    }
  }
  assert.deepEqual(chicos, [], `\n${chicos.join('\n')}\n`)
})

test('EL BOTÓN DEL SISTEMA NO SE FIJA EL ALTO POR `className`: lo pone `tamano`', () => {
  const pisados: string[] = []
  for (const ruta of ARCHIVOS) {
    for (const { tag, cuerpo } of etiquetas(readFileSync(ruta, 'utf8'))) {
      if (tag !== 'Boton' && tag !== 'BotonEnlace') continue
      if (altos(cuerpo).length > 0) {
        pisados.push(`${ruta.replace(RAIZ, '')}: <${tag}> se fija el alto por className`)
      }
    }
  }
  assert.deepEqual(pisados, [], `\n${pisados.join('\n')}\n`)
})

test('TODO DESTINO TOCABLE DE `/campo` DECLARA SU PISO — la migaja también', () => {
  const sinPiso: string[] = []
  for (const ruta of ARCHIVOS.filter((r) => r.includes('/app/campo/'))) {
    for (const { tag, cuerpo } of etiquetas(readFileSync(ruta, 'utf8'))) {
      // Los enlaces DENTRO de una oración (`underline`) no son destinos: son texto. El destino es
      // el que la pantalla nombra con un `data-testid`, que es lo que se toca y lo que se prueba.
      if (tag !== 'Link' && tag !== 'a') continue
      if (!cuerpo.includes('data-testid')) continue
      if (altos(cuerpo).length === 0) sinPiso.push(`${ruta.replace(RAIZ, '')}: <${tag}> sin alto declarado`)
    }
  }
  assert.deepEqual(sinPiso, [], `\n${sinPiso.join('\n')}\n`)
})
