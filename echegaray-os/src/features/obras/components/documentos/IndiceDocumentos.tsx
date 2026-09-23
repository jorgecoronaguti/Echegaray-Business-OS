'use client'

// 14 · M17 — EL ÍNDICE DE DOCUMENTOS: la banda de chips con el buscador, los grupos por para qué
// sirven, y el aside «Requiere atención» · «Últimos cambios».
//
// Escritorio: banda `#FAFAF8` a sangre (`margin 0 -30px`, `padding 7px 30px`) con Todo · Planos ·
// Contrato · Seguridad · Evidencia · Sin clasificar (icono 12, conteo mono 10,5) y el buscador de
// 216×28 a la derecha; grilla `minmax(0,1.7fr) 130px minmax(0,1fr) 150px 96px` con cabeceras de grupo
// de 40 (icono · nombre 600 · para qué · conteo mono · resumen a la derecha) y filas de 52; aside de
// 300 con `gap 44`. Teléfono: la fila de pastillas y filas de 44 con nombre, «Tipo · dd/mm» y la
// relación a la derecha.
//
// LO QUE EL 14 NO DIBUJA Y HACE FALTA, diseñado con `diseno-ui-ux-producto-os` (edición en el lugar,
// sin navegar): la actividad se cambia tocando «sin asignar»; «Quitar» (cortar el vínculo) aparece al
// apoyar el mouse en la fecha. LA CATEGORÍA la sigue escribiendo `CeldaCategoriaDocumento`: es una de
// las superficies del deshacer de la plataforma (Cmd+Z, dueño 17/09/2026, `pilaDeDeshacer.ts`) y lo
// pedido por el dueño no se quita; su control no es el «elegir ˅» de 26px del fragmento y se declara.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ResultadoAccion } from '@/shared/components/ui'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import type { Actividad, DocumentoObra } from '../../types'
import { etiquetaDeTipo, urlDeDrive } from '../../services/driveUrl'
import {
  CATEGORIAS, CATEGORIAS_CANONICAS, SIN_CLASIFICAR, categoriaDeclarada, paraQueSirve, porCategoriaFiltrado,
} from '../../services/documentosCategoria'
import {
  RELACION, actividadDelPapel, requiereAtencion, resumenGrupo, sublineaArchivo, ultimosCambios,
} from '../../services/documentosCanon'
import { diaMes, diaMesAnio } from '../../services/operacionCanon'
import { EYEBROW, Falta, FilaPastillas, PastillaM } from '../operacion/piezas'
import { CeldaCategoriaDocumento } from '../CeldaCategoriaDocumento'

const COLS = 'minmax(0,1.7fr) 130px minmax(0,1fr) 150px 96px'

/** Los trazos del 14 que `P` no tiene (plano, escudo): locales, trazo 2, viewBox 24. Declarado. */
const PLANO = <><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z" /><path d="M9 4v13M15 7v13" /></>
const ESCUDO = <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>

const ICONO: Record<string, React.ReactNode> = {
  [CATEGORIAS.PLANOS]: PLANO, [CATEGORIAS.CONTRATO]: P.doc, [CATEGORIAS.SEGURIDAD]: ESCUDO, [CATEGORIAS.EVIDENCIA]: P.foto,
  [SIN_CLASIFICAR]: P.alerta,
}
const CHIP: Record<string, string> = {
  [CATEGORIAS.PLANOS]: 'Planos', [CATEGORIAS.CONTRATO]: 'Contrato', [CATEGORIAS.SEGURIDAD]: 'Seguridad',
  [CATEGORIAS.EVIDENCIA]: 'Evidencia', [SIN_CLASIFICAR]: 'Sin clasificar',
}

export function IndiceDocumentos({ documentos, actividades, asignar, clasificar, desvincular }: {
  documentos: DocumentoObra[]
  actividades: Actividad[]
  asignar?: (driveFileId: string, actividadId: string) => Promise<ResultadoAccion>
  clasificar?: (driveFileId: string, categoria: string) => Promise<ResultadoAccion>
  desvincular: (driveFileId: string) => Promise<ResultadoAccion>
}) {
  const [query, setQuery] = useState('')
  const [chip, setChip] = useState<string | null>(null)
  const grupos = useMemo(() => porCategoriaFiltrado(documentos, query, chip), [documentos, query, chip])
  const cuentas = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of documentos) { const c = categoriaDeclarada(d.rol); m.set(c, (m.get(c) ?? 0) + 1) }
    return m
  }, [documentos])
  const atencion = requiereAtencion(documentos)
  const cambios = ultimosCambios(documentos)
  const nombreDe = (id: string) => actividades.find((a) => a.id === id)?.nombre ?? null
  const chips = [null, ...CATEGORIAS_CANONICAS, SIN_CLASIFICAR] as (string | null)[]
  const chipItems = chips.map((c) => ({
    id: c, label: c === null ? 'Todo' : CHIP[c], n: c === null ? documentos.length : (cuentas.get(c) ?? 0),
    icono: c === null ? P.todo : ICONO[c], activo: chip === c,
    testid: c === null ? 'chip-todo' : `chip-${c === SIN_CLASIFICAR ? 'sin-clasificar' : c}`,
  }))

  return (
    <>
      {/* ═══ ESCRITORIO (14) ═══ */}
      <div className="hidden md:flex" style={{ flexDirection: 'column' }} data-testid="indice-documentos">
        {/* A sangre con `-mx-5 px-5` (el marco real de la ficha); los 10px hasta los 30 del 14 van adentro. */}
        <div className="-mx-5 px-5" style={{
          paddingTop: '7px', paddingBottom: '7px',
          background: C.tenueFondo, borderTop: `1px solid ${C.borde}`, borderBottom: `1px solid ${C.borde}`,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12.5px', padding: '0 10px' }} data-testid="chips-categoria-documento">
          {chipItems.map((c) => (
            <button key={c.id ?? 'todo'} type="button" onClick={() => setChip(c.id)} data-testid={c.testid} aria-pressed={c.activo} style={{
              font: 'inherit', fontSize: '12.5px', border: 'none', background: 'none', padding: 0, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '6px', color: c.activo ? C.tinta : C.tintaSuave, fontWeight: c.activo ? 500 : 400,
            }}>
              <Ico d={c.icono} s={12} />{c.label}
              <span style={{ fontFamily: MONO, fontSize: '10.5px', color: C.tenue, fontWeight: 400 }}>{c.n}</span>
            </button>
          ))}
          <label style={{
            marginLeft: 'auto', width: '216px', height: '28px', padding: '0 10px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px',
            fontSize: '12.5px', background: C.superficie, display: 'flex', alignItems: 'center', gap: '7px', color: C.tenue,
          }}>
            <Ico d={P.buscar} s={12} />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar documento" aria-label="Buscar documento"
              data-testid="buscar-documento-obra" style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', font: 'inherit', color: C.tinta }} />
          </label>
        </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: '44px', alignItems: 'start', padding: '18px 10px 0' }}>
          <div style={{ overflowX: 'auto', minWidth: 0 }}><div style={{ display: 'flex', flexDirection: 'column', minWidth: '760px' }} data-testid="tabla-documentos">
            <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '20px', height: '34px', alignItems: 'center', borderBottom: `1px solid ${C.borde}`, ...EYEBROW }}>
              <div>Nombre</div><div>Relación</div><div>Actividad</div><div>Categoría</div><div style={{ textAlign: 'right' }}>Fecha</div>
            </div>
            {grupos.length === 0 && (
              <div style={{ padding: '18px 0', fontSize: '13px', color: C.tenue }} data-testid="documentos-vacio">
                {documentos.length === 0 ? 'Todavía no hay ningún documento vinculado a esta obra.' : 'Ningún documento coincide.'}
              </div>
            )}
            {grupos.map(({ categoria, docs }) => {
              const sin = categoria === SIN_CLASIFICAR
              const resumen = resumenGrupo(categoria, docs)
              return (
                <div key={categoria} data-testid={`grupo-documentos-${sin ? 'sin-clasificar' : categoria}`}>
                  <div style={{ height: '40px', display: 'flex', alignItems: 'center', gap: '9px', borderBottom: `1px solid ${C.borde}`, fontSize: '13px' }}>
                    <span style={{ color: C.tenue, display: 'flex' }}><Ico d={ICONO[categoria] ?? P.doc} s={13} /></span>
                    <span style={{ fontWeight: 600 }}>{categoria}</span>
                    <span style={{ color: sin ? C.warn : C.tintaSuave }}>{sin ? 'nadie dijo para qué sirve' : paraQueSirve(categoria)}</span>
                    <span style={{ fontFamily: MONO, fontSize: '11.5px', color: C.tenue }}>{docs.length}</span>
                    {resumen && (
                      <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: '11.5px', color: resumen.alerta ? C.warn : C.tintaSuave }} data-testid="resumen-grupo-documentos">
                        {resumen.texto}
                      </span>
                    )}
                  </div>
                  {docs.map((d, i) => (
                    <FilaDocumento key={d.drive_file_id} d={d} ultima={i === docs.length - 1} actividades={actividades} nombreDe={nombreDe}
                      asignar={asignar} clasificar={clasificar} desvincular={desvincular} />
                  ))}
                </div>
              )
            })}
          </div></div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: '24px' }} data-testid="panel-documentos">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={EYEBROW}>Requiere atención</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <Aviso texto="Sin clasificar" n={atencion.sinClasificar} onClick={() => setChip(SIN_CLASIFICAR)} testid="aviso-sin-clasificar" />
                <Aviso texto="Vínculos que nadie confirmó" n={atencion.sinConfirmar} testid="aviso-sin-confirmar" />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ color: C.tintaSuave }}>Vencimientos</span>
                  <span style={{ color: C.tenue, fontStyle: 'italic' }}>sin columna</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={EYEBROW}>Últimos cambios</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px', color: C.tintaMedia }} data-testid="ultimos-cambios">
                {cambios.length === 0 && <span style={{ color: C.tenue }}>Ningún papel tiene fecha de modificación en Drive.</span>}
                {cambios.map((c) => <div key={c.id}><span style={{ color: C.tenue }}>{c.fecha} · </span>{c.nombre}</div>)}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ═══ TELÉFONO (M17) ═══ */}
      <div className="flex md:hidden" style={{ flexDirection: 'column', gap: '14px' }} data-testid="indice-documentos-telefono">
        <FilaPastillas testid="chips-documentos-telefono">
          {chipItems.map((c) => (
            <PastillaM key={c.id ?? 'todo'} activa={c.activo} onClick={() => setChip(c.id)} icono={<Ico d={c.icono} s={12} />} n={c.n} testid={`${c.testid}-telefono`}>
              {c.label}
            </PastillaM>
          ))}
        </FilaPastillas>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {grupos.length === 0 && <div style={{ padding: '14px 0', fontSize: '13px', color: C.tenue }}>{documentos.length === 0 ? 'Todavía no hay ningún documento vinculado a esta obra.' : 'Ningún documento coincide.'}</div>}
          {grupos.flatMap((g) => g.docs).map((d, i, xs) => (
            <div key={d.drive_file_id} style={{ height: '44px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: i === xs.length - 1 ? 'none' : `1px solid ${C.borde}`, fontSize: '13px' }}
              data-testid="fila-documento-telefono">
              <span style={{ color: C.tenue, display: 'flex' }}><Ico d={ICONO[categoriaDeclarada(d.rol)] ?? P.doc} s={13} /></span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <a href={urlDeDrive(d.drive_file_id, d.tipo)} target="_blank" rel="noreferrer" style={{ fontSize: '13.5px', color: C.tinta, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.name ?? d.drive_file_id}
                </a>
                <div style={{ fontSize: '11px', color: C.tenue }}>{etiquetaDeTipo(d.tipo, d.mime_type, d.name)} · {diaMes(d.modified_time) ?? 'sin fecha'}</div>
              </div>
              <span style={{ fontSize: '11.5px', color: C.tintaSuave, whiteSpace: 'nowrap' }}>{RELACION[d.origen]}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function Aviso({ texto, n, onClick, testid }: { texto: string; n: number; onClick?: () => void; testid: string }) {
  const cuerpo = (
    <>
      <span>{texto}</span>
      <span style={{ color: n > 0 ? C.warn : C.tenue, fontWeight: 500 }}>{n}</span>
    </>
  )
  const estilo: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '12px', font: 'inherit', width: '100%' }
  if (!onClick || n === 0) return <div data-testid={testid} style={estilo}>{cuerpo}</div>
  return (
    <button type="button" onClick={onClick} data-testid={testid} style={{ ...estilo, border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: C.tinta }}>
      {cuerpo}
    </button>
  )
}

/** La fila de 52: nombre y sublínea · relación · actividad · categoría · fecha. Escribe en el lugar. */
function FilaDocumento({ d, ultima, actividades, nombreDe, asignar, clasificar, desvincular }: {
  d: DocumentoObra
  ultima: boolean
  actividades: Actividad[]
  nombreDe: (id: string) => string | null
  asignar?: (driveFileId: string, actividadId: string) => Promise<ResultadoAccion>
  clasificar?: (driveFileId: string, categoria: string) => Promise<ResultadoAccion>
  desvincular: (driveFileId: string) => Promise<ResultadoAccion>
}) {
  const router = useRouter()
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editaAct, setEditaAct] = useState(false)
  const categoria = categoriaDeclarada(d.rol)
  const act = actividadDelPapel(d, nombreDe)
  const correr = (fn: () => Promise<ResultadoAccion>) => empezar(async () => {
    setError(null)
    const r = await fn()
    if (!r.ok) { setError(r.error); return }
    setEditaAct(false); router.refresh()
  })
  const SELECT: React.CSSProperties = {
    height: '26px', padding: '0 8px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', fontSize: '12.5px', color: C.tintaSuave,
    background: C.superficie, font: 'inherit', width: '100%',
  }
  return (
    <div className="group" data-testid="fila-documento-obra" style={{
      display: 'grid', gridTemplateColumns: COLS, gap: '20px', minHeight: '52px', alignItems: 'center', fontSize: '13.5px',
      borderBottom: ultima ? `1px solid ${C.borde}` : `1px solid ${C.bordeTarjeta}`, opacity: pendiente ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
        <a href={urlDeDrive(d.drive_file_id, d.tipo)} target="_blank" rel="noreferrer" data-testid="documento-enlace"
          style={{ color: C.tinta, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {d.name ?? <>{d.drive_file_id.slice(0, 10)}… <span style={{ fontSize: '11px', color: C.tenue }}>sin nombre en el índice</span></>}
        </a>
        <div style={{ fontSize: '11px', color: C.tenue, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sublineaArchivo(etiquetaDeTipo(d.tipo, d.mime_type, d.name), d.path)}
        </div>
        {error && <div style={{ fontSize: '11px', color: C.neg }}>{error}</div>}
      </div>
      <div style={{ color: d.origen === 'confirmado' ? C.tintaMedia : C.tintaSuave }}>{RELACION[d.origen]}</div>
      <div style={{ minWidth: 0 }}>
        {asignar && editaAct ? (
          <select autoFocus defaultValue={d.actividad_id ?? ''} aria-label="Actividad del documento" data-testid="documento-actividad" style={SELECT}
            onBlur={() => setEditaAct(false)} onChange={(e) => correr(() => asignar(d.drive_file_id, e.target.value))}>
            <option value="">sin asignar</option>
            {actividades.filter((a) => a.tipo !== 'resumen' && !a.archivada).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        ) : (
          <button type="button" disabled={!asignar} onClick={() => setEditaAct(true)} data-testid="documento-actividad-texto" style={{
            font: 'inherit', border: 'none', background: 'none', padding: 0, cursor: asignar ? 'pointer' : 'default', textAlign: 'left',
            color: act.asignada ? C.tintaMedia : C.tenue, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
          }}>{act.texto}</button>
        )}
      </div>
      <div style={{ minWidth: 0, fontSize: '12.5px', color: C.tintaSuave }}>
        {clasificar
          ? <CeldaCategoriaDocumento doc={d} clasificar={clasificar} />
          : <span data-testid="documento-categoria-texto">{CHIP[categoria] ?? categoria}</span>}
      </div>
      <div style={{ textAlign: 'right', color: C.tintaSuave, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
        {d.modified_time ? diaMesAnio(d.modified_time) : <Falta italica>sin fecha</Falta>}
        <button type="button" onClick={() => correr(() => desvincular(d.drive_file_id))} data-testid="desvincular-documento"
          className="opacity-0 focus:opacity-100 group-hover:opacity-100"
          style={{ font: 'inherit', fontSize: '11.5px', border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: C.neg }}>
          Quitar
        </button>
      </div>
    </div>
  )
}
