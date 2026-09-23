// EL RESUMEN DE LA OBRA — PORTE LITERAL DE «03 · Obra · Resumen» (1440) Y «M04» (390).
//
// ═══ 03 · ESCRITORIO ═══
//
//   cuerpo    `padding:30px` · grilla `minmax(0,1fr) 340px` · gap 52 · columna izquierda gap 34
//   cifras    Avance · Costo teórico · Plazo: eyebrow mono + 28px/600 + bajada 12,5 muted
//   frena     «Lo que frena la obra hoy»: filas `118px 1fr 150px 100px`, borde izq 2px neg/warn
//   frentes   «Los frentes en curso»: Actividad · Medición · Avance · HH real · Gente hoy (52px)
//   aside     borde izq, `padding-left:34px`, gap 30: La obra · Órdenes del cliente · Lo que falta
//             cargar · Última actividad
//
// ═══ M04 · TELÉFONO ═══
//
//   cuatro azulejos 2×2 (Avance · Plazo con día hábil · Costo teórico · Personas hoy), Atención,
//   Próximas 2 semanas. SIN Órdenes del cliente. La primaria «Cargar parte» de 48px al pie, sobre
//   la barra del teléfono.
//
// Las CIFRAS salen de `obra_avance_ponderado` y `obra_dias_habiles` (H2) a través de
// `avancePonderado.ts`; el plazo de `obra_panel.forecast_fin`/`fecha_fin_plan`. NULL nunca es 0.
//
// La obra TERMINADA (Z01/MZ1) la dibuja `ResumenCierre`; la página elige cuál montar.

import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  ETAPA_LABEL, type Actividad, type EconomiaObra, type ObraPanel, type ParteEjecucion, type PlanVsReal,
  type Restriccion,
} from '../types'
import { C, ESTILO_PRIMARIA, MONO } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import {
  BloqueAside, BloqueTelefono, CifraGrande, FilaKV, SinDato, TituloBloque, TONO_TEXTO,
} from './TarjetaResumen'
import { AtencionObra, type ItemAtencion } from './AtencionObra'
import { proximasDeLaObra } from '../services/resumenDelPlan'
import { lineasPlanVsReal } from '../services/planVsReal'
import { hrefDeVista } from '../services/vistasObra'
import {
  bajadaAvance, cifraAvance, costoTeorico, type AvancePonderado, type DiasHabilesObra,
} from '../services/avancePonderado'
import {
  frentesEnCurso, impedimentosQueFrenan, loQueFaltaCargar, personasHoy, plazoDeObra,
  sinMetodoDeMedicion, ultimaActividad,
} from '../services/resumenObra'
import type { PersonasDeHoy } from '../services/personalService'
import type { BloqueOrdenes } from '../services/ordenesDeLaObra'
import { fecha, fechaCorta, plataCorta } from './formato'

/** LO QUE FRENA LA OBRA, para el teléfono: los vencidos con nombre; el resto, contado. */
function itemsDeImpedimentos(abiertas: Restriccion[], obraId: string, hoy: string): ItemAtencion[] {
  const href = `/obras/${obraId}?vista=operacion&sub=impedimentos`
  const vencidos = abiertas
    .filter((r) => r.fecha_compromiso != null && r.fecha_compromiso < hoy)
    .sort((a, b) => (a.fecha_compromiso ?? '').localeCompare(b.fecha_compromiso ?? ''))
  const items: ItemAtencion[] = vencidos.slice(0, 3).map((r) => ({
    clave: `impedimento-${r.id}`, tono: 'neg', clase: 'bloqueo', titulo: r.descripcion,
    contexto: `vencía ${fechaCorta(r.fecha_compromiso)} · ${r.responsable ?? 'sin responsable'}`,
    accion: 'Resolver', href, origen: 'impedimento abierto con la fecha de compromiso ya pasada',
  }))
  const resto = abiertas.length - Math.min(vencidos.length, 3)
  if (resto > 0) {
    items.push({
      clave: 'impedimentos-resto', tono: 'warn', clase: 'bloqueo',
      titulo: `${resto} impedimento(s) abierto(s) más`, accion: 'Ver', href,
      origen: 'impedimentos sin liberar de esta obra',
    })
  }
  return items
}

/** LAS LECTURAS DEL PLAN QUE PIDEN TRABAJO: la misma función que las publica, leída por tono. */
function itemsDelPlan(plan: PlanVsReal | null, economia: EconomiaObra | null, veComercial: boolean, obraId: string): ItemAtencion[] {
  if (!plan) return []
  return lineasPlanVsReal(plan, veComercial, economia)
    .filter((l) => l.tono !== 'ok')
    .map((l) => ({
      clave: l.clave,
      tono: l.tono === 'alerta' ? ('neg' as const) : ('warn' as const),
      clase: l.tono === 'falta' ? ('dato' as const) : ('bloqueo' as const),
      titulo: l.titulo,
      accion: l.tono === 'falta' ? 'Cargar' : 'Ver',
      href: hrefDeVista(obraId, l.vista),
      origen: l.origen,
    }))
}

/** M04 «Próximas 2 semanas»: nombre a la izquierda, fecha mono a la derecha pintada por urgencia. */
function ProximasTelefono({ actividades, obraId, hoy }: { actividades: Actividad[]; obraId: string; hoy: string }) {
  const proximas = proximasDeLaObra(actividades, hoy)
  const enDias = (f: string | null) =>
    f == null ? null : Math.round((Date.parse(`${f.slice(0, 10)}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000)
  return (
    <BloqueTelefono titulo="Próximas 2 semanas" testid="proximas-resumen"
      derecha={proximas.length > 0 ? `${proximas.length} actividades` : undefined}>
      {proximas.length === 0 ? (
        <div style={{ fontSize: '12.5px', color: C.tenue, fontStyle: 'italic', minHeight: '40px', display: 'flex', alignItems: 'center' }} data-nulo="">
          Nada arranca ni vence en dos semanas.
        </div>
      ) : (
        <div data-testid="tabla-proximas">
          {proximas.slice(0, 6).map((p, i, arr) => {
            const ref = p.fin_plan ?? p.inicio_plan
            const d = enDias(ref)
            const color = d == null ? C.tenue : d <= 0 ? C.neg : d <= 7 ? C.warn : C.tenue
            return (
              <Link key={p.id} href={`/obras/${obraId}?vista=tareas&sub=gantt`} prefetch={false} style={{
                minHeight: '44px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: C.tinta,
                borderBottom: i < arr.length - 1 ? `1px solid ${C.borde}` : 'none',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {p.nombre}
                  {p.hito && <span style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '.06em', marginLeft: '4px' }}>HITO</span>}
                </div>
                <span style={{ color, fontFamily: MONO, fontSize: '12px', whiteSpace: 'nowrap' }}>
                  {d != null && d <= 0 ? 'vence hoy' : fechaCorta(ref)}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </BloqueTelefono>
  )
}

export function TabResumen({
  obra, plan, economia = null, abiertas, obraId, editar, veComercial = true,
  actividades = [], partes = [], personasDeHoy = null, ordenes = null,
  hoy = new Date().toISOString().slice(0, 10), avance, diasHabiles, nDependencias, genteHoy,
}: {
  obra: ObraPanel
  plan: PlanVsReal | null
  economia?: EconomiaObra | null
  abiertas: Restriccion[]
  obraId: string
  /** El bloque de edición de la obra, que la página arma con su action. No está dibujado en 03:
   *  va plegado al final del aside porque es la única puerta para corregir los campos de la obra. */
  editar: ReactNode
  veComercial?: boolean
  actividades?: Actividad[]
  partes?: ParteEjecucion[]
  personasDeHoy?: PersonasDeHoy | null
  /** `null` = la página no las pidió. Una obra sin OC sí se dibuja: «Sin OC registrada». */
  ordenes?: BloqueOrdenes | null
  hoy?: string
  /** `obra_avance_ponderado` · `null` = sin historias todavía. */
  avance: AvancePonderado | null
  diasHabiles: DiasHabilesObra | null
  /** Cuántas dependencias tiene cargadas · `null` = no se pudieron leer. */
  nDependencias: number | null
  /** Personas distintas en los partes de hoy, por actividad. */
  genteHoy: Record<string, number>
}) {
  const vivas = actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada && !a.actividad_padre_id)
  const actividadDe = new Map(actividades.map((a) => [a.id, { nombre: a.nombre, unidad: a.unidad }]))
  const frena = impedimentosQueFrenan(abiertas, hoy)
  const frentes = frentesEnCurso(actividades, genteHoy)
  const plazo = plazoDeObra(obra, diasHabiles)
  const costo = costoTeorico(avance)
  const falta = loQueFaltaCargar({
    historiasSinCosto: avance ? avance.n_historias_sin_costo : null,
    actividadesSinFecha: obra.n_actividades_sin_fecha,
    sinMetodo: sinMetodoDeMedicion(actividades),
    dependencias: nDependencias,
    actividades: vivas.length,
    selladas: plan?.actividades_con_baseline ?? null,
  })
  const eventos = ultimaActividad(partes, actividadDe)
  const finProyectadoTarde = obra.forecast_fin != null && obra.fecha_fin_plan != null && obra.forecast_fin > obra.fecha_fin_plan
  const atencion = [...itemsDeImpedimentos(abiertas, obraId, hoy), ...itemsDelPlan(plan, economia, veComercial, obraId)]
  const personas = personasHoy(personasDeHoy)

  return (
    <>
      {/* ═══ 03 · ESCRITORIO ═══ */}
      <div className="hidden md:grid" style={{ padding: '30px', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: '52px', alignItems: 'start' }}
        data-testid="resumen-obra">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '34px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '64px', flexWrap: 'wrap' }} data-testid="cifras-resumen">
            <CifraGrande rotulo="Avance" valor={cifraAvance(avance)} falta="sin estructura" bajada={bajadaAvance(avance)} testid="cifra-avance" />
            <CifraGrande rotulo="Costo teórico" valor={costo.cifra} falta="sin costo de MO" bajada={costo.bajada} testid="cifra-costo-teorico" />
            <CifraGrande rotulo="Plazo" valor={plazo.valor} falta={plazo.falta} bajada={plazo.bajada} tono={plazo.tono} testid="cifra-plazo" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} data-testid="lo-que-frena">
            <TituloBloque>Lo que frena la obra hoy</TituloBloque>
            {frena.length === 0 ? (
              <div style={{ fontSize: '12.5px', color: C.tenue, fontStyle: 'italic' }} data-nulo="">Ningún impedimento abierto.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {frena.map((f) => (
                  <Link key={f.id} href={`/obras/${obraId}?vista=operacion&sub=impedimentos`} prefetch={false}
                    data-testid={`frena-${f.id}`} style={{
                      display: 'grid', gridTemplateColumns: '118px minmax(0,1fr) 150px 100px', gap: '20px',
                      padding: '11px 0 11px 14px', borderBottom: `1px solid ${C.borde}`,
                      borderLeft: `2px solid ${TONO_TEXTO[f.borde]}`, alignItems: 'center', fontSize: '13.5px', color: C.tinta,
                    }}>
                    <div style={{ color: C.tintaSuave, fontSize: '12.5px' }}>{f.tipo}</div>
                    <div>{f.queFalta}</div>
                    <div style={{ color: C.tintaMedia, fontSize: '12.5px' }}>{f.responsable ?? <SinDato>sin responsable</SinDato>}</div>
                    <div style={{
                      textAlign: 'right', fontSize: '12.5px', color: TONO_TEXTO[f.vencimiento.tono],
                      fontWeight: f.vencimiento.tono === 'neg' ? 500 : 400,
                    }}>{f.vencimiento.texto}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} data-testid="frentes-en-curso">
            <TituloBloque meta={vivas.length > 0 ? `${frentes.length} de ${vivas.length} actividades` : undefined}>Los frentes en curso</TituloBloque>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 130px 110px 92px 88px', gap: '20px', height: '32px',
                alignItems: 'center', borderBottom: `1px solid ${C.borde}`, fontFamily: MONO, fontSize: '10.5px',
                letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
              }}>
                <div>Actividad</div><div>Medición</div><div>Avance</div>
                <div style={{ textAlign: 'right' }}>HH real</div><div style={{ textAlign: 'right' }}>Gente hoy</div>
              </div>
              {frentes.length === 0 && (
                <div style={{ padding: '14px 0', fontSize: '12.5px', color: C.tenue, fontStyle: 'italic' }} data-nulo="">Ningún frente en curso.</div>
              )}
              {frentes.map((f, i) => (
                <Link key={f.id} href={`/obras/${obraId}?vista=tareas&sub=arbol&act=${f.id}`} prefetch={false}
                  data-testid={`frente-${f.id}`} style={{
                    display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 130px 110px 92px 88px', gap: '20px', height: '52px',
                    alignItems: 'center', borderBottom: i < frentes.length - 1 ? `1px solid ${C.borde}` : 'none',
                    fontSize: '13.5px', color: C.tinta, fontVariantNumeric: 'tabular-nums',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                    <span style={{ color: f.bloqueada ? C.neg : C.tinta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</span>
                    {f.bloqueada && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.neg, fontWeight: 500 }}>
                        <Ico d={P.bloqueo} s={12} />bloqueada
                      </span>
                    )}
                  </div>
                  <div style={{ color: TONO_TEXTO[f.medicion.tono] === C.tinta ? C.tintaSuave : TONO_TEXTO[f.medicion.tono], fontSize: '12.5px' }}>{f.medicion.texto}</div>
                  <div style={{ fontSize: '12.5px', color: TONO_TEXTO[f.avance.tono] }}>
                    {f.avance.pct ?? <SinDato>sin medir</SinDato>} <span style={{ color: C.tenue }}>{f.avance.detalle}</span>
                  </div>
                  <div style={{ textAlign: 'right', color: f.hhReal == null ? C.tenue : C.tinta }}>{f.hhReal ?? 'sin HH'}</div>
                  <div style={{ textAlign: 'right', color: f.gente == null ? C.tenue : C.tinta }}>{f.gente ?? '—'}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '30px', paddingLeft: '34px', borderLeft: `1px solid ${C.borde}` }}
          data-testid="aside-resumen">
          <BloqueAside titulo="La obra" testid="ficha-obra">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              <FilaKV k="Etapa" v={obra.etapa ? ETAPA_LABEL[obra.etapa] ?? obra.etapa : <SinDato>sin declarar</SinDato>} />
              {veComercial && (
                <FilaKV k="Contratado" v={obra.monto_contratado != null ? plataCorta(obra.monto_contratado) : <SinDato>sin cargar</SinDato>} />
              )}
              <FilaKV k="Inicio real" v={obra.fecha_inicio_real ? fecha(obra.fecha_inicio_real) : <SinDato>sin arrancar</SinDato>} />
              <FilaKV k="Fin plan" v={obra.fecha_fin_plan ? fecha(obra.fecha_fin_plan) : <SinDato>sin plan</SinDato>} />
              <FilaKV k="Fin proyectado" tono={finProyectadoTarde ? 'warn' : 'ink'}
                v={obra.forecast_fin ? fecha(obra.forecast_fin) : <SinDato>sin proyección</SinDato>} />
              <FilaKV k="Origen de las fechas" tam={12.5}
                v={obra.origen_fechas_plan ? <span style={{ color: C.tintaMedia }}>{obra.origen_fechas_plan}</span> : <SinDato>sin fechas</SinDato>} />
            </div>
          </BloqueAside>

          {ordenes && (
            <BloqueAside titulo="Órdenes del cliente" testid="ordenes-de-la-obra">
              {ordenes.fallo ? (
                <div style={{ fontSize: '12.5px', color: C.warn }}>No se pudieron leer las órdenes del cliente.</div>
              ) : ordenes.oc.length === 0 && ordenes.op.length === 0 ? (
                <div style={{ fontSize: '13.5px' }}><SinDato>{ordenes.vacioOC}</SinDato></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13.5px' }}>
                  {[...ordenes.oc, ...ordenes.op].map((o) => (
                    <a key={o.clave} href={o.href} target="_blank" rel="noreferrer" title={o.title} data-testid={`orden-${o.clave}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: '2px', color: C.tinta }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                        <span style={{ fontWeight: 500 }}>{o.rotulo}</span>
                        <span style={{ fontFamily: MONO, fontSize: '12.5px', color: C.tintaSuave }}>
                          {o.fecha ? fecha(o.fecha) : <SinDato>sin fecha</SinDato>}
                        </span>
                      </div>
                      <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>
                        {veComercial
                          ? (o.importe != null ? `${plataCorta(o.importe)} con IVA` : 'importe sin leer')
                          : 'importe reservado'}
                        {' · '}{o.enDrive ? 'PDF en Drive' : 'PDF en el OS'}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </BloqueAside>
          )}

          <BloqueAside titulo="Lo que falta cargar" testid="lo-que-falta-cargar">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {falta.map((f) => (
                <div key={f.clave} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', fontSize: '13.5px' }}
                  data-testid={`falta-${f.clave}`}>
                  <span style={{ color: C.tintaMedia }}>{f.rotulo}</span>
                  <span style={{ color: TONO_TEXTO[f.tono], fontWeight: f.tono === 'warn' ? 500 : 400, textAlign: 'right' }}>{f.valor}</span>
                </div>
              ))}
            </div>
          </BloqueAside>

          <BloqueAside titulo="Última actividad" testid="ultima-actividad">
            {eventos.length === 0 ? (
              <div style={{ fontSize: '13px' }}><SinDato>sin partes registrados</SinDato></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: C.tintaMedia }}>
                {eventos.map((e, i) => (
                  <div key={i}><span style={{ color: C.tenue }}>{e.fecha} · </span>{e.texto}</div>
                ))}
              </div>
            )}
          </BloqueAside>

          <div data-testid="editar-obra-bloque">{editar}</div>
        </aside>
      </div>

      {/* ═══ M04 · TELÉFONO ═══ */}
      <div className="flex md:hidden" style={{ padding: '16px 16px 100px', flexDirection: 'column', gap: '16px' }}
        data-testid="resumen-obra-telefono">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }} data-testid="azulejos-resumen">
          <CifraGrande tam={24} rotulo="Avance" valor={cifraAvance(avance)} falta="sin estructura"
            bajada={avance ? `${avance.n_items_medidos} de ${avance.n_items} medidos` : 'sin estructura'} />
          <CifraGrande tam={24} rotulo="Plazo" valor={plazo.valor} falta={plazo.falta} tono={plazo.tono}
            bajada={plazo.bajada.replace('fin proyectado', 'proy.')} />
          <CifraGrande tam={24} rotulo="Costo teórico" valor={costo.cifra} falta="sin costo de MO" bajada={costo.bajada} />
          <CifraGrande tam={24} rotulo="Personas hoy" valor={personas.valor} falta={personas.falta} bajada={personas.bajada} />
        </div>
        <AtencionObra items={atencion} />
        <ProximasTelefono actividades={actividades} obraId={obraId} hoy={hoy} />
        <div>{editar}</div>
      </div>
      <div className="md:hidden" style={{
        position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie,
        borderTop: `1px solid ${C.borde}`, zIndex: 20,
      }}>
        <Link href={`/obras/${obraId}?vista=tareas&sub=parte`} prefetch={false} data-testid="primaria-cargar-parte"
          style={{ ...ESTILO_PRIMARIA, height: '48px', justifyContent: 'center', fontSize: '14px', gap: '8px', color: C.grafito }}>
          <Ico d={P.editar} s={15} />Cargar parte
        </Link>
      </div>
    </>
  )
}
