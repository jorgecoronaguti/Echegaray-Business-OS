import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { hrefDeAsistencia } from '../services/vistaDeAsistencia.ts'

// ═══ EL RECORTE POR CATEGORÍA EN LAS TRES SOLAPAS (dueño, 17/09/2026) ═══
//
// *«necesito en todo el módulo personal, filtro por categoría de empleados»*. «Todo el módulo» es la
// condición, no un detalle: un filtro que existe en una solapa y no en las otras dos obliga a volver
// al Plantel para contestar la misma pregunta.
//
// Mismo método que `filtroDeObraEnPlantel.test.ts`: acá se protegen DECISIONES ESCRITAS —qué control
// se usa, dónde está montado, de dónde sale cada enlace—. La REGLA del recorte se prueba de verdad,
// sobre las funciones puras, en `services/recorteDeCategoria.test.ts`.
//
// LO QUE ESTE TEST NO PRUEBA: que la fila se vea bien en un navegador ni que entre en 390px. Eso se
// mira con un navegador real, y hace falta mirarlo.

const DIR = dirname(fileURLToPath(import.meta.url))
const leer = (rel: string) => readFileSync(join(DIR, rel), 'utf8')

/** El archivo SIN sus comentarios: acá se pregunta «¿usa X?» y los comentarios explican por qué NO
 *  se usa X — o sea que nombran justo lo que se está prohibiendo. */
const sinComentarios = (texto: string) => texto
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*'))
  })
  .join('\n')

const control = () => sinComentarios(leer('FiltroDeCategoria.tsx'))
const plantel = () => sinComentarios(leer('../../../app/(main)/administracion/personas/page.tsx'))
const horas = () => sinComentarios(leer('BloqueAsistenciaQuincena.tsx'))
const liquidacion = () => sinComentarios(leer('liquidacion/solapas/quincena.tsx'))

test('las tres solapas montan EL MISMO control, no una fila propia cada una', () => {
  // EL DEFECTO QUE ATRAPA: con la fila escrita tres veces, la que se olvide de una lección —que la
  // elegida siempre tenga su pastilla, que el clic en la activa la apague— se comporta distinto en la
  // solapa de al lado, y el dueño tiene que aprender tres filtros para un solo recorte.
  for (const [donde, fuente] of [['Plantel', plantel()], ['Horas', horas()], ['Liquidación', liquidacion()]] as const) {
    assert.match(fuente, /<FiltroDeCategoria/, `la solapa ${donde} se quedó sin el recorte por categoría`)
  }
})

test('la fila usa el control compartido de la pantalla y no dibuja su propia pastilla', () => {
  const c = control()
  assert.match(c, /<FiltrosSuaves/, 'dejó de usar FiltrosSuaves: otro lenguaje visual para el mismo gesto')
  assert.doesNotMatch(c, /#[0-9A-Fa-f]{3,8}\b/, 'apareció un color suelto: los colores salen de los tokens')
  // NI UN DESPLEGABLE: con cinco categorías, un `select` esconde detrás de un clic lo que la pastilla
  // ya publica —cuánta gente hay en cada una—, que es lo que se mira ANTES de elegir.
  assert.doesNotMatch(c, /<select|<Select/)
})

test('el recorte vive en la URL: ningún enlace se arma a mano y no hay estado de navegador', () => {
  // EL DEFECTO: un chip con `onClick` guarda el recorte en el navegador —no se comparte por mensaje,
  // no sobrevive a recargar, no vuelve con el botón de atrás—, y en un Server Component tumba la
  // página en producción (React #419).
  const c = control()
  assert.doesNotMatch(c, /onClick|useState|'use client'/)
  assert.equal((c.match(/href:/g) ?? []).length, (c.match(/href: hrefDe\(\{/g) ?? []).length)
  // «TODAS» BORRA EL PARÁMETRO, y la pastilla activa apretada de nuevo también: es la convención de
  // esta pantalla (`enlaceDeVista.ts`), y sin ella el único camino de vuelta es editar la URL.
  assert.match(c, /href: hrefDe\(\{ categoria: undefined \}\)/)
  assert.match(c, /c\.clave === elegida \? undefined : c\.clave/)
})

test('el recorte sobrevive al cambio de solapa: las tres puertas lo llevan', () => {
  // EL DEFECTO YA PAGADO (10/09/2026, `vistaDeAsistencia.ts`): los enlaces entre solapas escriben la
  // URL desde cero, así que un recorte que no entre en esa lista dura hasta el primer clic.
  const p = plantel()
  assert.match(p, /armarHref\(\{ categoria \}\)/, 'la puerta al Plantel perdió la categoría')
  assert.match(p, /hrefAsistencia\(quincena, categoria\)/, 'la puerta a Horas perdió la categoría')
  assert.match(p, /hrefLiquidacion\(quincena, categoria\)/, 'la puerta a Liquidación perdió la categoría')
  // Y CADA SOLAPA LA CONSERVA AL MOVERSE DENTRO DE SÍ MISMA (quincena, obra, buscador).
  assert.match(p, /categoria: base\.categoria/)
})

test('dentro de Horas, la categoría se conserva y un valor vacío la borra', () => {
  // Comportamiento real, no fuente: es la convención de toda la pantalla —`undefined` apaga el
  // filtro con el mismo enlace que lo prendió— y la que hace que un enlace pegado en el chat
  // reproduzca la vista.
  const base = { quincena: '2026-09-16', obra: 'SF - PISOS', categoria: 'oficial' }
  assert.equal(
    hrefDeAsistencia('/administracion/personas', base, { quincena: '2026-09-01' }),
    '/administracion/personas?vista=asistencia&quincena=2026-09-01&obra=SF+-+PISOS&categoria=oficial',
  )
  assert.equal(
    hrefDeAsistencia('/administracion/personas', base, { categoria: undefined }),
    '/administracion/personas?vista=asistencia&quincena=2026-09-16&obra=SF+-+PISOS',
  )
  // SIN CATEGORÍA PUESTA, LA URL QUEDA IDÉNTICA A LA DE ANTES DE ESTE CAMBIO: el orden de las claves
  // es parte del contrato —estas URLs se comparan literales y se comparten por mensaje—.
  assert.equal(
    hrefDeAsistencia('/administracion/personas', { quincena: '2026-09-16' }, {}),
    '/administracion/personas?vista=asistencia&quincena=2026-09-16',
  )
})

test('los totales de Horas y de Liquidación siguen al recorte, no al plantel entero', () => {
  // EL DEFECTO QUE ATRAPA (pedido del dueño, punto 4): «si el cuadro muestra 6 de 17, el total NO
  // puede seguir sumando 17 en silencio». El pie de Horas se calcula sobre `paraElPie` y el de
  // Liquidación sobre `visibles`: los dos tienen que pasar por el recorte.
  assert.match(horas(), /const paraElPie = filtrarPorCategoria\(/)
  assert.match(horas(), /rotuloTotal=\{partesDelTotal/, 'el total dejó de decir de quién es')
  assert.match(liquidacion(), /const visibles = filtrarPorCategoria\(/)
  // Y LA PANTALLA LO DICE EN UNA LÍNEA, sólo con el recorte puesto.
  assert.match(horas(), /nota="El total y los totales por día son los del recorte\."/)
  assert.match(liquidacion(), /nota="Los totales de los cuadros y el general son los del recorte\."/)
})
