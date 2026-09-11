// EL REGISTRO NO PUEDE PROMOVER UNA HERRAMIENTA SIN EVIDENCIA.
//
// Las entradas `herramienta.*` son candidatos a asistir la CONSTRUCCIÓN del OS (revisar un diff,
// auditar una captura), medidos el 11/09/2026 contra problemas reales con baseline conocido. Este
// test es el candado: ninguna puede aparecer como `produccion` —ni colarse por `paraProduccion()`—
// mientras su propia evidencia dice que perdió o que no se pudo medir. Y toda entrada rechazada o
// experimental tiene que decir POR QUÉ y CUÁNDO volver a mirarla, o el rechazo se pierde a los seis
// meses y alguien la vuelve a probar de cero.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MODELOS, ESTADO, paraProduccion } from './registro.mjs'

const herramientas = Object.entries(MODELOS).filter(([clave]) => clave.startsWith('herramienta.'))

test('hay herramientas registradas y ninguna quedó en produccion sin haber ganado', () => {
  assert.ok(herramientas.length >= 3, 'faltan las tres herramientas medidas el 11/09/2026')
  for (const [clave, m] of herramientas) {
    assert.notEqual(m.estado, ESTADO.PRODUCCION, `«${clave}» figura en produccion y su evidencia dice que no superó a la alternativa`)
    const r = paraProduccion(clave)
    assert.equal(r.ok, false, `paraProduccion aceptó «${clave}»`)
    assert.match(r.porQue, /estado|BLOQUEADO/, `el rechazo de «${clave}» no explica el motivo`)
  }
})

test('una herramienta rechazada o experimental deja escrito el porqué, la evidencia y el reingreso', () => {
  for (const [clave, m] of herramientas) {
    assert.ok([ESTADO.RECHAZADO, ESTADO.EXPERIMENTAL, ESTADO.CANDIDATO, ESTADO.SOMBRA].includes(m.estado), `«${clave}» tiene un estado que no corresponde a un candidato: ${m.estado}`)
    assert.ok(m.licencia, `«${clave}» sin licencia`)
    assert.ok(m.revision, `«${clave}» sin revisión del Hub`)
    assert.ok(m.dataset, `«${clave}» sin dataset: ¿contra qué problema real se midió?`)
    assert.ok(m.medido?.fecha, `«${clave}» sin fecha de medición`)
    assert.ok(typeof m.porQue === 'string' && m.porQue.length > 80, `«${clave}» sin un porqué que se pueda leer`)
    assert.ok(typeof m.reingreso === 'string' && m.reingreso.length > 30, `«${clave}» sin condición de reingreso`)
  }
})

test('un RECHAZADO trae la cuenta: hallazgos si fue por calidad, intentos con status si fue por operación', () => {
  for (const [clave, m] of herramientas.filter(([, m]) => m.estado === ESTADO.RECHAZADO)) {
    assert.ok(typeof m.medido?.usdEstimado === 'number', `«${clave}»: sin costo estimado`)
    if (m.medido.motivo === 'operacion') {
      // Rechazado sin haber contestado: la evidencia son los intentos, no un adjetivo.
      const it = m.medido.intentos
      assert.ok(Array.isArray(it) && it.length >= 3, `«${clave}»: un rechazo por operación necesita al menos 3 intentos registrados`)
      for (const i of it) {
        assert.ok(i.proveedor && Number.isInteger(i.status) && i.ms > 0, `«${clave}»: intento sin proveedor/status/ms`)
      }
      assert.ok(it.every((i) => i.status !== 200 || /vac[ií]a/.test(String(i.salida))), `«${clave}»: hubo un 200 con salida no vacía; entonces se mide la calidad, no se rechaza por operación`)
      continue
    }
    const h = m.medido?.hallazgos
    assert.ok(h && typeof h === 'object', `«${clave}» rechazado sin la cuenta de hallazgos`)
    assert.ok(Number.isInteger(h.pedidos) && h.pedidos > 0, `«${clave}»: hallazgos.pedidos debe ser un entero positivo`)
    assert.ok(typeof m.medido.ms === 'number' && m.medido.ms > 0, `«${clave}»: sin latencia medida`)
  }
})

test('el registro entero sigue sano: cada entrada tiene estado válido, licencia y porqué', () => {
  const estados = new Set(Object.values(ESTADO))
  for (const [clave, m] of Object.entries(MODELOS)) {
    assert.ok(estados.has(m.estado), `«${clave}» con estado desconocido ${m.estado}`)
    assert.ok(m.licencia, `«${clave}» sin licencia`)
    assert.ok(m.porQue, `«${clave}» sin porqué`)
  }
})
