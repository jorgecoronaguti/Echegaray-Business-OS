import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { contextoDeObra, hoyEnObra, ZONA_OBRA } from '@/features/jefe/services/contexto'
import { getActividades, getArbol, getHHDelDia, getImpedimentos, type ObraDelJefe } from '@/features/jefe/services/jefeService'
import {
  estadoDelFrente, frentesAbiertos, frentesDelDia, problemasDelDia, resumenDeFrentes, type FrenteDelDia,
} from '@/features/jefe/services/dia'
import { agrupar, type Esperado, type FilaPresencia } from '@/features/administracion/services/presencia'
import { getEsperados, getPresencia } from '@/features/administracion/services/presenciaService'
import { hrefCargaDeAsistencia } from '@/features/administracion/services/cargaDeAsistencia'
import { hrefMaterialEscritorio } from '@/features/materiales/logica/pedidos'
import { getMiEfectivo } from '@/features/efectivo/campo/datos'
import { abiertas, destino, pesos, resumenMiEfectivo } from '@/features/efectivo/campo/logica'
import { ETAPAS, ETAPA_LABEL, type Etapa } from '@/features/obras/types'
import {
  Aviso, BotonEnlace, Franja, Tabla, THead, Th, Tr, Td, TituloPanel, Vacio,
} from '@/shared/components/ds'
import { PageShell } from '@/shared/components/ui'
import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

// HOY · LA PORTADA DE ESCRITORIO DEL JEFE DE OBRA (dueño, 25/09/2026).
//
// «El jefe en la PC entra a su pantalla de teléfono. ¿Qué sería eso? Tiene que tener un diseño de
// computadora». Ésta es la casa del jefe en la PC: lo mismo que J01 le dice en el teléfono —quién
// está, qué frentes tienen parte, qué está parado, qué hay que resolver, su efectivo— con la forma
// de escritorio: sus obras en una tabla, el día de la elegida debajo, y lo suyo en la columna de la
// derecha. Todo lo que se CARGA vive en el ERP de escritorio (la ficha de la obra, la carga de
// asistencia, Material): esta pantalla lleva ahí con la obra puesta, no duplica formularios.
//
// ═══ LAS OBRAS SON LAS DEL SELECTOR DE J01 ═══
//
// Activas, la asignada primero (`contextoDeObra`, dueño 24/09). Con UNA sola obra no hay portada
// que mostrar: va derecho a su ficha, que es la casa del jefe en el ERP.
//
// ═══ NINGÚN IMPORTE DE LA OBRA ═══
//
// El jefe ve el costo de su obra en la ficha, nunca el precio; acá no se lee ni una columna de dinero
// de la obra. Los únicos pesos son los de SU efectivo, que la base le da sólo a él.

export const dynamic = 'force-dynamic'

export default async function HoyJefeEscritorioPage({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const { obra: pedida } = await searchParams
  const auth = await createClient()
  const user = await getUsuarioActual(auth)
  if (!user) redirect('/login')
  const perfil = await getPerfilActual(auth, user.id)
  // Quien administra tiene su cartera: esta portada es la del jefe.
  if (veEconomia(perfil.data?.rol)) redirect('/obras')

  const { supabase, obras, obra, error, asignadas } = await contextoDeObra(pedida)
  if (obras.length === 1 && obra) redirect(`/obras/${encodeURIComponent(obra.id)}`)

  const hoy = hoyEnObra()
  const propio = await getPerfilPropio(auth, user.id)
  const personaId = propio.data?.persona_id ?? null

  const [presencia, esperados, actividades, arbol, impedimentos, hh, efectivo] = await Promise.all([
    getPresencia(supabase, hoy),
    getEsperados(supabase),
    obra ? getActividades(supabase, obra.id) : null,
    obra ? getArbol(supabase, obra.id) : null,
    obra ? getImpedimentos(supabase, obra.id) : null,
    obra ? getHHDelDia(supabase, obra.id, hoy) : null,
    personaId ? getMiEfectivo(auth, personaId) : null,
  ])

  const genteDe = (id: string) => agrupar(
    (presencia.data ?? []).filter((p: FilaPresencia) => p.obra_id === id),
    (esperados.data ?? []).filter((e: Esperado) => e.obra_actual_id === id),
  )
  const asignadosDe = (id: string) => (esperados.data ?? []).filter((e) => e.obra_actual_id === id).length

  const grupos = obra ? genteDe(obra.id) : null
  const frentes = obra
    ? frentesAbiertos(frentesDelDia(arbol?.data ?? [], actividades?.data ?? [], hh?.data ?? [], hoy))
    : []
  const resumen = resumenDeFrentes(frentes)
  const problemas = obra
    ? problemasDelDia({
        actividades: actividades?.data ?? [],
        impedimentos: impedimentos?.data ?? [],
        sinRegistrar: grupos?.sinRegistrar.length ?? 0,
        hoy,
      })
    : []
  const primerError = error ?? presencia.error ?? esperados.error ?? actividades?.error ?? arbol?.error
    ?? impedimentos?.error ?? hh?.error ?? null

  return (
    <PageShell eyebrow="Obras" title="Hoy" subtitle={fechaLarga(hoy)}>
      <RefrescarEnVivo tablas={TABLAS_DE.jefe} />
      <div className="flex flex-col gap-8" data-testid="hoy-jefe-escritorio">
        {primerError && <Aviso tono="neg" titulo="No se pudo leer todo" testid="hoy-error">{primerError}</Aviso>}

        {/* ── SUS OBRAS ── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <TituloPanel>Mis obras</TituloPanel>
            <span className="font-mono text-[12px] text-faint">{obras.length}</span>
          </div>
          {obras.length === 0 ? (
            <Vacio>No tenés obras activas.</Vacio>
          ) : (
            <Tabla testid="tabla-mis-obras" minWidth={760}>
              <THead>
                <Th>Obra</Th><Th>Etapa</Th><Th num>Avance</Th><Th num>En obra hoy</Th><Th num>Impedimentos</Th><Th num>Fin plan</Th><Th />
              </THead>
              <tbody>
                {obras.map((o) => {
                  const g = genteDe(o.id)
                  const asignados = asignadosDe(o.id)
                  const elegida = o.id === obra?.id
                  return (
                    <Tr key={o.id} seleccionada={elegida} data-testid="fila-mi-obra" data-obra={o.id}>
                      <Td fuerte>
                        <Link
                          href={`/obras/hoy?obra=${encodeURIComponent(o.id)}`}
                          prefetch={false}
                          scroll={false}
                          className="flex min-h-[32px] items-center gap-2 hover:underline"
                          data-testid="elegir-obra"
                        >
                          {o.codigo && <span className="font-mono text-[11.5px] text-faint">{o.codigo}</span>}
                          <span className={elegida ? 'font-medium text-ink' : 'text-ink'}>{o.nombre}</span>
                          {asignadas.includes(o.id) && <span className="text-[11px] text-muted">· asignada</span>}
                        </Link>
                      </Td>
                      <Td>{etiquetaEtapa(o)}</Td>
                      <Td num>{o.avance_pct == null ? <span className="text-faint">sin medir</span> : `${o.avance_pct} %`}</Td>
                      <Td num>{asignados === 0 ? <span className="text-faint">sin plantel</span> : `${g.enObra.length} de ${asignados}`}</Td>
                      <Td num><span className={o.restricciones_abiertas > 0 ? 'text-neg' : ''}>{o.restricciones_abiertas}</span></Td>
                      <Td num>{o.fecha_fin_plan ? ddmm(o.fecha_fin_plan) : <span className="text-faint">—</span>}</Td>
                      <Td className="text-right">
                        <Link href={`/obras/${encodeURIComponent(o.id)}`} prefetch={false} className="text-[12.5px] text-ink underline-offset-2 hover:underline" data-testid="abrir-obra">
                          Abrir
                        </Link>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Tabla>
          )}
        </section>

        {obra && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
            {/* ── EL DÍA DE LA OBRA ELEGIDA ── */}
            <section className="flex min-w-0 flex-col gap-5" data-testid="dia-de-la-obra">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] tracking-[0.04em] text-faint">{obra.codigo ?? 'Obra'}</div>
                  <div className="truncate text-[17px] font-semibold text-ink">{obra.nombre}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2" data-testid="acciones-del-dia">
                  <BotonEnlace href={hrefCargaDeAsistencia({ obra: obra.id })} variante="primaria">Cargar asistencia</BotonEnlace>
                  <BotonEnlace href={`/obras/${encodeURIComponent(obra.id)}?vista=tareas&sub=parte`} variante="secundaria">Parte diario</BotonEnlace>
                  <BotonEnlace href={`${hrefMaterialEscritorio({ obra: obra.id })}&pedir=1`} variante="secundaria">Pedir material</BotonEnlace>
                  <BotonEnlace href={`/obras/${encodeURIComponent(obra.id)}?vista=operacion&sub=impedimentos`} variante="secundaria">Problema</BotonEnlace>
                  <BotonEnlace href={`/obras/${encodeURIComponent(obra.id)}`} variante="discreta">Abrir la obra</BotonEnlace>
                </div>
              </div>

              <Franja
                testid="cifras-del-dia"
                metricas={[
                  {
                    etiqueta: 'En obra',
                    valor: asignadosDe(obra.id) === 0 ? '—' : String(grupos?.enObra.length ?? 0),
                    contexto: asignadosDe(obra.id) === 0 ? 'sin plantel' : `de ${asignadosDe(obra.id)}`,
                  },
                  {
                    etiqueta: 'Partes',
                    valor: resumen.abiertos === 0 ? '—' : `${resumen.conParte}/${resumen.abiertos}`,
                    contexto: resumen.abiertos === 0 ? 'sin frentes' : 'frentes con parte hoy',
                    tono: resumen.abiertos > 0 && resumen.conParte < resumen.abiertos ? 'warn' : undefined,
                  },
                  {
                    etiqueta: 'Parados',
                    valor: String(resumen.parados),
                    contexto: resumen.parados === 1 ? 'frente detenido' : 'frentes detenidos',
                    tono: resumen.parados > 0 ? 'neg' : undefined,
                  },
                  {
                    etiqueta: 'Sin registrar',
                    valor: String(grupos?.sinRegistrar.length ?? 0),
                    contexto: 'con asignación y sin marca hoy',
                    tono: (grupos?.sinRegistrar.length ?? 0) > 0 ? 'warn' : undefined,
                  },
                ]}
              />

              {problemas.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline gap-3">
                    <TituloPanel>Resolver ahora</TituloPanel>
                    <span className="font-mono text-[12px] text-neg">{problemas.length}</span>
                  </div>
                  <Tabla testid="resolver-ahora" minWidth={520}>
                    <tbody>
                      {problemas.map((p) => (
                        <Tr key={p.clave} compacta data-testid="problema">
                          <Td className="w-[14px]"><span className={`inline-block h-[7px] w-[7px] rounded-full ${p.tono === 'neg' ? 'bg-neg' : 'bg-warn'}`} /></Td>
                          <Td fuerte><span className="block max-w-[320px] truncate">{p.titulo}</span></Td>
                          <Td><span className="block max-w-[360px] truncate">{p.detalle}</span></Td>
                          <Td className="text-right">
                            <Link
                              prefetch={false}
                              href={p.actividadId
                                ? `/obras/${encodeURIComponent(obra.id)}/avance/${encodeURIComponent(p.actividadId)}`
                                : hrefCargaDeAsistencia({ obra: obra.id })}
                              className="text-[12.5px] text-ink hover:underline"
                            >
                              {p.actividadId ? 'Ver la tarea' : 'Cargar asistencia'}
                            </Link>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Tabla>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div className="flex items-baseline gap-3">
                  <TituloPanel>Frentes de hoy</TituloPanel>
                  <span className="font-mono text-[12px] text-faint">{frentes.length}</span>
                </div>
                {frentes.length === 0 ? (
                  <Vacio accion={<Link href={`/obras/${encodeURIComponent(obra.id)}?vista=tareas`} prefetch={false} className="text-ink underline">Planificar en Trabajo</Link>}>
                    Ningún frente con trabajo abierto.
                  </Vacio>
                ) : (
                  <Tabla testid="frentes-de-hoy" minWidth={640}>
                    <THead>
                      <Th>Frente</Th><Th>Estado</Th><Th num>Con horas hoy</Th><Th num>HH hoy</Th><Th>Parte</Th><Th num>Avance</Th>
                    </THead>
                    <tbody>
                      {frentes.map((f) => <FilaFrente key={f.frente.id} f={f} obraId={obra.id} />)}
                    </tbody>
                  </Tabla>
                )}
              </div>
            </section>

            {/* ── LO SUYO ── */}
            <aside className="flex flex-col gap-6 lg:border-l lg:border-line lg:pl-8" data-testid="columna-jefe">
              <MiEfectivo lectura={efectivo} conVinculo={!!personaId} />

              <div className="flex flex-col gap-1" data-testid="gente-hoy">
                <div className="text-[10.5px] tracking-[0.04em] text-faint">GENTE HOY</div>
                {grupos && grupos.sinRegistrar.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-[12.5px] text-ink-soft">
                    {grupos.sinRegistrar.slice(0, 6).map((e) => (
                      <li key={e.id} className="truncate"><span className="text-warn">sin registrar</span> · {e.nombre_completo}</li>
                    ))}
                    {grupos.sinRegistrar.length > 6 && <li className="text-muted">y {grupos.sinRegistrar.length - 6} más</li>}
                  </ul>
                ) : (
                  <div className="text-[12.5px] text-muted">
                    {asignadosDe(obra.id) === 0 ? 'La obra no tiene plantel asignado.' : 'Todos los asignados tienen marca hoy.'}
                  </div>
                )}
                <EnlaceColumna href={hrefCargaDeAsistencia({ obra: obra.id })}>Cargar asistencia</EnlaceColumna>
                <EnlaceColumna href={`/obras/${encodeURIComponent(obra.id)}?vista=personal`}>Asignaciones y horas de la obra</EnlaceColumna>
                <EnlaceColumna href="/administracion/personas">Plantel</EnlaceColumna>
              </div>

              <div className="flex flex-col gap-1">
                <div className="text-[10.5px] tracking-[0.04em] text-faint">MATERIAL Y HERRAMIENTAS</div>
                <EnlaceColumna href={hrefMaterialEscritorio({ obra: obra.id })}>Material pedido</EnlaceColumna>
                <EnlaceColumna href={`/obras/${encodeURIComponent(obra.id)}?vista=operacion&sub=equipos`}>Herramientas en la obra</EnlaceColumna>
              </div>
            </aside>
          </div>
        )}
      </div>
    </PageShell>
  )
}

function EnlaceColumna({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} prefetch={false} className="inline-flex min-h-[28px] items-center text-[12.5px] text-ink underline-offset-2 hover:underline">
      {children} <span aria-hidden className="ml-1 text-faint">→</span>
    </Link>
  )
}

const TONO_FRENTE = { neg: 'bg-neg', warn: 'bg-warn', ink: 'bg-ink', faint: 'bg-line-strong' } as const
const TEXTO_FRENTE = { neg: 'text-neg', warn: 'text-warn', ink: 'text-ink', faint: 'text-muted' } as const

function FilaFrente({ f, obraId }: { f: FrenteDelDia; obraId: string }) {
  const e = estadoDelFrente(f)
  return (
    <Tr compacta data-testid="frente">
      <Td fuerte>
        <Link href={`/obras/${encodeURIComponent(obraId)}?vista=tareas`} prefetch={false} className="block max-w-[320px] truncate hover:underline">{f.frente.nombre}</Link>
      </Td>
      <Td>
        <span className={`inline-flex items-center gap-1.5 ${TEXTO_FRENTE[e.tono]}`}>
          <span className={`inline-block h-[7px] w-[7px] rounded-full ${TONO_FRENTE[e.tono]}`} />{e.palabra}
        </span>
      </Td>
      <Td num>{f.personasHoy}</Td>
      <Td num>{f.hhHoy.toLocaleString('es-AR')}</Td>
      <Td>{f.parteHoy ? <span className="text-pos">cargado</span> : <span className="text-warn">sin parte</span>}</Td>
      <Td num>{f.pct == null ? <span className="text-faint">sin medir</span> : `${Math.round(f.pct)} %`}</Td>
    </Tr>
  )
}

function MiEfectivo({ lectura, conVinculo }: { lectura: Awaited<ReturnType<typeof getMiEfectivo>> | null; conVinculo: boolean }) {
  const titulo = <div className="text-[10.5px] tracking-[0.04em] text-faint">MI EFECTIVO</div>
  if (!conVinculo) {
    return <div className="flex flex-col gap-2" data-testid="mi-efectivo">{titulo}<div className="text-[12.5px] text-muted">Tu cuenta no está vinculada a un legajo.</div></div>
  }
  if (!lectura || lectura.estado !== 'ok') {
    return (
      <div className="flex flex-col gap-2" data-testid="mi-efectivo">
        {titulo}
        <div className="text-[12.5px] text-neg">{lectura?.estado === 'error' ? lectura.error : 'Efectivo a rendir todavía no está publicado.'}</div>
      </div>
    )
  }
  const { entregas, tickets } = lectura.dato
  const r = resumenMiEfectivo(entregas, tickets)
  const sinFirmar = abiertas(entregas).filter((e) => !e.conformidad).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const hayAlgo = r.entregas.length > 0 || sinFirmar.length > 0
  return (
    <div className="flex flex-col gap-2" data-testid="mi-efectivo">
      {titulo}
      {sinFirmar.map((e) => (
        <div key={e.id} className="flex flex-col gap-2 rounded-card border border-warn/40 bg-warn-soft px-3 py-2.5" data-testid="efectivo-sin-firmar">
          <div className="text-[12.5px] text-ink">Te entregaron <span className="font-mono">{pesos(e.entregado)}</span> para {destino(e)}</div>
          <BotonEnlace href={`/mi-cuenta/efectivo?firmar=${encodeURIComponent(e.id)}`} variante="primaria">Firmar la conformidad</BotonEnlace>
        </div>
      ))}
      {r.entregas.length > 0 && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[12.5px]">
          <dt className="text-muted">{r.tengoQueRendir < 0 ? 'Rendí de más' : 'Tengo que rendir'}</dt>
          <dd className="text-right font-mono font-semibold text-ink">{pesos(Math.abs(r.tengoQueRendir))}</dd>
          <dt className="text-muted">Recibí</dt><dd className="text-right font-mono text-ink-soft">{pesos(r.recibi)}</dd>
          <dt className="text-muted">Rendí</dt><dd className="text-right font-mono text-ink-soft">{pesos(r.rendi)}</dd>
        </dl>
      )}
      {!hayAlgo && <div className="text-[12.5px] text-muted">No tenés efectivo para rendir.</div>}
      <EnlaceColumna href="/mi-cuenta/efectivo">Ver mi efectivo</EnlaceColumna>
    </div>
  )
}

function etiquetaEtapa(o: ObraDelJefe): React.ReactNode {
  const etapa = o.etapa && (ETAPAS as readonly string[]).includes(o.etapa) ? ETAPA_LABEL[o.etapa as Etapa] : null
  return etapa ?? <span className="text-faint">sin etapa</span>
}

function ddmm(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : iso
}

/** `2026-09-25` → `Viernes 25/09`. */
function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  const dia = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: ZONA_OBRA }).format(new Date(Date.UTC(a, m - 1, d, 12)))
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}
