'use client'

// 09 · LA LISTA DE HOY, CON SU BANDA — buscar y filtrar sin ir al servidor.
//
// ═══ QUÉ DEFECTO CIERRA (canónico 09) ═══
//
// La solapa dibujaba las cuatro cuadrillas enteras, una debajo de otra, sin una sola forma de
// preguntarle nada. La pregunta de las siete de la mañana —«¿quién no fichó?»— se contestaba
// leyendo treinta renglones y contando de memoria. El canónico pone sobre la lista una banda con el
// buscador y las pastillas con su cuenta, y eso es lo que hay acá.
//
// ═══ POR QUÉ ES DEL NAVEGADOR ═══
//
// Las filas ya viajaron enteras: filtrarlas es un `filter` en memoria. Un viaje al servidor por
// tecla no ahorraría nada y esta ruta es `force-dynamic` — cada viaje es un render completo de la
// ficha de obra. La regla de qué cae en cada filtro vive en `presenciaObra.ts`, probada, y no acá:
// una pastilla que cuenta con un criterio y una lista que filtra con otro dicen números distintos
// de la misma jornada.
//
// La banda es LA MISMA para la navegación y para los filtros (`background: surface-quiet`, hairline
// arriba y abajo, a sangre del marco de la página), como en el canónico: dos bandas apiladas le
// sacan 40px de alto a la lista que la persona vino a leer.

import { useMemo, useState, type ReactNode } from 'react'
import { Avatar } from '@/shared/components/Avatar'
import { PuntoActivo, RelojDeJornada } from '@/features/administracion/components/RelojDeJornada'
import { lecturaDePunto } from '@/features/administracion/services/presencia'
import { Buscador, Estado, Filtros, Vacio } from '@/shared/components/ds'
import {
  cuentasDeHoy, estadoDeFila, filtrarHoy, FILTROS_HOY,
  type FiltroHoy, type FilaHoy, type GrupoHoy,
} from '../services/presenciaObra'

const hora = (iso: string | null) =>
  (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : null)
const hh = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function ListaHoyEnObra({ grupos, horas, navegacion, accion, panel, kpis, fecha }: {
  grupos: GrupoHoy[]
  horas: Map<string, number>
  /** La banda de cinco cifras. Llega dibujada desde el servidor: es presentación pura y no tiene
   *  por qué recompilarse en el navegador para que la lista se pueda filtrar. */
  kpis?: ReactNode
  /** El día que se está mirando, dd/mm/aaaa. */
  fecha?: string
  /** Las sub-vistas de Personal. Van en la MISMA banda que los filtros, como en el canónico. */
  navegacion?: ReactNode
  /** La acción primaria de la pantalla — asignar a alguien a esta obra, abierta acá mismo. */
  accion?: ReactNode
  /** «Atención de hoy» y «Dotación por cuadrilla»: se leen en el servidor y se dibujan al costado. */
  panel?: ReactNode
}) {
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState<FiltroHoy>('todo')

  const cuentas = useMemo(() => cuentasDeHoy(grupos), [grupos])
  const visibles = useMemo(() => filtrarHoy(grupos, { texto, filtro }), [grupos, texto, filtro])
  const aLaVista = visibles.reduce((t, g) => t + g.filas.length, 0)

  return (
    <>
      {/* LA BANDA, A SANGRE (canónico 09): los márgenes negativos son los del marco de la ficha de
          obra —16px en el teléfono, 40px en escritorio—. Sin eso, la banda flota adentro del
          contenido y no se lee que gobierna la lista de abajo. */}
      <div
        className="-mx-4 mb-3 flex flex-wrap items-center gap-x-[14px] gap-y-2 border-y border-line bg-surface-quiet px-4 py-1.5 lg:-mx-10 lg:px-10"
        data-testid="banda-personal"
      >
        {navegacion}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Buscador
            value={texto} onChange={setTexto} placeholder="Buscar persona"
            variante="caja" testid="buscar-persona" className="w-[200px]"
          />
          <Filtros
            testid="filtros-personal"
            opciones={FILTROS_HOY.map((f) => ({
              label: (
                <>
                  {f.label}
                  {/* EL NÚMERO ES EL DE TODAS LAS FILAS, no el del filtro puesto: una pastilla que
                      se recalcula sola diría «Sin fichar 0» justo mientras se mira «En obra». */}
                  <span className={`font-mono text-[10.5px] tabular-nums ${
                    filtro === f.clave ? 'text-line-strong' : 'text-faint'}`}
                  >
                    {cuentas[f.clave]}
                  </span>
                </>
              ),
              activo: filtro === f.clave,
              onClick: () => setFiltro(f.clave),
              testid: `filtro-${f.clave}`,
            }))}
          />
          {accion}
        </div>
      </div>

      {/* EL DÍA, EN UNA LÍNEA Y SIN TÍTULO. «Hoy en obra» ya lo dice la sub-vista activa de la
          banda: repetirlo como encabezado es el mismo rótulo dos veces a 4px de distancia. */}
      {fecha && (
        <p className="mb-1.5 text-right font-mono text-[11.5px] text-faint tabular-nums" data-testid="fecha-hoy">
          {fecha}
        </p>
      )}
      {kpis}

      {visibles.length === 0
        ? (
          <Vacio>
            {cuentas.todo === 0
              ? 'Nadie tiene una asignación vigente ni marcó hoy en esta obra. Se asigna con «+ Asignar persona».'
              : 'Nada coincide con esta búsqueda.'}
          </Vacio>
          )
        : (
          // 340px es la medida del canónico para el panel lateral, y es la misma del panel de
          // detalle del sistema (`--os-split-min-panel`). Por debajo de `xl` el panel baja: dos
          // columnas de 300px cada una no dejan leer ni el nombre de la persona.
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            <div className="min-w-0 flex-1 overflow-hidden rounded-card border border-line bg-surface">
              {visibles.map((g) => <Grupo key={g.cuadrilla} grupo={g} horas={horas} />)}
              {aLaVista < cuentas.todo && (
                <p className="border-t border-surface-sunken px-3.5 py-2 text-[11px] text-faint" data-testid="cuenta-filtrada">
                  {aLaVista} de {cuentas.todo} personas a la vista
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-3 xl:w-[340px]">{panel}</div>
          </div>
          )}
    </>
  )
}

function Grupo({ grupo, horas }: { grupo: GrupoHoy; horas: Map<string, number> }) {
  const completa = grupo.asignados > 0 && grupo.presentes >= grupo.asignados
  const hhGrupo = grupo.filas.reduce((t, f) => t + (horas.get(f.personaId) ?? 0), 0)
  return (
    <div data-testid="grupo-cuadrilla" data-cuadrilla={grupo.cuadrilla}>
      <div className="flex items-center gap-2.5 border-y border-surface-sunken bg-surface-quiet px-3.5 py-2">
        <span className="truncate text-[12.5px] font-semibold text-ink">{grupo.cuadrilla}</span>
        <div className="ml-auto flex shrink-0 items-center gap-3.5">
          {/* «N de M» y no una barra: presentes sobre asignados es una fracción de gente, no un
              avance —y con 0 asignados no hay fracción que dibujar, hay alguien que fichó donde no
              debía. Las dos cuentas son las de la CUADRILLA, no las del filtro puesto. */}
          <span className={`font-mono text-[11.5px] tabular-nums ${completa ? 'text-pos' : 'text-muted'}`}>
            {grupo.asignados === 0 ? `${grupo.presentes} sin asignar` : `${grupo.presentes} de ${grupo.asignados}`}
          </span>
          <span className="font-mono text-[12px] text-ink-soft tabular-nums">
            {hhGrupo > 0 ? `${hh(hhGrupo)} HH` : <span className="text-faint">sin imputar</span>}
          </span>
        </div>
      </div>
      {grupo.filas.map((f) => <Fila key={f.personaId} fila={f} horas={horas} />)}
    </div>
  )
}

// LAS COLUMNAS SON LAS DEL CANÓNICO, con una diferencia declarada: donde la maqueta pone una flecha
// de «mover de frente» acá no hay nada. Mover a alguien de cuadrilla se hace en la tabla de
// asignaciones de abajo, y un botón que no escribe es peor que ningún botón.
const COLS = 'minmax(0,1.4fr) minmax(0,1fr) 132px 60px 64px'

function Fila({ fila, horas }: { fila: FilaHoy; horas: Map<string, number> }) {
  const e = estadoDeFila(fila)
  const activo = fila.marca?.estado === 'activo'
  const punto = lecturaDePunto(fila.marca ?? { lat: null, lon: null, precision_m: null })
  const suyas = horas.get(fila.personaId)
  return (
    <div
      className={`grid h-fila items-center gap-2.5 border-b border-surface-sunken px-3.5 last:border-b-0 ${
        fila.asignado ? '' : 'border-l-[3px] border-l-warn'
      }`}
      style={{ gridTemplateColumns: COLS }}
      data-testid="fila-presencia-obra"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {/* EL PUNTO VA PEGADO AL AVATAR y no en una columna propia: el canónico gasta el ancho en
            el nombre, y el estado de la jornada es un atributo de la persona, no una columna. */}
        <span className="flex w-2 shrink-0 justify-center">
          {activo ? <PuntoActivo /> : <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-line-strong" />}
        </span>
        <Avatar nombre={fila.nombre} url={null} lado={24} />
        <span className="truncate text-[12.5px] text-ink">{fila.nombre}</span>
      </div>
      <span className="truncate text-[12px] text-muted">
        {fila.rol ?? <span className="text-faint">sin categoría</span>}
      </span>
      <span className="min-w-0">
        <Estado tono={e.tono} clave={e.texto}>{e.texto}</Estado>
        {/* La ubicación sólo habla cuando tiene algo que decir: un punto fiable no gasta una línea. */}
        {fila.marca && !punto.fiable && punto.hay && (
          <span className="block truncate text-[10.5px] text-warn">{punto.texto}</span>
        )}
      </span>
      <span className="text-right font-mono text-[11.5px] text-ink-soft tabular-nums">
        {hora(fila.marca?.entrada ?? null) ?? <span className="text-faint">—</span>}
      </span>
      <span className="text-right">
        {activo
          ? <RelojDeJornada entrada={fila.marca!.entrada} />
          : (
            <span className={`font-mono text-[11.5px] tabular-nums ${suyas == null ? 'text-faint' : 'text-ink-soft'}`}>
              {suyas == null ? '—' : hh(suyas)}
            </span>
            )}
      </span>
    </div>
  )
}
