// POR QUÉ FALLÓ UN PASO — que el `✗` señale la causa y no la primera línea que se imprimió.
//
// ═══ EL DEFECTO, MEDIDO ═══
//
// El 13 y el 14/08/2026, doce corridas seguidas del pipeline reportaron:
//
//     ✗ proveedores-materiales-pestana.mjs Proveedores (notas de crédito, ARCA y control) + Materiales
//        ⚠ VENTAS (no es de esta pestaña): 6 factura(s) emitidas que Cobranzas no tiene, $129.499.724.
//
// Esa segunda línea NO era la causa: es un aviso informativo sobre otra pestaña que el script imprime
// al principio, y el runner tomaba `stderr.split('\n')[0]`. El motivo real nunca apareció en el log, y
// el aviso quedó señalado como culpable con toda la autoridad de un `✗` — se investigó lo que no
// estaba roto.
//
// Estos tests son sobre el runner, no sobre el paso: el motivo se busca de atrás para adelante y se
// saltean las líneas que ya llevan la marca de aviso.
import test from 'node:test'
import assert from 'node:assert/strict'
import { motivoDeFalla, sumarRespetadas, informeRespetadas } from './flujo-caja-rehacer-todo.mjs'

/** El caso real: un aviso primero, la causa mucho después. */
const STDERR_REAL = [
  '  ▲ VENTAS (no es de esta pestaña): 6 factura(s) emitidas que Cobranzas no tiene, $ 129.499.724.',
  '     0001-00000220  30/07/2026  CUIT 30716699648  $ 37.510.000',
  '⚠ el cruce contra ARCA no cierra: diferencia 1204, 601 de 602 comprobantes clasificados',
  'ERROR: no encontré "NOTAS DE CRÉDITO" en la columna A de la pestaña',
].join('\n')

test('el motivo es la ÚLTIMA línea que explica, no la primera que se imprimió', () => {
  const m = motivoDeFalla({ stderr: STDERR_REAL, code: 1 })
  assert.match(m, /no encontré "NOTAS DE CRÉDITO"/)
  assert.doesNotMatch(m, /VENTAS/, 'un aviso sobre otra pestaña no puede figurar como la causa del fallo')
})

test('las líneas marcadas como aviso se saltean aunque sean las últimas', () => {
  const m = motivoDeFalla({ stderr: 'ERROR: la frontera cae dentro de una dinámica\n  ▲ 5 notas más largas que la columna', code: 1 })
  assert.match(m, /la frontera cae dentro de una dinámica/)
})

test('si en stderr SÓLO hay avisos, se dice eso — no se cae a la primera y se la disfraza de causa', () => {
  const m = motivoDeFalla({ stderr: '  ▲ VENTAS: 6 facturas, $129.499.724\n  ▲ 5 notas cortadas', code: 1 })
  assert.match(m, /sólo hay avisos/)
  assert.match(m, /código 1/)
  assert.doesNotMatch(m, /VENTAS/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL SEGUNDO MOTIVO FALSO, CON EL FILTRO YA PUESTO (14/08/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El resumen del servicio decía, literal:
//
//     1 FALLARON:
//       · proveedores-materiales-pestana.mjs: 0001-00000214  →  Cobranzas fila 38
//
// Eso es la línea de DETALLE de un aviso informativo (`○`) sobre facturas emitidas numeradas sin su
// punto de venta — trabajo de carga de OTRA pestaña, y ni siquiera un problema. Pasó el filtro porque
// su titular lleva `○` y no `⚠`. Y el motivo REAL —"⚠ 22 celdas en error"— salía por STDOUT, que esta
// función no miraba: el paso imprime su veredicto con console.log y su código de salida sale de ahí.

const STDERR_DETALLES = [
  '  ⚠ VENTAS (no es de esta pestaña): 6 factura(s) emitidas SIN RASTRO en Cobranzas, $ 54.625.304.',
  '     0001-00000220  30/07/2026  CUIT 30716699648  $ 37.510.000',
  '  ○ 1 factura(s) SÍ están en Cobranzas con el N° tipeado sin su punto de venta ($ 4.900.000):',
  '     0001-00000214  →  Cobranzas fila 38',
].join('\n')

test('una línea de DETALLE de un aviso no es la causa: cuelga de su titular, no explica nada', () => {
  const m = motivoDeFalla({ stderr: STDERR_DETALLES, stdout: '', code: 1 })
  assert.doesNotMatch(m, /0001-00000214/, 'el detalle de un aviso informativo no puede figurar como la causa')
  assert.match(m, /sólo hay avisos/)
})

test('cuando el veredicto salió por STDOUT, la causa se busca ahí — que es donde el paso decidió su código', () => {
  const stdout = [
    '  Proveedores                       199 filas x 16 columnas (filas 110–308 de la pestaña)',
    '  ⚠ RANGO CON NOMBRE QUE QUEDÓ MAL: ARCA_SIN_CARGAR_N vive en Proveedores!B128 = "30-56736337-2"',
    '',
    '⚠ 22 celdas en error: NO retiro la pestaña vieja',
  ].join('\n')
  const m = motivoDeFalla({ stderr: STDERR_DETALLES, stdout, code: 1 })
  assert.match(m, /22 celdas en error/)
  assert.doesNotMatch(m, /0001-00000214/)
})

test('un ⛔ o un ⏭ de stdout también explican: son los otros dos veredictos de este repo', () => {
  for (const v of ['⛔ Proveedores: no pude ubicar la frontera — no escribo una sola celda',
    '⏭ "Proveedores" no se escribió en esta corrida']) {
    assert.match(motivoDeFalla({ stderr: '  ○ un detalle', stdout: `algo\n${v}`, code: 1 }), /Proveedores/)
  }
})

test('stdout SIN veredicto no inventa una causa: una línea cualquiera del log no explica el fallo', () => {
  const m = motivoDeFalla({ stderr: STDERR_DETALLES, stdout: 'Compras por encabezado: Rubro=AC\n  ✓ todo bien', code: 1 })
  assert.match(m, /sólo hay avisos/)
  assert.doesNotMatch(m, /Rubro=AC/)
})

test('stderr con una causa REAL sigue ganándole a stdout: lo más cercano a la muerte manda', () => {
  const m = motivoDeFalla({ stderr: `${STDERR_DETALLES}\nERROR: no pude leer el texto visible de "Proveedores"`, stdout: '⚠ 22 celdas en error', code: 1 })
  assert.match(m, /no pude leer el texto visible/)
})

test('sin stderr queda el mensaje del error: un ENOENT o un timeout siguen siendo legibles', () => {
  assert.match(motivoDeFalla({ message: 'spawn ENOENT' }), /ENOENT/)
  assert.match(motivoDeFalla({ stderr: '', message: 'Command failed: timeout' }), /timeout/)
  assert.match(motivoDeFalla(), /sin stderr/)
})

test('el motivo se recorta: una línea de mil caracteres no puede tapar el resumen del pipeline', () => {
  assert.ok(motivoDeFalla({ stderr: `ERROR: ${'x'.repeat(2000)}` }).length <= 220)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Y LA MINA QUE ESTE MISMO TEST PISÓ (14/08/2026)
//
// El archivo terminaba en `main()` a secas. Escribir el test de arriba —un `import` de una función
// PURA— arrancó la reescritura del Sheet real. Frenó el guardián de generadores por casualidad: la
// rama tenía un generador sin resolver. En main limpio, importar este módulo reescribe catorce
// pestañas. El hecho de que este test EXISTA y termine es parte de la prueba; el assert lo deja dicho.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('importar el runner NO arranca el pipeline: `main()` va detrás de la guarda de entrada', async () => {
  const { readFileSync } = await import('node:fs')
  const fuente = readFileSync(new URL('./flujo-caja-rehacer-todo.mjs', import.meta.url), 'utf8')
  assert.match(fuente, /if \(import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`\) \{\s*\n\s*main\(\)/,
    'main() sin guarda: cualquier import de este módulo reescribe el Sheet real')
  assert.doesNotMatch(fuente, /^main\(\)/m, 'quedó una llamada a main() en el tope del módulo')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CIERRE DICE QUÉ SE RESPETÓ (03/09)
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('sumarRespetadas: junta lo que declaró cada paso, por pestaña', () => {
  const acc = new Map()
  sumarRespetadas('✓ algo\n  ✋ 2 celda(s) tuya(s) respetada(s) en Proveedores: D11, B7\notra línea', acc)
  sumarRespetadas('  ✋ 1 celda(s) tuya(s) respetada(s) en Proveedores: Q45', acc)
  sumarRespetadas('  ✋ 30 celda(s) tuya(s) respetada(s) en CAJA: A1, A2, … y 28 más', acc)
  assert.equal(acc.get('Proveedores').celdas, 3)
  assert.deepEqual(acc.get('Proveedores').muestra, ['D11', 'B7', 'Q45'])
  assert.equal(acc.get('CAJA').celdas, 30)
  assert.deepEqual(acc.get('CAJA').muestra, ['A1', 'A2'], 'el «… y N más» no es una celda')
})

test('informeRespetadas: no dice nada cuando no se respetó nada', () => {
  assert.deepEqual(informeRespetadas(new Map()), [])
  const lineas = informeRespetadas(sumarRespetadas('  ✋ 2 celda(s) tuya(s) respetada(s) en CAJA: A1, B2'))
  assert.match(lineas[0], /2 celda\(s\) tuya\(s\) respetada\(s\) en esta corrida/)
  assert.match(lineas[1], /· CAJA: 2 \(A1, B2\)/)
})

// ═══ LOS DOS AVISOS FALSOS DEL VERIFICADOR DE LOS CASH FLOW (17/09/2026) ═══
test('uriDelAtajo lee el enlace donde Sheets lo guarda: la celda LEÍDA de Cash Flow Mensual A3 el 17/09', async () => {
  const { uriDelAtajo } = await import('./flujo-caja-rehacer-todo.mjs')
  const leida = { formattedValue: 'Mes actual: J  ·  Septiembre 2026', userEnteredFormat: { textFormat: { link: { uri: '#gid=212425236&range=J7' } } }, hyperlink: '#gid=212425236&range=J7' }
  assert.equal(uriDelAtajo(leida), '#gid=212425236&range=J7')
  assert.equal(uriDelAtajo({ userEnteredFormat: leida.userEnteredFormat }), '#gid=212425236&range=J7')
  assert.equal(uriDelAtajo({ textFormatRuns: [{ format: { link: { uri: '#gid=1&range=A1' } } }] }), '#gid=1&range=A1')
  assert.equal(uriDelAtajo({ formattedValue: 'Semana actual: AM  ·  14/09' }), '', 'sin enlace sigue siendo sin enlace: el control puede dar rojo')
})

test('anchosRaros compara contra el ancho del generador, no contra un 96 tipeado', async () => {
  const { anchosRaros } = await import('./flujo-caja-rehacer-todo.mjs')
  const { ANCHOS } = await import('../lib/cash-flow-piel-matriz.mjs')
  const sanas = [260, ...Array(12).fill(ANCHOS.tiempo), 110]
  assert.deepEqual(anchosRaros(sanas, 13), [])
  const tocada = [...sanas]; tocada[5] = 140
  assert.deepEqual(anchosRaros(tocada, 13), [{ i: 5, px: 140 }], 'una columna que alguien ensanchó sigue saliendo')
})

// ═══ EL CORTE DEL PIPELINE, PROBADO (17/09/2026) ═══
// Lo que se afirma es QUÉ PASOS SE LLEGAN A CORRER. Sin el `break` de `recorrerPasos`, estos dan rojo.
const PASOS_DE_PRUEBA = [
  ['rubro-caja-sheet.mjs', 'rubro'],
  ['freno-derrames-compras.mjs', 'freno'],
  ['libro-movimientos-pestana.mjs', 'libro', ['_MOVIMIENTOS']],
  ['caja-pestana.mjs', 'CAJA', ['CAJA']],
  ['cash-flow-vistas.mjs', 'vistas', ['Cash Flow Semanal']],
]
const falla = (code) => Object.assign(new Error(`salió con ${code}`), { code, stderr: '✗✗ algo' })

async function recorrer(fallas) {
  const { recorrerPasos } = await import('./flujo-caja-rehacer-todo.mjs')
  const fallados = []
  const r = await recorrerPasos(PASOS_DE_PRUEBA, {
    correr: async ({ script }) => { if (script in fallas) throw falla(fallas[script]) },
    alFallar: ({ script, freno }) => { fallados.push(script); return freno.frena ? `frenó ${script}` : null },
    log: () => {},
  })
  return { ...r, fallados }
}

test('FRENO DE DERRAMES: si falla, no corre NINGÚN paso de abajo', async () => {
  const r = await recorrer({ 'freno-derrames-compras.mjs': 1 })
  assert.deepEqual(r.corridos, ['rubro-caja-sheet.mjs', 'freno-derrames-compras.mjs'])
  assert.deepEqual(r.frenado, { script: 'freno-derrames-compras.mjs', motivo: 'frenó freno-derrames-compras.mjs', faltan: 3 })
})

test('LIBRO CON SALIDA 3 (caída contra la vigente): CAJA y los Cash Flow no corren', async () => {
  const r = await recorrer({ 'libro-movimientos-pestana.mjs': 3 })
  assert.deepEqual(r.corridos, ['rubro-caja-sheet.mjs', 'freno-derrames-compras.mjs', 'libro-movimientos-pestana.mjs'])
  assert.equal(r.frenado?.script, 'libro-movimientos-pestana.mjs')
})

test('LIBRO CON OTRO ERROR (salida 1): falla como siempre y lo de abajo corre con el _MOVIMIENTOS anterior', async () => {
  const r = await recorrer({ 'libro-movimientos-pestana.mjs': 1 })
  assert.equal(r.frenado, null)
  assert.deepEqual(r.fallados, ['libro-movimientos-pestana.mjs'])
  assert.deepEqual(r.corridos, PASOS_DE_PRUEBA.map((p) => p[0]))
})

test('un paso común que falla no detiene la corrida, aunque salga con 3', async () => {
  const r = await recorrer({ 'rubro-caja-sheet.mjs': 3 })
  assert.equal(r.frenado, null)
  assert.equal(r.corridos.length, PASOS_DE_PRUEBA.length)
})

test('decisionDeFreno: toma la salida del proceso hijo y cuenta los pasos que quedan', async () => {
  const { decisionDeFreno } = await import('./flujo-caja-rehacer-todo.mjs')
  assert.deepEqual(decisionDeFreno(PASOS_DE_PRUEBA, 2, falla(3)), { frena: true, codigo: 3, faltan: 2 })
  assert.deepEqual(decisionDeFreno(PASOS_DE_PRUEBA, 2, new Error('sin code')), { frena: false, codigo: null, faltan: 2 })
})

// ═══ EL PRESUPUESTO DE TIEMPO (25/09/2026) ═══
// Desde el 24/09 21:19 systemd mataba la corrida a los 40 min, a mitad de un paso. Lo que se afirma:
// un paso que no alcanza a terminar NO EMPIEZA, y los que quedan se dicen por su nombre.
test('PRESUPUESTO: con tiempo de sobra corren todos y no queda ninguno sin tiempo', async () => {
  const { recorrerPasos } = await import('./flujo-caja-rehacer-todo.mjs')
  const r = await recorrerPasos(PASOS_DE_PRUEBA, { correr: async () => {}, alFallar: () => null, log: () => {}, quedaMs: () => 3_600_000 })
  assert.equal(r.corridos.length, PASOS_DE_PRUEBA.length)
  assert.deepEqual(r.sinTiempo, [])
})

test('PRESUPUESTO: cuando lo que queda no cubre el techo del paso, ése y los de abajo NO empiezan', async () => {
  const { recorrerPasos, TECHO_PASO_MS } = await import('./flujo-caja-rehacer-todo.mjs')
  let queda = TECHO_PASO_MS + 120_000
  const r = await recorrerPasos(PASOS_DE_PRUEBA, {
    correr: async () => { queda -= 60_000 }, // cada paso gasta un minuto
    alFallar: () => null, log: () => {}, quedaMs: () => queda,
  })
  assert.deepEqual(r.corridos, ['rubro-caja-sheet.mjs', 'freno-derrames-compras.mjs', 'libro-movimientos-pestana.mjs'])
  assert.deepEqual(r.sinTiempo, ['caja-pestana.mjs', 'cash-flow-vistas.mjs'])
  assert.equal(r.frenado, null)
})

test('PRESUPUESTO: un paso candado no figura como «sin tiempo» (no iba a correr igual)', async () => {
  const { recorrerPasos } = await import('./flujo-caja-rehacer-todo.mjs')
  const r = await recorrerPasos(PASOS_DE_PRUEBA, {
    correr: async () => {}, alFallar: () => null, log: () => {}, quedaMs: () => 0,
    bloqueado: (p) => p.includes('CAJA'),
  })
  assert.deepEqual(r.corridos, [])
  assert.ok(!r.sinTiempo.includes('caja-pestana.mjs'))
  assert.equal(r.sinTiempo.length, PASOS_DE_PRUEBA.length - 1)
})

test('presupuesto(): 0 o vacío = sin límite; con segundos, cuenta desde el arranque del proceso', async () => {
  const { presupuesto } = await import('./flujo-caja-rehacer-todo.mjs')
  assert.equal(presupuesto(undefined)(), Infinity)
  assert.equal(presupuesto('0')(), Infinity)
  let ahora = 1_000_000
  const q = presupuesto('2160', 1_000_000, () => ahora)
  assert.equal(q(), 2_160_000)
  ahora += 600_000
  assert.equal(q(), 1_560_000)
})

test('grupoDeArgs: --grupo=datos, --grupo vistas y sin grupo', async () => {
  const { grupoDeArgs } = await import('./flujo-caja-rehacer-todo.mjs')
  assert.equal(grupoDeArgs(['--grupo=datos']), 'datos')
  assert.equal(grupoDeArgs(['--dry', '--grupo', 'vistas']), 'vistas')
  assert.equal(grupoDeArgs(['--dry']), null)
})

test('encadenado: sólo la corrida de DATOS arranca la de vistas, y no si frenó', async () => {
  const { decidirEncadenado } = await import('./flujo-caja-rehacer-todo.mjs')
  const u = 'echegaray-flujo-caja-vistas.service'
  assert.equal(decidirEncadenado({ grupo: 'datos', frenado: null, siguiente: u }).lanzar, true)
  assert.equal(decidirEncadenado({ grupo: 'datos', frenado: { script: 'freno-derrames-compras.mjs' }, siguiente: u }).lanzar, false)
  assert.equal(decidirEncadenado({ grupo: 'vistas', frenado: null, siguiente: u }), null, 'las vistas no encadenan nada')
  assert.equal(decidirEncadenado({ grupo: 'datos', frenado: null, siguiente: '' }), null, 'una corrida a mano no dispara nada')
  assert.equal(decidirEncadenado({ grupo: null, frenado: null, siguiente: u }), null, 'la corrida completa ya incluye las vistas')
})

// ═══ EL PRE-PASO EN PARALELO (25/09/2026) ═══
// 22 lecturas en serie se llevaron 18 min a las 10:06: Google tiene ventanas en que toda lectura espera
// 90–150 s. En paralelo la ventana se paga una vez. Lo que se afirma: a lo sumo `n` en vuelo, el orden
// del resultado es el de la entrada y un elemento que falla no voltea a los demás.
test('enParalelo: respeta el tope, el orden y aísla la falla', async () => {
  const { enParalelo } = await import('./flujo-caja-rehacer-todo.mjs')
  let enVuelo = 0
  let maximo = 0
  const r = await enParalelo([5, 1, 4, 2, 3, 0], 3, async (x) => {
    enVuelo++; maximo = Math.max(maximo, enVuelo)
    await new Promise((res) => setTimeout(res, x * 3))
    enVuelo--
    if (x === 2) throw new Error('lectura colgada')
    return x * 10
  })
  assert.equal(maximo, 3)
  assert.deepEqual(r, [50, 10, 40, undefined, 30, 0])
  assert.deepEqual(await enParalelo([], 6, async () => 1), [])
})
