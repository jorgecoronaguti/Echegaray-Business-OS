import Link from 'next/link'
import { Aviso, BotonEnlace } from '@/shared/components/ds'
import { BuscadorURL } from '@/shared/components/ds/BuscadorURL'
import { avanceAgregado } from '@/features/obras/services/avance'
import { PieDeAccion } from '@/features/jefe/components/ShellJefe'
import { Barra, Encabezado, Nada, Panel, porcentaje } from '@/features/jefe/components/Piezas'
import { SinObra } from '@/features/jefe/components/SinObra'
import { contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import { getActividades, getArbol } from '@/features/jefe/services/jefeService'
import type { ActividadDelJefe } from '@/features/jefe/services/jefeService'
import { frentePorTarea } from '@/features/jefe/services/frentes'
import { estaTerminada } from '@/features/jefe/services/dia'
import { conObra } from '@/features/jefe/services/navegacion'
import {
  FILTROS, FILTRO_LABEL, agruparPorFrente, detalleDeTarea, filtrar, filtroDe,
} from '@/features/jefe/services/tareas'

// J02 · TAREAS — toda la obra, buscable, agrupada por frente.
//
// ═══ EL ESTADO VIVE EN LA URL, Y POR ESO NO HAY JAVASCRIPT ACÁ ═══
//
// Búsqueda y filtro son parámetros. La consecuencia práctica en obra: la pantalla se puede compartir
// por WhatsApp («mirá las atrasadas del galpón 2») y llega al otro tal cual, y volver atrás con el
// gesto del teléfono deshace el filtro en vez de salirse de la pantalla.
//
// El buscador es un `<form>` que envía con el enter del teclado. Buscar mientras se teclea obligaría
// a un componente de cliente que vuelve a pedir en cada letra: con guante, parado, y con la señal de
// una obra, un envío explícito es más rápido que seis consultas a medio escribir.

export const dynamic = 'force-dynamic'

export default async function JefeTareasPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string; q?: string; filtro?: string }>
}) {
  const { obra: pedida, q = '', filtro: filtroPedido } = await searchParams
  const { supabase, obra, error } = await contextoDeObra(pedida)
  if (!obra) return <SinObra error={error} />

  const hoy = hoyEnObra()
  const filtro = filtroDe(filtroPedido)
  const [actividades, arbol] = await Promise.all([
    getActividades(supabase, obra.id),
    getArbol(supabase, obra.id),
  ])
  const frentes = frentePorTarea(arbol.data ?? [])
  const encontradas = filtrar(actividades.data ?? [], q, filtro, hoy)
  const grupos = agruparPorFrente(encontradas, frentes)
  const total = filtrar(actividades.data ?? [], '', 'todas', hoy).length

  return (
    <>
      <Encabezado titulo="Tareas de la obra" sub={`${obra.nombre} · ${total} actividades`} />

      {/* EL BUSCADOR ES EL DEL SISTEMA, y filtra al teclear. El contrato lo dice literal —«sin
          Enter ni botón Buscar»— y `BuscadorURL` ya lo resuelve para toda la aplicación: deja el
          filtro en la URL, se comparte, vuelve con el botón de atrás y sigue funcionando sin
          JavaScript. Escribir acá un `form` GET propio habría sido el cuarto comportamiento
          distinto de la misma lupa. */}
      <div className="px-4 pb-3">
        <BuscadorURL
          accion="/obra/tareas"
          q={q}
          placeholder="Buscar tarea"
          oculto={{ obra: obra.id, filtro }}
          ancho="w-full"
          testid="buscar-tarea"
        />
      </div>

      {/* EL CHIP DICE CUÁNTAS TIENE. Sin el contador el jefe toca «Con problema» para descubrir que
          no hay ninguna, y en 390px cada toque que no informa nada cuesta una pantalla entera. El
          conteo respeta la búsqueda: es sobre lo que está mirando, no sobre la obra entera. */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        {FILTROS.map((f) => {
          const activo = f === filtro
          const n = filtrar(actividades.data ?? [], q, f, hoy).length
          return (
            <Link
              key={f}
              href={conObra('/obra/tareas', obra.id, { filtro: f, q })}
              data-testid={`filtro-${f}`}
              aria-current={activo ? 'true' : undefined}
              // LA PASTILLA ELEGIDA ES GRAFITO. J02, J04 y J05 la dibujan igual: `#30302F` con
              // texto blanco y radio completo. El amarillo queda para la acción que escribe.
              className={`flex h-[44px] shrink-0 items-center gap-2 rounded-[999px] border px-4 text-[13.5px] ${
                activo ? 'border-accent bg-accent font-semibold text-white' : 'border-line bg-surface text-ink'
              }`}
            >
              {FILTRO_LABEL[f]}
              <span className={`font-mono text-[12px] tabular-nums ${activo ? 'text-white/70' : 'text-faint'}`}>
                {n}
              </span>
            </Link>
          )
        })}
      </div>

      <div className="flex flex-col gap-4 px-4 pb-6">
        {(error ?? actividades.error ?? arbol.error) && (
          <Aviso tono="neg" titulo="No se pudieron leer las tareas." testid="jefe-tareas-error">
            {error ?? actividades.error ?? arbol.error}
          </Aviso>
        )}

        {grupos.length === 0 ? (
          <Panel testid="jefe-tareas-vacio">
            <Nada>
              {q.trim()
                ? `Nada coincide con «${q.trim()}» en esta obra con el filtro ${FILTRO_LABEL[filtro].toLowerCase()}.`
                : total === 0
                  ? 'Esta obra todavía no tiene tareas cargadas. Se arman desde la planificación de la obra.'
                  : `Ninguna tarea de esta obra entra en el filtro ${FILTRO_LABEL[filtro].toLowerCase()}.`}
            </Nada>
          </Panel>
        ) : (
          grupos.map((g) => (
            <GrupoDeFrente key={g.clave} nombre={g.nombre} tareas={g.tareas} obraId={obra.id} hoy={hoy} />
          ))
        )}
      </div>

      <PieDeAccion sobreBarra>
        <BotonEnlace
          href={conObra('/obra/avance-masivo', obra.id)}
          variante="primaria"
          tamano="bloque"
          data-testid="cargar-avance-del-dia"
        >
          Cargar avance del día
        </BotonEnlace>
      </PieDeAccion>
    </>
  )
}

/**
 * UN FRENTE PLEGABLE, SIN UNA LÍNEA DE JAVASCRIPT.
 *
 * `<details>` cierra el rubro con el pulgar y sobrevive a la navegación del servidor. Un estado de
 * apertura en React habría convertido toda la lista en un componente de cliente para conservar algo
 * que el navegador ya sabe hacer solo.
 *
 * El porcentaje del frente NO se promedia acá: sale de `avanceAgregado`, la misma regla ponderada
 * que usan J01, J03 y J06. Un frente que dice 48 % en una pantalla y 52 % en la de al lado destruye
 * la confianza en las dos.
 */
function GrupoDeFrente({
  nombre, tareas, obraId, hoy,
}: {
  nombre: string
  tareas: ActividadDelJefe[]
  obraId: string
  hoy: string
}) {
  const { pct } = avanceAgregado(tareas)
  return (
    <details open data-testid="grupo-frente">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-1 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-[13px] text-faint transition-transform">▾</span>
        <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink">{nombre}</span>
        <span className="font-mono text-[12px] tabular-nums text-faint">{tareas.length}</span>
        <span className="font-mono text-[14.5px] font-semibold tabular-nums text-ink">
          {pct == null ? '—' : porcentaje(pct)}
        </span>
      </summary>
      <Panel>
        {tareas.map((t) => <FilaDeTarea key={t.actividad_id} t={t} obraId={obraId} hoy={hoy} />)}
      </Panel>
    </details>
  )
}

function FilaDeTarea({ t, obraId, hoy }: { t: ActividadDelJefe; obraId: string; hoy: string }) {
  const d = detalleDeTarea(t, hoy)
  return (
    <Link
      href={conObra('/obra/avance', obraId, { actividad: t.actividad_id })}
      data-testid="tarea"
      className={`block min-h-[64px] border-t border-surface-sunken px-[17px] py-3 first:border-t-0 active:bg-surface-quiet ${
        t.impedimentos_abiertos > 0 ? 'shadow-[inset_3px_0_0_var(--os-neg)]' : ''
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14.5px] font-medium leading-tight text-ink">{t.nombre}</div>
          <div className={`mt-1 text-[12px] ${
            d.tono === 'neg' ? 'text-neg' : d.tono === 'warn' ? 'text-warn' : 'text-muted'
          }`}>
            {/* CÓMO SE MIDIÓ VA PEGADO AL NÚMERO: un 74 % calculado desde producción y uno tipeado
                a mano no valen lo mismo, y sin esto se leen igual. Antes ocupaba un tercer renglón
                por tarea; en una lista de 89 eran 89 renglones para decir casi siempre lo mismo. */}
            {d.texto}
            {t.origen_avance ? ` · por ${t.origen_avance}` : ''}
          </div>
        </div>
        <span className="shrink-0 font-mono text-[17px] font-semibold tabular-nums text-ink">
          {t.avance_pct == null ? '—' : `${t.avance_pct} %`}
        </span>
      </div>
      <Barra
        pct={t.avance_pct}
        tono={estaTerminada(t) ? 'pos' : t.impedimentos_abiertos > 0 ? 'warn' : 'ink'}
      />
    </Link>
  )
}
