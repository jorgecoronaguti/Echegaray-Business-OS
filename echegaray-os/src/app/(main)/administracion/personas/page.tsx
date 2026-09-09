// 19 · PERSONAL v2 — el patrón de sección aplicado al plantel.
//
// ═══ LA BANDA DE SEÑALES SE FUE (handoff CRM / Administración v4, 05/09/2026) ═══
//
// Acá arriba había un bloque «Lo que pide trabajo» con hasta tres señales —papeles vencidos, sin
// fichar hoy, sin obra asignada— antes de la lista. Era el criterio 1 del patrón v2, y la v4 lo
// revierte para las pantallas de área por el mismo motivo que en Proveedores: la banda decía en un
// renglón lo que la fila ya dice en su propia celda, y empujaba la lista —que es a lo que se
// entra— fuera de la primera pantalla.
//
// NO SE PERDIÓ NINGUNA DE LAS TRES, Y ESA ES LA CONDICIÓN DE SACARLA:
//
//   SIN OBRA ASIGNADA   la celda OBRA lo dice en ámbar, la fila lleva su filo, y el recorte «Sin
//                       asignar» lo aísla de un clic diciendo cuántos son.
//   SIN FICHAR HOY      es la columna HOY, persona por persona.
//   PAPELES VENCIDOS    baja a la celda PAPELES, en rojo y sólo cuando existe el control. La banda
//                       lo contaba sin poder decir QUIÉN; la celda lo dice en la fila que lo tiene.
//
// Los recortes cuentan LA POBLACIÓN DEL CORTE, no la página: sin ese número, un recorte es una
// puerta a ciegas y el trabajo pendiente deja de tener tamaño. Ninguno cambia al buscar.
//
// ═══ LO QUE NO ESTÁ ES TAN DELIBERADO COMO LO QUE ESTÁ ═══
//
// Ni DNI, ni CUIL, ni teléfono, ni retribución, ni métricas: viven en el legajo. Y no están de
// verdad — el listado sale de `persona_directorio` con sus columnas nombradas una por una, así que
// esos campos tampoco viajan al navegador aunque alguien abra las herramientas de desarrollo.
//
// ═══ LO QUE EL MOCKUP DIBUJA Y ACÁ NO ESTÁ ═══
//
// · «AUSENTES SIN JUSTIFICAR», la señal roja: este modelo no tiene ausencias — `estadoHoy` sólo
//   sabe de `en_obra`, `ya_cerro` y `sin_fichar`, y ese silencio incluye al que no tiene batería.
//   Pintarlo de rojo fabricaría una novedad de liquidación. Quién faltó lo declara el jefe de obra.
// · EL PANEL LATERAL de la persona (jornadas, cuadrilla, papeles): la fila sigue llevando al legajo
//   360, que muestra todo eso y más. Un panel con las últimas jornadas es una lectura por persona
//   tocada, y esa pantalla ya existe. DECLARADO COMO PENDIENTE, no como hecho.

import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Aviso } from '@/shared/components/ds'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { IconoCuadrilla, IconoPersona } from '@/shared/components/iconos'
import { CabeceraSeccion } from '@/shared/components/v2/CabeceraSeccion'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { NotaBloque, V } from '@/shared/components/v2/patron'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { BloqueAsistenciaQuincena } from '@/features/administracion/components/BloqueAsistenciaQuincena'
import { BloqueLiquidacion } from '@/features/administracion/components/liquidacion/BloqueLiquidacion'
import { BarraSolapas } from '@/features/administracion/components/liquidacion/solapas/BarraSolapas'
import { solapaDe } from '@/features/administracion/components/liquidacion/solapas'
import { BloqueAsistenciaDia } from '@/features/administracion/components/asistencia/BloqueAsistenciaDia'
import { CamposAlta } from '@/features/administracion/components/FormularioPersona'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import { TablaPersonas, type PulsoDelPlantel } from '@/features/administracion/components/TablaPersonas'
import {
  FILTROS, getConteosDeFiltro, getDirectorio, type FiltroPersonal,
} from '@/features/administracion/services/personasService'
import { crearPersona } from '@/features/administracion/services/personasActions'
import {
  asistenciaHoyPorPersona, hayControlDeVencimientos, hhPorPersona, marcasPorPersona, mesCorriente,
  papelesPorPersona,
} from '@/features/administracion/services/pulsoDelPlantel'
import {
  getHHDelMes, getMarcasDeHoy, getPapelesDelPlantel,
} from '@/features/administracion/services/pulsoDelPlantelService'
import { getPresenciaDelDia } from '@/features/administracion/services/presenciaDelDiaService'
import { hoyEnObra } from '@/features/jefe/services/contexto'
import { diaDeCarga } from '@/features/administracion/services/diaDeJornada'
import { modoDeAsistencia } from '@/features/administracion/services/vistaDeAsistencia'
import { puedeCambiarObraActual } from '@/features/administracion/services/planDeObraActual'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion, liquidaSueldos, veEconomia } from '@/features/auth/types/areas'

export const dynamic = 'force-dynamic'

const RUTA = '/administracion/personas'

type Busqueda = {
  q?: string; f?: string; nueva?: string; vista?: string; quincena?: string; modo?: string
  obra?: string; dia?: string
  /** Las seis solapas de Liquidación (`solapas/index.ts`). Default `horas`. */
  solapa?: string; convenio?: string; pendiente?: string
}

function armarHref(base: Busqueda, filtro?: FiltroPersonal, nueva?: boolean): string {
  const params = new URLSearchParams()
  if (base.q) params.set('q', base.q)
  const f = filtro ?? base.f
  if (f && f !== 'plantel') params.set('f', f)
  if (nueva) params.set('nueva', '1')
  const qs = params.toString()
  return `${RUTA}${qs ? `?${qs}` : ''}`
}

/** La solapa Asistencia y su quincena. Va aparte de `armarHref` porque no lleva ni filtro ni alta:
 *  arrastrar `f=sin_asignar` a una grilla que no filtra por eso prometería un recorte que no ocurre.
 *  El valor es CUALQUIER día de la quincena; el bloque la resuelve. */
const hrefAsistencia = (quincena?: string): string =>
  `${RUTA}?vista=asistencia${quincena ? `&quincena=${quincena}` : ''}`

/** La solapa Liquidación, con la misma convención de quincena que Asistencia: cualquier día de la
 *  ventana sirve y el bloque la resuelve. */
const hrefLiquidacion = (quincena?: string): string =>
  `${RUTA}?vista=liquidacion${quincena ? `&quincena=${quincena}` : ''}`

/**
 * UN ENLACE DENTRO DE LIQUIDACIÓN, conservando lo que ya estaba puesto.
 *
 * Cambiar de solapa NO puede perder la quincena que se está mirando, y elegir otro período no puede
 * devolver a la solapa Horas: los dos son el mismo recorte visto desde otro eje. Un valor
 * `undefined` en `cambios` BORRA ese parámetro — así se apaga un filtro con el mismo enlace que lo
 * prendió.
 */
function hrefSolapa(base: Busqueda, cambios: Record<string, string | undefined>): string {
  const actual: Record<string, string | undefined> = {
    solapa: base.solapa, quincena: base.quincena, convenio: base.convenio, pendiente: base.pendiente,
  }
  const params = new URLSearchParams({ vista: 'liquidacion' })
  for (const [k, v] of Object.entries({ ...actual, ...cambios })) {
    if (v) params.set(k, v)
  }
  return `${RUTA}?${params.toString()}`
}

/** La carga del día en el teléfono. `modo=dia` viaja SIEMPRE: sin él, tocar «‹ ayer» desde un
 *  navegador que no manda las pistas devolvería la grilla de quincena y el paso se perdería. */
const hrefDia = (p: { obra?: string | null; dia?: string | null }): string => {
  const params = new URLSearchParams({ vista: 'asistencia', modo: 'dia' })
  if (p.obra) params.set('obra', p.obra)
  if (p.dia) params.set('dia', p.dia)
  return `${RUTA}?${params.toString()}`
}

/**
 * LAS TRES SOLAPAS DE PERSONAL, EN UN SOLO LUGAR.
 *
 * Estaban escritas dos veces —una en la rama de Asistencia y otra en la del Plantel— y ya eran dos
 * definiciones de la misma barra. Con una tercera solapa, la que se olvide de agregar deja media
 * pantalla sin la puerta.
 *
 * NINGUNA LLEVA CUENTA: el número de una solapa promete cuántas filas hay del otro lado del clic, y
 * del otro lado de Asistencia y Liquidación hay una QUINCENA, no una población estable.
 *
 * `veLaPlata` decide si Liquidación se dibuja. No es el permiso —ése es `ve_economia()` en la
 * base—: es no ofrecer una puerta que va a rebotar.
 */
function vistasDe(activa: 'personal' | 'asistencia' | 'liquidacion', quincena: string | undefined, veLaPlata: boolean) {
  const vistas = [
    { clave: 'personal', titulo: 'Plantel', cuenta: null, activa: activa === 'personal', href: armarHref({}) },
    { clave: 'asistencia', titulo: 'Asistencia', cuenta: null, activa: activa === 'asistencia', href: hrefAsistencia(quincena) },
  ]
  if (veLaPlata) {
    vistas.push({ clave: 'liquidacion', titulo: 'Liquidación', cuenta: null, activa: activa === 'liquidacion', href: hrefLiquidacion(quincena) })
  }
  return vistas
}

/** Qué decir cuando no hay ninguna fila: una línea, y que diga qué hacer. */
function vacioDe(filtro: FiltroPersonal, q?: string) {
  if (filtro === 'sin_asignar') return 'Todo el plantel está asignado a una obra.'
  if (filtro === 'en_obra') return 'Nadie tiene una asignación vigente. Se asigna desde la solapa Personal de la obra.'
  if (filtro === 'inactivos') return 'Nadie egresó del plantel.'
  return q ? `Ninguna persona coincide con «${q}».` : 'Todavía no hay personas cargadas.'
}

/**
 * LAS CINCO LECTURAS EN UNA SOLA TANDA. El directorio no depende de las otras, así que esperarlas
 * en fila costaría cinco viajes en serie por cada carga de la pantalla.
 *
 * A QUIEN YA NO ESTÁ NO SE LE PREGUNTA SI FICHÓ HOY: en «Inactivos» las tres lecturas del pulso ni
 * se piden. No es sólo ahorro — la columna diría «sin fichar» de 45 personas que se fueron hace un
 * año, que es literalmente cierto y completamente inútil.
 */
async function leerTodo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filtro: FiltroPersonal, q: string | undefined, hoy: string,
) {
  const { desde, hasta } = mesCorriente(hoy)
  const conPulso = filtro !== 'inactivos'
  const [listado, marcas, hh, papeles, presencia, conteos] = await Promise.all([
    getDirectorio(supabase, filtro, q),
    conPulso ? getMarcasDeHoy(supabase, hoy) : null,
    conPulso ? getHHDelMes(supabase, desde, hasta) : null,
    conPulso ? getPapelesDelPlantel(supabase) : null,
    // LA PRESENCIA DECLARADA DE HOY (`asistencia_dia`, 08/09/2026). Sin esta lectura la columna HOY
    // sólo conocía horas, y a quien el jefe marcó presente a las 7:30 lo escribía «sin cargar».
    // De TODAS las obras: la columna es del plantel entero, no de una obra.
    conPulso ? getPresenciaDelDia(supabase, hoy) : null,
    // Los contadores de los recortes: cuatro `count` sin filas, y del CORTE entero — no de lo que
    // sobrevive a la búsqueda de este momento (ver `getConteosDeFiltro`).
    getConteosDeFiltro(supabase),
  ])
  return { listado, marcas, hh, papeles, presencia, conteos }
}

/** Las tres lecturas agrupadas por persona. Cada fuente que falló apaga SU columna y deja el resto
 *  de la pantalla en pie: el listado no depende de ninguna de las tres. */
function armarPulso(
  marcas: Awaited<ReturnType<typeof getMarcasDeHoy>> | null,
  hh: Awaited<ReturnType<typeof getHHDelMes>> | null,
  papeles: Awaited<ReturnType<typeof getPapelesDelPlantel>> | null,
  presencia: Awaited<ReturnType<typeof getPresenciaDelDia>> | null,
  hoy: string,
): PulsoDelPlantel | undefined {
  if (!marcas || !hh || !papeles || !presencia) return undefined
  const { desde, hasta } = mesCorriente(hoy)
  return {
    marcas: marcasPorPersona(marcas.data),
    // LA MISMA LECTURA CONTESTA LAS DOS PREGUNTAS: la ventana del mes cierra en hoy, así que las
    // filas de hoy ya vinieron. Una consulta aparte por la columna HOY sería un sexto viaje para
    // traer un subconjunto de lo que está en memoria.
    asistencia: asistenciaHoyPorPersona(hh.data, hoy, presencia.data ?? []),
    hh: hhPorPersona(hh.data, desde, hasta),
    papeles: papelesPorPersona(papeles.data, hoy),
    // LA COLUMNA HOY NECESITA LAS DOS FUENTES. Si `asistencia_dia` no se pudo leer, la columna no
    // puede afirmar «sin cargar» de nadie: estaría contando como silencio lo que quizá está
    // declarado. Se apaga entera, que es lo que ya hacía cuando fallaba `presencia_del_dia`.
    hoyDisponible: marcas.error == null && presencia.error == null,
    hhDisponible: hh.error == null,
    // SE PUDO LEER LA TABLA. Sin esto, un error de lectura escribiría «sin cargar» en 62 filas —una
    // afirmación sobre 847 papeles que sí están— en vez de «sin lectura».
    papelesLeidos: papeles.error == null,
    // LA COLUMNA EXISTE EN LA BASE Y AUN ASÍ PUEDE NO HABER CONTROL. Sonda del 24/08 sobre la base
    // real: 847 papeles cargados y CERO con vencimiento. Con eso, una señal de «vencidos» sería una
    // afirmación sobre un control que nadie está haciendo. Aparece sola el día del primer dato.
    papelesDisponible: papeles.error == null && hayControlDeVencimientos(papeles.data),
  }
}


export default async function PersonalPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const filtro = (FILTROS.find((f) => f.valor === sp.f)?.valor ?? 'plantel') as FiltroPersonal
  const supabase = await createClient()
  const hoy = hoyEnObra()
  const enAsistencia = sp.vista === 'asistencia'
  const enLiquidacion = sp.vista === 'liquidacion'

  // ═══ EL TELÉFONO NO CARGA LA GRILLA DE QUINCENA (08/09/2026) ═══
  //
  // Se decide en el servidor y no con `md:hidden` porque la vista que se tapa CUESTA: la quincena
  // son hasta 15 personas × 15 días más las obras elegibles. Dibujar las dos para tirar una sería
  // pagar seis consultas y mandar el doble de HTML por la red de la obra. El porqué completo y la
  // salida cuando la adivinanza falla, en `services/vistaDeAsistencia.ts`.
  const cabeceras = enAsistencia ? await headers() : null
  const modo = enAsistencia
    ? modoDeAsistencia(sp.modo, cabeceras?.get('sec-ch-ua-mobile'), cabeceras?.get('user-agent'))
    : 'quincena'

  // LA SOLAPA QUE NO SE MIRA NO SE LEE. El pulso del plantel son cuatro consultas —presencia,
  // horas del mes, papeles y los conteos de los recortes— que la grilla de asistencia no usa para
  // nada: pedirlas igual sería pagar cinco viajes a la base para tirarlos.
  // ═══ LA SOLAPA LIQUIDACIÓN NO ES PARA EL JEFE DE OBRA ═══
  //
  // `es_administracion()` lo incluye desde el 19/08/2026 y el jefe entra a esta misma pantalla a
  // cargar asistencia. Los sueldos son de dirección y administración: la solapa ni se dibuja, y si
  // alguien escribe la URL a mano, `ve_economia()` en la RLS devuelve cero filas. Esto es la puerta;
  // la policy es la cerradura.
  // EL ROL SE LEE UNA VEZ PARA LAS TRES RAMAS. La de Asistencia ya lo leía para el desplegable de
  // obra actual; leerlo de nuevo en cada rama serían dos viajes a `perfiles` por carga.
  const rol = (await getPerfilActual(supabase)).data?.rol
  const veLaPlata = veEconomia(rol)
  const liquida = liquidaSueldos(rol)

  // ═══ SIN NIVEL ADMINISTRADOR, LA RUTA NO EXISTE (dueño, 09/09/2026) ═══
  //
  // Antes se servía la vista con un aviso amable. Un aviso confirma que el módulo está ahí y en qué
  // URL: `notFound()` no cuenta nada. Y se corta ANTES de leer una sola fila, así que ni siquiera se
  // arma la consulta que la RLS iba a devolver vacía. Esto es la puerta; la cerradura es
  // `public.liquida_sueldos()` en la policy, que también corta una llamada directa a PostgREST.
  if (enLiquidacion && !liquida) notFound()

  if (enLiquidacion) {
    const solapa = solapaDe(sp.solapa)
    const Contenido = solapa.Componente
    return (
      <Marco>
        <NavAdministracion />
        <div style={{ lineHeight: 'normal' }}>
          <CabeceraSeccion
            testid="vistas-personal"
            espacioPanel={false}
            vistas={vistasDe('liquidacion', sp.quincena, veLaPlata)}
          />
          <div style={{ padding: '0 20px 24px' }}>
            <BarraSolapas
              activa={solapa.clave}
              hrefDe={(clave) => hrefSolapa(sp, { solapa: clave })}
            />
            <div style={{ paddingTop: 10 }}>
              {Contenido ? (
                <Contenido
                  quincenaPedida={sp.quincena}
                  hoy={hoy}
                  parametros={{ convenio: sp.convenio, pendiente: sp.pendiente }}
                  hrefDe={(cambios) => hrefSolapa(sp, cambios)}
                />
              ) : (
                // LA PANTALLA 4 TODAVÍA NO EXISTE, Y EL CUADRO QUE YA CONTESTA LA CADENA DE PAGO SÍ.
                // Dejarlo acá mientras tanto evita que la solapa Pagos lleve a una pantalla en
                // blanco; quien construya la pantalla 4 registra su componente y esto se cae solo.
                solapa.clave === 'pagos' ? (
                  <BloqueLiquidacion
                    quincenaPedida={sp.quincena} hoy={hoy} hrefDe={hrefLiquidacion} puedeCerrar
                  />
                ) : (
                  <p style={{ fontSize: '12.5px', color: V.apagado, padding: '18px 0' }}
                    data-testid="solapa-sin-pantalla">
                    «{solapa.titulo}» todavía no está construida.
                  </p>
                )
              )}
            </div>
          </div>
        </div>
      </Marco>
    )
  }

  if (enAsistencia) {
    return (
      <Marco>
        <NavAdministracion />
        <div style={{ lineHeight: 'normal' }}>
          <CabeceraSeccion
            testid="vistas-personal"
            espacioPanel={false}
            vistas={vistasDe('asistencia', sp.quincena, veLaPlata)}
            // EL BUSCADOR ES DE LA GRILLA. En la carga del día el bloque muestra UNA obra y su
            // gente —seis o siete nombres en una pantalla de 390px—: buscar ahí no filtra nada y
            // le come una línea entera a la única vista que se usa parado en la obra.
            buscador={modo === 'quincena' ? {
              accion: RUTA,
              q: sp.q,
              placeholder: 'Buscar persona',
              oculto: { vista: 'asistencia', quincena: sp.quincena },
              testid: 'buscar-persona',
            } : undefined}
          />
          {modo === 'dia' ? (
            <BloqueAsistenciaDia
              obraPedida={sp.obra}
              dia={diaDeCarga(sp.dia, hoy)}
              hrefDe={hrefDia}
              // FORZAR LA GRILLA, NO SÓLO MOSTRARLA. Sin `modo=quincena` este enlace volvería a
              // caer en la adivinanza y en el teléfono devolvería la misma pantalla de la que se
              // quiso salir — el mismo lazo que ya dejó `/campo/asistencia` girando sobre sí.
              hrefQuincena={`${hrefAsistencia(sp.quincena)}&modo=quincena`}
            />
          ) : (
            <div style={{ padding: '10px 20px 24px' }}>
              <BloqueAsistenciaQuincena
                quincenaPedida={sp.quincena} hoy={hoy} q={sp.q} hrefDe={hrefAsistencia}
                // ESTA PANTALLA YA ES DE ADMINISTRACIÓN: quien llega acá pasó el portero del área.
                // El `true` no es un permiso, es la afirmación de dónde vive el botón; la policy de
                // `registros_hh` y la de `obra_asignacion` son las que rechazan de verdad.
                puedeCorregir
                // MOVER A ALGUIEN DE OBRA NO ES CORREGIR UN DÍA. El jefe de obra llega a esta
                // pantalla —`es_administracion()` lo incluye— y sigue cargando y corrigiendo la
                // jornada; el desplegable de obra actual es de Dirección y Administración.
                puedeCambiarObra={puedeCambiarObraActual(rol)}
              />
              {/* LA VUELTA. Quien forzó la grilla desde el teléfono necesita cómo volver, y quien
                  está en escritorio no ve este enlace: `md:hidden` lo apaga a partir de 768px. */}
              <p className="mt-4 text-center md:hidden">
                <Link
                  prefetch={false}
                  href={hrefDia({ dia: sp.dia })}
                  data-testid="ver-carga-del-dia"
                  className="inline-flex min-h-[44px] items-center px-2 text-[12.5px] text-muted underline hover:text-ink"
                >
                  Cargar la asistencia de un día
                </Link>
              </p>
            </div>
          )}
        </div>
      </Marco>
    )
  }

  const { listado, marcas, hh, papeles, presencia, conteos } = await leerTodo(supabase, filtro, sp.q, hoy)

  // EL ERROR DE LA BASE SE MUESTRA, NO SE PINTA COMO LISTA VACÍA. Una tabla en blanco porque la RLS
  // rechazó la consulta es indistinguible de una tabla en blanco porque no hay personas, y la
  // diferencia entre las dos es todo. Esta pantalla estuvo muerta un día por eso mismo
  // («permission denied for table personas») y este mensaje es lo que permitió encontrarlo.
  if (listado.error) {
    return (
      <Marco>
        <NavAdministracion />
        <div style={{ padding: '24px 20px' }} data-testid="personas-error">
          <Aviso tono="neg" titulo="No pude leer el legajo">{listado.error}</Aviso>
        </div>
      </Marco>
    )
  }

  const personas = listado.data ?? []
  const pulso = armarPulso(marcas, hh, papeles, presencia, hoy)
  const abierta = sp.nueva === '1'
  // EL PERFIL YA ESTÁ EN MEMORIA: `getPerfilActual` memoiza por usuario (`recordar`), así que esto
  // no es un sexto viaje a la base — es la misma lectura que hace la barra de navegación.
  const rolActual = (await getPerfilActual(supabase)).data?.rol

  return (
    <Marco>
      <NavAdministracion />

      {/* EL INTERLINEADO DEL MOCKUP, DECLARADO UNA VEZ y por fuera de la barra de áreas, que es de
          la sección y no de esta pantalla. Ver `patron.tsx · CAJA_CONTENIDO`. */}
      <div style={{ lineHeight: 'normal' }}>
        {/* UNA FUENTE QUE NO SE PUDO LEER SE DICE CON SU ERROR, y su columna se apaga en vez de
            publicar «sin fichar» diecisiete veces. Un control que no pudo mirar no dice «no está». */}
        {[
          { clave: 'presencia', que: 'la presencia de hoy', error: marcas?.error },
          // LA DECLARACIÓN DEL JEFE FALLA POR SU CUENTA Y SE DICE POR SU CUENTA: es otra tabla y
          // otra RLS que la del fichaje, y confundir las dos mandaría a mirar el problema equivocado.
          { clave: 'declarada', que: 'la presencia declarada de hoy', error: presencia?.error },
          { clave: 'hh', que: 'las horas del mes', error: hh?.error },
          { clave: 'papeles', que: 'los papeles del legajo', error: papeles?.error },
        ].filter((f) => f.error).map((f) => (
          <div key={f.clave} style={{ padding: '12px 20px 0' }}>
            <Aviso tono="info" testid={`sin-lectura-${f.clave}`} titulo={`No pude leer ${f.que}`}>
              {f.error}
            </Aviso>
          </div>
        ))}

        <CabeceraSeccion
          testid="vistas-personal"
          espacioPanel={abierta}
          vistas={vistasDe('personal', undefined, veLaPlata)
            .map((v) => (v.clave === 'personal' ? { ...v, cuenta: conteos.plantel } : v))}
          buscador={{
            accion: RUTA,
            q: sp.q,
            placeholder: 'Buscar persona',
            oculto: { f: filtro === 'plantel' ? undefined : filtro },
            testid: 'buscar-persona',
          }}
          alta={{ href: armarHref(sp, filtro, !abierta), etiqueta: abierta ? 'Cancelar' : 'Nueva persona', testid: 'nueva-persona' }}
          filtros={
            // NAVEGACIÓN, NO ACCIONES: «En obra ahora» y «Cuadrillas» son otras dos distancias de la
            // misma pregunta y viven DENTRO de Personal, no como secciones nuevas. Por eso van en
            // texto discreto y la única primaria amarilla de la pantalla es el alta.
            <>
              <NavDiscreta href="/administracion/personas/en-obra" testid="ir-en-obra" icono="persona">En obra ahora</NavDiscreta>
              <NavDiscreta href="/administracion/personas/cuadrillas" testid="ir-cuadrillas" icono="cuadrilla">Cuadrillas</NavDiscreta>
            </>
          }
        />

        <div style={{ padding: '10px 20px 24px' }}>
          <div className="flex flex-col lg:flex-row lg:items-stretch">
            <div className="min-w-0 flex-1">
              <FiltrosSuaves
                testid="filtro"
                conteo={{ n: personas.length, total: conteos[filtro] ?? personas.length }}
                opciones={FILTROS.map((f) => ({
                  clave: f.valor,
                  etiqueta: f.etiqueta,
                  href: armarHref(sp, f.valor),
                  activo: f.valor === filtro,
                  // LA POBLACIÓN DEL CORTE, NO LA PÁGINA. Son los cuatro `count` de la base, que no
                  // se mueven al escribir en el buscador: el recorte promete cuántas filas hay del
                  // otro lado del clic. `null` —no se pudo contar— no dibuja número: un 0 ahí diría
                  // que no queda nadie sin asignar, que es la afirmación que reemplazó a la banda.
                  cuenta: conteos[f.valor],
                }))}
              />

              <TablaPersonas
                personas={personas}
                conBaja={filtro === 'inactivos'}
                pulso={pulso}
                vacio={vacioDe(filtro, sp.q)}
                // ═══ EL BOTÓN «PRESENTE» DE LA COLUMNA HOY (dueño, 09/09/2026) ═══
                //
                // *«marcar que la persona está en el trabajo, a través de los usuarios admin / jefe
                // de obra, es tan simple como un botón en la vista de computadora que tenés que
                // crear ahí donde dice "sin marcar"»*.
                //
                // `esAdministracion` es Dirección, Administración y Jefe de Obra: LA MISMA LISTA que
                // `es_administracion()` en Postgres, que es la que decide de verdad el insert en
                // `asistencia_dia`. Repetir el criterio con otra forma —una lista de roles escrita
                // acá— crearía una segunda definición que se desincroniza de la policy sin que nada
                // se ponga rojo. Un rol desconocido o un usuario sin perfil no marca a nadie: las
                // dos puntas fallan cerrado.
                //
                // LA FECHA LA PONE EL SERVIDOR (`hoyEnObra`), no el navegador: un teléfono con el
                // reloj corrido declararía presencia en otro día y quedaría escrita.
                marcar={esAdministracion(rolActual) ? { fecha: hoy } : undefined}
              />

              <NotaBloque testid="nota-personal">
                El plantel sale de la pertenencia a la empresa, no de la fecha de egreso: hay bajas
                sin fecha cargada. DNI, CUIL, teléfono y retribución no viajan a esta lista — viven
                en el legajo. Y no hay control de vencimientos de papeles: hay 847 documentos
                cargados y ninguno con fecha, así que nada acá puede decir «al día».
              </NotaBloque>
            </div>

            {abierta && (
              <PanelEdicion
                titulo="Nueva persona"
                accion={crearPersona}
                cerrarHref={armarHref(sp, filtro)}
                enviar="Crear"
                testid="panel-alta-persona"
                ayuda="DNI, CUIL, teléfono y retribución se cargan en el legajo, no en el listado."
              >
                <CamposAlta />
              </PanelEdicion>
            )}
          </div>
        </div>
      </div>
    </Marco>
  )
}

/** Un destino de nivel 3 en texto: navegación, no acción. `19v2:74-81`. */
function NavDiscreta({ href, children, testid, icono }: {
  href: string
  children: React.ReactNode
  testid: string
  icono: 'persona' | 'cuadrilla'
}) {
  const Icono = icono === 'persona' ? IconoPersona : IconoCuadrilla
  return (
    <Link
      href={href}
      prefetch={false}
      data-testid={testid}
      className="hover:text-[#1F1F1E]"
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12.5px', color: V.apagado }}
    >
      <Icono className="h-[15px] w-[15px]" />
      {children}
    </Link>
  )
}

/** El marco: fondo a toda la altura y el sello del último dato bueno, que `error.tsx` necesita. */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: V.fondo, display: 'flex', flexDirection: 'column' }}>
      <SelloDatoBueno />
      {children}
    </div>
  )
}
