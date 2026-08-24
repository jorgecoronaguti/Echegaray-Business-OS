import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  coincideTexto, colorDeBarra, colorDePlazo, diasDeAtraso, entraEnFiltro, esPrevio,
  estadoDeCartera, textoDePlazo, type ObraDeCartera,
} from './carteraCanon.ts'

const obra = (o: Partial<ObraDeCartera> = {}): ObraDeCartera => ({
  estado: 'activa', etapa: 'desarrollo', fecha_fin_plan: null, forecast_fin: null,
  avance_pct: null, ...o,
})

// ═══ EL DEFECTO QUE ESTE ARCHIVO ATRAPA ═══
//
// La cartera pintaba el plazo con `obra_plan_vs_real.desvio_plazo_dias`, que compara el fin
// planificado contra el fin de la línea base. Medido contra producción el 20/08/2026, el sellado
// había copiado el plan en las once obras vivas: la columna daba 0 en todas y decía «en fecha»
// sobre una obra vencida el 04/08 con 94% de avance. Un control validado contra la misma
// información que produce.
//
// Si alguien vuelve a atar el atraso a la línea base, este archivo se pone rojo: acá el atraso
// compara el fin PROYECTADO (ritmo medido) contra el fin de PLAN (compromiso), que son dos fuentes
// distintas.

test('el atraso compara fin proyectado contra fin de plan, no el plan contra sí mismo', () => {
  assert.equal(diasDeAtraso(obra({ fecha_fin_plan: '2026-09-05', forecast_fin: '2026-09-21' })), 16)
  // Una obra que va a terminar antes NO tiene «-3 días de atraso»: llega en fecha.
  assert.equal(diasDeAtraso(obra({ fecha_fin_plan: '2026-09-05', forecast_fin: '2026-09-02' })), 0)
})

test('sin una de las dos fechas el atraso es DESCONOCIDO, nunca cero', () => {
  assert.equal(diasDeAtraso(obra({ fecha_fin_plan: '2026-09-05' })), null)
  assert.equal(diasDeAtraso(obra({ forecast_fin: '2026-09-21' })), null)
  assert.equal(textoDePlazo(obra({ fecha_fin_plan: '2026-09-05' })), 'sin plan')
})

test('el texto de PLAZO es el del zip: «+16 d» · «en fecha» · «sin plan»', () => {
  assert.equal(textoDePlazo(obra({ fecha_fin_plan: '2026-09-05', forecast_fin: '2026-09-21' })), '+16 d')
  assert.equal(textoDePlazo(obra({ fecha_fin_plan: '2026-09-05', forecast_fin: '2026-09-05' })), 'en fecha')
  // Una obra en «Previo» no tiene plazo que mostrar aunque arrastre fechas viejas.
  assert.equal(textoDePlazo(obra({ etapa: 'previo', fecha_fin_plan: '2026-09-05', forecast_fin: '2026-09-30' })), 'sin plan')
})

test('el estado sigue el orden del zip y agrega «Pausada», que la base tiene y el mockup no', () => {
  assert.deepEqual(estadoDeCartera(obra({ estado: 'cerrada' })), { t: 'Terminada', tono: 'pos' })
  assert.deepEqual(estadoDeCartera(obra({ etapa: 'previo' })), { t: 'Previo', tono: 'neutro' })
  assert.deepEqual(estadoDeCartera(obra({ estado: 'pausada' })), { t: 'Pausada', tono: 'neutro' })
  // Umbral del zip: > 10 días pinta el estado; por debajo lo dice la columna PLAZO en ámbar.
  assert.deepEqual(
    estadoDeCartera(obra({ fecha_fin_plan: '2026-09-05', forecast_fin: '2026-09-21' })),
    { t: 'En ejecución · atraso', tono: 'neg' },
  )
  assert.deepEqual(
    estadoDeCartera(obra({ fecha_fin_plan: '2026-09-05', forecast_fin: '2026-09-10' })),
    { t: 'En ejecución', tono: 'curso' },
  )
  // Una obra cerrada gana sobre cualquier atraso arrastrado: ya terminó.
  assert.equal(estadoDeCartera(obra({ estado: 'cerrada', fecha_fin_plan: '2026-01-01', forecast_fin: '2026-09-01' })).t, 'Terminada')
})

test('«Con problema» no esconde obras cuando la lectura de impedimentos se cayó', () => {
  // null = no se pudo mirar. Un control que no pudo mirar no dice «no hay».
  assert.equal(entraEnFiltro(obra(), 'problema', null), true)
  assert.equal(entraEnFiltro(obra(), 'problema', 0), false)
  assert.equal(entraEnFiltro(obra(), 'problema', 3), true)
})

test('los filtros del zip cuentan lo que dicen contar', () => {
  const enCurso = obra({ estado: 'activa' })
  const previa = obra({ etapa: 'previo' })
  const atrasada = obra({ fecha_fin_plan: '2026-09-05', forecast_fin: '2026-09-06' })
  assert.equal(entraEnFiltro(enCurso, 'curso', 0), true)
  // Una obra «Previo» NO es una obra en ejecución aunque su fila diga `activa`.
  assert.equal(entraEnFiltro(previa, 'curso', 0), false)
  assert.equal(entraEnFiltro(previa, 'previo', 0), true)
  assert.equal(entraEnFiltro(atrasada, 'atraso', 0), true)
  assert.equal(entraEnFiltro(enCurso, 'atraso', 0), false)
  assert.equal(esPrevio(previa), true)
})

test('el buscador del zip mira nombre Y cliente, sin acentos', () => {
  assert.equal(coincideTexto('Nave 3 · ampliación', 'San Francisco', 'ampliacion'), true)
  assert.equal(coincideTexto('Nave 3', 'Orica Argentina', 'ORICA'), true)
  assert.equal(coincideTexto('Nave 3', null, 'messina'), false)
  assert.equal(coincideTexto('Nave 3', null, '  '), true)
})

test('los colores de la barra y del plazo son los medidos en el mockup', () => {
  assert.equal(colorDeBarra(obra({ avance_pct: 100 })), '#067647')
  assert.equal(colorDeBarra(obra({ avance_pct: 0 })), '#D7D5CF')
  assert.equal(colorDeBarra(obra({ avance_pct: 40 })), '#175CD3')
  assert.equal(
    colorDeBarra(obra({ avance_pct: 40, fecha_fin_plan: '2026-09-05', forecast_fin: '2026-09-21' })),
    '#B42318',
  )
  assert.equal(colorDePlazo(obra({ fecha_fin_plan: '2026-09-05', forecast_fin: '2026-09-05' })), '#067647')
  assert.equal(colorDePlazo(obra({ fecha_fin_plan: '2026-09-05', forecast_fin: '2026-09-08' })), '#B54708')
  assert.equal(colorDePlazo(obra({})), '#91918B')
})

// ═══ Y QUE NO VUELVA POR LA PUERTA DE ATRÁS ═══
//
// Las reglas de arriba prueban la cuenta nueva. Ésta prueba que la pantalla la USE: el defecto
// original no era una función mal escrita, era una pantalla leyendo la columna equivocada. Un
// `desvio_plazo_dias` que reaparezca en la cartera vuelve a pintar «en fecha» en verde sobre once
// obras cuya línea base es una copia de su plan.

test('la cartera NO vuelve a pintar el plazo con el desvío contra la línea base', async () => {
  const { readFileSync } = await import('node:fs')
  const raiz = new URL('../../../..', import.meta.url).pathname
  for (const ruta of [
    'src/app/(main)/obras/page.tsx',
    'src/features/obras/components/CarteraObras.tsx',
  ]) {
    const fuente = readFileSync(raiz + ruta, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')
    assert.doesNotMatch(
      fuente, /desvio_plazo_dias/,
      `${ruta} volvió a leer desvio_plazo_dias: compara el plan contra su propia línea base`,
    )
  }
})
