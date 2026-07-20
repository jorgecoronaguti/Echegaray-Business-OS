// Test hermético del núcleo del Operating Review. Sin DB, sin API.
import { isoCorta, puntoResuelto, faltaDelPunto, componerReview, formatReview } from './operating-review.mjs'

let ok = 0
let falla = 0
const check = (n, c) => {
  if (c) ok++
  else {
    falla++
    console.error(`  FALLA: ${n}`)
  }
}

// ── puntoResuelto: los 3 requisitos, sin atajos ──
const completo = { decision: 'Pagar en 2 cuotas', responsable: 'Jorge', fecha_limite: '2026-08-01' }
check('completo → resuelto', puntoResuelto(completo))
check('sin decisión → NO resuelto', !puntoResuelto({ ...completo, decision: '' }))
check('sin responsable → NO resuelto', !puntoResuelto({ ...completo, responsable: '' }))
check('sin fecha → NO resuelto', !puntoResuelto({ ...completo, fecha_limite: null }))
check('decisión en blancos no cuenta', !puntoResuelto({ ...completo, decision: '   ' }))
check('objeto vacío no rompe', !puntoResuelto({}))

// ── faltaDelPunto ──
check('punto vacío: faltan las 4', faltaDelPunto({}).length === 4)
check('completo con causa: no falta nada', faltaDelPunto({ ...completo, causa: 'x' }).length === 0)
check('nombra lo que falta', faltaDelPunto({ causa: 'x', decision: 'y' }).join() === 'responsable,fecha')

// ── componerReview ──
const r = componerReview({
  area: 'administracion_finanzas',
  area_nombre: 'Administración y Finanzas',
  periodo: '2026-07-01 → 2026-07-20',
  puntos: [
    { titulo: 'Deuda ARCA vencida', desvio_monto: 1982466, estado: 'pendiente', origen_tabla: 'acciones' },
    { titulo: 'Echeqs ARCOR sin evidencia', desvio_monto: null, estado: 'pendiente', origen_tabla: 'acciones' },
    { titulo: 'Proveedores sin marcar', desvio_monto: 6917657, estado: 'decidido', ...completo, causa: 'c' },
    { titulo: 'descartado', desvio_monto: 999, estado: 'descartado' },
    { titulo: 'cerrado', desvio_monto: 888, estado: 'cerrado' },
  ],
})
check('cuenta todos los puntos', r.total_puntos === 5)
check('abiertos excluye descartado y cerrado', r.abiertos === 3)
check('resueltos = los que tienen decisión+responsable+fecha', r.resueltos === 1)
check('sin_decidir', r.sin_decidir === 2)
// Lo crítico: el impacto suma SÓLO lo que tiene monto, y el resto se declara.
check('impacto medido no incluye descartados', r.impacto_medido === 1982466 + 6917657)
check('cuenta los que tienen monto', r.puntos_con_monto === 2)
check('declara los NO cuantificados', r.puntos_sin_cuantificar === 1)
check('detalle ordena falta por punto', r.detalle.find((p) => p.titulo === 'Deuda ARCA vencida').falta.length === 4)
check('monto null se mantiene null, no 0', r.detalle.find((p) => p.titulo.startsWith('Echeqs')).desvio_monto === null)

// ── formato ──
const t = formatReview(r)
check('formato: encabezado del área', t.includes('OPERATING REVIEW — ADMINISTRACIÓN Y FINANZAS'))
check('formato: separa decididos', t.includes('DECIDIDOS:'))
check('formato: separa pendientes de decisión', t.includes('PENDIENTES DE DECISIÓN'))
check('formato: dice qué falta', t.includes('falta:'))
check('formato: avisa que lo no cuantificado NO es cero', t.includes('NO son cero'))
check('formato: monto formateado', t.includes('$1.982.466'))
check('formato: no lista los descartados', !t.includes('descartado'))
check('formato: error se declara', formatReview({ error: 'x' }).includes('No pude'))

// Review vacío: no debe fingir contenido.
const vacio = componerReview({ area: 'calidad', area_nombre: 'Calidad', periodo: 'x', puntos: [] })
check('review vacío: 0 abiertos', vacio.abiertos === 0)
check('review vacío: impacto 0 sin puntos con monto', vacio.impacto_medido === 0 && vacio.puntos_con_monto === 0)

// ── isoCorta: pg devuelve Date y String(Date) imprimía "Wed Jul 01 2026" (defecto real 20/07) ──
check('Date → YYYY-MM-DD', isoCorta(new Date(2026, 6, 1)) === '2026-07-01')
check('Date con día de un dígito se rellena', isoCorta(new Date(2026, 0, 5)) === '2026-01-05')
check('string ISO se recorta', isoCorta('2026-07-20T00:00:00Z') === '2026-07-20')
check('vacío no rompe', isoCorta(null) === '')

console.log(`operating-review.test: ${ok} OK, ${falla} FALLA`)
if (falla) process.exit(1)
