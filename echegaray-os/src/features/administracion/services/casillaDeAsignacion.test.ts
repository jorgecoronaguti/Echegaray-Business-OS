// LA CASILLA DE LA CORRECCIÓN DE JORNADA GUARDA UN DÍA SUELTO.
//
// Qué defecto atrapa: que vuelva a abrir una asignación sin fin desde el día corregido (sin `hasta`), que
// dejaba a la persona en dos obras de ahí en adelante. Si el alta pierde `hasta = fecha`, el primer test da
// rojo; si deja de ser un día suelto, el segundo ve que la regla cierra la obra donde estaba.
import test from 'node:test'
import assert from 'node:assert/strict'
import { altaDeLaCasilla } from './casillaDeAsignacion.ts'
import { planDeAsignacion } from '../../../../orquestador/lib/cronologia-asignaciones.mjs'
import { obraDeLaAsignacionDelDia } from '../../../../orquestador/lib/asignacion-del-dia.mjs'

const PERSONA = '33333333-3333-4333-8333-333333333333'

test('la casilla asigna ESE día: desde = hasta = la fecha corregida', () => {
  assert.deepEqual(altaDeLaCasilla({ obraId: 'messina', personaId: PERSONA, fecha: '2026-09-09' }), {
    obra_id: 'messina', persona_id: PERSONA, rol: 'integrante', desde: '2026-09-09', hasta: '2026-09-09',
  })
})

test('el día de la casilla no cierra la obra donde está, y al leer sólo se lleva ese día', () => {
  const alta = altaDeLaCasilla({ obraId: 'messina', personaId: PERSONA, fecha: '2026-09-09' })
  const larga = { id: 'q', obra_id: 'quattropani', desde: '2026-09-01', hasta: null, creado_en: '2026-09-01T10:00:00Z' }
  assert.deepEqual(planDeAsignacion([larga], alta), { cerrar: [], acortar: [], reemplazar: [], recortar: [], anular: [] })
  const tramos = [
    { obra: 'quattropani', desde: larga.desde, hasta: larga.hasta, creado_en: larga.creado_en },
    { obra: 'messina', desde: alta.desde, hasta: alta.hasta, creado_en: '2026-09-10T12:00:00Z' },
  ]
  assert.equal(obraDeLaAsignacionDelDia(tramos, '2026-09-09'), 'messina')
  assert.equal(obraDeLaAsignacionDelDia(tramos, '2026-09-10'), 'quattropani')
})
