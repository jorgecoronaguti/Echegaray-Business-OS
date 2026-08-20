// EL ESCENARIO DEL PERFIL EMPLEADO — dos personas, una obra, y todo lo que hace falta para que una
// prueba negativa signifique algo.
//
// ═══ POR QUÉ HAY UN COMPAÑERO ═══
//
// «El empleado no ve legajos de terceros» no se prueba con una base donde no hay terceros: eso pasa
// por vacío y el test dice lo contrario de lo que mide. Por eso el escenario crea DOS personas con
// legajo, documentos, horas y recibo, y una sola de las dos es la del usuario.
//
// TODO LLEVA EL PREFIJO `ZZ-` y se borra en `limpiar()`. Una persona de prueba que sobreviva entra
// en el plantel real, en la nómina y en los conteos de Administración.

import type { SupabaseClient } from '@supabase/supabase-js'
import { CAMPO } from './identidades'

export const MARCA = 'ZZ-EMPLEADO'

export interface Escenario {
  usuarioId: string
  yo: string
  companero: string
  obra: string
  actividad: string
  cuadrilla: string
  /** Un documento que Administración le PIDE (presente = false). */
  documentoSolicitado: string
  documentoDelCompanero: string
  hhMia: string
  hhDelCompanero: string
  reciboDelCompanero: string
  /** Una obra que el usuario NO ve por ningún camino: ni asignación de persona ni `usuario_obra`. */
  obraAjena: string
}

async function usuarioDeCampo(admin: SupabaseClient): Promise<string> {
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const id = lista?.users?.find((u) => u.email?.toLowerCase() === CAMPO.email)?.id
  if (!id) throw new Error(`falta la cuenta ${CAMPO.email}: corré scripts/crear-operario-campo.mjs`)
  return id
}

export async function montar(admin: SupabaseClient): Promise<Escenario> {
  await limpiar(admin)
  const usuarioId = await usuarioDeCampo(admin)

  const { data: obra, error: eObra } = await admin.from('obra_canonica')
    .insert({ id: `zz-empleado-obra`, nombre: `${MARCA} Obra`, estado: 'activa', ubicacion: 'Ruta 5 km 12', etapa: 'desarrollo', jefe_obra: 'M. Duarte' })
    .select('id').single()
  if (eObra) throw new Error(`obra: ${eObra.message}`)

  const { data: personas, error: eP } = await admin.from('personas').insert([
    { nombre_completo: `${MARCA} Yo`, dni: '30111222', cuil: '20301112223', categoria: 'Oficial', puesto: 'Albañil', en_la_empresa: true, fecha_ingreso: '2019-03-04' },
    { nombre_completo: `${MARCA} Companero`, dni: '30999888', cuil: '20309998883', categoria: 'Ayudante', en_la_empresa: true },
  ]).select('id, nombre_completo')
  if (eP || !personas) throw new Error(`personas: ${eP?.message}`)
  const yo = personas.find((p) => p.nombre_completo.endsWith('Yo'))!.id as string
  const companero = personas.find((p) => p.nombre_completo.endsWith('Companero'))!.id as string

  // EL VÍNCULO. Es lo único que convierte una cuenta en un empleado del OS.
  const { error: eV } = await admin.from('perfiles').update({ persona_id: yo }).eq('id', usuarioId)
  if (eV) throw new Error(`vínculo: ${eV.message}`)

  const { data: cuadrilla, error: eC } = await admin.from('cuadrilla')
    .insert({ nombre: `${MARCA} Cuadrilla`, responsable_id: yo, activa: true }).select('id').single()
  if (eC) throw new Error(`cuadrilla: ${eC.message}`)
  await admin.from('cuadrilla_integrante').insert([
    { cuadrilla_id: cuadrilla.id, persona_id: yo },
    { cuadrilla_id: cuadrilla.id, persona_id: companero },
  ])

  await admin.from('obra_asignacion').insert([
    { obra_id: obra.id, persona_id: yo, rol: 'integrante', cuadrilla_id: cuadrilla.id, desde: '2026-01-01' },
    { obra_id: obra.id, persona_id: companero, rol: 'integrante', cuadrilla_id: cuadrilla.id, desde: '2026-01-01' },
  ])

  const { data: act, error: eA } = await admin.from('obra_actividad').insert({
    obra_id: obra.id, nombre: `${MARCA} Muro sur`, codigo: 'ZZ.1', clave: 'zz-empleado-obra::ZZ.1', estado: 'en_curso',
    responsable_id: yo, cuadrilla_id: cuadrilla.id, inicio_plan: '2026-08-01', fin_plan: '2026-08-31',
    unidad: 'm2', cantidad_objetivo: 100, comentario: 'Traba a media pieza, junta de 10 mm.',
  }).select('id').single()
  if (eA) throw new Error(`actividad: ${eA.message}`)

  const { data: hh, error: eH } = await admin.from('registros_hh').insert([
    { obra_canonica_id: obra.id, persona_id: yo, actividad_id: act.id, fecha: '2026-08-03', fecha_inicio_semana: '2026-08-03', horas: 8, tipo_hora: 'normal', trabajador_o_cuadrilla: `${MARCA} Yo`, fuente_legacy: 'zz-prueba' },
    { obra_canonica_id: obra.id, persona_id: companero, actividad_id: act.id, fecha: '2026-08-03', fecha_inicio_semana: '2026-08-03', horas: 8, tipo_hora: 'normal', trabajador_o_cuadrilla: `${MARCA} Companero`, fuente_legacy: 'zz-prueba' },
  ]).select('id, persona_id')
  if (eH || !hh) throw new Error(`hh: ${eH?.message}`)

  const { data: docs, error: eD } = await admin.from('documentacion_legajo').insert([
    { persona_id: yo, tipo_documento: 'examen_medico', nombre: `${MARCA} Apto medico 2026`, presente: false },
    { persona_id: yo, tipo_documento: 'recibo_sueldo', nombre: `Recibo 2026-07 Q1 · ${MARCA} YO.pdf`, presente: true, drive_file_id: 'zz-drive-mio', fecha_documento: '2026-07-01' },
    { persona_id: companero, tipo_documento: 'dni', nombre: `${MARCA} DNI companero`, presente: true, drive_file_id: 'zz-drive-ajeno' },
    { persona_id: companero, tipo_documento: 'recibo_sueldo', nombre: `Recibo 2026-07 Q1 · ${MARCA} COMPANERO.pdf`, presente: true, drive_file_id: 'zz-drive-recibo-ajeno', fecha_documento: '2026-07-01' },
  ]).select('id, persona_id, tipo_documento, nombre')
  if (eD || !docs) throw new Error(`documentos: ${eD?.message}`)

  const { data: recibo, error: eR } = await admin.from('recibo_empleado').insert({
    persona_id: companero, periodo_desde: '2026-07-01', periodo_hasta: '2026-07-15', etiqueta: 'Q1',
    neto: 1284500, estado_pago: 'pagado', fecha_pago: '2026-08-05', dias: 12, hh: 96, categoria: 'Ayudante',
  }).select('id').single()
  if (eR) throw new Error(`recibo: ${eR.message}`)

  // LA OBRA AJENA SE ELIGE EXCLUYENDO TODO LO QUE EL USUARIO SÍ VE. `usuario_obra` puede tener
  // filas puestas por otro spec (`asegurarCampo`), y tomar «cualquier otra obra» haría que la prueba
  // negativa midiera un acceso legítimo y culpara al RLS de un residuo ajeno.
  const { data: suyas } = await admin.from('usuario_obra').select('obra_canonica_id').eq('usuario_id', usuarioId)
  const vistas = new Set([...(suyas ?? []).map((x) => x.obra_canonica_id as string), obra.id as string])
  const { data: todas } = await admin.from('obra_canonica').select('id')
  const obraAjena = (todas ?? []).map((o) => o.id as string).find((id) => !vistas.has(id))
  if (!obraAjena) throw new Error('no hay ninguna obra que el usuario no vea: la prueba negativa no mediría nada')

  return {
    usuarioId, yo, companero, obra: obra.id as string, actividad: act.id as string, obraAjena,
    cuadrilla: cuadrilla.id as string,
    documentoSolicitado: docs.find((d) => d.tipo_documento === 'examen_medico')!.id as string,
    documentoDelCompanero: docs.find((d) => d.tipo_documento === 'dni')!.id as string,
    hhMia: hh.find((h) => h.persona_id === yo)!.id as string,
    hhDelCompanero: hh.find((h) => h.persona_id === companero)!.id as string,
    reciboDelCompanero: recibo.id as string,
  }
}

/** Se borra en el orden inverso al alta y SIN depender del escenario: si un test murió a la mitad,
 *  el residuo se limpia igual la próxima vez que corra. */
export async function limpiar(admin: SupabaseClient): Promise<void> {
  const { data: personas } = await admin.from('personas').select('id').like('nombre_completo', `${MARCA}%`)
  const ids = (personas ?? []).map((p) => p.id as string)

  const usuarioId = await usuarioDeCampo(admin).catch(() => null)
  if (usuarioId) await admin.from('perfiles').update({ persona_id: null }).eq('id', usuarioId)

  if (ids.length) {
    await admin.from('documento_presentacion').delete().in('persona_id', ids)
    await admin.from('recibo_empleado').delete().in('persona_id', ids)
    await admin.from('asistencia_marca').delete().in('persona_id', ids)
    await admin.from('documentacion_legajo').delete().in('persona_id', ids)
    await admin.from('registros_hh').delete().in('persona_id', ids)
    await admin.from('cuadrilla_integrante').delete().in('persona_id', ids)
    await admin.from('obra_asignacion').delete().in('persona_id', ids)
  }
  // Los impedimentos de prueba se borran POR SU TEXTO y no por la obra: la prueba negativa intenta
  // escribir en una obra ajena, y si alguna vez entra, borrar sólo los de la obra de prueba dejaría
  // el residuo justo en la obra real donde no tiene que estar.
  await admin.from('obra_restriccion').delete().like('descripcion', 'ZZ%')
  await admin.from('obra_restriccion').delete().eq('obra_id', 'zz-empleado-obra')
  await admin.from('obra_actividad').delete().eq('obra_id', 'zz-empleado-obra')
  await admin.from('cuadrilla').delete().like('nombre', `${MARCA}%`)
  if (ids.length) await admin.from('personas').delete().in('id', ids)
  await admin.from('obra_canonica').delete().eq('id', 'zz-empleado-obra')
}
