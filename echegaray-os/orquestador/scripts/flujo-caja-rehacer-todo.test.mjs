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
import { motivoDeFalla } from './flujo-caja-rehacer-todo.mjs'

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
