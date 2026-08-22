'use client'

// PLANIFICACIÓN — UNA solapa con cuatro maneras de mirar LAS MISMAS actividades.
//
// ═══ POR QUÉ NO HAY UNA SOLAPA «PLANIFICACIÓN» Y OTRA «GANTT» ═══
//
// Eran dos solapas principales sobre el mismo cronograma: la primera lo dibujaba entero y la segunda
// mostraba el recorte de lo que viene. Separadas obligaban a volver al nivel de arriba para cruzar
// dos vistas del mismo trabajo, y hacían parecer que había dos planes. Son una herramienta con
// cuatro zooms, y por eso viven juntas.
//
// LAS ACTIVIDADES SON LAS MISMAS Y SE FILTRAN UNA SOLA VEZ, ACÁ. Gantt, Lista, Tablero y Próximos
// reciben la lista YA recortada: si cada vista filtrara con su propia regla, cambiar de solapa
// cambiaría lo que se ve sin que nadie haya tocado el filtro.
//
// ═══ QUÉ VIVE ACÁ Y POR QUÉ ═══
//
// La barra de vista (48px) necesita saber si el panel está cerrado —para ofrecer `Detalle ‹`— y qué
// escala tiene el calendario. Por eso la selección de actividad, el estado del panel y la escala
// viven en este nivel y no adentro del Gantt: el control y el estado que gobierna tienen que estar
// en el mismo lugar, o hace falta un canal de vuelta que nadie mantiene.
//
// ═══ LA SUB-VISTA Y LA VENTANA VIAJAN EN LA URL; LA SELECCIÓN DE UNA BARRA NO ═══
//
// «Estoy mirando el Gantt» y «estoy mirando las próximas dos semanas» son VISTAS: se mandan por
// mensaje, se abren de nuevo mañana y tienen que volver iguales. Van en la query. Seleccionar una
// barra NO: en el Gantt se toca una actividad tras otra para comparar fechas, y una vuelta al
// servidor por clic haría el cronograma pegajoso justo en lo que más se usa.

import Link from 'next/link'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Franja, type Metrica } from '@/shared/components/ds'
import { BotonAccion, type ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Dependencia, Persona, Restriccion } from '../types'
import type { ActividadHH } from '../services/personalService'
import { Gantt } from './Gantt'
// LAS SUB-VISTAS VIVEN EN UN MÓDULO NEUTRAL: la página, que es un Server Component, también las
// necesita, y un valor exportado desde un archivo `'use client'` no cruza esa frontera.
import { type SubVista, type Ventana } from '../services/subvistas'
import { hrefCronogramaCalculado } from '../services/vistasObra'
import { BarraPlan, type AccionesPlan } from './BarraPlan'
import { resumenDelPlan, type ResumenDelPlan } from '../services/resumenDelPlan'
import { aplicarFiltro, FILTRO_VACIO, hayFiltro, type FiltroPlan } from '../services/filtroPlan'
import { rubrosDe } from '../services/rubros'
import type { Escala } from '../services/escala'
import { FormNuevaActividad } from './FormActividad'
import type { AccionesCronograma, DatosDeActividad } from './PanelActividad'
import { SellarLineaBase, type AccionesEnLote } from './AccionesMasivas'

// ═══ HAY DOS COLUMNAS O NO LAS HAY ═══
//
// El panel se elige solo en ESCRITORIO. En el teléfono no es una columna: es una hoja que sube y
// tapa el cronograma, y abrirla sola deja al jefe de obra mirando una ficha que no pidió, con el
// fondo comiéndose el primer toque. Se lee con `useSyncExternalStore` y no con un efecto que
// escribe estado: el servidor contesta `false` —sin panel en la primera pintura, sin desajuste de
// hidratación— y el navegador corrige en el mismo render, sin una vuelta extra.
const MQ = '(min-width: 1024px)'
const suscribirAncho = (avisar: () => void) => {
  const m = window.matchMedia(MQ)
  m.addEventListener('change', avisar)
  return () => m.removeEventListener('change', avisar)
}

const n = (v: number | null, dec = 0) =>
  v == null ? null : v.toLocaleString('es-AR', { maximumFractionDigits: dec })

/** La franja de seis cifras del pie. Sale de las MISMAS actividades que se acaban de dibujar. */
function metricasDelPlan(r: ResumenDelPlan, semanas: number): Metrica[] {
  const sinCargar = <span className="text-[13px] font-normal text-faint">sin cargar</span>
  return [
    { etiqueta: 'Avance físico', valor: r.avance == null ? sinCargar : `${r.avance}%` },
    {
      etiqueta: 'HH consumidas',
      valor: n(r.hhReal, 1) ?? sinCargar,
      contexto: r.hhPlan == null ? 'sin plan de HH' : `de ${n(r.hhPlan, 1)} previstas`,
    },
    {
      etiqueta: 'Desvío HH',
      valor: r.desvioHH == null ? sinCargar : `${r.desvioHH > 0 ? '+' : ''}${n(r.desvioHH, 1)}`,
      contexto: r.desvioHH == null ? 'falta una punta' : 'contra el plan',
      // Rojo SÓLO cuando es un problema real: gastar horas de más. Por debajo del plan no es rojo.
      ...(r.desvioHH != null && r.desvioHH > 0 ? { tono: 'neg' as const } : {}),
    },
    { etiqueta: 'Actividades', valor: String(r.actividades), contexto: `${r.enCurso} en curso` },
    {
      etiqueta: 'Impedimentos',
      valor: String(r.impedimentosAbiertos),
      contexto: r.impedimentosVencidos > 0 ? `${r.impedimentosVencidos} vencido(s)` : 'ninguno vencido',
      ...(r.impedimentosVencidos > 0 ? { tono: 'neg' as const } : {}),
    },
    { etiqueta: `Próximas ${semanas} sem.`, valor: String(r.proximas), contexto: 'por arrancar o cerrar' },
  ]
}

export function TabCronograma({
  actividades,
  obraId,
  archivadas = [],
  restricciones = [],
  dependencias = [],
  personas = [],
  acciones,
  masivas,
  accionesPlan = {},
  yaSellada = false,
  restaurarActividad,
  sub,
  semanas,
  actividadAbierta = null,
  hoy,
  hhPorActividad,
  datosPorActividad,
  anchoTabla,
  anchoPanel,
}: {
  /** El cronograma vivo: las NO archivadas, en el orden del tracker. */
  actividades: Actividad[]
  obraId: string
  /** Las archivadas, para poder devolverlas. Si no se pasan, no se dibuja la lista. */
  archivadas?: Actividad[]
  restricciones?: Restriccion[]
  dependencias?: Dependencia[]
  personas?: Persona[]
  /** Sin `acciones` todo el cronograma queda de sólo lectura. */
  acciones?: AccionesCronograma
  masivas?: AccionesEnLote
  /** Crear, renombrar, ordenar y archivar rubros. */
  accionesPlan?: AccionesPlan
  yaSellada?: boolean
  /** `archivarActividad` atada a la obra: se la llama con `(id, false)` para restaurar. */
  restaurarActividad?: (actividadId: string, archivada: boolean) => Promise<ResultadoAccion>
  sub?: SubVista
  semanas?: Ventana
  /** Query `act`: qué actividad abrir al entrar. Después la selección es local. */
  actividadAbierta?: string | null
  /** Sólo para poder fijar el día en un test. En la pantalla es hoy. */
  hoy?: Date
  hhPorActividad?: Map<string, ActividadHH>
  datosPorActividad?: Map<string, DatosDeActividad>
  /** Los anchos del split, leídos de la cookie por el servidor. */
  anchoTabla?: number
  anchoPanel?: number
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [subLocal, setSubLocal] = useState<SubVista>(sub ?? 'gantt')
  const [semanasLocal] = useState<Ventana>(semanas ?? '2')
  // EL FILTRO NO VIAJA EN LA URL. Es estado de trabajo —«mostrame lo mío ahora»— y no una vista que
  // se comparte: un enlace mandado por chat que llega con un recorte que el que lo abre no puso es
  // la manera más rápida de leer mal una obra.
  const [filtro, setFiltro] = useState<FiltroPlan>(FILTRO_VACIO)
  const [escala, setEscala] = useState<Escala>('semana')
  const [selId, setSelId] = useState<string | null>(actividadAbierta)
  const [panelCerrado, setPanelCerrado] = useState(false)

  const subActual = sub ?? subLocal
  const ventanaActual = semanas ?? semanasLocal

  const rubros = useMemo(() => rubrosDe(actividades), [actividades])
  const nombresDeRubro = useMemo(() => rubros.map((r) => r.nombre), [rubros])
  const visibles = useMemo(() => aplicarFiltro(actividades, filtro), [actividades, filtro])

  // ═══ EL WORKSPACE ARRANCA PARTIDO ═══
  //
  // El objetivo se dibuja CON una actividad seleccionada y la pantalla arrancaba sin ninguna: se
  // entraba a una tabla ancha con un calendario al lado, y el panel —que es un tercio de lo que el
  // dueño pidió— sólo aparecía si adivinaba que había que tocar una fila. La elegida por defecto es
  // la primera CON FECHA: una sin fechas abre un panel que no puede mostrar el plan.
  const esEscritorio = useSyncExternalStore(suscribirAncho, () => window.matchMedia(MQ).matches, () => false)
  const primeraConFecha = useMemo(
    () => actividades.find((a) => a.inicio_plan && a.tipo !== 'resumen') ?? null,
    [actividades],
  )
  const seleccion = selId ?? (esEscritorio ? (primeraConFecha?.id ?? null) : null)

  /** Se reescribe SÓLO el parámetro que cambió: el resto de la query queda como estaba. */
  const irA = (clave: string, valor: string) => {
    const p = new URLSearchParams(params.toString())
    p.set(clave, valor)
    router.replace(`?${p.toString()}`, { scroll: false })
  }
  const cambiarSub = (v: SubVista) => { setSubLocal(v); irA('sub', v) }

  const resumen = resumenDelPlan(
    visibles, restricciones, (hoy ?? new Date()).toISOString().slice(0, 10), Number(ventanaActual),
  )

  return (
    <div className="flex min-h-0 flex-col">
      <BarraPlan
        rubros={rubros}
        personas={personas}
        filtro={filtro}
        alFiltrar={setFiltro}
        acciones={accionesPlan}
        sub={subActual}
        alCambiarSub={cambiarSub}
        detalleCerrado={subActual === 'gantt' && (panelCerrado || seleccion === null)}
        alAbrirDetalle={() => {
          setPanelCerrado(false)
          if (!seleccion) {
            const primera = primeraConFecha ?? actividades[0]
            if (primera) setSelId(primera.id)
          }
        }}
        escala={escala}
        alCambiarEscala={setEscala}
        // La distinción que antes cargaba el rótulo «Gantt»: lo CALCULADO desde la secuencia —el
        // camino crítico— vive en su pantalla, y desde acá se llega con un clic.
        extra={
          <Link href={hrefCronogramaCalculado(obraId)} data-testid="ir-camino-critico"
            className="hidden text-[12.5px] text-muted hover:text-ink md:inline">
            Camino crítico →
          </Link>
        }
        {...(acciones ? { sellar: <SellarLineaBase sellar={acciones.sellar} yaSellada={yaSellada} /> } : {})}
        {...(acciones
          ? { alta: <FormNuevaActividad personas={personas} crear={acciones.crear} rubros={nombresDeRubro} /> }
          : {})}
      />

      {/* CUÁNTO SE ESTÁ ESCONDIENDO. Un cronograma filtrado que parece completo es cómo se lee mal
          una obra: si hay recorte, se dice cuántas filas quedaron afuera. */}
      {hayFiltro(filtro) && (
        <p className="pb-2 text-[12px] text-muted" data-testid="aviso-filtro">
          Mostrando {visibles.filter((a) => a.tipo !== 'resumen').length} de{' '}
          {actividades.filter((a) => a.tipo !== 'resumen').length} actividades.
        </p>
      )}

      {subActual === 'gantt' && (
        // El workspace ocupa el alto que queda entre la barra de vista y la franja. No es `100vh`
        // entero: arriba viven el header global, el encabezado de la obra y sus dos barras.
        <div className="flex h-[70vh] min-h-[420px] flex-col lg:h-[calc(100vh-330px)]">
          <Gantt
            actividades={visibles}
            restricciones={restricciones}
            dependencias={dependencias}
            personas={personas}
            {...(acciones ? { acciones } : {})}
            {...(masivas ? { masivas } : {})}
            seleccionada={seleccion}
            alSeleccionar={(id) => { setSelId(id); setPanelCerrado(false) }}
            panelAbierto={!panelCerrado}
            alCerrarPanel={() => setPanelCerrado(true)}
            escala={escala}
            {...(hhPorActividad ? { hhPorActividad } : {})}
            {...(datosPorActividad ? { datosPorActividad } : {})}
            rubros={nombresDeRubro}
            obraId={obraId}
            {...(anchoTabla ? { anchoTablaInicial: anchoTabla } : {})}
            {...(anchoPanel ? { anchoPanelInicial: anchoPanel } : {})}
            {...(hoy ? { hoy } : {})}
          />
        </div>
      )}

      {subActual === 'gantt' && archivadas.length > 0 && restaurarActividad && (
        <details className="border-t border-line py-2" data-testid="actividades-archivadas">
          <summary className="cursor-pointer text-[12.5px] text-muted">
            {archivadas.length} actividad(es) archivadas
          </summary>
          <ul className="divide-y divide-[#EFEEEA]">
            {archivadas.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-[12.5px] text-muted">{a.nombre}</span>
                <BotonAccion accion={restaurarActividad} args={[a.id, false]} testid="restaurar-actividad">
                  Restaurar
                </BotonAccion>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* AL PIE Y NO ARRIBA: el plan es el trabajo y va primero. Estas cifras se leen al terminar de
          mirarlo, y salen de las MISMAS actividades que se acaban de dibujar —filtradas incluidas,
          porque una franja que cuenta lo que la pantalla no muestra contradice a la pantalla. */}
      <Franja testid="franja-obra" metricas={metricasDelPlan(resumen, Number(ventanaActual))} />
    </div>
  )
}
