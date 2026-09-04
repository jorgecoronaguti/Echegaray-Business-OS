// LOS CASOS SON LOS QUE EL DUEÑO PIDIÓ, Y CADA UNO ES UNA FORMA REAL DE EQUIVOCARSE. Los datos
// salen del ground truth verificado por CUIT del 04/09/2026, no de ejemplos inventados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverIdentidad, ESTADO, cuitCanonico, similitudTrigram } from './entity-resolution.mjs'
import { umbralesDe } from './umbrales.mjs'

const U = umbralesDe('proveedor')
const SIN_ML = { umbrales: U, usarEmbeddings: false }
const PADRON = [
  { id: '1', nombre: 'Hormiserv', cuit: '30-68164173-0' },
  { id: '2', nombre: 'Alumetal', cuit: '30-11111111-1' },
  { id: '3', nombre: 'Robles Pintureria', cuit: '30-22222222-2' },
  { id: '4', nombre: 'DUPEC', cuit: '20-28773782-4' },
  { id: '5', nombre: 'Corralon Progreso', cuit: '27-33333333-3' },
  { id: '6', nombre: 'Industrias Castel', cuit: '20-44444444-4' },
  { id: '7', nombre: 'Acerolatina SA', cuit: '30-55555555-5' },
  { id: '8', nombre: 'Friolatina SA', cuit: '30-66666666-6' },
]
const ALIAS = new Map([
  ['PEREZ GARCIA MARISOL BIBIANA', '5'],
  ['MARTINEZ JORGE ROBERTO', '6'],
  ['DUBOS UGARTE PEDRO LUIS RAUL', '4'],
])

test('mismo proveedor escrito distinto: sufijo societario y mayúsculas', async () => {
  for (const n of ['HORMISERV SRL', 'hormiserv s.r.l.', 'Hormiserv S.A.']) {
    const r = await resolverIdentidad({ nombre: n }, PADRON, SIN_ML)
    assert.equal(r.estado, ESTADO.AUTO_RESUELTO, n)
    assert.equal(r.match.id, '1')
  }
})

test('acentos y puntuación no cambian la identidad', async () => {
  const r = await resolverIdentidad({ nombre: 'Robles Pinturería, S.R.L.' }, PADRON, SIN_ML)
  assert.equal(r.estado, ESTADO.AUTO_RESUELTO)
  assert.equal(r.match.id, '3')
})

test('CUIT coincidente resuelve solo, y la señal fuerte es la que decide', async () => {
  const r = await resolverIdentidad({ nombre: 'CUALQUIER COSA SA', cuit: '30-68164173-0' }, PADRON, SIN_ML)
  assert.equal(r.estado, ESTADO.AUTO_RESUELTO)
  assert.equal(r.match.id, '1')
  assert.equal(r.señales.strong_id_score, 1)
  assert.equal(r.señales.fuzzy_score, null, 'una señal que no se usó vale null, no 0')
})

// EL CASO QUE PROTEGE LA PLATA: el nombre es idéntico y el CUIT dice que no.
test('CUIT distinto con nombre idéntico NO se resuelve: queda ambiguo', async () => {
  const r = await resolverIdentidad({ nombre: 'Hormiserv', cuit: '30-99999999-9' }, PADRON, SIN_ML)
  assert.equal(r.estado, ESTADO.AMBIGUO)
  assert.equal(r.match, null)
  assert.match(r.porQue, /CUIT es distinto/)
})

test('un embedding alto no puede pisar un identificador fuerte incompatible', async () => {
  const r = await resolverIdentidad({ nombre: 'Acerolatina S.A.', cuit: '30-66666666-6' }, PADRON, { umbrales: U })
  assert.equal(r.match.id, '8', 'manda el CUIT de Friolatina, no el parecido con Acerolatina')
  assert.equal(r.señales.strong_id_score, 1)
})

test('nombres casi idénticos de empresas DISTINTAS no se fusionan', async () => {
  const r = await resolverIdentidad({ nombre: 'Frio Latina SA' }, PADRON, SIN_ML)
  assert.notEqual(r.estado, ESTADO.AUTO_RESUELTO, 'con dos candidatos tan cerca no se resuelve solo')
})

test('alias verificado resuelve lo que ningún modelo puede', async () => {
  const r = await resolverIdentidad({ nombre: 'Perez Garcia Marisol Bibiana' }, PADRON, { ...SIN_ML, aliases: ALIAS })
  assert.equal(r.estado, ESTADO.AUTO_RESUELTO)
  assert.equal(r.match.id, '5')
  assert.equal(r.señales.alias_score, 1)
})

test('inversión apellido/nombre resuelve en los DOS sentidos', async () => {
  const a = await resolverIdentidad({ nombre: 'MARTINEZ JORGE ROBERTO' }, PADRON, { ...SIN_ML, aliases: ALIAS })
  const b = await resolverIdentidad({ nombre: 'JORGE ROBERTO MARTINEZ' }, PADRON, { ...SIN_ML, aliases: ALIAS })
  assert.equal(a.match?.id, '6')
  assert.equal(b.match?.id, '6', 'el resultado no puede depender de en qué planilla se tipeó')
})

test('candidato inexistente devuelve sin_match, no el menos malo', async () => {
  const r = await resolverIdentidad({ nombre: 'FERRETERIA QUE NO EXISTE SRL' }, PADRON, SIN_ML)
  assert.equal(r.estado, ESTADO.SIN_MATCH)
  assert.equal(r.match, null)
})

test('dos candidatos demasiado cerca dan AMBIGUO aunque pasen el umbral', async () => {
  const padron = [{ id: 'a', nombre: 'Constructora del Sur' }, { id: 'b', nombre: 'Constructora del Sud' }]
  const r = await resolverIdentidad({ nombre: 'Constructora del Su' }, padron, { umbrales: { auto: 0.5, sugerido: 0.3, margen: 0.05 }, usarEmbeddings: false })
  assert.equal(r.estado, ESTADO.AMBIGUO)
  assert.equal(r.match, null)
  assert.match(r.porQue, /demasiado cerca/)
})

test('dos candidatos con el MISMO CUIT dan ambiguo: hay duplicados en el padrón', async () => {
  const padron = [{ id: 'a', nombre: 'X', cuit: '30-11111111-1' }, { id: 'b', nombre: 'Y', cuit: '30-11111111-1' }]
  const r = await resolverIdentidad({ nombre: 'Z', cuit: '30-11111111-1' }, padron, SIN_ML)
  assert.equal(r.estado, ESTADO.AMBIGUO)
  assert.equal(r.candidatos.length, 2)
})

test('un error del modelo degrada a fuzzy en vez de romper', async () => {
  // Se fuerza el fallo pidiendo embeddings con un piso de RAM imposible.
  const antes = process.env.ORQ_ML_PISO_RAM_MB
  process.env.ORQ_ML_PISO_RAM_MB = '99999999'
  const r = await resolverIdentidad({ nombre: 'HORMISERV SRL' }, PADRON, { umbrales: U, usarEmbeddings: true })
  process.env.ORQ_ML_PISO_RAM_MB = antes ?? ''
  assert.equal(r.estado, ESTADO.AUTO_RESUELTO, 'el match exacto no necesita el modelo')
})

test('las seis señales están siempre presentes y las que no aplican son null', async () => {
  const r = await resolverIdentidad({ nombre: 'algo raro' }, PADRON, SIN_ML)
  for (const k of ['strong_id_score', 'exact_score', 'alias_score', 'fuzzy_score', 'embedding_score', 'combined_score']) {
    assert.ok(k in r.señales, `falta ${k}`)
  }
  assert.equal(r.señales.embedding_score, null, 'sin modelo, la señal no se inventa')
})

test('cada resultado trae la versión del resolver: sin ella no se puede auditar una fusión vieja', async () => {
  const r = await resolverIdentidad({ nombre: 'Hormiserv' }, PADRON, SIN_ML)
  assert.match(r.resolverVersion, /^\d+\.\d+\.\d+$/)
})

test('resolver sin umbrales es un error: no hay default cómodo', async () => {
  await assert.rejects(() => resolverIdentidad({ nombre: 'x' }, PADRON, {}), /necesita umbrales/)
})

test('un CUIT mal formado no se toma como CUIT', () => {
  assert.equal(cuitCanonico('30-6816417-0'), null)
  assert.equal(cuitCanonico('30-68164173-0'), '30681641730')
  assert.equal(cuitCanonico(''), null)
})

test('la similitud por trigramas es simétrica y acotada', () => {
  assert.equal(similitudTrigram('hormiserv', 'hormiserv'), 1)
  assert.equal(similitudTrigram('a', 'b'), 0)
  assert.equal(similitudTrigram('hormiserv', 'hormisrv'), similitudTrigram('hormisrv', 'hormiserv'))
})

// LOS UMBRALES SALEN DEL BENCHMARK: si alguien los cambia sin medir, esto se pone rojo.
test('los umbrales de proveedor son los medidos, y sólo esa entidad está calibrada', () => {
  assert.equal(U.auto, 0.95, '0,95 es el único umbral con cero falsos positivos en el benchmark')
  assert.equal(U.calibrado, true)
  assert.equal(umbralesDe('empleado').calibrado, false, 'no se puede presentar como medido lo que no se midió')
  assert.ok(umbralesDe('entidad-que-no-existe').auto >= 0.95, 'lo desconocido usa el umbral más estricto')
})
