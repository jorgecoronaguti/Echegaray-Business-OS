'use client'

// ═══ 05 · REGISTRAR AVANCE — los métodos, el criterio y la firma ═══
//
// Es una PANTALLA ENTERA y no un panel: registrar avance es el acto que más consecuencias tiene en
// el módulo —mueve el avance de la obra, el rendimiento y la proyección de HH— y se hace mirando
// tres cosas a la vez (los pasos, las horas y la evidencia). En un cajón lateral de 412px no entran.
//
// ═══ EL CRITERIO DEL MÉTODO MANUAL ═══
//
// Sin criterio escrito, la primaria queda deshabilitada y el aviso lo dice con todas las letras. La
// misma regla está como CHECK en la base (`obra_ejecucion_manual_exige_criterio`) porque la misma
// fila entra por el teléfono, por el parte diario y por una acción en lote: una regla que vive sólo
// en el formulario es una regla que tres de cuatro puertas no cumplen.
//
// ═══ LA CANTIDAD QUE SE PIDE ES LA ACUMULADA, LA QUE SE GUARDA ES LA DIFERENCIA ═══
//
// La vista SUMA los registros de producción. Guardar el acumulado como si fuera un registro nuevo
// duplicaría todo lo anterior. La resta la hace `deltaDeCantidad` en el servidor, y acá se muestran
// las dos puntas —«anterior 65 %» y «ahora 74 %»— para que se vea qué se está por escribir.

import { useState } from 'react'
import { FormAccion } from '@/shared/components/ui'
import { avancePorCantidad, hhProyectadas, proyeccionExcedida } from '../services/avance'
import { hh as fmtHH, porcentaje } from './formato'
import type { PasoDeActividad } from '../services/tareasService'
import type { NodoObra } from '../services/wbs'

const METODOS = [['pasos', 'Pasos'], ['cantidad', 'Cantidad'], ['manual', 'Manual']] as const
type MetodoRegistrable = (typeof METODOS)[number][0]

const ESCALONES = [0, 25, 50, 75, 100]

/** Con qué método arranca la pantalla: el de la actividad si se puede registrar así, y si no,
 *  manual — que es el único que no exige nada cargado de antemano. */
function metodoInicial(n: NodoObra): MetodoRegistrable {
  if (n.metodo_avance === 'pasos' || n.metodo_avance === 'cantidad') return n.metodo_avance
  return 'manual'
}

export function FormAvance({
  nodo, pasos, cuadrillas, autor, hoy, registrar,
}: {
  nodo: NodoObra
  pasos: PasoDeActividad[]
  cuadrillas: { id: string; nombre: string }[]
  autor: string
  hoy: string
  registrar: (form: FormData) => Promise<{ ok: true; mensaje?: string } | { ok: false; error: string }>
}) {
  const [metodo, setMetodo] = useState<MetodoRegistrable>(metodoInicial(nodo))
  const [tildados, setTildados] = useState<ReadonlySet<string>>(
    () => new Set(pasos.filter((p) => p.hecho_en).map((p) => p.id)),
  )
  const [acumulada, setAcumulada] = useState(String(nodo.cantidad_ejecutada ?? ''))
  const [declarado, setDeclarado] = useState(String(nodo.avance_pct ?? 0))
  const [criterio, setCriterio] = useState('')

  const pesoTotal = pasos.reduce((s, p) => s + Number(p.peso), 0)
  const pesoHecho = pasos.filter((p) => tildados.has(p.id)).reduce((s, p) => s + Number(p.peso), 0)
  const avancePasos = pesoTotal > 0 ? Math.round((pesoHecho / pesoTotal) * 1000) / 10 : null
  const avanceCant = avancePorCantidad(Number(acumulada) || 0, nodo.cantidad_objetivo)
  const resultante = metodo === 'pasos' ? avancePasos : metodo === 'cantidad' ? avanceCant : Number(declarado)
  const faltaCriterio = metodo === 'manual' && criterio.trim() === ''
  const proy = hhProyectadas(nodo.hh_real, resultante)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-ink">{nodo.nombre}</h1>
          <p className="text-[12px] text-muted">
            {/* La ruta sólo si agrega algo: en una actividad de la raíz, `camino` es el nombre. */}
            {nodo.camino !== nodo.nombre && nodo.camino}
            {nodo.cantidad_objetivo !== null && (
              <span className="ml-2 font-mono text-[11px] text-faint">
                {nodo.cantidad_objetivo} {nodo.unidad ?? ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10.5px] uppercase tracking-[0.05em] text-faint">Avance</div>
            <div className="font-mono text-[30px] font-semibold leading-none tabular-nums text-ink" data-testid="avance-resultante">
              {porcentaje(resultante) ?? 'sin base'}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10.5px] uppercase tracking-[0.05em] text-faint">Método</div>
            <div className="flex gap-1.5">
              {METODOS.map(([id, label]) => (
                <button
                  key={id} type="button" onClick={() => setMetodo(id)} aria-pressed={metodo === id}
                  data-testid={`metodo-${id}`}
                  className={`rounded-control border px-2.5 py-1 text-[12px] ${
                    metodo === id ? 'border-marca bg-marca-soft text-ink' : 'border-line text-muted hover:text-ink'
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* LA CONVERSIÓN SE DICE ANTES DE HACERLA. 141 actividades vivas se miden sumando partes
          diarios; registrar acá las pasa a otro método, y eso cambia de dónde sale su número. */}
      {nodo.metodo_avance === 'partes' && (
        <p className="mb-3 border-l-[3px] border-warn bg-warn-soft px-3 py-2 text-[12px] text-warn" data-testid="aviso-partes">
          Esta actividad venía sumando los avances de sus partes diarios. Registrar acá la pasa a
          «{METODOS.find(([m]) => m === metodo)?.[1]}» y su porcentaje pasa a salir de otro lado.
        </p>
      )}

      <FormAccion
        accion={registrar}
        enviar="Registrar avance"
        testid="form-avance"
        mensajeOk="Registrado."
        bloqueado={faltaCriterio}
        motivoBloqueo="Falta el criterio."
      >
        <input type="hidden" name="metodo" value={metodo} />
        <input type="hidden" name="fecha" value={hoy} />

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div>
            {metodo === 'pasos' && (
              <section data-testid="cuerpo-pasos">
                <h2 className="mb-1.5 text-[13px] font-semibold text-ink">Pasos ejecutados</h2>
                {pasos.length === 0 ? (
                  <p className="text-[12.5px] text-muted">
                    Esta actividad todavía no tiene pasos cargados: sin pasos no hay peso que sumar.
                    Elegí otro método o cargá la secuencia primero.
                  </p>
                ) : (
                  <ul>
                    {pasos.map((p) => (
                      <li key={p.id} className="flex items-center gap-2.5 border-b border-[#EFEEEA] py-2 last:border-0">
                        <input
                          type="checkbox" name="paso" value={p.id}
                          checked={tildados.has(p.id)}
                          onChange={(e) => setTildados((prev) => {
                            const s = new Set(prev)
                            if (e.target.checked) s.add(p.id); else s.delete(p.id)
                            return s
                          })}
                          aria-label={p.nombre}
                          data-testid={`paso-${p.orden}`}
                          className="h-[18px] w-[18px] shrink-0 accent-marca"
                        />
                        <span className="flex-1 text-[13.5px] text-ink-soft">{p.nombre}</span>
                        {p.tiempo_tecnico && (
                          <span className="text-[11px] text-warn">
                            tiempo técnico{p.dias_tecnicos ? ` · ${p.dias_tecnicos} d` : ''}
                          </span>
                        )}
                        <span className="w-10 text-right font-mono text-[12.5px] tabular-nums text-muted">{p.peso}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {pasos.length > 0 && (
                  <p className="mt-2 flex items-baseline justify-between">
                    <span className="text-[12px] text-faint">Suma de pesos ejecutados</span>
                    <span className="font-mono text-[16px] font-semibold tabular-nums text-ink">{porcentaje(avancePasos)}</span>
                  </p>
                )}
              </section>
            )}

            {metodo === 'cantidad' && (
              <section data-testid="cuerpo-cantidad">
                <h2 className="mb-1.5 text-[13px] font-semibold text-ink">Cantidad ejecutada acumulada</h2>
                <div className="flex items-center gap-2">
                  <input
                    type="number" step="any" min={0} name="cantidad_ejecutada"
                    value={acumulada} onChange={(e) => setAcumulada(e.target.value)}
                    aria-label="Cantidad ejecutada acumulada"
                    data-testid="campo-cantidad"
                    className="h-11 w-[180px] rounded-control border border-line-strong px-2.5 font-mono text-[17px] font-semibold tabular-nums text-ink"
                  />
                  <span className="text-[13px] text-muted">{nodo.unidad ?? ''}</span>
                  <span className="text-[12.5px] text-faint">
                    {nodo.cantidad_objetivo === null
                      ? 'sin cantidad objetivo cargada: no hay porcentaje que calcular'
                      : `de ${nodo.cantidad_objetivo} ${nodo.unidad ?? ''} contratados`}
                  </span>
                </div>
                <p className="mt-2 text-[12px] text-muted">
                  anterior {porcentaje(nodo.avance_pct) ?? 'sin avance'} · ahora{' '}
                  <span className="font-medium text-ink">{porcentaje(avanceCant) ?? 'sin base'}</span>
                </p>
              </section>
            )}

            {metodo === 'manual' && (
              <section data-testid="cuerpo-manual">
                <h2 className="mb-1 text-[13px] font-semibold text-ink">Avance declarado</h2>
                <p className="mb-2 text-[12px] text-muted">Medir por unidad no representa este trabajo.</p>
                <input type="hidden" name="avance_pct" value={declarado} />
                <div className="flex flex-wrap gap-1.5">
                  {ESCALONES.map((v) => (
                    <button
                      key={v} type="button" onClick={() => setDeclarado(String(v))}
                      aria-pressed={declarado === String(v)} data-testid={`escalon-${v}`}
                      className={`flex-1 rounded-control border px-3 py-2 font-mono text-[14px] font-semibold tabular-nums ${
                        declarado === String(v) ? 'border-marca bg-marca-soft text-ink' : 'border-line text-muted hover:text-ink'
                      }`}
                    >{v} %</button>
                  ))}
                </div>
                <label className="mt-3 block">
                  <span className="mb-1 block text-[12.5px] text-ink-soft">Criterio · obligatorio</span>
                  <textarea
                    name="criterio" rows={3} value={criterio} onChange={(e) => setCriterio(e.target.value)}
                    placeholder="Con qué criterio se declara este porcentaje"
                    data-testid="campo-criterio"
                    className={`w-full rounded-control border px-2.5 py-2 text-[13px] text-ink ${
                      faltaCriterio ? 'border-warn' : 'border-line-strong'
                    }`}
                  />
                </label>
              </section>
            )}

            <section className="mt-5 border-t border-line pt-3" data-testid="hh-consumidas">
              <h2 className="mb-1.5 text-[13px] font-semibold text-ink">HH consumidas — no es avance</h2>
              <div className="grid grid-cols-3 gap-3">
                <Cifra rotulo="Plan" valor={fmtHH(nodo.hh_plan)} falta="sin cargar" sub="del análisis" />
                <Cifra rotulo="Real" valor={fmtHH(nodo.hh_real)} falta="sin registro" sub="cargadas por asistencia" />
                <Cifra rotulo="Proyectadas" valor={fmtHH(proy)} falta="sin base" sub="al ritmo actual"
                  alerta={proyeccionExcedida(proy, nodo.hh_plan)} />
              </div>
            </section>

            {/* El `id` es el destino de «Adjuntar evidencia» del panel de la tarea (04): esta es la
                pantalla donde la evidencia se carga, porque la evidencia es de UN registro de
                avance y no de la actividad entera. */}
            <section id="evidencia" className="mt-5 border-t border-line pt-3">
              <h2 className="mb-1.5 text-[13px] font-semibold text-ink">Evidencia</h2>
              {/* NO HAY SUBIDA DE ARCHIVOS EN EL OS: el archivo vive en Drive y acá se guarda el
                  enlace, igual que en Documentos. Un cargador propio sería una segunda copia del
                  mismo papel, y la que se desactualiza es siempre la copia. */}
              <input
                type="url" name="evidencia" placeholder="Pegá el enlace de Drive de la foto o el remito"
                aria-label="Enlace de la evidencia" data-testid="campo-evidencia"
                className="h-control w-full rounded-control border border-line-strong px-2.5 text-[13px] text-ink placeholder:text-faint"
              />
            </section>
          </div>

          <aside>
            <h2 className="mb-1.5 text-[13px] font-semibold text-ink">Queda firmado con</h2>
            <Firma clave="Autor" valor={autor} />
            <Firma clave="Fecha" valor={hoy.split('-').reverse().join('/')} />
            <label className="mt-2 block">
              <span className="mb-1 block text-[11.5px] text-faint">Cuadrilla</span>
              <select name="cuadrilla_id" data-testid="campo-cuadrilla"
                className="h-control w-full rounded-control border border-line-strong px-2 text-[12.5px] text-ink">
                <option value="">sin cuadrilla declarada</option>
                {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <Firma clave="Método" valor={METODOS.find(([m]) => m === metodo)?.[1] ?? metodo} />
            <Firma clave="Origen" valor="panel de escritorio" />

            {faltaCriterio && (
              <p data-testid="aviso-criterio"
                className="mt-3 border-l-[3px] border-warn bg-warn-soft px-3 py-2 text-[12px] text-warn">
                El método manual exige un criterio escrito. Sin eso el porcentaje no se puede
                interpretar después.
              </p>
            )}
          </aside>
        </div>
      </FormAccion>
    </div>
  )
}

function Firma({ clave, valor }: { clave: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[#EFEEEA] py-1.5">
      <span className="text-[11.5px] text-faint">{clave}</span>
      <span className="text-[12.5px] text-ink-soft">{valor}</span>
    </div>
  )
}

function Cifra({ rotulo, valor, falta, sub, alerta = false }: {
  rotulo: string; valor: string | null; falta: string; sub: string; alerta?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.05em] text-faint">{rotulo}</div>
      <div className={`font-mono text-[22px] font-semibold tabular-nums ${alerta ? 'text-warn' : 'text-ink'}`}>
        {valor ?? <span className="font-sans text-[13px] font-normal text-faint">{falta}</span>}
      </div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  )
}
