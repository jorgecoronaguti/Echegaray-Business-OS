// EL CONTROL QUE EVITA QUE UN GENERADOR VIEJO LE BORRE DATOS AL DUEÑO — probado como se prueba un
// control: intentando que dé verde cuando debería dar rojo.
//
// El caso real que motivó todo: `jornales-pestana.mjs` de main no conocía el bloque "3 · Dirección",
// la pestaña viva tenía tres retiros de $3.000.000 cargados, y correr el generador se los borraba.
// Nada lo detectaba. Los tests de abajo fijan las dos formas en que este detector podría volver a no
// detectarlo: que la clasificación deje pasar algo, o que ni siquiera mire.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  escribeSheets, veredicto, hayEvidencia, frenaElPipeline, nadieLoMiro, resumir, revisarArchivo,
  escritoresDeSheets, ramasSinMergear, MARCAS_DE_ESCRITURA, leerRegistro,
} from './generadores-atrasados.mjs'

// ── Qué cuenta como "escribe Sheets" ───────────────────────────────────────────────────────────

test('un generador que escribe por el portón cuenta: es el caso que se escapaba', () => {
  // `jornales-pestana.mjs` no llama a la API de Sheets: escribe con `escribirPreservando`. Con un
  // patrón que sólo buscara `values.update` quedaba afuera — y era justo el peor.
  assert.ok(escribeSheets("import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'"))
  assert.ok(escribeSheets("import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'"))
})

test('un borrado de filas también es escribir', () => {
  // `deleteDimension` no escribe una celda: borra quince. Que no cuente como escritura es exactamente
  // el agujero que se tapó en la guarda el 03/08.
  assert.ok(escribeSheets('requests.push({ deleteDimension: { range } })'))
})

test('un lector no cuenta, y lo que no es texto tampoco', () => {
  assert.equal(escribeSheets("import { readSheetGrid } from '../lib/google.mjs'"), false)
  assert.equal(escribeSheets(null), false)
  assert.equal(escribeSheets(undefined), false)
  assert.equal(escribeSheets(123), false)
})

// ── El veredicto ───────────────────────────────────────────────────────────────────────────────

test('lo que nadie miró es SIN REVISAR, y frena el pipeline', () => {
  const v = veredicto({ cubierto: false })
  assert.equal(v, 'SIN REVISAR')
  assert.ok(nadieLoMiro(v))
  assert.ok(frenaElPipeline(v))
})

test('un motivo por rama le pone nombre al hallazgo, pero NO lo pone en verde', () => {
  // La tentación de todo registro de excepciones: que declarar algo lo silencie. Acá declarar sólo
  // cambia el texto — la diferencia con main sigue existiendo y el pipeline sigue frenado.
  const v = veredicto({ cubierto: false, motivoRama: 'rama viva de otra tanda' })
  assert.equal(v, 'pendiente')
  assert.equal(nadieLoMiro(v), false)
  assert.ok(frenaElPipeline(v), 'un motivo no puede habilitar la corrida')
})

test('"descartado" tampoco es verde: se miró y se decidió no traerlo', () => {
  const v = veredicto({ cubierto: true, decision: 'descartado' })
  assert.equal(v, 'descartado')
  assert.ok(frenaElPipeline(v))
})

test('sólo "incorporado" deja correr el pipeline', () => {
  assert.equal(veredicto({ cubierto: true, decision: 'incorporado' }), 'incorporado')
  assert.equal(frenaElPipeline('incorporado'), false)
})

test('un registro sin decisión declarada NO se asume incorporado por omisión', () => {
  // Si `decision` falta pero el blob está cubierto, el trabajo se revisó: el default es el caso
  // normal. Lo que NUNCA puede pasar por omisión es lo de arriba — un blob no cubierto.
  assert.equal(veredicto({ cubierto: true }), 'incorporado')
  assert.equal(veredicto({ cubierto: false, decision: 'incorporado' }), 'SIN REVISAR',
    'declarar el archivo no cubre una versión de rama que nadie miró')
})

// ── "Incorporado" se verifica contra el archivo, no contra el registro ─────────────────────────

test('el registro NO puede ser su propia evidencia: si el archivo volvió atrás, es REVERTIDO', () => {
  // El defecto que tuvo este mismo script: leía `decision: 'incorporado'` y devolvía verde aunque el
  // trabajo estuviera revertido. Un control no se valida contra la información que él mismo produce.
  const e = { blobAntes: 'aaa', blobBase: 'aaa' }
  assert.equal(hayEvidencia(e), false)
  assert.equal(veredicto({ cubierto: true, decision: 'incorporado', evidencia: hayEvidencia(e) }), 'REVERTIDO')
  assert.ok(nadieLoMiro('REVERTIDO'), 'un revert tiene que gritar igual que lo que nadie miró')
  assert.ok(frenaElPipeline('REVERTIDO'))
})

test('la señal detecta el revert PARCIAL, que el blob no ve', () => {
  // Alguien toca el archivo (el blob ya no es el de antes) pero saca el import que la incorporación
  // había traído. Sólo con blobAntes eso pasaría por incorporado.
  const base = { blobAntes: 'aaa', blobBase: 'bbb', senal: '../lib/direccion-retiros.mjs' }
  assert.equal(hayEvidencia({ ...base, fuenteBase: "import x from '../lib/otra.mjs'" }), false)
  assert.equal(hayEvidencia({ ...base, fuenteBase: "import { NOMBRES_DIRECCION } from '../lib/direccion-retiros.mjs'" }), true)
})

test('sin evidencia declarada no se afirma nada: la falta de prueba no es prueba', () => {
  assert.equal(hayEvidencia({ blobBase: 'bbb' }), false)
  assert.equal(veredicto({ cubierto: true, evidencia: false }), 'REVERTIDO')
})

test('EL CASO REAL: si jornales-pestana vuelve a la versión sin Dirección, esto grita', () => {
  // f4702bf es main justo antes de esta tanda: ahí el generador no tenía UNA sola mención del bloque
  // "3 · Dirección" y correrlo le borraba al dueño tres retiros de $3.000.000 ya cargados. Si alguien
  // revierte el merge, este test se pone rojo. Es la prueba del defecto, no del arreglo.
  const f = 'echegaray-os/orquestador/scripts/jornales-pestana.mjs'
  const R = leerRegistro()
  const antes = revisarArchivo(f, ['feat/pr2-mattermost-publico'], 'f4702bf', R)
  assert.ok(antes.length, 'el detector no vio la rama: no está midiendo nada')
  assert.equal(antes[0].veredicto, 'REVERTIDO')

  const ahora = revisarArchivo(f, ['feat/pr2-mattermost-publico'], 'HEAD', R)
  assert.equal(ahora[0]?.veredicto, 'incorporado', 'con el trabajo puesto tiene que dar verde')
})

// ── El resumen ─────────────────────────────────────────────────────────────────────────────────

test('en un archivo con varias ramas, lo que nadie miró tapa a lo declarado', () => {
  // Si una rama trae trabajo sin revisar y otra está declarada, mostrar la declarada escondería la
  // única que exige una decisión.
  const r = resumir([
    { archivo: 'a.mjs', rama: 'vieja', veredicto: 'descartado', motivo: 'ya resuelto mejor en main' },
    { archivo: 'a.mjs', rama: 'nueva', veredicto: 'SIN REVISAR', motivo: null },
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].veredicto, 'SIN REVISAR')
  assert.deepEqual(r[0].ramas, ['nueva'])
})

test('un archivo con todo incorporado no aparece como pendiente', () => {
  const r = resumir([{ archivo: 'b.mjs', rama: 'x', veredicto: 'incorporado', motivo: null }])
  assert.equal(frenaElPipeline(r[0].veredicto), false)
})

// ── Que además MIRE: un control que no mira nada da verde igual ─────────────────────────────────

test('el inventario encuentra generadores de verdad en este repo', () => {
  // El defecto más traicionero de este script ya ocurrió: el pathspec se interpretaba desde el CWD,
  // `ls-tree` devolvía cero archivos, y el informe decía "ningún generador atrasado" habiendo mirado
  // NADA. Un ✔ sobre cero es el peor resultado posible acá.
  const archivos = escritoresDeSheets('HEAD')
  assert.ok(archivos.length > 20, `sólo encontró ${archivos.length} generadores: el prefijo de rutas está mal`)
  assert.ok(archivos.some((f) => f.endsWith('orquestador/scripts/jornales-pestana.mjs')),
    'no está el generador que motivó este control')
  assert.ok(archivos.every((f) => !f.endsWith('.test.mjs')), 'un test no es un generador')
})

test('las ramas sin mergear se listan, y nunca la propia', () => {
  const ramas = ramasSinMergear('HEAD')
  assert.ok(Array.isArray(ramas))
  assert.equal(ramas.includes('main'), false, 'la base no puede contarse como rama sin mergear')
  assert.ok(ramas.every((b) => !b.startsWith('worktree-agent-')), 'los worktrees de agentes son ruido')
})

test('el registro es legible y todo lo que no se incorporó tiene motivo escrito', () => {
  // "Lo que se descarta, se descarta por escrito": una entrada sin motivo convertiría el registro en
  // un silenciador. Y sin `revisadoHasta` no hay contra qué comparar, así que no declara nada.
  const registro = leerRegistro()
  assert.ok(Object.keys(registro).length > 0, 'el registro no se pudo leer o está vacío')
  for (const [archivo, e] of Object.entries(registro)) {
    assert.ok(e.revisadoHasta, `${archivo}: sin revisadoHasta no se puede verificar nada`)
    if (e.decision && e.decision !== 'incorporado') {
      assert.ok(e.motivo && e.motivo.length > 40, `${archivo}: "${e.decision}" sin motivo escrito`)
    }
    if (e.decision === 'incorporado') {
      assert.ok(e.blobAntes || e.senal, `${archivo}: declarado incorporado sin una sola evidencia verificable`)
    }
    for (const [rama, motivo] of Object.entries(e.pendientes ?? {})) {
      assert.ok(motivo && motivo.length > 40, `${archivo} · ${rama}: declarado sin motivo`)
    }
  }
})

test('las marcas de escritura no se pueden vaciar sin que esto grite', () => {
  // Con la lista vacía el script no encontraría un solo generador y saldría en verde.
  assert.ok(MARCAS_DE_ESCRITURA.length >= 8)
  for (const m of ['WRITE_SCOPES', 'escribirPreservando', 'deleteDimension']) {
    assert.ok(MARCAS_DE_ESCRITURA.includes(m), `falta la marca "${m}"`)
  }
})
