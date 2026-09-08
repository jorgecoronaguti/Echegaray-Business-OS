import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  JORNADA_ESTANDAR_HS, acuseDeAusencia, acuseDeAusenciasDelDia, acuseDeTramo, ausenciaSinObraDe,
  horasDeLaAusencia, jornadaDeReferenciaVisible, planDeAusenciasSinObra, planDeTramoDeAusencia,
  restoDeLaSemana, sumarHoras, topeDelTramo,
} from './ausenciaDeLaPersona.ts'
import type { FilaDelDia, FilaDelTramo, MarcaDelDia } from './ausenciaDeLaPersona.ts'
import { planDeBorrado, type FilaExistente } from './planDeJornada.ts'

const fila = (
  id: string, tipo_hora: string, horas: number | string, obra_canonica_id: string | null,
  extra: Partial<FilaDelDia> = {},
): FilaDelDia => ({ id, tipo_hora, horas, obra_canonica_id, ...extra })

// ── EL DEFECTO QUE RECHAZÓ EL DUEÑO ─────────────────────────────────────────────────────────────
//
// «La ausencia quedó imputada a La Estrella: es donde ya estaban las horas de ese día». Si alguien
// vuelve a nombrar una obra en el acuse de una ausencia, este test se pone rojo.
test('EL ACUSE DE UNA AUSENCIA NO NOMBRA NINGUNA OBRA COMO DESTINO', () => {
  const m = acuseDeAusencia({ fila: 'insertada', horasSacadas: 0, obrasSacadas: [], intactas: [] })
  assert.equal(m, 'Día corregido: no vino. La ausencia es de la persona; no se cargó a ninguna obra.')
  assert.ok(!/imputad/i.test(m), 'el acuse no puede decir que la ausencia quedó imputada a nada')
})

test('LAS HORAS QUE SE SACAN DE UNA OBRA SE NOMBRAN: BORRARLAS EN SILENCIO SERÍA PERDER EL DATO', () => {
  const m = acuseDeAusencia({
    fila: 'insertada', horasSacadas: 9, obrasSacadas: ['La Estrella Galpón 9'], intactas: [],
  })
  assert.ok(m.includes('9 hs'), m)
  assert.ok(m.includes('La Estrella Galpón 9'), m)
  assert.ok(m.includes('no trabajó'), m)
})

test('LO QUE NO SE TOCÓ SE NOMBRA, IGUAL QUE EN EL RESTO DE LA PANTALLA', () => {
  const m = acuseDeAusencia({
    fila: 'actualizada', horasSacadas: 0, obrasSacadas: [],
    intactas: [{ motivo: 'hora improductiva con su causa' }],
  })
  assert.ok(m.includes('Quedó sin tocar una fila: hora improductiva con su causa.'), m)
})

test('SI LA BASE NO CAMBIÓ NADA, EL ACUSE NO AFIRMA QUE CORRIGIÓ', () => {
  // La evidencia es del efecto: `fila: null` es un update que afectó cero filas.
  const m = acuseDeAusencia({ fila: null, horasSacadas: 0, obrasSacadas: [], intactas: [] })
  assert.equal(m, 'No cambió nada en la base: el día ya estaba así.')
})

// ── LA FILA QUE SE CORRIGE ES LA QUE YA ESTÁ SIN OBRA ───────────────────────────────────────────
test('UNA AUSENCIA VIEJA CON OBRA NO CUENTA COMO LA FILA SIN OBRA: SE REEMPLAZA, NO SE EDITA', () => {
  const filas = [
    fila('b', 'ausencia', 9, 'la-estrella'),   // el legado de JORNALES
    fila('c', 'normal', 9, 'quattropani'),
  ]
  assert.equal(ausenciaSinObraDe(filas), null)
})

test('LA FILA SIN OBRA SE ENCUENTRA Y EL RESULTADO NO DEPENDE DEL ORDEN', () => {
  const sinObra = fila('a', 'licencia', 8, null)
  const otras = [fila('b', 'ausencia', 9, 'la-estrella'), fila('c', 'normal', 4, 'quattropani')]
  assert.equal(ausenciaSinObraDe([sinObra, ...otras])?.id, 'a')
  assert.equal(ausenciaSinObraDe([...otras, sinObra])?.id, 'a')
})

test('UNAS HORAS TRABAJADAS SIN OBRA NO SON UNA AUSENCIA', () => {
  // No debería existir —el CHECK de `20260908T2000` lo prohíbe—, y si existe no se corrige como si
  // fuera la ausencia de la persona.
  assert.equal(ausenciaSinObraDe([fila('a', 'normal', 9, null)]), null)
})

// ── LAS HORAS DE LA AUSENCIA ────────────────────────────────────────────────────────────────────
test('LAS HORAS LAS MANDA QUIEN CORRIGE CUANDO LAS MANDA', () => {
  assert.equal(horasDeLaAusencia(4, 9), 4)
})

test('SIN HORAS PEDIDAS VALE LA JORNADA DE REFERENCIA, NO UNA HORA SUELTA', () => {
  // El defecto viejo: `c.horas ?? 1` registraba una ausencia de UNA hora sobre una jornada de nueve.
  assert.equal(horasDeLaAusencia(null, 9), 9)
  assert.equal(horasDeLaAusencia(undefined, 8.8), 8.8)
})

test('SIN NINGUNA JORNADA DE REFERENCIA SE USA LA ESTÁNDAR, NUNCA CERO', () => {
  // `registros_hh` exige horas > 0, y el dueño lo dijo al revés: «se le suma hs porque corresponde
  // por ley». Un cero diría que ese día no le corresponde nada.
  assert.equal(horasDeLaAusencia(null, null), JORNADA_ESTANDAR_HS)
  assert.equal(horasDeLaAusencia(null, 0), JORNADA_ESTANDAR_HS)
  assert.ok(horasDeLaAusencia(null, null) > 0)
})

test('LAS HORAS SUMAN AUNQUE POSTGREST LAS MANDE COMO TEXTO', () => {
  // `horas` es numeric: sin el Number la suma concatenaría y el acuse diría «49 hs» por 4 y 9.
  const filas = [fila('a', 'normal', '4.5', 'q'), fila('b', 'normal', '4.5', 'q'), fila('c', 'normal', 9, 'x')]
  assert.equal(sumarHoras(filas, ['a', 'b']), 9)
  assert.equal(sumarHoras(filas, []), 0)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA CARGA DEL DÍA (`guardarJornada`): LA OTRA PUERTA DE LA MISMA REGLA
//
// Hasta el 08/09/2026 la «A» del teléfono y la de la grilla escribían la ausencia CON la obra del
// formulario. Estos tests fijan que ya no, y qué pasa con lo que había.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const P = '11111111-1111-4111-8111-111111111111'
const Q = '22222222-2222-4222-8222-222222222222'
const marcaAusente = (persona_id: string, horas = 8.8, motivo: string | null = null): MarcaDelDia =>
  ({ persona_id, estado: 'ausente', horas, motivo })
const marcaPresente = (persona_id: string, horas = 8.8): MarcaDelDia =>
  ({ persona_id, estado: 'presente', horas, motivo: null })

test('MARCAR AUSENTE ESCRIBE UNA FILA SIN OBRA — el defecto que este trabajo deshace', () => {
  // Sin nada cargado afuera, la ausencia es un INSERT sin obra: `id: null`. Que no haya obra en
  // ninguna parte de este plan es exactamente lo que el dueño pidió.
  const plan = planDeAusenciasSinObra([marcaAusente(P)], [])
  assert.equal(plan.escribir.length, 1)
  assert.equal(plan.escribir[0].id, null)
  assert.equal(plan.escribir[0].tipo, 'ausencia')
  assert.equal(plan.escribir[0].marca.horas, 8.8, 'la ausencia lleva las horas que corresponden')
  assert.deepEqual(plan.borrar, [])
})

test('EL MOTIVO DECIDE SI LA FILA SIN OBRA ES AUSENCIA O LICENCIA', () => {
  // La misma regla que ya usaba el panel: vacaciones y parte médico son LICENCIA, faltar sin avisar
  // es AUSENCIA. Sin esto, la diferencia entre un derecho reconocido y una falta desaparece — y es
  // justo la que usa quien liquida.
  assert.equal(planDeAusenciasSinObra([marcaAusente(P, 8.8, 'enfermedad')], []).escribir[0].tipo, 'licencia')
  assert.equal(planDeAusenciasSinObra([marcaAusente(P, 8.8, 'vacaciones')], []).escribir[0].tipo, 'licencia')
  assert.equal(planDeAusenciasSinObra([marcaAusente(P, 8.8, 'falta')], []).escribir[0].tipo, 'ausencia')
})

test('MARCAR «A» DOS VECES NO ESCRIBE DOS FILAS: la clave única no protege sin obra', () => {
  // El defecto que atrapa: en Postgres dos `obra_canonica_id` NULL NO colisionan, así que
  // `registros_hh_persona_unico` deja pasar la segunda ausencia del mismo día. El día quedaría
  // contado dos veces y nadie vería un error.
  const yaEsta = [fila('r1', 'ausencia', 8.8, null, { persona_id: P, notas: null })]
  const plan = planDeAusenciasSinObra([marcaAusente(P)], yaEsta)
  assert.deepEqual(plan.escribir, [])
  assert.equal(plan.sinCambio, 1)
  assert.deepEqual(plan.borrar, [])
})

test('CORREGIR EL MOTIVO O LAS HORAS DE LA AUSENCIA ES UN UPDATE DE LA MISMA FILA', () => {
  const yaEsta = [fila('r1', 'ausencia', 8.8, null, { persona_id: P, notas: 'falta' })]
  const otroMotivo = planDeAusenciasSinObra([marcaAusente(P, 8.8, 'falta_con_aviso')], yaEsta)
  assert.deepEqual(otroMotivo.escribir.map((e) => e.id), ['r1'])
  // LAS HORAS TAMBIÉN CUENTAN COMO CAMBIO (dueño, 08/09 16:16): «las ausencias que tienen motivo
  // registrado dan la posibilidad de que se le registre hs, como pasa con los accidentes
  // laborales». Si sólo se comparara el motivo, corregir 8,8 a 4 diría «ya estaba así».
  const otrasHoras = planDeAusenciasSinObra([marcaAusente(P, 4, 'falta')], yaEsta)
  assert.deepEqual(otrasHoras.escribir.map((e) => e.id), ['r1'])
  assert.equal(otrasHoras.escribir[0].marca.horas, 4)
})

test('VOLVER DE AUSENTE A PRESENTE SACA LA AUSENCIA SIN OBRA', () => {
  // El defecto que atrapa: escribir las horas encima de una «A» y dejar las dos afirmaciones
  // guardadas. Como la ausencia no vive en la obra, el borrado del plan de la obra —acotado por
  // `obra_canonica_id`— no la alcanza: tiene que salir por acá o no sale nunca.
  const yaEsta = [fila('r1', 'ausencia', 8.8, null, { persona_id: P })]
  const plan = planDeAusenciasSinObra([marcaPresente(P, 8)], yaEsta)
  assert.deepEqual(plan.borrar, ['r1'])
  assert.deepEqual(plan.escribir, [])
})

test('UNA LICENCIA SIN OBRA NO SE PISA DESDE LA OBRA, Y SE NOMBRA', () => {
  // Misma regla que `esDeLaJornada`: la licencia la autorizó Administración con un papel atrás. Ni
  // la «A» del jefe la convierte en ausencia ni marcar presente la borra. Y no se escribe una
  // ausencia al lado: serían dos filas del mismo día.
  const licencia = [fila('r1', 'licencia', 8, null, { persona_id: P, notas: 'vacaciones' })]
  for (const marca of [marcaAusente(P), marcaPresente(P, 8)]) {
    const plan = planDeAusenciasSinObra([marca], licencia)
    assert.deepEqual(plan.escribir, [])
    assert.deepEqual(plan.borrar, [])
    assert.equal(plan.intactas.length, 1)
    assert.match(plan.intactas[0].motivo, /Administración/)
  }
})

test('CADA PERSONA MIRA SÓLO SUS FILAS: la cuadrilla entra en un solo envío', () => {
  // El defecto que atrapa: leer el día de toda la cuadrilla y aplicarle a uno la fila de otro. Se
  // marca ausente a P —que no tiene nada— mientras Q ya tenía su ausencia.
  const deQ = [fila('r9', 'ausencia', 8.8, null, { persona_id: Q })]
  const plan = planDeAusenciasSinObra([marcaAusente(P)], deQ)
  assert.equal(plan.escribir.length, 1)
  assert.equal(plan.escribir[0].id, null, 'no puede corregir la fila de otra persona')
  assert.deepEqual(plan.borrar, [])
})

test('EL ACUSE DE LA CARGA DEL DÍA DICE QUE NO SE CARGÓ A NINGUNA OBRA', () => {
  const m = acuseDeAusenciasDelDia({ insertadas: 1, actualizadas: 0, sacadas: 0, sinCambio: 0, intactas: [] })
  assert.equal(m, 'Ausencia registrada. La ausencia es de la persona; no se cargó a ninguna obra.')
  assert.ok(m && !/imputad/i.test(m))
  // Sin nada que decir no dice nada: un acuse vacío sería «no cambió nada» sobre lo que sí cambió
  // en la obra.
  assert.equal(acuseDeAusenciasDelDia({ insertadas: 0, actualizadas: 0, sacadas: 0, sinCambio: 0, intactas: [] }), null)
  assert.match(
    acuseDeAusenciasDelDia({ insertadas: 0, actualizadas: 0, sacadas: 0, sinCambio: 1, intactas: [] }) ?? '',
    /ya estaba registrada/)
})

// ── LAS HORAS QUE LLEVA UNA AUSENCIA (dueño, 08/09/2026 16:16) ─────────────────────────────────
//
// «las ausencias que tienen motivo registrado dan la posibilidad de que se le registre hs, como
// pasa con los accidentes laborales». El campo del panel nace prellenado con esto.

test('LA JORNADA DE REFERENCIA VISIBLE SIGUE EL MISMO ORDEN QUE EL SERVIDOR', () => {
  assert.equal(jornadaDeReferenciaVisible([9, 8.8]), 9, 'la primera candidata útil manda')
  assert.equal(jornadaDeReferenciaVisible([null, undefined, 8.8]), 8.8, 'las vacías no cuentan')
  // El defecto que atrapa: un campo que nace vacío se guarda vacío, y la ausencia terminaría sin
  // las horas que sí corresponden por ley. Sin ninguna candidata vale la jornada estándar.
  assert.equal(jornadaDeReferenciaVisible([]), JORNADA_ESTANDAR_HS)
  assert.equal(jornadaDeReferenciaVisible([0, null]), JORNADA_ESTANDAR_HS, 'un cero no es una jornada')
})

test('LAS HORAS DEL FORMULARIO LE GANAN A LA JORNADA DE REFERENCIA, Y EL VACÍO NO ES CERO', () => {
  // Un accidente de trabajo con 4 hs reconocidas se guarda con 4, no con la jornada de la obra.
  assert.equal(horasDeLaAusencia(4, 8.8), 4)
  // Vaciar el campo NO registra cero —`registros_hh` exige horas > 0 y el dueño lo dijo al revés:
  // «se le suma hs porque corresponde por ley»—: vuelve a la jornada de referencia.
  assert.equal(horasDeLaAusencia(null, 8.8), 8.8)
  assert.equal(horasDeLaAusencia(0, 9), 9)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL TRAMO — «si ya sé que no va a haber por X cantidad de días, ya puedo dejarlo asentado»
// (dueño, 08/09/2026 16:51)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const conFecha = (
  id: string, fecha: string, tipo_hora: string, horas: number | string,
  obra_canonica_id: string | null, notas: string | null = null,
): FilaDelTramo => ({ id, fecha, tipo_hora, horas, obra_canonica_id, notas })

/** El criterio real de la obra, el mismo que inyecta la acción. Probar el tramo con un criterio de
 *  juguete probaría el juguete: lo que tiene que dar rojo es la composición que corre en producción. */
const sacar = (filas: FilaDelTramo[]) =>
  planDeBorrado(filas as unknown as FilaExistente[], { administraLicencias: true })

const tramo = (e: Partial<Parameters<typeof planDeTramoDeAusencia<FilaDelTramo>>[0]> = {}) =>
  planDeTramoDeAusencia<FilaDelTramo>({
    desde: '2026-09-09', hasta: '2026-09-19', horas: 8.8, motivo: 'accidente_trabajo',
    tipo: 'licencia', existentes: [], sacarDeLaObra: sacar, ...e,
  })

test('EL TRAMO NO ASIENTA DOMINGOS: son los días que la empresa no trabaja', () => {
  // El defecto que atrapa: nueve días hábiles convertidos en once filas, dos de ellas en días que
  // no existen para nadie —ni para la grilla, que ya no dibuja el domingo, ni para la liquidación—.
  const plan = tramo()
  assert.ok(plan.ok)
  const fechas = plan.dias.map((d) => d.fecha)
  // Del 9 al 19 hay once días de calendario y UN domingo adentro (el 13): diez hábiles. El 19 de
  // septiembre de 2026 es SÁBADO — el ejemplo del pedido decía «vie 19/09» y el almanaque manda.
  assert.equal(fechas.length, 10, `del 9 al 19 hay 10 días hábiles, salieron ${fechas.length}`)
  assert.ok(!fechas.includes('2026-09-13'), 'el domingo 13 no se asienta')
  assert.equal(fechas[0], '2026-09-09')
  assert.equal(fechas.at(-1), '2026-09-19')
  // EL SÁBADO SÍ: es laborable y se marca si se trabajó. Sacarlo del tramo dejaría un día de la
  // licencia sin asentar, y la quincena lo reclamaría en rojo como si alguien se hubiera olvidado.
  assert.ok(fechas.includes('2026-09-12'), 'el sábado 12 es laborable y entra')
})

test('UN «HASTA» ANTERIOR AL DÍA NO ESCRIBE NADA', () => {
  const plan = tramo({ hasta: '2026-09-01' })
  assert.equal(plan.ok, false)
  assert.match(plan.ok === false ? plan.error : '', /no va para atr/i)
})

test('EL TOPE DE 60 DÍAS: UN AÑO TIPEADO POR ERROR NO SE CONVIERTE EN 365 FILAS', () => {
  // El defecto que atrapa: `2027-09-19` en vez de `2026-09-19` —un dígito— asentaría una licencia
  // de un año y el acuse la contaría como un éxito.
  assert.equal(tramo({ hasta: '2027-09-19' }).ok, false)
  // El borde se prueba de los dos lados: 60 días entra, 61 no. Un tope que nadie midió es un tope
  // que puede estar corrido en uno y no enterarse nunca.
  assert.equal(tramo({ hasta: '2026-11-08' }).ok, true, '60 días exactos entran')
  assert.equal(tramo({ hasta: '2026-11-09' }).ok, false, '61 días ya no')
})

test('UN TRAMO DE UN SOLO DOMINGO NO ES UN TRAMO VACÍO QUE ACUSA ÉXITO', () => {
  const plan = tramo({ desde: '2026-09-13', hasta: '2026-09-13' })
  assert.equal(plan.ok, false)
  assert.match(plan.ok === false ? plan.error : '', /domingo/i)
})

test('IDEMPOTENTE: EL DÍA QUE YA DECÍA ESTO NO SE REESCRIBE, Y EL QUE DECÍA OTRA COSA SÍ', () => {
  // El defecto que atrapa: volver a asentar el mismo tramo —porque el jefe no vio el acuse, o
  // porque la fecha de alta se corrió dos días— duplicando filas o pisando las horas ya corregidas.
  const plan = tramo({
    hasta: '2026-09-11',
    existentes: [
      conFecha('a', '2026-09-09', 'licencia', '8.8', null, 'accidente_trabajo'),
      conFecha('b', '2026-09-10', 'licencia', '4', null, 'accidente_trabajo'),
      conFecha('c', '2026-09-11', 'ausencia', '8.8', null, 'accidente_trabajo'),
    ],
  })
  assert.ok(plan.ok)
  assert.equal(plan.dias[0].sinCambio, true, 'el 9 ya decía exactamente esto')
  assert.equal(plan.dias[0].id, 'a', 'y si hubiera que escribirlo, sería CORRIGIENDO esa fila')
  assert.equal(plan.dias[1].sinCambio, false, 'el 10 tenía 4 hs y el tramo son 8,8')
  assert.equal(plan.dias[1].id, 'b', 'se corrige la fila que ya estaba: no se escribe una segunda')
  assert.equal(plan.dias[2].sinCambio, false, 'el 11 era ausencia y el motivo la hace licencia')
})

test('EL DÍA QUE TENÍA HORAS EN UNA OBRA SE REEMPLAZA: NO TRABAJÓ', () => {
  // El defecto que atrapa: la licencia asentada al lado de las 8,8 hs que ya estaban cargadas en la
  // obra. El día quedaría contado dos veces y esas horas seguirían siendo costo de una obra donde
  // la persona no estuvo.
  const plan = tramo({
    hasta: '2026-09-10',
    existentes: [
      conFecha('h1', '2026-09-09', 'normal', '8.8', 'pisos-industriales'),
      // UNA IMPUTACIÓN A UNA ACTIVIDAD DEL PLAN NO SE LA LLEVA PUESTA EL TRAMO: la escribió alguien
      // con más información. Se nombra y queda.
      { ...conFecha('h2', '2026-09-10', 'normal', '2', 'pisos-industriales'), actividad_id: 'act-1' },
    ] as FilaDelTramo[],
  })
  assert.ok(plan.ok)
  assert.deepEqual(plan.dias[0].sacar, ['h1'])
  assert.equal(plan.dias[0].sinCambio, false)
  assert.deepEqual(plan.dias[1].sacar, [], 'lo imputado a una actividad no se toca')
  assert.equal(plan.dias[1].intactas.length, 1, 'y se nombra')
})

test('UNA LICENCIA QUE YA ESTABA IGUAL PERO CON HORAS EN OBRA NO SE PUEDE SALTEAR', () => {
  // El caso mixto: la fila sin obra ya dice lo mismo, pero el día ADEMÁS tiene horas cargadas en
  // una obra. Saltearlo como «sin cambio» dejaría el día contado dos veces para siempre.
  const plan = tramo({
    hasta: '2026-09-09',
    existentes: [
      conFecha('a', '2026-09-09', 'licencia', '8.8', null, 'accidente_trabajo'),
      conFecha('h1', '2026-09-09', 'normal', '8.8', 'pisos-industriales'),
    ],
  })
  assert.ok(plan.ok)
  assert.equal(plan.dias[0].sinCambio, false)
  assert.deepEqual(plan.dias[0].sacar, ['h1'])
})

test('EL ACUSE DEL TRAMO DICE EL PERÍODO, LOS DÍAS HÁBILES Y QUE NO ES DE NINGUNA OBRA', () => {
  const m = acuseDeTramo({
    tipo: 'licencia', desde: '2026-09-09', hasta: '2026-09-19', asentados: 9,
    motivo: 'Accidente de trabajo', horasSacadas: 0, obrasSacadas: [], rechazados: [],
  })
  assert.equal(m, 'Licencia asentada del mié 09/09 al sáb 19/09: 9 días hábiles · Accidente de '
    + 'trabajo. La ausencia es de la persona; no se cargó a ninguna obra.')
  assert.ok(!/imputad/i.test(m), 'el acuse de un tramo tampoco imputa nada a una obra')
})

test('EL ACUSE NOMBRA LOS DÍAS QUE LA POLICY RECHAZÓ Y POR QUÉ', () => {
  // El defecto que atrapa: un tramo que entró a medias acusado como completo. Los últimos días de
  // una licencia chocan contra el fin de la asignación —`marca_ausencia_de` mira la fecha DEL
  // REGISTRO— y nadie vuelve a mirar un tramo que dijo que salió bien.
  const uno = acuseDeTramo({
    tipo: 'ausencia', desde: '2026-09-09', hasta: '2026-09-16', asentados: 6,
    motivo: null, horasSacadas: 0, obrasSacadas: [], rechazados: ['2026-09-16'],
  })
  assert.ok(uno.includes('No podés asentar el 16/09: la persona no tiene asignación vigente ese día.'), uno)
  const varios = acuseDeTramo({
    tipo: 'ausencia', desde: '2026-09-09', hasta: '2026-09-19', asentados: 3,
    motivo: null, horasSacadas: 0, obrasSacadas: [],
    rechazados: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19'],
  })
  assert.ok(varios.includes('14/09, 15/09, 16/09, 17/09 y 2 más'), varios)
})

test('EL ACUSE DICE LAS HORAS QUE SACÓ DE UNA OBRA, CON SU NOMBRE', () => {
  const m = acuseDeTramo({
    tipo: 'licencia', desde: '2026-09-09', hasta: '2026-09-11', asentados: 3,
    motivo: 'Parte médico', horasSacadas: 17.6, obrasSacadas: ['PISOS INDUSTRIALES'], rechazados: [],
  })
  assert.ok(m.includes('Se sacaron las 17.6 hs que tenía cargadas en PISOS INDUSTRIALES'), m)
})

test('EL RESTO DE LA SEMANA LLEGA AL SÁBADO, no al viernes ni al domingo', () => {
  assert.equal(restoDeLaSemana('2026-09-09'), '2026-09-12', 'del miércoles al sábado')
  assert.equal(restoDeLaSemana('2026-09-12'), '2026-09-12', 'un sábado es su propio resto de semana')
  assert.equal(restoDeLaSemana('2026-09-07'), '2026-09-12', 'del lunes al sábado')
})

test('EL TOPE QUE OFRECE LA PANTALLA ES EL MISMO QUE VALIDA EL SERVIDOR', () => {
  // Un `max` más generoso que el tope dejaría elegir una fecha que la acción va a rechazar; uno más
  // corto escondería días que sí se pueden asentar. Las dos puertas salen del mismo número.
  const max = topeDelTramo('2026-09-09')
  assert.equal(tramo({ hasta: max }).ok, true)
  assert.equal(tramo({ hasta: '2026-11-09' }).ok, false)
})
