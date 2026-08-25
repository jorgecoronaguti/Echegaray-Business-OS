import { SinObra } from '@/features/jefe/components/SinObra'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import {
  AvisoError, FranjaFiltros, Pastilla, TarjetaLista, TopBarDetalle, Vacio, mono,
} from '@/shared/components/movil/Piezas'
import { ZONA_OBRA, contextoDeObra, hoyEnObra } from '@/features/jefe/services/contexto'
import { getHHDelDia } from '@/features/jefe/services/jefeService'
import {
  SIN_CUADRILLA, iniciales, motivoSinMarca, porCuadrilla, resumenDelDia,
} from '@/features/jefe/services/personas'
import { conObra } from '@/features/jefe/services/navegacion'
import {
  FILTROS_PERSONAS, FILTRO_PERSONAS_LABEL, conteoPersonas, muestraFichados, muestraSinFichar,
  vacioPorFiltro,
} from '@/features/jefe/services/personasFiltro'
import type { FiltroPersonas } from '@/features/jefe/services/personasFiltro'
import { getEsperados, getPresencia } from '@/features/administracion/services/presenciaService'
import { agrupar, lecturaDePunto, mapa } from '@/features/administracion/services/presencia'
import { RelojDeJornada } from '@/features/administracion/components/RelojDeJornada'

// J05 · QUIÉN ESTÁ HOY — porte literal de `J05 · Jefe Personas.dc.html`.
//
// ═══ LO QUE ESTA PANTALLA NO HACE ═══
//
// No acusa a nadie. «Sin registrar» NO es «ausente»: un operario sin teléfono, uno que no le dio
// permiso al GPS y uno que faltó se ven exactamente igual desde acá. La falta la declara una
// persona, en Administración, donde eso sí es una novedad de liquidación. Por eso el mockup tiene
// una pastilla «Ausentes» y esta pantalla no: el dato que la llenaría no existe.
//
// ═══ «4 DE 5» ES PRESENTES SOBRE ESPERADOS, NO SOBRE UN TOPE ═══
//
// El mockup lo lee como dotación contra el tope del frente. El tope no existe en el modelo —ninguna
// tabla declara cuánta gente entra en un frente— pero el DENOMINADOR que el jefe necesita sí: la
// gente de esa cuadrilla asignada a la obra. La línea de abajo dice cuántos de esa cuadrilla
// todavía no tienen marca, que es la acción que queda, y nunca «entran N más».
//
// ═══ FUERA DE RADIO NO SE PUEDE CALCULAR TODAVÍA ═══
//
// La marca guarda lat/lon/precisión, pero la obra no tiene obrador ni radio: sin centro no hay
// distancia, y una pastilla «fuera de radio» contra un centro inventado sería una acusación
// fabricada. Se publica lo que sí es un hecho: si el punto es fiable, con el enlace al mapa.

export const dynamic = 'force-dynamic'

export default async function JefePersonasPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string; ver?: string }>
}) {
  const { obra: pedida, ver } = await searchParams
  const { supabase, obra, error } = await contextoDeObra(pedida)
  if (!obra) return <SinObra error={error} />

  // Los tres chips y sus cuentas salen de `personasFiltro.ts`, que es donde vive la regla de por
  // qué NO hay un chip «Ausentes» — y esa regla tiene su test.
  const vista: FiltroPersonas = FILTROS_PERSONAS.includes(ver as FiltroPersonas)
    ? (ver as FiltroPersonas) : 'todos'
  const hoy = hoyEnObra()
  const [presencia, esperados, hh] = await Promise.all([
    getPresencia(supabase, hoy, obra.id),
    getEsperados(supabase, obra.id),
    getHHDelDia(supabase, obra.id, hoy),
  ])

  const grupos = agrupar(presencia.data ?? [], esperados.data ?? [])
  const r = resumenDelDia(grupos, esperados.data ?? [])
  const cuadrillas = porCuadrilla(grupos.enObra, esperados.data ?? [])
  const hhPorPersona = new Map<string, number>()
  for (const x of hh.data ?? []) hhPorPersona.set(x.persona_id, (hhPorPersona.get(x.persona_id) ?? 0) + x.horas)
  const esperadosPorCuadrilla = new Map<string, number>()
  for (const e of esperados.data ?? []) {
    const c = e.cuadrilla?.trim() || SIN_CUADRILLA
    esperadosPorCuadrilla.set(c, (esperadosPorCuadrilla.get(c) ?? 0) + 1)
  }
  const primerError = error ?? presencia.error ?? esperados.error ?? hh.error ?? null

  const cuenta = conteoPersonas(r.enObra, r.sinRegistrar)
  const vacioDelFiltro = vacioPorFiltro(vista, r.enObra, r.sinRegistrar)

  return (
    <>
      <TopBarDetalle
        titulo="Quién está hoy"
        sub={`${r.asignados === 0 ? `${r.enObra} ${r.enObra === 1 ? 'marca' : 'marcas'}` : `${r.enObra} de ${r.asignados} fichados`}`
          + `${cuadrillas.length > 0 ? ` · ${cuadrillas.length} ${cuadrillas.length === 1 ? 'cuadrilla' : 'cuadrillas'}` : ''}`}
      />

      <FranjaFiltros testid="filtros-personas">
        {FILTROS_PERSONAS.map((v) => (
          <Pastilla
            key={v}
            testid={`ver-${v}`}
            href={conObra('/obra/personas', obra.id, { ver: v })}
            texto={FILTRO_PERSONAS_LABEL[v]}
            cuenta={cuenta[v]}
            activa={v === vista}
          />
        ))}
      </FranjaFiltros>

      <div style={{ padding: '14px 16px 24px' }}>
        {primerError && <AvisoError testid="jefe-personas-error">{primerError}</AvisoError>}

        {r.sinCerrar > 0 && (
          <div
            data-testid="sin-cerrar"
            style={{
              background: C.warnFondo, border: `1px solid ${C.warnBorde}`, borderRadius: R.tarjeta,
              padding: '12px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center',
            }}
          >
            <span style={{ display: 'flex', color: C.warn, flexShrink: 0 }}><Icono nombre="alerta" tamano={18} /></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                {r.sinCerrar} sin cerrar la jornada
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>
                Marcaron entrada y no salida: el reloj corre hasta que se cierre.
              </div>
            </div>
          </div>
        )}

        {vacioDelFiltro && (
          <Vacio testid="vacio-por-filtro">
            Nadie entra en este filtro hoy. Tocá otro chip para ver el resto.
          </Vacio>
        )}

        {muestraFichados(vista) && (cuadrillas.length === 0 ? (
          <Vacio testid="jefe-personas-vacio">
            Nadie marcó hoy. La marca la hace cada persona desde su teléfono, en Asistencia.
          </Vacio>
        ) : cuadrillas.map((c) => {
          const previstos = esperadosPorCuadrilla.get(c.nombre) ?? null
          const faltan = previstos == null ? null : previstos - c.presentes.length
          return (
            <div key={c.clave} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                <span style={{ display: 'flex', color: C.muted }}><Icono nombre="cuadrilla" tamano={16} /></span>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{c.nombre}</div>
                <span style={{ ...mono, marginLeft: 'auto', fontSize: 12.5, color: faltan ? C.warn : C.muted }}>
                  {previstos == null
                    ? `${c.presentes.length} ${c.presentes.length === 1 ? 'persona' : 'personas'}`
                    : `${c.presentes.length} de ${previstos}`}
                </span>
              </div>
              <TarjetaLista testid="cuadrilla">
                {c.presentes.map((p) => {
                  const punto = lecturaDePunto(p)
                  const enlace = mapa(p.lat, p.lon)
                  const horas = hhPorPersona.get(p.persona_id)
                  return (
                    <div
                      key={p.persona_id}
                      data-testid="persona-en-obra"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px',
                        borderBottom: `1px solid ${C.divisor}`, minHeight: 56,
                      }}
                    >
                      <span style={{
                        width: 36, height: 36, borderRadius: 18, background: C.posFondo, color: C.pos,
                        fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0,
                      }}>
                        {iniciales(p.nombre_completo)}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.nombre_completo}
                        </div>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, marginTop: 1,
                          color: p.entrada ? C.pos : C.faint,
                        }}>
                          <Icono nombre={p.entrada ? 'ok' : 'reloj'} tamano={13} />
                          {p.entrada ? `fichado ${hora(p.entrada)}` : 'sin hora de entrada'}
                          {!punto.fiable && <span style={{ color: C.warn }}> · {punto.texto}</span>}
                        </div>
                      </div>
                      <span style={{ textAlign: 'right', flexShrink: 0 }}>
                        <RelojDeJornada entrada={p.entrada} />
                        {/* HH NO ES PRESENCIA. El reloj dice cuánto hace que está; las HH, cuánto se
                            imputó a una tarea. Sin imputar no es cero: nadie cargó todavía. */}
                        <span style={{ ...mono, display: 'block', fontSize: 11, color: C.faint }}>
                          {horas == null ? 'sin imputar' : `${n1(horas)} HH`}
                        </span>
                      </span>
                      {enlace && (
                        <a
                          href={enlace}
                          target="_blank"
                          rel="noreferrer"
                          data-testid="ver-ubicacion"
                          aria-label={`Ver en el mapa dónde marcó ${p.nombre_completo}`}
                          style={{
                            width: 44, height: 44, marginRight: -9, borderRadius: 22, display: 'flex',
                            alignItems: 'center', justifyContent: 'center', color: C.muted, flexShrink: 0,
                          }}
                        >
                          <Icono nombre="pin" tamano={20} />
                        </a>
                      )}
                    </div>
                  )
                })}
              </TarjetaLista>
              {faltan != null && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, fontSize: 11.5,
                  color: faltan > 0 ? C.warn : C.pos,
                }}>
                  <Icono nombre={faltan > 0 ? 'alerta' : 'ok'} tamano={14} />
                  {faltan > 0
                    ? `Faltan ${faltan} de esta cuadrilla sin marca`
                    : 'Toda la cuadrilla marcó'}
                </div>
              )}
            </div>
          )
        }))}

        {muestraSinFichar(vista) && grupos.sinRegistrar.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <span style={{ display: 'flex', color: C.warn }}><Icono nombre="reloj" tamano={16} /></span>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Sin registrar</div>
              <span style={{ ...mono, marginLeft: 'auto', fontSize: 12.5, color: C.warn }}>
                {grupos.sinRegistrar.length}
              </span>
            </div>
            <TarjetaLista testid="sin-registrar" borde={C.warnBorde}>
              {grupos.sinRegistrar.map((e) => (
                <div
                  key={e.id}
                  data-testid="persona-sin-marca"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px',
                    borderBottom: `1px solid ${C.divisor}`, minHeight: 56,
                  }}
                >
                  <span style={{
                    width: 36, height: 36, borderRadius: 18, background: C.inerte, color: C.inkSuave,
                    fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0,
                  }}>
                    {iniciales(e.nombre_completo)}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.nombre_completo}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.warn, marginTop: 1 }}>
                      <Icono nombre="reloj" tamano={13} />
                      {motivoSinMarca(e)}
                    </div>
                  </div>
                  <span style={{ ...mono, fontSize: 13.5, fontWeight: 600, color: C.faint, flexShrink: 0 }}>—</span>
                </div>
              ))}
            </TarjetaLista>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, fontSize: 11.5, color: C.muted }}>
              <Icono nombre="info" tamano={14} />
              Sin marca no es ausente. La falta se declara en Personal.
            </div>
          </div>
        )}
      </div>

      {/* EL PIE DEL MOCKUP, CON SU PRIMARIA APAGADA Y EL MOTIVO ESCRITO.
          «Mover gente» necesita un vínculo persona → frente que el modelo no tiene: `obra_asignacion`
          asigna a la OBRA y `cuadrilla` no cuelga de ninguna actividad. Se deja a la vista, apagada,
          en vez de sacarla: un hueco declarado se resuelve; uno que se borró de la pantalla se olvida. */}
      <div style={{
        position: 'fixed', bottom: 64, left: 0, right: 0, margin: '0 auto', maxWidth: 430,
        background: C.surface, borderTop: `1px solid ${C.linea}`, padding: '12px 16px 16px', zIndex: 20,
      }} data-testid="pie-personas">
        <div style={{ display: 'flex', gap: 10 }}>
          <span
            data-testid="mover-gente"
            aria-disabled
            title="Todavía no se puede: el modelo asigna a la obra, no al frente"
            style={{
              flex: 1, minHeight: 50, borderRadius: R.control, background: C.inerte, color: C.faint,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 15, fontWeight: 600, cursor: 'not-allowed',
            }}
          >
            <Icono nombre="mover" tamano={19} />
            Mover gente
          </span>
          <span
            data-testid="avisar-ausencia"
            aria-disabled
            title="La falta se declara en Personal, desde Administración"
            style={{
              width: 50, minHeight: 50, borderRadius: R.control, border: `1px solid ${C.linea}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.tenue,
              flexShrink: 0, cursor: 'not-allowed',
            }}
          >
            <Icono nombre="alerta" tamano={20} />
          </span>
        </div>
      </div>
    </>
  )
}

const n1 = (h: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(h)

/** La hora de la marca, en la zona de la obra (`ZONA_OBRA`, escrita una sola vez). */
function hora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA_OBRA,
  }).format(new Date(iso))
}
