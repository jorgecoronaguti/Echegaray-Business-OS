import test from 'node:test'
import assert from 'node:assert/strict'
import {
  armarDesgloseHH, etiquetaDeQuincena, finDeQuincena, grillaDeHoras, periodoDeLaObra, textoDeCelda,
} from './desgloseHH.ts'

// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE UNA AUSENCIA SE SUME O SE DIBUJE COMO CERO. Es el defecto más caro de esta pantalla: un
//      día marcado ausente dibujado «0» se lee como un día trabajado sin rendimiento, que es la
//      conclusión OPUESTA. La ausencia se ve («A»/«L») y no entra en ninguna suma.
//  2 · QUE LA QUINCENA SE CORRA UN MES. `new Date('2026-02-01')` es medianoche UTC y en Buenos Aires
//      (−3) se lee 31/01: el fin de la 2ª quincena de enero caería en el mes siguiente.
//  3 · QUE UNA PERSONA SIN HORAS EN LA VENTANA AGREGUE UNA FILA VACÍA. `por_persona` es el acumulado
//      de TODA la obra —26 personas en San Francisco— y la grilla de una quincena dibuja las que
//      tuvieron algo ESA quincena.
//  4 · QUE LA FILA «sin persona identificada» DESAPAREZCA. Son las filas legacy de JORNALES; si se
//      esconden, la grilla no cierra con el total de la obra y nadie sabe por qué.

/** La forma REAL que devuelve `public.hh_de_obra`, tomada de la corrida del 11/09/2026. */
const CRUDO = {
  obra: {
    obra_id: 'quattropani', nombre: 'Quattropani - SALÓN COMERCIAL', cliente_id: 'x',
    cliente_slug: 'quattropani', estado: 'activa',
  },
  registros: 29, personas: 4, desde: '2026-08-17', hasta: '2026-09-11', ventana: '2026-09-01',
  periodos: [
    { desde: '2026-08-16', hh: 228, dias: 12, registros: 23 },
    { desde: '2026-09-01', hh: 264, dias: 9, registros: 29 },
  ],
  por_persona: [
    { persona_id: 'p1', nombre: 'RETA RAMON HECTOR SEBASTIAN', hh: 195, dias: 20, primera: '2026-08-17', ultima: '2026-09-11' },
    { persona_id: 'p2', nombre: 'QUIROGA SEBASTIAN ADOLFO', hh: 191, dias: 19, primera: '2026-08-17', ultima: '2026-09-10' },
    // Trabajó en agosto y NADA en la ventana: no puede agregar una fila vacía a la grilla.
    { persona_id: 'p3', nombre: 'AGUERO CRISTIAN DOMINGO', hh: 2, dias: 1, primera: '2026-08-22', ultima: '2026-08-22' },
    { persona_id: null, nombre: null, hh: 9, dias: 1, primera: '2026-09-02', ultima: '2026-09-02' },
  ],
  celdas: [
    { persona_id: 'p1', fecha: '2026-09-01', horas: 9, ausencia: false, licencia: false },
    { persona_id: 'p1', fecha: '2026-09-02', horas: null, ausencia: true, licencia: false },
    { persona_id: 'p2', fecha: '2026-09-01', horas: 8.5, ausencia: false, licencia: false },
    { persona_id: 'p2', fecha: '2026-09-03', horas: null, ausencia: false, licencia: true },
    { persona_id: null, fecha: '2026-09-02', horas: 9, ausencia: false, licencia: false },
  ],
}

test('el desglose se arma con la forma que devuelve la función', () => {
  const d = armarDesgloseHH(CRUDO)
  assert.ok(d)
  assert.equal(d.obra.obraId, 'quattropani')
  assert.equal(d.ventana, '2026-09-01')
  assert.equal(d.periodos.length, 2)
  assert.equal(d.periodos[1].etiqueta, '1ª quincena sep/26')
  assert.equal(d.periodos[1].hasta, '2026-09-15')
  assert.equal(periodoDeLaObra(d), '17/08/2026 → 11/09/2026')
})

test('«no puedo leerlo» no se convierte en un desglose vacío', () => {
  // La función devuelve `null` cuando el rol no es Administración: la RLS de registros_hh le daría
  // media grilla, y media grilla parece una grilla.
  assert.equal(armarDesgloseHH(null), null)
  assert.equal(armarDesgloseHH({}), null, 'sin obra no hay desglose: no se inventa uno vacío')
})

test('la quincena calendario no se corre de mes ni de año', () => {
  assert.equal(finDeQuincena('2026-01-01'), '2026-01-15')
  assert.equal(finDeQuincena('2026-01-16'), '2026-01-31')
  // Febrero de un año NO bisiesto y el borde del año, que es donde esto se rompe.
  assert.equal(finDeQuincena('2026-02-16'), '2026-02-28')
  assert.equal(finDeQuincena('2024-02-16'), '2024-02-29')
  assert.equal(finDeQuincena('2026-12-16'), '2026-12-31')
  assert.equal(etiquetaDeQuincena('2026-12-16'), '2ª quincena dic/26')
  assert.equal(etiquetaDeQuincena('2026-01-01'), '1ª quincena ene/26')
})

test('la grilla dibuja sólo a quien tuvo algo en la ventana, y en orden de acumulado', () => {
  const g = grillaDeHoras(armarDesgloseHH(CRUDO)!)
  assert.deepEqual(g.dias, ['2026-09-01', '2026-09-02', '2026-09-03'])
  assert.deepEqual(g.filas.map((f) => f.persona.personaId), ['p1', 'p2', null],
    'AGUERO no trabajó en la ventana: su fila vacía no va, y la fila sin persona SÍ')
})

test('una ausencia NO suma y NO se dibuja como cero', () => {
  const g = grillaDeHoras(armarDesgloseHH(CRUDO)!)
  const p1 = g.filas[0]
  assert.equal(p1.total, 9, 'el día ausente no puede sumar')
  assert.deepEqual(p1.celdas.map((c) => textoDeCelda(c).texto), ['9', 'A', ''])
  assert.equal(textoDeCelda(p1.celdas[1]).marca, true, 'la ausencia se dibuja apagada, no como dato')
  // La licencia se distingue de la ausencia: son dos hechos laborales distintos.
  assert.equal(textoDeCelda(g.filas[1].celdas[2]).texto, 'L')
  // Y una celda sin fila NO es un cero: es que ese día esa persona no tuvo nada cargado.
  assert.equal(textoDeCelda(null).texto, '')
})

test('los totales por día y de la ventana salen de las MISMAS celdas que se dibujan', () => {
  const g = grillaDeHoras(armarDesgloseHH(CRUDO)!)
  assert.deepEqual(g.porDia, [17.5, 9, null], 'el día de pura licencia no tiene total, no tiene 0')
  assert.equal(g.total, 26.5)
  // Σ de las filas = Σ de los días: si alguna vez no cerrara, es que la grilla dibuja algo que no
  // suma o suma algo que no dibuja.
  assert.equal(g.filas.reduce((a, f) => a + (f.total ?? 0), 0), g.total)
})

test('las horas con fracción se escriben con su media hora', () => {
  // 8,5 h existe en la base (media jornada del sábado): redondear acá haría que la grilla no cerrara
  // con el total de la quincena.
  assert.equal(textoDeCelda({ personaId: 'p', fecha: '2026-09-01', horas: 8.5, ausencia: false, licencia: false }).texto, '8,5')
})
