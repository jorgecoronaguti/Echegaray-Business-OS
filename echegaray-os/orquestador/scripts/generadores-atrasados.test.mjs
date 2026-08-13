// EL CONTROL QUE EVITA QUE UN GENERADOR VIEJO LE BORRE DATOS AL DUEÑO — probado como se prueba un
// control: intentando que dé verde cuando debería dar rojo.
//
// El caso real que motivó todo: `jornales-pestana.mjs` de main no conocía el bloque "3 · Dirección",
// la pestaña viva tenía tres retiros de $3.000.000 cargados, y correr el generador se los borraba.
// Nada lo detectaba. Los tests de abajo fijan las dos formas en que este detector podría volver a no
// detectarlo: que la clasificación deje pasar algo, o que ni siquiera mire.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  escribeSheets, veredicto, hayEvidencia, frenaElPipeline, nadieLoMiro, resumir, revisarArchivo,
  escritoresDeSheets, ramasSinMergear, MARCAS_DE_ESCRITURA, leerRegistro, estadoDeLaRama,
  blobsEnLaHistoria,
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
  assert.ok(antes.hallazgos.length, 'el detector no vio la rama: no está midiendo nada')
  assert.equal(antes.hallazgos[0].veredicto, 'REVERTIDO')

  const ahora = revisarArchivo(f, ['feat/pr2-mattermost-publico'], 'HEAD', R)
  assert.equal(ahora.hallazgos[0]?.veredicto, 'incorporado', 'con el trabajo puesto tiene que dar verde')
})

test('la señal puede vivir en OTRO archivo: un refactor no es un revert', () => {
  // El falso positivo del 13/08. `impuestos-pestana.mjs` se partió en lib/impuestos-*.mjs y el import
  // de la DDJJ oficial se mudó de carpeta: la señal atada a la ruta gritó REVERTIDO sin que se
  // hubiera perdido nada. Si esto no distingue refactor de revert, el aviso queda rojo para siempre
  // y se ignora — que es como muere un control.
  const base = { blobAntes: 'aaa', blobBase: 'bbb', senal: 'leerIVA', fuenteBase: "import { leerIVA } from '../lib/impuestos-fuentes.mjs'" }
  assert.equal(hayEvidencia({ ...base, senalesRelocalizadas: [{ texto: 'parsearDJIVA', fuente: 'const d = parsearDJIVA(pdf.text)' }] }), true)
  // Pero si la capacidad DESAPARECE del archivo al que se mudó, sigue siendo un revert.
  assert.equal(hayEvidencia({ ...base, senalesRelocalizadas: [{ texto: 'parsearDJIVA', fuente: 'const d = 0' }] }), false)
  // Y si el archivo declarado no se pudo leer, no se afirma nada: falla cerrado.
  assert.equal(hayEvidencia({ ...base, senalesRelocalizadas: [{ texto: 'parsearDJIVA', fuente: null }] }), false)
})

// ── Qué es trabajo de rama y qué es ruido ──────────────────────────────────────────────────────

test('si la base YA TUVO ese contenido, la rama está atrás y no hay nada que traer', () => {
  // `deploy/comunicacion-protegido` —el checkout desde el que corre el bot— tiene 42 commits que main
  // no tiene y 41 son merges DE main. Con `--full-history` esos merges "tocan" el archivo, así que el
  // filtro por commits los dejaba pasar: seis generadores pedían una decisión que no existe.
  const historicos = new Set(['viejo', 'anterior'])
  assert.equal(estadoDeLaRama({ blob: 'viejo', blobBase: 'nuevo', tieneCommits: true, historicosDeLaBase: historicos }), 'rama vieja')
  assert.equal(estadoDeLaRama({ blob: 'inedito', blobBase: 'nuevo', tieneCommits: true, historicosDeLaBase: historicos }), 'hallazgo')
})

test('lo que la base ya tiene idéntico no es hallazgo, y lo que la rama no tocó tampoco', () => {
  assert.equal(estadoDeLaRama({ blob: 'x', blobBase: 'x', tieneCommits: true, historicosDeLaBase: new Set() }), 'al día')
  assert.equal(estadoDeLaRama({ blob: null, blobBase: 'x', tieneCommits: true, historicosDeLaBase: new Set() }), 'al día')
  assert.equal(estadoDeLaRama({ blob: 'y', blobBase: 'x', tieneCommits: false, historicosDeLaBase: new Set() }), 'rama vieja')
})

test('una declaración de "quedó atrás" NO puede tapar un contenido distinto del declarado', () => {
  // Es el riesgo del mecanismo: que declarar algo lo silencie para siempre. Por eso se ata al BLOB.
  // Si la rama vuelve a moverse, su blob nuevo no coincide y el hallazgo reaparece.
  const c = { blobBase: 'nuevo', tieneCommits: true, historicosDeLaBase: new Set() }
  assert.equal(estadoDeLaRama({ ...c, blob: 'declarado', declaradaAtrasada: true }), 'rama vieja')
  assert.equal(estadoDeLaRama({ ...c, blob: 'otro', declaradaAtrasada: false }), 'hallazgo')
})

test('la historia de un archivo se lee entera, y sólo devuelve blobs', () => {
  // El recorrido se reescribió para hacer UN solo proceso de git en vez de uno por commit. Si el
  // parseo de `cat-file --batch-check` fallara, el set quedaría vacío y TODO parecería trabajo nuevo:
  // la falla sería silenciosa y hacia el lado ruidoso, que es el que después se desactiva.
  const blobs = blobsEnLaHistoria('HEAD', 'echegaray-os/orquestador/scripts/generadores-atrasados.mjs')
  assert.ok(blobs.size > 0, 'no encontró una sola versión de un archivo que sí tiene historia')
  for (const b of blobs) assert.match(b, /^[0-9a-f]{40}$/, `"${b}" no es un blob`)
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
  // LA BASE ES `main`, NO `HEAD`. Con `HEAD` este test afirmaba que main no aparece como rama sin
  // mergear, y eso sólo es cierto mientras main no se mueva: en este repo se mueve mientras uno
  // trabaja en su worktree, así que el test se ponía rojo por algo que no tiene nada que ver con lo
  // que mide. Un test que falla por el reloj enseña a ignorar los rojos.
  const ramas = ramasSinMergear('main')
  assert.ok(Array.isArray(ramas))
  assert.equal(ramas.includes('main'), false, 'la base no puede contarse como rama sin mergear')
  // Y lo que no es tautológico: nadie está atrasado respecto de sí mismo. Quien corre esto desde su
  // worktree está justamente produciendo ese trabajo; verse listado le tapa lo que sí tiene que mirar.
  const propia = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.equal(ramas.includes(propia), false, `la rama actual (${propia}) no puede listarse como atrasada`)
  assert.ok(ramas.every((b) => !b.startsWith('worktree-agent-')), 'los worktrees de agentes son ruido')
})

test('el registro es legible y todo lo que no se incorporó tiene motivo escrito', () => {
  // "Lo que se descarta, se descarta por escrito": una entrada sin motivo convertiría el registro en
  // un silenciador. Y sin `revisadoHasta` no hay contra qué comparar, así que no declara nada.
  const registro = leerRegistro()
  assert.ok(Object.keys(registro).length > 0, 'el registro no se pudo leer o está vacío')
  for (const [archivo, e] of Object.entries(registro)) {
    // O hay un punto de revisión contra el que comparar, o la entrada declara blobs concretos: en
    // `atrasadas` el ancla ES la clave, y por eso la declaración caduca sola cuando el blob cambia.
    assert.ok(e.revisadoHasta || Object.keys(e.atrasadas ?? {}).length,
      `${archivo}: sin revisadoHasta ni atrasadas no se puede verificar nada`)
    for (const [blob, motivo] of Object.entries(e.atrasadas ?? {})) {
      assert.match(blob, /^[0-9a-f]{40}$/, `${archivo}: "${blob}" no es un blob completo — un prefijo se puede acertar de casualidad`)
      assert.ok(motivo && motivo.length > 40, `${archivo} · ${blob}: declarado atrasado sin motivo escrito`)
    }
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
