// El índice de Drive, en frío: sin base, sin red, sin Drive.
//
// Lo que se prueba acá no es "el script anda". Es las tres decisiones que, mal tomadas,
// rompen en producción de forma invisible:
//   1. que la fila que se guarda tenga la MISMA forma comparable que va a tener la consulta
//      (si no, el buscador no encuentra nada y el índice parece lleno);
//   2. que una fila sin cambios no se reescriba (2.465 UPDATEs cada 6 h por nada);
//   3. que un recorrido parcial NO borre — el único error irreversible de todo el módulo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FOLDER, RAIZ_ADMINISTRACION, PISO_BORRADO,
  tipoLegible, emailDeOwners, raicesDesdeEnv, filaIndice, decidirEscritura, planDeBorrado,
} from './drive-indice.mjs'
import { tokenizar } from './drive-busqueda/normalizar.mjs'

const archivo = (extra = {}) => ({
  id: 'f1',
  name: 'Flujo de Caja - Cash Flow ECSAS',
  mimeType: 'application/vnd.google-apps.spreadsheet',
  modifiedTime: '2026-07-30T12:00:00.000Z',
  owners: [{ emailAddress: 'Jorge@ecsas.com.ar' }],
  ...extra,
})
const fila = (extra = {}, sitio = {}) =>
  filaIndice(archivo(extra), { path: 'administracion/FINANZAS/Flujo de Caja - Cash Flow ECSAS', depth: 2, parentId: 'p1', ...sitio })

// ── 1. La forma comparable ───────────────────────────────────────────────────

test('la fila trae las columnas de búsqueda calculadas', () => {
  const f = fila()
  assert.equal(f.nombre_norm, 'flujo de caja cash flow ecsas')
  assert.equal(f.path_norm, 'administracion finanzas flujo de caja cash flow ecsas')
  assert.equal(f.tipo, 'planilla')
  assert.equal(f.is_folder, false)
  assert.ok(f.hash && f.hash.length === 16, 'el hash tiene que ser la huella corta')
})

test('los tokens del archivo son EXACTAMENTE los que produce la consulta equivalente', () => {
  // Ésta es la propiedad que sostiene todo: si el indexador tokenizara distinto que el
  // buscador, el índice y la consulta hablarían idiomas distintos.
  const f = fila()
  for (const t of tokenizar('flujo de caja cash flow ecsas')) {
    assert.ok(f.tokens.includes(t), `falta el token "${t}" que la consulta sí produce`)
  }
})

test('la extensión y la puntuación no ensucian los tokens', () => {
  const f = filaIndice(archivo({ name: 'Curva de Avance Fisico.xlsx' }), { path: 'administracion/OBRAS/Curva de Avance Fisico.xlsx' })
  assert.ok(!f.tokens.some((t) => t === 'xlsx'), 'la extensión no es una palabra que alguien busque')
  assert.ok(f.tokens.includes('avance'))
  assert.equal(f.nombre_norm, 'curva de avance fisico')
})

test('acentos y barras: "Vision / Tracción" se guarda como se pide', () => {
  const f = filaIndice(archivo({ name: 'Vision / Tracción' }), { path: 'administracion/ESTRATEGIA/Vision / Tracción' })
  assert.deepEqual(f.tokens.slice(0, 2), ['vision', 'traccion'])
  assert.ok(f.tokens.includes('estrategia'), 'la ruta también identifica: se busca por carpeta')
})

test('ningún archivo real queda sin tokens', () => {
  for (const n of ['PLANILLA DE GASTOS.pdf', 'Avances de Obra', 'Daily Meeting - Echegaray Construcciones']) {
    assert.ok(filaIndice(archivo({ name: n }), { path: `administracion/${n}` }).tokens.length > 0, `"${n}" quedó sin tokens`)
  }
})

test('el tipo legible traduce el mime a la palabra que usa una persona', () => {
  assert.equal(tipoLegible(FOLDER), 'carpeta')
  assert.equal(tipoLegible('application/pdf'), 'pdf')
  assert.equal(tipoLegible('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'documento')
  assert.equal(tipoLegible('image/jpeg'), 'imagen')
  assert.equal(tipoLegible('application/zip'), 'archivo')
})

test('el dueño se normaliza a minúsculas y se acepta que no exista', () => {
  assert.equal(fila().owner_email, 'jorge@ecsas.com.ar')
  // En una unidad compartida la dueña es la unidad: no hay email y no se inventa uno.
  assert.equal(emailDeOwners(undefined), null)
  assert.equal(emailDeOwners([]), null)
  assert.equal(filaIndice(archivo({ owners: [] }), { path: 'x' }).owner_email, null)
})

// ── 2. Lo incremental ────────────────────────────────────────────────────────

test('hash igual → NO se reescribe', () => {
  const f = fila()
  assert.equal(decidirEscritura(f, new Map([[f.drive_file_id, { hash: f.hash, owner_email: f.owner_email }]])), 'omitir')
})

test('hash distinto → se reescribe', () => {
  const f = fila()
  const renombrado = fila({ name: 'Flujo de Caja - Cash Flow ECSAS (viejo)' })
  assert.notEqual(f.hash, renombrado.hash, 'renombrar tiene que cambiar el hash')
  assert.equal(decidirEscritura(renombrado, new Map([[f.drive_file_id, { hash: f.hash }]])), 'actualizar')
})

test('moverlo de carpeta también cambia el hash: la ruta es parte de cómo se busca', () => {
  const original = fila()
  const movido = fila({}, { path: 'administracion/ARCHIVO 2025/Flujo de Caja - Cash Flow ECSAS' })
  assert.notEqual(original.hash, movido.hash)
})

test('lo que nunca se vio se inserta', () => {
  assert.equal(decidirEscritura(fila(), new Map()), 'insertar')
})

test('una fila vieja sin hash se reescribe una vez (las 2.465 que ya estaban)', () => {
  const f = fila()
  assert.equal(decidirEscritura(f, new Map([[f.drive_file_id, { hash: null }]])), 'actualizar')
})

test('el dueño faltante se rellena aunque el hash coincida, y sólo una vez', () => {
  // owner_email no entra en el hash a propósito (no cambia cómo se busca) y el backfill no
  // lo puede completar. Sin esta excepción, un archivo que nadie toca nunca tendría dueño.
  const f = fila()
  assert.equal(decidirEscritura(f, new Map([[f.drive_file_id, { hash: f.hash, owner_email: null }]])), 'actualizar')
  assert.equal(decidirEscritura(f, new Map([[f.drive_file_id, { hash: f.hash, owner_email: 'jorge@ecsas.com.ar' }]])), 'omitir')
})

test('recalcular la misma entrada da el mismo hash (o el incremental no sirve)', () => {
  assert.equal(fila().hash, fila().hash)
})

// ── 3. El borrado, que es el error irreversible ──────────────────────────────

const previos = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']

test('lo que desapareció de Drive se saca del índice', () => {
  const plan = planDeBorrado({ vistos: new Set(previos.filter((x) => x !== 'j')), enBase: previos, corridaCompleta: true })
  assert.deepEqual(plan.borrar, ['j'])
})

test('una corrida que no terminó NO borra nada', () => {
  const plan = planDeBorrado({ vistos: new Set(['a']), enBase: previos, corridaCompleta: false })
  assert.deepEqual(plan.borrar, [])
  assert.match(plan.motivo, /no terminó/)
})

test('un solo error de lectura bloquea el borrado entero', () => {
  // Una carpeta ilegible no dice "está vacía", dice "no sé qué hay adentro".
  const plan = planDeBorrado({ vistos: new Set(previos.slice(0, 9)), enBase: previos, corridaCompleta: true, errores: 1 })
  assert.deepEqual(plan.borrar, [])
  assert.match(plan.motivo, /error/)
})

test('una corrida que vio la mitad del índice se considera parcial y no borra', () => {
  const plan = planDeBorrado({ vistos: new Set(previos.slice(0, 5)), enBase: previos, corridaCompleta: true })
  assert.deepEqual(plan.borrar, [])
  assert.match(plan.motivo, /parcial/)
  assert.ok(PISO_BORRADO > 0.5 && PISO_BORRADO < 1)
})

test('sin nada previo (índice vacío) no divide por cero ni borra', () => {
  const plan = planDeBorrado({ vistos: new Set(['a']), enBase: [], corridaCompleta: true })
  assert.deepEqual(plan.borrar, [])
})

test('si no faltó ninguno, no hay borrado', () => {
  assert.deepEqual(planDeBorrado({ vistos: new Set(previos), enBase: previos, corridaCompleta: true }).borrar, [])
})

// ── 4. Multi-raíz ────────────────────────────────────────────────────────────

test('sin configuración, la única raíz sigue siendo administracion', () => {
  assert.deepEqual(raicesDesdeEnv({}), [{ id: RAIZ_ADMINISTRACION, rotulo: 'administracion' }])
  assert.deepEqual(raicesDesdeEnv({ ORQ_DRIVE_INDEX_ROOTS: '   ' }), [{ id: RAIZ_ADMINISTRACION, rotulo: 'administracion' }])
})

test('varias raíces forman un solo índice lógico', () => {
  const r = raicesDesdeEnv({ ORQ_DRIVE_INDEX_ROOTS: 'id-1, id-2:obras , id-1' })
  assert.deepEqual(r, [{ id: 'id-1', rotulo: null }, { id: 'id-2', rotulo: 'obras' }])
})
