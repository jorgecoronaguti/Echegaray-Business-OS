// EL VOLANTE — qué cuenta como ejemplo y qué no.
//
// Estas pruebas son sobre la DEFINICIÓN, no sobre la escritura: un ejemplo mal definido contamina
// un dataset entero y el daño aparece meses después, cuando ya se entrenó con él.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ejemploDe, guardar, TAREA } from './ejemplos.mjs'

const base = {
  tarea: TAREA.IDENTIDAD, dominio: 'proveedores', entrada: 'CORRALON PROGRESO',
  propuestoPorElOs: 'prov-1', corregidoA: 'prov-9', por: 'jorge@ecsas.com.ar',
}

test('una corrección deja el par completo y marcado como error del OS', () => {
  const r = ejemploDe(base)
  assert.equal(r.ok, true)
  assert.equal(r.ejemplo.entrada, 'CORRALON PROGRESO')
  assert.equal(r.ejemplo.propuesto, 'prov-1')
  assert.equal(r.ejemplo.esperado, 'prov-9')
  assert.equal(r.ejemplo.acerto, false)
})

test('una CONFIRMACIÓN también es un ejemplo, y se guarda como acierto', () => {
  // Guardar sólo los fallos entrena una distribución que no existe: en producción la mayoría de
  // los casos salen bien, y un modelo entrenado con puros errores desconfía de sus aciertos.
  const r = ejemploDe({ ...base, corregidoA: 'prov-1' })
  assert.equal(r.ok, true)
  assert.equal(r.ejemplo.acerto, true)
})

test('cuando el OS no propuso nada, el ejemplo existe pero no es ni acierto ni error', () => {
  const r = ejemploDe({ ...base, propuestoPorElOs: null })
  assert.equal(r.ok, true)
  assert.equal(r.ejemplo.propuesto, null)
  assert.equal(r.ejemplo.acerto, null, 'una abstención etiquetada se estaría contando como fallo')
})

test('«no sé» NO es un ejemplo: nadie dijo cuál era la respuesta correcta', () => {
  const r = ejemploDe({ ...base, corregidoA: null })
  assert.equal(r.ok, false)
  assert.match(r.porQue, /etiqueta/)
})

test('sin autor no hay ejemplo: sería el OS entrenándose con su propia salida', () => {
  for (const por of [undefined, null, '', '   ']) {
    const r = ejemploDe({ ...base, por })
    assert.equal(r.ok, false, `«${por}» pasó como autor`)
    assert.match(r.porQue, /autor/)
  }
})

test('sin la entrada original el par no sirve', () => {
  assert.equal(ejemploDe({ ...base, entrada: '   ' }).ok, false)
})

test('la sensibilidad del dominio queda CONGELADA en la fila', () => {
  // Si se dedujera al exportar, un cambio de política reclasificaría hacia atrás filas que ya se
  // habían compartido con el criterio viejo.
  assert.equal(ejemploDe(base).ejemplo.sensibilidad, 'confidential')
  assert.equal(ejemploDe({ ...base, dominio: 'intenciones' }).ejemplo.sensibilidad, 'internal')
  // Y un dominio que nadie declaró NO cae en «internal» por comodidad.
  assert.equal(ejemploDe({ ...base, dominio: 'lo-que-sea' }).ejemplo.sensibilidad, 'confidential')
})

test('guardar escribe UNA fila con la entrada y la etiqueta, en ese orden', async () => {
  const escrituras = []
  const r = await guardar(base, { ejecutar: async (sql, args) => { escrituras.push({ sql, args }); return { rows: [] } } })
  assert.equal(r.ok, true)
  assert.equal(escrituras.length, 1)
  assert.match(escrituras[0].sql, /insert into orq\.llm_ejemplo/)
  assert.ok(escrituras[0].args.includes('CORRALON PROGRESO'))
  assert.ok(escrituras[0].args.includes('prov-9'))
})

test('si la tabla no está, la corrección NO se rompe: se pierde el ejemplo y se sigue', async () => {
  const r = await guardar(base, { ejecutar: async () => { throw new Error('relation "orq.llm_ejemplo" does not exist') } })
  assert.equal(r.ok, false)
  assert.match(r.porQue, /no se pudo escribir/)
  // El ejemplo calculado viaja igual: quien llame puede reintentarlo si quiere. Lo que no puede
  // pasar es que esto lance y deje la corrección a medio aplicar.
  assert.equal(r.ejemplo.esperado, 'prov-9')
})

test('un ejemplo inválido no llega a la base: se descarta antes de escribir', async () => {
  const escrituras = []
  const r = await guardar({ ...base, por: '' }, { ejecutar: async (...a) => { escrituras.push(a); return { rows: [] } } })
  assert.equal(r.ok, false)
  assert.equal(escrituras.length, 0, 'se escribió una fila sin autor')
})
