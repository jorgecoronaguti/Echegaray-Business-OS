// LAS HORAS DE LA OBRA — productividad por actividad, detalle y las dos formas de cargar.
//
// ═══ UN SOLO CÁLCULO DE PLAN CONTRA REAL ═══
//
// La tabla de productividad NO suma nada: muestra lo que publica `obra_actividad_hh`, que es la
// misma vista que lee Cronograma. Si esta pantalla volviera a sumar `registros_hh` por su cuenta,
// habría dos números para el mismo hecho y el día que difieran nadie sabría cuál mirar.
//
// ═══ EL DESVÍO SÓLO CON LAS DOS PUNTAS ═══
//
// Sin `hh_plan` cargada NO hay 0% de desvío: hay «HH plan sin cargar». Asumir cero convierte una
// actividad sin planificar en una actividad perfectamente cumplida, que es la mentira más cara que
// puede decir esta pantalla.

import type { CSSProperties } from 'react'
import { FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import { Ayuda, CAMPO, Campo, Vacio } from '@/shared/components/ds'
import { ddmm, type ActividadHH, type RegistroHH } from '../services/personalService'
import type { Actividad, Asignacion, Persona } from '../types'
import { senalProductividad } from '../services/productividadHH'
import { TIPOS_HORA, TIPO_HORA_LABEL, type TipoHora } from '../services/tipoHora'
import { C, MONO } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { Pastilla } from './canon/Piezas'
import { AccionFila } from './canon/AccionFila'
import { nombreDePersona } from '../../../shared/personas/nombre.ts'

const hh = (n: number | null) => (n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: 1 }))
const pct = (n: number | null) => (n == null ? '—' : `${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`)

// `lecturaProductividad` vive en `services/productividadHH.ts` y no acá: `node --test` no sabe leer
// `.tsx`, y una regla que decide si la pantalla dice la verdad tiene que poder probarse.

// ═══ LAS DOS LISTAS, EN EL LENGUAJE DEL 08 (dueño, 24/09/2026) ═══
//
// El 08 y el M10 no dibujan «Plan contra real» ni «Horas imputadas»: se escriben con la gramática que
// sí dibujan —eyebrow mono de 10,5 en mayúsculas arriba, filas de 44px con divisor `bordeTarjeta`,
// números a la derecha— en vez de la tabla del DS genérico que tenían. Una sola marca por lista: en
// el teléfono la misma fila se reordena por áreas de grilla (52px, nombre arriba y el resto en la
// sublínea), así el botón de quitar existe UNA vez y ningún testid se duplica entre las dos caras.

/** Cuántas filas de horas se ven sin tocar nada. El resto, detrás de «Ver las N anteriores». */
export const HORAS_A_LA_VISTA = 20

const FILA_BASE: CSSProperties = { borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: '13.5px', color: C.tinta }
const CABECERA: CSSProperties = {
  borderBottom: `1px solid ${C.borde}`, height: '32px', alignItems: 'center',
  fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
}
const NULO: CSSProperties = { color: C.tenue }
const SUBLINEA: CSSProperties = { fontSize: '12px', color: C.tintaSuave }

// Las áreas de grilla: en el teléfono dos renglones, en el escritorio una sola línea con columnas.
const PROD_GRILLA = 'grid gap-x-5 gap-y-0.5 py-2 md:py-0 min-h-[52px] md:min-h-[44px] items-center '
  + "grid-cols-[minmax(0,1fr)_auto] [grid-template-areas:'n_r'_'s_x'] "
  + "md:grid-cols-[minmax(0,1fr)_72px_82px_82px_150px] md:[grid-template-areas:'n_a_p_r_x']"
const PROD_CABECERA = "hidden md:grid gap-x-5 md:grid-cols-[minmax(0,1fr)_72px_82px_82px_150px]"

export function TablaProductividad({ actividades }: { actividades: ActividadHH[] }) {
  // Las que no tienen ni plan ni horas no dicen nada y ensucian la lectura de las que sí.
  const conAlgo = actividades.filter((a) => a.hh_plan != null || a.hh_real != null)
  if (conAlgo.length === 0) {
    return (
      <div style={{ padding: '14px 0', fontSize: '12.5px', color: C.tintaSuave }} data-testid="productividad-vacia">
        {/* 22/08/2026 · el plan se edita en Cronograma, sobre las MISMAS actividades. */}
        Ninguna actividad tiene HH plan ni horas imputadas. Las HH plan se cargan en Cronograma.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="tabla-productividad">
      <div className={PROD_CABECERA} style={CABECERA}>
        <div>Actividad</div><div style={{ textAlign: 'right' }}>Avance</div><div style={{ textAlign: 'right' }}>HH plan</div>
        <div style={{ textAlign: 'right' }}>HH real</div><div />
      </div>
      {conAlgo.map((a) => {
        const senal = senalProductividad(a)
        const avance = a.avance_pct == null ? null : pct(a.avance_pct)
        const plan = a.hh_plan == null ? null : hh(a.hh_plan)
        return (
          <div key={a.actividad_id} className={PROD_GRILLA} style={FILA_BASE} data-testid="fila-productividad">
            <div className="[grid-area:n]" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</div>
            <div className="hidden md:block [grid-area:a]" style={{ textAlign: 'right', color: avance ? C.tintaMedia : C.tenue, fontVariantNumeric: 'tabular-nums' }}>
              {avance ?? <span data-nulo="">sin medir</span>}
            </div>
            <div className="hidden md:block [grid-area:p]" style={{ textAlign: 'right', color: plan ? C.tintaMedia : C.tenue, fontVariantNumeric: 'tabular-nums' }}>
              {plan ?? <span data-nulo="">sin cargar</span>}
            </div>
            <div className="[grid-area:r]" style={{ textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums', ...(a.hh_real == null ? NULO : {}) }}>
              {a.hh_real == null ? <span data-nulo="" style={{ fontWeight: 400 }}>sin imputar</span> : hh(a.hh_real)}
            </div>
            {/* En el teléfono avance y plan bajan a la sublínea: son contexto, la cifra es la real. */}
            <div className="md:hidden [grid-area:s]" style={SUBLINEA}>
              {avance ? `avance ${avance}` : 'avance sin medir'} · {plan ? `plan ${plan} h` : 'plan sin cargar'}
            </div>
            {/* La columna contiene la EXCEPCIÓN; la actividad que va como se esperaba queda vacía (Design 23/08). */}
            <div className="[grid-area:x] justify-self-end md:justify-self-start">
              {senal && (senal.tono === 'nulo'
                ? <span style={{ fontSize: '12px', color: C.tenue }} data-clave={senal.texto}>{senal.texto}</span>
                : <Pastilla tono={senal.tono}>{senal.texto}</Pastilla>)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const HORAS_GRILLA = 'group grid gap-x-5 gap-y-0.5 py-2 md:py-0 min-h-[52px] md:min-h-[44px] items-center '
  + "grid-cols-[minmax(0,1fr)_auto] [grid-template-areas:'p_h'_'s_q'] "
  + "md:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)_96px_64px_72px] md:[grid-template-areas:'d_p_a_t_h_q']"
const HORAS_CABECERA = 'hidden md:grid gap-x-5 md:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)_96px_64px_72px]'

function FilaHoras({ r, borrarHoras }: { r: RegistroHH; borrarHoras: (registroId: string) => Promise<ResultadoAccion> }) {
  // Las filas legacy no tienen día: su grano es la semana, y se dice así en vez de inventarles un
  // lunes que nadie cargó.
  const dia = r.fecha ? ddmm(r.fecha) : `sem. ${ddmm(r.fecha_inicio_semana)}`
  // La normal no se rotula: es el 95% de las filas y la excepción es lo que tiene que saltar.
  const tipo = r.tipo_hora && r.tipo_hora !== 'normal' ? TIPO_HORA_LABEL[r.tipo_hora as TipoHora] : ''
  return (
    <div className={HORAS_GRILLA} style={FILA_BASE} data-testid="fila-hh">
      <div className="hidden md:block [grid-area:d]" style={{ fontSize: '12.5px', color: C.tintaSuave, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{dia}</div>
      {/* EL REGISTRO SIN PERSONA SE MARCA, NO SE ADOPTA: son horas reales sin dueño conocido, y
          ponerle el texto legacy como si fuera un nombre le inventaría uno. */}
      <div className="[grid-area:p]" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.persona_id
          ? r.persona_nombre
          : <span style={{ color: C.warn }}>sin persona{r.trabajador_o_cuadrilla && <span style={{ fontSize: '11.5px', color: C.tenue }}> · carga vieja «{r.trabajador_o_cuadrilla}»</span>}</span>}
      </div>
      <div className="hidden md:block [grid-area:a]" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.actividad_nombre ? C.tintaMedia : C.tenue }}>
        {r.actividad_nombre ?? 'toda la obra'}
      </div>
      <div className="hidden md:block [grid-area:t]" style={{ fontSize: '12.5px', color: C.tintaMedia }}>{tipo}</div>
      <div className="[grid-area:h]" style={{ textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{hh(r.horas)}</div>
      <div className="md:hidden [grid-area:s]" style={{ ...SUBLINEA, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {[dia, r.actividad_nombre ?? 'toda la obra', tipo].filter(Boolean).join(' · ')}
      </div>
      {/* Escritorio: aparece al pasar (son cientos de filas y quitar es la excepción). Teléfono: no
          hay «pasar», queda a la vista en la sublínea, del lado derecho. */}
      <div className="[grid-area:q] justify-self-end transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
        <AccionFila accion={borrarHoras} args={[r.id]} testid="borrar-hh" tono="discreto" confirmar="Sí, quitar">Quitar</AccionFila>
      </div>
    </div>
  )
}

export function TablaHoras({
  registros, borrarHoras,
}: {
  registros: RegistroHH[]
  borrarHoras: (registroId: string) => Promise<ResultadoAccion>
}) {
  if (registros.length === 0) {
    return <div style={{ padding: '14px 0', fontSize: '12.5px', color: C.tintaSuave }} data-testid="hh-vacia">Sin horas imputadas a esta obra.</div>
  }
  // Llegan ordenadas de la más reciente a la más vieja (`getRegistrosHH`): las primeras son las que
  // se corrigen; el resto no se esconde, se pliega.
  const vista = registros.slice(0, HORAS_A_LA_VISTA)
  const resto = registros.slice(HORAS_A_LA_VISTA)
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="tabla-hh">
      <div className={HORAS_CABECERA} style={CABECERA}>
        <div>Día</div><div>Persona</div><div>Actividad</div><div>Tipo</div><div style={{ textAlign: 'right' }}>Horas</div><div />
      </div>
      {vista.map((r) => <FilaHoras key={r.id} r={r} borrarHoras={borrarHoras} />)}
      {resto.length > 0 && (
        <details className="group/resto" data-testid="hh-anteriores">
          <summary className="flex h-11 cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden" style={{ fontSize: '12.5px', color: C.tintaSuave }}>
            <span className="transition-transform group-open/resto:rotate-90" style={{ display: 'flex' }}><Ico d={P.derecha} s={12} /></span>
            Ver las {resto.length} anteriores
          </summary>
          {resto.map((r) => <FilaHoras key={r.id} r={r} borrarHoras={borrarHoras} />)}
        </details>
      )}
    </div>
  )
}

/** LA CLASE DE HORA, en todas las cargas. Arranca en «Normal» porque es lo que se carga casi
 *  siempre: el que tuvo extras la cambia, y el que no, no toca nada. */
function SelectTipoHora({ nombre = 'tipo_hora', compacto = false }: { nombre?: string; compacto?: boolean }) {
  return (
    <select
      name={nombre} defaultValue="normal" data-testid={compacto ? 'tipo-masiva' : 'tipo-hora'}
      className={compacto
        // 44 de toque y letra 16 en el teléfono (auditoría por nivel 25/09/2026: medía 26). La PC no cambia.
        ? 'shrink-0 rounded-control border border-line bg-white px-1.5 py-1 text-[11px] text-muted max-md:min-h-11 max-md:text-[16px]'
        : CAMPO}
    >
      {TIPOS_HORA.map((t) => <option key={t} value={t}>{TIPO_HORA_LABEL[t]}</option>)}
    </select>
  )
}

function SelectActividad({ actividades }: { actividades: Actividad[] }) {
  // DOS ACTIVIDADES CON EL MISMO NOMBRE SON INDISTINGUIBLES EN UN SELECT (22/08, E2E Quattropani):
  // la del tracker y la convertida del presupuesto se llaman igual, y 8 HH fueron a parar a la
  // equivocada. Cuando el nombre se repite, la opción dice también de dónde viene — el usuario
  // decide con un dato, no con una moneda.
  const repetidos = new Set(
    [...actividades.reduce((m, a) => m.set(a.nombre, (m.get(a.nombre) ?? 0) + 1), new Map<string, number>())]
      .filter(([, n]) => n > 1).map(([nombre]) => nombre),
  )
  const rotulo = (a: Actividad) => repetidos.has(a.nombre)
    ? `${a.nombre} · ${a.seccion?.trim() || 'sin rubro'} (${a.id.slice(0, 4)})`
    : a.nombre
  return (
    <select name="actividad_id" defaultValue="" className={CAMPO}>
      <option value="">toda la obra</option>
      {actividades.map((a) => <option key={a.id} value={a.id}>{rotulo(a)}</option>)}
    </select>
  )
}

/** CARGA A: una persona, un día. */
export function FormIndividual({
  personas, asignadas, actividades, imputar, causas = [],
}: {
  personas: Persona[]
  /** Los ids de quienes están asignados a ESTA obra hoy. Se muestran primero. */
  asignadas?: string[]
  actividades: Actividad[]
  imputar: AccionFormulario
  /** El catálogo de causas de desvío (`causa_desvio`): una hora improductiva lleva la suya. */
  causas?: { clave: string; nombre: string }[]
}) {
  // ═══ LOS DE ESTA OBRA ARRIBA, EL RESTO DEL PLANTEL DESPUÉS (19/08/2026, QA) ═══
  //
  // La lista traía las 30 personas de la empresa en un solo bloque alfabético, así que imputarle
  // horas a alguien que no trabaja en esta obra era tan fácil como imputárselas al de al lado. No
  // se recorta la lista —a veces hay que cargarle horas a alguien que todavía no está asignado, y
  // esconderlo obligaría a salir de la pantalla—: se separa en dos grupos, y el que se usa todos
  // los días queda primero.
  const enLaObra = new Set(asignadas ?? [])
  const acá = personas.filter((p) => enLaObra.has(p.id))
  const resto = personas.filter((p) => !enLaObra.has(p.id))
  return (
    <FormAccion accion={imputar} testid="form-hh" enviar="Imputar" limpiarAlOk mensajeOk="Horas imputadas.">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Campo rotulo="Persona" className="col-span-2">
          <select name="persona_id" required defaultValue="" className={CAMPO}>
            <option value="" disabled>elegir del plantel</option>
            {acá.length > 0 && (
              <optgroup label="En esta obra">
                {acá.map((p) => <option key={p.id} value={p.id}>{nombreDePersona(p)}</option>)}
              </optgroup>
            )}
            {resto.length > 0 && (
              <optgroup label={acá.length > 0 ? 'Resto del plantel' : 'Plantel'}>
                {resto.map((p) => <option key={p.id} value={p.id}>{nombreDePersona(p)}</option>)}
              </optgroup>
            )}
          </select>
        </Campo>
        <Campo rotulo="Día"><input type="date" name="fecha" required className={CAMPO} /></Campo>
        <Campo rotulo="Horas">
          {/* JORNADA COMPLETA POR DEFECTO, igual que la carga masiva: medido por QA, la carga de a
              una persona pedía tipear el número a mano y era el único campo que no se podía dejar
              como venía. Ocho es lo que sale en la enorme mayoría de las filas; el que hizo media
              jornada lo corrige, que es un caso y no la regla. */}
          <input type="number" name="horas" required min="0.5" max="24" step="0.5" defaultValue="8" className={CAMPO} />
        </Campo>
        <Campo rotulo="Actividad" className="col-span-2" ayuda="Opcional: en blanco quedan imputadas a la obra entera.">
          <SelectActividad actividades={actividades} />
        </Campo>
        <Campo rotulo="Tipo de hora" className="col-span-2"
          ayuda="Las horas se cargan reales: el recargo no se multiplica acá.">
          <SelectTipoHora />
        </Campo>
        <Campo rotulo="Observación" className="col-span-2">
          <input name="notas" maxLength={300} className={CAMPO} />
        </Campo>
        {/* §19 (22/08): la hora improductiva se declara ACÁ, con su causa — antes el modelo las
            distinguía y ninguna pantalla las escribía. Plegado: el caso común es la hora normal. */}
        {causas.length > 0 && (
          <details className="col-span-2" data-testid="hh-improductiva">
            <summary className="cursor-pointer text-[12px] text-muted max-md:flex max-md:min-h-11 max-md:items-center">Hora improductiva (con causa)</summary>
            <div className="mt-2 grid grid-cols-2 gap-2.5">
              {/* En el teléfono la casilla mide 24 y el renglón entero (la etiqueta) es el blanco de 44. */}
              <label className="flex items-center gap-2 text-[12.5px] text-ink max-md:min-h-11">
                <input type="checkbox" name="improductiva" className="h-3.5 w-3.5 max-md:h-6 max-md:w-6" data-testid="marca-improductiva" />
                Improductiva
              </label>
              <Campo rotulo="Causa">
                <select name="causa_desvio" defaultValue="" className={CAMPO} data-testid="causa-desvio">
                  <option value="">elegir la causa</option>
                  {causas.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
                </select>
              </Campo>
            </div>
          </details>
        )}
      </div>
    </FormAccion>
  )
}

/**
 * CARGA B: la cuadrilla entera, un día.
 *
 * ═══ POR QUÉ NO HAY CASILLAS DE SELECCIÓN ═══
 *
 * La selección ES el casillero de horas: en blanco no se imputa. Un par casilla+horas obliga a
 * mantener dos estados coherentes —marcado con horas vacías, sin marcar con 8— y eso necesita
 * JavaScript de cliente para algo que un campo vacío ya dice. Además, es el mismo gesto con el que
 * se corrige una excepción: el que hizo media jornada se escribe 4 y listo.
 */
export function FormMasiva({
  asignaciones, actividades, imputarMasivo,
}: {
  asignaciones: Asignacion[]
  actividades: Actividad[]
  imputarMasivo: AccionFormulario
}) {
  const vigentes = asignaciones.filter((a) => !a.hasta && a.persona_nombre)
  if (vigentes.length === 0) {
    return (
      <Vacio>
        Nadie tiene una asignación vigente en esta obra: la carga masiva sale de esa lista. Se
        asigna con «+ Asignar persona».
      </Vacio>
    )
  }
  const grupos = new Map<string, Asignacion[]>()
  for (const a of vigentes) {
    const k = a.cuadrilla ?? 'Sin cuadrilla'
    grupos.set(k, [...(grupos.get(k) ?? []), a])
  }

  return (
    <FormAccion accion={imputarMasivo} testid="form-hh-masiva" enviar="Imputar a todos" mensajeOk="Imputado.">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Campo rotulo="Día"><input type="date" name="fecha" required className={CAMPO} /></Campo>
        <Campo rotulo="Actividad" className="col-span-2 sm:col-span-2" ayuda="Opcional: en blanco quedan en la obra entera.">
          <SelectActividad actividades={actividades} />
        </Campo>
        <Campo rotulo="Tipo de hora" ayuda="El de toda la carga. Se puede cambiar de a uno abajo.">
          <SelectTipoHora />
        </Campo>
      </div>

      <div className="mt-3 space-y-3">
        {[...grupos.entries()].map(([cuadrilla, gente]) => (
          <div key={cuadrilla}>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-faint">{cuadrilla}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {gente.map((a) => (
                <label key={a.persona_id} className="flex items-center justify-between gap-3 rounded-control border border-line bg-white px-2.5 py-1.5">
                  <span className="min-w-0 truncate text-[12px] text-ink">{a.persona_nombre}</span>
                  {/* LA EXCEPCIÓN SE CORRIGE DONDE ESTÁ LA PERSONA. El dueño pidió poder cambiarle
                      las horas Y el tipo a uno solo: en una cuadrilla que se quedó hasta tarde, dos
                      hicieron extras y el resto no. Sin tipo por persona habría que cargar la misma
                      cuadrilla dos veces. En blanco hereda el tipo general de arriba. */}
                  <span className="flex shrink-0 items-center gap-1.5">
                    <SelectTipoHora nombre={`tipo_${a.persona_id}`} compacto />
                    <input
                      type="number" name={`horas_${a.persona_id}`} min="0" max="24" step="0.5"
                      defaultValue="8" data-testid="horas-masiva"
                      className="w-16 shrink-0 rounded-control border border-line px-2 py-1 text-right text-[12px] tabular-nums text-ink max-md:min-h-11 max-md:text-[16px]"
                    />
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 22/08/2026 · La regla de la carga masiva se pliega: quien imputa la cuadrilla todos los
          días no la relee, y el resultado del envío —cuántos entraron y cuántos se saltearon— ya
          dice lo mismo DESPUÉS de actuar, que es cuando importa. */}
      <Ayuda titulo="Quién queda afuera" testid="ayuda-hh-masiva">
        El que no trabajó se deja en blanco o en cero: no se imputa. Quien ya tenga horas cargadas
        ese día se saltea y se avisa cuántos fueron.
      </Ayuda>
      <Campo rotulo="Observación" className="mt-2 block">
        <input name="notas" maxLength={300} className={CAMPO} />
      </Campo>
    </FormAccion>
  )
}
