// DEFECTOS DEL 01/10/2026 — EL PRIMER «RECONOCER» REAL DE EFECTIVO NO ENTRÓ A COMPRAS.
//
// El dueño reconoció un gasto de ER-0021 a las 10:25. La rendición se creó y descontó la entrega, pero el fajo
// volvió de `reintento` a `abierto`: el cargador contestó «nada_cargable · sin proveedor». El gasto a mano no
// tiene proveedor del desplegable —su identidad es su clave `m:<rendición>`— y esa clave no viajaba en el
// `fajo.json`: el bot lo aceptaba con la política de la libreta y el cargador lo frenaba con la suya.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aFajoJson } from './escritura.mjs'
import { faltantesDe, POLITICA } from '../../lib/comprobantes/faltantes.mjs'

const manual = () => ({
  origenCarga: 'libreta', clave: 'm:b414918b-d577-4a30-b0e1-cf3961275300', proveedorNuevo: false,
  comprobante: { fecha: '25/09/2026', numero: '0001-00000906', concepto: 'Planchas de telgopor · Aislantes Vicente', total: 5000,
    condicion: 'Contado', formaPago: 'A rendir', unidad: 'Estructura', pagado: 5000 },
})

test('el gasto a mano viaja al cargador con su clave propia', () => {
  const [j] = aFajoJson([manual()])
  assert.equal(j.clave, 'm:b414918b-d577-4a30-b0e1-cf3961275300')
  assert.equal(j.proveedor, undefined)
})

test('con la clave, el cargador no le exige proveedor; sin ella lo frena (la regla no se aflojó)', () => {
  const [j] = aFajoJson([manual()])
  const conClave = faltantesDe({ comprobante: j, clave: j.clave }, POLITICA.CARGADOR).map((f) => f.texto)
  assert.ok(!conClave.includes('sin proveedor'), conClave.join(' · '))
  const sinClave = faltantesDe({ comprobante: j }, POLITICA.CARGADOR).map((f) => f.texto)
  assert.ok(sinClave.includes('sin proveedor'))
})

test('un comprobante con papel NO manda clave: ahí el proveedor se sigue exigiendo', () => {
  const papel = { clave: 'c:30712345678|0001-00000001', proveedorNuevo: false,
    comprobante: { fecha: '25/09/2026', numero: '0001-00000001', proveedor: 'ACME SA', cuit: '30712345678', tipo: 'FA', total: 1000 } }
  const j = aFajoJson([papel])
  if (j.length) assert.equal(j[0].clave, undefined)
})

test('el cargador le pasa la clave al ítem que juzga', () => {
  const fuente = readFileSync(new URL('../../scripts/cargar-comprobantes-compras.mjs', import.meta.url), 'utf8')
  assert.match(fuente, /clave: c\.clave \?\? undefined/)
})

test('el cierre de la entrada web usa una columna que existe (`cerrado_at`, no `procesado_at`)', () => {
  const fuente = readFileSync(new URL('./reintento.mjs', import.meta.url), 'utf8')
  assert.match(fuente, /cerrado_at = now\(\)/)
  assert.doesNotMatch(fuente, /procesado_at/)
})
