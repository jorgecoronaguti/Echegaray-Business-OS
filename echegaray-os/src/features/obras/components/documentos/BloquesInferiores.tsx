// 14 · M17 — «Subidos desde acá» y «En la carpeta de Drive», los dos bloques del pie.
//
// Escritorio: grilla 1fr 1fr con `gap 52`, separados del índice por una línea y `padding-top 18`.
// Izquierda: título con «N · la ficha también recibe papel» y «Subir documento» a la derecha; filas de 46
// en `1fr 110 90` (nombre · quién · fecha). Derecha: «61 archivos · 38 vinculados · del catálogo, no de
// Drive en vivo»; filas de 46 en `1fr 120 90` (nombre + subcarpeta · vinculado/sin vincular · fecha).
// Teléfono: sólo el pie «Drive: vinculada · 61 archivos» con «Subir documento» a la derecha.
//
// «Subir documento» es el control existente de la plataforma (`SubirDocumento`): la subida al bucket y
// la copia a Drive ya viven ahí. Se monta tal cual —su botón no es el texto 12,5 del fragmento— y se
// declara en el informe. Sin `'use client'`.

import type { Subidos } from '@/features/documentos/services/documentosSubidosService'
import type { ArchivosDeEntidad } from '@/features/documentos/services/carpetaDeEntidadService'
import { SubirDocumento } from '@/features/documentos/components/SubirDocumento'
import { C } from '../canon/tokens'
import type { DocumentoObra } from '../../types'
import { contarVinculados, metaCarpeta, pieDriveTelefono } from '../../services/documentosCanon'
import { diaMesAnio } from '../../services/operacionCanon'
import { Falta, GridFila, TituloBloque } from '../operacion/piezas'

export function BloquesInferiores({ obraId, subidos, archivos, documentos, carpetaDriveId }: {
  obraId: string
  subidos: Subidos | null
  archivos: ArchivosDeEntidad | null
  documentos: DocumentoObra[]
  carpetaDriveId: string | null
}) {
  const filasSubidas = subidos?.filas ?? []
  const lista = archivos?.archivos ?? []
  const vinculados = contarVinculados(lista, documentos)
  const subir = subidos && !subidos.pendienteDeMigracion
    ? <SubirDocumento tipo="obra" entidadId={obraId} testid="obra-documentos-subidos-subir" />
    : null

  return (
    <>
      <div className="hidden md:grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '52px', alignItems: 'start', paddingTop: '6px', borderTop: `1px solid ${C.borde}` }}
        data-testid="bloques-inferiores-documentos">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '18px' }} data-testid="obra-documentos-subidos">
          <TituloBloque titulo="Subidos desde acá" meta={subidos === null ? 'no se pudo leer' : `${filasSubidas.length} · la ficha también recibe papel`} derecha={subir} />
          {subidos?.error && <p style={{ fontSize: '12.5px', color: C.neg }}>No se pudieron leer los documentos: {subidos.error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filasSubidas.length === 0 && !subidos?.error && (
              <div style={{ padding: '14px 0', fontSize: '13px', color: C.tenue }}>Todavía no se subió ningún documento desde la plataforma.</div>
            )}
            {filasSubidas.map((f) => (
              <GridFila key={f.id} columnas="minmax(0,1fr) 110px 90px" gap={16} alto={46} ultima={false} sangria={0} testid={`subido-${f.id}`}>
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.url ? <a href={f.url} target="_blank" rel="noreferrer" style={{ color: C.tinta }}>{f.nombre_archivo}</a> : f.nombre_archivo}
                </div>
                <div style={{ color: C.tintaSuave, fontSize: '12.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.subido_por_nombre ?? <Falta>sin nombre</Falta>}</div>
                <div style={{ textAlign: 'right', color: C.tintaSuave }}>{diaMesAnio(f.fecha_documento ?? f.creado_en.slice(0, 10))}</div>
              </GridFila>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '18px' }} data-testid="obra-archivos-drive">
          <TituloBloque titulo="En la carpeta de Drive" meta={archivos === null ? 'no se pudo leer' : archivos.error ? archivos.error
            : !carpetaDriveId ? 'sin carpeta declarada' : metaCarpeta(lista.length, vinculados, archivos.truncado)} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {lista.length === 0 && (
              <div style={{ padding: '14px 0', fontSize: '13px', color: C.tenue }}>
                {carpetaDriveId ? 'El catálogo no tiene archivos de esta carpeta.' : 'Sin carpeta de Drive declarada: nada que listar.'}
              </div>
            )}
            {lista.map((a) => {
              const vinculado = documentos.some((d) => d.drive_file_id === a.drive_file_id)
              return (
                <GridFila key={a.drive_file_id} columnas="minmax(0,1fr) 120px 90px" gap={16} alto={46} ultima={false} sangria={0} testid={`archivo-drive-${a.drive_file_id}`}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.web_view_link ? <a href={a.web_view_link} target="_blank" rel="noreferrer" style={{ color: C.tinta }}>{a.name}</a> : a.name}
                    </div>
                    <div style={{ fontSize: '11px', color: C.tenue }}>{a.subcarpeta || 'raíz de la carpeta'}</div>
                  </div>
                  <div style={{ fontSize: '12.5px', color: vinculado ? C.tintaMedia : C.tenue }}>{vinculado ? 'vinculado' : 'sin vincular'}</div>
                  <div style={{ textAlign: 'right', color: C.tintaSuave }}>{diaMesAnio(a.modified_time?.slice(0, 10)) ?? <Falta italica>sin fecha</Falta>}</div>
                </GridFila>
              )
            })}
          </div>
        </div>
      </div>

      {/* M17: el pie. */}
      <div className="flex md:hidden" style={{ justifyContent: 'space-between', alignItems: 'center', gap: '12px', fontSize: '12px', color: C.tintaSuave }} data-testid="pie-drive-telefono">
        {(() => {
          const p = pieDriveTelefono(carpetaDriveId, archivos === null || archivos.error ? null : lista.length)
          return <span>Drive: <span style={{ color: C.tinta }}>{p.estado}</span>{p.resto && <> · {p.resto}</>}</span>
        })()}
        {subir}
      </div>
    </>
  )
}
