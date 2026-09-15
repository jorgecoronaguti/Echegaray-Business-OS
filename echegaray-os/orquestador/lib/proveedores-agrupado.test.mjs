// EL BLOQUE AGRUPADO LEE COMPRAS POR RÓTULO (14/09/2026, inserción de «Obra» en Compras L).
import test from 'node:test'
import assert from 'node:assert/strict'
import { ROTULOS_AGRUPADO, formulaBloqueAgrupado } from './proveedores-agrupado.mjs'
import { columnasDe } from './columnas-por-encabezado.mjs'
import { COMPRAS_2508, COMPRAS_CON_OBRA } from './encabezados-referencia.mjs'

const letras = (cab) => Object.fromEntries(Object.entries(columnasDe(cab, ROTULOS_AGRUPADO, 'Compras')).map(([k, c]) => [k, c.letra]))

test('antes de «Obra»: el derrame filtra X/AJ y trae AL, las letras de siempre', () => {
  const f = formulaBloqueAgrupado({ cols: letras(COMPRAS_2508) })
  assert.ok(f.includes('FILTER(HSTACK(Compras!$E$4:$E;Compras!$Q$4:$Q;Compras!$H$4:$H;Compras!$AL$4:$AL;Compras!$J$4:$J;Compras!$P$4:$P;Compras!$B$4:$B)'), f.slice(0, 200))
  assert.ok(f.includes('Compras!$X$4:$X="Pendiente";Compras!$AJ$4:$AJ=1'))
})

test('después de «Obra»: Estado, comercial, saldo, tipo y fecha prevista se corren por rótulo', () => {
  const f = formulaBloqueAgrupado({ cols: letras(COMPRAS_CON_OBRA) })
  assert.ok(f.includes('Compras!$Y$4:$Y="Pendiente";Compras!$AK$4:$AK=1'), f.slice(0, 300))
  assert.ok(f.includes('Compras!$AM$4:$AM') && f.includes('Compras!$R$4:$R') && f.includes('Compras!$Q$4:$Q'))
  assert.ok(!f.includes('$AL$4'), 'quedó el saldo de antes')
  assert.throws(() => formulaBloqueAgrupado(), /resuelta por rótulo/)
})
