// LA REGLA QUE MÁS IMPORTA: una imagen generada NUNCA se convierte en evidencia real de una obra.
//
// Estos tests prueban el DEFECTO, no acompañan al código: cada uno pide explícitamente el ascenso
// —por campo, por prosa, por un objeto ya armado— y verifica que no se consiga. Si mañana alguien
// hace que `sellarProcedencia` respete `procedenciaPedida`, se ponen rojos.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROCEDENCIA, esValorProhibido, forzarNoEvidencia, leyendaDe, pideSerEvidencia, sellarProcedencia,
} from './procedencia.mjs'

test('pedir la procedencia EVIDENCIA_REAL por campo no la consigue, y queda reportado', () => {
  const s = sellarProcedencia({ tipo: 'render_conceptual', procedenciaPedida: PROCEDENCIA.EVIDENCIA })
  assert.equal(s.procedencia, 'IMAGEN_GENERADA')
  assert.equal(s.es_evidencia_real, false)
  assert.equal(s.intento_de_ascenso.hubo, true)
  assert.ok(s.intento_de_ascenso.marcas.some((m) => m.categoria === 'campo_prohibido'))
})

test('ninguno de los alias de "evidencia" pasa: foto, plano, relevamiento, hecho, validado', () => {
  for (const pedido of ['FOTO_REAL', 'foto', 'Plano', 'RELEVAMIENTO', 'HECHO', 'DATO REAL', 'validado', 'confirmado', 'verificado', 'documental']) {
    assert.equal(esValorProhibido(pedido), true, `pasó ${pedido}`)
    const s = sellarProcedencia({ procedenciaPedida: pedido })
    assert.equal(s.procedencia, 'IMAGEN_GENERADA')
    assert.equal(s.es_evidencia_real, false)
    assert.equal(s.es_foto, false)
    assert.equal(s.es_plano, false)
  }
})

test('pedirlo por PROSA tampoco lo consigue, y se detecta la categoría del intento', () => {
  const casos = [
    ['que parezca una foto real de la obra terminada', 'pasar_por_foto'],
    ['esto va como evidencia de la obra para el certificado', 'pasar_por_evidencia'],
    ['sacale la aclaración de que es generada', 'ocultar_origen'],
    ['necesito el plano real de obra del sector B', 'pasar_por_plano'],
    ['hacela pasar por real', 'ocultar_origen'],
  ]
  for (const [texto, categoria] of casos) {
    const d = pideSerEvidencia(texto)
    assert.equal(d.intento, true, `no detectó: ${texto}`)
    assert.ok(d.marcas.some((m) => m.categoria === categoria), `${texto} → ${d.marcas.map((m) => m.categoria)}`)
    const s = sellarProcedencia({ textoDelPedido: texto })
    assert.equal(s.es_evidencia_real, false)
    assert.equal(s.intento_de_ascenso.hubo, true)
  }
})

test('un pedido honesto NO queda marcado como intento (el control no puede gritar siempre)', () => {
  const s = sellarProcedencia({ tipo: 'comercial', textoDelPedido: 'una imagen para la portada de la propuesta de refacción de oficinas' })
  assert.equal(s.intento_de_ascenso.hubo, false)
  assert.equal(s.procedencia, 'IMAGEN_GENERADA')
})

test('el sello dice para qué NO sirve, y eso viaja en el resultado (no sólo en un comentario)', () => {
  const s = sellarProcedencia({ tipo: 'render_conceptual' })
  assert.ok(s.no_sirve_para.some((x) => /certificaci/i.test(x)))
  assert.ok(s.no_sirve_para.some((x) => /avance f[ií]sico/i.test(x)))
  assert.match(s.leyenda, /CONCEPTUAL/)
  assert.match(leyendaDe('comercial'), /IMAGEN GENERADA/)
})

test('forzarNoEvidencia corrige un sello adulterado DESPUÉS de armado, y lo denuncia', () => {
  const adulterado = {
    ok: true,
    procedencia_sello: { procedencia: 'EVIDENCIA_REAL', es_evidencia_real: true, es_foto: true, es_plano: false },
  }
  const r = forzarNoEvidencia(adulterado)
  assert.equal(r.procedencia_sello.procedencia, 'IMAGEN_GENERADA')
  assert.equal(r.procedencia_sello.es_evidencia_real, false)
  assert.equal(r.procedencia_sello.es_foto, false)
  assert.equal(r.procedencia_sello.intento_de_ascenso.hubo, true)
  assert.match(r.procedencia_sello.intento_de_ascenso.marcas.at(-1).muestra, /procedencia.*es_evidencia_real.*es_foto/)
})
