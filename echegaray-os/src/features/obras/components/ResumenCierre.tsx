'use client'

// LA OBRA TERMINADA — PORTE LITERAL DE «Z01 · Obra terminada · archivar» (1440) Y «MZ1» (390).
//
// Se monta en lugar de `TabResumen` cuando `obra.estado` es terminada/cerrada/archivada.
//
// ═══ Z01 · ESCRITORIO ═══
//
//   cifras     Avance · Plazo final · Costo real · Certificados · HH (28px/600, gap 64)
//   dejó       «Lo que dejó la obra»: Rubro · Plan · Real · Desvío (mono), desde `obra_actividad_hh`
//   antes      «Antes de archivar»: filas de 48px con check pos o círculo faint · «Nada de esto
//              bloquea archivar.»
//   aside      La obra (Contratado · Costo real · Margen · Inicio real · Fin real · Línea base) y
//              «Archivar la obra» con el botón en filo rojo (34px, borde `#B42318`)
//
// ═══ MZ1 · TELÉFONO ═══
//
//   azulejos 2×2 (Avance · Plazo final · Costo real · Certificados) · «Cierre» (Último parte · HH
//   totales · Impedimentos abiertos) · «Archivar la obra» · la primaria en filo rojo de 48px al pie.
//
// ═══ QUÉ HACE «ARCHIVAR» HOY ═══
//
// La puerta que existe es `archivarObra` (`obra_canonica.estado = 'cerrada'`), y en este OS
// `cerrada` YA ES «fuera de la cartera» (ver el comentario de esa acción). Por eso sobre una obra
// `cerrada` el bloque dice que ya está archivada y ofrece «Reactivar»; el filo rojo «Archivar»
// aparece cuando el estado es `terminada` (todavía en la cartera). Separar los dos estados en la
// base es una decisión del dueño, no de esta pantalla.

import Link from 'next/link'
import { useActionState, type ReactNode } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, ObraPanel, ParteEjecucion, PlanVsReal, Restriccion } from '../types'
import { C, MONO } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { BloqueAside, BloqueTelefono, CifraGrande, FilaKV, SinDato, TituloBloque, TONO_TEXTO } from './TarjetaResumen'
import { bajadaAvance, cifraAvance, type AvancePonderado } from '../services/avancePonderado'
import type { ActividadHH } from '../services/personalService'
import { antesDeArchivar, hhDeCierre, hhPorRubro, margenDeCierre, plazoFinal } from '../services/resumenObra'
import { fecha, fechaCorta, plataCorta } from './formato'

const numAR = (n: number, dec = 0) => n.toLocaleString('es-AR', { maximumFractionDigits: dec })

/** El botón de archivar/reactivar, con el estilo del diseño (filo rojo de 34px · 48px en 390). */
function BotonCierre({ accion, filo, alto, children, testid }: {
  accion: () => Promise<ResultadoAccion>
  filo: 'rojo' | 'neutro'
  alto: 34 | 48
  children: ReactNode
  testid: string
}) {
  const [estado, ejecutar, pendiente] = useActionState<ResultadoAccion | null, FormData>(() => accion(), null)
  const color = filo === 'rojo' ? C.neg : C.tintaMedia
  return (
    <form action={ejecutar} style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignSelf: alto === 34 ? 'flex-start' : 'stretch' }}>
      <button type="submit" disabled={pendiente} data-testid={testid} style={{
        height: `${alto}px`, padding: '0 16px', border: `1px solid ${filo === 'rojo' ? C.neg : C.bordeFuerte}`,
        borderRadius: '6px', background: C.superficie, color, font: 'inherit',
        fontSize: alto === 34 ? '13px' : '14px', fontWeight: alto === 34 ? 500 : 600, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: alto === 34 ? '7px' : '8px',
        opacity: pendiente ? 0.6 : 1,
      }}>
        <Ico d={filo === 'rojo' ? P.cerrar : P.reiniciar} s={alto === 34 ? 13 : 15} />{children}
      </button>
      {estado && !estado.ok && <span style={{ fontSize: '12px', color: C.neg }}>{estado.error}</span>}
    </form>
  )
}

export function ResumenCierre({
  obra, plan, abiertas, obraId, actividades, partes, actividadHH, avance, papelesSinClasificar,
  archivar, reactivar, veComercial = true, editar,
}: {
  obra: ObraPanel
  plan: PlanVsReal | null
  abiertas: Restriccion[]
  obraId: string
  actividades: Actividad[]
  partes: ParteEjecucion[]
  actividadHH: ActividadHH[]
  avance: AvancePonderado | null
  papelesSinClasificar: number | null
  /** Atadas a la obra por la página. */
  archivar: () => Promise<ResultadoAccion>
  reactivar: () => Promise<ResultadoAccion>
  veComercial?: boolean
  editar?: ReactNode
}) {
  const yaArchivada = obra.estado === 'cerrada' || obra.estado === 'archivada'
  const actividadDe = new Map(actividades.map((a) => [a.id, a]))
  const ultimo = [...partes].sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null
  const ultimoParte = ultimo
    ? { fecha: fechaCorta(ultimo.fecha) ?? '', actividad: actividadDe.get(ultimo.actividad_id)?.nombre ?? 'actividad', pct: actividadDe.get(ultimo.actividad_id)?.avance_pct ?? null }
    : null
  const plazo = plazoFinal(obra)
  const hh = hhDeCierre(plan)
  const rubros = hhPorRubro(actividades, actividadHH)
  const pasos = antesDeArchivar({
    obraId, impedimentosAbiertos: abiertas.length, ultimoParte,
    certificado: veComercial ? plan?.certificado ?? null : null, cobrado: veComercial ? plan?.cobrado ?? null : null,
    papelesSinClasificar, subcontratos: null,
  })
  const margen = margenDeCierre(veComercial ? plan : null)
  const sellada = actividades.map((a) => a.sellada_en).filter((s): s is string => !!s).sort().at(-1) ?? null
  const certificados = !veComercial ? null : plan?.certificado == null ? null : plataCorta(plan.certificado)
  const cobrados = plan?.cobrado != null && plan.certificado != null && plan.cobrado >= plan.certificado
  const textoArchivar = yaArchivada
    ? 'Ya está fuera de la cartera y de la ficha del cliente. No se borró nada: cronograma, HH y costos quedan enteros; la página sigue abriendo por su dirección. Reactivar la devuelve a la cartera.'
    : 'Sale de la cartera y de la ficha del cliente. No se borra nada: cronograma, HH y costos quedan enteros; la página sigue abriendo por su dirección y se reactiva cuando haga falta.'
  const desvio = (n: number | null) => n == null ? null : `${n > 0 ? '+' : ''}${numAR(n, 1)} %`

  const cifras = (tam: 28 | 24) => (
    <>
      <CifraGrande tam={tam} rotulo="Avance" valor={cifraAvance(avance)} falta="sin estructura"
        bajada={avance ? `${avance.n_items_medidos} de ${avance.n_items} medidos` : bajadaAvance(avance)} testid="cifra-avance" />
      <CifraGrande tam={tam} rotulo="Plazo final" valor={plazo.valor} falta={plazo.falta} bajada={plazo.bajada} tono={plazo.tono} testid="cifra-plazo-final" />
      <CifraGrande tam={tam} rotulo="Costo real" testid="cifra-costo-real"
        valor={veComercial && obra.costo_real != null ? plataCorta(obra.costo_real) : null}
        falta={veComercial ? 'sin costo cargado' : 'reservado'}
        bajada={obra.n_comprobantes != null ? `${obra.n_comprobantes} comprobantes${tam === 28 ? ' · detalle completo' : ''}` : 'sin comprobantes'} />
      <CifraGrande tam={tam} rotulo="Certificados" valor={certificados} falta={veComercial ? 'sin certificar' : 'reservado'} testid="cifra-certificados"
        tono={cobrados ? 'pos' : 'ink'}
        bajada={plan?.cobrado != null ? `${plataCorta(plan.cobrado)} cobrados` : 'sin cobros'} />
    </>
  )

  return (
    <>
      {/* ═══ Z01 · ESCRITORIO ═══ */}
      <div className="hidden md:grid" style={{ padding: '30px', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: '52px', alignItems: 'start' }}
        data-testid="resumen-cierre">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '34px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '64px', flexWrap: 'wrap' }} data-testid="cifras-cierre">
            {cifras(28)}
            <CifraGrande rotulo="HH" valor={hh.valor} falta={hh.falta} bajada={hh.bajada} testid="cifra-hh" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} data-testid="lo-que-dejo">
            <TituloBloque>Lo que dejó la obra</TituloBloque>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px 120px 100px', gap: '20px', height: '34px', alignItems: 'center',
                borderBottom: `1px solid ${C.borde}`, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
              }}>
                <div>Rubro</div><div style={{ textAlign: 'right' }}>Plan</div><div style={{ textAlign: 'right' }}>Real</div><div style={{ textAlign: 'right' }}>Desvío</div>
              </div>
              {rubros.length === 0 && (
                <div style={{ padding: '14px 0', fontSize: '12.5px' }}><SinDato>sin HH imputadas</SinDato></div>
              )}
              {rubros.map((r) => (
                <div key={r.rubro} data-testid={`hh-rubro-${r.rubro}`} style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px 120px 100px', gap: '20px', height: '48px', alignItems: 'center',
                  borderBottom: `1px solid ${C.borde}`, fontSize: '13.5px', color: C.tinta,
                }}>
                  <div>{r.rubro}</div>
                  <div style={{ textAlign: 'right', fontFamily: MONO }}>{r.plan != null ? `${numAR(r.plan)} h` : <SinDato>sin plan</SinDato>}</div>
                  <div style={{ textAlign: 'right', fontFamily: MONO }}>{r.real != null ? `${numAR(r.real)} h` : <SinDato>sin imputar</SinDato>}</div>
                  <div style={{ textAlign: 'right', fontFamily: MONO, color: r.desvioPct == null ? C.tenue : r.desvioPct > 0 ? C.warn : C.pos }}>
                    {desvio(r.desvioPct) ?? '—'}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '12.5px', color: C.tenue }}>
              El rendimiento observado queda como muestra para la base maestra; se acepta a mano, crea versión nueva del análisis.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} data-testid="antes-de-archivar">
            <TituloBloque>Antes de archivar</TituloBloque>
            <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.borde}` }}>
              {pasos.map((p) => (
                <div key={p.clave} data-testid={`paso-${p.clave}`} style={{
                  height: '48px', display: 'flex', alignItems: 'center', gap: '14px', borderBottom: `1px solid ${C.borde}`, fontSize: '13.5px', color: C.tinta,
                }}>
                  <span style={{ width: '14px', display: 'flex', justifyContent: 'center', color: p.ok ? C.pos : C.tenue }}>
                    <Ico d={p.ok ? P.ok : P.pend} s={14} />
                  </span>
                  <span style={{ width: '160px', color: C.tintaSuave }}>{p.rotulo}</span>
                  <span style={{ flex: 1, color: p.ok ? C.tenue : C.tinta }}>{p.texto}</span>
                  {p.accion && (
                    <Link href={p.accion.href} prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 500, color: C.tinta }}>
                      {p.accion.texto}<Ico d={P.derecha} s={12} />
                    </Link>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: '12.5px', color: C.tenue }}>Nada de esto bloquea archivar.</div>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '30px', paddingLeft: '34px', borderLeft: `1px solid ${C.borde}` }} data-testid="aside-cierre">
          <BloqueAside titulo="La obra" testid="ficha-obra">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {veComercial && <FilaKV k="Contratado" v={obra.monto_contratado != null ? <span style={{ fontFamily: MONO }}>{plataCorta(obra.monto_contratado)}</span> : <SinDato>sin cargar</SinDato>} />}
              {veComercial && <FilaKV k="Costo real" v={obra.costo_real != null ? <span style={{ fontFamily: MONO }}>{plataCorta(obra.costo_real)}</span> : <SinDato>sin costo cargado</SinDato>} />}
              {veComercial && <FilaKV k="Margen" tono={margen.tono} v={margen.tono === 'faint' ? <SinDato>{margen.texto}</SinDato> : margen.texto} />}
              <FilaKV k="Inicio real" v={obra.fecha_inicio_real ? <span style={{ fontFamily: MONO }}>{fecha(obra.fecha_inicio_real)}</span> : <SinDato>sin registrar</SinDato>} />
              <FilaKV k="Fin real" v={obra.fecha_fin_real ? <span style={{ fontFamily: MONO }}>{fecha(obra.fecha_fin_real)}</span> : <SinDato>sin registrar</SinDato>} />
              <FilaKV k="Línea base" v={sellada ? <span style={{ fontFamily: MONO }}>sellada {fechaCorta(sellada)}</span> : <SinDato>sin sellar</SinDato>} />
            </div>
          </BloqueAside>

          <BloqueAside titulo="Archivar la obra" testid="archivar-la-obra">
            <div style={{ fontSize: '13px', color: C.tintaMedia, lineHeight: 1.55 }}>{textoArchivar}</div>
            {yaArchivada
              ? <BotonCierre accion={reactivar} filo="neutro" alto={34} testid="archivar-obra">Reactivar</BotonCierre>
              : <BotonCierre accion={archivar} filo="rojo" alto={34} testid="archivar-obra">Archivar</BotonCierre>}
            <div style={{ fontSize: '12px', color: C.tenue }}>En la cartera queda en «archivadas fuera de esta lista · Verlas».</div>
          </BloqueAside>
          {editar != null && <div data-testid="editar-obra-bloque">{editar}</div>}
        </aside>
      </div>

      {/* ═══ MZ1 · TELÉFONO ═══ */}
      <div className="md:hidden" style={{ padding: '16px 16px 100px', display: 'flex', flexDirection: 'column', gap: '16px' }}
        data-testid="resumen-cierre-telefono">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>{cifras(24)}</div>
        <BloqueTelefono titulo="Cierre" testid="cierre-telefono">
          {[
            { k: 'Último parte', sub: ultimoParte ? `${ultimoParte.actividad}${ultimoParte.pct != null ? ` · ${numAR(ultimoParte.pct)} %` : ''}` : 'sin partes cargados', v: ultimoParte?.fecha ?? null },
            { k: 'HH totales', sub: hh.bajada, v: hh.valor },
            { k: 'Impedimentos abiertos', sub: null, v: String(abiertas.length) },
          ].map((f, i, arr) => (
            <div key={f.k} style={{
              minHeight: '44px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: C.tinta,
              borderBottom: i < arr.length - 1 ? `1px solid ${C.borde}` : 'none',
            }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.k}</div>
                {f.sub && <div style={{ fontSize: '12px', color: C.tintaSuave }}>{f.sub}</div>}
              </div>
              <span style={{ fontFamily: MONO, color: f.v == null ? C.tenue : C.tinta }}>{f.v ?? '—'}</span>
            </div>
          ))}
        </BloqueTelefono>
        <BloqueTelefono titulo="Archivar la obra">
          <div style={{ fontSize: '12.5px', color: C.tintaSuave, lineHeight: 1.5 }}>{textoArchivar}</div>
        </BloqueTelefono>
        {editar != null && <div>{editar}</div>}
      </div>
      <div className="md:hidden" style={{
        position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie,
        borderTop: `1px solid ${C.borde}`, zIndex: 20,
      }}>
        {yaArchivada
          ? <BotonCierre accion={reactivar} filo="neutro" alto={48} testid="archivar-obra-telefono">Reactivar la obra</BotonCierre>
          : <BotonCierre accion={archivar} filo="rojo" alto={48} testid="archivar-obra-telefono">Archivar la obra</BotonCierre>}
      </div>
    </>
  )
}

/** El color de un tono, para quien arma filas fuera de este archivo. */
export const COLOR_TONO = TONO_TEXTO
