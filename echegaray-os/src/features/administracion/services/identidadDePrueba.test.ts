// LA CUENTA DE PLAYWRIGHT NO ENTRA AL PLANTEL. Y UNA PERSONA REAL NO SE ESCONDE NUNCA.
//
// Hallazgo de QA visual en producción (11/09/2026): «[PRUEBA E2E] QA Campo» contaba como una persona
// más en Convenios («18 sin piso») y en Recibos. La mutación que pone esto rojo es sacar el
// `sinIdentidadesDePrueba` de `plantelDeLaQuincena`, o aflojar `MARCAS_DE_NOMBRE`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  esIdentidadDePrueba, MAILS_DE_PRUEBA, sePublicaA, sinIdentidadesDePrueba,
} from './identidadDePrueba.ts'
import { plantelDeLaQuincena } from './liquidacionPlantelActivo.ts'

test('LA IDENTIDAD EXACTA QUE SALÍA EN PRODUCCIÓN', () => {
  // El nombre y el mail son los de `tests/util/identidades.ts` · CAMPO.
  assert.equal(esIdentidadDePrueba({ nombre: '[PRUEBA E2E] QA Campo' }), true)
  assert.equal(esIdentidadDePrueba({ email: 'qa.campo@ecsas.com.ar' }), true)
  assert.equal(esIdentidadDePrueba({ email: 'qa.jefe.obra@ecsas.com.ar' }), true)
  assert.equal(
    esIdentidadDePrueba({ email: 'jorge.o.corona+direccion-test-1783513222134@gmail.com' }), true,
  )
})

test('`es_prueba` DE LA BASE MANDA Y ALCANZA SOLA', () => {
  assert.equal(esIdentidadDePrueba({ nombre: 'Maldonado Juan', esPrueba: true }), true)
  // Y `false`/`null` no esconden a nadie: un NULL es una fila que nadie declaró como prueba.
  assert.equal(esIdentidadDePrueba({ nombre: 'Maldonado Juan', esPrueba: false }), false)
  assert.equal(esIdentidadDePrueba({ nombre: 'Maldonado Juan', esPrueba: null }), false)
})

test('UNA PERSONA REAL NO SE ESCONDE — ESCONDER ES EL DEFECTO PEOR', () => {
  // Nadie nota a quien falta en una liquidación. El criterio es angosto a propósito.
  for (const nombre of [
    'Maldonado Juan', 'Quiroga Sebastián', 'Ñancucheo Ana', 'Zogbe Emiliano',
    'Prueba Martínez', 'Esteban Pruebas', 'Gonzalez E2 Eduardo',
  ]) {
    assert.equal(esIdentidadDePrueba({ nombre }), false, `${nombre} es una persona`)
  }
  // Un mail de la empresa que no es de QA tampoco.
  assert.equal(esIdentidadDePrueba({ email: 'jorge@ecsas.com.ar' }), false)
  assert.equal(esIdentidadDePrueba({ email: 'administracion@ecsas.com.ar' }), false)
})

test('SIN NOMBRE NI MAIL NI MARCA, NO SE DECIDE QUE ES DE PRUEBA', () => {
  assert.equal(esIdentidadDePrueba({}), false)
  assert.equal(esIdentidadDePrueba({ nombre: '', email: '' }), false)
  assert.equal(esIdentidadDePrueba({ nombre: null, email: null, esPrueba: null }), false)
})

test('EL PLANTEL DE LA QUINCENA NO LA DEVUELVE NI COMO ACTIVA NI COMO «SIN ACTIVIDAD»', () => {
  // EL DEFECTO QUE ATRAPA: filtrar sólo `activas` y dejar la cuenta de prueba en el contador «N sin
  // actividad», que es un enlace a una lista. No está sin actividad: no es una persona.
  const r = plantelDeLaQuincena(
    [
      { id: 'p1', nombre: 'Maldonado Juan' },
      { id: 'p2', nombre: 'Quiroga Sebastián' },
      { id: 'qa', nombre: '[PRUEBA E2E] QA Campo' },
    ],
    {
      conLineaEnLaAnterior: new Set(['p1', 'qa']),
      conHoras: new Set(),
      conAsistencia: new Set(),
      conTarifaNueva: new Set(),
    },
  )
  assert.deepEqual(r.activas.map((p) => p.id), ['p1'])
  assert.deepEqual(r.sinActividad.map((p) => p.id), ['p2'])
})

test('`sinIdentidadesDePrueba` LEE EL CAMPO QUE CADA SERVICIO TIENE', () => {
  // Convenios y Recibos traen `nombre_completo`, no `nombre`: el lector es lo que evita que un
  // llamador filtre de menos en silencio por nombrar distinto la misma columna.
  const filas = [
    { nombre_completo: 'Maldonado Juan' },
    { nombre_completo: '[PRUEBA E2E] QA Campo' },
  ]
  const out = sinIdentidadesDePrueba(filas, (f) => ({ nombre: f.nombre_completo }))
  assert.deepEqual(out.map((f) => f.nombre_completo), ['Maldonado Juan'])
})

test('LOS MAILS DE PRUEBA SON LOS DE `tests/util/identidades.ts`, Y SON DOS PATRONES', () => {
  // Si esa lista cambia, este test es el que avisa: `src/` no puede importar de `tests/`.
  assert.equal(MAILS_DE_PRUEBA.length, 2)
  assert.ok(MAILS_DE_PRUEBA.some((re) => re.test('qa.campo@ecsas.com.ar')))
  assert.ok(MAILS_DE_PRUEBA.some((re) => re.test('jorge.o.corona+direccion-test-1@gmail.com')))
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// UNA CUENTA DE PRUEBA VE A LAS PERSONAS DE PRUEBA · UNA CUENTA REAL NO (12/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Es el predicado que la migración `20260912T1200` escribe en `persona_directorio`, `persona_legajo`
// y `persona_plantel`. Acá se prueba la copia de TypeScript, que es la que gobierna la solapa
// Quincena mientras la migración no esté aplicada.

test('EL PREDICADO: de prueba sólo para quien también existe para probar', () => {
  const qa = { nombre: '[PRUEBA E2E] QA Campo' }
  const persona = { nombre: 'Maldonado Juan' }

  // La cuenta REAL: sigue sin verla. Es el hallazgo del 11/09 y no se toca.
  assert.equal(sePublicaA(qa, false), false)
  // La cuenta de prueba: la ve. Sin esto, el E2E de escritura de horas es imposible.
  assert.equal(sePublicaA(qa, true), true)

  // ═══ LA MITAD QUE NADIE MIRA: la cuenta de prueba SIGUE VIENDO A LAS PERSONAS REALES ═══
  //
  // El defecto que atrapa es implementar «la sesión de prueba ve lo de prueba» como un filtro que
  // INVIERTE la lista. Un E2E que corre contra un plantel de una sola fila daría verde igual, y la
  // pantalla de esa cuenta sería una mentira sobre la empresa.
  assert.equal(sePublicaA(persona, true), true)
  assert.equal(sePublicaA(persona, false), true)
})

test('SIN SABER QUIÉN PREGUNTA SE ESCONDE: el default es el de antes del cambio', () => {
  // Un llamador que no pasa el tercer argumento tiene que seguir filtrando. Si el default fuera
  // `true`, agregar el parámetro habría destapado la cuenta de Playwright en las siete pantallas del
  // módulo sin que ningún llamador cambiara una línea.
  assert.equal(sePublicaA({ nombre: '[PRUEBA E2E] QA Campo' }), false)
  const filas = [{ nombre_completo: 'Maldonado Juan' }, { nombre_completo: '[PRUEBA E2E] QA Campo' }]
  assert.deepEqual(
    sinIdentidadesDePrueba(filas, (f) => ({ nombre: f.nombre_completo })).map((f) => f.nombre_completo),
    ['Maldonado Juan'],
  )
  assert.deepEqual(
    sinIdentidadesDePrueba(filas, (f) => ({ nombre: f.nombre_completo }), true).map((f) => f.nombre_completo),
    ['Maldonado Juan', '[PRUEBA E2E] QA Campo'],
  )
})

test('EL PLANTEL DE LA QUINCENA SE LA DEVUELVE A UNA SESIÓN DE PRUEBA, CON SU ACTIVIDAD', () => {
  // LA PANTALLA DONDE SE ESCRIBE. La celda `espejo-dia-<personaId>-<fecha>` sólo existe para quien
  // está en `activas`: sin esto la identidad de prueba no tiene celda y no hay E2E de escritura.
  const personas = [
    { id: 'p1', nombre: 'Maldonado Juan' },
    { id: 'p2', nombre: 'Quiroga Sebastián' },
    { id: 'qa', nombre: '[PRUEBA E2E] QA Campo' },
  ]
  const evidencia = {
    conLineaEnLaAnterior: new Set(['p1']),
    conHoras: new Set(['qa']),
    conAsistencia: new Set<string>(),
    conTarifaNueva: new Set<string>(),
  }
  const deVerdad = plantelDeLaQuincena(personas, evidencia, false)
  assert.deepEqual(deVerdad.activas.map((p) => p.id), ['p1'])
  assert.deepEqual(deVerdad.sinActividad.map((p) => p.id), ['p2'])

  const dePrueba = plantelDeLaQuincena(personas, evidencia, true)
  // Entra por la MISMA puerta que todos —tiene horas cargadas en la quincena—, no por una excepción
  // que la meta en la lista sin evidencia de actividad.
  assert.deepEqual(dePrueba.activas.map((p) => p.id), ['p1', 'qa'])
  assert.deepEqual(dePrueba.sinActividad.map((p) => p.id), ['p2'])
})
