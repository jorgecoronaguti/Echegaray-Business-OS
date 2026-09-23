'use client'

// 09 · M12 — IMPEDIMENTOS: lo que frena la obra, ordenado por fecha de necesidad.
//
// Escritorio (09): filtros Abiertos · En curso · Liberados con la nota «Ordenados por fecha de
// necesidad, no por cuándo se cargaron.», grilla Tipo · Qué falta · Traba · Responsable · Necesidad ·
// Compromiso · Estado en filas de 66 con el borde izquierdo de 2px (rojo vencido, naranja abierto), y
// abajo los dos títulos del diseño. Teléfono (M12): pastillas Abiertos · Vencidos · Liberados, filas de 64
// con icono por tipo y «venció 04/09» a la derecha, «Qué bloquea» debajo y la primaria de 48 sobre la barra.
//
// LO QUE EL DISEÑO NO DIBUJA Y HACE FALTA PARA OPERAR, diseñado con `diseno-ui-ux-producto-os`:
//   · el ALTA abre con `?nuevo=1` (la primaria «Nuevo impedimento» de la cabecera y la del pie del
//     teléfono son enlaces a esa URL): un bloque plegable arriba de la lista, sin navegar;
//   · tocar una fila la despliega en el lugar (Figma: acciones cerca del objeto) con la descripción
//     entera, la necesidad y el compromiso, y «Marcar liberado» —la única escritura que existe— como
//     secundario grafito. Ningún selector de estado: el estado se deriva.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import { C, ESTILO_SECUNDARIA } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import { TIPO_RESTRICCION, type Actividad, type Restriccion } from '../../types'
import {
  compromisoTelefono, contarImpedimentos, diaMes, estadoImpedimento, filtrarImpedimentos, ordenarPorNecesidad,
  queBloquea, rotuloTipo, type FiltroImpedimento,
} from '../../services/operacionCanon'
import {
  COLOR_TONO, Celda, DerechaM, Eyebrow, Falta, FilaM, FilaPastillas, GridCab, GridFila, PastillaM, PrimariaTelefono,
} from './piezas'

const COLS = '132px minmax(0,1.6fr) minmax(0,.9fr) 122px 108px 108px 96px'
const CAMPO: React.CSSProperties = {
  height: '30px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', padding: '0 8px', fontSize: '13px',
  color: C.tinta, background: C.superficie, fontFamily: 'inherit', width: '100%',
}

const ICONO_TIPO = (tipo: string) =>
  tipo === 'material' ? P.material : tipo === 'equipo' ? P.equipo
    : tipo === 'informacion' || tipo === 'ingenieria_cliente' || tipo === 'contrato' ? P.doc : P.bloqueo

export function Impedimentos({ impedimentos, actividades, crear, liberar, nuevo, obraId, sub, hoyIso }: {
  impedimentos: Restriccion[]
  actividades: Actividad[]
  crear: AccionFormulario
  liberar: (restriccionId: string) => Promise<ResultadoAccion>
  /** `?nuevo=1`: el alta abierta. */
  nuevo: boolean
  obraId: string
  sub: string
  hoyIso: string
}) {
  const [filtro, setFiltro] = useState<FiltroImpedimento>('abiertos')
  const [sel, setSel] = useState<string | null>(null)
  const n = contarImpedimentos(impedimentos, hoyIso)
  const visibles = ordenarPorNecesidad(filtrarImpedimentos(impedimentos, filtro, hoyIso))
  const nombreDe = (id: string | null) => (id ? actividades.find((a) => a.id === id)?.nombre ?? null : null)
  const bloqueadas = queBloquea(impedimentos, (id) => nombreDe(id))
  const hrefNuevo = `/obras/${obraId}?vista=operacion&sub=${sub}&nuevo=1`

  const alta = nuevo && (
    <div data-testid="alta-impedimento" style={{ border: `1px solid ${C.borde}`, borderRadius: '10px', padding: '16px' }}>
      <FormAccion accion={crear} testid="form-impedimento" enviar="Anotar" limpiarAlOk mensajeOk="Impedimento anotado.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <label className="md:col-span-6" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: C.tintaSuave }}>
            Qué falta
            <input name="descripcion" required minLength={3} maxLength={300} style={CAMPO} />
          </label>
          <label className="md:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: C.tintaSuave }}>
            Tipo
            <select name="tipo" required defaultValue="material" style={CAMPO}>
              {[...TIPO_RESTRICCION, 'clima'].map((t) => <option key={t} value={t}>{rotuloTipo(t)}</option>)}
            </select>
          </label>
          <label className="md:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: C.tintaSuave }}>
            Traba
            <select name="actividad_id" defaultValue="" style={CAMPO}>
              <option value="">ninguna en particular</option>
              {actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
          <label className="md:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: C.tintaSuave }}>
            Responsable
            <input name="responsable" required minLength={2} maxLength={120} style={CAMPO} />
          </label>
          <label className="md:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: C.tintaSuave }}>
            Necesidad
            <input type="date" name="fecha_necesidad" style={CAMPO} />
          </label>
          <label className="md:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: C.tintaSuave }}>
            Compromiso
            <input type="date" name="fecha_compromiso" required style={CAMPO} />
          </label>
        </div>
      </FormAccion>
    </div>
  )

  return (
    <>
      {/* ═══ ESCRITORIO (09) ═══ */}
      <div className="hidden md:flex" style={{ flexDirection: 'column', gap: '26px' }} data-testid="impedimentos-escritorio">
        {alta}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', fontSize: '12.5px' }}>
          {([['abiertos', 'Abiertos', n.abiertos], ['en_curso', 'En curso', n.en_curso], ['liberados', 'Liberados', n.liberados]] as const).map(([k, t, c]) => (
            <button key={k} type="button" onClick={() => setFiltro(k)} data-testid={`filtro-${k}`} aria-pressed={filtro === k} style={{
              font: 'inherit', fontSize: '12.5px', border: 'none', background: 'none', padding: '0 0 2px', cursor: 'pointer',
              color: filtro === k ? C.tinta : C.tintaSuave, fontWeight: filtro === k ? 500 : 400,
              boxShadow: filtro === k ? `inset 0 -1.5px 0 ${C.grafito}` : 'none',
            }}>
              {t} <span style={{ color: C.tenue, fontWeight: 400 }}>{c}</span>
            </button>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: '12.5px', color: C.tintaSuave }}>Ordenados por fecha de necesidad, no por cuándo se cargaron.</div>
        </div>

        <div style={{ overflowX: 'auto', marginLeft: '-16px', paddingLeft: '16px' }}><div style={{ display: 'flex', flexDirection: 'column', minWidth: '980px' }} data-testid="tabla-impedimentos">
          <GridCab columnas={COLS} celdas={[{ t: 'Tipo' }, { t: 'Qué falta' }, { t: 'Traba' }, { t: 'Responsable' }, { t: 'Necesidad' }, { t: 'Compromiso' }, { t: 'Estado' }]} />
          {visibles.length === 0 && (
            <div style={{ padding: '18px 0', fontSize: '13px', color: C.tenue }} data-testid="impedimentos-vacio">
              {impedimentos.length === 0 ? 'Ningún impedimento anotado en esta obra.' : 'Ninguno en este filtro.'}
            </div>
          )}
          {visibles.map((r, i) => {
            const e = estadoImpedimento(r, hoyIso)
            const abierto = sel === r.id
            const borde = e.clave === 'vencido' ? C.neg : e.clave === 'abierto' ? C.warn : null
            return (
              <div key={r.id}>
                <GridFila columnas={COLS} alto={66} ultima={i === visibles.length - 1 && !abierto} bordeIzq={borde}
                  onClick={() => setSel(abierto ? null : r.id)} testid={`impedimento-${r.id}`} seleccionada={abierto}>
                  <Celda tono="media">{rotuloTipo(r.tipo)}</Celda>
                  <Celda>{r.descripcion}</Celda>
                  <Celda tono="media" sub>{nombreDe(r.actividad_id) ?? <Falta>sin actividad</Falta>}</Celda>
                  <Celda tono="media">{r.responsable ?? <Falta>sin responsable</Falta>}</Celda>
                  <Celda tono="media">{diaMes(r.fecha_necesidad) ?? <Falta>sin cargar</Falta>}</Celda>
                  <Celda tono={e.clave === 'vencido' ? 'neg' : e.clave === 'abierto' ? 'warn' : 'media'} peso={e.clave === 'vencido' ? 500 : undefined}>
                    {diaMes(r.fecha_compromiso) ?? <Falta>sin cargar</Falta>}
                  </Celda>
                  <Celda tono={e.tono} peso={e.clave === 'vencido' ? 500 : undefined}>{e.texto}</Celda>
                </GridFila>
                {abierto && <DetalleImpedimento r={r} hoyIso={hoyIso} liberar={liberar} />}
              </div>
            )
          })}
        </div></div>

        <div style={{ display: 'flex', gap: '56px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '60ch' }}>
            <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Los once tipos, y por qué importan</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '56ch', paddingLeft: '24px', borderLeft: `1px solid ${C.borde}` }}>
            <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Lo que esta cola le cuesta a la obra</div>
          </div>
        </div>
      </div>

      {/* ═══ TELÉFONO (M12) ═══ */}
      <div className="flex md:hidden" style={{ flexDirection: 'column', gap: '14px' }} data-testid="impedimentos-telefono">
        {alta}
        <FilaPastillas testid="filtros-impedimentos-telefono">
          {/* «Abiertos» en el teléfono = todo lo no liberado (M12: 3). Comparte estado con el escritorio. */}
          <PastillaM activa={filtro !== 'vencidos' && filtro !== 'liberados'} onClick={() => setFiltro('abiertos')} n={n.noLiberados} testid="pastilla-abiertos">Abiertos</PastillaM>
          <PastillaM activa={filtro === 'vencidos'} onClick={() => setFiltro('vencidos')} n={n.vencidos} testid="pastilla-vencidos">Vencidos</PastillaM>
          <PastillaM activa={filtro === 'liberados'} onClick={() => setFiltro('liberados')} n={n.liberados} testid="pastilla-liberados">Liberados</PastillaM>
        </FilaPastillas>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {(filtro === 'vencidos' || filtro === 'liberados' ? visibles : ordenarPorNecesidad(impedimentos.filter((r) => r.estado !== 'liberada'))).map((r, i, xs) => {
            const e = estadoImpedimento(r, hoyIso)
            const d = compromisoTelefono(r, hoyIso)
            const abierto = sel === r.id
            return (
              <div key={r.id}>
                <FilaM alto={64} tamTitulo={13.5} icono={<Ico d={ICONO_TIPO(r.tipo)} s={15} />} iconoColor={COLOR_TONO[e.tono]}
                  titulo={r.descripcion} sub={`${rotuloTipo(r.tipo)} · ${r.responsable ?? 'sin responsable'}`}
                  derecha={<DerechaM texto={d.texto} tono={d.tono} peso={500} />}
                  ultima={i === xs.length - 1 && !abierto} onClick={() => setSel(abierto ? null : r.id)} testid={`impedimento-telefono-${r.id}`} />
                {abierto && <DetalleImpedimento r={r} hoyIso={hoyIso} liberar={liberar} />}
              </div>
            )
          })}
          {impedimentos.length === 0 && <div style={{ padding: '14px 0', fontSize: '13px', color: C.tenue }}>Ningún impedimento anotado en esta obra.</div>}
        </div>
        {bloqueadas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} data-testid="que-bloquea">
            <Eyebrow>Qué bloquea</Eyebrow>
            {bloqueadas.map((b) => (
              <div key={b.actividadId} style={{ minHeight: '52px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div>{b.nombre}</div>
                  <div style={{ fontSize: '12px', color: C.tintaSuave }}>liberar el impedimento la destraba sola</div>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: C.neg, flexShrink: 0 }}>
                  <Ico d={P.bloqueo} s={12} />bloqueada
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ height: '80px' }} aria-hidden />
      </div>
      <PrimariaTelefono href={hrefNuevo} testid="primaria-telefono-nuevo-impedimento">Nuevo impedimento</PrimariaTelefono>
    </>
  )
}

/** La fila desplegada: descripción entera, fechas y la única escritura que hay. Diseño con la skill. */
function DetalleImpedimento({ r, hoyIso, liberar }: {
  r: Restriccion; hoyIso: string; liberar: (id: string) => Promise<ResultadoAccion>
}) {
  const router = useRouter()
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const e = estadoImpedimento(r, hoyIso)
  const dato = (k: string, v: string | null) => (
    <span><span style={{ color: C.tenue }}>{k}: </span>{v ?? <Falta>sin cargar</Falta>}</span>
  )
  return (
    <div data-testid="detalle-impedimento" style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 24px', padding: '12px 0 14px',
      borderBottom: `1px solid ${C.borde}`, fontSize: '12.5px', color: C.tintaMedia,
    }}>
      <span style={{ flexBasis: '100%', color: C.tinta, fontSize: '13.5px' }}>{r.descripcion}</span>
      {dato('Necesidad', diaMes(r.fecha_necesidad))}
      {dato('Compromiso', diaMes(r.fecha_compromiso))}
      {r.fecha_liberacion && dato('Liberado', diaMes(r.fecha_liberacion))}
      {e.clave !== 'liberado' && (
        <button type="button" data-testid="marcar-liberado" disabled={pendiente}
          style={{ ...ESTILO_SECUNDARIA, marginLeft: 'auto', border: `1px solid ${C.bordeFuerte}`, height: '30px' }}
          onClick={() => empezar(async () => {
            const res = await liberar(r.id)
            if (!res.ok) { setError(res.error); return }
            router.refresh()
          })}>
          <Ico d={P.ok} s={12} />{pendiente ? 'Guardando…' : 'Marcar liberado'}
        </button>
      )}
      {error && <span style={{ color: C.neg, flexBasis: '100%' }}>{error}</span>}
    </div>
  )
}
