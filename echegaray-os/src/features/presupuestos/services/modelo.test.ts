// EL MODO DETERMINÍSTICO SE DECIDE CON EL MISMO FUSIBLE QUE CORTA LA LLAMADA.
//
// El defecto que esto impide: una pantalla que dice «hay modelo» y un motor que se niega a llamarlo
// —o al revés—. Serían dos autoridades sobre el mismo hecho, y la que se ve no sería la que manda.
//
// Se prueba con un `env` inyectado, no con `process.env`: un test que muta el entorno del proceso
// contamina a los demás archivos de la corrida.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { hayModelo, motivoSinModelo } from './modelo.ts'

const env = (x: Record<string, string | undefined>) => x as unknown as NodeJS.ProcessEnv

describe('cuándo NO hay modelo', () => {
  test('apagado a mano corta, aunque haya clave', () => {
    const m = motivoSinModelo(env({ ORQ_IA_BLOQUEADA: '1', ORQ_IA_PERMITIR: 'si', ANTHROPIC_API_KEY: 'k' }))
    assert.match(m ?? '', /a mano/)
  })

  test('sin permiso explícito la API paga está apagada por defecto', () => {
    assert.match(motivoSinModelo(env({ ANTHROPIC_API_KEY: 'k' })) ?? '', /apagada por defecto/)
  })

  test('con permiso pero SIN clave tampoco hay modelo: permitir no es tener con qué', () => {
    const m = motivoSinModelo(env({ ORQ_IA_PERMITIR: 'si' }))
    assert.equal(m, 'no hay clave de proveedor configurada')
  })

  test('una sesión de Claude Code no hereda el permiso de producción', () => {
    const m = motivoSinModelo(env({ ORQ_IA_PERMITIR: 'si', CLAUDECODE: '1', ANTHROPIC_API_KEY: 'k' }))
    assert.match(m ?? '', /Claude Code/)
  })
})

describe('cuándo SÍ hay modelo', () => {
  test('permiso y clave: la pantalla no declara modo determinístico', () => {
    assert.equal(motivoSinModelo(env({ ORQ_IA_PERMITIR: 'si', ANTHROPIC_API_KEY: 'k' })), null)
    assert.equal(hayModelo(env({ ORQ_IA_PERMITIR: 'si', ANTHROPIC_API_KEY: 'k' })), true)
  })

  test('la clave alternativa también cuenta', () => {
    assert.equal(hayModelo(env({ ORQ_IA_PERMITIR: 'si', ORQ_IA_ALT_API_KEY: 'k' })), true)
  })
})

describe('MUTACIÓN — el control puede dar rojo', () => {
  test('un `hayModelo` que devolviera siempre true no distinguiría los casos de arriba', () => {
    const mentiroso = () => true
    assert.notEqual(mentiroso(), hayModelo(env({})),
      'con el entorno vacío el bueno dice que NO hay modelo; el mentiroso dice que sí')
  })
})
