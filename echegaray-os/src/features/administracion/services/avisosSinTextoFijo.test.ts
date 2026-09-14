// «TENGO ESE SIN RECALC PEGADO EN DISEÑO DE LIQ HS» (dueño, producción, fila de AGÜERO 01/09).
//
// Agüero tiene `horas_recibo_manual = 45` y NO tiene recibo real de Q1-09 ni neto de nómina (sondeo del 15/09/2026:
// el último es Q2-08): su blanco es ESTIMADO. Aun así la fila decía «sin recalc.» en texto debajo del Banco, y ese
// texto rompía el alto y el ritmo de la fila.
//
//   1. Estimado: editar Hs recibo o $/h cat. RECALCULA el neto (horas × $/h × la mediana). Ya es una estimación.
//   2. Neto real (recibo del estudio o nómina): no cambia, y se avisa con un ⚠ chico con `title`, sin texto.
//   3. Ninguna celda de la fila pinta un aviso fijo en texto. Un error de guardado se lee en texto mientras el campo
//      está abierto o recién falló; después queda el ícono con el `title`.
//
// MUTACIONES QUE LO PONEN ROJO: el estimado que no recalcula; el texto «sin recalc.» de vuelta.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sueldoBlancoNegro } from './sueldoBlancoNegro.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

/** Agüero 01/09: 90 h cargadas, sin recibo del período, piso $6.348, su mediana 0,8. */
const AGUERO = {
  horas: 90, valorHoraNegro: 5874, recibo: null, netoDeNomina: null, pisoCategoria: 6348,
  proporcion: { cociente: 0.8, origen: 'persona' as const, recibos: 6 },
}

test('ESTIMADO + HS RECIBO MANUAL: el neto se recalcula con la mediana y NO hay aviso', () => {
  const s = sueldoBlancoNegro({ ...AGUERO, manual: { horasRecibo: 40 } })
  assert.equal(s.estado, 'estimado')
  assert.equal(s.horasBlanco, 40)
  assert.equal(s.bruto, 40 * 6348)
  assert.equal(s.neto, 203136, 'MUTACIÓN: el estimado que no recalcula deja 45 × 6.348 × 0,8 = 228.528')
  assert.equal(s.origenNeto, 'estimado')
  assert.equal(s.netoNoRecalculado, false, 'sin aviso: ya era una estimación')
  assert.equal(s.total, 203136 + 50 * 5874)
})

test('ESTIMADO + $/H CAT. MANUAL: también recalcula, sin aviso', () => {
  const s = sueldoBlancoNegro({ ...AGUERO, manual: { valorHoraRecibo: 7000 } })
  assert.equal(s.neto, 45 * 7000 * 0.8)
  assert.equal(s.netoNoRecalculado, false)
})

test('NETO REAL SIN HORAS (nómina) + HS RECIBO MANUAL: el neto no cambia y queda el aviso', () => {
  const s = sueldoBlancoNegro({ ...AGUERO, netoDeNomina: 215564.62, manual: { horasRecibo: 40 } })
  assert.equal(s.neto, 215564.62)
  assert.equal(s.netoNoRecalculado, true)
})

const CELDAS_DE_LA_FILA = [
  '../components/liquidacion/cuadro/CeldasBlancoNegro.tsx',
  '../components/liquidacion/cuadro/CeldasDelEspejo.tsx',
  '../components/liquidacion/cuadro/CeldaTarifa.tsx',
  '../components/liquidacion/CeldasDeLiquidacion.tsx',
]

test('RECIBO REAL + HORAS MANUALES: un ⚠ con title junto al Banco, sin texto', () => {
  const b = fuente('../components/liquidacion/cuadro/CeldasBlancoNegro.tsx')
  assert.ok(!/sin recalc/.test(b), 'MUTACIÓN: vuelve el texto «sin recalc.» debajo del Banco')
  assert.match(b, /export const AVISO_NETO_NO_RECALCULADO = 'el neto es del recibo del estudio y no se recalcula: editá Banco si cambió'/)
  assert.equal((b.match(/<IconoDeAviso titulo=\{AVISO_NETO_NO_RECALCULADO\}/g) ?? []).length, 2, 'editable y de sólo lectura')
  const c = fuente('../components/liquidacion/CeldasDeLiquidacion.tsx')
  const icono = c.slice(c.indexOf('export function IconoDeAviso('), c.indexOf('export function Manual('))
  assert.match(icono, /title=\{titulo\}/)
  assert.match(icono, />⚠</, 'el ícono es el único contenido')
})

test('NINGUNA CELDA DE LA FILA TIENE UN AVISO FIJO EN TEXTO', () => {
  for (const rel of CELDAS_DE_LA_FILA) {
    const f = fuente(rel)
    assert.ok(!/>\s*\{?\s*[`'"]?(sin recalc|no coincide|no cierra|neto no recalculado)/.test(f), `${rel}: aviso en texto`)
  }
  const e = fuente('../components/liquidacion/cuadro/CeldasDelEspejo.tsx')
  assert.match(e, /<IconoDeAviso titulo=\{`no coincide con los días: \$\{nHoras\(dias\)\} h`\}/)
})

test('UN ERROR DE GUARDADO ES TEXTO SÓLO CON EL CAMPO ABIERTO O RECIÉN FALLADO; DESPUÉS, ÍCONO', () => {
  const c = fuente('../components/liquidacion/CeldasDeLiquidacion.tsx')
  const redondeo = c.slice(c.indexOf('export function CeldaRedondeo('))
  assert.match(redondeo, /\{error && \(\(enEdicion \|\| errorReciente\) \? <span role="alert"/)
  assert.match(redondeo, /<IconoDeAviso titulo=\{error\} tono="neg"/)
  assert.match(redondeo, /onChange=\{\(e\) => \{ setTocado\(true\); setTexto\(e\.target\.value\); setError\(null\) \}\}/, 'corregir borra el error')
  const i = fuente('../../../shared/components/ds/InlineEdit.tsx')
  const enReposo = i.slice(i.indexOf('if (!editando) {'), i.indexOf('return (', i.indexOf('if (!editando) {') + 40))
  assert.match(enReposo, /\{error && \(falloReciente\s*\?/)
  assert.match(enReposo, /: <span role="img" aria-label=\{error\} title=\{error\}/, 'después, el ícono con title')
  assert.match(i, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); cancelado\.current = true; setError\(null\);/, 'volver atrás borra el error')
})
