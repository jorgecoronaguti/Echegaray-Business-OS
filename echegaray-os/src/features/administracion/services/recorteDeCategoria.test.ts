import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cajonDeCategoria, categoriasDelCorte, estaEnLaCategoria, filtrarPorCategoria, fueraDelConvenio,
  FUERA_DE_CONVENIO, SIN_CATEGORIA,
} from './recorteDeCategoria.ts'
import { categoriaVisible } from './vocabularioPersona.ts'

// EL RECORTE POR CATEGORÍA DEL MÓDULO PERSONAL (dueño, 17/09/2026) — la REGLA, sin React y sin base.
//
// Cada prueba nombra el defecto que atrapa. La regla es una sola para las tres solapas: si alguna se
// pusiera a decidir por su cuenta, «Oficial 8» en el Plantel y «Oficial 6» en Horas serían dos
// respuestas al mismo hecho.

/** El plantel activo medido en la base el 17/09/2026, reducido a lo que la regla mira. */
const PLANTEL = [
  { categoria: 'ayudante', puesto: null },
  { categoria: 'ayudante', puesto: null },
  { categoria: 'oficial', puesto: null },
  { categoria: 'medio_oficial', puesto: null },
  { categoria: 'oficial_especializado', puesto: 'JEFE DE OBRA' },
  { categoria: 'oficial_especializado', puesto: null },
]

test('quien no tiene categoría cargada no desaparece: tiene su cajón y su palabra', () => {
  // EL DEFECTO: un filtro construido sobre las categorías presentes deja fuera al que no tiene
  // ninguna. Esas personas quedan invisibles en la única pantalla donde se las podía encontrar para
  // cargarles el dato —17 de los 57 inactivos están así el 17/09/2026—, y ningún número lo dice.
  const filas = [...PLANTEL, { categoria: null, puesto: null }]
  const chips = categoriasDelCorte(filas)
  const sin = chips.find((c) => c.clave === SIN_CATEGORIA)
  assert.ok(sin, 'se perdió el cajón de los que no tienen categoría cargada')
  assert.equal(sin.cuenta, 1)
  assert.equal(sin.etiqueta, 'Sin categoría')
  assert.deepEqual(filtrarPorCategoria(filas, SIN_CATEGORIA), [{ categoria: null, puesto: null }])
})

test('no se inventa una categoría: sin el dato, el cajón es la ausencia y no una del convenio', () => {
  assert.equal(cajonDeCategoria({ categoria: null, puesto: null }), null)
  assert.equal(cajonDeCategoria({ categoria: '   ', puesto: null }), null)
  // Y «Sin categoría» NO es el mismo cajón que «Ayudante»: el que no tiene dato no cae en la más baja.
  assert.equal(estaEnLaCategoria({ categoria: null }, 'ayudante'), false)
})

test('dos grafías de la misma categoría caen en UNA pastilla, no en dos', () => {
  // EL DEFECTO: la nómina escribe «OFICIAL», «Oficial» y `oficial` para el mismo puesto. Sin
  // normalizar, el filtro abre tres puertas al mismo grupo y ninguna de las tres las contiene a todas.
  const chips = categoriasDelCorte([
    { categoria: 'OFICIAL' }, { categoria: 'Oficial' }, { categoria: 'oficial' },
  ])
  assert.equal(chips.length, 1)
  assert.equal(chips[0].clave, 'oficial')
  assert.equal(chips[0].cuenta, 3)
})

test('la pastilla dice EXACTAMENTE lo que dice la celda de la fila', () => {
  // EL DEFECTO: la columna CATEGORÍA escribe `categoriaVisible`. Si la pastilla rotulara con otro
  // diccionario, un código mal importado («1591», que la base real tuvo) se vería de una forma en la
  // fila y de otra en el filtro — o desaparecería del filtro y su gente quedaría sin puerta.
  const fila = { categoria: '1591', puesto: null }
  const chips = categoriasDelCorte([fila])
  assert.equal(chips[0].etiqueta, categoriaVisible(fila.categoria, fila.puesto))
  assert.equal(chips[0].etiqueta, '1591')
  assert.deepEqual(filtrarPorCategoria([fila, { categoria: 'oficial' }], chips[0].clave), [fila])
})

test('una categoría disfrazada de puesto entra al mismo cajón que la celda publica', () => {
  // EL DEFECTO: `personas.puesto` es texto libre y a veces trae la categoría («OFICIAL»). La celda ya
  // la rescata (`categoriaVisible`); si el filtro no lo hiciera, esa fila diría «Oficial» y no
  // entraría al recorte «Oficial» — la pastilla contradiciendo a la fila que está debajo.
  const fila = { categoria: null, puesto: 'OFICIAL' }
  assert.equal(cajonDeCategoria(fila), 'oficial')
  assert.deepEqual(filtrarPorCategoria([fila], 'oficial'), [fila])
  // Y un puesto que NO es una categoría no inventa una: el jefe de obra no es un cajón del convenio.
  assert.equal(cajonDeCategoria({ categoria: null, puesto: 'JEFE DE OBRA' }), null)
})

test('el jefe de obra suma en «Fuera de convenio» SIN salir de la categoría que su fila muestra', () => {
  // EL DEFECTO, MEDIDO: los dos jefes activos tienen `categoria = oficial_especializado` cargada y su
  // fila la publica. Sacarlos de esa pastilla para meterlos en otra haría que «Oficial especializado
  // · 1» apareciera arriba de una tabla con dos filas que dicen «Oficial especializado». Y no
  // ofrecerlos bajo su palabra los dejaría sin la puerta que el dueño pidió.
  const chips = categoriasDelCorte(PLANTEL)
  assert.equal(chips.find((c) => c.clave === 'oficial_especializado')?.cuenta, 2)
  assert.equal(chips.find((c) => c.clave === FUERA_DE_CONVENIO)?.cuenta, 1)
  assert.equal(filtrarPorCategoria(PLANTEL, 'oficial_especializado').length, 2)
  assert.equal(filtrarPorCategoria(PLANTEL, FUERA_DE_CONVENIO).length, 1)
  // El mensual de oficina entra por `cobraPorMes`, que es lo que sabe cada solapa por su lado.
  assert.equal(fueraDelConvenio({ categoria: null, cobraPorMes: true }), true)
  // Y SIN EL DATO, NADIE: la ausencia de dato no se distingue de la negativa.
  assert.equal(fueraDelConvenio({ categoria: 'oficial' }), false)
})

test('una pastilla nunca promete cero filas… salvo la que está puesta, que hay que poder apagar', () => {
  // EL DEFECTO (lección del 11/09/2026 en la grilla de Horas): la categoría elegida deja de alcanzar a
  // alguien al cambiar de corte o de quincena; si su pastilla desaparece, el recorte queda puesto sin
  // nada que apretar para sacarlo y la tabla se ve vacía sin ninguna señal de qué la está recortando.
  const sinJefes = [{ categoria: 'oficial', puesto: null }]
  assert.equal(categoriasDelCorte(sinJefes).some((c) => c.clave === FUERA_DE_CONVENIO), false)
  const conLaPuesta = categoriasDelCorte(sinJefes, 'ayudante')
  const puesta = conLaPuesta.find((c) => c.clave === 'ayudante')
  assert.ok(puesta, 'la categoría elegida se quedó sin pastilla: no hay cómo apagar el recorte')
  assert.equal(puesta.cuenta, 0)
  assert.equal(puesta.etiqueta, 'Ayudante')
  // También para los dos cajones que no son una categoría.
  assert.equal(categoriasDelCorte(sinJefes, FUERA_DE_CONVENIO).at(-1)?.etiqueta, 'Fuera de convenio')
  assert.equal(categoriasDelCorte(sinJefes, SIN_CATEGORIA).at(-1)?.etiqueta, 'Sin categoría')
})

test('sin categoría elegida no se recorta nada: un parámetro vacío no es un filtro', () => {
  assert.equal(filtrarPorCategoria(PLANTEL, undefined).length, PLANTEL.length)
  assert.equal(filtrarPorCategoria(PLANTEL, '   ').length, PLANTEL.length)
  // Y no devuelve el mismo arreglo: quien recorta no puede reordenar la lista de quien la leyó.
  assert.notEqual(filtrarPorCategoria(PLANTEL), PLANTEL)
})

test('el orden es el del convenio, y los dos que no son categoría van al final', () => {
  // EL DEFECTO: ordenar alfabéticamente pone «Ayudante» arriba de «Oficial especializado» y mezcla
  // «Sin categoría» entre las del convenio, donde se lee como una más.
  const chips = categoriasDelCorte([
    { categoria: 'ayudante' }, { categoria: 'oficial_especializado' }, { categoria: 'oficial' },
    { categoria: 'medio_oficial' }, { categoria: 'sereno' }, { categoria: null },
    { categoria: 'oficial', puesto: 'JEFE DE OBRA' },
  ])
  assert.deepEqual(chips.map((c) => c.clave), [
    'oficial_especializado', 'oficial', 'medio_oficial', 'ayudante',
    // Lo que el catálogo no conoce —«sereno» hoy no está en `CATEGORIAS_UOCRA`— se ofrece igual,
    // después de las cuatro y con su propio texto: la pantalla no puede esconder un dato cargado.
    'sereno', SIN_CATEGORIA, FUERA_DE_CONVENIO,
  ])
})
