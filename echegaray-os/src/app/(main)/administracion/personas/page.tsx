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

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Aviso } from '@/shared/components/ds'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { IconoCuadrilla, IconoPersona } from '@/shared/components/iconos'
import { CabeceraSeccion } from '@/shared/components/v2/CabeceraSeccion'
import { FiltrosSuaves } from '@/shared/components/v2/FiltrosSuaves'
import { NotaBloque, V } from '@/shared/components/v2/patron'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { CamposAlta } from '@/features/administracion/components/FormularioPersona'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import { TablaPersonas, type PulsoDelPlantel } from '@/features/administracion/components/TablaPersonas'
import {
  FILTROS, getConteosDeFiltro, getDirectorio, type FiltroPersonal,
} from '@/features/administracion/services/personasService'
import { crearPersona } from '@/features/administracion/services/personasActions'
import {
  hayControlDeVencimientos, hhPorPersona, marcasPorPersona, mesCorriente, papelesPorPersona,
} from '@/features/administracion/services/pulsoDelPlantel'
import {
  getHHDelMes, getMarcasDeHoy, getPapelesDelPlantel,
} from '@/features/administracion/services/pulsoDelPlantelService'
import { hoyEnObra } from '@/features/jefe/services/contexto'

export const dynamic = 'force-dynamic'

const RUTA = '/administracion/personas'

type Busqueda = { q?: string; f?: string; nueva?: string }

function armarHref(base: Busqueda, filtro?: FiltroPersonal, nueva?: boolean): string {
  const params = new URLSearchParams()
  if (base.q) params.set('q', base.q)
  const f = filtro ?? base.f
  if (f && f !== 'plantel') params.set('f', f)
  if (nueva) params.set('nueva', '1')
  const qs = params.toString()
  return `${RUTA}${qs ? `?${qs}` : ''}`
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
  const [listado, marcas, hh, papeles, conteos] = await Promise.all([
    getDirectorio(supabase, filtro, q),
    conPulso ? getMarcasDeHoy(supabase, hoy) : null,
    conPulso ? getHHDelMes(supabase, desde, hasta) : null,
    conPulso ? getPapelesDelPlantel(supabase) : null,
    // Los contadores de los recortes: cuatro `count` sin filas, y del CORTE entero — no de lo que
    // sobrevive a la búsqueda de este momento (ver `getConteosDeFiltro`).
    getConteosDeFiltro(supabase),
  ])
  return { listado, marcas, hh, papeles, conteos }
}

/** Las tres lecturas agrupadas por persona. Cada fuente que falló apaga SU columna y deja el resto
 *  de la pantalla en pie: el listado no depende de ninguna de las tres. */
function armarPulso(
  marcas: Awaited<ReturnType<typeof getMarcasDeHoy>> | null,
  hh: Awaited<ReturnType<typeof getHHDelMes>> | null,
  papeles: Awaited<ReturnType<typeof getPapelesDelPlantel>> | null,
  hoy: string,
): PulsoDelPlantel | undefined {
  if (!marcas || !hh || !papeles) return undefined
  const { desde, hasta } = mesCorriente(hoy)
  return {
    marcas: marcasPorPersona(marcas.data),
    hh: hhPorPersona(hh.data, desde, hasta),
    papeles: papelesPorPersona(papeles.data, hoy),
    hoyDisponible: marcas.error == null,
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
  const { listado, marcas, hh, papeles, conteos } = await leerTodo(supabase, filtro, sp.q, hoy)

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
  const pulso = armarPulso(marcas, hh, papeles, hoy)
  const abierta = sp.nueva === '1'

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
          vistas={[{ clave: 'personal', titulo: 'Personal', cuenta: conteos.plantel, activa: true, href: armarHref({}) }]}
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
