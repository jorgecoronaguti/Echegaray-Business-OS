import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  distribucion, perfilDimension, perfilProveedor, perfilesDeImputacion,
  sugerirImputacion, aplicarCorreccion, tasaAcierto,
  evidenciaDe, confianzaDe,
} from './imputacion-aprendida.mjs'

// Una fila de historia (imputación que el dueño ya dejó en Compras → costos_obra).
const fila = (proveedor, unidad, obra, concepto = '') => ({ proveedor, unidad_negocio: unidad, obra_texto: obra, concepto })

// ─── distribucion / evidencia / confianza ────────────────────────────────────

test('distribucion: moda, share y distintos, ignorando vacíos', () => {
  const d = distribucion(['Civil', 'Civil', 'Civil', 'Mantenimiento', '', null])
  assert.equal(d.top, 'Civil')
  assert.equal(d.topN, 3)
  assert.equal(d.total, 4)      // los dos vacíos no votan
  assert.equal(d.distintos, 2)
  assert.equal(d.share, 3 / 4)
})

test('evidencia exige volumen Y concentración; confianza sube con ambos', () => {
  assert.equal(evidenciaDe(6, 0.9), 'inferido_fuerte')
  assert.equal(evidenciaDe(6, 0.5), 'ambiguo')          // mucha historia repartida no es evidencia
  assert.equal(evidenciaDe(3, 0.7), 'inferido_parcial')
  assert.equal(evidenciaDe(0, 0), 'sin_historia')
  assert.ok(confianzaDe(6, 0.9) > confianzaDe(3, 0.9))
  assert.ok(confianzaDe(6, 0.9) > confianzaDe(6, 0.6))
})

// ─── sugerencia por proveedor CONOCIDO y consistente ─────────────────────────

test('proveedor conocido y consistente → sugiere unidad/obra/rubro firmes, sin pedir confirmación', () => {
  const historia = Array.from({ length: 6 }, () => fila('Barcelo', 'Civil', 'La Estrella', 'combustible gasoil'))
  const perfiles = perfilesDeImputacion(historia)
  const s = sugerirImputacion({ proveedor: 'Barcelo', concepto: 'combustible gasoil', monto: 50000 }, perfiles)

  assert.equal(s.proveedor_conocido, true)
  assert.equal(s.unidad.sugerido, 'Civil')
  assert.equal(s.unidad.pide_confirmacion, false)
  assert.equal(s.obra.sugerido, 'La Estrella')
  assert.equal(s.obra.pide_confirmacion, false)
  assert.equal(s.rubro.sugerido, 'Materiales Civil')   // computado por rubro-caja desde la imputación
  assert.equal(s.pide_confirmacion, false)             // auto-imputable
  assert.equal(s.impone, false)                        // GOBERNANZA: sugiere, no impone
})

test('rubro determinado por el proveedor (ARCA) es firme aunque la obra sea ambigua', () => {
  const historia = [fila('ARCA', 'Impuestos', 'La Estrella'), fila('ARCA', 'Impuestos', 'San Francisco')]
  const perfiles = perfilesDeImputacion(historia)
  const s = sugerirImputacion({ proveedor: 'ARCA', concepto: 'anticipo' }, perfiles)
  assert.equal(s.rubro.sugerido, 'Impuestos')
  assert.equal(s.rubro.evidencia, 'determinado_por_proveedor')
  assert.equal(s.rubro.pide_confirmacion, false)
})

// ─── caso AMBIGUO → baja confianza, pregunta (no adivina) ─────────────────────

test('proveedor que aparece en muchas obras → obra ambigua, baja confianza, pide confirmación', () => {
  const obras = ['La Estrella', 'San Francisco', 'Messina', 'Arcor', 'Javier Sanchez', 'Imotor']
  const historia = obras.map((o) => fila('Ferreteria Sur', 'Civil', o)) // 6 filas, unidad firme, obra dispersa
  const perfiles = perfilesDeImputacion(historia)
  const s = sugerirImputacion({ proveedor: 'Ferreteria Sur', concepto: 'tornillos' }, perfiles)
  assert.equal(s.unidad.pide_confirmacion, false)   // la unidad sí es consistente y firme (n≥5)
  assert.equal(s.obra.evidencia, 'ambiguo')
  assert.equal(s.obra.pide_confirmacion, true)      // la obra no: pregunta
  assert.equal(s.pide_confirmacion, true)
  assert.ok(s.obra.confianza < s.unidad.confianza)
})

test('el concepto desempata la obra cuando el proveedor trabaja en varias', () => {
  const historia = [
    fila('Multiservicio', 'Civil', 'La Estrella', 'hormigon losa'),
    fila('Multiservicio', 'Civil', 'La Estrella', 'hormigon columna'),
    fila('Multiservicio', 'Civil', 'San Francisco', 'pintura latex pared'),
    fila('Multiservicio', 'Civil', 'San Francisco', 'pintura cielorraso'),
  ]
  const perfiles = perfilesDeImputacion(historia)
  const s = sugerirImputacion({ proveedor: 'Multiservicio', concepto: 'pintura para frente' }, perfiles)
  assert.equal(s.obra.sugerido, 'San Francisco')     // por concepto, no por la moda (empatada)
  assert.match(s.obra.nota, /concepto/)
})

// ─── proveedor DESCONOCIDO → no inventa, pregunta ────────────────────────────

test('proveedor sin historia → no sugiere valores inventados, pide confirmación', () => {
  const perfiles = perfilesDeImputacion([fila('Otro', 'Civil', 'La Estrella')])
  const s = sugerirImputacion({ proveedor: 'Proveedor Nunca Visto', concepto: 'varios' }, perfiles)
  assert.equal(s.proveedor_conocido, false)
  assert.equal(s.unidad.sugerido, null)
  assert.equal(s.obra.sugerido, null)
  assert.equal(s.pide_confirmacion, true)
  assert.equal(s.impone, false)
})

// ─── GOBERNANZA: NUNCA impone, en ningún escenario ───────────────────────────

test('ninguna sugerencia impone jamás (impone:false siempre)', () => {
  const perfiles = perfilesDeImputacion(Array.from({ length: 8 }, () => fila('Barcelo', 'Civil', 'La Estrella')))
  const casos = [
    { proveedor: 'Barcelo', concepto: 'gasoil' },     // conocidísimo
    { proveedor: 'Desconocido', concepto: 'x' },       // sin historia
    { proveedor: '', concepto: '' },                   // sin proveedor
  ]
  for (const c of casos) assert.equal(sugerirImputacion(c, perfiles).impone, false)
})

// ─── el ciclo se cierra: la corrección del dueño re-alimenta el aprendizaje ───

test('la corrección del dueño re-alimenta: sube la confianza y deja de preguntar', () => {
  let historia = [fila('Vidrieria Norte', 'Civil', 'La Estrella')]
  const antes = sugerirImputacion({ proveedor: 'Vidrieria Norte', concepto: 'vidrio' }, perfilesDeImputacion(historia))
  assert.equal(antes.obra.pide_confirmacion, true) // con 1 sola imputación todavía pregunta

  // El dueño confirma la misma obra en las siguientes cargas: el ciclo la re-alimenta.
  for (let i = 0; i < 4; i++) {
    historia = aplicarCorreccion(historia, { proveedor: 'Vidrieria Norte', unidad: 'Civil', obra: 'La Estrella' })
  }
  const despues = sugerirImputacion({ proveedor: 'Vidrieria Norte', concepto: 'vidrio' }, perfilesDeImputacion(historia))
  assert.equal(despues.obra.sugerido, 'La Estrella')
  assert.ok(despues.obra.confianza > antes.obra.confianza) // aprendió
  assert.equal(despues.obra.pide_confirmacion, false)      // ya no necesita preguntar
})

test('aplicarCorreccion no muta la historia y descarta correcciones sin proveedor', () => {
  const historia = [fila('A', 'Civil', 'X')]
  const nueva = aplicarCorreccion(historia, { proveedor: 'B', unidad: 'Civil', obra: 'Y' })
  assert.equal(historia.length, 1)          // no mutó
  assert.equal(nueva.length, 2)
  assert.equal(aplicarCorreccion(historia, { proveedor: '' }).length, 1) // sin proveedor: no agrega
})

// ─── la MÉTRICA: tasa de acierto, honesta cuando no hay historia ─────────────

test('tasaAcierto mide por dimensión y es honesta sin evaluaciones', () => {
  const vacia = tasaAcierto([])
  assert.equal(vacia.aciertos.unidad, null)
  assert.equal(vacia.tasa_auto, null)

  const evals = [
    { sugerida: { unidad: { sugerido: 'Civil' }, obra: { sugerido: 'La Estrella' }, rubro: { sugerido: 'Materiales Civil' }, pide_confirmacion: false }, real: { unidad: 'Civil', obra: 'La Estrella', rubro: 'Materiales Civil' } },
    { sugerida: { unidad: { sugerido: 'Civil' }, obra: { sugerido: 'La Estrella' }, rubro: { sugerido: 'Materiales Civil' }, pide_confirmacion: true }, real: { unidad: 'Civil', obra: 'San Francisco', rubro: 'Materiales Civil' } },
  ]
  const t = tasaAcierto(evals)
  assert.equal(t.aciertos.unidad, 1)     // 2/2
  assert.equal(t.aciertos.obra, 0.5)     // 1/2
  assert.equal(t.auto_imputables, 1)     // sólo la primera no pedía confirmación
  assert.equal(t.tasa_auto, 0.5)
})

// ─── perfilDimension / perfilProveedor ───────────────────────────────────────

test('perfilProveedor arma unidad y obra por separado', () => {
  const p = perfilProveedor('X', [fila('X', 'Civil', 'La Estrella'), fila('X', 'Civil', 'La Estrella'), fila('X', 'Mantenimiento', 'La Estrella')])
  assert.equal(p.unidad.sugerido, 'Civil')
  assert.equal(p.obra.sugerido, 'La Estrella')
  assert.equal(p.obra.evidencia, 'inferido_parcial') // n=3, misma obra → parcial (firme recién con n≥5)
  assert.equal(p.obra.pide_confirmacion, true)       // sólo la evidencia FUERTE deja de preguntar
})

test('perfilDimension con historia toda vacía siempre pide confirmación', () => {
  const d = perfilDimension(['', null, ''])
  assert.equal(d.sugerido, null)
  assert.equal(d.pide_confirmacion, true)
})
