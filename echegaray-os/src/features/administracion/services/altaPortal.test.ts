import test from 'node:test'
import assert from 'node:assert/strict'
import { decidirAlta, golpesSinResolver, type FilaMail } from './altaPortal.ts'

// LO QUE ESTAS PRUEBAS IMPIDEN: que volver a habilitar un mail dado de baja explote con «duplicate
// key». La baja apaga la fila y NO la borra, así que la fila apagada sigue ocupando el índice único.
// Si `decidirAlta` devolviera `insertar` para ese caso, el administrador vería un error de Postgres
// en el camino más frecuente de todos —deshacer una baja hecha por error—.

const OBRA = '11111111-1111-1111-1111-111111111111'
const OTRA = '22222222-2222-2222-2222-222222222222'

const fila = (p: Partial<FilaMail>): FilaMail =>
  ({ id: 'f1', mail: 'marta@x.com', obra_id: null, activo: true, ...p })

test('mail nuevo para el cliente: se inserta', () => {
  assert.deepEqual(decidirAlta([], { mail: 'marta@x.com', obraId: null }), { accion: 'insertar' })
  assert.deepEqual(
    decidirAlta([fila({ mail: 'otro@x.com' })], { mail: 'marta@x.com', obraId: null }),
    { accion: 'insertar' },
  )
})

test('el mismo mail con el mismo alcance y PRENDIDO es duplicado, no un alta', () => {
  assert.deepEqual(decidirAlta([fila({})], { mail: 'marta@x.com', obraId: null }), { accion: 'duplicado' })
  assert.deepEqual(
    decidirAlta([fila({ obra_id: OBRA })], { mail: 'marta@x.com', obraId: OBRA }),
    { accion: 'duplicado' },
  )
})

test('EL DEFECTO: un mail dado de baja se REACTIVA sobre su fila, no se inserta de nuevo', () => {
  // La fila apagada ocupa el índice único `(mail, cliente_id, coalesce(obra_id, ZERO))`. Insertar
  // devolvería «duplicate key» y el rastro de quién lo dio de alta la primera vez se perdería igual.
  assert.deepEqual(
    decidirAlta([fila({ id: 'vieja', activo: false })], { mail: 'marta@x.com', obraId: null }),
    { accion: 'reactivar', id: 'vieja' },
  )
})

test('el alcance forma parte de la identidad: mismo mail, otra obra, es un permiso distinto', () => {
  // `obra_id NULL` = todas las obras. Un mail con alcance total y otro apuntado a una obra conviven
  // en el índice: tratarlos como el mismo permiso impediría cargar el segundo.
  const existentes = [fila({ obra_id: null }), fila({ id: 'f2', obra_id: OBRA })]
  assert.deepEqual(decidirAlta(existentes, { mail: 'marta@x.com', obraId: OTRA }), { accion: 'insertar' })
  assert.deepEqual(decidirAlta(existentes, { mail: 'marta@x.com', obraId: OBRA }), { accion: 'duplicado' })
})

test('una baja de OTRO alcance no reactiva el que se está pidiendo', () => {
  // Si `decidirAlta` no comparara el alcance, dar de baja «todas sus obras» y después pedir «sólo la
  // Nave 2» prendería la fila vieja: el cliente volvería a ver TODAS las obras del cliente.
  assert.deepEqual(
    decidirAlta([fila({ id: 'vieja', obra_id: null, activo: false })], { mail: 'marta@x.com', obraId: OBRA }),
    { accion: 'insertar' },
  )
})

test('el mail que golpeó y DESPUÉS se habilitó deja de figurar como problema', () => {
  // Si no se saca, la lista de «intentó entrar sin permiso» crece con casos ya resueltos hasta que
  // nadie la mira — y el typo, que es el único que importa, queda escondido entre ellos.
  const golpes = [{ mail: 'marta@x.com', veces: 4 }, { mail: 'martta@x.com', veces: 2 }]
  assert.deepEqual(
    golpesSinResolver(golpes, ['marta@x.com']),
    [{ mail: 'martta@x.com', veces: 2 }],
  )
  // Sin nadie habilitado no se filtra nada: la lista entera sigue siendo trabajo.
  assert.equal(golpesSinResolver(golpes, []).length, 2)
})
