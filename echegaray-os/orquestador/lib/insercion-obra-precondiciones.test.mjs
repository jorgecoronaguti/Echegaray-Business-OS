// Cada precondición tiene que poder dar ROJO: se parte de un sondeo sano y se rompe una cosa por vez.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COLUMNAS_0700, DOLAR, MARCAS, PRODUCCION, TIMERS, TIMERS_OPCIONALES, WORKER, evaluarPrecondiciones,
  parsearShow, problemaDelTipoDeCambio,
} from './insercion-obra-precondiciones.mjs'

function sano() {
  const unidades = {}
  for (const t of TIMERS) { unidades[`${t}.timer`] = { load: 'loaded', active: 'inactive' }; unidades[`${t}.service`] = { load: 'loaded', active: 'inactive' } }
  unidades[`${WORKER}.service`] = { load: 'loaded', active: 'inactive' }
  const checkout = Object.fromEntries(MARCAS.map((m) => [m.ruta, { head: `x ${m.contiene ?? ''} x`, disco: `x ${m.contiene ?? ''} x` }]))
  return {
    cwd: PRODUCCION, script: `${PRODUCCION}/orquestador/scripts/sheet-insertar-columna-obra.mjs`, checkout, unidades,
    esquema: { columnas: [...COLUMNAS_0700], cola: true, resolver: true },
  }
}
const con = (cambiar) => { const s = sano(); cambiar(s); return evaluarPrecondiciones(s) }

test('el mundo sano pasa, y el timer opcional que no está instalado no frena', () => {
  assert.deepEqual(evaluarPrecondiciones(sano()), [])
  assert.equal(TIMERS.length, 10)
})

test('(a) desde un worktree, o con producción sin este trabajo, o con cambios sin commitear: NO', () => {
  assert.match(con((s) => { s.cwd = '/home/jorge/echegaray-os/app/.claude/worktrees/x/echegaray-os' }).join(), /tiene que ser \/home\/jorge\/echegaray-os\/produccion/)
  assert.match(con((s) => { s.script = '/tmp/x/sheet-insertar-columna-obra.mjs' }).join(), /checkout de producción/)
  assert.match(con((s) => { s.checkout['orquestador/lib/columnas-por-encabezado.mjs'].head = null }).join(), /no trae este trabajo/)
  assert.match(con((s) => { s.checkout['orquestador/lib/formula-insertar-columna.mjs'].disco = 'otro' }).join(), /sin commitear/)
  assert.match(con((s) => { s.checkout['orquestador/scripts/sync-cobranzas.mjs'] = { head: 'A5:AA', disco: 'A5:AA' } }).join(), /lee por posición/)
})

test('(b) cada timer, su servicio y el worker tienen que estar quietos; un timer que no existe también frena', () => {
  assert.match(con((s) => { s.unidades['echegaray-compras-sync.timer'].active = 'active' }).join(), /echegaray-compras-sync\.timer está active/)
  assert.match(con((s) => { s.unidades['echegaray-flujo-caja.service'].active = 'activating' }).join(), /flujo-caja\.service está activating/)
  assert.match(con((s) => { s.unidades[`${WORKER}.service`].active = 'active' }).join(), /comunicacion-worker\.service está active/)
  assert.match(con((s) => { delete s.unidades['echegaray-arca-sync.timer'] }).join(), /arca-sync\.timer no existe/)
  assert.match(con((s) => { s.unidades[`${TIMERS_OPCIONALES[0]}.timer`] = { load: 'loaded', active: 'active' } }).join(), /compras-obra-cola\.timer está active/)
  assert.equal(con((s) => { s.unidades['echegaray-arca-sync.timer'].active = 'failed' }).length, 0)
})

test('(c) la 0700 aplicada: cada columna, la cola y el resolver nuevo; sin base, NO', () => {
  assert.match(con((s) => { s.esquema.columnas = s.esquema.columnas.filter((c) => c !== 'cobranzas.obra_celda') }).join(), /cobranzas\.obra_celda/)
  assert.match(con((s) => { s.esquema.cola = false }).join(), /compra_obra_cambio/)
  assert.match(con((s) => { s.esquema.resolver = false }).join(), /versión vieja/)
  assert.match(con((s) => { s.esquema = { error: 'ECONNREFUSED' } }).join(), /ECONNREFUSED/)
  assert.match(evaluarPrecondiciones({ error: 'systemctl: no bus' }).join(), /no pude verificar/)
})

test('systemctl show: bloques por unidad, incluida la que no existe', () => {
  const u = parsearShow('Id=a.timer\nLoadState=loaded\nActiveState=active\n\nId=b.service\nLoadState=not-found\nActiveState=inactive\n')
  assert.deepEqual(u, { 'a.timer': { load: 'loaded', active: 'active' }, 'b.service': { load: 'not-found', active: 'inactive' } })
})

test('no existe una bandera para saltearlas', () => {
  const script = readFileSync(join(import.meta.dirname, '..', 'scripts', 'sheet-insertar-columna-obra.mjs'), 'utf8')
  assert.doesNotMatch(script, /saltar|--sin-precondiciones|--forzar/i)
  assert.match(script, /evaluarPrecondiciones\(await sondearPrecondiciones/)
})

// ═══ EL DÓLAR (medido en dos copias de ensayo, 15/09/2026) ═══
// Con la cotización del día, la inserción dio 52 y 112 diferencias de VALOR con 0 de fórmula: todas
// colgaban de GOOGLEFINANCE. Clavado por el dueño, el archivo queda quieto.

// C111 es la cotización de Google · C112 la del dueño · C113 la que se usa. `declarado = null` deja en
// C112 la fórmula vieja que traía el archivo: la celda MUESTRA un número y no clava nada.
const bloqueDolar = (declarado) => ({
  formulas: [
    ['=IFERROR(GOOGLEFINANCE("CURRENCY:USDARS");"")'],
    [declarado == null ? '=IF(C109<>"";C109;C108)' : String(declarado)],
    ['=IF(C112<>"";C112;C111)'],
  ],
  valores: [[1505.95], [declarado == null ? 1505.95 : declarado], [declarado == null ? 1505.95 : declarado]],
})

test('EL DEFECTO: con el dólar colgando de GOOGLEFINANCE, NO se inserta', () => {
  assert.match(problemaDelTipoDeCambio(bloqueDolar(null)), /cuelga de GOOGLEFINANCE/)
  assert.match(problemaDelTipoDeCambio(bloqueDolar(null)), /_CAJA_ANEXO!C112/)
  assert.match(problemaDelTipoDeCambio(bloqueDolar(0)), /cuelga de GOOGLEFINANCE/)
  assert.match(problemaDelTipoDeCambio(bloqueDolar('')), /cuelga de GOOGLEFINANCE/)
})

test('con el dólar declarado a mano por el dueño, se puede insertar', () => {
  assert.equal(problemaDelTipoDeCambio(bloqueDolar(1480)), null)
  assert.equal(`C${DOLAR.primeraFila + DOLAR.declarado}`, 'C112', 'la celda del dueño es C112 (leído del archivo el 25/09)')
  assert.equal(DOLAR.rango, "'_CAJA_ANEXO'!C111:C113", 'TIPO_CAMBIO_USD apunta a C113')
})

// ═══ OPCIÓN A DEL DUEÑO (25/09/2026): la corrida escribe la cotización del BCRA como NÚMERO ═══
test('con la referencia escrita como número por la corrida, el archivo está quieto sin clavar nada', () => {
  const escrito = { formulas: [['1519.5'], [''], ['=IF(C112<>"";C112;C111)']], valores: [[1519.5], [''], [1519.5]] }
  assert.equal(problemaDelTipoDeCambio(escrito), null)
  const conFormulaVieja = { ...escrito, formulas: [['1519.5'], ['=IF(C109<>"";C109;C108)'], ['=IF(C112<>"";C112;C111)']] }
  assert.match(problemaDelTipoDeCambio(conFormulaVieja), /escribí a mano/, 'una fórmula en la celda del dueño todavía puede moverse')
  const textoNoNumero = { formulas: [['hola'], [''], ['=IF(C112<>"";C112;C111)']], valores: [['hola'], [''], ['hola']] }
  assert.match(problemaDelTipoDeCambio(textoNoNumero), /no está donde se esperaba/)
})

test('EL DEFECTO QUE COSTÓ UNA COPIA: una FÓRMULA en C110 muestra un número y no clava nada', () => {
  const conFormula = bloqueDolar(1480)
  conFormula.formulas[DOLAR.declarado] = ['=IF(C109<>"";C109;C108)']
  assert.match(problemaDelTipoDeCambio(conFormula), /escribí a mano/)
})

test('si el bloque del tipo de cambio se movió, no se afirma que esté quieto', () => {
  const movido = bloqueDolar(1480)
  movido.formulas[0] = ['="otra cosa"']
  assert.match(problemaDelTipoDeCambio(movido), /no está donde se esperaba/)
  assert.match(problemaDelTipoDeCambio({}), /no está donde se esperaba/)
})
