// LAS LECTURAS DE LA SOLAPA «HORAS». Ni una regla de negocio acá: trae filas y nada más.
//
// La grilla la arma `grillaHorasQuincena.ts` y el panel de la persona `panelDePersona.ts`, los dos
// puros y probados sin Supabase. Este archivo sólo decide QUÉ se pide y en cuántos viajes.
//
// ═══ UNA SOLA VENTANA ANCHA PARA DOS PREGUNTAS ═══
//
// «HH por mes» del panel necesita cinco meses y la grilla sólo la quincena. Se lee UNA vez el rango
// ancho y la quincena se recorta en memoria: dos consultas sobre la misma tabla traerían las filas
// de la quincena dos veces por carga de pantalla.
//
// ═══ UNA FUENTE QUE FALLÓ SE DICE CON SU ERROR ═══
//
// Una grilla vacía porque la RLS rechazó la consulta es indistinguible de una quincena sin cargar.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PersonaDeGrilla } from './grillaHorasQuincena.ts'
import type { CorreccionDeDia, RegistroDelPanel } from './panelDePersona.ts'
import type { PresenciaDeQuincena, RegistroDeQuincena } from './liquidacionQuincena.ts'
import { correrQuincena, type Quincena } from './quincena.ts'

export interface DatosDePersona {
  legajo: { rotulo: string; valor: string | null; mono?: boolean }[]
  laboral: { rotulo: string; valor: string | null; mono?: boolean }[]
  asignacion: { rotulo: string; valor: string | null; mono?: boolean }[]
  encabezado: string
  nombre: string
  numeroLegajo: string | null
  valorHora: number | null
  convenio: string | null
  /** Todas las filas de HH de los últimos cinco meses: el panel recorta lo que necesita. */
  filasHH: { fecha: string; horas: number | null }[]
  registrosDeLaQuincena: RegistroDelPanel[]
  adelanto: number | null
}

export interface DatosDeLaSolapaHoras {
  personas: PersonaDeGrilla[]
  registros: (RegistroDeQuincena & { persona_id: string })[]
  presencias: (PresenciaDeQuincena & { persona_id: string })[]
  porPersona: Record<string, DatosDePersona>
  correcciones: Record<string, CorreccionDeDia[]>
  cerrada: boolean
  errores: { que: string; error: string }[]
}

const numeroONulo = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const fechaCorta = (iso: string | null): string | null =>
  iso == null ? null : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

interface FilaDirectorio {
  id: string; nombre_completo: string; en_la_empresa: boolean | null; categoria: string | null
  especialidad: string | null; puesto: string | null; fecha_ingreso: string | null
  fecha_egreso: string | null; cuadrilla: string | null; obra_actual: string | null
  rol_en_obra: string | null; asignada_desde: string | null; legajo: string | number | null
}

interface FilaPersona {
  id: string; dni: string | null; cuil: string | null; fecha_nacimiento: string | null
  nacionalidad: string | null; telefono: string | null; email: string | null
  domicilio: string | null; contacto_emergencia: string | null; convenio_colectivo: string | null
  modalidad_liquidacion: string | null; notas: string | null
}

interface FilaHH {
  id: string; persona_id: string; fecha: string; horas: number | string | null
  tipo_hora: string | null; notas: string | null; fuente_legacy: string | null
  created_at: string | null; creado_por: string | null
  obra_canonica: { nombre: string } | null
  obra_actividad: { nombre: string } | null
}

/**
 * LAS OCHO LECTURAS EN UNA TANDA. Ninguna depende de otra salvo los nombres de quien cargó, que
 * necesitan los ids de las filas de HH y por eso van en un segundo viaje.
 */
export async function getDatosDeLaSolapaHoras(
  supabase: SupabaseClient, q: Quincena,
): Promise<DatosDeLaSolapaHoras> {
  const desdeAncho = correrQuincena(q, -9).desde
  const [directorio, personas, tarifas, hh, presencias, legajos, adelantos, cabeceras, correcciones] =
    await Promise.all([
      supabase.from('persona_directorio').select(
        'id, nombre_completo, en_la_empresa, categoria, especialidad, puesto, fecha_ingreso, ' +
        'fecha_egreso, cuadrilla, obra_actual, rol_en_obra, asignada_desde, legajo'),
      // `retribucion_pactada` NO se pide: su GRANT está cerrado para `authenticated` desde
      // 20260819T4900 y pedirla haría fallar el select entero. El $/h que liquida es
      // `persona_tarifa`, que es el que este módulo usa en todas sus cuentas.
      supabase.from('personas').select(
        'id, dni, cuil, fecha_nacimiento, nacionalidad, telefono, email, domicilio, ' +
        'contacto_emergencia, convenio_colectivo, modalidad_liquidacion, notas'),
      supabase.from('persona_tarifa').select('persona_id, desde, valor_hora').lte('desde', q.hasta),
      supabase.from('registros_hh')
        .select('id, persona_id, fecha, horas, tipo_hora, notas, fuente_legacy, created_at, ' +
          'creado_por, obra_canonica(nombre), obra_actividad(nombre)')
        .gte('fecha', desdeAncho).lte('fecha', q.hasta).not('persona_id', 'is', null),
      supabase.from('asistencia_dia').select('persona_id, fecha, estado, motivo')
        .gte('fecha', q.desde).lte('fecha', q.hasta),
      supabase.from('persona_legajo').select('id, cuil'),
      supabase.from('nomina_adelanto').select('cuil, importe')
        .gte('fecha', q.desde).lte('fecha', q.hasta),
      supabase.from('liquidacion_quincena').select('estado').eq('desde', q.desde).eq('hasta', q.hasta),
      supabase.from('registro_hh_correccion')
        .select('registro_id, horas_antes, horas_despues, autor, corregido_en')
        .gte('corregido_en', desdeAncho),
    ])

  const errores: { que: string; error: string }[] = []
  const anotar = (que: string, e: { message: string } | null) => {
    if (e) errores.push({ que, error: e.message })
  }
  anotar('el plantel', directorio.error)
  anotar('el legajo', personas.error)
  anotar('las tarifas', tarifas.error)
  anotar('las horas', hh.error)
  anotar('la presencia declarada', presencias.error)
  anotar('los adelantos', adelantos.error)
  anotar('el estado de la quincena', cabeceras.error)
  anotar('las correcciones', correcciones.error)

  const filasHH = (hh.data ?? []) as unknown as FilaHH[]
  const nombres = await nombresDePerfil(supabase, [
    ...filasHH.map((f) => f.creado_por),
    ...((correcciones.data ?? []) as { autor: string | null }[]).map((c) => c.autor),
  ])

  const tarifaDe = vigentes((tarifas.data ?? []) as { persona_id: string; desde: string; valor_hora: unknown }[])
  const legajoDe = new Map(((personas.data ?? []) as unknown as FilaPersona[]).map((p) => [p.id, p]))
  const cuilDe = new Map(((legajos.data ?? []) as { id: string; cuil: string | null }[])
    .map((r) => [r.id, r.cuil]))
  const adelantoDe = new Map<string, number>()
  for (const a of (adelantos.data ?? []) as { cuil: string | null; importe: unknown }[]) {
    if (a.cuil) adelantoDe.set(a.cuil, (adelantoDe.get(a.cuil) ?? 0) + (numeroONulo(a.importe) ?? 0))
  }

  const directorioFilas = ((directorio.data ?? []) as unknown as FilaDirectorio[])
    .filter((p) => p.en_la_empresa !== false)
  const porPersona: Record<string, DatosDePersona> = {}
  for (const p of directorioFilas) {
    const suyas = filasHH.filter((f) => f.persona_id === p.id)
    const cuil = cuilDe.get(p.id) ?? legajoDe.get(p.id)?.cuil ?? null
    porPersona[p.id] = armarPersona(p, legajoDe.get(p.id), tarifaDe.get(p.id) ?? null, suyas, q, nombres,
      cuil ? (adelantoDe.get(cuil) ?? null) : null)
  }

  return {
    personas: directorioFilas.map((p) => ({
      id: p.id,
      nombre: p.nombre_completo,
      valorHora: tarifaDe.get(p.id) ?? null,
      convenio: legajoDe.get(p.id)?.convenio_colectivo ?? null,
    })),
    registros: filasHH
      .filter((f) => f.fecha >= q.desde && f.fecha <= q.hasta)
      .map((f) => ({
        persona_id: f.persona_id, fecha: f.fecha, horas: numeroONulo(f.horas) ?? 0,
        tipo_hora: f.tipo_hora ?? 'normal', notas: f.notas,
      })),
    presencias: (presencias.data ?? []) as (PresenciaDeQuincena & { persona_id: string })[],
    porPersona,
    correcciones: agruparCorrecciones(correcciones.data, nombres),
    // FALLA CERRADO: si no se pudo leer el estado, la quincena se trata como sellada. Editar un día
    // de una quincena que quizá está cerrada reescribe plata ya firmada.
    cerrada: cabeceras.error != null
      || ((cabeceras.data ?? []) as { estado: string }[]).some((c) => c.estado === 'cerrada'),
    errores,
  }
}

/** El $/h vigente de cada persona: la tarifa con el `desde` más alto que no pasa de la quincena. */
function vigentes(
  filas: readonly { persona_id: string; desde: string; valor_hora: unknown }[],
): Map<string, number | null> {
  const m = new Map<string, { desde: string; valor: number | null }>()
  for (const f of filas) {
    const previa = m.get(f.persona_id)
    if (!previa || f.desde > previa.desde) m.set(f.persona_id, { desde: f.desde, valor: numeroONulo(f.valor_hora) })
  }
  return new Map([...m].map(([id, v]) => [id, v.valor]))
}

function agruparCorrecciones(
  data: unknown, nombres: Map<string, string>,
): Record<string, CorreccionDeDia[]> {
  const filas = (data ?? []) as {
    registro_id: string; horas_antes: unknown; horas_despues: unknown
    autor: string | null; corregido_en: string
  }[]
  const out: Record<string, CorreccionDeDia[]> = {}
  for (const f of filas) {
    (out[f.registro_id] ??= []).push({
      horasAntes: numeroONulo(f.horas_antes),
      horasDespues: numeroONulo(f.horas_despues),
      autor: f.autor ? (nombres.get(f.autor) ?? null) : null,
      corregidoEn: f.corregido_en,
    })
  }
  return out
}

/** Los cuatro bloques del legajo real. «sin cargar» lo escribe la pantalla: acá `null` viaja como es. */
function armarPersona(
  p: FilaDirectorio, l: FilaPersona | undefined, valorHora: number | null,
  suyas: FilaHH[], q: Quincena, nombres: Map<string, string>, adelanto: number | null,
): DatosDePersona {
  const convenio = l?.convenio_colectivo ?? null
  return {
    nombre: p.nombre_completo,
    numeroLegajo: p.legajo == null ? null : String(p.legajo),
    valorHora,
    convenio,
    encabezado: [p.especialidad, convenio, p.fecha_ingreso ? `en la empresa desde ${fechaCorta(p.fecha_ingreso)}` : null]
      .filter(Boolean).join(' · '),
    legajo: [
      { rotulo: 'DNI', valor: l?.dni ?? null, mono: true },
      { rotulo: 'CUIL', valor: l?.cuil ?? null, mono: true },
      { rotulo: 'Nacimiento', valor: fechaCorta(l?.fecha_nacimiento ?? null), mono: true },
      { rotulo: 'Nacionalidad', valor: l?.nacionalidad ?? null },
      { rotulo: 'Teléfono', valor: l?.telefono ?? null },
      { rotulo: 'Email', valor: l?.email ?? null },
      { rotulo: 'Domicilio', valor: l?.domicilio ?? null },
      { rotulo: 'Emergencia', valor: l?.contacto_emergencia ?? null },
    ],
    laboral: [
      { rotulo: 'Legajo', valor: p.legajo == null ? null : String(p.legajo), mono: true },
      { rotulo: 'Ingreso', valor: fechaCorta(p.fecha_ingreso), mono: true },
      // NO EGRESÓ NO ES «SIN CARGAR»: es una afirmación sobre el legajo, y la pantalla la dice.
      { rotulo: 'Baja', valor: p.fecha_egreso ? fechaCorta(p.fecha_egreso) : 'no egresó', mono: true },
      { rotulo: 'Convenio', valor: convenio },
      { rotulo: 'Categoría', valor: p.categoria },
      { rotulo: 'Oficio', valor: p.especialidad },
      { rotulo: 'Puesto', valor: p.puesto },
      { rotulo: 'Modalidad', valor: l?.modalidad_liquidacion ?? null },
      { rotulo: 'Retribución', valor: valorHora == null ? null : `${valorHora.toLocaleString('es-AR')} $/h` },
      { rotulo: 'Notas', valor: l?.notas ?? null },
    ],
    asignacion: [
      { rotulo: 'Obra', valor: p.obra_actual },
      { rotulo: 'Actividad', valor: null },
      { rotulo: 'Cuadrilla', valor: p.cuadrilla },
      { rotulo: 'Rol', valor: p.rol_en_obra },
      { rotulo: 'Desde', valor: fechaCorta(p.asignada_desde), mono: true },
    ],
    filasHH: suyas.map((f) => ({ fecha: f.fecha, horas: numeroONulo(f.horas) })),
    registrosDeLaQuincena: suyas
      .filter((f) => f.fecha >= q.desde && f.fecha <= q.hasta)
      .map((f) => ({
        id: f.id,
        fecha: f.fecha,
        horas: numeroONulo(f.horas),
        tipo_hora: f.tipo_hora,
        obra: f.obra_canonica?.nombre ?? null,
        actividad: f.obra_actividad?.nombre ?? null,
        cargo: f.creado_por ? (nombres.get(f.creado_por) ?? null) : null,
        fuenteLegacy: f.fuente_legacy,
        creadoEn: f.created_at,
      })),
    adelanto,
  }
}

/** Los nombres de quien cargó y de quien corrigió. `actualizado_por` no tiene FK: va por ids. */
async function nombresDePerfil(
  supabase: SupabaseClient, ids: (string | null)[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))] as string[]
  const m = new Map<string, string>()
  if (unicos.length === 0) return m
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', unicos)
  for (const p of (data ?? []) as { id: string; nombre: string | null }[]) {
    if (p.nombre) m.set(p.id, p.nombre)
  }
  return m
}
