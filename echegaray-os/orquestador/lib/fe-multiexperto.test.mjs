// Tests del núcleo FE1 (fe-multiexperto). 0 API: el razonador se INYECTA como fake. Verifican:
//  1. Las skills correctas llegan a cada lente (el "enchufado" real, gap chat-sin-cerebro).
//  2. El contexto NUNCA inventa un número: lo que falta se declara "No tengo ese dato".
//  3. La comparación DETECTA un conflicto (parser determinístico).
//  4. El ensamblado del contexto es determinístico y sólo contiene cifras provistas.
//  5. Resiliencia: si una lente falla, las demás siguen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  analizarMultiexperto,
  construirContextoTexto,
  parseComparacion,
  LENTES,
} from './fe-multiexperto.mjs'

// Contexto de ejemplo con algunos datos presentes y otros ausentes (para probar "no invento").
const CONTEXTO = {
  caja: { hoy: 17690000, proyeccion7: null, colchon: 22000000 },
  cobranzas: { porCobrarMes: 8500000, vencidas: null },
  obligaciones: { saldo: 19400000, vencido: 3200000, deudaComercialVencida: null },
  descubierto: { cftAnual: 62.78, limite: 30000000, usado: null },
  notas: ['Vence el 30/07 el pago a IERIC por $1.230.000'],
  capturadoEn: '2026-07-25',
}

// Fake razonador: registra cada job y devuelve un texto controlado por lente. Para la comparación
// devuelve un texto CON un conflicto, para poder verificar que el parser lo detecta. 0 API.
function razonadorFake({ registro }) {
  return async (job) => {
    registro.push(job)
    if (job.lente === 'comparacion') {
      return {
        texto:
          'COINCIDENCIAS:\n' +
          '- Las tres coinciden en que la caja alcanza esta semana.\n' +
          'CONFLICTOS:\n' +
          '- El financiero recomienda pagar ya por pronto pago, pero el contador marca que ese gasto es de otro período.\n' +
          '- El abogado observa que ese proveedor tiene un reclamo abierto.',
        model: job.model,
        costUsd: 0.01,
      }
    }
    return { texto: `Lectura del ${job.lente}: uso mis skills ${job.skills.join(', ')}.`, model: job.model, costUsd: 0.02 }
  }
}

test('cada lente recibe SUS skills (skills de verdad enchufadas)', async () => {
  const registro = []
  await analizarMultiexperto({ pregunta: '¿Pago hoy al proveedor?', contexto: CONTEXTO, razonar: razonadorFake({ registro }) })

  const porLente = Object.fromEntries(registro.filter((j) => j.lente !== 'comparacion').map((j) => [j.lente, j.skills]))
  assert.deepEqual(porLente.contador, ['contabilidad-constructoras', 'impuestos-construccion'])
  assert.deepEqual(porLente.abogado, ['derecho-construccion-contratos', 'derecho-laboral-construccion'])
  assert.deepEqual(porLente.financiero, ['finanzas-tesoreria-construccion', 'financial-engineering'])
})

test('cada lente recibe roleFraming con su persona y el contexto en el prompt', async () => {
  const registro = []
  await analizarMultiexperto({ pregunta: '¿Cómo está la caja?', contexto: CONTEXTO, razonar: razonadorFake({ registro }) })
  const contador = registro.find((j) => j.lente === 'contador')
  assert.match(contador.roleFraming, /contador de gestión/i)
  assert.match(contador.roleFraming, /NUNCA inventes un número/i)
  assert.match(contador.prompt, /PREGUNTA DEL DUEÑO/)
  assert.match(contador.prompt, /17\.690\.000/) // el número real del contexto llega al prompt
})

test('el contexto NUNCA inventa un número: lo ausente se declara "No tengo ese dato"', () => {
  const { texto, faltantes } = construirContextoTexto(CONTEXTO)
  // Los presentes aparecen formateados.
  assert.match(texto, /Caja hoy: \$17\.690\.000/)
  assert.match(texto, /62,78%/)
  // Los ausentes se declaran, NO se rellenan.
  assert.match(texto, /Proyección 7 días: No tengo ese dato/)
  assert.match(texto, /Cobranzas vencidas: No tengo ese dato/)
  assert.ok(faltantes.includes('Proyección 7 días'))
  assert.ok(faltantes.includes('Descubierto usado'))
})

test('contexto vacío: no aparece ningún número fabricado, todo es "No tengo ese dato"', () => {
  const { texto, faltantes } = construirContextoTexto({})
  // No debe haber NINGUNA secuencia de dígitos larga (no hay cifras) salvo las de las fechas ausentes.
  const numeros = texto.match(/\$\s?\d/g) || []
  assert.equal(numeros.length, 0, 'no debe haber ningún importe cuando no hay datos')
  assert.ok(faltantes.length >= 8, 'todos los campos se declaran faltantes')
  assert.match(texto, /No tengo ese dato/)
})

test('la comparación detecta un conflicto', async () => {
  const registro = []
  const res = await analizarMultiexperto({ pregunta: '¿Pago hoy?', contexto: CONTEXTO, razonar: razonadorFake({ registro }) })
  assert.equal(res.comparacion.error, null)
  assert.ok(res.comparacion.conflictos.length >= 2, 'debe extraer los conflictos')
  assert.match(res.comparacion.conflictos[0], /otro período/i)
  assert.ok(res.comparacion.coincidencias.length >= 1)
})

test('parseComparacion: robusto a encabezados en la misma línea y a "Ninguno"', () => {
  const p1 = parseComparacion('COINCIDENCIAS: todo ok\nCONFLICTOS:\n- Ninguno relevante')
  assert.deepEqual(p1.coincidencias, ['todo ok'])
  assert.deepEqual(p1.conflictos, ['Ninguno relevante'])

  const p2 = parseComparacion('texto libre sin encabezados')
  assert.deepEqual(p2.conflictos, [])
  assert.equal(p2.texto, 'texto libre sin encabezados')
})

test('las tres lecturas se devuelven, grounded, con costo sumado', async () => {
  const registro = []
  const res = await analizarMultiexperto({ pregunta: 'x', contexto: CONTEXTO, razonar: razonadorFake({ registro }) })
  assert.equal(res.lecturas.length, 3)
  assert.deepEqual(res.lecturas.map((l) => l.id), ['contador', 'abogado', 'financiero'])
  assert.ok(res.lecturas.every((l) => l.error === null && l.texto))
  // 3 lentes × 0.02 + 1 comparación × 0.01 = 0.07
  assert.ok(Math.abs(res.costoTotalUsd - 0.07) < 1e-9)
})

test('resiliencia: si una lente falla, las demás siguen y se compara con las disponibles', async () => {
  const registro = []
  const razonar = async (job) => {
    registro.push(job)
    if (job.lente === 'abogado') throw new Error('sin crédito')
    if (job.lente === 'comparacion') return { texto: 'COINCIDENCIAS:\n- ok', model: job.model, costUsd: 0 }
    return { texto: `ok ${job.lente}`, model: job.model, costUsd: 0.01 }
  }
  const res = await analizarMultiexperto({ pregunta: 'x', contexto: CONTEXTO, razonar })
  const abogado = res.lecturas.find((l) => l.id === 'abogado')
  assert.match(abogado.error, /sin crédito/)
  assert.equal(abogado.texto, '')
  // Con 2 lecturas disponibles, la comparación igual corre.
  assert.equal(res.comparacion.error, null)
})

test('con menos de 2 lecturas, la comparación se declara no disponible (no inventa)', async () => {
  const razonar = async (job) => {
    if (job.lente === 'contador') return { texto: 'ok', model: job.model, costUsd: 0 }
    throw new Error('caído')
  }
  const res = await analizarMultiexperto({ pregunta: 'x', contexto: CONTEXTO, razonar })
  assert.match(res.comparacion.error, /al menos dos/i)
  assert.deepEqual(res.comparacion.conflictos, [])
})

test('valida entradas: sin pregunta o sin razonador tira error claro', async () => {
  await assert.rejects(() => analizarMultiexperto({ pregunta: '', contexto: {}, razonar: () => {} }), /falta la pregunta/i)
  await assert.rejects(() => analizarMultiexperto({ pregunta: 'x', contexto: {}, razonar: null }), /razonador/i)
})

test('LENTES declara exactamente las tres lentes esperadas', () => {
  assert.deepEqual(LENTES.map((l) => l.id), ['contador', 'abogado', 'financiero'])
})
