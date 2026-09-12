// LAS LECTURAS DE LA LIQUIDACIÓN. Ni una regla de negocio acá: trae filas y nada más.
//
// Qué significa cada peso lo deciden `liquidacionQuincena.ts` (la aritmética) y
// `liquidacionCuadros.ts` (quién entra en qué cuadro), que se prueban sin Supabase.
//
// ═══ QUIÉN VE ESTO NO SE DECIDE ACÁ ═══
//
// `persona_tarifa`, `liquidacion_quincena`, `liquidacion_linea`, `nomina_recibo_neto` y
// `nomina_adelanto` tienen RLS por `ve_economia()`: dirección y administración, jefe de obra no.
// Repetir el criterio en TypeScript sería una segunda definición del alcance que además no protege
// una llamada directa a PostgREST. La pantalla igual esconde la solapa — eso es la puerta; la
// policy es la cerradura.
//
// ═══ UNA FUENTE QUE FALLÓ SE DICE CON SU ERROR ═══
//
// Una tabla vacía porque la RLS rechazó la consulta es indistinguible de una quincena sin cargar, y
// la diferencia entre las dos es toda la plata del cuadro. Cada lectura devuelve su error y la
// pantalla lo muestra en vez de dibujar ceros.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  armarCuadros, type CuadroDeLiquidacion, type FilaAdelanto, type FilaRecibo, type FilaTarifa,
  type HorasPorPersona, type PersonaDeLiquidacion,
} from './liquidacionCuadros.ts'
import {
  horasDeQuincena, type ModalidadDeLiquidacion, type PresenciaDeQuincena, type RegistroDeQuincena,
} from './liquidacionQuincena.ts'
import { diasSinMotivoDeLaQuincena, filasDeGrilla } from './grillaHorasQuincena.ts'
import {
  filasDeHoras, horasDeLaQuincena, type HorasDeLaQuincena,
} from './horasDeLaQuincena.ts'
import { leerRegistrosHH } from './registrosHHService.ts'
import { laSesionEsDePrueba, leerCuilesDelLegajo, leerPresenciasDeLaQuincena } from './lecturasCompartidasDeQuincena.ts'
import { plantelDeLaQuincena } from './liquidacionPlantelActivo.ts'
import { esJefeDeObra } from './vocabularioPersona.ts'
import {
  aplicarOverrides, camposGuardables, sinOverrides,
  type CampoEditable, type LineaConOverrides, type OverridesDeLinea,
} from './liquidacionOverrides.ts'
import { getEspejoDeLaPlanilla, type EspejoDeLaPlanilla } from './espejoDeJornalesService.ts'
import type { Quincena } from './quincena.ts'

/** Un cuadro con sus líneas ya pisadas por lo que el dueño escribió a mano. */
export interface CuadroConOverrides extends Omit<CuadroDeLiquidacion, 'lineas'> {
  lineas: LineaConOverrides[]
}

export interface EstadoDeLaQuincena {
  id: string | null
  estado: 'abierta' | 'cerrada'
  cerradaEn: string | null
}

export interface LiquidacionDeLaQuincena {
  cuadros: CuadroConOverrides[]
  /**
   * QUÉ CELDAS SE PUEDEN EDITAR HOY. Sale de las columnas que la base REALMENTE tiene, no de una
   * lista escrita a mano: mientras `20260909T1740` no esté aplicada, las seis celdas sin columna
   * `*_manual` se dibujan de sólo lectura en vez de guardar en una columna que no puede decir
   * «vacío». El día que se aplique, se encienden solas y sin tocar código.
   */
  camposEditables: CampoEditable[]
  estados: Record<string, EstadoDeLaQuincena>
  /**
   * CUÁNTAS AUSENCIAS DECLARADAS SIN MOTIVO tiene la quincena. Viaja para que la pantalla de
   * Cierre pueda trabar el sello con la MISMA traba que la grilla de Horas publica: hasta el
   * 11/09/2026 «Horas» dejaba el botón gris con «9 ausencias sin motivo» y «Cierre» lo dibujaba
   * activo sobre la misma quincena. Se calcula con los registros y las presencias que esta
   * función ya leyó — ni una consulta más — y con la definición de `celdaDelDia`, que es la única.
   */
  diasSinMotivo: number
  /**
   * EL ESPEJO DEL BLOQUE DE JORNALES. Viaja entero porque la pantalla lo necesita para el sello y
   * los chips, y porque las cifras que ya entraron a la cadena tienen que poder explicarse.
   */
  espejo: EspejoDeLaPlanilla
  /**
   * LOS TRES TOTALES DE HORAS, DE UNA SOLA CUENTA (QA visual, 11/09/2026).
   *
   * El módulo publicaba 1.289 en «Horas», 1.129 en «Pagos» y «Cierre» y 1.227 en «Costo a la obra»,
   * bajo el mismo rótulo y en tres solapas seguidas. Los tres eran correctos y la única lectura
   * posible era «uno está mal». Se calcula ACÁ porque esta función ya leyó los registros, las
   * presencias y las tarifas: una segunda lectura en cada solapa sería un CUARTO número.
   */
  horas: HorasDeLaQuincena
  /** Cada fuente que no se pudo leer, con su mensaje. Vacío = se leyó todo. */
  errores: { que: string; error: string }[]
  /**
   * Quienes NO aparecen en los cuadros por no tener actividad en esta quincena.
   *
   * Se devuelven porque la pantalla tiene que poder decir «N sin actividad»: una lista que se acorta
   * en silencio es indistinguible de una que se rompió. Nadie se dio de baja — el padrón no se toca.
   */
  sinActividad: { id: string; nombre: string }[]
}

const numero = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Postgres 42P01 = la tabla no existe todavía. Se trata como «vacío», igual que `asistencia_dia`:
 * la migración la aplica una persona y hasta entonces la pantalla no puede quedar rota entera.
 */
const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

/**
 * LAS OCHO LECTURAS EN UNA SOLA TANDA. Ninguna depende de otra: en serie serían ocho viajes por
 * carga de pantalla.
 */
export async function getLiquidacionDeLaQuincena(
  supabase: SupabaseClient, q: Quincena,
): Promise<LiquidacionDeLaQuincena> {
  const [directorio, legajo, tarifas, registros, presencias, recibos, adelantos, guardadas, anterior, espejo, sesionDePrueba] =
    await Promise.all([
      // `puesto` VIAJA CON EL PLANTEL para que las pantallas de Liquidación ordenen y rotulen como
      // el resto de Personal (dueño, 10/09/2026). Es la misma columna y la misma función
      // (`esJefeDeObra`) que ya usan Plantel, Asistencia y la grilla de Horas: si cada pantalla
      // decidiera por su cuenta quién es jefe, habría tantas respuestas como pantallas.
      supabase.from('persona_directorio').select('id, nombre_completo, en_la_empresa, puesto'),
      // El CUIL es la llave del recibo y del giro. Vive en `persona_legajo`, que lleva su portero
      // adentro: es el único camino de la web a ese campo (ver `personasService.ts`).
      // POR LA PUERTA COMPARTIDA (`lecturasCompartidasDeQuincena.ts`): la solapa Horas pide estas
      // dos columnas en el MISMO `Promise.all`, y eran dos viajes idénticos por render.
      leerCuilesDelLegajo(supabase),
      supabase.from('persona_tarifa')
        .select('persona_id, desde, valor_hora, neto_mensual, origen').lte('desde', q.hasta),
      // ═══ EL CAMINO DEL DINERO TAMBIÉN SE PAGINA ═══ (11/09/2026, auditoría de cierre)
      //
      // Esta consulta estaba escrita a mano y SIN `.range()`: PostgREST corta en `db-max-rows`
      // (1.000 en esta base) y devuelve 200 con `error: null`. Es el defecto exacto que
      // `registrosHHService.ts` existe para impedir, y estaba en la función que calcula lo que se le
      // paga a cada uno. Hoy no muerde —17 personas × 13 días son ~220 filas— pero con el plantel
      // completo y los partes partidos por obra se cruza el tope, y la grilla y el importe dirían
      // cosas distintas sin un solo error a la vista.
      //
      // La cabecera de `registrosHHService.ts` ya afirmaba que Asistencia y Liquidación leen «la
      // misma ventana y el mismo filtro POR ESTA FUNCIÓN». Era verdad para las horas de la grilla y
      // falsa para la plata. Ahora es verdad para las dos.
      leerRegistrosHH(supabase, {
        desde: q.desde, hasta: q.hasta,
        columnas: 'persona_id, fecha, horas, tipo_hora, notas',
      }),
      leerPresenciasDeLaQuincena(supabase, q.desde, q.hasta),
      supabase.from('nomina_recibo_neto').select('cuil, periodo, neto, fecha_pago'),
      supabase.from('nomina_adelanto').select('cuil, fecha, importe, concepto')
        .gte('fecha', q.desde).lte('fecha', q.hasta),
      leerCabecerasGuardadas(supabase, q),
      // LA ÚLTIMA QUINCENA CERRADA ANTES DE ÉSTA: es la evidencia principal de que alguien está
      // activo («le liquidamos la quincena pasada») y de dónde sale el $/h heredado.
      supabase.from('liquidacion_quincena')
        .select('desde, hasta, liquidacion_linea(persona_id)')
        .eq('estado', 'cerrada').lt('hasta', q.desde)
        .order('hasta', { ascending: false }).limit(1),
      // ═══ LA PLATA QUE EL DUEÑO ESCRIBE EN LA PLANILLA (11/09/2026) ═══
      //
      // Textual: *«todo lo referente a adelantos de plata no está»*. Se lee ACÁ y no en cada solapa
      // porque ésta es la única función que arma la cadena de pago: las siete pantallas del módulo
      // la consumen, y una segunda lectura sería una segunda respuesta a «cuánto le adelantaron».
      // Tolera que la tabla no exista todavía: devuelve `hay: false` y la cadena queda como estaba.
      getEspejoDeLaPlanilla(supabase, q),
      // ═══ UNA CUENTA DE PRUEBA VE A LAS PERSONAS DE PRUEBA (12/09/2026) ═══
      //
      // Viaja en la MISMA tanda: es una pregunta de sesión, no depende de ninguna otra lectura, y en
      // serie sería un viaje más por carga de pantalla. Sin la migración aplicada devuelve `false` y
      // la pantalla queda como estaba.
      laSesionEsDePrueba(supabase),
    ])

  const errores: { que: string; error: string }[] = []
  const anotar = (que: string, e: { code?: string; message: string } | null) => {
    if (e && !sinTabla(e)) errores.push({ que, error: e.message })
  }
  anotar('el plantel', directorio.error)
  anotar('los CUIL del legajo', legajo.error)
  anotar('las tarifas', tarifas.error)
  // `leerRegistrosHH` devuelve el error ya en texto: no trae `code` porque un tope alcanzado no es
  // un error de PostgREST, es una lectura que no puede afirmar que tiene todo.
  anotar('las horas de la quincena', registros.error ? { message: registros.error } : null)
  anotar('la presencia declarada', presencias.error)
  anotar('los recibos del estudio', recibos.error)
  anotar('los giros del extracto', adelantos.error)
  anotar('la liquidación guardada', guardadas.error)
  anotar('la quincena anterior', anterior.error)
  anotar('el espejo de JORNALES', espejo.error ? { message: espejo.error } : null)

  const cuilPorPersona = new Map(
    ((legajo.data ?? []) as { id: string; cuil: string | null }[]).map((r) => [r.id, r.cuil]),
  )
  const personas: PersonaDeLiquidacion[] =
    ((directorio.data ?? []) as
      { id: string; nombre_completo: string; en_la_empresa: boolean; puesto: string | null }[])
      .map((r) => ({
        id: r.id,
        nombre: r.nombre_completo,
        cuil: cuilPorPersona.get(r.id) ?? null,
        enLaEmpresa: r.en_la_empresa !== false,
        esJefe: esJefeDeObra(r.puesto),
      }))

  const { estados, redondeos, overrides } = leerGuardadas(guardadas.data)
  const camposEditables = camposGuardables(guardadas.columnas)

  // ═══ SÓLO QUIENES ESTÁN ACTIVOS ESTA QUINCENA ═══
  //
  // Dueño, 09/09/2026: «solo dejame en plantel quienes estén activos esta quincena y sacá a los que
  // no, cuidado con eso». El cuidado está acá: se FILTRA UNA LECTURA. Ni una escritura sobre
  // `personas`, ni `en_la_empresa`, ni bajas. Quien no aparece se devuelve en `sinActividad`.
  // QUIÉN PREGUNTA DECIDE SI LAS IDENTIDADES DE PRUEBA ENTRAN. Se lee de la base —la misma función
  // que filtra `persona_directorio`— y no se deduce del rol: una cuenta de prueba tiene rol de
  // Dirección igual que el dueño.
  const { activas, sinActividad } = plantelDeLaQuincena(personas, {
    conLineaEnLaAnterior: idsDeLaAnterior(anterior.data),
    conHoras: new Set(((registros.data ?? []) as { persona_id: string }[]).map((r) => r.persona_id)),
    conAsistencia: new Set(((presencias.data ?? []) as { persona_id: string }[]).map((r) => r.persona_id)),
    conTarifaNueva: new Set(
      ((tarifas.data ?? []) as { persona_id: string; desde: string }[])
        .filter((t) => t.desde >= q.desde).map((t) => t.persona_id),
    ),
  }, sesionDePrueba)

  const cuadros = armarCuadros({
      quincena: q,
      personas: activas,
      tarifas: (tarifas.data ?? []) as FilaTarifa[],
      horas: horasPorPersona(q, registros.data, presencias.data),
      recibos: ((recibos.data ?? []) as FilaRecibo[]).map((r) => ({ ...r, neto: numero(r.neto) })),
      adelantos: ((adelantos.data ?? []) as FilaAdelanto[])
        .map((a) => ({ ...a, importe: numero(a.importe) })),
      redondeos,
  })

  // LA GRILLA SE ARMA UNA VEZ Y SÓLO PARA SUMAR. `filasDeGrilla` es la definición de cuánto vale cada
  // día —la misma que pinta la celda—, y la modalidad la decide el CUADRO en el que cayó cada
  // persona, no el campo del legajo (que está vacío en las diecisiete de la base real).
  const modalidadPorPersona = new Map<string, ModalidadDeLiquidacion>()
  for (const c of cuadros) for (const l of c.lineas) modalidadPorPersona.set(l.personaId, l.modalidad)
  const horas = horasDeLaQuincena(filasDeHoras(
    filasDeGrilla({
      quincena: q,
      personas: activas.map((p) => ({
        id: p.id, nombre: p.nombre, valorHora: null, convenio: null, esJefe: p.esJefe,
      })),
      registros: (registros.data ?? []) as (RegistroDeQuincena & { persona_id: string })[],
      presencias: (presencias.data ?? []) as (PresenciaDeQuincena & { persona_id: string })[],
      personaDeRegistro: (r) => (r as unknown as { persona_id: string }).persona_id,
      personaDePresencia: (p) => (p as unknown as { persona_id: string }).persona_id,
      // `hoy` sólo decide qué días cuentan como «sin cargar», que este total no usa.
      hoy: q.hasta,
    }),
    (id) => modalidadPorPersona.get(id) ?? 'hora',
  ))

  return {
    sinActividad: sinActividad.map((p) => ({ id: p.id, nombre: p.nombre })),
    horas,
    // LA QUINCENA CERRADA NO SE PISA. Sus cifras son la foto del cierre y no admiten override: si
    // se aplicaran acá, una celda escrita después del cierre cambiaría el registro de lo que ya se
    // pagó, que es exactamente lo que cerrar existe para impedir.
    cuadros: cuadros.map((c) => ({
      ...c,
      lineas: estados[c.grupo]?.estado === 'cerrada'
        ? c.lineas.map(sinOverrides)
        // LA PRECEDENCIA VIVE EN `aplicarOverrides` Y NO ACÁ: manual > JORNALES > calculado, una sola
        // vez y con sus diez tests. Acá sólo se le entrega la fuente.
        : c.lineas.map((l) => aplicarOverrides(
          l, overrides.get(l.personaId) ?? {}, c.grupo, espejo.cadenaPorPersona.get(l.personaId) ?? null,
        )),
    })),
    camposEditables,
    espejo,
    estados,
    diasSinMotivo: diasSinMotivoDeLaQuincena(
      q,
      (registros.data ?? []) as (RegistroDeQuincena & { persona_id: string })[],
      (presencias.data ?? []) as (PresenciaDeQuincena & { persona_id: string })[],
    ),
    errores,
  }
}

/** Las columnas de override, si la migración `20260909T1740` ya se aplicó. */
const COLUMNAS_MANUALES = [
  'cobra_manual', 'adelanto_manual', 'ya_transferido_manual',
  'por_banco_manual', 'en_efectivo_manual', 'total_manual',
] as const

const COLUMNAS_LINEA = ['persona_id', 'efectivo_redondeado', 'horas'] as const

/**
 * LAS CABECERAS Y SUS LÍNEAS — preguntando por las columnas de override y aceptando que no estén.
 *
 * SE PRUEBA CONTRA LA BASE, NO CONTRA `migrations/`. Un archivo `.sql` commiteado no es una columna
 * aplicada: el repo ya perdió medio día por dar una migración por vigente. Si la base contesta
 * 42703 («column does not exist») se relee sin ellas y la pantalla se degrada a sólo lectura en esas
 * seis celdas, en vez de romperse entera.
 */
async function leerCabecerasGuardadas(
  supabase: SupabaseClient, q: Quincena,
): Promise<{ data: unknown; error: { code?: string; message: string } | null; columnas: string[] }> {
  const pedir = (columnas: readonly string[]) => supabase.from('liquidacion_quincena')
    .select(`id, grupo, estado, cerrada_en, liquidacion_linea(${columnas.join(', ')})`)
    .eq('desde', q.desde).eq('hasta', q.hasta)

  const conManuales = [...COLUMNAS_LINEA, ...COLUMNAS_MANUALES]
  const primera = await pedir(conManuales)
  if (!primera.error) return { data: primera.data, error: null, columnas: [...conManuales] }
  if (primera.error.code !== '42703' && !/column .* does not exist/i.test(primera.error.message)) {
    return { data: null, error: primera.error, columnas: [] }
  }
  const segunda = await pedir(COLUMNAS_LINEA)
  return {
    data: segunda.data,
    error: segunda.error,
    columnas: segunda.error ? [] : [...COLUMNAS_LINEA],
  }
}

/** Los `persona_id` que tuvieron línea en la última quincena cerrada. Vacío si no hay ninguna. */
function idsDeLaAnterior(data: unknown): Set<string> {
  const filas = (data ?? []) as { liquidacion_linea: { persona_id: string }[] | null }[]
  return new Set(filas.flatMap((f) => (f.liquidacion_linea ?? []).map((l) => l.persona_id)))
}

/** Las horas liquidables de cada persona. Una pasada por persona, con la misma regla que la grilla. */
function horasPorPersona(
  q: Quincena, registros: unknown, presencias: unknown,
): Map<string, HorasPorPersona> {
  const filas = (registros ?? []) as (RegistroDeQuincena & { persona_id: string })[]
  const decl = (presencias ?? []) as (PresenciaDeQuincena & { persona_id: string })[]
  const porPersona = new Map<string, HorasPorPersona>()
  const ids = new Set([...filas.map((f) => f.persona_id), ...decl.map((d) => d.persona_id)])
  for (const id of ids) {
    const h = horasDeQuincena(
      q,
      filas.filter((f) => f.persona_id === id),
      decl.filter((d) => d.persona_id === id),
    )
    porPersona.set(id, { horas: h.horas, presentesSinHoras: h.presentesSinHoras })
  }
  return porPersona
}

type LineaGuardada = {
  persona_id: string
  efectivo_redondeado: number | string | null
  horas?: number | string | null
  cobra_manual?: number | string | null
  adelanto_manual?: number | string | null
  ya_transferido_manual?: number | string | null
  por_banco_manual?: number | string | null
  en_efectivo_manual?: number | string | null
  total_manual?: number | string | null
}

interface CabeceraGuardada {
  id: string
  grupo: string
  estado: string
  cerrada_en: string | null
  liquidacion_linea: LineaGuardada[] | null
}

/** `null`/ausente = no hay override. Un 0 guardado SÍ es un override y tiene que sobrevivir acá. */
const overrideDe = (v: number | string | null | undefined): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const overridesDeLinea = (l: LineaGuardada): OverridesDeLinea => ({
  horas: overrideDe(l.horas),
  cobra: overrideDe(l.cobra_manual),
  adelanto: overrideDe(l.adelanto_manual),
  yaTransferido: overrideDe(l.ya_transferido_manual),
  porBanco: overrideDe(l.por_banco_manual),
  enEfectivo: overrideDe(l.en_efectivo_manual),
  total: overrideDe(l.total_manual),
})

/** El estado de cada cuadro y el redondeo ya escrito. Sin cabecera guardada, la quincena está abierta. */
function leerGuardadas(data: unknown): {
  estados: Record<string, EstadoDeLaQuincena>
  redondeos: Map<string, number | null>
  overrides: Map<string, OverridesDeLinea>
} {
  const filas = (data ?? []) as CabeceraGuardada[]
  const estados: Record<string, EstadoDeLaQuincena> = {}
  const redondeos = new Map<string, number | null>()
  const overrides = new Map<string, OverridesDeLinea>()
  for (const f of filas) {
    estados[f.grupo] = {
      id: f.id,
      estado: f.estado === 'cerrada' ? 'cerrada' : 'abierta',
      cerradaEn: f.cerrada_en,
    }
    for (const l of f.liquidacion_linea ?? []) {
      // NULL SE GUARDA COMO NULL. Un cero acá diría «no le doy nada en mano», que es una afirmación
      // que el dueño no hizo.
      redondeos.set(l.persona_id, l.efectivo_redondeado == null ? null : numero(l.efectivo_redondeado))
      overrides.set(l.persona_id, overridesDeLinea(l))
    }
  }
  return { estados, redondeos, overrides }
}
