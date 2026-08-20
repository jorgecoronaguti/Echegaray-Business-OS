// EL EMPLEADO VE LO SUYO Y SÓLO LO SUYO — medido con identidades reales, leyendo el efecto.
//
// ═══ POR QUÉ NO ALCANZA CON EL STATUS HTTP ═══
//
// Este repo ya se equivocó dos veces leyendo códigos: un `PATCH` que no toca ninguna fila devuelve
// **204** igual, y `Prefer: return=representation` convierte una LECTURA negada en un 403 que
// parece una escritura negada. Cada caso de acá lee el efecto con la clave de servicio después de
// intentar la escritura. El status es una pista; la fila es la prueba.
//
// ═══ EL ESCENARIO TIENE UN TERCERO A PROPÓSITO ═══
//
// «No ve legajos de terceros» no se prueba en una base sin terceros: pasaría por vacío. Hay dos
// personas con legajo, documentos, horas y recibo, y el usuario es UNA de las dos.

import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ADMIN, ANON, CAMPO, JEFE, URL, entrar, escribir, pedir, servicio } from './util/identidades'
import { montar, limpiar, type Escenario } from './util/empleado'

let admin: SupabaseClient
let esc: Escenario
let campo: string

test.beforeAll(async () => {
  admin = servicio()
  esc = await montar(admin)
  campo = await entrar(CAMPO.email, CAMPO.password)
})

test.afterAll(async () => {
  // TODA PRUEBA SE LIMPIA. Una persona `ZZ-` que sobreviva entra en el plantel real y en la nómina.
  await limpiar(admin)
})

// ── LO QUE SÍ ────────────────────────────────────────────────────────────────────────────────

test('el empleado vinculado ve SU legajo, con su propio DNI', async () => {
  const r = await pedir(campo, 'mi_legajo?select=*')
  expect(r.status, 'mi_legajo no respondió').toBe(200)
  expect(r.filas.length, 'el legajo propio tiene que ser exactamente uno').toBe(1)
  const l = r.filas[0] as { id: string; dni: string | null; nombre_completo: string }
  expect(l.id).toBe(esc.yo)
  // El DNI de UNO es de uno. El grant de columna que se lo niega a `authenticated` sobre `personas`
  // protege el de los DEMÁS, y esta vista sólo devuelve la fila de quien pregunta.
  expect(l.dni, 'el empleado tiene que poder ver su propio DNI').toBe('30111222')
})

test('LA OBRA SE ABRE POR LA ASIGNACIÓN DE LA PERSONA, no por una segunda tabla', async () => {
  // `usuario_obra` dice a qué obras entra una CUENTA; `obra_asignacion`, a qué obra está asignada una
  // PERSONA. Hasta el 20/08 `ve_obra()` sólo miraba la primera, y había que cargar el mismo hecho dos
  // veces en dos pantallas. La obra de este escenario NO está en `usuario_obra`: si se lee, es por la
  // asignación. Y la ajena sigue cerrada, que es la otra mitad de la afirmación.
  const mia = await pedir(campo, `obra_canonica?select=id,nombre&id=eq.${esc.obra}`)
  expect(mia.filas.length, 'la obra donde está asignada la persona no se abrió para su cuenta').toBe(1)
  const ajena = await pedir(campo, `obra_canonica?select=id&id=eq.${esc.obraAjena}`)
  expect(ajena.filas, 'se abrió una obra que no es suya').toEqual([])
})

test('ve su obra, su cuadrilla y sus tareas', async () => {
  const obra = await pedir(campo, 'mi_obra?select=id,nombre,ubicacion,jefe_obra')
  expect(obra.filas.map((f) => (f as { id: string }).id)).toEqual([esc.obra])

  const cuadrilla = await pedir(campo, 'mi_cuadrilla?select=nombre_completo,rol,es_responsable')
  expect(cuadrilla.filas.length, 'la cuadrilla tiene dos integrantes').toBe(2)

  const tareas = await pedir(campo, 'mi_tarea?select=id,nombre,impedimentos')
  expect(tareas.filas.map((f) => (f as { id: string }).id)).toEqual([esc.actividad])
})

test('LA CUADRILLA SE LISTA POR NOMBRE Y ROL, SIN PUERTA A SUS DATOS', async () => {
  // El handoff: «los integrantes se listan por nombre y rol, sin acceso a legajos ni documentos de
  // terceros». La vista NO publica el `id` de la persona: lo que no sale no se puede pedir después.
  const r = await pedir(campo, 'mi_cuadrilla?select=*')
  const columnas = Object.keys((r.filas[0] ?? {}) as object)
  expect(columnas, 'mi_cuadrilla publicó un id de persona: es la puerta al legajo ajeno')
    .not.toContain('persona_id')
  expect(columnas).not.toContain('dni')
  expect(columnas).not.toContain('cuil')
})

test('ve SUS horas y ninguna de su compañero', async () => {
  const r = await pedir(campo, 'mi_hh_dia?select=id,horas')
  expect(r.filas.map((f) => (f as { id: string }).id)).toEqual([esc.hhMia])

  // Y por la tabla directa, que es lo que puede hacer cualquiera con el token:
  const directo = await pedir(campo, 'registros_hh?select=id,persona_id')
  const ajenas = directo.filas.filter((f) => (f as { persona_id: string }).persona_id === esc.companero)
  expect(ajenas, 'el empleado leyó las horas de un tercero por la tabla directa').toEqual([])
})

test('ve sus documentos, y los recibos NO están en esa lista', async () => {
  const r = await pedir(campo, 'mi_documento_legajo?select=id,tipo_documento')
  const tipos = r.filas.map((f) => (f as { tipo_documento: string }).tipo_documento)
  expect(tipos, 'el apto médico solicitado tiene que estar').toContain('examen_medico')
  // 652 de los 847 papeles del legajo son recibos: dejarlos acá sepulta lo que vence.
  expect(tipos, 'los recibos tienen su propia pantalla').not.toContain('recibo_sueldo')
})

test('ve sus recibos: el PDF existe aunque el importe no esté publicado', async () => {
  const r = await pedir(campo, 'mi_recibo?select=id,periodo,liquidado,neto,drive_file_id')
  expect(r.filas.length).toBe(1)
  const rec = r.filas[0] as { liquidado: boolean; neto: number | null; drive_file_id: string }
  expect(rec.drive_file_id, 'el PDF del recibo es real y tiene que llegar').toBe('zz-drive-mio')
  // NUNCA $ 0 POR FALTA DE DATO: sin liquidación, el neto es null y la pantalla escribe «todavía no
  // liquidado». Un cero afirmaría que no cobró nada.
  expect(rec.liquidado).toBe(false)
  expect(rec.neto).toBeNull()
})

// ── LO QUE NO ────────────────────────────────────────────────────────────────────────────────

test('NO llega al legajo de un tercero, ni por la vista ni por la tabla', async () => {
  const mio = await pedir(campo, `mi_legajo?select=id&id=eq.${esc.companero}`)
  expect(mio.filas, 'mi_legajo filtrado por otro id devolvió algo').toEqual([])

  const directo = await pedir(campo, `personas?select=id,nombre_completo&id=eq.${esc.companero}`)
  // `personas_select` deja ver a la gente de la obra que uno ve —hace falta para la cuadrilla— pero
  // el grant por columna le niega dni, cuil, teléfono y retribución a `authenticated`.
  const conDni = await pedir(campo, `personas?select=dni,cuil,retribucion_pactada&id=eq.${esc.companero}`)
  expect(conDni.status, 'salieron columnas sensibles de un tercero').toBe(403)
  expect(directo.status).toBe(200)
})

test('NO llega a los documentos de un tercero', async () => {
  const porVista = await pedir(campo, `mi_documento_legajo?select=id&id=eq.${esc.documentoDelCompanero}`)
  expect(porVista.filas).toEqual([])
  const directo = await pedir(campo, `documentacion_legajo?select=id,persona_id`)
  expect(directo.filas, 'documentacion_legajo se lee sólo desde Administración').toEqual([])
})

test('NO llega al recibo de un tercero — ni el jefe de obra tampoco', async () => {
  const mio = await pedir(campo, 'recibo_empleado?select=id,neto')
  expect(mio.filas, 'el recibo del compañero salió por la tabla directa').toEqual([])

  // Y la línea del 19/08 entre ADMINISTRAR y VER LA PLATA: el jefe de obra administra legajos, y un
  // sueldo no es un legajo. `es_administracion()` lo incluye; `ve_economia()` no, y ésta usa ésa.
  const jefe = await entrar(JEFE.email, JEFE.password)
  const suyo = await pedir(jefe, 'recibo_empleado?select=id,neto')
  expect(suyo.filas, 'un jefe de obra leyó los sueldos de su cuadrilla').toEqual([])

  const direccion = await entrar(ADMIN.email, ADMIN.password)
  const deDireccion = await pedir(direccion, 'recibo_empleado?select=id')
  expect(deDireccion.filas.length, 'Dirección sí ve la liquidación').toBeGreaterThan(0)
})

test('NO FABRICA LA PRESENCIA DE OTRO', async () => {
  const status = await escribir(campo, 'asistencia_marca', 'POST', {
    persona_id: esc.companero, fecha: '2026-08-10', tipo: 'entrada',
  })
  expect(status, 'PostgREST aceptó una marca a nombre de un tercero').toBe(403)
  // EL EFECTO, no el status: se lee con la clave de servicio.
  const { data } = await admin.from('asistencia_marca').select('id').eq('persona_id', esc.companero)
  expect(data ?? [], 'entró una marca a nombre del compañero').toEqual([])
})

test('registra SU entrada y SU salida, y no puede editarlas después', async () => {
  const entrada = await escribir(campo, 'asistencia_marca', 'POST', {
    persona_id: esc.yo, fecha: '2026-08-11', tipo: 'entrada', momento: '2026-08-11T10:58:00Z',
  })
  expect(entrada, 'no pudo registrar su propia entrada').toBeLessThan(300)
  await escribir(campo, 'asistencia_marca', 'POST', {
    persona_id: esc.yo, fecha: '2026-08-11', tipo: 'salida', momento: '2026-08-11T20:20:00Z',
  })
  const { data } = await admin.from('asistencia_marca').select('tipo').eq('persona_id', esc.yo).eq('fecha', '2026-08-11')
  expect((data ?? []).map((x) => x.tipo).sort()).toEqual(['entrada', 'salida'])

  // Corregir la hora propia es de Administración: si no, la marca deja de ser un hecho.
  await escribir(campo, `asistencia_marca?persona_id=eq.${esc.yo}&tipo=eq.entrada`, 'PATCH', { momento: '2026-08-11T13:00:00Z' })
  const { data: despues } = await admin.from('asistencia_marca')
    .select('momento').eq('persona_id', esc.yo).eq('fecha', '2026-08-11').eq('tipo', 'entrada').single()
  expect(new Date(despues!.momento as string).toISOString(), 'el empleado editó su propia hora de entrada')
    .toBe('2026-08-11T10:58:00.000Z')
})

test('UNA MARCA NO SE BORRA — es historial', async () => {
  const status = await escribir(campo, `asistencia_marca?persona_id=eq.${esc.yo}`, 'DELETE')
  expect(status, 'hay un DELETE disponible sobre la asistencia').toBe(403)
  const { data } = await admin.from('asistencia_marca').select('id').eq('persona_id', esc.yo)
  expect((data ?? []).length, 'se borró una marca del historial').toBeGreaterThan(0)
})

test('NADIE SE AUTOAPRUEBA UN DOCUMENTO', async () => {
  const alta = await escribir(campo, 'documento_presentacion', 'POST', {
    persona_id: esc.yo, documentacion_id: esc.documentoSolicitado, tipo_documento: 'examen_medico',
    archivo_path: `${esc.yo}/zz.jpg`, estado: 'en_revision',
  })
  expect(alta, 'no pudo presentar su propio documento').toBeLessThan(300)

  // Nacer aprobado: la pantalla no ofrece el campo, pero la pantalla no es la cerradura.
  const trucho = await escribir(campo, 'documento_presentacion', 'POST', {
    persona_id: esc.yo, tipo_documento: 'dni', archivo_path: `${esc.yo}/zz2.jpg`, estado: 'aprobado',
  })
  expect(trucho, 'una presentación pudo nacer aprobada').toBe(403)

  // Aprobarse la propia después:
  await escribir(campo, `documento_presentacion?persona_id=eq.${esc.yo}`, 'PATCH', { estado: 'aprobado' })
  const { data } = await admin.from('documento_presentacion').select('estado').eq('persona_id', esc.yo)
  expect((data ?? []).map((x) => x.estado), 'el empleado se aprobó su propia documentación')
    .toEqual(['en_revision'])
})

test('no presenta documentación a nombre de otro', async () => {
  const status = await escribir(campo, 'documento_presentacion', 'POST', {
    persona_id: esc.companero, tipo_documento: 'dni', archivo_path: `${esc.companero}/zz.jpg`, estado: 'en_revision',
  })
  expect(status).toBe(403)
  const { data } = await admin.from('documento_presentacion').select('id').eq('persona_id', esc.companero)
  expect(data ?? []).toEqual([])
})

// ── REPORTAR UN PROBLEMA ─────────────────────────────────────────────────────────────────────

test('REPORTA un impedimento en su obra, y no en una ajena', async () => {
  const propio = await escribir(campo, 'obra_restriccion', 'POST', {
    obra_id: esc.obra, actividad_id: esc.actividad, tipo: 'sin_clasificar',
    descripcion: 'ZZ no llegaron los bloques', estado: 'abierta', frena: true,
  })
  expect(propio, 'el empleado no pudo reportar lo que ve').toBeLessThan(300)
  const { data } = await admin.from('obra_restriccion').select('id, frena').eq('obra_id', esc.obra)
  expect((data ?? []).length, 'el impedimento no entró').toBe(1)
  expect(data![0].frena, '«¿frena el trabajo?» no se guardó').toBe(true)

  // Una obra que no ve por NINGÚN camino —ni asignación de persona ni `usuario_obra`—:
  const enAjena = await escribir(campo, 'obra_restriccion', 'POST', {
    obra_id: esc.obraAjena, tipo: 'sin_clasificar', descripcion: 'ZZ ajeno', estado: 'abierta',
  })
  expect(enAjena, 'reportó un impedimento en una obra que no es suya').toBe(403)
  const { data: enLaAjena } = await admin.from('obra_restriccion').select('id').eq('obra_id', esc.obraAjena).like('descripcion', 'ZZ%')
  expect(enLaAjena ?? []).toEqual([])
})

test('un impedimento del empleado NO puede nacer liberado ni cerrarse solo', async () => {
  const liberado = await escribir(campo, 'obra_restriccion', 'POST', {
    obra_id: esc.obra, tipo: 'sin_clasificar', descripcion: 'ZZ ya resuelto', estado: 'liberada',
  })
  expect(liberado, 'un impedimento del empleado nació liberado').toBe(403)

  // Y cerrarlo es gestionarlo, que es del jefe:
  await escribir(campo, `obra_restriccion?obra_id=eq.${esc.obra}`, 'PATCH', { estado: 'liberada' })
  const { data } = await admin.from('obra_restriccion').select('estado').eq('obra_id', esc.obra)
  expect((data ?? []).map((x) => x.estado), 'el empleado cerró su propio impedimento').toEqual(['abierta'])

  // EL STATUS NO PRUEBA NADA ACÁ: un DELETE que no toca ninguna fila devuelve 204 igual, porque la
  // RLS filtró las filas ANTES de borrar. Lo que prueba es que el impedimento sigue estando.
  await escribir(campo, `obra_restriccion?obra_id=eq.${esc.obra}`, 'DELETE')
  const { data: despues } = await admin.from('obra_restriccion').select('id').eq('obra_id', esc.obra)
  expect((despues ?? []).length, 'el empleado borró un impedimento').toBe(1)
})

test('el avance de la actividad no lo escribe el empleado', async () => {
  // Es la decisión vigente del OS y no se cambió acá: el avance imputa horas y alimenta la
  // certificación. La pantalla lo dice en vez de ofrecer un botón que rebota.
  await escribir(campo, `obra_actividad?id=eq.${esc.actividad}`, 'PATCH', { pct: 99, estado: 'hecha' })
  const { data } = await admin.from('obra_actividad').select('pct, estado').eq('id', esc.actividad).single()
  expect(data!.estado, 'el empleado cerró una actividad').toBe('en_curso')
})

// ── LOS DOS BORDES ───────────────────────────────────────────────────────────────────────────

test('UNA CUENTA SIN PERSONA VINCULADA NO VE NADA — y eso no es un error', async () => {
  // `mi_persona_id()` devuelve NULL, `x = NULL` es NULL, y una vista cuyo `where` nunca es verdadero
  // devuelve cero filas. Falla cerrado por construcción. La pantalla lo dice con `SinVinculo`.
  await admin.from('perfiles').update({ persona_id: null }).eq('id', esc.usuarioId)
  const sinVinculo = await entrar(CAMPO.email, CAMPO.password)
  for (const vista of ['mi_legajo', 'mi_obra', 'mi_cuadrilla', 'mi_tarea', 'mi_hh_dia', 'mi_documento_legajo', 'mi_recibo', 'mi_asistencia_dia']) {
    const r = await pedir(sinVinculo, `${vista}?select=*`)
    expect(r.status, `${vista} rompió sin vínculo`).toBe(200)
    expect(r.filas, `${vista} devolvió filas para una cuenta sin persona vinculada`).toEqual([])
  }
  await admin.from('perfiles').update({ persona_id: esc.yo }).eq('id', esc.usuarioId)
})

test('un anónimo no ve una sola fila de nada de esto', async () => {
  for (const vista of ['mi_legajo', 'mi_asistencia_dia', 'mi_recibo', 'asistencia_marca', 'documento_presentacion', 'recibo_empleado']) {
    const r = await fetch(`${URL}/rest/v1/${vista}?select=*`, { headers: { apikey: ANON } })
    expect([401, 403], `${vista} le contestó a un anónimo con ${r.status}`).toContain(r.status)
  }
})
