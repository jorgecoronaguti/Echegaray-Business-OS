// LO QUE ESTAS PRUEBAS IMPIDEN: que el portal le muestre al cliente una obra que ya no existe, o
// que le diga «no sincronizamos sus papeles» arriba de sus papeles.
//
// El fixture son las TRECE filas de `obra_canonica` de Messina el 10/09/2026, con las dos fusiones
// que el dueño aprobó ese día. Si alguien vuelve a leer `obra_canonica` sin mirar `fusionada_en`,
// la primera se pone roja.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  obrasDelCliente, partirEnCursoYAnteriores, ambitosDelEspejo, corridaMasFresca, esObraAnterior,
  type FilaObraCanonica,
} from './obrasDelCliente.ts'

const fila = (p: Partial<FilaObraCanonica> & { id: string }): FilaObraCanonica => ({
  nombre: p.id, estado: 'activa', fecha_inicio_real: null, fecha_inicio_plan: null,
  fusionada_en: null, ...p,
})

const MESSINA: FilaObraCanonica[] = [
  fila({ id: 'messina-adicional-tercer-muro', nombre: 'ME - ADICIONAL TERCER MURO' }),
  fila({ id: 'messina-bsa', nombre: 'ME - BSA' }),
  fila({ id: 'messina-pisos-120-rampa', nombre: 'ME - PISOS 120 M² Y RAMPA' }),
  fila({ id: 'messina-playon-azufre', nombre: 'ME - PLAYÓN DE AZUFRE' }),
  fila({ id: 'messina-playon-dilucion-acido', nombre: 'ME - PLAYÓN DILUCIÓN DE ÁCIDO' }),
  fila({ id: 'bsa-adicional', nombre: 'BSA - Adicional', estado: 'cerrada' }),
  fila({ id: 'bsa-planta', nombre: 'BSA - Planta', estado: 'cerrada', fusionada_en: 'messina-bsa' }),
  fila({ id: 'limpieza-de-escombros', nombre: 'Limpieza de Escombros', estado: 'cerrada' }),
  fila({ id: 'messina', nombre: 'Messina', estado: 'cerrada' }),
  fila({ id: 'messina-bases-tanque-so2', nombre: 'ME - BASES TANQUE SO2', estado: 'cerrada' }),
  fila({ id: 'pilon', nombre: 'Pilón', estado: 'cerrada' }),
  fila({
    id: 'pisos-120m2', nombre: 'Pisos 120m2', estado: 'cerrada',
    fusionada_en: 'messina-pisos-120-rampa',
  }),
  fila({ id: 'relevamiento-topografico', nombre: 'Relevamiento Topográfico', estado: 'cerrada' }),
]

const TODAS = () => true

test('una obra fusionada NO se lista: el cliente la vería dos veces con dos nombres', () => {
  const obras = obrasDelCliente(MESSINA, TODAS)
  const ids = obras.map((o) => o.id)
  assert.equal(obras.length, 11, 'trece filas, dos fusionadas')
  assert.ok(!ids.includes('bsa-planta'), '«BSA - Planta» es hoy «ME - BSA»')
  assert.ok(!ids.includes('pisos-120m2'), '«Pisos 120m2» es hoy «ME - PISOS 120 M² Y RAMPA»')
  assert.ok(ids.includes('messina-bsa') && ids.includes('messina-pisos-120-rampa'))
})

test('la obra que absorbió se queda con los ids de las que absorbió', () => {
  const obras = obrasDelCliente(MESSINA, TODAS)
  assert.deepEqual(obras.find((o) => o.id === 'messina-bsa')!.absorbidas, ['bsa-planta'])
  assert.deepEqual(obras.find((o) => o.id === 'bsa-adicional')!.absorbidas, [],
    'una obra que no absorbió nada no arrastra ids ajenos')
})

test('un acceso otorgado sobre la obra vieja SIGUE VALIENDO sobre la que la absorbió', () => {
  // El día de la fusión, un contacto con acceso sólo a «BSA - Planta» se habría quedado sin ver
  // nada, y nadie habría relacionado una cosa con la otra.
  const soloBsaPlanta = obrasDelCliente(MESSINA, (id) => id === 'bsa-planta')
  assert.deepEqual(soloBsaPlanta.map((o) => o.id), ['messina-bsa'])
})

test('el alcance sigue recortando: un acceso a una obra no abre las demás', () => {
  const soloPilon = obrasDelCliente(MESSINA, (id) => id === 'pilon')
  assert.deepEqual(soloPilon.map((o) => o.id), ['pilon'])
})

test('las terminadas van después de las que están en curso, y en su propio grupo', () => {
  const { enCurso, anteriores } = partirEnCursoYAnteriores(obrasDelCliente(MESSINA, TODAS))
  assert.equal(enCurso.length, 5)
  assert.equal(anteriores.length, 6)
  // El registro viejo que se llama como el cliente es una obra anterior más: no se oculta ni se
  // renombra —es un registro real y el nombre lo decide el dueño—, se agrupa.
  assert.ok(anteriores.some((o) => o.id === 'messina' && o.nombre === 'Messina'))
  assert.ok(enCurso.every((o) => !esObraAnterior(o)))
})

test('la fecha de inicio REAL manda sobre la planificada, y la ausencia no se rellena', () => {
  const [conReal, soloPlan, sinNada] = obrasDelCliente([
    fila({ id: 'a', fecha_inicio_real: '2026-03-04', fecha_inicio_plan: '2026-01-01' }),
    fila({ id: 'b', fecha_inicio_plan: '2026-01-01' }),
    fila({ id: 'c' }),
  ], TODAS)
  assert.equal(conReal.desde, '2026-03-04')
  assert.equal(soloPlan.desde, '2026-01-01')
  assert.equal(sinNada.desde, null, 'sin fecha cargada la pantalla no escribe ninguna')
})

test('los papeles de la obra fusionada se buscan también por su ámbito viejo', () => {
  const bsa = obrasDelCliente(MESSINA, TODAS).find((o) => o.id === 'messina-bsa')!
  assert.deepEqual(ambitosDelEspejo(bsa), ['obra:messina-bsa', 'obra:bsa-planta'])
})

test('la corrida que se muestra es la más fresca de los ámbitos de la obra', () => {
  const corridas = new Map([
    ['obra:bsa-planta', { al: new Date('2026-09-04T19:41:44Z'), error: null }],
    ['obra:otra', { al: new Date('2026-09-09T10:00:00Z'), error: null }],
  ])
  const bsa = obrasDelCliente(MESSINA, TODAS).find((o) => o.id === 'messina-bsa')!
  // Sin esto la pantalla escribía «Todavía no sincronizamos los papeles de esta obra» arriba de los
  // once documentos que sí están publicados.
  assert.equal(corridaMasFresca(corridas, ambitosDelEspejo(bsa))?.al?.toISOString(),
    '2026-09-04T19:41:44.000Z')
  // Y una obra que el espejo nunca recorrió sigue diciendo que no corrió: es otro estado.
  const nueva = obrasDelCliente(MESSINA, TODAS).find((o) => o.id === 'messina-playon-azufre')!
  assert.equal(corridaMasFresca(corridas, ambitosDelEspejo(nueva)), null)
})

test('entre dos corridas gana la más nueva aunque haya fallado: esconderlo taparía la rotura', () => {
  const corridas = new Map([
    ['obra:vieja', { al: new Date('2026-09-01T00:00:00Z'), error: null }],
    ['obra:x', { al: new Date('2026-09-08T00:00:00Z'), error: 'carpeta no encontrada' }],
  ])
  const c = corridaMasFresca(corridas, ['obra:x', 'obra:vieja'])
  assert.equal(c?.error, 'carpeta no encontrada')
})
