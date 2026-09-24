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
// ═══ LAS CARGAS QUE EL DISEÑO NO DIBUJA, EN SU MISMO LENGUAJE (dueño, 24/09/2026) ═══
//
// Cerrar y quitar asignaciones, imputar horas (individual y a la cuadrilla), plan contra real por
// actividad y el detalle de horas imputadas no están en el 08 pero son las únicas puertas a esas
// escrituras. Hasta el 24/09 vivían al pie en tres `Plegable` del DS genérico, con una segunda
// tabla de asignaciones que repetía la de arriba. Ahora:
//   · cerrar / quitar viven EN la fila de «Quién está asignado»: se toca la fila y se abre su
//     detalle debajo (actividad, horas en la obra, notas y la acción). Las cerradas —que el 08 no
//     muestra porque no están asignadas— van plegadas debajo, «Cerradas · N», con «Quitar».
//   · en el teléfono la fila del M10 abre una hoja con lo mismo y la acción al pie (44px).
//   · imputar horas es una acción secundaria —botón blanco— en la cabecera de «Horas imputadas».
//   · «Plan contra real» y «Horas imputadas» son secciones con el eyebrow y las filas del 08.
// Nada se quitó: las mismas seis escrituras, con los mismos formularios.

import { createClient } from '@/lib/supabase/server'
import { getPresencia } from '@/features/administracion/services/presenciaService'
import { FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import { Aviso, CAMPO, Campo } from '@/shared/components/ds'
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
import { AccionFila } from './canon/AccionFila'
import { TabPersonalTelefono, type FilaPersonalTelefono } from './TabPersonalTelefono'
import { nombreDePersona } from '../../../shared/personas/nombre.ts'

/** Las seis columnas del 08 y, al final, 16px para el chevron que dice «esta fila se abre». */
const GRID = 'minmax(0,1fr) 130px 120px 108px 82px 96px 16px'
/** Por debajo de esto la tabla scrollea POR DENTRO (552px fijos + 120px de gaps). */
const MIN_TABLA = 820
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
            {personas.map((p) => <option key={p.id} value={p.id}>{nombreDePersona(p.nombre_completo)}</option>)}
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

const hh1 = (x: number) => x.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/** Un dato del detalle de la fila: rótulo tenue y valor, en una línea. */
function Dato({ rotulo, children, nulo = false }: { rotulo: string; children: React.ReactNode; nulo?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
      <span style={{ color: C.tenue }}>{rotulo}</span>
      <span style={{ color: nulo ? C.tenue : C.tintaMedia, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </span>
  )
}

/**
 * UNA FILA DE «QUIÉN ESTÁ ASIGNADO» QUE SE ABRE AHÍ MISMO.
 *
 * DECISIÓN QUE EL 08 NO CUBRE (24/09/2026): la fila es el `<summary>` de un `<details>`. Tocarla
 * despliega debajo su detalle —actividad, horas en la obra, notas— y la única acción que le
 * corresponde: CERRAR si está vigente (escribe `hasta` y conserva el período), QUITAR si ya está
 * cerrada (borra la fila; es para el alta hecha por error). Un menú flotante quedaría recortado por
 * el `overflow-x` de la tabla; la banda debajo no, y no mueve nada de lo que se estaba mirando.
 * Sin estado de cliente: la solapa sigue siendo de servidor.
 */
function FilaAsignado({ a, ultima, hhSemana, hhObra, actividad, cerrar, quitar }: {
  a: Asignacion
  ultima: boolean
  hhSemana: number | undefined
  hhObra: number | undefined
  /** `null` = toda la obra · `undefined` = la actividad ya no está (archivada). */
  actividad: string | null | undefined
  cerrar: (asignacionId: string) => Promise<ResultadoAccion>
  quitar: (asignacionId: string) => Promise<ResultadoAccion>
}) {
  const cerrada = !!a.hasta
  return (
    <details className="group" data-testid="fila-asignacion" style={{ borderBottom: ultima ? undefined : `1px solid ${C.borde}` }}>
      <summary data-testid={`fila-asignado-${a.id}`}
        className="cursor-pointer list-none hover:bg-surface-quiet [&::-webkit-details-marker]:hidden"
        style={{ display: 'grid', gridTemplateColumns: GRID, gap: '20px', height: '56px', alignItems: 'center', fontSize: '13.5px', color: cerrada ? C.tintaSuave : C.tinta }}>
        <div style={{ fontWeight: a.rol === 'responsable' && !cerrada ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {a.persona_nombre ?? <span style={{ color: C.warn }}>persona borrada del legajo</span>}
        </div>
        <div style={{ color: a.persona_categoria ? C.tintaMedia : C.warn }}>{a.persona_categoria ? etiquetaCategoria(a.persona_categoria) : 'sin categoría'}</div>
        <div style={{ color: a.cuadrilla ? C.tintaMedia : C.tenue }}>{a.cuadrilla ?? 'sin cuadrilla'}</div>
        <div style={{ color: C.tintaMedia }}>{a.rol === 'responsable' ? 'Responsable' : 'Integrante'}</div>
        <div style={{ textAlign: 'right', color: hhSemana == null ? C.tenue : C.tinta, fontVariantNumeric: 'tabular-nums' }}>
          {hhSemana == null ? <span data-nulo="">sin registrar</span> : hh1(hhSemana)}
        </div>
        <div style={{ color: C.tintaSuave, fontSize: '12.5px', whiteSpace: 'nowrap' }}>
          {a.desde ? ddmm(a.desde) : <span data-nulo="">sin fecha</span>}
          {cerrada && <> → {ddmm(a.hasta as string)}</>}
        </div>
        <span className="transition-transform group-open:rotate-90" style={{ display: 'flex', color: C.fantasma }}><Ico d={P.derecha} s={14} /></span>
      </summary>
      <div style={{ display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap', padding: '2px 0 16px', fontSize: '12.5px' }} data-testid="detalle-asignacion">
        <Dato rotulo="Actividad" nulo={actividad === undefined}>{actividad === null ? 'toda la obra' : actividad ?? 'actividad archivada'}</Dato>
        <Dato rotulo="HH en la obra" nulo={hhObra == null}>{hhObra == null ? 'sin imputar' : hh1(hhObra)}</Dato>
        {a.notas && <Dato rotulo="Notas">{a.notas}</Dato>}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: C.tenue }}>{cerrada ? 'borra la fila: sólo para un alta por error' : 'conserva el período y sus horas'}</span>
          {cerrada
            ? <AccionFila accion={quitar} args={[a.id]} testid="quitar-asignacion" tono="peligro">Quitar</AccionFila>
            : <AccionFila accion={cerrar} args={[a.id]} testid="cerrar-asignacion">Cerrar asignación</AccionFila>}
        </span>
      </div>
    </details>
  )
}

/** El título de sección del 08 («Quién está asignado»): 14px/600, la bajada en 12,5 y lo de la derecha. */
function Seccion({ titulo, bajada, alerta, derecha, testid, children }: {
  titulo: string; bajada?: string; alerta?: string; derecha?: React.ReactNode; testid: string; children: React.ReactNode
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }} data-testid={testid}>
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
        <div style={{ fontSize: '14px', fontWeight: 600, color: C.tinta }}>{titulo}</div>
        {bajada && <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>{bajada}</div>}
        {alerta && <div style={{ fontSize: '12.5px', color: C.warn }} data-testid={`${testid}-alerta`}>{alerta}</div>}
        {derecha && <div className="w-full md:ml-auto md:w-auto">{derecha}</div>}
      </div>
      {children}
    </section>
  )
}

/**
 * IMPUTAR HORAS, COMO ACCIÓN SECUNDARIA — dos botones blancos (la secundaria del zip) en la cabecera
 * de «Horas imputadas». Escritorio: el formulario flota debajo, anclado a la derecha. Teléfono: dos
 * botones de 44px a todo el ancho, uno sobre otro, y el formulario se abre en el lugar.
 * `name` hace que abrir uno cierre el otro: dos formularios de horas abiertos a la vez se pisan.
 */
function Imputar({ titulo, testid, icono, children }: { titulo: string; testid: string; icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <details name="imputar-horas" className="w-full min-w-0 md:w-auto" data-testid={testid}>
      <summary className="flex h-11 cursor-pointer list-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] px-[11px] md:h-8 [&::-webkit-details-marker]:hidden"
        style={{ border: `1px solid ${C.borde}`, background: C.superficie, fontSize: '12.5px', color: C.tintaMedia }}>
        <Ico d={icono} s={13} />{titulo}
      </summary>
      <div className="mt-3 md:absolute md:shadow-pop md:right-0 md:top-full md:z-30 md:mt-2 md:w-[600px] md:max-w-[calc(100vw-2rem)]"
        style={{ padding: '16px', border: `1px solid ${C.borde}`, borderRadius: '8px', background: C.superficie }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: C.tinta, marginBottom: '12px' }}>{titulo}</div>
        {children}
      </div>
    </details>
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
  const cerradas = asignaciones.filter((a) => a.hasta)
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

  /** `null` = toda la obra · `undefined` = la actividad ya no está (archivada). */
  const actividadDeAsignacion = (a: Asignacion) => (a.actividad_id ? actividadDe.get(a.actividad_id) : null)
  const filaTelefono = (a: Asignacion): FilaPersonalTelefono => {
    const act = actividadDeAsignacion(a)
    return {
      asignacionId: a.id,
      personaId: a.persona_id,
      nombre: a.persona_nombre ?? 'persona borrada del legajo',
      sublinea: sublineaPersonalTelefono(a, a.persona_categoria ? etiquetaCategoria(a.persona_categoria) : null),
      presente: a.hasta ? null : r ? (presentesPorPersona.get(a.persona_id) ?? false) : null,
      horasHoy: a.hasta ? null : (horasHoy.porPersona.get(a.persona_id) ?? null),
      actividad: act === null ? 'toda la obra' : act ?? 'actividad archivada',
      hhObra: porAsignado.get(a.id) ?? null,
      desde: a.desde ? ddmm(a.desde) : null,
      hasta: a.hasta ? ddmm(a.hasta) : null,
      notas: a.notas,
    }
  }
  const filasTelefono = vigentes.map(filaTelefono)
  const cerradasTelefono = cerradas.map(filaTelefono)
  const cuadrillasSemana = new Set(vigentes.map((a) => a.cuadrilla).filter(Boolean)).size

  const formulario = <FormAsignar personas={personas} cuadrillas={cuadrillas} actividades={actividades} asignar={asignar} />

  return (
    // En el teléfono el pie fijo («Asignar persona», 78px) tapa lo último: el aire va al final de todo.
    <div className="flex flex-col gap-6 pb-20 md:pb-0">
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
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: `${MIN_TABLA}px` }} data-testid="tabla-personal">
                  <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '20px', height: '32px', alignItems: 'center', borderBottom: `1px solid ${C.borde}`, ...EYEBROW }}>
                    <div>Persona</div><div>Categoría</div><div>Cuadrilla</div><div>Rol</div><div style={{ textAlign: 'right' }}>HH sem.</div><div>Desde</div><div />
                  </div>
                  {vigentes.map((a, i) => (
                    <FilaAsignado key={a.id} a={a} ultima={i === vigentes.length - 1}
                      hhSemana={porPersonaSemana.get(a.persona_id)} hhObra={porAsignado.get(a.id)}
                      actividad={actividadDeAsignacion(a)} cerrar={cerrar} quitar={quitar} />
                  ))}
                  {vigentes.length === 0 && (
                    <div style={{ padding: '18px 0', fontSize: '12.5px', color: C.tintaSuave }}>Nadie tiene una asignación vigente en esta obra. Se asigna con «Asignar persona».</div>
                  )}
                  {/* LAS CERRADAS: el 08 no las dibuja porque ya no están asignadas, pero son el
                      período que respalda sus horas y la única puerta a «Quitar». Plegadas. */}
                  {cerradas.length > 0 && (
                    <details className="group/cerradas" data-testid="asignaciones-cerradas" style={{ borderTop: `1px solid ${C.borde}` }}>
                      <summary className="flex h-11 cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden" style={{ fontSize: '12.5px', color: C.tintaSuave }}>
                        <span className="transition-transform group-open/cerradas:rotate-90" style={{ display: 'flex' }}><Ico d={P.derecha} s={12} /></span>
                        Cerradas <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue }}>{cerradas.length}</span>
                      </summary>
                      {cerradas.map((a, i) => (
                        <FilaAsignado key={a.id} a={a} ultima={i === cerradas.length - 1}
                          hhSemana={porPersonaSemana.get(a.persona_id)} hhObra={porAsignado.get(a.id)}
                          actividad={actividadDeAsignacion(a)} cerrar={cerrar} quitar={quitar} />
                      ))}
                    </details>
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
          cerradas={cerradasTelefono}
          cerrar={cerrar}
          quitar={quitar}
          primaria={<Alta titulo="Asignar persona" testid="alta-asignacion-telefono" primaria telefono>{formulario}</Alta>}
        />
      </div>

      {/* ═══ PLAN CONTRA REAL Y HORAS IMPUTADAS — UNA sola vez para las dos caras ═══
          El 08 no las dibuja. Van debajo, a todo el ancho, con el título de sección del 08; las
          filas se reordenan solas en el teléfono (ver `PersonalHH`). Imputar horas es la
          secundaria de la sección de horas: botón blanco, no amarillo — la primaria es asignar. */}
      <div className="flex flex-col gap-[30px] md:px-[10px]" data-testid="personal-cargas">
        <Seccion titulo="Horas imputadas" testid="seccion-horas"
          bajada={registros.length === 0 ? undefined : `${registros.length} ${registros.length === 1 ? 'registro' : 'registros'}`}
          alerta={sinPersona > 0 ? `${sinPersona} ${sinPersona === 1 ? 'registro sin persona' : 'registros sin persona'}` : undefined}
          derecha={(
            <div className="flex flex-col gap-2 md:relative md:flex-row">
              <Imputar titulo="Imputar horas" testid="alta-hh" icono={P.hh}>
                <FormIndividual personas={personas} asignadas={asignaciones.map((a) => a.persona_id)} actividades={actividades} imputar={imputar} causas={causas} />
              </Imputar>
              <Imputar titulo="Imputar a la cuadrilla" testid="alta-hh-masiva" icono={P.cuadrilla}>
                <FormMasiva asignaciones={asignaciones} actividades={actividades} imputarMasivo={imputarMasivo} />
              </Imputar>
            </div>
          )}>
          <TablaHoras registros={registros} borrarHoras={borrarHoras} />
        </Seccion>

        <Seccion titulo="Plan contra real por actividad" testid="seccion-plan-vs-real">
          <TablaProductividad actividades={actividadHH} />
        </Seccion>
      </div>
    </div>
  )
}
