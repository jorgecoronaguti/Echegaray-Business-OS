'use client'

// ═══ 06 · PARTE DIARIO (1440) y M08 (390) — porte literal del diseño ERP Obras, 23/09/2026 ═══
//
// «NO QUIERO LAYOUT NUEVO» (dueño, 23/09/2026). Se reproduce la 06 y la M08 tal como están
// dibujadas; lo que no está en el .html no se dibuja.
//
// LO QUE DIBUJA LA 06, EN SU ORDEN
//
//   banda de nivel 3      Tareas · Cronograma · Parte diario · Subcontratos y, a la derecha, ‹ lunes 07/09/2026 ›
//   columna izquierda     «Qué se hizo hoy — un renglón por frente en curso»: Actividad · Producción
//                         hoy · Acumulado · Comentario (grilla 1fr 132 116 1fr, filas de 60, input de
//                         62×30, comentario «opcional» de 30); y debajo «Quién vino» en chips de 38
//   aside de 380 px       «Novedades del día» (textarea de 88) y la primaria «Guardar el parte» de 38
//   + (23/09, dueño)      «Fotos y registro del día» debajo de Novedades: grilla de miniaturas 3 por
//                         fila con descripción, «Agregar fotos» secundario. La 06 no lo dibuja: se
//                         diseñó con la skill de UI/UX sobre sus medidas (`FotosDelParte`).
//
// LO QUE DIBUJA LA M08: la fecha grande con cuadros de 44 y «sin parte cargado», «Frentes en curso»
// con el cuadro mono de 84×36 a la derecha («no se registra» en la bloqueada), «Gente» en filas de
// 56 con el cuadro de 64 de horas o «sin marcar», y «Registrar el parte» de 48 sobre la barra. La
// M08 no dibuja comentario ni novedad: no van en el teléfono. Sí va «Fotos» antes del pie (23/09):
// «Sacar foto» y «Elegir de la galería», dos secundarios de 48; la primaria sigue siendo la del parte.
//
// LO QUE NO ESTÁ: clima (el dueño lo retiró), selector de estado (se deriva), «% ítem», «Quién y
// con qué», equipos, destino de la novedad, horas editables (las horas entran por Personal).
//
// TODO EL PARTE ES UN SOLO FORMULARIO: los renglones y la novedad viajan juntos a `guardarParteDiario`.
// El que carga a las 18:30 aprieta una vez.

import { startTransition, useActionState, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Asignacion, ParteEjecucion } from '../../types'
import type { HoraDeJornada } from '../../services/ejecucionService'
import {
  bajadaDelDia, bajadaHecho, celdaAcumulado, celdaComentario, chipsDeGente, cifraHoras, correr,
  esperadosDeAsignaciones, estaBloqueada, fechaCortaDia, fechaLarga, frentesDelParte, renglonesDelParte, resumenGente,
  textoHoras, unidadDelInput,
} from '../../services/parteDiario.ts'
import { useAnchoVentana } from '../useAnchoVentana'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import { SubNavTrabajo } from '../SubNavTrabajo'
import { FotosDelParte } from './FotosDelParte'
import { BotonDictar, DictadosDelDia, ParteDelDia, PantallaDictado, useDictado } from './DictarParte'

const EYEBROW: CSSProperties = {
  fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase',
}
/** Las cuatro columnas de «Qué se hizo hoy»: Actividad · Producción hoy · Acumulado · Comentario. */
const COLUMNAS = 'minmax(0,1fr) 132px 116px minmax(0,1fr)'
const INPUT_PRODUCCION: CSSProperties = {
  width: '62px', height: '30px', padding: '0 9px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px',
  font: 'inherit', fontSize: '13.5px', textAlign: 'right', background: C.superficie, color: C.tinta,
  fontVariantNumeric: 'tabular-nums',
}
const INPUT_COMENTARIO: CSSProperties = {
  boxSizing: 'border-box', width: '100%', height: '30px', padding: '0 9px', border: `1px solid ${C.borde}`,
  borderRadius: '6px', font: 'inherit', fontSize: '13px', background: C.superficie, color: C.tinta,
}

interface Props {
  obraId: string
  actividades: Actividad[]
  partes: ParteEjecucion[]
  asignaciones: Asignacion[]
  hoy: string
  registrosHH?: HoraDeJornada[]
  fallas: string[]
  /** Quién mira: decide si el visor ofrece «Borrar». `null` = sin perfil legible; no se ofrece. */
  usuario: { id: string; esAdministracion: boolean } | null
  /** Jefe o Administración: ve «Dictar parte». */
  puedeDictar?: boolean
  guardar: (form: FormData) => Promise<ResultadoAccion>
}

/** «Dictar parte» en la computadora (lote 3 de la entrega del 25/09/2026). */
const DICTAR_EN_PC = true

/** Lo ya guardado ese día por actividad: la producción (sumada si hubo más de un parte) y el comentario. */
type Cargado = Map<string, { produccion: number | null; comentario: string | null }>

export function ParteDiarioCliente({ obraId, actividades, partes, asignaciones, hoy, registrosHH, fallas, usuario, puedeDictar = false, guardar }: Props) {
  const telefono = useAnchoVentana() < 768
  const [dia, setDia] = useState(hoy)
  const renglones = useMemo(() => renglonesDelParte(actividades), [actividades])
  const chips = useMemo(
    () => chipsDeGente(esperadosDeAsignaciones(asignaciones, dia), registrosHH, dia),
    [asignaciones, registrosHH, dia],
  )

  // LO YA CARGADO ESE DÍA, por renglón: el input arranca con eso y guardar lo corrige, no lo duplica.
  const cargado = useMemo<Cargado>(() => {
    const porAct: Cargado = new Map()
    for (const p of partes) {
      if (p.fecha !== dia) continue
      const prev = porAct.get(p.actividad_id) ?? { produccion: null, comentario: null }
      const h = p.cantidad ?? p.avance_pct
      prev.produccion = h == null ? prev.produccion : (prev.produccion ?? 0) + h
      if (p.comentario?.trim()) prev.comentario = p.comentario.trim()
      porAct.set(p.actividad_id, prev)
    }
    return porAct
  }, [partes, dia])

  // DICTAR PARTE (maqueta aprobada 25/09/2026): mientras se dicta, se espera, se revisa o se acaba de
  // guardar, esa pantalla reemplaza al formulario; en reposo, el formulario de siempre sigue igual.
  const recarga = useMemo(() => partes.filter((p) => p.fecha === dia).map((p) => `${p.id}:${p.cantidad ?? p.avance_pct}`).join('|')
    + `#${(registrosHH ?? []).length}`, [partes, registrosHH, dia])
  const dictado = useDictado(obraId, dia, recarga)
  const tareasObra = useMemo(() => {
    // Con el padre adelante («VA1 › Hormigonado»): una obra real tiene diez «Hormigonado».
    const porId = new Map(actividades.map((a) => [a.id, a.nombre]))
    return frentesDelParte(actividades, false).map((a) => {
      const padre = a.actividad_padre_id ? porId.get(a.actividad_padre_id) : null
      return { id: a.id, nombre: padre ? `${padre} › ${a.nombre}` : a.nombre }
    })
  }, [actividades])
  const dictando = dictado.fase.f !== 'reposo'
  // Lote 2 (teléfono) sale primero; la cara de la computadora se prende en el lote 3.
  const dictaAca = puedeDictar && (telefono || DICTAR_EN_PC)

  // El formulario se remonta por día (`key`): lo tipeado para el lunes no se arrastra al martes.
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="parte-diario">
      {/* 06: el navegador de día va A LA DERECHA de la banda, como el diseño; «Dictar parte» (aprobado por el
          dueño) queda a su lado, al final. */}
      <SubNavTrabajo obraId={obraId} sub="parte"
        alFinal={<>
          <NavFecha dia={dia} hoy={hoy} cambiar={setDia} />
          {!telefono && dictaAca && <span style={{ marginLeft: '12px', display: 'inline-flex' }}><BotonDictar d={dictado} telefono={false} /></span>}
        </>} />
      {fallas.length > 0 && (
        <div data-testid="parte-lectura-fallida" style={{ padding: '10px 30px 0', fontSize: '12.5px', color: C.neg }}>
          No se pudo leer parte del parte: {fallas.join(' · ')}
        </div>
      )}
      {dictando && dictaAca
        ? (
          <PantallaDictado d={dictado} telefono={telefono} plantel={chips.length} tareas={tareasObra}
            novedadActividad={renglones[0]?.id ?? null} />
          )
        : (
          <Formulario
            key={dia} dia={dia} hoy={hoy} cambiarDia={setDia} telefono={telefono}
            renglones={renglones} chips={chips} cargado={cargado} guardar={guardar}
            dictar={dictaAca ? <BotonDictar d={dictado} telefono /> : null}
            dictados={dictaAca ? <><ParteDelDia d={dictado} telefono={telefono} /><DictadosDelDia d={dictado} /></> : null}
            fotos={<FotosDelParte obraId={obraId} dia={dia} frentes={renglones} usuario={usuario} telefono={telefono} />}
          />
          )}
    </div>
  )
}

/** ‹ lunes 07/09/2026 › — en la banda de nivel 3. La flecha de adelante muere en hoy: un parte de mañana no es un hecho. */
function NavFecha({ dia, hoy, cambiar }: { dia: string; hoy: string; cambiar: (d: string) => void }) {
  const flecha: CSSProperties = {
    border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '12.5px', color: C.tintaSuave,
    padding: 0, fontFamily: 'inherit', lineHeight: 1,
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12.5px', color: C.tintaSuave }}>
      <button type="button" aria-label="Día anterior" data-testid="dia-anterior" style={flecha}
        onClick={() => cambiar(correr(dia, -1))}>‹</button>
      <label style={{ position: 'relative', display: 'inline-flex' }}>
        <span data-testid="parte-fecha" style={{ color: C.tinta, fontWeight: 500 }}>{fechaLarga(dia)}</span>
        <input type="date" value={dia} max={hoy} aria-label="Jornada del parte" data-testid="dia-ejecucion"
          onChange={(e) => e.target.value && cambiar(e.target.value)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
      </label>
      <button type="button" aria-label="Día siguiente" data-testid="dia-siguiente" disabled={dia >= hoy}
        style={{ ...flecha, color: dia >= hoy ? C.bordeFuerte : C.tintaSuave }}
        onClick={() => cambiar(correr(dia, 1))}>›</button>
    </div>
  )
}

function Formulario({ dia, hoy, cambiarDia, telefono, renglones, chips, cargado, guardar, fotos, dictar, dictados }: {
  dia: string
  hoy: string
  cambiarDia: (d: string) => void
  telefono: boolean
  renglones: Actividad[]
  chips: ReturnType<typeof chipsDeGente>
  cargado: Cargado
  guardar: (form: FormData) => Promise<ResultadoAccion>
  /** El bloque «Fotos y registro del día» / «Fotos», ya armado: se monta una vez por día como el resto. */
  fotos: ReactNode
  /** «Dictar parte» (teléfono: el botón amarillo arriba del parte) y lo dictado ese día. `null` = no dicta. */
  dictar: ReactNode
  dictados: ReactNode
}) {
  const [estado, ejecutar, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    (_p, datos) => guardar(datos), null)

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(() => ejecutar(new FormData(e.currentTarget)))
  }

  // La novedad del día se cuelga como nota del primer frente en curso: la 06 no la ata a una tarea.
  const camposOcultos = (
    <>
      <input type="hidden" name="fecha" value={dia} />
      <input type="hidden" name="novedad_actividad" value={renglones[0]?.id ?? ''} />
    </>
  )

  const resultado = estado != null && (
    <p data-testid={estado.ok ? 'form-ejecucion-ok' : 'form-ejecucion-error'} style={{
      fontSize: '12px', color: estado.ok ? C.pos : C.neg, margin: 0,
    }}>{estado.ok ? estado.mensaje ?? 'Parte guardado.' : estado.error}</p>
  )

  // ═══════════════════════════════ M08 · TELÉFONO ═══════════════════════════════
  if (telefono) {
    const cuadro: CSSProperties = {
      width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', color: C.tintaSuave, background: C.superficie, cursor: 'pointer',
    }
    const nConParte = renglones.filter((r) => cargado.get(r.id)?.produccion != null).length
    return (
      <form onSubmit={enviar} data-testid="form-ejecucion" style={{ padding: '16px 16px 96px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {camposOcultos}
        {/* Paso 1 de «Dictar parte»: el botón nuevo arriba; todo lo demás sigue igual. */}
        {dictar}
        {dictados}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" aria-label="Día anterior" data-testid="dia-anterior" style={cuadro} onClick={() => cambiarDia(correr(dia, -1))}>
            <Ico d={P.izquierda} s={14} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div data-testid="parte-fecha" style={{ fontSize: '15px', fontWeight: 600 }}>{fechaCortaDia(dia)}</div>
            <div style={{ fontSize: '12px', color: C.tintaSuave }}>{bajadaDelDia(nConParte)}</div>
          </div>
          <button type="button" aria-label="Día siguiente" data-testid="dia-siguiente" disabled={dia >= hoy}
            style={{ ...cuadro, color: dia >= hoy ? C.bordeFuerte : C.tintaSuave }} onClick={() => cambiarDia(correr(dia, 1))}>
            <Ico d={P.derecha} s={14} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
            <div style={EYEBROW}>Frentes en curso</div>
            <div style={{ fontSize: '12px', color: C.tintaSuave }}>{renglones.length}</div>
          </div>
          {renglones.length === 0 && <div data-testid="parte-sin-frentes" style={{ fontSize: '12.5px', color: C.tenue, padding: '8px 0' }}>sin frentes en curso</div>}
          {renglones.map((r, i) => {
            const bloq = estaBloqueada(r)
            return (
              <div key={r.id} data-testid={`parte-renglon-${r.id}`} style={{
                minHeight: '52px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px',
                borderBottom: i === renglones.length - 1 ? 'none' : `1px solid ${C.borde}`,
              }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div>{r.nombre}{bloq && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: C.neg, fontWeight: 500, marginLeft: '6px' }}>
                      <Ico d={P.bloqueo} s={11} />bloqueada
                    </span>
                  )}</div>
                  {!bloq && <div style={{ fontSize: '12px', color: C.tintaSuave }}>{bajadaHecho(r)}</div>}
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                  {bloq
                    ? <span style={{ fontSize: '12px', color: C.tenue, fontStyle: 'italic' }}>no se registra</span>
                    : (
                      // M08: la caja de 106 del diseño, a 44 de alto (dueño: 44 de toque en el teléfono); toda la caja es
                      // el campo —el input ocupa el alto entero— y la letra de 16 evita que iOS agrande la página.
                      <label style={{
                        height: '44px', width: '106px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                        padding: '0 10px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', fontFamily: MONO, fontSize: '13px',
                        boxSizing: 'border-box', cursor: 'text',
                      }}>
                        <input name={`produccion_${r.id}`} type="text" inputMode="decimal" data-testid={`parte-produccion-${r.id}`}
                          defaultValue={cargado.get(r.id)?.produccion ?? ''} aria-label={`Producción hoy en ${r.nombre}`}
                          style={{ width: '100%', minWidth: 0, alignSelf: 'stretch', border: 'none', outline: 'none', background: 'transparent', font: 'inherit', fontSize: '16px', textAlign: 'right', padding: 0 }} />
                        <span style={{ color: C.tenue, marginLeft: '4px', flexShrink: 0 }}>{unidadDelInput(r)}</span>
                      </label>
                      )}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
            <div style={EYEBROW}>Gente</div>
            <div style={{ fontSize: '12px', color: C.tintaSuave }}>{resumenGente(chips, false)}</div>
          </div>
          {chips.length === 0 && <div data-testid="parte-sin-plantel" style={{ fontSize: '12.5px', color: C.tenue, padding: '8px 0' }}>sin asignar</div>}
          {chips.map((c, i) => (
            <div key={c.id} data-testid={`parte-gente-${c.id}`} style={{
              minHeight: '56px', display: 'flex', alignItems: 'center', gap: '10px',
              borderBottom: i === chips.length - 1 ? 'none' : `1px solid ${C.borde}`,
            }}>
              <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.persona} s={14} /></span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontSize: '14px' }}>{c.nombre}</div>
                <div style={{ fontSize: '12px', color: C.tintaSuave }}>{c.bajada}</div>
              </div>
              {c.estado === 'horas' && (
                <div style={{
                  height: '36px', width: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', fontFamily: MONO, fontSize: '13px', boxSizing: 'border-box',
                }}>{cifraHoras(c.horas ?? 0)}</div>
              )}
              {c.estado === 'ausente' && <span style={{ fontSize: '12px', color: C.tintaSuave }}>ausente</span>}
              {c.estado === 'sin_marcar' && (
                <span style={{ fontSize: '12px', color: C.warn, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Ico d={P.alerta} s={12} />sin marcar
                </span>
              )}
            </div>
          ))}
        </div>
        {/* «Fotos» antes del pie (dueño, 23/09/2026). */}
        {fotos}
        {resultado}

        <div style={{
          position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie,
          borderTop: `1px solid ${C.borde}`, zIndex: 10, margin: '0 auto', maxWidth: '430px',
        }}>
          <button type="submit" disabled={pendiente} data-testid="form-ejecucion-enviar" style={{
            width: '100%', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            borderRadius: '6px', background: C.marca, color: C.grafito, fontSize: '14px', fontWeight: 600, border: 'none',
            fontFamily: 'inherit', cursor: 'pointer',
          }}><Ico d={P.ok} s={15} />{pendiente ? 'Registrando…' : 'Registrar el parte'}</button>
        </div>
      </form>
    )
  }

  // ═══════════════════════════════ 06 · ESCRITORIO ═══════════════════════════════
  return (
    <form onSubmit={enviar} data-testid="form-ejecucion" style={{
      padding: '22px 30px 30px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: '52px', alignItems: 'start',
    }}>
      {camposOcultos}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', minWidth: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Qué se hizo hoy</div>
            <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>un renglón por frente en curso</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: COLUMNAS, gap: '20px', height: '32px', alignItems: 'center',
              borderBottom: `1px solid ${C.borde}`, ...EYEBROW,
            }}>
              <div>Actividad</div><div>Producción hoy</div><div>Acumulado</div><div>Comentario</div>
            </div>
            {renglones.length === 0 && (
              <div data-testid="parte-sin-frentes" style={{ padding: '16px 0', fontSize: '12.5px', color: C.tenue }}>
                sin frentes en curso
              </div>
            )}
            {renglones.map((r, i) => {
              const bloq = estaBloqueada(r)
              const acum = celdaAcumulado(r)
              const comentario = celdaComentario(r, cargado.get(r.id)?.comentario)
              const manual = r.metodo_avance !== 'cantidad'
              const ultimo = i === renglones.length - 1
              return (
                <div key={r.id} data-testid={`parte-renglon-${r.id}`} style={{
                  display: 'grid', gridTemplateColumns: COLUMNAS, gap: '20px', minHeight: '60px', alignItems: 'center',
                  borderBottom: ultimo ? 'none' : `1px solid ${C.borde}`, fontSize: '13.5px',
                  ...(bloq ? { borderLeft: `2px solid ${C.neg}`, paddingLeft: '12px', marginLeft: '-12px' } : {}),
                }}>
                  <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</div>
                  {bloq
                    ? <div style={{ fontSize: '12.5px', color: C.neg }}>bloqueada</div>
                    : (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <input name={`produccion_${r.id}`} type="text" inputMode="decimal" placeholder="—"
                          data-testid={`parte-produccion-${r.id}`} defaultValue={cargado.get(r.id)?.produccion ?? ''}
                          aria-label={`Producción hoy en ${r.nombre}`} style={INPUT_PRODUCCION} />
                        <span style={{ fontSize: '12.5px', color: manual ? C.warn : C.tintaSuave }}>{unidadDelInput(r)}</span>
                      </div>
                      )}
                  <div style={{ fontSize: '12.5px', color: acum.tono === 'warn' ? C.warn : C.tintaSuave, fontVariantNumeric: 'tabular-nums' }}>
                    {acum.texto}
                  </div>
                  {comentario.tipo === 'input'
                    ? (
                      <div>
                        <input name={`comentario_${r.id}`} type="text" placeholder="opcional" maxLength={500}
                          data-testid={`parte-comentario-${r.id}`} defaultValue={comentario.valor}
                          aria-label={`Comentario de ${r.nombre}`} style={INPUT_COMENTARIO} />
                      </div>
                      )
                    : (
                      <div data-testid={`parte-comentario-${r.id}`} style={{ fontSize: '12.5px', color: C.tintaSuave }}>
                        {comentario.texto}
                      </div>
                      )}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Quién vino</div>
            <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>{resumenGente(chips)}</div>
          </div>
          {chips.length === 0 && <div data-testid="parte-sin-plantel" style={{ fontSize: '12.5px', color: C.tenue }}>sin asignar</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {chips.map((c) => {
              const sinMarcar = c.estado === 'sin_marcar'
              const color = sinMarcar ? C.warn : c.estado === 'ausente' ? C.tintaSuave : C.tinta
              return (
                <div key={c.id} data-testid={`parte-gente-${c.id}`} style={{
                  display: 'flex', alignItems: 'center', gap: '9px', height: '38px', padding: '0 13px',
                  border: `1px solid ${sinMarcar ? C.warn : C.borde}`, borderRadius: '6px', fontSize: '13.5px', color,
                }}>
                  {c.nombre}
                  {c.estado === 'horas' && <span style={{ color: C.tintaSuave, fontSize: '12.5px' }}>{textoHoras(c.horas ?? 0)}</span>}
                  {c.estado === 'ausente' && <span style={{ fontSize: '12.5px' }}>ausente</span>}
                  {sinMarcar && <span style={{ fontSize: '12.5px' }}>sin marcar</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <aside style={{ display: 'flex', flexDirection: 'column', gap: '26px', paddingLeft: '34px', borderLeft: `1px solid ${C.borde}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
          <div style={EYEBROW}>Novedades del día</div>
          <textarea name="novedad" placeholder="Lo que pasó y no entra en un número" maxLength={1000}
            data-testid="parte-novedad" aria-label="Novedades del día" style={{
              boxSizing: 'border-box', width: '100%', height: '88px', padding: '10px', border: `1px solid ${C.bordeFuerte}`,
              borderRadius: '6px', font: 'inherit', fontSize: '13px', resize: 'none', background: C.superficie, color: C.tinta,
            }} />
        </div>
        {dictados}
        {/* «Fotos y registro del día» debajo de Novedades (dueño, 23/09/2026). */}
        {fotos}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          <button type="submit" disabled={pendiente} data-testid="form-ejecucion-enviar" style={{
            height: '38px', border: 0, borderRadius: '6px', background: C.marca, color: C.grafito, font: 'inherit',
            fontSize: '13.5px', fontWeight: 600, cursor: 'pointer',
          }}>{pendiente ? 'Guardando…' : 'Guardar el parte'}</button>
          {resultado}
        </div>
      </aside>
    </form>
  )
}
