// LA LECTURA DEL PLANO SE DIBUJA DE LA ESTRUCTURA DEL MOTOR — y no inventa estados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pasosDeLectura, lecturaDeRespuesta } from './lecturaPlano.ts'

// La forma REAL de `razonar()` (orquestador/lib/plano/razonamiento.mjs), reducida.
const RAZONAMIENTO = {
  superficies: {
    cubiertaDeclarada: { area: 240, lamina: 'A-01' },
    declaradas: [],
    improntas: [{ lamina: 'E-01', area: 288.5, calculo: '24 m × 12 m (grilla)' }],
    faltan: ['superficie semicubierta: no declarada en la documentación leída'],
  },
  bases: {
    bases: [
      { tipo: 'B1', nombre: 'Base típica', cantidad: 18, sinCantidad: false, seccion: { texto: '180×180 cm' }, laminas: ['B-01'], faltan: [] },
      { tipo: 'B2', nombre: 'Base interior', cantidad: 0, sinCantidad: true, seccion: null, laminas: ['B-01'], faltan: ['cantidad sin cita'] },
    ],
    muertos: [{ tipo: 'MA', nombre: 'Muerto de anclaje', cantidad: 8, sinCantidad: false, seccion: null, laminas: ['E-02'], faltan: [] }],
  },
  fundacionLineal: {
    vigasFundacion: [{ tipo: 'VF', nombre: 'Viga de fundación', cantidad: 26, sinCantidad: false, seccion: { texto: '20×40 cm' }, laminas: ['B-01'], faltan: [] }],
    arriostramientos: [],
    vigasCarga: [],
    sismica: { declarada: false, nota: 'la documentación leída no menciona consideración sísmica — DESCONOCIDO, no «no tiene»' },
  },
  columnas: {
    columnas: [{ tipo: 'C1', nombre: 'Columna', cantidad: 30, sinCantidad: false, seccion: { texto: '30×30 cm' }, laminas: ['E-02'], faltan: [] }],
    encadenados: [],
  },
  luces: {
    luces: [{ lamina: 'A-01', luces: [6, 6, 4.85], cita: 'cotas de eje a eje' }],
    vigas: [],
    faltan: [],
  },
  barrido: {
    laminas: [{ lamina: 'A-01', archivo: 'plano.pdf', vistas: ['planta'], elementos: 12, dimensionesTotales: '24 × 12 m' }],
    noLegibles: ['estructura.dwg'],
  },
  excavaciones: {
    excavaciones: [
      { elemento: 'EX-B1', profundidad: 1.1, cantidad: 18, volumenBanco: 68.4, formula: '1,8 × 1,8 × 1,1 m × 18' },
      { elemento: 'EX-B2', profundidad: null, cantidad: 6, falta: 'profundidad' },
    ],
    conVolumen: [{ elemento: 'EX-B1' }],
    sinProfundidad: [{ elemento: 'EX-B2' }],
    faltan: ['EX-B2: falta la PROFUNDIDAD en la documentación'],
  },
}

test('los 7 pasos salen en el orden del cotizador: 1, 2, x, 3, 4, 5, 6', () => {
  const pasos = pasosDeLectura(RAZONAMIENTO)
  assert.equal(pasos.length, 7)
  assert.deepEqual(pasos.map((p) => p.etiqueta), ['1', '2', 'x', '3', '4', '5', '6'])
  assert.equal(pasos[0].titulo, 'Superficies')
  assert.equal(pasos[2].id, 'excavaciones')
})

test('el estado se DERIVA de los datos, nunca se inventa', () => {
  const pasos = pasosDeLectura(RAZONAMIENTO)
  const por = (id: string) => pasos.find((p) => p.id === id)!
  // Superficies: el motor nombró un faltante ⇒ sin dato.
  assert.equal(por('superficies').estado, 'sin dato')
  // Bases: B2 sin cantidad ⇒ sin dato, y la fila lo marca.
  assert.equal(por('bases').estado, 'sin dato')
  assert.equal(por('bases').filas.find((f) => f.k === 'B2')?.falta, true)
  // Verticales: todo con cita ⇒ firme.
  assert.equal(por('verticales').estado, 'firme')
  // Luces: declaradas sin faltantes ⇒ firme.
  assert.equal(por('luces').estado, 'firme')
  // Barrido con un DWG sin leer ⇒ revisar, con el faltante nombrado.
  assert.equal(por('barrido').estado, 'revisar')
  assert.match(por('barrido').faltan[0], /estructura\.dwg/)
})

test('la excavación sin profundidad queda SIN volumen — nunca una típica', () => {
  const x = pasosDeLectura(RAZONAMIENTO).find((p) => p.id === 'excavaciones')!
  assert.equal(x.estado, 'sin dato')
  const sinCota = x.filas.find((f) => f.k === 'EX-B2')!
  assert.equal(sinCota.falta, true)
  assert.equal(sinCota.v, 'sin volumen')
  const conCota = x.filas.find((f) => f.k === 'EX-B1')!
  assert.equal(conCota.v, '68,4 m³ en banco')
})

test('la sísmica no declarada viaja como DESCONOCIDO en los faltantes del paso 3', () => {
  const p = pasosDeLectura(RAZONAMIENTO).find((p) => p.id === 'fundacion-lineal')!
  assert.ok(p.faltan.some((f) => /DESCONOCIDO/.test(f)))
})

test('estructura desconocida o vacía ⇒ ningún paso', () => {
  assert.deepEqual(pasosDeLectura(null), [])
  assert.deepEqual(pasosDeLectura('texto'), [])
  assert.deepEqual(pasosDeLectura({}), [])
})

test('lecturaDeRespuesta saca los pasos de datos.razonamiento', () => {
  const pasos = lecturaDeRespuesta({ datos: { razonamiento: RAZONAMIENTO } })
  assert.equal(pasos.length, 7)
  assert.deepEqual(lecturaDeRespuesta({ datos: {} }), [])
  assert.deepEqual(lecturaDeRespuesta(null), [])
})
