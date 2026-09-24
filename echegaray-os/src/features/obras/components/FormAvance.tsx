'use client'

// ═══ 05 · REGISTRAR AVANCE — los métodos, el criterio y la firma ═══
//
// LENGUAJE ERP OBRAS (24/09/2026). El zip no dibuja la solapa Avance del panel de 400px (el 04 sólo
// dibuja el Resumen): se diseñó con las piezas medidas del 04 y de C01–C10 — eyebrow mono, chips de
// 32 con borde grafito al activo, controles de 32/44 con borde `bordeFuerte`, filas de lista con
// `bordeLista`, avisos con ícono y el número grande en mono. Ningún color fuera de `canon/tokens`.
// La primaria sigue siendo la de `FormAccion` (la amarilla del sistema): es la pieza que garantiza
// que el error del servidor se vea siempre, y reescribirla acá sería una segunda copia de esa regla.
//
// UNA SOLA DEFINICIÓN, DOS ENVASES (orden del dueño 24/08). La pantalla entera de
// `/obras/[obra]/avance/[actividad]` (hoy redirige al panel) y el formulario embebido en el panel
// lateral de la tarea son EL MISMO componente con `variante`: lo que cambia es el envase —el título
// y las dos columnas—, nunca la regla. Duplicar el formulario sería duplicar el criterio del método
// manual, la resta del acumulado y la firma: tres reglas que ya tienen su gemela en la base.
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

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useEstadoDelServidor } from '@/shared/tiempo-real/useEstadoDelServidor'
import { FormAccion } from '@/shared/components/ui'
import { C, MONO } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { Aviso, Chip, EYEBROW, Falta, estiloControl } from './items/crear/Piezas'
import { Cifra } from './panel/PanelPiezas'
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

export interface DatosFormAvance {
  nodo: NodoObra
  pasos: PasoDeActividad[]
  cuadrillas: { id: string; nombre: string }[]
  autor: string
  hoy: string
  registrar: (form: FormData) => Promise<{ ok: true; mensaje?: string } | { ok: false; error: string }>
}

/** Un bloque del formulario: título 12px/600 (el `Titulo` del panel) y, si va después de otro, la
 *  línea `borde` arriba con 16 de aire. */
function Bloque({ titulo, derecha, children, testid, id, linea = false }: {
  titulo: ReactNode; derecha?: ReactNode; children: ReactNode; testid?: string; id?: string; linea?: boolean
}) {
  return (
    <section id={id} data-testid={testid} style={linea ? { borderTop: `1px solid ${C.borde}`, paddingTop: '16px' } : undefined}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: C.tinta }}>{titulo}</div>
        {derecha}
      </div>
      {children}
    </section>
  )
}

export function FormAvance({
  nodo, pasos, cuadrillas, autor, hoy, registrar, variante = 'pagina',
}: DatosFormAvance & {
  /** `panel`: sin título propio y en una sola columna, para el cajón de 400px. */
  variante?: 'pagina' | 'panel'
}) {
  // LO QUE MUESTRA LO GUARDADO SIGUE A LO GUARDADO. Si otro registra el avance desde el teléfono,
  // el tiempo real relee la página y estos campos adoptan el valor nuevo: quedarse con la copia del
  // montaje haría que el acumulado que se escribe acá se reste contra un anterior que ya no es.
  // El criterio no: es texto de quien firma, no un dato que otro pueda haber cambiado.
  const [metodo, setMetodo] = useEstadoDelServidor<MetodoRegistrable>(metodoInicial(nodo))
  const [tildados, setTildados] = useEstadoDelServidor<ReadonlySet<string>>(
    new Set(pasos.filter((p) => p.hecho_en).map((p) => p.id)),
  )
  const [acumulada, setAcumulada] = useEstadoDelServidor(String(nodo.cantidad_ejecutada ?? ''))
  const [declarado, setDeclarado] = useEstadoDelServidor(String(nodo.avance_pct ?? 0))
  const [criterio, setCriterio] = useState('')

  // UN CONTENEDOR NO SE MIDE, SE AGREGA: la base lo rechaza con un trigger. La guarda vive ACÁ y
  // no en la página porque el mismo formulario se embebe en el panel de la tarea: dejada afuera,
  // cada embebedor tendría que acordarse de repetirla y el primero que se olvide muestra un
  // formulario que la base va a rebotar después de completarlo.
  const esContenedor = nodo.es_contenedor

  const pesoTotal = pasos.reduce((s, p) => s + Number(p.peso), 0)
  const pesoHecho = pasos.filter((p) => tildados.has(p.id)).reduce((s, p) => s + Number(p.peso), 0)
  const avancePasos = pesoTotal > 0 ? Math.round((pesoHecho / pesoTotal) * 1000) / 10 : null
  const avanceCant = avancePorCantidad(Number(acumulada) || 0, nodo.cantidad_objetivo)
  const resultante = metodo === 'pasos' ? avancePasos : metodo === 'cantidad' ? avanceCant : Number(declarado)
  const faltaCriterio = metodo === 'manual' && criterio.trim() === ''
  const proy = hhProyectadas(nodo.hh_real, resultante)
  const nombreMetodo = METODOS.find(([m]) => m === metodo)?.[1] ?? metodo

  if (esContenedor) {
    return (
      <div data-testid="es-contenedor">
        <Aviso tono="warn" tam={12}>
          «{nodo.nombre}» agrupa a otras actividades: el avance se registra en las que agrupa, y de ahí sube solo.
        </Aviso>
      </div>
    )
  }

  const enPanel = variante === 'panel'
  const grilla: CSSProperties = enPanel
    ? { display: 'grid', gap: '20px' }
    : { display: 'grid', gap: '24px', gridTemplateColumns: 'minmax(0,1fr) 300px', alignItems: 'start' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* EN EL PANEL EL TÍTULO YA ESTÁ ARRIBA: repetirlo empuja el número grande fuera de la
          vista, que es justo lo único que este bloque tiene que mostrar primero. */}
      {!enPanel && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 600, letterSpacing: '-.01em', color: C.tinta }}>{nodo.nombre}</h1>
          <div style={{ fontSize: '12px', color: C.tintaSuave }}>
            {/* La ruta sólo si agrega algo: en una actividad de la raíz, `camino` es el nombre. */}
            {nodo.camino !== nodo.nombre && nodo.camino}
            {nodo.cantidad_objetivo !== null && (
              <span style={{ marginLeft: '8px', fontFamily: MONO, fontSize: '11.5px', color: C.tenue }}>
                {nodo.cantidad_objetivo} {nodo.unidad ?? ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* EL MÉTODO A LA IZQUIERDA, EL NÚMERO QUE SE VA A ESCRIBIR A LA DERECHA. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={EYEBROW}>Método</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {METODOS.map(([id, label]) => (
              <Chip key={id} activo={metodo === id} onClick={() => setMetodo(id)} testid={`metodo-${id}`}>{label}</Chip>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
          <div style={EYEBROW}>Avance</div>
          {porcentaje(resultante) != null
            ? <div data-testid="avance-resultante" style={{ fontFamily: MONO, fontSize: '24px', fontWeight: 600, lineHeight: 1, color: C.tinta }}>{porcentaje(resultante)}</div>
            : <div data-testid="avance-resultante" data-nulo="" style={{ fontSize: '12.5px', fontStyle: 'italic', color: C.tenue, lineHeight: '24px' }}>sin base</div>}
        </div>
      </div>

      {/* LA CONVERSIÓN SE DICE ANTES DE HACERLA. 141 actividades vivas se miden sumando partes
          diarios; registrar acá las pasa a otro método, y eso cambia de dónde sale su número. */}
      {nodo.metodo_avance === 'partes' && (
        <div data-testid="aviso-partes">
          <Aviso tono="warn" tam={12}>
            Venía sumando sus partes diarios: registrar acá la pasa a «{nombreMetodo}» y su porcentaje sale de otro lado.
          </Aviso>
        </div>
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

        <div style={grilla}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
            {metodo === 'pasos' && (
              <Bloque titulo="Pasos ejecutados" testid="cuerpo-pasos"
                derecha={pasos.length > 0 ? <span style={{ fontSize: '11.5px', color: C.tenue }}>peso</span> : undefined}>
                {pasos.length === 0 ? (
                  <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>
                    <Falta>Sin pasos cargados</Falta>: no hay peso que sumar. Elegí otro método o cargá la secuencia.
                  </div>
                ) : (
                  <div>
                    {pasos.map((p) => (
                      <label key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0',
                        borderBottom: `1px solid ${C.bordeLista}`, cursor: 'pointer',
                      }}>
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
                          style={{ width: '16px', height: '16px', margin: 0, flexShrink: 0, accentColor: C.grafito, cursor: 'pointer' }}
                        />
                        <span style={{
                          flex: 1, minWidth: 0, fontSize: '13px', color: tildados.has(p.id) ? C.tinta : C.tintaMedia,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{p.nombre}</span>
                        {p.tiempo_tecnico && (
                          <span style={{ fontSize: '11px', color: C.warn, flexShrink: 0 }}>
                            tiempo técnico{p.dias_tecnicos ? ` · ${p.dias_tecnicos} d` : ''}
                          </span>
                        )}
                        <span style={{ width: '40px', textAlign: 'right', fontFamily: MONO, fontSize: '12px', color: C.tintaSuave, flexShrink: 0 }}>{p.peso}</span>
                      </label>
                    ))}
                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', color: C.tintaSuave }}>Suma de pesos ejecutados</span>
                      {porcentaje(avancePasos) != null
                        ? <span style={{ fontFamily: MONO, fontSize: '15px', fontWeight: 600, color: C.tinta }}>{porcentaje(avancePasos)}</span>
                        : <span style={{ fontSize: '12.5px' }}><Falta>sin base</Falta></span>}
                    </div>
                  </div>
                )}
              </Bloque>
            )}

            {metodo === 'cantidad' && (
              <Bloque titulo="Cantidad ejecutada acumulada" testid="cuerpo-cantidad">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="number" step="any" min={0} name="cantidad_ejecutada"
                    value={acumulada} onChange={(e) => setAcumulada(e.target.value)}
                    aria-label="Cantidad ejecutada acumulada"
                    data-testid="campo-cantidad"
                    style={{ ...estiloControl(44, true), width: '160px', fontSize: '16px', fontWeight: 600 }}
                  />
                  <span style={{ fontSize: '13px', color: C.tintaSuave }}>{nodo.unidad ?? ''}</span>
                  <span style={{ fontSize: '12.5px', color: C.tenue }}>
                    {nodo.cantidad_objetivo === null
                      ? <Falta>sin cantidad objetivo: no hay porcentaje que calcular</Falta>
                      : `de ${nodo.cantidad_objetivo} ${nodo.unidad ?? ''}`}
                  </span>
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: C.tintaSuave }}>
                  anterior {porcentaje(nodo.avance_pct) ?? <Falta>sin avance</Falta>} · ahora{' '}
                  <span style={{ fontWeight: 500, color: C.tinta }}>{porcentaje(avanceCant) ?? <Falta>sin base</Falta>}</span>
                </div>
              </Bloque>
            )}

            {metodo === 'manual' && (
              <Bloque titulo="Avance declarado" testid="cuerpo-manual">
                {/* SIN PÁRRAFO DE APOYO: que el método manual sea para lo que no se mide por unidad
                    ya lo dice el selector de método, y la regla que sí importa —el criterio— está
                    donde se incumple, al lado del campo. */}
                <input type="hidden" name="avance_pct" value={declarado} />
                <div style={{ display: 'flex', gap: '6px' }}>
                  {ESCALONES.map((v) => {
                    const activo = declarado === String(v)
                    return (
                      <button
                        key={v} type="button" onClick={() => setDeclarado(String(v))}
                        aria-pressed={activo} data-testid={`escalon-${v}`}
                        style={{
                          font: 'inherit', flex: 1, height: '36px', borderRadius: '6px', cursor: 'pointer',
                          border: `1px solid ${activo ? C.grafito : C.borde}`, background: C.superficie,
                          fontFamily: MONO, fontSize: '13px', fontWeight: activo ? 600 : 400, color: activo ? C.tinta : C.tintaSuave,
                        }}
                      >{v} %</button>
                    )
                  })}
                </div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '12px' }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: C.tintaSuave }}>
                    <span>Criterio</span>
                    <span style={{ color: faltaCriterio ? C.warn : C.tenue }}>obligatorio</span>
                  </span>
                  <textarea
                    name="criterio" rows={3} value={criterio} onChange={(e) => setCriterio(e.target.value)}
                    placeholder="Con qué criterio se declara este porcentaje"
                    data-testid="campo-criterio"
                    style={{
                      ...estiloControl(32), height: 'auto', padding: '8px 10px', lineHeight: 1.45, resize: 'vertical',
                      border: `1px solid ${faltaCriterio ? C.warn : C.bordeFuerte}`,
                    }}
                  />
                </label>
              </Bloque>
            )}

            {/* HH NO ES AVANCE: van al lado, con su propio rótulo. Es la regla del modelo, y por eso
                el rótulo se conserva aunque el resto de la pantalla haya perdido palabras. La
                proyección usa el avance QUE SE ESTÁ POR ESCRIBIR, no el guardado. */}
            <Bloque linea testid="hh-consumidas"
              titulo={<>HH consumidas <span style={{ fontWeight: 400, color: C.tenue }}>— no es avance</span></>}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <Cifra rotulo="Plan" valor={fmtHH(nodo.hh_plan)} falta="sin cargar" sub="del análisis" />
                <Cifra rotulo="Real" valor={fmtHH(nodo.hh_real)} falta="sin registro" sub="por asistencia" />
                <Cifra rotulo="Proyectadas" valor={fmtHH(proy)} falta="sin base" sub="al ritmo actual"
                  alerta={proyeccionExcedida(proy, nodo.hh_plan)} />
              </div>
            </Bloque>

            {/* El `id` es el destino de «Foto o evidencia» del panel de la tarea (04): la evidencia es
                de UN registro de avance y no de la actividad entera.
                NO HAY SUBIDA DE ARCHIVOS EN EL OS: el archivo vive en Drive y acá se guarda el
                enlace, igual que en Documentos. Un cargador propio sería una segunda copia del
                mismo papel, y la que se desactualiza es siempre la copia. */}
            <Bloque linea id="evidencia" titulo="Evidencia">
              <span style={{ ...estiloControl(32), display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'flex', color: C.tenue, flexShrink: 0 }}><Ico d={P.foto} s={15} /></span>
                <input
                  type="url" name="evidencia" placeholder="Enlace de Drive de la foto o el remito"
                  aria-label="Enlace de la evidencia" data-testid="campo-evidencia"
                  style={{
                    font: 'inherit', border: 'none', flex: 1, minWidth: 0, height: '100%', outline: 'none',
                    background: 'transparent', fontSize: '13px', color: C.tinta, padding: 0,
                  }}
                />
              </span>
            </Bloque>
          </div>

          <aside style={enPanel ? { borderTop: `1px solid ${C.borde}`, paddingTop: '16px' } : undefined}>
            <div style={{ ...EYEBROW, marginBottom: '6px' }}>Queda firmado con</div>
            <Firma clave="Autor" valor={autor} />
            <Firma clave="Fecha" valor={hoy.split('-').reverse().join('/')} mono />
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', margin: '10px 0 4px' }}>
              <span style={{ fontSize: '12px', color: C.tintaSuave }}>Cuadrilla</span>
              <select name="cuadrilla_id" data-testid="campo-cuadrilla" style={{ ...estiloControl(32), fontSize: '12.5px' }}>
                <option value="">sin cuadrilla declarada</option>
                {cuadrillas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <Firma clave="Método" valor={nombreMetodo} />
            <Firma clave="Origen" valor="panel de escritorio" />

            {faltaCriterio && (
              <div data-testid="aviso-criterio" style={{ marginTop: '12px' }}>
                <Aviso tono="warn" tam={12}>
                  El método manual exige un criterio escrito: sin eso el porcentaje no se puede interpretar después.
                </Aviso>
              </div>
            )}
          </aside>
        </div>
      </FormAccion>
    </div>
  )
}

/**
 * EL MISMO FORMULARIO, EMBEBIDO EN EL PANEL LATERAL DE LA TAREA.
 *
 * Es un envase, no una copia: fija `variante` y nada más. Quien lo importa le pasa la actividad, la
 * cuadrilla, el autor y la server action ya atada con `.bind` a la obra y a la actividad — el
 * `actividad_id` NUNCA viaja en un campo del formulario, porque un id editable desde el navegador
 * deja escribir el avance de la actividad de al lado.
 */
export function FormAvanceEmbebido(datos: DatosFormAvance) {
  return <FormAvance {...datos} variante="panel" />
}

/** Una fila de la firma: rótulo 11,5 muted a la izquierda, valor 12,5 a la derecha. */
function Firma({ clave, valor, mono = false }: { clave: string; valor: string; mono?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', padding: '7px 0',
      borderBottom: `1px solid ${C.bordeLista}`,
    }}>
      <span style={{ fontSize: '11.5px', color: C.tintaSuave }}>{clave}</span>
      <span style={{ fontSize: '12.5px', color: C.tinta, fontFamily: mono ? MONO : undefined, textAlign: 'right' }}>{valor}</span>
    </div>
  )
}
