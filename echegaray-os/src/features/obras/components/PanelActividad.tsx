'use client'

// EL PANEL CONTEXTUAL DEL CRONOGRAMA — se selecciona una barra y aparece acá lo que se puede hacer
// con ella. No es una pantalla aparte: el cronograma tiene que seguir a la vista mientras se edita,
// porque lo que se está decidiendo es la fecha de esta actividad CONTRA las de al lado.
//
// ═══ EN EL TELÉFONO ES UNA HOJA QUE SUBE, NO UNA COLUMNA ═══
//
// Un panel de 330px al costado, en una pantalla de 390px, deja 60px para el cronograma: no es una
// versión angosta de la pantalla, es ninguna de las dos cosas. Debajo del `lg` el panel se despega
// del flujo y sube desde abajo ocupando el ancho completo y hasta el 85% del alto, con el
// cronograma detrás. Es el mismo componente y el mismo marcado: cambia dónde se apoya.
//
// ═══ POR QUÉ EL AVANCE TIENE SU PROPIO BOTÓN ═══
//
// Registrar avance es la edición que se hace todos los días, desde el teléfono y con la obra
// adelante. Si viviera dentro del formulario largo habría que pasar por diez campos para mover un
// número. Va arriba, con un toque, y usa `registrarAvance`, que sólo escribe `pct`: así el avance
// del jefe de obra nunca pisa una fecha por accidente.
//
// ═══ LA LÍNEA BASE NO SE TOCA DESDE ACÁ, Y ES LA REGLA DURA DEL MÓDULO ═══
//
// Guardar este formulario mueve `inicio_plan`/`fin_plan` y NADA MÁS. `inicio_base`/`fin_base` sólo
// los escribe `sellarBaseline`, una vez. Si la edición moviera también la base, replanificar dejaría
// el desvío en cero para siempre y el tablero diría que la obra siempre va en fecha.

import { useState, type ReactNode } from 'react'
import { BotonAccion, Campo, CTRL, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Dependencia, ParteEjecucion, Persona, Restriccion } from '../types'
import type { ActividadHH } from '../services/personalService'
import { METODO_LABEL, TIPO_DEPENDENCIA, TIPO_DEPENDENCIA_LABEL, UNIDADES } from '../types'
import { fecha } from './formato'

export type AccionesCronograma = {
  crear: (form: FormData) => Promise<ResultadoAccion>
  editar: (actividadId: string, form: FormData) => Promise<ResultadoAccion>
  avance: (actividadId: string, pct: number) => Promise<ResultadoAccion>
  archivar: (actividadId: string, archivada: boolean) => Promise<ResultadoAccion>
  hito: (actividadId: string, esHito: boolean) => Promise<ResultadoAccion>
  sellar: () => Promise<ResultadoAccion>
  /** Opcionales a propósito: una pantalla que todavía no las ata sigue compilando y no dibuja el
   *  control. Un botón que no persiste es peor que no tenerlo. */
  agregarDependencia?: (destinoId: string, form: FormData) => Promise<ResultadoAccion>
  quitarDependencia?: (dependenciaId: string) => Promise<ResultadoAccion>
  /** Unidad, cantidad objetivo y método de avance de la actividad. */
  definirMedicion?: (actividadId: string, form: FormData) => Promise<ResultadoAccion>
}

const fmt = (v: string | number | null | undefined) => (v == null ? '' : String(v))

function SelectResponsable({ personas, valor }: { personas: Persona[]; valor: string | null }) {
  return (
    <select name="responsable_id" defaultValue={valor ?? ''} className={CTRL}>
      <option value="">sin responsable asignado</option>
      {personas.map((p) => (
        <option key={p.id} value={p.id}>{p.nombre_completo}</option>
      ))}
    </select>
  )
}

/** Los campos comunes al alta y a la edición. Uno solo: si se separaran, el alta y la edición
 *  terminarían aceptando cosas distintas y el desvío entre las dos se descubriría tarde. */
function CamposActividad({ a, personas, hh }: { a?: Actividad; personas: Persona[]; hh?: ActividadHH }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Actividad" ancho="col-span-2">
        <input name="nombre" defaultValue={fmt(a?.nombre)} required minLength={2} maxLength={200} className={CTRL} />
      </Campo>
      {!a && (
        <Campo label="Grupo" ancho="col-span-2" ayuda="Agrupa la actividad en el cronograma. Es parte de su identidad: no se puede cambiar después.">
          <input name="seccion" maxLength={120} className={CTRL} placeholder="opcional" />
        </Campo>
      )}
      <Campo label="Inicio previsto"><input type="date" name="inicio_plan" defaultValue={fmt(a?.inicio_plan)} className={CTRL} /></Campo>
      <Campo label="Fin previsto"><input type="date" name="fin_plan" defaultValue={fmt(a?.fin_plan)} className={CTRL} /></Campo>
      <Campo label="Días"><input type="number" name="dias_plan" min={0} step={1} defaultValue={fmt(a?.dias_plan)} className={CTRL} /></Campo>
      <Campo label="Avance %"><input type="number" name="pct" min={0} max={100} step={1} defaultValue={fmt(a?.pct)} className={CTRL} /></Campo>
      <Campo label="HH plan"><input type="number" name="hh_plan" min={0} step="0.5" defaultValue={fmt(a?.hh_plan)} className={CTRL} /></Campo>
      {/* ═══ HH REAL NO ES UN CAMPO ═══
          Hasta el 19/08/2026 acá había un `input` que escribía `obra_actividad.hh_real` a mano, al
          lado de las horas imputadas de verdad en `registros_hh`: dos números para el mismo hecho.
          La columna se borró (0 filas cargadas de 344) y esto muestra lo que publica
          `obra_actividad_hh`, la MISMA vista que lee la solapa Personal. Un solo cálculo. */}
      <Campo label="HH real" ayuda="Suma de las horas imputadas a esta actividad.">
        <p className="mt-1 py-1.5 text-[13px] tabular-nums text-ink" data-testid="actividad-hh-real">
          {hh?.hh_real == null
            ? <span className="text-faint">sin imputar</span>
            : `${Number(hh.hh_real).toLocaleString('es-AR', { maximumFractionDigits: 1 })}`}
          {hh?.desvio_pct != null && (
            <span className="ml-2 text-[11px] text-faint">
              {Number(hh.desvio_pct) > 0 ? '+' : ''}{Number(hh.desvio_pct)}% vs plan
            </span>
          )}
          {/* EL DESVÍO SIN LAS DOS PUNTAS NO ES CERO: es desconocido, y se dice cuál falta. */}
          {hh?.hh_real != null && hh?.hh_plan == null && (
            <span className="ml-2 text-[11px] text-warn">HH plan sin cargar</span>
          )}
        </p>
      </Campo>
      <Campo label="Responsable" ancho="col-span-2"><SelectResponsable personas={personas} valor={a?.responsable_id ?? null} /></Campo>
      <Campo label="Cuadrilla" ancho="col-span-2"><input name="cuadrilla" defaultValue={fmt(a?.cuadrilla)} maxLength={120} className={CTRL} /></Campo>
      <Campo label="Notas" ancho="col-span-2"><input name="comentario" defaultValue={fmt(a?.comentario)} maxLength={400} className={CTRL} /></Campo>
      {!a && (
        <label className="col-span-2 flex items-center gap-2 text-[12px] text-muted">
          <input type="checkbox" name="es_hito" className="h-3.5 w-3.5" /> Es un hito (una fecha, sin duración)
        </label>
      )}
    </div>
  )
}

/**
 * El avance rápido: un toque para los valores de siempre, y un campo para el resto.
 *
 * El campo arranca en el avance que tiene la actividad, y el componente se REMONTA por `key` cuando
 * cambia la actividad o su avance —no se sincroniza con un efecto—. Sin eso, al pasar de una barra a
 * otra el campo se quedaba con el número de la anterior, y el botón de registrar habría escrito el
 * avance de una actividad sobre otra.
 */
function AvanceRapido({ a, avance }: { a: Actividad; avance: AccionesCronograma['avance'] }) {
  const [valor, setValor] = useState<string>(a.pct == null ? '' : String(a.pct))

  return (
    <div className="rounded-control border border-line bg-surface p-2.5" data-testid="avance-rapido">
      <p className="text-[11px] uppercase tracking-wide text-faint">Avance</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {[0, 25, 50, 75, 100].map((p) => (
          <BotonAccion key={p} accion={() => avance(a.id, p)} testid={`avance-${p}`}>{p}%</BotonAccion>
        ))}
        <input
          type="number" min={0} max={100} step={1} value={valor}
          onChange={(e) => setValor(e.target.value)}
          data-testid="avance-valor"
          className="w-16 rounded-control border border-line px-2 py-1 text-[12px] tabular-nums"
        />
        <BotonAccion accion={() => avance(a.id, Number(valor))} testid="avance-guardar" tono="fuerte">Registrar</BotonAccion>
      </div>
    </div>
  )
}

/**
 * LAS PRECEDENCIAS de esta actividad: de qué depende, y a quién habilita.
 *
 * Las dos direcciones se muestran juntas porque las dos son consecuencia de tocar esta fecha. Lo que
 * se puede editar es sólo la primera —de qué depende ESTA—: dejar cargar las dos desde el mismo lado
 * duplicaría cada arista en la cabeza del que la carga.
 */
function Dependencias({
  a, actividades, dependencias, acciones,
}: {
  a: Actividad
  actividades: Actividad[]
  dependencias: Dependencia[]
  acciones: AccionesCronograma
}) {
  const nombre = (id: string) => actividades.find((x) => x.id === id)?.nombre ?? 'una actividad archivada'
  const dependeDe = dependencias.filter((d) => d.destino_id === a.id)
  const habilitaA = dependencias.filter((d) => d.origen_id === a.id)
  // No se puede depender de sí misma ni de algo que ya la precede: se sacan de la lista en vez de
  // dejar elegirlas y contestar con un error.
  const yaLigadas = new Set([a.id, ...dependeDe.map((d) => d.origen_id)])
  const elegibles = actividades.filter((x) => !yaLigadas.has(x.id) && x.tipo !== 'resumen')

  return (
    <div className="rounded-control border border-line bg-surface p-2.5" data-testid="panel-dependencias">
      <p className="text-[11px] uppercase tracking-wide text-faint">Depende de</p>
      {dependeDe.length === 0 ? (
        <p className="mt-1 text-[12px] text-faint">Nada declarado.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {dependeDe.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-[12px] text-ink">
                {nombre(d.origen_id)}
                <span className="text-faint"> · {TIPO_DEPENDENCIA_LABEL[d.tipo]}{d.lag_dias ? ` · ${d.lag_dias} d` : ''}</span>
              </span>
              {acciones.quitarDependencia && (
                <BotonAccion accion={acciones.quitarDependencia} args={[d.id]} testid="quitar-dependencia">quitar</BotonAccion>
              )}
            </li>
          ))}
        </ul>
      )}

      {habilitaA.length > 0 && (
        <p className="mt-2 text-[11px] text-faint">
          Habilita a {habilitaA.map((d) => nombre(d.destino_id)).join(', ')}.
        </p>
      )}

      {acciones.agregarDependencia && elegibles.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] text-muted hover:text-ink">Agregar una</summary>
          <div className="mt-2">
            <FormAccion
              accion={(form) => acciones.agregarDependencia!(a.id, form)}
              testid="form-dependencia"
              enviar="Agregar"
              limpiarAlOk
              mensajeOk="Precedencia declarada."
            >
              <div className="grid grid-cols-2 gap-2.5">
                <Campo label="Esta actividad no puede empezar hasta que" ancho="col-span-2">
                  <select name="origen_id" required defaultValue="" className={CTRL}>
                    <option value="" disabled>elegir una actividad</option>
                    {elegibles.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                  </select>
                </Campo>
                <Campo label="Relación">
                  <select name="tipo" defaultValue="FS" className={CTRL}>
                    {TIPO_DEPENDENCIA.map((t) => <option key={t} value={t}>{TIPO_DEPENDENCIA_LABEL[t]}</option>)}
                  </select>
                </Campo>
                <Campo label="Espera (días)" ayuda="0 si sigue de inmediato.">
                  <input type="number" name="lag_dias" min={-365} max={365} step={1} defaultValue={0} className={CTRL} />
                </Campo>
              </div>
            </FormAccion>
          </div>
        </details>
      )}
    </div>
  )
}

/** Los impedimentos abiertos que frenan ESTA actividad. Se anotan y se liberan en Próximos trabajos:
 *  acá se ven porque son la explicación de por qué la barra no se mueve. */
function ImpedimentosDe({ abiertos }: { abiertos: Restriccion[] }) {
  if (abiertos.length === 0) return null
  return (
    <div className="rounded-control border border-warn/30 bg-warn-soft p-2.5" data-testid="panel-impedimentos">
      <p className="text-[11px] uppercase tracking-wide text-warn">
        {abiertos.length === 1 ? 'Un impedimento la frena' : `${abiertos.length} impedimentos la frenan`}
      </p>
      <ul className="mt-1 space-y-1">
        {abiertos.map((r) => (
          <li key={r.id} className="text-[12px] text-ink">
            {r.descripcion}
            <span className="text-muted"> · {r.responsable ?? 'sin dueño'} · {fecha(r.fecha_compromiso)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * CÓMO SE MIDE ESTA ACTIVIDAD — y qué lleva ejecutado.
 *
 * ═══ POR QUÉ EL MÉTODO ES UN CAMPO Y NO UNA DEDUCCIÓN ═══
 *
 * Un avance calculado desde 95 de 180 m² y un 53% que alguien tipeó no valen lo mismo, y la pantalla
 * tiene que poder distinguirlos. Si el método se dedujera de «¿tiene unidad cargada?», cargar la
 * unidad para dejarlo anotado cambiaría en silencio de dónde sale el porcentaje de la obra.
 *
 * `origen_avance` viene calculado de la base y se muestra al lado del número: es la respuesta a
 * «¿de dónde salió este 53%?» sin tener que ir a buscarla.
 */
const n2 = (v: number | null) => (v == null ? null : v.toLocaleString('es-AR', { maximumFractionDigits: 2 }))

/** Una línea de la lista Plan/Real. FUERA del componente a propósito: definida adentro, React la
 *  vuelve a crear en cada render y remonta el subárbol —además de que la regla `static-components`
 *  lo rechaza—. */
function Dato({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <dt className="truncate text-faint">{k}</dt>
      <dd className="text-right tabular-nums text-ink">{v ?? <span className="text-faint">sin cargar</span>}</dd>
    </>
  )
}

function BloqueMedicion({ a, definir, partes = [] }: {
  a: Actividad
  definir?: AccionFormulario
  partes?: ParteEjecucion[]
}) {
  const n = n2
  return (
    <div data-testid="bloque-medicion" className="space-y-2">
      {/* PLAN Y REAL ENFRENTADOS. Es la pregunta del panel —¿cómo viene contra lo previsto?— y por
          eso se lee sin abrir nada. Dos listas una debajo de la otra obligan a recordar el número
          de arriba mientras se lee el de abajo. */}
      <div className="grid grid-cols-2 gap-2">
        <section className="rounded-md border border-line bg-surface px-2.5 py-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-faint">Plan</p>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[12px]">
            <Dato k="Unidad" v={a.unidad} />
            <Dato k="Objetivo" v={n(a.cantidad_objetivo)} />
            <Dato k="HH plan" v={n(a.hh_plan)} />
          </dl>
        </section>
        <section className="rounded-md border border-line bg-surface px-2.5 py-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-faint">Real</p>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[12px]">
            <Dato
              k="Ejecutado"
              v={a.metodo_avance === 'cantidad' ? n(a.cantidad_ejecutada ?? 0) : `${a.n_partes} parte(s)`}
            />
            <Dato k="Avance" v={a.avance_pct == null ? null : `${n(a.avance_pct)}%`} />
            <Dato k="HH reales" v={n(a.hh_real)} />
            {/* LA PRODUCTIVIDAD EXISTE SÓLO CON LAS DOS PUNTAS. Con una sola sería una división por
                un dato que falta, no un indicador bajo — así es como una obra sana parece
                improductiva. */}
            {a.productividad != null && <Dato k="Prod." v={`${n(a.productividad)} ${a.unidad}/HH`} />}
          </dl>
        </section>
      </div>

      {/* DE DÓNDE SALIÓ EL AVANCE. Un 53% calculado desde 95 de 180 m² y un 53% que alguien tipeó no
          valen lo mismo, y quien decide tiene que poder distinguirlos sin ir a buscarlo. */}
      {a.origen_avance && (
        <p className="text-[11px] text-faint" data-testid="origen-avance">
          Avance {a.origen_avance === 'cantidad'
            ? 'calculado desde la producción cargada'
            : a.origen_avance === 'partes' ? 'sumado de los partes diarios' : 'declarado a mano'}.
        </p>
      )}

      {partes.length > 0 && (
        <section data-testid="ejecucion-reciente">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-faint">Ejecución reciente</p>
          <ul className="divide-y divide-line/60 rounded-md border border-line bg-surface">
            {partes.slice(0, 4).map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-2 px-2.5 py-1 text-[12px]">
                <span className="tabular-nums text-faint">{fecha(p.fecha)}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{p.comentario ?? ''}</span>
                <span className="shrink-0 tabular-nums text-ink">
                  {p.cantidad != null ? `+${n(p.cantidad)} ${a.unidad ?? ''}` : `+${n(p.avance_pct)}%`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {definir && (
        <details className="rounded-md border border-line bg-surface px-2.5 py-1.5">
          <summary className="cursor-pointer text-[12px] text-muted">Cómo se mide esta actividad</summary>
          <div className="mt-2">
            <FormAccion accion={definir} testid="form-medicion" enviar="Guardar" mensajeOk="Guardado.">
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Unidad">
                  <input name="unidad" defaultValue={a.unidad ?? ''} list="unidades-obra" maxLength={12} className={CTRL} />
                </Campo>
                <Campo label="Cantidad objetivo">
                  <input name="cantidad_objetivo" type="number" step="any" min="0" defaultValue={a.cantidad_objetivo ?? ''} className={CTRL} />
                </Campo>
                <Campo label="Cómo se mide el avance" ancho="col-span-2">
                  <select name="metodo_avance" defaultValue={a.metodo_avance} className={CTRL} data-testid="metodo-avance">
                    {(Object.keys(METODO_LABEL) as (keyof typeof METODO_LABEL)[]).map((m) => (
                      <option key={m} value={m}>{METODO_LABEL[m]}</option>
                    ))}
                  </select>
                </Campo>
              </div>
              <datalist id="unidades-obra">
                {UNIDADES.map((u) => <option key={u} value={u} />)}
              </datalist>
            </FormAccion>
          </div>
        </details>
      )}
    </div>
  )
}

export function PanelActividad({
  actividad, personas, acciones, alCerrar, actividades = [], dependencias = [], impedimentos = [], hh,
  partes = [],
}: {
  actividad: Actividad
  personas: Persona[]
  acciones: AccionesCronograma
  alCerrar: () => void
  /** El resto del cronograma: es la lista de la que se elige una precedencia. */
  actividades?: Actividad[]
  dependencias?: Dependencia[]
  /** Ya filtrados a los de esta actividad y sin liberar. */
  impedimentos?: Restriccion[]
  /** HH plan contra real de ESTA actividad, tal como la publica `obra_actividad_hh`. Opcional: sin
   *  ella el panel dice «sin imputar» en vez de romperse, que es lo que hace el resto de los props
   *  de este árbol. */
  hh?: ActividadHH
  /** Los últimos partes de ESTA actividad. Sin ellos el bloque no dibuja la lista. */
  partes?: ParteEjecucion[]
}) {
  const a = actividad
  return (
    <>
      {/* El fondo sólo existe en el teléfono, donde la hoja tapa el cronograma: es la manera de
          salir sin buscar la cruz. En escritorio no hay nada que tapar. */}
      <button
        type="button"
        aria-label="Cerrar el panel"
        onClick={alCerrar}
        className="fixed inset-0 z-30 bg-ink/20 lg:hidden"
      />
      <aside
        data-testid="panel-actividad"
        className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-card border-t border-line bg-surface-quiet p-3.5 shadow-pop lg:static lg:z-auto lg:max-h-none lg:w-[340px] lg:shrink-0 lg:overflow-visible lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
      >
        {/* El tirador de la hoja. En escritorio no hay hoja que tirar. */}
        <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong lg:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] uppercase tracking-wide text-faint">
              {[a.seccion, a.codigo, a.tipo].filter(Boolean).join(' · ')}
            </p>
            <p className="text-[14px] font-semibold leading-tight text-ink">{a.nombre}</p>
          </div>
          <button type="button" onClick={alCerrar} className="shrink-0 text-[12px] text-muted hover:text-ink">cerrar</button>
        </div>

        {/* LA LÍNEA BASE SE DICE SIEMPRE: es contra qué se mide el desvío, y "sin sellar" no es lo
            mismo que "en fecha". */}
        <p className="mt-2 text-[11px] tabular-nums text-faint">
          Línea base: {a.inicio_base ? `${fecha(a.inicio_base)} → ${fecha(a.fin_base)}` : 'sin sellar'}
        </p>

        <div className="mt-3 space-y-3">
          <ImpedimentosDe abiertos={impedimentos} />
          <BloqueMedicion
            a={a}
            partes={partes}
            definir={acciones.definirMedicion ? acciones.definirMedicion.bind(null, a.id) : undefined}
          />
          {/* EL AVANCE RÁPIDO SÓLO CUANDO EL AVANCE ES DECLARADO. En una actividad que se mide por
              producción, escribir el porcentaje a mano no lo cambiaría —la vista lo calcula— y el
              botón parecería roto. Ahí el avance se mueve cargando un parte en Ejecución. */}
          {a.metodo_avance === 'manual' && (
            <AvanceRapido key={`${a.id}:${a.pct}`} a={a} avance={acciones.avance} />
          )}

          <details className="rounded-control border border-line bg-surface">
            <summary className="cursor-pointer px-2.5 py-1.5 text-[12px] font-medium text-ink">Editar la actividad</summary>
            <div className="border-t border-line p-2.5">
              <FormAccion
                accion={(form) => acciones.editar(a.id, form)}
                testid="form-editar-actividad"
                enviar="Guardar cambios"
                mensajeOk="Actividad guardada."
              >
                <CamposActividad a={a} personas={personas} hh={hh} />
              </FormAccion>
            </div>
          </details>

          <Dependencias a={a} actividades={actividades} dependencias={dependencias} acciones={acciones} />

          <div className="flex flex-wrap items-center gap-2">
            {a.tipo !== 'resumen' && (
              <BotonAccion accion={() => acciones.hito(a.id, a.tipo !== 'hito')} testid="marcar-hito">
                {a.tipo === 'hito' ? 'Dejar de ser hito' : 'Marcar como hito'}
              </BotonAccion>
            )}
            <BotonAccion accion={() => acciones.archivar(a.id, true)} testid="archivar-actividad" tono="peligro">
              Archivar
            </BotonAccion>
          </div>
          <p className="text-[11px] text-faint">
            Archivar la saca del cronograma y de los promedios; no la borra. Su avance y su línea base quedan.
          </p>
        </div>
      </aside>
    </>
  )
}

/** El alta. Vive en el mismo archivo que la edición porque comparten los campos. */
export function FormNuevaActividad({
  personas, crear,
}: {
  personas: Persona[]
  crear: AccionesCronograma['crear']
}) {
  return (
    <FormAccion accion={crear} testid="form-nueva-actividad" enviar="Crear actividad" limpiarAlOk mensajeOk="Actividad creada.">
      <CamposActividad personas={personas} />
    </FormAccion>
  )
}
