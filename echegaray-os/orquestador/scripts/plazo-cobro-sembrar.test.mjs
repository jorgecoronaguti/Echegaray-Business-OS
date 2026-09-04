// LO QUE ESTE TEST ATRAPA: que una OC que NO se pudo leer entre a la tabla con un plazo.
//
// Es el modo de falla caro del sembrador. Una orden sin PDF archivado y una que pacta por hitos
// tienen que llegar a `public.condicion_cobro` con `dias` en NULL y su motivo escrito; el día que
// alguien "complete" ese hueco con el default de 30, la tabla deja de distinguir lo pactado de lo
// supuesto y el defecto original vuelve, esta vez con apariencia de fuente única.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { filasParaLaTabla } from './plazo-cobro-sembrar.mjs'

const DOC = JSON.parse(readFileSync(new URL('../datos/plazos-cobro-oc.json', import.meta.url), 'utf8'))

test('sólo lleva días a la tabla lo que el PDF declaró; lo demás entra en NULL con su motivo', () => {
  const filas = filasParaLaTabla(DOC)
  assert.equal(filas.length, DOC.ordenes.length, 'ninguna orden se pierde en el camino')
  for (const f of filas) {
    const o = DOC.ordenes.find((x) => x.orden_compra === f.orden_compra)
    if (o.estado === 'leida') assert.equal(f.dias, o.dias)
    else assert.equal(f.dias, null, `${f.orden_compra} no se leyó y sin embargo lleva días`)
    // La restricción condicion_cobro_evidencia exige esto a nivel base; acá se prueba antes de llegar.
    assert.ok(f.evidencia, `${f.orden_compra} iría a la tabla sin evidencia y la rechazaría el CHECK`)
    assert.equal(f.origen, 'ORDEN_DE_COMPRA')
    assert.equal(f.ancla, 'fecha_factura')
  }
})

test('una condición por hitos y una OC no archivada NO son lo mismo, y la tabla lo tiene que poder decir', () => {
  const filas = filasParaLaTabla(DOC)
  const hitos = filas.find((f) => f.orden_compra === '00002-00002173')
  const noArchivada = filas.find((f) => f.orden_compra === '53312775')
  assert.equal(hitos.dias, null)
  assert.equal(noArchivada.dias, null)
  assert.notEqual(hitos.tipo, noArchivada.tipo)
  assert.match(hitos.evidencia, /ANTICIPADO/)
  assert.match(noArchivada.evidencia, /no hay ningún PDF/)
})

test('el dataset viene fechado y con su fuente: un plazo sin fecha de lectura no se puede desmentir', () => {
  assert.match(DOC.leido_el, /^\d{4}-\d{2}-\d{2}$/)
  assert.match(DOC.fuente, /SOLO LECTURA/)
  assert.ok(filasParaLaTabla(DOC).every((f) => f.leido_el === DOC.leido_el))
})
