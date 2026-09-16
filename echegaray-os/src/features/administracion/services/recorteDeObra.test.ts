import test from 'node:test'
import assert from 'node:assert/strict'
import type { FilaDeConteo } from './personasService.ts'
import {
  filtrarPorObra, obraSobreviveAlCorte, obrasDelCorte, sinObraDelCorte,
} from './recorteDeObra.ts'

// EL RECORTE POR OBRA DEL PLANTEL (dueño, 16/09/2026). Lo que se prueba acá es la REGLA, sin base y
// sin React: cuánta gente anuncia cada chip, quién sobrevive al recorte, y los cuatro modos de fallar
// que ya se pagaron en la solapa Horas —el chip que miente, el filtro que no se puede sacar, el slug
// publicado como nombre y el número que se mueve al escribir en el buscador—.

/** El padrón real del 16/09/2026, reducido: 5 obras con gente y nadie sin asignar. */
const PADRON: FilaDeConteo[] = [
  { en_la_empresa: true, obra_actual_id: 'quattropani', obra_actual: 'QP - SALÓN COMERCIAL' },
  { en_la_empresa: true, obra_actual_id: 'quattropani', obra_actual: 'QP - SALÓN COMERCIAL' },
  { en_la_empresa: true, obra_actual_id: 'quattropani', obra_actual: 'QP - SALÓN COMERCIAL' },
  { en_la_empresa: true, obra_actual_id: 'pisos-industriales', obra_actual: 'SF - PISOS INDUSTRIALES' },
  { en_la_empresa: true, obra_actual_id: 'pisos-industriales', obra_actual: 'SF - PISOS INDUSTRIALES' },
  { en_la_empresa: true, obra_actual_id: 'instalacion-electrica', obra_actual: 'SF - INSTALACIÓN ELÉCTRICA' },
  { en_la_empresa: true, obra_actual_id: null, obra_actual: null },
  // Un legajo cerrado que todavía arrastra su última obra: existe en el catálogo de nombres, pero no
  // cuenta en el plantel.
  { en_la_empresa: false, obra_actual_id: 'entrepiso-y-escalera', obra_actual: 'SF - ENTREPISO Y ESCALERA' },
]

test('el recorte deja SÓLO a la gente de esa obra, y sin obra elegida no recorta nada', () => {
  const personas = [
    { id: 'a', obra_actual_id: 'quattropani' },
    { id: 'b', obra_actual_id: 'pisos-industriales' },
    { id: 'c', obra_actual_id: null },
  ]
  assert.deepEqual(filtrarPorObra(personas, 'quattropani').map((p) => p.id), ['a'])
  // «TODAS» NO ES UN FILTRO VACÍO QUE NO ENCUENTRA A NADIE: es la ausencia de recorte. Tratar
  // `undefined` o `''` como una obra dejaría la tabla en blanco apenas se apaga el chip.
  assert.equal(filtrarPorObra(personas, undefined).length, 3)
  assert.equal(filtrarPorObra(personas, '').length, 3)
  assert.equal(filtrarPorObra(personas, '  ').length, 3)
  // Y NADIE ENTRA POR PARECIDO: la clave es el id de la obra, no su nombre.
  assert.deepEqual(filtrarPorObra(personas, 'QUATTROPANI'), [])
})

test('cada chip anuncia la gente que el recorte va a mostrar — el mismo número, la misma regla', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Un chip que dice 5 arriba de cuatro filas es la clase de error que nadie reporta y que hace que
  // se deje de creer en la pantalla. Acá se comprueba lo único que lo impide: que contar y filtrar
  // sean la MISMA regla. Si `obrasDelCorte` empezara a contar por nombre y `filtrarPorObra` por id,
  // este test se pone rojo.
  const chips = obrasDelCorte(PADRON, 'plantel')
  for (const chip of chips) {
    const alcanzados = filtrarPorObra(PADRON.filter((f) => f.en_la_empresa === true), chip.clave)
    assert.equal(chip.cuenta, alcanzados.length, `el chip «${chip.etiqueta}» promete lo que no muestra`)
  }
  assert.deepEqual(chips.map((c) => `${c.etiqueta} ${c.cuenta}`), [
    'QP - SALÓN COMERCIAL 3',
    'SF - PISOS INDUSTRIALES 2',
    'SF - INSTALACIÓN ELÉCTRICA 1',
  ])
})

test('los chips cuentan la POBLACIÓN DEL CORTE: el legajo cerrado no suma al plantel', () => {
  // La obra del inactivo no puede aparecer entre las del plantel con una persona: ese «1» mandaría a
  // buscar en la obra a alguien que ya no está en la empresa.
  const plantel = obrasDelCorte(PADRON, 'plantel').map((c) => c.clave)
  assert.equal(plantel.includes('entrepiso-y-escalera'), false)
  // Y en el corte de inactivos es al revés: la única obra es la suya.
  assert.deepEqual(obrasDelCorte(PADRON, 'inactivos').map((c) => `${c.etiqueta} ${c.cuenta}`),
    ['SF - ENTREPISO Y ESCALERA 1'])
  // «EN OBRA» ES EL MISMO CONJUNTO QUE EL PLANTEL CON OBRA: los chips no pueden cambiar entre los dos.
  assert.deepEqual(obrasDelCorte(PADRON, 'en_obra'), obrasDelCorte(PADRON, 'plantel'))
  // Y UNA FILA CON `en_la_empresa` EN NULL NO PERTENECE A NINGÚN CORTE — la regla es `perteneceAlCorte`,
  // la misma de las cuatro pastillas de arriba.
  const conNull = [...PADRON, { en_la_empresa: null, obra_actual_id: 'quattropani', obra_actual: 'QP - SALÓN COMERCIAL' }]
  assert.equal(obrasDelCorte(conNull, 'plantel').find((c) => c.clave === 'quattropani')?.cuenta, 3)
})

test('las obras van de la más numerosa a la menos, y el empate se rompe por nombre', () => {
  // El chip que se busca primero es el de la obra donde hay más gente. El desempate alfabético existe
  // para que el orden no dependa de en qué orden vinieron las filas de la base: una lista que se
  // reordena sola entre dos cargas obliga a leerla entera cada vez.
  const empate: FilaDeConteo[] = [
    { en_la_empresa: true, obra_actual_id: 'z', obra_actual: 'ZZ - ÚLTIMA' },
    { en_la_empresa: true, obra_actual_id: 'a', obra_actual: 'AA - PRIMERA' },
  ]
  assert.deepEqual(obrasDelCorte(empate, 'plantel').map((c) => c.etiqueta), ['AA - PRIMERA', 'ZZ - ÚLTIMA'])
})

test('la obra elegida conserva su chip aunque en ese corte no alcance a nadie', () => {
  // ═══ EL DEFECTO QUE ATRAPA (dueño, 11/09/2026, en la solapa Horas) ═══
  //
  // *«le pongo el filtro a obra y no se puede sacar después»*: al cambiar de corte, la obra elegida se
  // queda sin gente, su chip desaparece, y el recorte queda puesto sin nada que apretar para apagarlo
  // — la tabla se ve vacía y no hay ninguna señal de qué la está recortando.
  const chips = obrasDelCorte(PADRON, 'inactivos', 'quattropani')
  const elegido = chips.find((c) => c.clave === 'quattropani')
  assert.ok(elegido, 'la obra elegida se quedó sin chip: el filtro no se puede sacar')
  assert.equal(elegido.cuenta, 0)
  // Y SU NOMBRE SALE DEL PADRÓN ENTERO, no del corte, que es donde ya no existe.
  assert.equal(elegido.etiqueta, 'QP - SALÓN COMERCIAL')
  // NO SE DUPLICA cuando la obra elegida sí tiene gente en el corte.
  const conGente = obrasDelCorte(PADRON, 'plantel', 'quattropani')
  assert.equal(conGente.filter((c) => c.clave === 'quattropani').length, 1)
})

test('una obra que no se puede nombrar no se dibuja: nunca un slug en pantalla', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // `obra_actual_id` es `messina-playon-dilucion-acido`. Rotular el chip con la clave cuando falta el
  // nombre publicaría el identificador interno como si fuera el nombre de la obra — lo que el dueño
  // pidió explícitamente no ver nunca. Su gente se sigue viendo en «Todas».
  const sinNombre: FilaDeConteo[] = [
    { en_la_empresa: true, obra_actual_id: 'messina-playon-dilucion-acido', obra_actual: null },
    { en_la_empresa: true, obra_actual_id: 'messina-playon-dilucion-acido', obra_actual: '   ' },
    { en_la_empresa: true, obra_actual_id: 'quattropani', obra_actual: 'QP - SALÓN COMERCIAL' },
  ]
  const chips = obrasDelCorte(sinNombre, 'plantel')
  assert.deepEqual(chips.map((c) => c.etiqueta), ['QP - SALÓN COMERCIAL'])
  assert.equal(chips.some((c) => c.etiqueta.includes('messina')), false)
})

test('«Sin obra» es el corte que ya existe —«Sin asignar»—, y nunca se dibuja en cero', () => {
  // ═══ POR QUÉ NO ES UN RECORTE NUEVO ═══
  //
  // La pantalla ya tenía esa población en la pastilla «Sin asignar». Dos controles con el mismo
  // significado y distinto nombre se contradicen el día que uno cambie de criterio. Por eso el número
  // se calcula con el corte `sin_asignar` y el enlace apunta a esa pastilla.
  assert.equal(sinObraDelCorte(PADRON, 'plantel'), 1)
  // ACTIVO Y VISIBLE EN SU PROPIO CORTE: el chip que se acaba de apretar no puede desaparecer al
  // aplicarse, porque eso se lee como que el clic no hizo nada.
  assert.equal(sinObraDelCorte(PADRON, 'sin_asignar'), 1)
  // «EN OBRA» LO EXCLUYE POR DEFINICIÓN e «Inactivos» lo tendría entero con otro nombre.
  assert.equal(sinObraDelCorte(PADRON, 'en_obra'), null)
  assert.equal(sinObraDelCorte(PADRON, 'inactivos'), null)
  // NUNCA UN CERO: un chip que promete cero filas es una puerta a una pieza vacía. Con todo el
  // plantel asignado —el estado real del 16/09/2026— el chip no se dibuja.
  const todosConObra = PADRON.filter((f) => f.obra_actual_id !== null)
  assert.equal(sinObraDelCorte(todosConObra, 'plantel'), null)
})

test('la obra elegida no viaja al corte que la contradice', () => {
  // «Esta persona no tiene obra» y «esta persona está en la obra X» no pueden ser ciertas a la vez:
  // arrastrar la obra a «Sin asignar» prometería un recorte que SIEMPRE devuelve cero filas. Es la
  // misma decisión por la que el enlace a la solapa Horas no arrastra `f=sin_asignar`.
  assert.equal(obraSobreviveAlCorte('sin_asignar'), false)
  assert.equal(obraSobreviveAlCorte('plantel'), true)
  assert.equal(obraSobreviveAlCorte('en_obra'), true)
  // A «Inactivos» sí viaja: un legajo cerrado con obra vigente es raro, pero el modelo lo admite —el
  // padrón de arriba tiene uno— y no es una contradicción de definiciones.
  assert.equal(obraSobreviveAlCorte('inactivos'), true)
})
