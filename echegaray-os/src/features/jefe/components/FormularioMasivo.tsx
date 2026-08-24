'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Aviso, BarraContextual, ChipsValor } from '@/shared/components/ds'
import { Confirmacion, Nada, Panel, Rotulo } from './Piezas'
import {
  AVISO_CRITERIO, VALORES_MASIVOS, VISTAS_MASIVAS, avisoDePrecision, enVista, renglones, vistaInicial,
} from '../services/medicion'
import type { Renglon, VistaMasiva } from '../services/medicion'
import type { ActividadDelJefe } from '../services/jefeService'

// J04 · AVANCE DEL DÍA — «tocá las que avanzaron».
//
// ═══ LA TAREA QUE NO SE PUEDE APLICAR SE MUESTRA APAGADA, NO SE ESCONDE ═══
//
// Una medida por cantidad o por pasos no se mueve con un porcentaje: la vista la calcula de otra
// manera y la fila entraría sin efecto. Esconderla dejaría al jefe buscando una tarea que él sabe
// que existe; mostrarla tocable produciría un éxito informado con el dato quieto, que es peor. Va a
// la vista, apagada, con la unidad real escrita al lado.
//
// ═══ EL PIE APARECE CUANDO HAY ALGO ELEGIDO ═══
//
// Sin nada marcado, el pie dice qué hacer en vez de mostrar un botón que no puede hacer nada. Es la
// misma idea del panel que no se dibuja cuando no tiene nada que decir.

type Estado = { ok: boolean; mensaje: string } | null

export function FormularioMasivo({
  actividades, frentes, fecha, obraNombre, accion,
}: {
  actividades: ActividadDelJefe[]
  /** `actividad_id` → nombre del frente, sacado del ÁRBOL. Ver el porqué en `frentes.ts`. */
  frentes: Record<string, string>
  fecha: string
  obraNombre: string
  accion: (estado: Estado, form: FormData) => Promise<Estado>
}) {
  const filas = renglones(actividades)
  const [vista, setVista] = useState<VistaMasiva>(() => vistaInicial(filas))
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [objetivo, setObjetivo] = useState<number>(100)
  const [criterio, setCriterio] = useState('')
  const [estado, enviar, enviando] = useActionState(accion, null)
  // La barra del sistema aplica con un `onClick`, no con un `submit`: el botón es `type="button"`
  // para no enviar el formulario de la pantalla que la contenga. Acá SÍ hay un formulario y es el
  // que lleva la fecha, el objetivo y los ids, así que se lo envía a mano.
  const formulario = useRef<HTMLFormElement | null>(null)

  // TRAS UN GUARDADO EXITOSO LA SELECCIÓN SE VACÍA — y con ella se va la barra. Dejarla abierta
  // ofreciendo «Guardar N avances» invita a un segundo tap, y como el guardado manual escribe
  // INCREMENTOS, ese segundo tap no es inocuo: duplica el avance (E2E 24/08, defecto observado
  // en las dos pasadas).
  useEffect(() => {
    if (estado?.ok) setElegidas(new Set())
  }, [estado])

  // «Todas» marca LO QUE SE VE, no lo que existe. Con la vista filtrada, marcar tareas fuera de
  // pantalla y guardarlas es exactamente el tipo de escritura que nadie pidió.
  const aplicables = filas.filter((f) => f.aplicable && enVista(f, vista))
  const seleccion = filas.filter((f) => elegidas.has(f.actividad_id))
  const aviso = avisoDePrecision(seleccion)
  const exigeCriterio = seleccion.some((f) => f.metodo === 'manual')
  const faltaCriterio = exigeCriterio && criterio.trim() === ''

  const grupos = agrupar(actividades, filas.filter((f) => enVista(f, vista)), frentes)

  return (
    <form action={enviar} ref={formulario}>
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="objetivo" value={objetivo} />
      <input type="hidden" name="tareas" value={[...elegidas].join(',')} />

      <div className="flex items-start gap-3 px-4 pb-2.5 pt-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-semibold leading-tight text-ink">Avance del día</h1>
          <p className="mt-0.5 text-[13.5px] text-muted">{obraNombre} · {diaMes(fecha)}</p>
        </div>
        {aplicables.length > 0 && (
          <button
            type="button"
            data-testid="todas-ninguna"
            onClick={() => setElegidas(elegidas.size < aplicables.length
              ? new Set(aplicables.map((f) => f.actividad_id))
              : new Set())}
            className="flex h-[44px] shrink-0 items-center text-[13.5px] font-medium text-ink"
          >
            {elegidas.size < aplicables.length ? 'Todas' : 'Ninguna'}
          </button>
        )}
      </div>

      {/* LAS TRES VISTAS DEL CANÓNICO J04. Arranca en «En curso» porque es lo que se cierra al final
          del día: en esta obra 60 de 89 tareas ya están al 100 % y la lista completa entierra las
          cinco que el jefe vino a tocar. Si no hay ninguna en curso, arranca en «Todo» — un filtro
          que abre la pantalla vacía se lee como «no hay tareas». */}
      {filas.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          {VISTAS_MASIVAS.map(([id, label]) => {
            const n = filas.filter((f) => enVista(f, id)).length
            return (
              <button
                key={id}
                type="button"
                // CAMBIAR DE VISTA SUELTA LA SELECCIÓN. Sin esto, una tarea marcada en «En curso»
                // se guarda desde «Sin arrancar» sin estar en pantalla: una escritura que el jefe
                // no puede ver antes de confirmarla.
                onClick={() => { setVista(id); setElegidas(new Set()) }}
                data-testid={`vista-${id}`}
                aria-pressed={vista === id}
                className={`flex h-[44px] shrink-0 items-center gap-2 rounded-[10px] border px-3.5 text-[13.5px] ${
                  vista === id ? 'border-marca bg-marca-soft font-semibold text-ink' : 'border-surface bg-surface text-ink'
                }`}
              >
                {label}
                <span className={`font-mono text-[12px] tabular-nums ${vista === id ? 'text-ink' : 'text-faint'}`}>
                  {n}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex flex-col gap-3.5 px-4 pb-6">
        {estado?.ok && <Confirmacion testid="resultado-masivo">{estado.mensaje}</Confirmacion>}
        {estado && !estado.ok && (
          <Aviso tono="neg" titulo="No se pudo aplicar" testid="resultado-masivo">{estado.mensaje}</Aviso>
        )}

        {filas.length === 0 ? (
          <Panel testid="masivo-vacio">
            <Nada>
              Esta obra no tiene tareas que se puedan medir. Los frentes agrupan, no se miden: el
              avance se carga en las tareas que cuelgan de ellos.
            </Nada>
          </Panel>
        ) : (
          grupos.map((g) => (
            <div key={g.nombre}>
              <Rotulo>{g.nombre.toUpperCase()}</Rotulo>
              <Panel>
                {g.filas.map((f) => {
                  const marcada = elegidas.has(f.actividad_id)
                  return (
                    <button
                      key={f.actividad_id}
                      type="button"
                      disabled={!f.aplicable}
                      data-testid={f.aplicable ? 'tarea-masiva' : 'tarea-no-aplicable'}
                      aria-pressed={marcada}
                      onClick={() => setElegidas(alternar(elegidas, f.actividad_id))}
                      className={`flex min-h-[64px] w-full items-center gap-3.5 border-t border-surface-sunken px-4 py-3.5 text-left first:border-t-0 disabled:cursor-not-allowed ${
                        marcada ? 'bg-marca-soft' : ''
                      }`}
                    >
                      <span className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] text-[14px] font-semibold ${
                        !f.aplicable ? 'border-line bg-surface-sunken text-faint'
                          : marcada ? 'border-marca bg-marca text-ink' : 'border-line-strong bg-surface'
                      }`}>
                        {marcada ? '✓' : ''}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[15px] leading-tight ${
                          f.aplicable ? 'text-ink' : 'text-muted'} ${marcada ? 'font-semibold' : ''}`}>
                          {f.nombre}
                        </span>
                        {/* El motivo va APAGADO, no en ámbar: «ya está al 100 %» es trabajo hecho,
                            no un problema, y en esta obra son 60 de 89 filas. Un color de alerta que
                            cubre dos tercios de la lista deja de ser una alerta. */}
                        <span className={`mt-0.5 block text-[12.5px] ${f.aplicable ? 'text-muted' : 'text-faint'}`}>
                          {f.motivo ?? `se mide por ${f.metodo}`}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[16px] font-semibold tabular-nums text-ink">
                        {f.avance_pct == null ? '—' : `${f.avance_pct} %`}
                      </span>
                    </button>
                  )
                })}
              </Panel>
            </div>
          ))
        )}
      </div>

      {/* EL HUECO PARA LA BARRA. `BarraContextual` es `fixed`: sin este espaciador la última tarea
          de la lista queda debajo y no se puede tocar — la misma trampa que ya pagó el perfil
          empleado. Alto generoso porque en el teléfono la barra se apila (chips + aviso + dos
          botones) y crece cuando aparece el criterio. */}
      <div aria-hidden data-testid="espaciador-barra" className={elegidas.size === 0 ? 'h-[92px]' : 'h-[300px] lg:h-[80px]'} />

      {elegidas.size === 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[520px] border-t border-line bg-canvas px-4 py-4 text-center">
          <p className="text-[14px] text-muted" data-testid="sin-eleccion">
            {aplicables.length === 0
              ? 'Ninguna tarea de esta obra se puede cargar por porcentaje.'
              : 'Elegí las tareas que avanzaron'}
          </p>
        </div>
      ) : (
        <BarraContextual
          testid="barra-masivo"
          titulo={`${elegidas.size} ${elegidas.size === 1 ? 'tarea' : 'tareas'}`}
          subtitulo={`de ${aplicables.length} que se pueden cargar por porcentaje`}
          // UNA SOLA OPERACIÓN, y se declara igual. El jefe en el teléfono no cambia responsable ni
          // corre fechas: eso se decide sentado, en el workspace de Tareas. Ofrecer acá las cuatro
          // sería la web comprimida, que es lo que el contrato de este perfil prohíbe.
          operaciones={[{ id: 'avance', label: 'Poner el avance en' }]}
          activa="avance"
          alElegirOperacion={() => {}}
          aviso={faltaCriterio ? AVISO_CRITERIO : aviso}
          alCancelar={() => setElegidas(new Set())}
          // DICE QUÉ VA A PASAR, no «aplicar». Parado en la obra, «Guardar 3 avances» se verifica
          // contra lo que uno acaba de tocar; «Aplicar a 3» obliga a recordar a qué.
          aplicarLabel={`Guardar ${elegidas.size} ${elegidas.size === 1 ? 'avance' : 'avances'}`}
          alAplicar={() => formulario.current?.requestSubmit()}
          pendiente={enviando || faltaCriterio}
        >
          <ChipsValor
            valores={VALORES_MASIVOS.map((v) => ({ valor: String(v), etiqueta: `${v} %` }))}
            activo={String(objetivo)}
            alElegir={(v) => setObjetivo(Number(v))}
            testid="valor"
          />
          {exigeCriterio && (
            <textarea
              name="criterio"
              value={criterio}
              onChange={(e) => setCriterio(e.target.value)}
              rows={2}
              data-testid="criterio-masivo"
              placeholder="Con qué criterio (lo exige el método manual)"
              className="w-full rounded-[12px] bg-accent-hover px-3 py-2.5 text-[13px] leading-relaxed text-white outline-none placeholder:text-faint"
            />
          )}
        </BarraContextual>
      )}
    </form>
  )
}

/** `2026-08-23` → `23/08`. La fecha del día que se está cerrando, sin el año. */
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

function alternar(s: Set<string>, id: string): Set<string> {
  const n = new Set(s)
  if (n.has(id)) n.delete(id)
  else n.add(id)
  return n
}

/** Los renglones agrupados por su frente, conservando el orden constructivo en que llegaron. */
function agrupar(
  actividades: ActividadDelJefe[], filas: Renglon[], frentes: Record<string, string>,
): { nombre: string; filas: Renglon[] }[] {
  const rubroDe = new Map(actividades.map(
    (a) => [a.actividad_id, frentes[a.actividad_id] ?? a.rubro?.trim() ?? 'Sin frente']))
  const salida: { nombre: string; filas: Renglon[] }[] = []
  const indice = new Map<string, { nombre: string; filas: Renglon[] }>()
  for (const f of filas) {
    const nombre = rubroDe.get(f.actividad_id) ?? 'Sin frente'
    let g = indice.get(nombre)
    if (!g) {
      g = { nombre, filas: [] }
      indice.set(nombre, g)
      salida.push(g)
    }
    g.filas.push(f)
  }
  return salida
}
