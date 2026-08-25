import Link from 'next/link'
import { avanceAgregado } from '@/features/obras/services/avance'
import { SinObra } from '@/features/jefe/components/SinObra'
import { C, R, pct } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import {
  AvisoError, BotonTopBar, FranjaFiltros, Pastilla, TarjetaLista, TopBarDetalle, Vacio, mono,
} from '@/shared/components/movil/Piezas'
import { contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import { getActividades, getArbol } from '@/features/jefe/services/jefeService'
import type { ActividadDelJefe } from '@/features/jefe/services/jefeService'
import { frentePorTarea } from '@/features/jefe/services/frentes'
import { aspectoDeTarea } from '@/features/jefe/services/aspecto'
import { conObra } from '@/features/jefe/services/navegacion'
import {
  FILTROS, FILTRO_LABEL, agruparPorFrente, detalleDeTarea, filtrar, filtroDe,
} from '@/features/jefe/services/tareas'

// J02 · TAREAS — porte literal de `J02 · Jefe Tareas.dc.html`.
//
// ═══ EL ESTADO VIVE EN LA URL, Y POR ESO NO HAY JAVASCRIPT ACÁ ═══
//
// Búsqueda, filtro y el propio despliegue del buscador son parámetros. La consecuencia práctica en
// obra: la pantalla se puede compartir por WhatsApp («mirá las atrasadas del galpón 2») y llega al
// otro tal cual, y el gesto de atrás del teléfono deshace el filtro en vez de salirse.
//
// La lupa del mockup ABRE Y CIERRA el campo (`toggleBuscar`), y eso también es un parámetro: sin
// nada buscado el campo no ocupa los 46px que en 390px son media tarjeta.
//
// ═══ CONFLICTO DECLARADO CON EL MOCKUP: EL AGRUPAMIENTO ═══
//
// El `.dc.html` agrupa por RUBRO («Fundaciones», «Elevación») y pone el frente en cada renglón. Acá
// se agrupa por FRENTE. No es una licencia estética: `obra_actividad_control.rubro` sale de
// `codigo_padre`, que es el rastro del tracker del que se importó la obra, y en san-francisco NO
// coincide con el árbol. Agrupar por rubro ya produjo una vez que la misma tarea apareciera bajo
// «GALPÓN 4» en una pantalla y bajo «Sin frente» en la de al lado —el porqué completo está en
// `frentes.ts`—. Como el grupo ES el frente, el renglón no lo repite.

export const dynamic = 'force-dynamic'

export default async function JefeTareasPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string; q?: string; filtro?: string; buscar?: string }>
}) {
  const { obra: pedida, q = '', filtro: filtroPedido, buscar } = await searchParams
  const { supabase, obra, error } = await contextoDeObra(pedida)
  if (!obra) return <SinObra error={error} />

  const hoy = hoyEnObra()
  const filtro = filtroDe(filtroPedido)
  const buscando = buscar === '1' || q.trim() !== ''
  const [actividades, arbol] = await Promise.all([
    getActividades(supabase, obra.id),
    getArbol(supabase, obra.id),
  ])
  const frentes = frentePorTarea(arbol.data ?? [])
  const encontradas = filtrar(actividades.data ?? [], q, filtro, hoy)
  const grupos = agruparPorFrente(encontradas, frentes)
  const total = filtrar(actividades.data ?? [], '', 'todas', hoy).length
  const primerError = error ?? actividades.error ?? arbol.error ?? null

  return (
    <>
      <TopBarDetalle
        titulo="Tareas de la obra"
        sub={`${obra.nombre} · ${total} actividades`}
        accion={
          <BotonTopBar
            titulo={buscando ? 'Cerrar la búsqueda' : 'Buscar'}
            testid="alternar-buscar"
            color={buscando ? C.ink : C.muted}
            href={buscando
              ? conObra('/obra/tareas', obra.id, { filtro })
              : conObra('/obra/tareas', obra.id, { filtro, buscar: '1' })}
          >
            <Icono nombre="buscar" tamano={20} />
          </BotonTopBar>
        }
        extra={buscando ? (
          <form
            action="/obra/tareas"
            method="get"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${C.lineaFuerte}`,
              borderRadius: R.controlChico, padding: '9px 11px', marginTop: 8, marginBottom: 4,
            }}
          >
            <input type="hidden" name="obra" value={obra.id} />
            <input type="hidden" name="filtro" value={filtro} />
            <input type="hidden" name="buscar" value="1" />
            <span style={{ display: 'flex', color: C.faint }}><Icono nombre="buscar" tamano={16} /></span>
            <input
              type="text"
              name="q"
              defaultValue={q}
              data-testid="buscar-tarea"
              placeholder="Buscar actividad o frente"
              style={{
                border: 'none', background: 'transparent', fontSize: 14, color: C.ink,
                width: '100%', padding: 0, outline: 'none', fontFamily: 'inherit',
              }}
            />
            {q.trim() !== '' && (
              <Link
                href={conObra('/obra/tareas', obra.id, { filtro, buscar: '1' })}
                aria-label="Limpiar la búsqueda"
                data-testid="limpiar-busqueda"
                style={{ display: 'flex', color: C.faint, padding: 4 }}
              >
                <Icono nombre="cerrar" tamano={16} />
              </Link>
            )}
          </form>
        ) : undefined}
      />

      <FranjaFiltros testid="filtros-tareas">
        {FILTROS.map((f) => (
          <Pastilla
            key={f}
            testid={`filtro-${f}`}
            href={conObra('/obra/tareas', obra.id, { filtro: f, q, buscar: buscando ? '1' : '' })}
            texto={FILTRO_LABEL[f]}
            cuenta={filtrar(actividades.data ?? [], q, f, hoy).length}
            activa={f === filtro}
          />
        ))}
      </FranjaFiltros>

      <div style={{ padding: '14px 16px 24px' }}>
        {primerError && <AvisoError testid="jefe-tareas-error">{primerError}</AvisoError>}

        {grupos.length === 0 ? (
          <Vacio testid="jefe-tareas-vacio">
            {q.trim()
              ? <>Nada coincide con «{q.trim()}». <Link href={conObra('/obra/tareas', obra.id)} style={{ color: C.ink, fontWeight: 600 }}>Ver todo</Link></>
              : total === 0
                ? 'Esta obra todavía no tiene tareas cargadas. Se arman desde la planificación de la obra.'
                : <>Ninguna entra en este filtro. <Link href={conObra('/obra/tareas', obra.id)} style={{ color: C.ink, fontWeight: 600 }}>Ver todo</Link></>}
          </Vacio>
        ) : grupos.map((g) => (
          <Grupo key={g.clave} nombre={g.nombre} tareas={g.tareas} obraId={obra.id} hoy={hoy} />
        ))}
      </div>
    </>
  )
}

/**
 * UN RUBRO PLEGABLE, SIN UNA LÍNEA DE JAVASCRIPT.
 *
 * `<details>` cierra el grupo con el pulgar y sobrevive a la navegación del servidor. Un estado de
 * apertura en React habría convertido toda la lista en un componente de cliente para conservar algo
 * que el navegador ya sabe hacer solo. El chevron gira con `group-open:` — es la misma rotación de
 * 90° que el mockup calcula en `g.rot`.
 *
 * El porcentaje NO se promedia acá: sale de `avanceAgregado`, la misma regla ponderada que usan
 * J01, J03 y J06. Un frente que dice 48 % en una pantalla y 52 % en la de al lado destruye la
 * confianza en las dos.
 */
function Grupo({ nombre, tareas, obraId, hoy }: {
  nombre: string
  tareas: ActividadDelJefe[]
  obraId: string
  hoy: string
}) {
  const { pct: avance } = avanceAgregado(tareas)
  return (
    <details open className="group" data-testid="grupo-frente" style={{ marginBottom: 16 }}>
      <summary
        className="list-none [&::-webkit-details-marker]:hidden"
        style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '8px 2px', minHeight: 44, cursor: 'pointer',
        }}
      >
        <span style={{ display: 'flex', color: C.faint, flexShrink: 0 }}>
          <svg
            aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round"
            className="transition-transform group-open:rotate-90"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nombre}
        </div>
        <span style={{ ...mono, marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: C.ink, flexShrink: 0 }}>
          {avance == null ? '—' : pct(avance)}
        </span>
      </summary>
      <TarjetaLista>
        {tareas.map((t) => <FilaDeTarea key={t.actividad_id} t={t} obraId={obraId} hoy={hoy} />)}
      </TarjetaLista>
    </details>
  )
}

function FilaDeTarea({ t, obraId, hoy }: { t: ActividadDelJefe; obraId: string; hoy: string }) {
  const a = aspectoDeTarea(t)
  const d = detalleDeTarea(t, hoy)
  const colorPlazo = t.fin_plan == null ? C.warn : d.tono === 'neg' ? C.neg : d.tono === 'warn' ? C.warn : C.muted
  return (
    <Link
      href={conObra('/obra/avance', obraId, { actividad: t.actividad_id })}
      data-testid="tarea"
      style={{
        display: 'block', padding: '12px 14px', borderBottom: `1px solid ${C.divisor}`,
        minHeight: 56, color: C.ink,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span title={a.titulo} style={{ display: 'flex', color: a.color, flexShrink: 0, marginTop: 2 }}>
          <Icono nombre={a.icono} tamano={18} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.35 }}>{t.nombre}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: C.muted }}>
              {t.cuadrilla_prevista ?? 'sin asignar'}
            </span>
            <span style={{ color: C.lineaFuerte }}>·</span>
            <span style={{ ...mono, fontSize: 11.5, color: colorPlazo }}>
              {t.fin_plan ? `${t.fin_plan.slice(8, 10)}/${t.fin_plan.slice(5, 7)}` : 'sin plan'}
            </span>
          </div>
        </div>
        <span style={{ ...mono, fontSize: 14, fontWeight: 600, color: a.colorValor, flexShrink: 0 }}>
          {t.avance_pct == null ? '—' : pct(t.avance_pct)}
        </span>
      </div>
      <div style={{ height: 5, background: C.pista, borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
        {t.avance_pct != null && (
          <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, t.avance_pct))}%`, background: a.barra }} />
        )}
      </div>
    </Link>
  )
}
