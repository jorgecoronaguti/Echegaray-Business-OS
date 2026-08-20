'use client'

// LOS BLOQUES DE GESTIÓN DEL PANEL — lo que se abre cuando se va a HACER algo.
//
// Impedimentos, tareas, notas, papeles, precedencias y el cambio de rubro. Todos plegados salvo los
// impedimentos: un trabajo frenado no se esconde detrás de un clic.
//
// NINGUNO DE ESTOS BLOQUES TIENE SU PROPIA ACCIÓN. Anotar un impedimento acá llama a la MISMA
// función que lo anota en Operación, y vincular un papel a la MISMA que lo vincula en Documentos: dos
// puertas de escritura del mismo hecho se contestan distinto el día que a una se le agregue un campo.

import { useState } from 'react'
import {
  BotonAccion, Campo, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import type { Actividad, Dependencia, DocumentoObra, Restriccion } from '../types'
import {
  TIPO_DEPENDENCIA, TIPO_DEPENDENCIA_LABEL, TIPO_RESTRICCION, TIPO_RESTRICCION_LABEL,
} from '../types'
import type { NotaActividad } from '../services/recursosService'
import { urlDeDrive } from '../services/driveUrl'
import { fecha } from './formato'

// ═══════════════════════════════════════════════════════════════════════════════
// IMPEDIMENTOS — la ficha completa, y se resuelve desde acá
// ═══════════════════════════════════════════════════════════════════════════════
//
// Antes el panel sólo los MOSTRABA y había que ir a Operación para anotar uno o liberarlo. El
// impedimento se descubre mirando la actividad: mandarlo a otra pantalla es la manera de que se
// anote mañana o nunca. La escritura de Operación sigue existiendo —es la lista completa de la
// obra— y las dos llaman a la MISMA acción.

export function BloqueImpedimentosActividad({ a, abiertos, liberados, crear, liberar, editar, hoyIso }: {
  a: Actividad
  abiertos: Restriccion[]
  liberados: Restriccion[]
  crear?: AccionFormulario
  liberar?: (restriccionId: string) => Promise<ResultadoAccion>
  /** Corregir el que ya está: sin esto, mover una fecha comprometida obliga a liberar el
   *  impedimento y anotar otro, y la obra pierde cuándo se detectó el problema. */
  editar?: (restriccionId: string, form: FormData) => Promise<ResultadoAccion>
  hoyIso: string
}) {
  const hay = abiertos.length > 0
  return (
    // SIN CAJA NI RÓTULO PROPIO: el título, el contador y la alerta de vencimiento los pone la
    // sección plegable que lo contiene (`Plegable` del DS). Repetirlos acá era decir dos veces lo
    // mismo dentro de un panel de 380px.
    <div data-testid="panel-impedimentos">
      {!hay && <p className="text-[12.5px] text-faint">Ninguno abierto.</p>}
      <ul className="space-y-1.5">
        {abiertos.map((r) => {
          const vencido = !!r.fecha_compromiso && r.fecha_compromiso < hoyIso
          return (
            // UN IMPEDIMENTO ES UNA FICHA, NO UNA LÍNEA. Quién lo resuelve y para cuándo van
            // ROTULADOS: son los dos datos que convierten una queja anotada en algo que alguien
            // tiene que destrabar, y sin el rótulo se leían como un texto suelto más.
            <li key={r.id} className="text-[12.5px]" data-testid="impedimento-actividad">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 font-medium text-ink">
                  <span aria-hidden className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${vencido ? 'bg-neg' : 'bg-warn'}`} />
                  {r.descripcion}
                </span>
                <span className="shrink-0 rounded border border-line px-1.5 py-[1px] text-[10px] uppercase text-muted">
                  {vencido ? 'vencido' : 'abierto'}
                </span>
              </div>
              <p className="mt-0.5 text-[11.5px] text-muted">
                <span className="text-faint">Responsable:</span> {r.responsable ?? 'sin asignar'}
                {' · '}
                <span className="text-faint">Vencimiento:</span>{' '}
                <span className={vencido ? 'font-medium text-neg' : ''}>{fecha(r.fecha_compromiso)}</span>
                {' · '}{TIPO_RESTRICCION_LABEL[r.tipo] ?? r.tipo}
              </p>
              {(liberar || editar) && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {liberar && (
                    <BotonAccion accion={liberar} args={[r.id]} testid="resolver-impedimento">Resolver</BotonAccion>
                  )}
                  {editar && (
                    // EL FORMULARIO OCUPA SU PROPIA LÍNEA. Abierto dentro de la fila de botones,
                    // «Resolver» quedaba encajado entre «Tipo» y «Quién lo resuelve» — se leía como
                    // un campo más del formulario en vez de como la otra acción del impedimento.
                    <details data-testid="editar-impedimento" className="w-full basis-full">
                      <summary className="cursor-pointer text-[11.5px] text-muted hover:text-ink">Editar</summary>
                      <div className="mt-1.5 w-full">
                        <FormAccion
                          accion={editar.bind(null, r.id)}
                          testid="form-editar-impedimento"
                          enviar="Guardar"
                          mensajeOk="Impedimento corregido."
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <Campo label="Qué frena el trabajo" ancho="col-span-2">
                              <input name="descripcion" defaultValue={r.descripcion} required minLength={3} maxLength={300} className={CTRL} />
                            </Campo>
                            <Campo label="Tipo">
                              <select name="tipo" required defaultValue={r.tipo} className={CTRL}>
                                {TIPO_RESTRICCION.map((t) => <option key={t} value={t}>{TIPO_RESTRICCION_LABEL[t]}</option>)}
                              </select>
                            </Campo>
                            <Campo label="Quién lo resuelve">
                              <input name="responsable" defaultValue={r.responsable ?? ''} required minLength={2} maxLength={120} className={CTRL} />
                            </Campo>
                            <Campo label="Para cuándo" ancho="col-span-2">
                              <input type="date" name="fecha_compromiso" defaultValue={r.fecha_compromiso ?? ''} required className={CTRL} />
                            </Campo>
                          </div>
                        </FormAccion>
                      </div>
                    </details>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {liberados.length > 0 && (
        <p className="mt-1 text-[11.5px] text-faint">{liberados.length} ya resuelto(s).</p>
      )}
      {crear && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[12.5px] text-muted hover:text-ink">+ Impedimento</summary>
          <div className="mt-2">
            <FormAccion accion={crear} testid="form-impedimento-actividad" enviar="Anotar" limpiarAlOk mensajeOk="Impedimento anotado.">
              <input type="hidden" name="actividad_id" value={a.id} />
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Qué frena el trabajo" ancho="col-span-2">
                  <input name="descripcion" required minLength={3} maxLength={300} className={CTRL} />
                </Campo>
                <Campo label="Tipo">
                  <select name="tipo" required defaultValue="material" className={CTRL}>
                    {TIPO_RESTRICCION.map((t) => <option key={t} value={t}>{TIPO_RESTRICCION_LABEL[t]}</option>)}
                  </select>
                </Campo>
                <Campo label="Quién lo resuelve">
                  <input name="responsable" required minLength={2} maxLength={120} className={CTRL} />
                </Campo>
                <Campo label="Para cuándo" ancho="col-span-2">
                  <input type="date" name="fecha_compromiso" required className={CTRL} />
                </Campo>
              </div>
            </FormAccion>
          </div>
        </details>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAREAS — el nivel opcional, sin rollup automático
// ═══════════════════════════════════════════════════════════════════════════════
//
// Que 3 de 6 estén hechas NO es 50% de la actividad: las seis no duran ni pesan lo mismo. Se dice
// «3 de 6», que es un hecho, en vez de un porcentaje que nadie puede defender.

export function BloqueTareas({ tareas, crear, alternar }: {
  tareas: Actividad[]
  crear?: AccionFormulario
  alternar?: (tareaId: string, estado: string) => Promise<ResultadoAccion>
}) {
  if (tareas.length === 0 && !crear) return null
  const hechas = tareas.filter((t) => t.estado === 'hecha').length
  return (
    <div data-testid="bloque-tareas">
      {/* «3 de 6» NO es 50% de la actividad: las seis no duran ni pesan lo mismo. Se dice el hecho,
          no un porcentaje que nadie puede defender. */}
      {tareas.length > 0 && <p className="mb-1.5 text-[11.5px] text-faint">{hechas} de {tareas.length} hechas</p>}
      <ul className="space-y-1">
        {tareas.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 text-[12.5px]" data-testid="tarea">
            <span className={t.estado === 'hecha' ? 'min-w-0 truncate text-faint line-through' : 'min-w-0 truncate text-muted'}>
              {t.nombre}
            </span>
            {alternar && (
              <BotonAccion
                accion={alternar}
                args={[t.id, t.estado === 'hecha' ? 'pendiente' : 'hecha']}
                testid="alternar-tarea"
              >{t.estado === 'hecha' ? 'Reabrir' : 'Hecha'}</BotonAccion>
            )}
          </li>
        ))}
        {tareas.length === 0 && <li className="text-[12.5px] text-faint">Ninguna. La tarea es opcional.</li>}
      </ul>
      {crear && (
        <div className="mt-2 border-t border-line pt-2">
          <FormAccion accion={crear} testid="form-tarea" enviar="Agregar" limpiarAlOk mensajeOk="Tarea agregada.">
            <input
              name="nombre" required minLength={2} maxLength={200} className={CTRL}
              placeholder="Armado, encofrado, hormigonado…" data-testid="tarea-nombre"
            />
          </FormAccion>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTAS — texto, autor y fecha. Nada más.
// ═══════════════════════════════════════════════════════════════════════════════
//
// No es un sistema de comentarios: sin hilos, sin menciones y sin edición. Y no duplica el
// comentario de una jornada, que vive en su parte y se lee en «Ejecución reciente».

export function BloqueNotas({ notas, agregar, borrar }: {
  notas: NotaActividad[]
  agregar?: AccionFormulario
  borrar?: (notaId: string) => Promise<ResultadoAccion>
}) {
  if (!agregar && notas.length === 0) return null
  return (
    // LAS NOTAS SE VEN, NO SE ABREN. Eran un plegable más al final: una nota que hay que descubrir
    // no la lee nadie, y el campo para escribirla estaba a dos clics. Es el último bloque del panel
    // y el más simple que hay: texto, quién y cuándo.
    <div data-testid="bloque-notas">
      <ul className="space-y-1.5">
        {notas.slice(0, 8).map((n) => (
          <li key={n.id} className="text-[12.5px]" data-testid="nota-actividad">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 whitespace-pre-wrap text-ink">{n.texto}</span>
              {borrar && <BotonAccion accion={borrar} args={[n.id]} testid="borrar-nota">borrar</BotonAccion>}
            </div>
            <span className="text-[11.5px] text-faint">
              {n.autor ?? 'alguien'} · {fecha(n.creado_en.slice(0, 10))}
            </span>
          </li>
        ))}
        {notas.length === 0 && <li className="text-[12.5px] text-faint">Ninguna.</li>}
      </ul>
      {agregar && (
        <div className="mt-2 border-t border-line pt-2">
          <FormAccion accion={agregar} testid="form-nota" enviar="Agregar" limpiarAlOk mensajeOk="Nota agregada.">
            <input name="texto" required minLength={2} maxLength={1000} className={CTRL} placeholder="Agregar nota…" data-testid="nota-texto" />
          </FormAccion>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENTOS — el archivo NO se copia: se guarda el vínculo de Drive
// ═══════════════════════════════════════════════════════════════════════════════

export function BloqueDocumentos({ a, documentos, vincular, soltar }: {
  a: Actividad
  /** Ya filtrados a los de ESTA actividad. Los de la obra sin actividad viven en la solapa Documentos. */
  documentos: DocumentoObra[]
  vincular?: AccionFormulario
  soltar?: (driveFileId: string) => Promise<ResultadoAccion>
}) {
  if (!vincular && documentos.length === 0) return null
  return (
    <div data-testid="bloque-documentos-actividad">
      <ul className="space-y-1">
        {documentos.map((d) => (
          <li key={d.drive_file_id} className="flex items-start justify-between gap-2 text-[12.5px]" data-testid="documento-actividad">
            <a
              href={urlDeDrive(d.drive_file_id, d.tipo)}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-ink underline underline-offset-2"
            >{d.name ?? d.drive_file_id}</a>
            <span className="shrink-0 text-[11.5px] text-faint">{d.rol ?? ''}</span>
            {soltar && <BotonAccion accion={soltar} args={[d.drive_file_id]} testid="soltar-documento">quitar</BotonAccion>}
          </li>
        ))}
        {documentos.length === 0 && <li className="text-[12.5px] text-faint">Ninguno.</li>}
      </ul>
      {vincular && (
        <div className="mt-2 border-t border-line pt-2">
          <FormAccion accion={vincular} testid="form-documento-actividad" enviar="Vincular" limpiarAlOk mensajeOk="Documento vinculado.">
            <input type="hidden" name="actividad_id" value={a.id} />
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Enlace de Drive" ancho="col-span-2">
                <input name="enlace" required className={CTRL} placeholder="https://drive.google.com/file/d/…" data-testid="documento-enlace" />
              </Campo>
              <Campo label="Nombre" ayuda="Sólo si el archivo no está en el índice.">
                <input name="nombre" maxLength={300} className={CTRL} />
              </Campo>
              <Campo label="Para qué es">
                <input name="rol" maxLength={120} className={CTRL} placeholder="plano · evidencia · remito" />
              </Campo>
            </div>
          </FormAccion>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRECEDENCIAS — de qué depende, y a quién habilita
// ═══════════════════════════════════════════════════════════════════════════════
//
// Las dos direcciones se muestran juntas porque las dos son consecuencia de tocar esta fecha. Lo que
// se EDITA es sólo la primera —de qué depende ÉSTA—: dejar cargar las dos desde el mismo lado
// duplicaría cada arista en la cabeza del que la carga.

export function Dependencias({ a, actividades, dependencias, agregar, quitar }: {
  a: Actividad
  actividades: Actividad[]
  dependencias: Dependencia[]
  agregar?: (destinoId: string, form: FormData) => Promise<ResultadoAccion>
  quitar?: (dependenciaId: string) => Promise<ResultadoAccion>
}) {
  const nombre = (id: string) => actividades.find((x) => x.id === id)?.nombre ?? 'una actividad archivada'
  const dependeDe = dependencias.filter((d) => d.destino_id === a.id)
  const habilitaA = dependencias.filter((d) => d.origen_id === a.id)
  // No se puede depender de sí misma ni de algo que ya la precede: se sacan de la lista en vez de
  // dejar elegirlas y contestar con un error.
  const yaLigadas = new Set([a.id, ...dependeDe.map((d) => d.origen_id)])
  const elegibles = actividades.filter((x) => !yaLigadas.has(x.id) && x.tipo !== 'resumen')

  return (
    <div data-testid="panel-dependencias">
      {dependeDe.length === 0 ? (
        <p className="text-[12.5px] text-faint">Nada declarado.</p>
      ) : (
        <ul className="space-y-1">
          {dependeDe.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-[12.5px] text-ink">
                {nombre(d.origen_id)}
                <span className="text-faint"> · {TIPO_DEPENDENCIA_LABEL[d.tipo]}{d.lag_dias ? ` · ${d.lag_dias} d` : ''}</span>
              </span>
              {quitar && <BotonAccion accion={quitar} args={[d.id]} testid="quitar-dependencia">quitar</BotonAccion>}
            </li>
          ))}
        </ul>
      )}

      {habilitaA.length > 0 && (
        <p className="mt-2 text-[11.5px] text-faint">
          Habilita a {habilitaA.map((d) => nombre(d.destino_id)).join(', ')}.
        </p>
      )}

      {agregar && elegibles.length > 0 && (
        <div className="mt-2 border-t border-line pt-2">
          <FormAccion
            accion={(form) => agregar(a.id, form)}
            testid="form-dependencia"
            enviar="Agregar dependencia"
            limpiarAlOk
            mensajeOk="Precedencia declarada."
          >
            <div className="grid grid-cols-2 gap-2">
              <Campo label="No puede empezar hasta que termine" ancho="col-span-2">
                <select name="origen_id" required defaultValue="" className={CTRL} data-testid="dependencia-origen">
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
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// EL RUBRO DE LA ACTIVIDAD — mover de grupo sin salir del panel
// ═══════════════════════════════════════════════════════════════════════════════

export function SelectorDeRubro({ a, rubros, mover }: {
  a: Actividad
  rubros: string[]
  mover: (actividadId: string, rubro: string) => Promise<ResultadoAccion>
}) {
  const actual = a.tipo === 'resumen' ? a.nombre : (a.seccion ?? '')
  const [valor, setValor] = useState(actual)
  if (a.tipo === 'resumen' || a.actividad_padre_id) return null
  return (
    <div className="flex items-center gap-1.5" data-testid="mover-de-rubro">
      <select
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        aria-label="Rubro de la actividad"
        className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2 py-1 text-[12.5px] text-ink"
      >
        <option value="">sin rubro</option>
        {rubros.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      {valor !== actual && (
        <BotonAccion accion={mover} args={[a.id, valor]} testid="confirmar-mover-rubro" tono="fuerte">Mover</BotonAccion>
      )}
    </div>
  )
}
