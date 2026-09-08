import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPorRolOrganizacional, categoriaVisible, esJefeDeObra, oficioVisible, pareceCategoria,
} from './vocabularioPersona.ts'

// EL DEFECTO 4.10, ATRAPADO. La fila del listado escribía `especialidad ?? puesto` debajo del
// nombre, y `puesto` trae el CARGO de la nómina: había filas que decían «OFICIAL» debajo del nombre
// —donde va el oficio— y «Ayudante» en la columna CATEGORÍA. Dos respuestas al mismo hecho.
// Volver al `??` pelado pone este test en rojo.
test('una categoría de convenio NUNCA se publica como oficio', () => {
  assert.equal(oficioVisible(null, 'OFICIAL'), null)
  assert.equal(oficioVisible(null, 'Medio oficial'), null)
  assert.equal(oficioVisible(null, 'medio_oficial'), null)
  assert.equal(oficioVisible(null, 'Oficial especializado'), null)
  assert.equal(oficioVisible(null, 'ayudante'), null)
})

test('el oficio de verdad sí se publica, venga de donde venga', () => {
  assert.equal(oficioVisible('Albañil', null), 'Albañil')
  // Sin especialidad cargada, un puesto que NO es categoría es la mejor respuesta que hay.
  assert.equal(oficioVisible(null, 'Electricista'), 'Electricista')
  // La especialidad manda sobre el puesto: es el campo hecho para esto.
  assert.equal(oficioVisible('Yesero', 'Electricista'), 'Yesero')
})

// UN ROL ORGANIZACIONAL NO ES UNA CATEGORÍA DEL CONVENIO, y tampoco hay que esconderlo: «Jefe de
// obra» en el puesto es información real y no duplica ninguna otra columna.
test('el rol organizacional pasa: no lo publica ninguna otra columna', () => {
  assert.equal(oficioVisible(null, 'Jefe de obra'), 'Jefe de obra')
  assert.equal(pareceCategoria('Jefe de obra'), false)
})

// LA NÓMINA ESCRIBE COMO QUIERE. Mayúsculas, guión bajo, espacios y acentos son la misma categoría:
// comparar el texto crudo dejaba pasar «OFICIAL ESPECIALIZADO» como si fuera un oficio.
test('la comparación no se deja engañar por la grafía de la nómina', () => {
  assert.equal(pareceCategoria('OFICIAL'), true)
  assert.equal(pareceCategoria('  Oficial  '), true)
  assert.equal(pareceCategoria('MEDIO OFICIAL'), true)
  assert.equal(pareceCategoria('medio-oficial'), true)
  assert.equal(pareceCategoria('Oficial Especializado'), true)
  assert.equal(pareceCategoria(null), false)
  assert.equal(pareceCategoria(''), false)
})

// UN CÓDIGO MAL IMPORTADO NO ES UN OFICIO NI UNA CATEGORÍA. Hay tres personas con '1591', '6E60' y
// '004212' en la columna. No se esconde: se muestra tal cual para que alguien lo corrija — pero es
// la columna CATEGORÍA la que lo marca «fuera de convenio», no ésta la que lo tapa.
test('un código mal importado no se toma por categoría', () => {
  assert.equal(pareceCategoria('6E60'), false)
  assert.equal(oficioVisible(null, '6E60'), '6E60')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA COLUMNA MUESTRA CATEGORÍA — pedido del dueño del 07/09/2026
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la categoría se muestra con su etiqueta, no con la clave de la base', () => {
  assert.equal(categoriaVisible('medio_oficial', null), 'Medio oficial')
  assert.equal(categoriaVisible('oficial_especializado', null), 'Oficial especializado')
  // El campo `categoria` MANDA aunque `puesto` diga otra cosa: es el que liquida.
  assert.equal(categoriaVisible('ayudante', 'Oficial'), 'Ayudante')
})

// EL RESCATE: la categoría escondida adentro de `puesto`. `oficioVisible` la DESCARTA por ser una
// categoría; acá se RECUPERA por lo mismo. Los dos leen el mismo catálogo, así que ninguna fila
// puede caer en las dos columnas ni perderse entre las dos.
test('sin categoría cargada, se rescata la que venía disfrazada de puesto', () => {
  assert.equal(categoriaVisible(null, 'OFICIAL'), 'Oficial')
  assert.equal(categoriaVisible(null, 'medio-oficial'), 'Medio oficial')
  // Y lo que NO es categoría no se convierte en una: «albañil» es un oficio y acá no va.
  assert.equal(categoriaVisible(null, 'Albañil'), null)
  assert.equal(oficioVisible(null, 'Albañil'), 'Albañil')
  // Las dos funciones son excluyentes sobre el mismo texto libre: o es oficio, o es categoría.
  for (const t of ['OFICIAL', 'Ayudante', 'Albañil', 'electricista', '6E60']) {
    const enOficio = oficioVisible(null, t) !== null
    const enCategoria = categoriaVisible(null, t) !== null
    assert.notEqual(enOficio, enCategoria, `"${t}" cae en las dos columnas o en ninguna`)
  }
})

test('sin nada cargado la función calla, y la pantalla decide qué dibujar', () => {
  assert.equal(categoriaVisible(null, null), null)
  assert.equal(categoriaVisible('', '  '), null)
})

// ═══ EL ROL ORGANIZACIONAL (08/09/2026) ═══
//
// El dato real del 08/09/2026: `personas.puesto` = 'JEFE DE OBRA' en MALDONADO y NIEVAS, NULL en
// las otras 15 personas activas. Estos tests fijan ese criterio y nada más que ese.

test('jefe de obra es lo que dice `puesto`, en cualquiera de sus dos grafías', () => {
  assert.equal(esJefeDeObra('JEFE DE OBRA'), true)   // la grafía de la nómina, la real hoy
  assert.equal(esJefeDeObra('Jefe de Obra'), true)
  assert.equal(esJefeDeObra('jefe_obra'), true)      // la grafía de `perfiles.rol`
  assert.equal(esJefeDeObra('  jefe de obra  '), true)
})

// SIN PUESTO NO ES JEFE, Y UNA CATEGORÍA TAMPOCO LO ES. Los dos jefes son `oficial_especializado`,
// pero también lo son dos que no lo son: si el criterio se cayera a la categoría, esos dos
// aparecerían mandando una obra. Cambiar la regla por `categoria` pone este test en rojo.
test('ni la ausencia de dato ni la categoría convierten a alguien en jefe', () => {
  assert.equal(esJefeDeObra(null), false)
  assert.equal(esJefeDeObra(''), false)
  assert.equal(esJefeDeObra('oficial_especializado'), false)
  assert.equal(esJefeDeObra('OFICIAL'), false)
  assert.equal(esJefeDeObra('ALBAÑIL'), false)
  // «capataz» y «responsable» dirigen una cuadrilla, no una obra: son el rol de la ASIGNACIÓN.
  assert.equal(esJefeDeObra('capataz'), false)
  assert.equal(esJefeDeObra('responsable'), false)
})

const P = (nombre: string, puesto: string | null) => ({ nombre, puesto })
const esJefe = (p: { puesto: string | null }) => esJefeDeObra(p.puesto)

test('los jefes van primero y el orden interno de cada grupo es el que llegó', () => {
  const plantel = [
    P('ACOSTA', null), P('MALDONADO', 'JEFE DE OBRA'), P('BRIZUELA', null),
    P('NIEVAS', 'JEFE DE OBRA'), P('ZOGBE', null),
  ]
  const g = agruparPorRolOrganizacional(plantel, esJefe)
  assert.deepEqual(g.map((x) => x.clave), ['jefes', 'obreros'])
  assert.deepEqual(g[0].integrantes.map((p) => p.nombre), ['MALDONADO', 'NIEVAS'])
  assert.deepEqual(g[1].integrantes.map((p) => p.nombre), ['ACOSTA', 'BRIZUELA', 'ZOGBE'])
  assert.equal(g[0].rotulo, 'Jefes de obra · 2')
  assert.equal(g[1].rotulo, 'Obreros · 3')
})

// UN GRUPO VACÍO NO SE DEVUELVE. Es lo que impide que «Inactivos» o un filtro sin jefes dibujen un
// rótulo «Jefes de obra · 0» encima de una lista que no tiene ninguno.
test('sin jefes queda un solo grupo, y sin obreros también', () => {
  const soloObreros = agruparPorRolOrganizacional([P('ACOSTA', null)], esJefe)
  assert.deepEqual(soloObreros.map((x) => x.clave), ['obreros'])
  assert.equal(soloObreros[0].rotulo, 'Obrero · 1')

  const soloJefes = agruparPorRolOrganizacional([P('NIEVAS', 'JEFE DE OBRA')], esJefe)
  assert.deepEqual(soloJefes.map((x) => x.clave), ['jefes'])
  assert.equal(soloJefes[0].rotulo, 'Jefe de obra · 1')

  assert.deepEqual(agruparPorRolOrganizacional([], esJefe), [])
})
