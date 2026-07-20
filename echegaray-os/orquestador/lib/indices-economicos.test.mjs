import assert from 'node:assert/strict'
import { parsearVariaciones, formatIndices } from './indices-economicos.mjs'

// El formato real que devolvió la búsqueda del REM.
{
  const t = `- **August 2026:** 1.8%\n- **September 2026:** 1.8%\n- **October 2026:** 1.7%\n- **November 2026:** 1.7%\n- **December 2026:** 1.8%`
  // en inglés no matchea: la búsqueda se hace en español, pero el parser no debe inventar
  assert.equal(parsearVariaciones(t, 2026).length, 0)
}
{
  const t = 'agosto 2026: 1,8% · septiembre: 1,8% · octubre 1,7% · noviembre: 1,7% · diciembre 1,8%'
  const v = parsearVariaciones(t, 2026)
  assert.equal(v.length, 5)
  assert.deepEqual(v[0], { periodo: '2026-08', variacion: 0.018 })
  assert.deepEqual(v[2], { periodo: '2026-10', variacion: 0.017 })
}
// La otra forma de escribirlo: el número antes del mes.
{
  const v = parsearVariaciones('se espera 2,1% en agosto', 2026)
  assert.deepEqual(v, [{ periodo: '2026-08', variacion: 0.021 }])
}
// NUNCA guardar un número que no puede ser un IPC mensual: un acumulado anual (30%) colado en la
// proyección multiplicaría la caja proyectada por diez.
{
  assert.equal(parsearVariaciones('la inflación de 2026 llegará al 30% en diciembre', 2026).length, 0)
  assert.equal(parsearVariaciones('agosto: 0,0%', 2026).length, 0)
}
// Sin números reconocibles no se inventa nada, y el mensaje lo dice.
{
  assert.equal(parsearVariaciones('no hay datos disponibles', 2026).length, 0)
  assert.match(formatIndices({ por_indice: {}, sin_parsear: true }), /no inventé nada/)
}
{
  const t = formatIndices({ por_indice: { ipc: [{ periodo: '2026-08', variacion: 0.018, factor_acumulado: 1.018 }] }, vencido: true, dias_viejo: 60 })
  assert.match(t, /1\.8%/)
  assert.match(t, /60 días/)
}

console.log('indices-economicos.test.mjs OK')
