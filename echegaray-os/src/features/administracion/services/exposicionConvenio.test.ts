import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clave, exponerAlPiso, pisoVigente, resumenDeExposicion,
  type FilaEscala, type PersonaExpuesta,
} from './exposicionConvenio.ts'

// LOS TRES DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. QUE UNA ESCALA VACÍA DIGA QUE TODO EL PLANTEL CUMPLE. `convenio_escala` nace vacía; si
//     `bajoElPiso` cayera a `false` sin distinguir «no está por debajo» de «no se sabe», la pantalla
//     mostraría diecisiete personas en regla y $ 0 para regularizar. Es el peor verde falso posible.
//  2. QUE EL PISO SE HEREDE POR PARECIDO DE NOMBRE. «UOCRA — Ley 22.250» y «0076/75 UOCRA» son dos
//     rótulos del legajo; que uno tome la escala del otro es una afirmación laboral que nadie firmó.
//  3. QUE EL QUE COBRA POR ENCIMA DEL PISO RESTE DEL TOTAL A REGULARIZAR y abarate la cuenta.

const ESCALA: FilaEscala[] = [
  { convenio: '0076/75 UOCRA', categoria: 'Ayudante', desde: '2026-07-01', valorHora: 4948, fuente: 'acuerdo julio' },
  { convenio: '0076/75 UOCRA', categoria: 'Ayudante', desde: '2026-08-01', valorHora: 5399, fuente: 'acuerdo agosto' },
  { convenio: '0076/75 UOCRA', categoria: 'Oficial', desde: '2026-08-01', valorHora: 6348, fuente: 'acuerdo agosto' },
]

const persona = (p: Partial<PersonaExpuesta> = {}): PersonaExpuesta => ({
  personaId: 'p1', nombre: 'Alaniz Emanuel', convenio: '0076/75 UOCRA', categoria: 'ayudante',
  valorHora: 3650, origenTarifa: 'sheet:_J_OBREROS', ...p,
})

test('la categoría del legajo y la de la escala son la misma escrita distinto', () => {
  assert.equal(clave('Oficial Especializado'), 'oficial_especializado')
  assert.equal(clave('oficial_especializado'), 'oficial_especializado')
  assert.equal(clave('Medio Oficial'), 'medio_oficial')
  // Si el normalizador se rompiera, TODO el plantel quedaría «sin piso» sin que nada avise.
  assert.ok(pisoVigente(ESCALA, '0076/75 UOCRA', 'ayudante', '2026-09-15') != null)
})

test('el piso vigente se elige por fecha, no «el último cargado»', () => {
  assert.equal(pisoVigente(ESCALA, '0076/75 UOCRA', 'Ayudante', '2026-09-15')?.valorHora, 5399)
  // Revisar una quincena de julio con la escala de agosto declararía en infracción un mes bien pago.
  assert.equal(pisoVigente(ESCALA, '0076/75 UOCRA', 'Ayudante', '2026-07-20')?.valorHora, 4948)
  assert.equal(pisoVigente(ESCALA, '0076/75 UOCRA', 'Ayudante', '2026-06-30'), null, 'antes de toda vigencia: sin piso')
})

test('SIN ESCALA NO ES «CUMPLE»: es sin piso, y no acusa a nadie', () => {
  const l = exponerAlPiso(persona({ convenio: 'UOCRA — Ley 22.250 (construcción)' }), ESCALA, '2026-09-15', 97)
  assert.equal(l.piso, null)
  assert.equal(l.bajoElPiso, false, 'no se puede acusar sin escala')
  assert.equal(l.regularizar, null, 'ni $ 0 ni un importe: no se sabe')
  assert.equal(l.brechaPct, null)
  assert.match(l.porQueNoSeCompara ?? '', /sin piso/)
})

test('el rótulo del otro convenio NO hereda la escala cargada', () => {
  // Mismo bolsillo, misma categoría: lo único que cambia es el convenio del legajo.
  assert.equal(exponerAlPiso(persona(), ESCALA, '2026-09-15', 97).piso?.valorHora, 5399)
  assert.equal(exponerAlPiso(persona({ convenio: 'UOCRA' }), ESCALA, '2026-09-15', 97).piso, null)
})

test('bajo el piso: la brecha en % y lo que cuesta la quincena', () => {
  const l = exponerAlPiso(persona(), ESCALA, '2026-09-15', 97)
  assert.equal(l.bajoElPiso, true)
  assert.equal(l.diferenciaHora, 1749, '5399 − 3650')
  assert.equal(l.regularizar, 169653, '1749 × 97 h esperadas')
  assert.equal(l.brechaPct, -32.39)
  assert.equal(l.porQueNoSeCompara, null)
})

test('sin retribución cargada no se compara: NULL nunca es cero', () => {
  const l = exponerAlPiso(persona({ valorHora: null }), ESCALA, '2026-09-15', 97)
  assert.equal(l.bajoElPiso, false)
  assert.equal(l.regularizar, null)
  assert.equal(l.porQueNoSeCompara, 'sin retribución cargada')
  assert.ok(l.piso != null, 'el piso igual se muestra: es dato que sí existe')
})

test('sin convenio y sin categoría se dicen por separado', () => {
  assert.match(exponerAlPiso(persona({ convenio: null }), ESCALA, '2026-09-15', 97).porQueNoSeCompara ?? '', /sin convenio/)
  assert.match(exponerAlPiso(persona({ categoria: '  ' }), ESCALA, '2026-09-15', 97).porQueNoSeCompara ?? '', /sin categoría/)
})

test('el que cobra por encima del piso vale 0, nunca en contra del total', () => {
  const arriba = exponerAlPiso(persona({ personaId: 'p2', valorHora: 9000 }), ESCALA, '2026-09-15', 97)
  assert.equal(arriba.bajoElPiso, false)
  assert.equal(arriba.regularizar, 0, 'no se «devuelve» la diferencia')
  const r = resumenDeExposicion([exponerAlPiso(persona(), ESCALA, '2026-09-15', 97), arriba])
  assert.equal(r.regularizarTotal, 169653, 'el de arriba no abarata al de abajo')
  assert.equal(r.bajoElPiso, 1)
  assert.equal(r.comparadas, 2)
})

test('el resumen cuenta las que no tienen piso y nombra sus convenios', () => {
  const r = resumenDeExposicion([
    exponerAlPiso(persona(), ESCALA, '2026-09-15', 97),
    exponerAlPiso(persona({ personaId: 'p3', convenio: 'UOCRA — Ley 22.250 (construcción)' }), ESCALA, '2026-09-15', 97),
    exponerAlPiso(persona({ personaId: 'p4', convenio: 'UOCRA — Ley 22.250 (construcción)' }), ESCALA, '2026-09-15', 97),
  ])
  assert.equal(r.sinPiso, 2)
  assert.equal(r.comparadas, 1, 'las sin piso NO cuentan como comparadas')
  assert.deepEqual(r.conveniosSinEscala, ['UOCRA — Ley 22.250 (construcción)'], 'sin repetir')
})
