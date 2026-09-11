// El índice de Drive, en frío: sin base, sin red, sin Drive.
//
// Lo que se prueba acá no es "el script anda". Es las tres decisiones que, mal tomadas,
// rompen en producción de forma invisible:
//   1. que la fila que se guarda tenga la MISMA forma comparable que va a tener la consulta
//      (si no, el buscador no encuentra nada y el índice parece lleno);
//   2. que una fila sin cambios no se reescriba (2.465 UPDATEs cada 6 h por nada);
//   3. que un recorrido parcial NO afirme una ausencia — y que NADA se borre nunca, que era
//      el único error irreversible de todo el módulo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  FOLDER, RAIZ_ADMINISTRACION, CAMPOS_DRIVE,
  tipoLegible, emailDeOwners, raicesDesdeEnv, filaIndice, decidirEscritura, planDeAusencia,
  porQueLaRaizNoSirve, RAIZ_ARCHIVO_FISCAL, RAIZ_REPORTES_HYS,
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

// ── 3. La ausencia, que reemplazó al borrado ────────────────────────────────
//
// EL DEFECTO QUE ESTOS TESTS ATRAPAN (10/09/2026): el índice BORRABA lo que no veía. El piso
// del 70% cubría el fallo grosero y no el real —UNA carpeta con 403 y doscientas filas
// buenas que se van para siempre—. Ahora se marca, y sólo lo que faltó donde alguien sí pudo
// mirar. Si alguien revierte esto, cae toda esta sección.

/** El índice tal como está guardado: lo que importa de cada fila es de qué carpeta cuelga. */
const enCarpeta = (id, parent, ausente = false) =>
  ({ drive_file_id: id, parent_id: parent, ausente_en_drive: ausente })

test('un recorrido parcial NO marca ausentes de la carpeta que no se pudo leer', () => {
  // `cA` se listó entera; `cB` devolvió 403 y no se listó. Sus archivos no se vieron
  // NINGUNO de los dos, y la diferencia entre ellos es todo: de `a2` se sabe que no está,
  // de `b1` y `b2` no se sabe nada.
  const indiceActual = [
    enCarpeta('a1', 'cA'), enCarpeta('a2', 'cA'),
    enCarpeta('b1', 'cB'), enCarpeta('b2', 'cB'),
  ]
  const plan = planDeAusencia({
    indiceActual,
    vistos: new Set(['a1']),
    carpetasListadasEnteras: new Set(['cA']),
  })
  assert.deepEqual(plan.marcar, ['a2'])
  assert.equal(plan.intactas, 2, 'los dos de la carpeta ilegible quedan como estaban')
  assert.deepEqual(plan.revivir, [])
})

test('el archivo que desaparece de una carpeta listada entera se MARCA, no se borra', () => {
  const plan = planDeAusencia({
    indiceActual: [enCarpeta('f1', 'c1'), enCarpeta('f2', 'c1')],
    vistos: new Set(['f1']),
    carpetasListadasEnteras: new Set(['c1']),
  })
  assert.deepEqual(plan.marcar, ['f2'])
  assert.match(plan.motivo, /NADA SE BORRA/)
})

test('el archivo que reaparece se revive y conserva su fila', () => {
  const plan = planDeAusencia({
    indiceActual: [enCarpeta('f1', 'c1', true), enCarpeta('f2', 'c1', true)],
    vistos: new Set(['f1']),
    carpetasListadasEnteras: new Set(['c1']),
  })
  assert.deepEqual(plan.revivir, ['f1'], 'volvió a verse: deja de estar ausente')
  // `f2` sigue sin verse pero YA estaba marcada: no se vuelve a tocar, o `ausente_desde`
  // diría "hace seis horas" para siempre y nunca se podría contestar desde cuándo falta.
  assert.deepEqual(plan.marcar, [])
})

test('el plan NO PUEDE borrar: no existe la palabra', () => {
  // La guarda contra la regresión: si alguien vuelve a poner un `borrar` en el plan o un
  // `delete from drive_index` en el script, esto se pone rojo.
  const plan = planDeAusencia({
    indiceActual: [enCarpeta('f1', 'c1')],
    vistos: new Set(),
    carpetasListadasEnteras: new Set(['c1']),
  })
  assert.deepEqual(Object.keys(plan).sort(), ['intactas', 'marcar', 'motivo', 'revivir'])
  assert.equal(plan.borrar, undefined)
  const lib = fs.readFileSync(new URL('./drive-indice.mjs', import.meta.url), 'utf8')
  assert.ok(!/export function planDeBorrado/.test(lib),
    'planDeBorrado no puede volver a existir (la mención en el comentario cuenta la historia, no la exporta)')
  const script = fs.readFileSync(new URL('../../scripts/indexar-drive.mjs', import.meta.url), 'utf8')
  assert.ok(!/delete\s+from\s+public\.drive_index/i.test(script),
    'el indexador no puede borrar filas del catálogo')
})

test('una raíz sin recorrer no arrastra a sus archivos: sin carpeta listada no se marca nada', () => {
  const indiceActual = [enCarpeta('f1', 'c1'), enCarpeta('raiz', null)]
  const plan = planDeAusencia({ indiceActual, vistos: new Set(), carpetasListadasEnteras: new Set() })
  assert.deepEqual(plan.marcar, [])
  assert.equal(plan.intactas, 2, 'la raíz nunca se marca: nadie listó a su padre')
})

test('marcar es idempotente: correr dos veces con la misma foto no agrega nada', () => {
  const args = {
    indiceActual: [enCarpeta('f1', 'c1'), enCarpeta('f2', 'c1')],
    vistos: new Set(['f1']),
    carpetasListadasEnteras: new Set(['c1']),
  }
  assert.deepEqual(planDeAusencia(args).marcar, ['f2'])
  const yaMarcada = {
    ...args,
    indiceActual: [enCarpeta('f1', 'c1'), enCarpeta('f2', 'c1', true)],
  }
  assert.deepEqual(planDeAusencia(yaMarcada).marcar, [])
})

test('sin argumentos no explota ni afirma nada', () => {
  const plan = planDeAusencia()
  assert.deepEqual(plan.marcar, [])
  assert.deepEqual(plan.revivir, [])
})

// ── 3 bis. La papelera y el contenido ───────────────────────────────────────

test('md5 y trashed llegan a la fila normalizada', () => {
  const f = filaIndice(
    archivo({ md5Checksum: 'd41d8cd98f00b204e9800998ecf8427e', trashed: true, webViewLink: 'https://drive.google.com/file/d/f1/view' }),
    { path: 'administracion/x' })
  assert.equal(f.md5, 'd41d8cd98f00b204e9800998ecf8427e')
  assert.equal(f.trashed, true)
  assert.equal(f.web_view_link, 'https://drive.google.com/file/d/f1/view')
  // Y se le piden a Drive: una columna que el fetch no trae se llena de null en silencio.
  for (const c of ['md5Checksum', 'trashed', 'webViewLink']) {
    assert.ok(CAMPOS_DRIVE.includes(c), `CAMPOS_DRIVE no pide ${c}`)
  }
})

test('un Doc nativo no tiene md5 y eso NO se rellena con nada', () => {
  const f = filaIndice(archivo({ mimeType: 'application/vnd.google-apps.document' }), { path: 'administracion/x' })
  assert.equal(f.md5, null, 'un md5 inventado es peor que ninguno: una comparación lo creería')
  assert.equal(f.trashed, false, 'sin dato, un archivo NO está en la papelera')
  assert.equal(f.web_view_link, null)
})

test('el md5 distinto reescribe la fila aunque los metadatos digan que no cambió nada', () => {
  // El hash es de metadatos: una restauración de versión o una escritura por API pueden
  // dejar `modifiedTime` quieto sobre bytes distintos, y ahí el hash dice "igual".
  const f = filaIndice(archivo({ md5Checksum: 'bbb' }), { path: 'administracion/x' })
  const previa = new Map([[f.drive_file_id, { hash: f.hash, owner_email: f.owner_email, md5: 'aaa', trashed: false }]])
  assert.equal(decidirEscritura(f, previa), 'actualizar')
  const igual = new Map([[f.drive_file_id, { hash: f.hash, owner_email: f.owner_email, md5: 'bbb', trashed: false }]])
  assert.equal(decidirEscritura(f, igual), 'omitir')
})

test('el md5 faltante se rellena una vez (backfill de las 4.232 filas viejas) y el trashed desconocido no dispara nada', () => {
  const f = filaIndice(archivo({ md5Checksum: 'bbb' }), { path: 'administracion/x' })
  assert.equal(decidirEscritura(f, new Map([[f.drive_file_id, { hash: f.hash, owner_email: f.owner_email, md5: null }]])), 'actualizar')
  // `trashed` ausente en lo guardado NO es `false`: es "no se sabe", y no puede provocar
  // 4.232 UPDATEs la primera vez que corra el código nuevo.
  const sinMd5 = filaIndice(archivo(), { path: 'administracion/x' })
  assert.equal(decidirEscritura(sinMd5, new Map([[sinMd5.drive_file_id, { hash: sinMd5.hash, owner_email: sinMd5.owner_email }]])), 'omitir')
})

test('mandar un archivo a la papelera reescribe su fila', () => {
  const f = filaIndice(archivo({ trashed: true }), { path: 'administracion/x' })
  assert.equal(decidirEscritura(f, new Map([[f.drive_file_id, { hash: f.hash, owner_email: f.owner_email, trashed: false }]])), 'actualizar')
})

test('una raíz en la papelera ABORTA la corrida, no la convierte en un vaciado', () => {
  // Drive devuelve la carpeta por id y la lista vacía SIN error: con el plan de ausencia,
  // eso marcaría ausente el data room entero.
  assert.match(porQueLaRaizNoSirve({ trashed: true, mimeType: FOLDER }), /PAPELERA/)
  assert.match(porQueLaRaizNoSirve(null), /no existe|acceso/)
  assert.match(porQueLaRaizNoSirve({ mimeType: 'application/pdf' }), /no es una carpeta/)
  assert.equal(porQueLaRaizNoSirve({ trashed: false, mimeType: FOLDER }), null)
})

// ── 4. Multi-raíz ────────────────────────────────────────────────────────────

// EL DEFECTO QUE ESTE TEST ATRAPA (07/09/2026): `archivo-fiscal` fuera del default.
// Las DDJJ F931 viven ahí y NO adentro de `administracion`. Con una sola raíz por defecto y sin
// `ORQ_DRIVE_INDEX_ROOTS` en `worker.env`, esa carpeta se indexó UNA vez —el 19/08, a mano— y
// después quedó congelada: el F931 de agosto se subió el 05/09 y el OS siguió diciendo que la
// última declaración era la de julio. Si alguien vuelve a dejar una sola raíz acá, esto grita.
// Y DESDE EL 11/09/2026, LA TERCERA: `Reportes de gestión HyS`, la carpeta nueva de la raíz del data
// room con una subcarpeta por obra. Entró al código y no a `ORQ_DRIVE_INDEX_ROOTS` porque esa
// variable REEMPLAZA la lista: puesta con una sola carpeta, apaga las otras dos en silencio.
test('sin configuración se indexan las TRES raíces: administracion, archivo-fiscal y los reportes de HyS', () => {
  const esperado = [
    { id: RAIZ_ADMINISTRACION, rotulo: 'administracion' },
    { id: RAIZ_ARCHIVO_FISCAL, rotulo: 'archivo-fiscal' },
    { id: RAIZ_REPORTES_HYS, rotulo: 'reportes-hys' },
  ]
  assert.deepEqual(raicesDesdeEnv({}), esperado)
  assert.deepEqual(raicesDesdeEnv({ ORQ_DRIVE_INDEX_ROOTS: '   ' }), esperado)
  // Y NO SE COMPARTE LA REFERENCIA: quien la reciba puede mutarla sin envenenar el default de la
  // próxima llamada. `Object.freeze` protege el array, no los objetos de adentro.
  const a = raicesDesdeEnv({})
  a[0].rotulo = 'pisado'
  assert.equal(raicesDesdeEnv({})[0].rotulo, 'administracion')
})

test('varias raíces forman un solo índice lógico', () => {
  const r = raicesDesdeEnv({ ORQ_DRIVE_INDEX_ROOTS: 'id-1, id-2:obras , id-1' })
  assert.deepEqual(r, [{ id: 'id-1', rotulo: null }, { id: 'id-2', rotulo: 'obras' }])
})
