import Link from 'next/link'
import { Aviso, BotonEnlace } from '@/shared/components/ds'
import { BuscadorURL } from '@/shared/components/ds/BuscadorURL'
import { PieDeAccion } from '@/features/jefe/components/ShellJefe'
import {
  Barra, Encabezado, Nada, Panel, Rotulo,
} from '@/features/jefe/components/Piezas'
import { SinObra } from '@/features/jefe/components/SinObra'
import { contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import { getActividades, getArbol } from '@/features/jefe/services/jefeService'
import { frentePorTarea } from '@/features/jefe/services/frentes'
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
      <Encabezado titulo="Tareas" sub={`${obra.nombre} · ${total} en la obra`} />

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

      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        {FILTROS.map((f) => {
          const activo = f === filtro
          return (
            <Link
              key={f}
              href={conObra('/obra/tareas', obra.id, { filtro: f, q })}
              data-testid={`filtro-${f}`}
              aria-current={activo ? 'true' : undefined}
              className={`flex h-[44px] shrink-0 items-center rounded-[10px] border px-3.5 text-[13.5px] ${
                activo ? 'border-marca bg-marca-soft font-semibold text-ink' : 'border-surface bg-surface text-ink'
              }`}
            >
              {FILTRO_LABEL[f]}
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
            <div key={g.clave}>
              <Rotulo extra={`${g.tareas.length} ${g.tareas.length === 1 ? 'tarea' : 'tareas'}`}>
                {g.nombre.toUpperCase()}
              </Rotulo>
              <div className="flex flex-col gap-2.5">
                {g.tareas.map((t) => {
                  const d = detalleDeTarea(t, hoy)
                  return (
                    <Link
                      key={t.actividad_id}
                      href={conObra('/obra/avance', obra.id, { actividad: t.actividad_id })}
                      data-testid="tarea"
                      className={`block rounded-[15px] bg-surface px-[17px] py-[15px] active:bg-surface-quiet ${
                        t.impedimentos_abiertos > 0 ? 'shadow-[inset_3px_0_0_var(--os-neg)]' : ''
                      }`}
                    >
                      <div className="mb-2.5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[15.5px] font-semibold leading-tight text-ink">{t.nombre}</div>
                          <div className={`mt-1 text-[12.5px] ${
                            d.tono === 'neg' ? 'text-neg' : d.tono === 'warn' ? 'text-warn' : 'text-muted'
                          }`}>
                            {d.texto}
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[20px] font-semibold tabular-nums text-ink">
                          {t.avance_pct == null ? '—' : `${t.avance_pct} %`}
                        </span>
                      </div>
                      <Barra
                        pct={t.avance_pct}
                        tono={t.avance_pct === 100 ? 'pos' : t.impedimentos_abiertos > 0 ? 'warn' : 'ink'}
                      />
                      {/* CÓMO SE MIDIÓ VA PEGADO AL NÚMERO. Un 74 % calculado desde producción y uno
                          tipeado a mano no valen lo mismo, y sin esto se leen igual. */}
                      <div className="mt-2.5 text-[12px] text-faint">
                        {t.origen_avance ? `medido por ${t.origen_avance}` : 'sin método de medición'}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
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
