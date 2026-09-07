import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ORDEN_DEL_MOVIMIENTO, acuseDe, cambiaDeObra, correccionSchema, envioSchema, motivoDe,
  planDeGuardado, traducirEscritura,
} from './planDeJornada.ts'
import type { Correccion, FilaExistente, MarcaDeJornada } from './planDeJornada.ts'

/** El acuse habla de lo que la BASE devolvió: se le pasa el efecto, no el plan. */
const comoSiTodoEntro = (p: ReturnType<typeof planDeGuardado>) => ({
  insertadas: p.insertar.length,
  actualizadas: p.actualizar.length,
  borradas: p.borrar.length,
  intactas: p.intactas,
})

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const presente = (persona_id: string, horas: number): MarcaDeJornada =>
  ({ persona_id, estado: 'presente', horas })
const ausente = (persona_id: string, horas = 8.8, motivo: string | null = null): MarcaDeJornada =>
  ({ persona_id, estado: 'ausente', horas, motivo })
const fila = (
  id: string, persona_id: string, horas: number, tipo_hora = 'normal',
  extra: Partial<FilaExistente> = {},
): FilaExistente => ({ id, persona_id, horas, tipo_hora, actividad_id: null, improductiva: false, ...extra })

test('EL DÍA QUE SE ABRE Y SE GUARDA SIN TOCAR NADA NO ESCRIBE DE NUEVO', () => {
  // El defecto que atrapa: reguardar el día crea una segunda fila y duplica las horas de la obra, o
  // choca contra la clave única y devuelve un error de Postgres a un jefe que no hizo nada mal.
  const plan = planDeGuardado([presente(A, 8.8)], [fila('r1', A, 8.8)])
  assert.deepEqual(plan, { insertar: [], actualizar: [], borrar: [], intactas: [] })
  assert.match(acuseDe(comoSiTodoEntro(plan)), /ya estaba así/)
})

test('CORREGIR 8,8 A 5 ACTUALIZA LA FILA, NO AGREGA UNA SEGUNDA', () => {
  // El defecto que atrapa: `imputarHHMasivo` saltea a quien ya tenía horas. Con esa lógica, corregir
  // a González de 8,8 a 5 no habría hecho nada y la pantalla habría dicho que guardó.
  const plan = planDeGuardado([presente(A, 5)], [fila('r1', A, 8.8)])
  assert.deepEqual(plan.insertar, [])
  assert.equal(plan.actualizar.length, 1)
  assert.equal(plan.actualizar[0].id, 'r1')
  assert.equal(plan.actualizar[0].marca.horas, 5)
  assert.deepEqual(plan.borrar, [])
})

test('MARCAR AUSENTE A QUIEN TENÍA HORAS BORRA LAS HORAS', () => {
  // El defecto que atrapa: dejar las dos filas. El día contaría 8,8 horas trabajadas Y una ausencia
  // de la misma persona, y ese doble conteo viaja al costo de mano de obra de la obra.
  const plan = planDeGuardado([ausente(A)], [fila('r1', A, 8.8)])
  assert.deepEqual(plan.borrar, ['r1'])
  assert.equal(plan.insertar.length, 1)
  assert.equal(plan.insertar[0].estado, 'ausente')
})

test('VOLVER DE AUSENTE A PRESENTE BORRA LA AUSENCIA', () => {
  const plan = planDeGuardado([presente(A, 8.8)], [fila('r1', A, 8.8, 'ausencia')])
  assert.deepEqual(plan.borrar, ['r1'])
  assert.equal(plan.insertar.length, 1)
})

test('LAS EXTRAS NO SE REEMPLAZAN: son otro hecho y quedan intactas', () => {
  // EL DEFECTO QUE ENCONTRÓ LA AUDITORÍA. `esTrabajada()` metía normal, extra_50 y extra_100 en el
  // mismo cajón, y `find` tomaba la PRIMERA — con el `select` sin `.order()`, la que eligiera
  // PostgREST. Si venían las extras primero, corregir la jornada convertía 8,8 normales en 8,8
  // extra_50: un recargo que nadie declaró, sobre horas que se liquidan.
  const plan = planDeGuardado([presente(A, 9)], [fila('r1', A, 8.8), fila('r2', A, 2, 'extra_50')])
  assert.deepEqual(plan.borrar, [], 'la extra no se borra: la declaró alguien con más información')
  assert.deepEqual(plan.actualizar.map((a) => a.id), ['r1'])
  assert.deepEqual(plan.actualizar.map((a) => a.tipo), ['normal'], 'el tipo no puede cambiar solo')
  assert.deepEqual(plan.intactas.map((i) => i.id), ['r2'])
})

test('EL ORDEN EN QUE VIENEN LAS FILAS NO PUEDE CAMBIAR EL PLAN', () => {
  // La otra mitad del mismo defecto: el resultado dependía de qué devolvía PostgREST primero.
  const filas = [fila('r1', A, 8.8), fila('r2', A, 2, 'extra_50'), fila('r3', A, 1, 'extra_100')]
  const directo = planDeGuardado([presente(A, 9)], filas)
  const alReves = planDeGuardado([presente(A, 9)], [...filas].reverse())
  assert.deepEqual(directo, alReves)
})

test('UNA IMPUTACIÓN A UNA ACTIVIDAD DEL PLAN NO ES LA JORNADA DEL DÍA', () => {
  // El defecto que atrapa: dos filas `normal` del mismo día —una del plan de obra con su actividad,
  // otra la jornada— se veían idénticas y el plan borraba una. Se perdía trabajo imputado a una
  // actividad, que es lo que alimenta el plan contra real.
  const plan = planDeGuardado([presente(A, 9)], [
    fila('r1', A, 8.8),
    fila('r2', A, 4, 'normal', { actividad_id: '00000000-0000-4000-8000-000000000001' }),
  ])
  assert.deepEqual(plan.borrar, [])
  assert.deepEqual(plan.actualizar.map((a) => a.id), ['r1'])
  assert.deepEqual(plan.intactas.map((i) => i.id), ['r2'])
  assert.match(plan.intactas[0].motivo, /actividad del plan/)
})

test('EL JEFE DE OBRA NO PISA UNA LICENCIA QUE AUTORIZÓ ADMINISTRACIÓN', () => {
  // El defecto que atrapa: `esTrabajada` agrupaba `ausencia` y `licencia`. Marcar presente sobre
  // una licencia la BORRABA —se perdía el respaldo de unas vacaciones o un parte médico— y marcar
  // ausente con las mismas horas decía «no había nada que cambiar» y la dejaba en pie: dos formas
  // de mentir sobre el mismo día, desde un teléfono a 300 km de quien la autorizó.
  const conLicencia = [fila('r1', A, 8.8, 'licencia')]

  const trabajo = planDeGuardado([presente(A, 8.8)], conLicencia)
  assert.deepEqual(trabajo.borrar, [], 'una licencia no se borra al marcar presente')
  assert.equal(trabajo.insertar.length, 1)
  assert.deepEqual(trabajo.intactas.map((i) => i.id), ['r1'])

  const falta = planDeGuardado([ausente(A, 8.8)], conLicencia)
  assert.deepEqual(falta.borrar, [])
  assert.equal(falta.insertar.length, 1, 'la ausencia se registra aparte, no se confunde con la licencia')
  assert.deepEqual(falta.intactas.map((i) => i.id), ['r1'])
  assert.match(falta.intactas[0].motivo, /Administración/)
})

test('ADMINISTRACIÓN SÍ CORRIGE UNA LICENCIA: es quien la autorizó', () => {
  // La otra mitad del pedido del dueño: «que todo pueda ser modificado por el administrador». Si la
  // licencia fuera intocable para todos, un parte médico mal cargado no se podría arreglar nunca.
  const conLicencia = [fila('r1', A, 8.8, 'licencia', { notas: 'vacaciones' })]
  const plan = planDeGuardado([presente(A, 8.8)], conLicencia, { administraLicencias: true })
  assert.deepEqual(plan.borrar, ['r1'], 'la licencia se reemplaza por el día trabajado')
  assert.equal(plan.insertar.length, 1)
  assert.deepEqual(plan.intactas, [])
})

test('UNA HORA IMPRODUCTIVA CON SU CAUSA QUEDA INTACTA', () => {
  // El CHECK de la base exige causa si es improductiva, y esa causa alimenta el aprendizaje del
  // estándar. Pisarla con «la jornada del día» borra la explicación del desvío.
  const plan = planDeGuardado([presente(A, 9)], [fila('r1', A, 4, 'normal', { improductiva: true })])
  assert.deepEqual(plan.borrar, [])
  assert.equal(plan.insertar.length, 1)
  assert.match(plan.intactas[0].motivo, /improductiva/)
})

test('EL TIPO VIAJA EN LA CORRECCIÓN: de trabajado a ausente y al revés', () => {
  // El defecto que atrapa: el `update` sólo mandaba `horas`. Corregir una jornada a «no vino»
  // dejaba la fila en `normal` con las horas de la ausencia — el día seguía contando como trabajado.
  const aAusente = planDeGuardado([ausente(A, 8.8)], [fila('r1', A, 8.8)])
  // Con las MISMAS horas y distinto tipo, la fila normal se borra y entra la ausencia: no alcanza
  // con actualizar, porque «no había nada que cambiar» sería falso.
  assert.deepEqual(aAusente.borrar, ['r1'])
  assert.equal(aAusente.insertar.length, 1)
  assert.equal(aAusente.insertar[0].estado, 'ausente')
})

test('EL ACUSE CUENTA LO QUE LA BASE DEVOLVIÓ, no lo que el plan pidió', () => {
  // El defecto que atrapa: afirmar «1 corregida» cuando el update afectó CERO filas —porque otro la
  // borró entremedio, o porque la policy la rechazó sin error—. La evidencia es del efecto.
  assert.match(acuseDe({ insertadas: 0, actualizadas: 0, borradas: 0, intactas: [] }),
    /No cambió nada en la base/)
  assert.equal(acuseDe({ insertadas: 1, actualizadas: 2, borradas: 0, intactas: [] }),
    'Día guardado: 1 marca nueva · 2 corregidas.')
})

test('LO QUE NO SE TOCÓ SE NOMBRA EN EL ACUSE', () => {
  const texto = acuseDe({
    insertadas: 1, actualizadas: 0, borradas: 0,
    intactas: [{ id: 'r2', motivo: 'tiene una licencia cargada por Administración' }],
  })
  assert.match(texto, /sin tocar/)
  assert.match(texto, /licencia/)
})

test('A QUIEN NO SE MANDÓ NO SE LE TOCA NADA: el silencio no se convierte en afirmación', () => {
  // La regla que gobierna toda la pantalla. Si el plan borrara «lo que no vino en el envío», guardar
  // el día de la cuadrilla A borraría las horas que otro jefe cargó de la cuadrilla B.
  const plan = planDeGuardado([presente(A, 8)], [fila('r1', A, 8), fila('r2', B, 8)])
  assert.deepEqual(plan.borrar, [])
  assert.deepEqual(plan.actualizar, [])
  assert.deepEqual(plan.insertar, [])
})

test('EL ENVÍO SE VALIDA: cero horas, 25 horas y un id que no es uuid no entran', () => {
  const ok = envioSchema.safeParse({
    obra_id: 'estrella', fecha: '2026-09-07', marcas: [presente(A, 5)],
  })
  assert.equal(ok.success, true)
  assert.equal(envioSchema.safeParse({
    obra_id: 'estrella', fecha: '2026-09-07', marcas: [presente(A, 0)],
  }).success, false, 'cero horas no es una marca')
  assert.equal(envioSchema.safeParse({
    obra_id: 'estrella', fecha: '2026-09-07', marcas: [presente(A, 25)],
  }).success, false)
  assert.equal(envioSchema.safeParse({
    obra_id: 'estrella', fecha: '7/9/2026', marcas: [presente(A, 5)],
  }).success, false, 'la fecha en formato del Sheet no es una fecha ISO')
  assert.equal(envioSchema.safeParse({
    obra_id: '', fecha: '2026-09-07', marcas: [presente(A, 5)],
  }).success, false)
  assert.equal(envioSchema.safeParse({
    obra_id: 'estrella', fecha: '2026-09-07', marcas: [{ persona_id: 'González', estado: 'presente', horas: 5 }],
  }).success, false, 'un nombre no identifica a una persona')
})

test('EL ACUSE DICE LO QUE PASÓ, no «guardado»', () => {
  const plan = planDeGuardado([presente(A, 5), ausente(B)], [fila('r1', A, 8.8)])
  assert.equal(acuseDe(comoSiTodoEntro(plan)), 'Día guardado: 1 marca nueva · 1 corregida.')
})

// ── LA CORRECCIÓN DE ADMINISTRACIÓN ───────────────────────────────────────────────────────────

const correccion = (p: Partial<Correccion> = {}): Correccion => correccionSchema.parse({
  persona_id: A, fecha: '2026-09-07', obra_destino: 'messina', estado: 'presente', horas: 8, ...p,
})

test('CAMBIAR DE OBRA SÓLO ES UN MOVIMIENTO SI HABÍA DE DÓNDE MOVER', () => {
  // El defecto que atrapa: tratar «cargar por primera vez» como un movimiento. Sin origen no hay
  // nada que borrar, y un borrado sobre `obra_canonica_id = null` barrería filas de otras obras.
  assert.equal(cambiaDeObra(correccion({ obra_origen: null })), false)
  assert.equal(cambiaDeObra(correccion({ obra_origen: 'estrella' })), true)
  assert.equal(cambiaDeObra(correccion({ obra_origen: 'messina' })), false, 'la misma obra no se mueve')
})

test('EL MOVIMIENTO INSERTA ANTES DE BORRAR: un duplicado visible le gana a una pérdida silenciosa', () => {
  // El defecto que atrapa: borrar primero. PostgREST no da transacciones, así que si el segundo
  // viaje falla el día queda en NINGUNA obra y las horas desaparecen sin que nadie vea un error.
  // Al revés, el peor caso es que el día aparezca en las dos obras — y eso se ve en la grilla.
  assert.deepEqual([...ORDEN_DEL_MOVIMIENTO], ['insertar', 'borrar'])
})

test('CORREGIR A PRESENTE EXIGE LAS HORAS: no hay presente sin número', () => {
  // El defecto que atrapa: guardar «presente» con horas en null y que la base rechace el insert con
  // un error de CHECK que no le dice nada a quien corrige.
  assert.equal(correccionSchema.safeParse({
    persona_id: A, fecha: '2026-09-07', obra_destino: 'messina', estado: 'presente', horas: null,
  }).success, false)
  assert.equal(correccionSchema.safeParse({
    persona_id: A, fecha: '2026-09-07', obra_destino: 'messina', estado: 'ausente', horas: 8.8,
  }).success, true)
  // Borrar no necesita horas: no se está declarando nada, se está sacando lo declarado.
  assert.equal(correccionSchema.safeParse({
    persona_id: A, fecha: '2026-09-07', obra_destino: 'messina', estado: 'borrar', horas: null,
  }).success, true)
})

test('ASIGNAR NUNCA VIENE PUESTO: crear una asignación es un acto de alguien', () => {
  // El defecto que atrapa: un default `true`. La asignación decide a qué obra se le imputa el costo
  // de esa persona; crearla sola haría que un dedo mal puesto la cambiara de obra sin decisión.
  assert.equal(correccion().asignar, false)
  assert.equal(correccion({ asignar: true }).asignar, true)
})

test('UNA OBRA DESTINO VACÍA NO ENTRA', () => {
  assert.equal(correccionSchema.safeParse({
    persona_id: A, fecha: '2026-09-07', obra_destino: '   ', estado: 'presente', horas: 8,
  }).success, false)
})

test('EL ERROR DE POSTGRES NO LLEGA CRUDO AL TELÉFONO DEL JEFE', () => {
  // El defecto que atrapa: mostrar `duplicate key value violates unique constraint
  // "registros_hh_persona_unico"` a alguien parado en una obra. No es un mensaje, es ruido — y lo
  // peor es que el caso real (otro cargó el mismo día al mismo tiempo) tiene una salida concreta.
  const choque = traducirEscritura({ code: '23505', message: 'duplicate key value violates unique constraint' })
  assert.match(choque, /Alguien más cargó ese mismo día/)
  assert.doesNotMatch(choque, /constraint|duplicate/)

  assert.match(traducirEscritura({ code: '42501', message: 'permission denied for table registros_hh' }),
    /no puede escribir horas/)

  // EL DEL PERÍODO CERRADO SE MUESTRA TAL CUAL: el trigger ya lo escribió para una persona, y
  // taparlo con un texto genérico le sacaría la única instrucción útil que tiene.
  const cerrado = 'El período 08/2026 está cerrado: no se pueden cargar, modificar ni borrar horas '
    + 'de ese mes. Reabrilo si hay que corregirlo.'
  assert.equal(traducirEscritura({ code: '23514', message: cerrado }), cerrado)
})

// ── EL MOTIVO: «ausencias, parte médico, etc» (pedido del dueño, 07/09/2026) ───────────────────

test('EL MOTIVO DECIDE SI EL DÍA ES AUSENCIA O LICENCIA', () => {
  // Sin esto, vacaciones y «faltó sin avisar» se guardan como el mismo cero: la diferencia entre un
  // derecho reconocido y una falta desaparece, y es justo la que usa quien liquida.
  const conParteMedico = planDeGuardado([ausente(A, 8.8, 'enfermedad')], [])
  assert.equal(conParteMedico.insertar.length, 1)

  // Sobre una fila ya cargada se ve el tipo que le va a tocar. Va con `administraLicencias`
  // porque corregir una licencia es de Administración: el jefe de obra no la toca.
  const corrige = planDeGuardado(
    [ausente(A, 8.8, 'vacaciones')], [fila('r1', A, 8.8, 'licencia')],
    { administraLicencias: true })
  assert.deepEqual(corrige.actualizar.map((x) => x.tipo), ['licencia'])
  assert.deepEqual(corrige.borrar, [])

  const falta = planDeGuardado([ausente(A, 8.8, 'falta')], [fila('r1', A, 8.8, 'ausencia')])
  assert.deepEqual(falta.actualizar.map((x) => x.tipo), ['ausencia'])
})

test('CAMBIAR DE FALTA A PARTE MÉDICO CAMBIA LA FILA aunque las horas sean las mismas', () => {
  // El defecto que atrapa: comparar sólo las horas. Corregir «faltó sin avisar» por «enfermedad» no
  // mueve ningún número, así que el plan decía «no había nada que cambiar» y dejaba la falta — con
  // el parte médico en la mano.
  const plan = planDeGuardado(
    [ausente(A, 8.8, 'enfermedad')],
    [fila('r1', A, 8.8, 'ausencia', { notas: 'falta' })],
  )
  // La fila pasa de `ausencia` a `licencia`: no es un update, es reemplazo — son tipos distintos.
  assert.deepEqual(plan.borrar, ['r1'])
  assert.equal(plan.insertar.length, 1)
})

test('CORREGIR EL MOTIVO DENTRO DEL MISMO TIPO SÍ ES UN UPDATE', () => {
  const plan = planDeGuardado(
    [ausente(A, 8.8, 'falta_con_aviso')],
    [fila('r1', A, 8.8, 'ausencia', { notas: 'falta' })],
  )
  assert.deepEqual(plan.actualizar.map((x) => x.id), ['r1'])
  assert.deepEqual(plan.borrar, [])
})

test('EL MISMO MOTIVO Y LAS MISMAS HORAS NO ESCRIBEN DE NUEVO', () => {
  const plan = planDeGuardado(
    [ausente(A, 8.8, 'vacaciones')],
    [fila('r1', A, 8.8, 'licencia', { notas: 'vacaciones' })],
    { administraLicencias: true },
  )
  assert.deepEqual(plan, { insertar: [], actualizar: [], borrar: [], intactas: [] })
})

test('UN MOTIVO QUE NO ESTÁ EN EL CATÁLOGO NO ENTRA', () => {
  // `notas` es texto libre. Sin la validación, «se fue nomás» quedaría guardado como si fuera un
  // motivo y el ausentismo por causa dejaría de poder agruparse.
  assert.equal(envioSchema.safeParse({
    obra_id: 'estrella', fecha: '2026-09-07',
    marcas: [{ persona_id: A, estado: 'ausente', horas: 8.8, motivo: 'se fue nomás' }],
  }).success, false)
  assert.equal(envioSchema.safeParse({
    obra_id: 'estrella', fecha: '2026-09-07',
    marcas: [{ persona_id: A, estado: 'ausente', horas: 8.8, motivo: 'enfermedad' }],
  }).success, true)
  // SIN MOTIVO SE PUEDE: marcar que alguien no vino sin saber todavía por qué es honesto.
  // Inventarle una causa para que el formulario cierre, no.
  assert.equal(envioSchema.safeParse({
    obra_id: 'estrella', fecha: '2026-09-07',
    marcas: [{ persona_id: A, estado: 'ausente', horas: 8.8, motivo: null }],
  }).success, true)
})

test('UN DÍA TRABAJADO NO LLEVA MOTIVO', () => {
  assert.equal(motivoDe(presente(A, 8)), null)
  assert.equal(motivoDe(ausente(A, 8.8, 'enfermedad')), 'enfermedad')
  assert.equal(motivoDe(ausente(A, 8.8, null)), null)
})
