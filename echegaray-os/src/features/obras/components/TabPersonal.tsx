// ═══ 08 · OBRA PERSONAL — PORTE LITERAL DE `erp-obras/08.html` Y `M10.html` (dueño, 23/09/2026) ═══
//
// Cuatro cifras de 26px —Asignados · HH esta semana · HH acumuladas · Costo de esas horas («no se
// calcula» + cuántos legajos sin categoría de convenio)—, la tabla «Quién está asignado» (Persona ·
// Categoría · Cuadrilla · Rol · HH sem. · Desde, filas de 56px) y el aside de 320px con «Horas por
// semana» (barras de 6px, «sin reg.» punteado). La primaria es «Asignar persona» y se abre acá
// mismo. En el teléfono (M10): dos azulejos, pastillas Hoy · Asignados · Sin fichar · Horas y filas
// de 56px con presente / sin fichar y las horas de hoy.
//
// ═══ ES LA MISMA RELACIÓN QUE MUESTRA LA FICHA DE LA PERSONA ═══
//
// Esta solapa NO es un segundo maestro de personas: lee `obra_asignacion` —la misma tabla que lee
// `/administracion/personas/<id>`— y `registros_hh`, la única fuente de las horas. Ninguna de las
// dos pantallas guarda un resumen propio, y por eso no pueden decir cosas distintas. La presencia
// de hoy se lee UNA vez (`getPresencia`) y alimenta los azulejos y las filas del teléfono.
//
// ═══ LO QUE NO SE CALCULA, NO SE CALCULA ═══
//
// «Costo de esas horas» lee la definición única (`costo_de_obras_a_la_fecha`): recibos + negro de las
// horas valorizadas. Las horas sin tarifa NO se adivinan: no suman y se dicen en la bajada («N h sin
// tarifa»). Hasta el 23/09/2026 decía «no se calcula» siempre, aun con todas las categorías cargadas.
//
// ═══ LAS CARGAS QUE EL DISEÑO NO DIBUJA SIGUEN ACÁ, PLEGADAS ═══
//
// Cerrar y quitar asignaciones, imputar horas (individual y a la cuadrilla), plan contra real por
// actividad y el detalle de horas imputadas no están en el 08 pero son las únicas puertas a esas
// escrituras: viven debajo, en filas plegables de 44px, sin competir con lo que se mira.

import { createClient } from '@/lib/supabase/server'
import { getPresencia } from '@/features/administracion/services/presenciaService'
import {
  BotonAccion, FormAccion, type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import { Aviso, CAMPO, Campo, Nulo, Plegable, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import type { ActividadHH, RegistroHH } from '../services/personalService'
import {
  ddmm, hhAcumuladas, hhDeSemana, hhSemanaPorPersona, horasPorSemana,
  lunesDeSemana, numeroDeSemana, rotuloSemana, sublineaPersonalTelefono,
} from '../services/personalService'
import { horasDeHoy, hoyEnObra } from '../services/presenciaObra'
import type { Actividad, Asignacion, Persona } from '../types'
import type { PlanDePersonal } from '../services/obrasService'
import { etiquetaCategoria } from '@/features/administracion/types'
import { FormIndividual, FormMasiva, TablaHoras, TablaProductividad } from './PersonalHH'
import { horasPorAsignado } from '../services/productividadHH'
import { plataCorta } from './formato'
import type { ManoObraPropia } from '../types/economia'
import { C, MONO } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { TabPersonalTelefono, type FilaPersonalTelefono } from './TabPersonalTelefono'

const GRID = 'minmax(0,1fr) 130px 120px 108px 82px 96px'
/** Por debajo de esto la tabla scrollea POR DENTRO (536px fijos + 100px de gaps). */
const MIN_TABLA = 800
const n = (x: number) => Math.round(x).toLocaleString('es-AR')
const EYEBROW: React.CSSProperties = { fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }

function Cifra({ rotulo, valor, falta, bajada }: { rotulo: string; valor: string | null; falta: string; bajada?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} data-testid={`cifra-${rotulo.toLowerCase().replace(/\s+/g, '-')}`}>
      <div style={EYEBROW}>{rotulo}</div>
      <div style={{ fontSize: '26px', fontWeight: 600, letterSpacing: '-.02em', color: valor == null ? C.tenue : C.tinta, fontVariantNumeric: 'tabular-nums' }}>
        {valor ?? <span data-nulo="">{falta}</span>}
      </div>
      {bajada && <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>{bajada}</div>}
    </div>
  )
}

/** UN ALTA COMO ACCIÓN DISCRETA: la primaria «Asignar persona» abre su panel acá mismo. Sin estado
 *  de cliente: lo resuelve `<details>`, y por eso la solapa entera sigue siendo de servidor. */
function Alta({ titulo, testid, children, primaria = false, telefono = false }: {
  titulo: string; testid: string; children: React.ReactNode; primaria?: boolean; telefono?: boolean
}) {
  return (
    <details className={primaria ? 'relative min-w-0' : 'w-full min-w-0 sm:w-auto'} data-testid={testid}>
      <summary
        className={primaria
          ? telefono
            ? 'flex h-12 cursor-pointer select-none items-center justify-center gap-2 rounded-[6px] bg-marca text-[14px] font-semibold text-[color:var(--os-on-marca)] [&::-webkit-details-marker]:hidden'
            : 'inline-flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-[6px] bg-marca px-[14px] text-[13px] font-semibold text-[color:var(--os-on-marca)] hover:brightness-[0.97] [&::-webkit-details-marker]:hidden'
          : 'cursor-pointer select-none text-[12.5px] text-muted hover:text-ink'}
      >
        {telefono && <Ico d={P.mas} s={15} />}{titulo}
      </summary>
      <div className={primaria
        ? telefono
          ? 'absolute bottom-full left-0 right-0 z-30 mb-2 max-h-[70vh] overflow-auto rounded-card border border-line bg-surface p-4 shadow-pop'
          : 'absolute right-0 z-30 mt-2 w-[560px] max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-4 shadow-pop'
        : 'mt-3 border-t border-surface-sunken pt-3.5'}
      >
        {children}
      </div>
    </details>
  )
}

/** ASIGNAR UNA PERSONA A ESTA OBRA — el formulario, UNA sola definición para el escritorio y el
 *  teléfono (el `<details>` cambia; el formulario no). */
function FormAsignar({ personas, cuadrillas, actividades, asignar }: {
  personas: Persona[]
  cuadrillas: { id: string; nombre: string; integrantes: number }[]
  actividades: Actividad[]
  asignar: AccionFormulario
}) {
  if (personas.length === 0) {
    return <Aviso tono="warn">No hay ninguna persona activa en el legajo, así que no hay a quién asignar.</Aviso>
  }
  return (
    <FormAccion accion={asignar} testid="form-asignar" enviar="Asignar" limpiarAlOk mensajeOk="Asignado.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo rotulo="Persona" className="col-span-2">
          <select name="persona_id" required className={CAMPO} defaultValue="">
            <option value="" disabled>elegir del legajo</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Rol">
          <select name="rol" defaultValue="integrante" className={CAMPO}>
            <option value="integrante">integrante</option>
            <option value="responsable">responsable</option>
          </select>
        </Campo>
        <Campo rotulo="Cuadrilla">
          <select name="cuadrilla_id" defaultValue="" className={CAMPO}>
            <option value="">sin cuadrilla</option>
            {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Desde"><input type="date" name="desde" className={CAMPO} /></Campo>
        <Campo rotulo="Actividad" className="col-span-2 sm:col-span-3" ayuda="Opcional: en blanco queda asignado a la obra entera.">
          <select name="actividad_id" defaultValue="" className={CAMPO}>
            <option value="">toda la obra</option>
            {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Notas" className="col-span-2 sm:col-span-4" ayuda="Por qué está en esta obra.">
          <input name="notas" maxLength={300} className={CAMPO} />
        </Campo>
      </div>
    </FormAccion>
  )
}

function TablaAsignaciones({ asignaciones, actividadDe, porAsignado, cerrar, quitar }: {
  asignaciones: Asignacion[]
  actividadDe: Map<string, string>
  porAsignado: Map<string, number>
  cerrar: (asignacionId: string) => Promise<ResultadoAccion>
  quitar: (asignacionId: string) => Promise<ResultadoAccion>
}) {
  return (
    <Tabla testid="tabla-personal" minWidth={720}>
      <THead>
        <Th>Persona</Th><Th>Rol / categoría</Th><Th>Cuadrilla</Th><Th>Actividad</Th><Th num>HH</Th><Th num />
      </THead>
      <tbody>
        {asignaciones.map((a) => (
          <Tr key={a.id} {...{ 'data-testid': 'fila-asignacion' }}>
            <Td fuerte>{a.persona_nombre ?? <span className="text-warn">persona borrada del legajo</span>}</Td>
            <Td>{a.rol}{a.persona_categoria && <span className="block text-[11px] text-faint">{etiquetaCategoria(a.persona_categoria)}</span>}</Td>
            <Td>{a.cuadrilla ?? <Nulo>sin cuadrilla</Nulo>}</Td>
            <Td>
              {a.actividad_id ? (actividadDe.get(a.actividad_id) ?? <Nulo>actividad archivada</Nulo>) : 'toda la obra'}
              {a.hasta && <span className="block text-[11px] text-faint">hasta {a.hasta}</span>}
            </Td>
            <Td num fuerte>{porAsignado.get(a.id)?.toLocaleString('es-AR', { maximumFractionDigits: 1 }) ?? <Nulo>sin imputar</Nulo>}</Td>
            <Td num>
              {/* CERRAR conserva el período; QUITAR borra la fila y sólo sirve para el alta hecha por error. */}
              {a.hasta
                ? <BotonAccion accion={quitar} args={[a.id]} testid="quitar-asignacion" tono="peligro">Quitar</BotonAccion>
                : <BotonAccion accion={cerrar} args={[a.id]} testid="cerrar-asignacion">Cerrar</BotonAccion>}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  )
}

export async function TabPersonal({
  obraId, plan, asignaciones, personas, cuadrillas, actividades, actividadHH, registros,
  asignar, cerrar, quitar, imputar, imputarMasivo, borrarHoras, causas = [],
  manoObra = null, veComercial = false,
}: {
  /** `costo_de_obras_a_la_fecha` de esta obra (la definición única de Economía y el CRM) · `null` = no se pudo leer. */
  manoObra?: ManoObraPropia | null
  veComercial?: boolean
  /** LA OBRA, RECIBIDA Y NO DEDUCIDA: una obra recién abierta no tiene de dónde adivinarla. */
  obraId: string
  plan: PlanDePersonal | null
  asignaciones: Asignacion[]
  personas: Persona[]
  cuadrillas: { id: string; nombre: string; integrantes: number }[]
  actividades: Actividad[]
  actividadHH: ActividadHH[]
  registros: RegistroHH[]
  asignar: AccionFormulario
  cerrar: (asignacionId: string) => Promise<ResultadoAccion>
  quitar: (asignacionId: string) => Promise<ResultadoAccion>
  imputar: AccionFormulario
  causas?: { clave: string; nombre: string }[]
  imputarMasivo: AccionFormulario
  borrarHoras: (registroId: string) => Promise<ResultadoAccion>
}) {
  void plan
  const hoy = new Date().toISOString().slice(0, 10)
  const lunes = lunesDeSemana(hoy)
  const vigentes = asignaciones.filter((a) => !a.hasta)
  const porAsignado = horasPorAsignado(asignaciones, registros)
  const actividadDe = new Map(actividades.map((a) => [a.id, a.nombre]))
  const sinPersona = registros.filter((r) => !r.persona_id).length
  const hhSemana = hhDeSemana(registros, lunes)
  const hhTotal = hhAcumuladas(registros)
  const porPersonaSemana = hhSemanaPorPersona(registros, lunes)
  const semanas = horasPorSemana(registros, hoy)

  // LA PRESENCIA DE HOY, LEÍDA UNA VEZ. Un control que no pudo mirar no dice «no está»: con la
  // lectura caída los azulejos dicen «sin lectura» y ninguna fila afirma presente ni ausente.
  const supabase = await createClient()
  const presencia = await getPresencia(supabase, hoy, obraId)
  const r = presencia.data ? hoyEnObra(asignaciones, presencia.data) : null
  const horasHoy = horasDeHoy(registros, hoy)
  const presentesPorPersona = new Map<string, boolean>()
  if (r) for (const g of r.grupos) for (const f of g.filas) presentesPorPersona.set(f.personaId, f.marca != null)

  const filasTelefono: FilaPersonalTelefono[] = vigentes.map((a) => ({
    personaId: a.persona_id,
    nombre: a.persona_nombre ?? 'persona borrada del legajo',
    sublinea: sublineaPersonalTelefono(a, a.persona_categoria ? etiquetaCategoria(a.persona_categoria) : null),
    presente: r ? (presentesPorPersona.get(a.persona_id) ?? false) : null,
    horasHoy: horasHoy.porPersona.get(a.persona_id) ?? null,
  }))
  const cuadrillasSemana = new Set(vigentes.map((a) => a.cuadrilla).filter(Boolean)).size

  const formulario = <FormAsignar personas={personas} cuadrillas={cuadrillas} actividades={actividades} asignar={asignar} />

  return (
    <div className="flex flex-col gap-6">
      {/* ═══ ESCRITORIO (08) ═══ */}
      <div className="hidden md:block" style={{ padding: '4px 10px 8px' }} data-testid="personal-escritorio">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
          <Alta titulo="Asignar persona" testid="alta-asignacion" primaria>{formulario}</Alta>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: '52px', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '76px', flexWrap: 'wrap' }} data-testid="cifras-personal">
              <Cifra rotulo="Asignados" valor={String(vigentes.length)} falta="—" />
              <Cifra rotulo="HH esta semana" valor={hhSemana == null ? null : n(hhSemana)} falta="sin registrar" />
              <Cifra rotulo="HH acumuladas" valor={hhTotal == null ? null : n(hhTotal)} falta="sin registrar" />
              {/* El costo sale de la definición única (recibos + negro de las horas valorizadas); las
                  horas sin tarifa no suman y se dicen. Antes decía «no se calcula» siempre. */}
              <Cifra rotulo="Costo de esas horas"
                valor={veComercial && manoObra?.puedeVer && manoObra.importe != null ? plataCorta(manoObra.importe) : null}
                falta={!veComercial || manoObra?.puedeVer === false ? 'no lo ve tu nivel' : manoObra == null ? 'no se pudo leer' : 'sin horas valorizadas'}
                bajada={!veComercial || !manoObra?.puedeVer ? '' : [
                  manoObra.horasValorizadas != null ? `${manoObra.horasValorizadas.toLocaleString('es-AR')} h valorizadas` : null,
                  manoObra.estimado ? `${plataCorta(manoObra.estimado)} estimado` : null,
                  manoObra.horasSinDato > 0 ? `${manoObra.horasSinDato} h sin tarifa` : null,
                ].filter(Boolean).join(' · ') || 'todo con recibo'} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: C.tinta }}>Quién está asignado</div>
                <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>{rotuloSemana(hoy)}</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: `${MIN_TABLA}px` }} data-testid="tabla-asignados">
                  <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '20px', height: '32px', alignItems: 'center', borderBottom: `1px solid ${C.borde}`, ...EYEBROW }}>
                    <div>Persona</div><div>Categoría</div><div>Cuadrilla</div><div>Rol</div><div style={{ textAlign: 'right' }}>HH sem.</div><div>Desde</div>
                  </div>
                  {vigentes.map((a, i) => {
                    const hh = porPersonaSemana.get(a.persona_id)
                    return (
                      <div key={a.id} data-testid={`fila-asignado-${a.id}`} style={{
                        display: 'grid', gridTemplateColumns: GRID, gap: '20px', height: '56px', alignItems: 'center', fontSize: '13.5px', color: C.tinta,
                        borderBottom: i === vigentes.length - 1 ? undefined : `1px solid ${C.borde}`,
                      }}>
                        <div style={{ fontWeight: a.rol === 'responsable' ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.persona_nombre ?? <span style={{ color: C.warn }}>persona borrada del legajo</span>}
                        </div>
                        <div style={{ color: a.persona_categoria ? C.tintaMedia : C.warn }}>{a.persona_categoria ? etiquetaCategoria(a.persona_categoria) : 'sin categoría'}</div>
                        <div style={{ color: a.cuadrilla ? C.tintaMedia : C.tenue }}>{a.cuadrilla ?? 'sin cuadrilla'}</div>
                        <div style={{ color: C.tintaMedia }}>{a.rol === 'responsable' ? 'Responsable' : 'Integrante'}</div>
                        <div style={{ textAlign: 'right', color: hh == null ? C.tenue : C.tinta, fontVariantNumeric: 'tabular-nums' }}>
                          {hh == null ? <span data-nulo="">sin registrar</span> : hh.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
                        </div>
                        <div style={{ color: C.tintaSuave, fontSize: '12.5px' }}>{a.desde ? ddmm(a.desde) : <span data-nulo="">sin fecha</span>}</div>
                      </div>
                    )
                  })}
                  {vigentes.length === 0 && (
                    <div style={{ padding: '18px 0', fontSize: '12.5px', color: C.tintaSuave }}>Nadie tiene una asignación vigente en esta obra. Se asigna con «Asignar persona».</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: '26px', paddingLeft: '34px', borderLeft: `1px solid ${C.borde}` }} data-testid="horas-por-semana">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
              <div style={EYEBROW}>Horas por semana</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '13.5px' }}>
                {semanas.map((s) => (
                  <div key={s.rotulo} style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                    <span style={{ width: '52px', color: C.tintaSuave, fontSize: '12.5px' }}>{s.rotulo}</span>
                    {s.horas == null
                      ? <span style={{ flex: 1, height: '6px', borderRadius: '3px', background: C.tenueFondo, border: `1px dashed ${C.bordeFuerte}`, boxSizing: 'border-box' }} />
                      : (
                        <span style={{ flex: 1, height: '6px', borderRadius: '3px', background: C.borde, overflow: 'hidden' }}>
                          <span style={{ display: 'block', width: `${s.pct ?? 0}%`, height: '100%', background: C.grafito }} />
                        </span>
                      )}
                    <span style={{ width: '38px', textAlign: 'right', color: s.horas == null ? C.tenue : C.tinta, fontSize: s.horas == null ? '12px' : undefined, fontVariantNumeric: 'tabular-nums' }}>
                      {s.horas == null ? 'sin reg.' : n(s.horas)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              <div style={EYEBROW}>La frontera</div>
              <div style={{ fontSize: '12.5px', color: C.tintaSuave, lineHeight: 1.5 }}>
                Esta solapa no administra legajos: la categoría de convenio y el legajo se cargan en Administración.
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ═══ TELÉFONO (M10) ═══ */}
      <div className="md:hidden">
        <TabPersonalTelefono
          filas={filasTelefono}
          azulejos={{
            presentes: r ? r.enObra + r.cerraron : null,
            asignados: vigentes.length,
            sinFichar: r ? r.sinFichar : null,
            numeroSemana: numeroDeSemana(hoy),
            hhSemana,
            personasSemana: porPersonaSemana.size,
            cuadrillas: cuadrillasSemana,
          }}
          primaria={<Alta titulo="Asignar persona" testid="alta-asignacion-telefono" primaria telefono>{formulario}</Alta>}
        />
      </div>

      {/* ═══ LAS CARGAS QUE EL 08 NO DIBUJA, PLEGADAS ═══ */}
      <Plegable titulo="Asignaciones: cerrar o quitar" cuenta={asignaciones.length} testid="plegable-asignaciones">
        {asignaciones.length === 0
          ? <Vacio>Nadie tiene una asignación en esta obra. Se asigna con «Asignar persona».</Vacio>
          : <TablaAsignaciones asignaciones={asignaciones} actividadDe={actividadDe} porAsignado={porAsignado} cerrar={cerrar} quitar={quitar} />}
        <div className="mt-3.5 flex flex-wrap items-start gap-x-6 gap-y-3">
          <Alta titulo="+ Imputar horas" testid="alta-hh">
            <FormIndividual personas={personas} asignadas={asignaciones.map((a) => a.persona_id)} actividades={actividades} imputar={imputar} causas={causas} />
          </Alta>
          <Alta titulo="+ Imputar a la cuadrilla" testid="alta-hh-masiva">
            <FormMasiva asignaciones={asignaciones} actividades={actividades} imputarMasivo={imputarMasivo} />
          </Alta>
        </div>
      </Plegable>

      <Plegable titulo="Plan contra real por actividad" cuenta={actividadHH.length} testid="plegable-plan-vs-real">
        <TablaProductividad actividades={actividadHH} />
      </Plegable>

      <Plegable titulo="Horas imputadas a esta obra" cuenta={registros.length} testid="plegable-horas"
        {...(sinPersona > 0 ? { alerta: `${sinPersona} ${sinPersona === 1 ? 'registro sin persona' : 'registros sin persona'}` } : {})}>
        <TablaHoras registros={registros} borrarHoras={borrarHoras} />
        {sinPersona > 0 && (
          <p className="mt-2.5 text-[11px] text-faint">
            {sinPersona} {sinPersona === 1 ? 'registro sin persona' : 'registros sin persona'}: son horas reales sin dueño conocido.
          </p>
        )}
      </Plegable>
    </div>
  )
}
