import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IPC, ACUMULADOS_PUBLICADOS, acumulado, verificarAcumulado, faltantes } from './ipc-publicado.mjs'

test('la tabla del IPC reproduce los acumulados que publicó el INDEC', () => {
  // ESTE ES EL TEST QUE IMPORTA: si alguien transcribe mal un mes, el encadenado deja de dar el
  // acumulado publicado y esto rompe el build. Sin él, un dedazo se convierte en una proyección
  // mal ajustada que ningún cuadro delata (los controles siguen cerrando en $0).
  assert.deepEqual(verificarAcumulado(), [])
})

test('detecta un mes transcripto mal', () => {
  const conDedazo = IPC.map((m) => (m.periodo === '2026-03' ? { ...m, variacion: 0.043 } : m))
  const rotos = verificarAcumulado(conDedazo)
  assert.equal(rotos.length, 2, 'un error en marzo rompe el trimestre Y el semestre')
})

test('el acumulado del trimestre da 9,4%', () => {
  assert.ok(Math.abs(acumulado('2026-03') - 0.094) < 0.0015)
})

test('todas las variaciones son mensuales en fracción y plausibles', () => {
  for (const m of IPC) {
    assert.ok(/^\d{4}-\d{2}$/.test(m.periodo), `período mal formado: ${m.periodo}`)
    // Un IPC mensual argentino fuera de 0–15% es casi seguro un porcentaje pegado sin dividir.
    assert.ok(m.variacion > 0 && m.variacion < 0.15, `${m.periodo} fuera de rango: ${m.variacion}`)
  }
})

test('los períodos están ordenados y sin repetir', () => {
  const p = IPC.map((m) => m.periodo)
  assert.deepEqual(p, [...new Set(p)].sort(), 'hay meses repetidos o desordenados')
})

test('faltantes ignora lo ya cargado como dato pero no la proyección', () => {
  const enBase = [
    { periodo: '2026-01', tipo: 'dato' },
    { periodo: '2026-02', tipo: 'proyeccion' },
  ]
  const f = faltantes(enBase).map((m) => m.periodo)
  assert.ok(!f.includes('2026-01'), 'enero ya es dato firme')
  assert.ok(f.includes('2026-02'), 'febrero sólo tiene la expectativa: falta el dato')
})

test('cada control publicado apunta a un mes que existe en la tabla', () => {
  for (const c of ACUMULADOS_PUBLICADOS) {
    assert.ok(IPC.some((m) => m.periodo === c.hasta), `el control "${c.que}" mira ${c.hasta}, que no está cargado`)
  }
})
