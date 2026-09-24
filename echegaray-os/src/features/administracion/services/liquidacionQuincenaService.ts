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

import { mismoCuil } from './cuil.ts'
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
import {
  laSesionEsDePrueba, leerCuilesDelLegajo, leerPresenciasDeLaQuincena, leerSubcontratoDePersonas, subcontratoPorPersona,
} from './lecturasCompartidasDeQuincena.ts'
import { plantelDeLaQuincena } from './liquidacionPlantelActivo.ts'
import { esJefeDeObra, sinDireccion } from './vocabularioPersona.ts'
import type { EntradaDePresentismo } from './presentismo.ts'
import { leerGuardadas, ausenciasPorPersona, tardanzasPorPersona, type EstadoDeLaQuincena } from './liquidacionGuardadas.ts'
import { cuadroSellado, type PersonaSellable } from './liquidacionSellada.ts'
import {
  aplicarOverrides, camposGuardables, sinOverrides,
  type CampoEditable, type LineaConOverrides, type SelloDeLaQuincena,
} from './liquidacionOverrides.ts'
import { getEspejoDeLaPlanilla, type EspejoDeLaPlanilla } from './espejoDeJornalesService.ts'
import { getExposicionDeLaQuincena, type ExposicionDeLaQuincena } from './exposicionConvenioService.ts'
import { periodoDeRecibo } from './liquidacionCuadros.ts'
import { estadoDelCuadro } from './estadoDelCuadro.ts'
import { entradaDeBlanco } from './sueldoBlancoNegro.ts'
import { baseDelEstimado, leerFeriadosDeLaQuincena } from './reciboEstimadoService.ts'
import { REGLAS_GENERADAS } from './reglasDelRecibo.generadas.ts'
import type { Quincena } from './quincena.ts'
import { nombreDePersona } from '../../../shared/personas/nombre.ts'

/** Un cuadro con sus líneas ya pisadas por lo que el dueño escribió a mano. */
export interface CuadroConOverrides extends Omit<CuadroDeLiquidacion, 'lineas'> {
  lineas: LineaConOverrides[]
}

export type { EstadoDeLaQuincena } from './liquidacionGuardadas.ts'

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
  /**
   * LA EXPOSICIÓN AL CONVENIO, LEÍDA UNA VEZ. De acá sale el $/h de categoría del blanco estimado
   * (`exponerAlPiso` → `pisoVigente`, la misma de la solapa Convenios) y la Quincena la reusa para la
   * marca del básico y el historial: una segunda lectura serían dos fotos de la escala.
   * Sus errores van en `errores`.
   */
  exposicion: ExposicionDeLaQuincena
  /** Los `persona_id` del plantel de ESTA quincena (`plantelDeLaQuincena`). Caja, Cierre y Costo leen éste. */
  plantel: string[]
  /**
   * `liquidacion_linea.presentismo` y `presentismo_perdido` EXISTEN en la base (20260915T2220). El sello
   * los escribe sólo si están: sin la migración, la foto sale sin presentismo y no rompe el cierre.
   */
  hayColumnasPresentismo: boolean
  /**
   * `liquidacion_linea.formulas` EXISTE (20260915T2340). Sin ella una celda escrita con `=` guarda el NÚMERO que
   * dio y pierde la cuenta: la pantalla lo dice en vez de fingir que la guardó.
   */
  hayColumnaDeFormulas: boolean
  /** `false` mientras `recibo_sueldo_linea` no exista: el neto sale de `nomina_recibo_neto`. */
  hayRecibosDeSueldo: boolean
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
  const [directorio, legajo, tarifas, registros, presencias, recibos, adelantos, guardadas, espejo, sesionDePrueba,
    exposicion, feriados, subcontratos] =
    await Promise.all([
      // `puesto` VIAJA CON EL PLANTEL para que las pantallas de Liquidación ordenen y rotulen como
      // el resto de Personal (dueño, 10/09/2026). Es la misma columna y la misma función
      // (`esJefeDeObra`) que ya usan Plantel, Asistencia y la grilla de Horas: si cada pantalla
      // decidiera por su cuenta quién es jefe, habría tantas respuestas como pantallas.
      // `fecha_ingreso` Y `fecha_egreso` VIAJAN: el plantel de la quincena es el que TUVO, no el de hoy
      // (`plantelDeLaQuincena`). `persona_directorio` publica las bajas; `persona_plantel` no.
      supabase.from('persona_directorio').select('id, nombre_completo, en_la_empresa, puesto, fecha_ingreso, fecha_egreso'),
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
        // `fuente_legacy` Y `actualizado_por` VIAJAN desde el 14/09/2026: sin ellos la jornada
        // automática que nadie confirmó se pagaba como cargada (Rosales: 70 h en vez de 62).
        columnas: 'persona_id, fecha, horas, tipo_hora, notas, fuente_legacy, actualizado_por',
      }),
      leerPresenciasDeLaQuincena(supabase, q.desde, q.hasta),
      supabase.from('nomina_recibo_neto').select('cuil, periodo, neto, fecha_pago'),
      supabase.from('nomina_adelanto').select('cuil, fecha, importe, concepto')
        .gte('fecha', q.desde).lte('fecha', q.hasta),
      leerCabecerasGuardadas(supabase, q),
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
      // ═══ BLANCO + NEGRO (dueño, 14/09/2026) ═══ La exposición trae el piso de la categoría y las
      // líneas de recibo de sueldo (horas, $/h de categoría, bruto y neto): una sola lectura de cada una.
      getExposicionDeLaQuincena(supabase, q),
      // ═══ EL RECIBO ESTIMADO CONCEPTO POR CONCEPTO (dueño, 14/09/2026) ═══ Los feriados de la quincena; las reglas
      // son las congeladas (`reglasDelRecibo.generadas.ts`) y los recibos, los que ya trae la exposición.
      leerFeriadosDeLaQuincena(supabase, q.desde, q.hasta),
      // LA CUADRILLA DE UN SUBCONTRATISTA NO ES PLANTEL PROPIO (dueño, 15/09/2026). Lectura aparte: ver la puerta.
      leerSubcontratoDePersonas(supabase),
    ])

  const errores: { que: string; error: string }[] = []
  const anotar = (que: string, e: { code?: string; message: string } | null) => {
    if (e && !sinTabla(e)) errores.push({ que, error: e.message })
  }
  anotar('el plantel', directorio.error)
  anotar('las cuadrillas de subcontrato', subcontratos.error)
  anotar('los CUIL del legajo', legajo.error)
  anotar('las tarifas', tarifas.error)
  // `leerRegistrosHH` devuelve el error ya en texto: no trae `code` porque un tope alcanzado no es
  // un error de PostgREST, es una lectura que no puede afirmar que tiene todo.
  anotar('las horas de la quincena', registros.error ? { message: registros.error } : null)
  anotar('la presencia declarada', presencias.error)
  anotar('los recibos del estudio', recibos.error)
  anotar('los giros del extracto', adelantos.error)
  anotar('la liquidación guardada', guardadas.error)
  anotar('el espejo de JORNALES', espejo.error ? { message: espejo.error } : null)
  // LOS ERRORES DE LA EXPOSICIÓN INCLUYEN LOS DE LOS RECIBOS: sin la tabla es «sin recibo»; cualquier
  // otro error se dice, porque fingir que no hay recibo estimaría el blanco de alguien que sí lo tiene.
  errores.push(...exposicion.errores)

  const cuilPorPersona = new Map(
    ((legajo.data ?? []) as { id: string; cuil: string | null }[]).map((r) => [r.id, r.cuil]),
  )
  const deSubcontrato = subcontratoPorPersona(subcontratos)
  // DIRECCIÓN NO SE LIQUIDA: no es plantel operativo de ninguna quincena. Se va en la lectura, con
  // la única regla del OS (`vocabularioPersona.sinDireccion`).
  const personas: PersonaDeLiquidacion[] =
    sinDireccion((directorio.data ?? []) as
      { id: string; nombre_completo: string; en_la_empresa: boolean; puesto: string | null; fecha_ingreso: string | null; fecha_egreso: string | null }[])
      .map((r) => ({
        id: r.id,
        nombre: nombreDePersona(r.nombre_completo),
        cuil: cuilPorPersona.get(r.id) ?? null,
        enLaEmpresa: r.en_la_empresa !== false,
        fechaIngreso: r.fecha_ingreso ? String(r.fecha_ingreso).slice(0, 10) : null,
        fechaEgreso: r.fecha_egreso ? String(r.fecha_egreso).slice(0, 10) : null,
        esJefe: esJefeDeObra(r.puesto),
        subcontratoId: deSubcontrato.get(r.id) ?? null,
      }))

  const { estados, redondeos, overrides, formulas, importesCargados, presentismosSellados, pagadas, lineasSelladas } =
    leerGuardadas(guardadas.data)
  const camposEditables = camposGuardables(guardadas.columnas)
  const hayColumnasPresentismo = COLUMNAS_PRESENTISMO.every((c) => guardadas.columnas.includes(c))
  const hayColumnaDeFormulas = guardadas.columnas.includes('formulas')

  // ═══ SÓLO QUIENES ESTÁN ACTIVOS ESTA QUINCENA ═══
  //
  // Dueño, 09/09/2026: «solo dejame en plantel quienes estén activos esta quincena y sacá a los que
  // no, cuidado con eso». El cuidado está acá: se FILTRA UNA LECTURA. Ni una escritura sobre
  // `personas`, ni `en_la_empresa`, ni bajas. Quien no aparece se devuelve en `sinActividad`.
  // QUIÉN PREGUNTA DECIDE SI LAS IDENTIDADES DE PRUEBA ENTRAN. Se lee de la base —la misma función
  // que filtra `persona_directorio`— y no se deduce del rol: una cuenta de prueba tiene rol de
  // Dirección igual que el dueño.
  // ═══ EL PLANTEL QUE LA QUINCENA TUVO (dueño, 14/09/2026) ═══ La regla es `plantelDeLaQuincena`: actividad
  // en la quincena, o fechas de ingreso/egreso que la cubren. Se evalúa con lo que esta función YA leyó.
  const periodoDelPlantel = periodoDeRecibo(q)
  const { activas, sinActividad, conActividad } = plantelDeLaQuincena(personas, q, {
    conHoras: new Set(((registros.data ?? []) as { persona_id: string }[]).map((r) => r.persona_id)),
    conLinea: new Set(overrides.keys()),
    conRecibo: new Set(exposicion.recibos.filter((r) => r.periodo === periodoDelPlantel)
      .map((r) => r.personaId ?? personas.find((p) => mismoCuil(p.cuil, r.cuil))?.id)
      .filter((x): x is string => !!x)),
    conJornales: new Set(espejo.cadenaPorPersona.keys()),
  }, sesionDePrueba)

  const vivos = armarCuadros({
      quincena: q,
      personas: activas.map((p) => ({ ...p, conActividad: conActividad.has(p.id) })),
      tarifas: (tarifas.data ?? []) as FilaTarifa[],
      horas: horasPorPersona(q, registros.data, presencias.data),
      recibos: ((recibos.data ?? []) as FilaRecibo[]).map((r) => ({ ...r, neto: numero(r.neto) })),
      adelantos: ((adelantos.data ?? []) as FilaAdelanto[])
        .map((a) => ({ ...a, importe: numero(a.importe) })),
      redondeos,
      importesCargados,
  })

  // ═══ LA QUINCENA CERRADA MUESTRA LO SELLADO, NO UN RECÁLCULO (dueño; auditor, 18/09/2026) ═══
  //
  // `armarCuadros` corre sobre `registros_hh` y `persona_tarifa` de HOY. Para un cuadro cerrado eso es la cifra
  // equivocada: Bazán, 16–31/03, sellado 9 h × $4.300 = $38.700 y la pantalla decía $36.000 a $4.000/h; la 1ª de junio
  // sumaba $7.970.750 sobre $9.393.250 sellados. La regla vive en `liquidacionSellada.ts`: cada cuadro cerrado se
  // reemplaza por la foto de su cabecera, línea por línea; lo vivo aporta sólo identidad y el recibo del período.
  // Un cuadro sin cabecera propia pero con la quincena cerrada (`estadoDelCuadro`) no tiene foto: sus filas quedan
  // «sin línea sellada», nunca calculadas.
  const directorioSellable = new Map<string, PersonaSellable>(personas.map((p) => [p.id, { id: p.id, nombre: p.nombre, esJefe: p.esJefe === true }]))
  const selladosEnLaQuincena = new Set<string>()
  for (const c of vivos) {
    if (estadoDelCuadro(estados, c.grupo).estado !== 'cerrada') continue
    for (const l of lineasSelladas.get(c.grupo) ?? []) selladosEnLaQuincena.add(l.personaId)
  }
  const sinLineaSellada = new Set<string>()
  const cuadros = vivos.map((c) => {
    if (estadoDelCuadro(estados, c.grupo).estado !== 'cerrada') return c
    const foto = cuadroSellado({
      grupo: c.grupo, selladas: lineasSelladas.get(c.grupo) ?? [], vivas: c.lineas,
      personas: directorioSellable, selladosEnLaQuincena, redondeos,
    })
    for (const id of foto.sinLinea) sinLineaSellada.add(id)
    // LOS PRESENTES SIN HORAS SON DE LO VIVO: en la foto no hay días. Se dejan en 0 para no publicar un pendiente
    // sobre una quincena pagada.
    return { ...c, lineas: foto.lineas, presentesSinHoras: 0 }
  })
  // EL PLANTEL INCLUYE A QUIEN TIENE LÍNEA SELLADA: `filasDelEspejo` sólo dibuja a quien está en él.
  const plantelIds = new Set(activas.map((p) => p.id))
  for (const id of selladosEnLaQuincena) plantelIds.add(id)

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

  const periodo = periodoDeRecibo(q)
  const pisoDe = new Map(exposicion.lineas.map((l) => [l.personaId, l.piso?.valorHora ?? null]))
  // ═══ PRESENTISMO (dueño, 15/09/2026) ═══ El básico es EL MISMO piso por categoría que usa el blanco
  // estimado (`exponerAlPiso` → `pisoVigente`, `convenio_escala` con la escala del CCT 76/75): una
  // segunda lectura sería un segundo básico. Las marcas salen de las presencias que esta función ya leyó.
  const categoriaDe = new Map(exposicion.lineas.map((l) => [l.personaId, l.categoria]))
  // ═══ EL $/H DE UNA QUINCENA CERRADA (dueño, 17/09/2026: «no salen los valores $/h de cada uno en las quincenas
  // anteriores») ═══
  //
  // `l` acá es la línea de la FOTO (`cuadroSellado`): `l.valorHora` es `liquidacion_linea.valor_hora`, no
  // `persona_tarifa`. Hasta el 18/09/2026 se tomaba de la tarifa vigente a `q.hasta` y Bazán (una sola tarifa cargada,
  // $4.000 desde enero; marzo cerrado a $4.300) decía «se liquidó a $4.000/h». `exponerAlPiso` corre con `q.hasta`, así
  // que `pisoDe` es el piso de la escala que REGÍA ESA QUINCENA: es el convenio de esa fecha, no un dato de la persona.
  const pisoDesdeDe = new Map(exposicion.lineas.map((l) => [l.personaId, l.piso?.desde ?? null]))
  const selloDe = (l: { personaId: string; valorHora: number | null }): SelloDeLaQuincena => ({
    valorHora: l.valorHora,
    conLinea: !sinLineaSellada.has(l.personaId),
    piso: pisoDe.get(l.personaId) ?? null,
    pisoDesde: pisoDesdeDe.get(l.personaId) ?? null,
    hasta: q.hasta,
  })
  const tardanzas = tardanzasPorPersona(presencias.data)
  // LAS FALTAS SALEN DE LAS MISMAS PRESENCIAS (dueño, 16/09/2026). Una falta injustificada pierde el
  // presentismo igual que una tardanza; una licencia reconocida no. Lo decide `presentismo.ts`.
  const ausencias = ausenciasPorPersona(presencias.data)
  const presentismoDe = (grupo: string, l: { personaId: string; esJefe: boolean; modalidad: ModalidadDeLiquidacion }): EntradaDePresentismo | null =>
    grupo !== 'obreros' ? null : {
      categoria: categoriaDe.get(l.personaId) ?? null,
      basico: pisoDe.get(l.personaId) ?? null,
      tardanzas: tardanzas.get(l.personaId) ?? [],
      ausencias: ausencias.get(l.personaId) ?? [],
      quincenaDesde: q.desde,
      modalidad: l.modalidad,
      esJefe: l.esJefe,
      cerrada: false,
    }
  // EL RECIBO ESTIMADO: reglas congeladas (primera entrega sin migración), los recibos que ya leyó la exposición y
  // los feriados. Un error del calendario se dice: estimar sin feriados en silencio movería el 0401 y el 0431.
  anotar('el calendario de feriados', feriados.error ? { message: feriados.error } : null)
  // `q.desde` decide el par 0425/0426: desde la quincena que liquida con el presentismo del OS, el estimado ya no lo
  // trae (el concepto lo dice el bloque «Presentismo», una sola vez).
  const baseEstimado = baseDelEstimado(periodo, REGLAS_GENERADAS, exposicion.recibos, feriados.feriados, new Map(), q.desde)
  /** La entrada del blanco de un obrero. Oficina y finales no cobran por hora: fuera del modelo. */
  const blancoDe = (grupo: string, l: { personaId: string; reciboNeto: number | null }) => grupo !== 'obreros'
    ? null
    : entradaDeBlanco({
      personaId: l.personaId, cuil: cuilPorPersona.get(l.personaId) ?? null, periodo,
      recibos: exposicion.recibos, pisoCategoria: pisoDe.get(l.personaId) ?? null, netoDeNomina: l.reciboNeto,
      base: baseEstimado,
    })

  return {
    sinActividad: sinActividad.map((p) => ({ id: p.id, nombre: p.nombre })),
    exposicion,
    plantel: [...plantelIds],
    hayRecibosDeSueldo: exposicion.hayRecibosDeSueldo,
    hayColumnasPresentismo,
    hayColumnaDeFormulas,
    horas,
    // LA QUINCENA CERRADA NO SE PISA. Sus cifras son la foto del cierre y no admiten override: si
    // se aplicaran acá, una celda escrita después del cierre cambiaría el registro de lo que ya se
    // pagó, que es exactamente lo que cerrar existe para impedir.
    cuadros: cuadros.map((c) => ({
      ...c,
      // UN CUADRO SIN CABECERA DE UNA QUINCENA CERRADA TAMPOCO SE PISA: hereda el cierre (`estadoDelCuadro`).
      lineas: estadoDelCuadro(estados, c.grupo).estado === 'cerrada'
        // EL PRESENTISMO DE UNA QUINCENA CERRADA ES EL SELLADO: se muestra lo que se pagó, no se recalcula.
        // LO PAGADO VIAJA TAMBIÉN EN LA CERRADA: es el registro de una plata que salió, no un override del
        // cálculo. Sin esto, cerrar la quincena borraría de la pantalla el pago que alguien registró.
        // EL ESPEJO VIAJA TAMBIÉN A LA CERRADA, pero no manda: sólo dice si la planilla midió el banco (`sinDesglose`).
        ? c.lineas.map((l) => conMarcaDePago(
          sinOverrides(l, presentismosSellados.get(l.personaId) ?? null, overrides.get(l.personaId) ?? {}, selloDe(l),
            espejo.cadenaPorPersona.get(l.personaId) ?? null), pagadas,
        ))
        // LA PRECEDENCIA VIVE EN `aplicarOverrides` Y NO ACÁ: manual > JORNALES > calculado, una sola
        // vez y con sus diez tests. Acá sólo se le entrega la fuente.
        : c.lineas.map((l) => conMarcaDePago(aplicarOverrides(
          l, overrides.get(l.personaId) ?? {}, c.grupo, espejo.cadenaPorPersona.get(l.personaId) ?? null,
          blancoDe(c.grupo, l), presentismoDe(c.grupo, l), formulas.get(l.personaId) ?? {},
        ), pagadas)),
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

// LAS OCHO COLUMNAS BASE DE LA FOTO VIAJAN (18/09/2026): `horas`, `valor_hora`, `cobra`, `adelanto`, `ya_transferido`,
// `por_banco`, `en_efectivo`, `total` son lo que la quincena CERRADA muestra (`liquidacionSellada.ts`). Hasta hoy se
// pedían sólo `persona_id, efectivo_redondeado, cobra` y la cerrada se recalculaba con los datos de hoy. Ninguna es un
// override: `horas` sellada no vuelve como manual al reabrir (eso sigue siendo `horas_manual`, ver `COLUMNA_DE.horas`).
// `cobra` además sirve para el importe cargado de Oficina en la ABIERTA (`importesCargados`).
const COLUMNAS_LINEA = [
  'persona_id', 'efectivo_redondeado', 'cobra', 'horas', 'valor_hora', 'adelanto', 'ya_transferido', 'por_banco',
  'en_efectivo', 'total',
] as const

/** LA MARCA «PAGADA» VIAJA EN LA LÍNEA, abierta o cerrada: es el registro de que se pagó, no un override. */
const conMarcaDePago = (l: LineaConOverrides, pagadas: ReadonlyMap<string, string>): LineaConOverrides => {
  const pagadaEn = pagadas.get(l.personaId) ?? null
  return pagadaEn ? { ...l, pagadaEn } : l
}

/** Las correcciones del blanco, si la migración `20260915T0100` ya se aplicó. */
const COLUMNAS_BLANCO = ['horas_recibo_manual', 'valor_hora_recibo_manual'] as const

/** El importe negro escrito a mano, si la migración `20260915T0300` ya se aplicó. */
const COLUMNAS_NEGRO = ['negro_manual'] as const

/** Horas y Hs negro escritas a mano, si la migración `20260915T0510` ya se aplicó. */
const COLUMNAS_HORAS = ['horas_manual', 'horas_negro_manual'] as const

/** La foto del presentismo, si la migración `20260915T2220` ya se aplicó. */
const COLUMNAS_PRESENTISMO = ['presentismo', 'presentismo_perdido'] as const

/** Lo pagado de verdad y las cuentas de las celdas, si la migración `20260915T2340` ya se aplicó. */
const COLUMNAS_PAGADO = ['pagado_banco', 'pagado_efectivo', 'formulas'] as const

/** La marca «pagada» de la línea, si la migración `20260916T1300` ya se aplicó. */
const COLUMNAS_PAGADA = ['pagada_en'] as const

/** Los grupos que dependen de una migración, del más viejo al más nuevo. */
const GRUPOS_OPCIONALES: readonly (readonly string[])[] = [
  COLUMNAS_MANUALES, COLUMNAS_BLANCO, COLUMNAS_NEGRO, COLUMNAS_HORAS, COLUMNAS_PRESENTISMO, COLUMNAS_PAGADO,
  COLUMNAS_PAGADA,
]

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

  const faltaColumna = (e: { code?: string; message: string }) => e.code === '42703' || /column .* does not exist/i.test(e.message)
  // UN ESCALÓN POR MIGRACIÓN: se pide todo y, si la base dice que falta una columna, se saca SU grupo y se relee.
  // Sin una migración sólo sus celdas quedan fijas; las demás correcciones siguen. Si el mensaje no nombra la
  // columna, se saca el grupo más nuevo. Las migraciones no tienen por qué aplicarse en orden.
  let grupos = [...GRUPOS_OPCIONALES]
  for (;;) {
    const columnas = [...COLUMNAS_LINEA, ...grupos.flat()]
    const r = await pedir(columnas)
    if (!r.error) return { data: r.data, error: null, columnas }
    if (!faltaColumna(r.error) || grupos.length === 0) return { data: null, error: r.error, columnas: [] }
    const mensaje = r.error.message
    // `\b` y no `includes`: `negro_manual` está adentro de `horas_negro_manual`.
    const culpable = grupos.find((g) => g.some((c) => new RegExp(`\\b${c}\\b`).test(mensaje)))
    grupos = culpable ? grupos.filter((g) => g !== culpable) : grupos.slice(0, -1)
  }
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
    porPersona.set(id, {
      horas: h.horas, horasEquivalentes: h.horasEquivalentes, extras: h.extras, presentesSinHoras: h.presentesSinHoras,
    })
  }
  return porPersona
}
