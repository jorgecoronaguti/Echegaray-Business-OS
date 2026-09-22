// D12 · EL RECIBO GENERADO y D13 · EL FIRMADO — una sola pantalla: la lista de la quincena a la
// izquierda y, a la derecha, el recibo de la persona elegida.
//
//   · sin recibo      → la vista previa (D12) que sale de la liquidación, con «Enviar a firmar».
//   · emitido         → el documento numerado (D12), a la espera de la firma; se puede imprimir y subir
//                       el papel que trajo la persona.
//   · firmado/archivado → las formas de firma que tenga (D13), la verificación y el archivo.
//
// La lista no va atenuada como en el diseño: acá es una página, no un panel sobre la tabla, y un listado
// al 40 % se lee como deshabilitado.

import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import { carpetaDelLegajo, diaHora, miles, motivoParaNo, periodoCorto, type FotoDeRecibo } from '../logica'
import type { ReciboDePago } from '../datos'
import type { FilaDeRecibo } from '../quincena'
import { EnviarAFirmar, VerificarYArchivar } from './Botones'
import { SubirPapel } from './SubirPapel'
import { BOTON_CONTORNO, DIVISOR, DocumentoRecibo, MONO, Punto, QUIETO, Trazo } from './piezas'

const RUTA = '/administracion/personas/recibos'

export interface DatosDePagina {
  desde: string
  hasta: string
  filas: FilaDeRecibo[]
  elegida: FilaDeRecibo | null
  historial: ReciboDePago[]
  nombreDe: ReadonlyMap<string, string>
  urlPapel: string | null
  volver: string
}

export function PaginaRecibo({ d }: { d: DatosDePagina }) {
  const r = d.elegida?.recibo ?? null
  const firmado = r != null && ['firmado_telefono', 'firmado_papel', 'archivado'].includes(r.estado)
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'stretch', minHeight: 680, flexWrap: 'wrap' }}>
      {firmado && r ? <Firmado r={r} d={d} /> : <Lista d={d} />}
      <div style={{ width: 9, background: DIVISOR, borderLeft: `1px solid ${V.lineaFuerte}`, borderRight: `1px solid ${V.lineaFuerte}`, flexShrink: 0 }} />
      {d.elegida
        ? (firmado && r ? <Verificar r={r} /> : <Panel f={d.elegida} d={d} />)
        : <div style={{ width: 600, padding: 28, fontSize: '13px', color: V.apagado, background: QUIETO }}>Elegí una persona de la lista.</div>}
    </div>
  )
}

function Lista({ d }: { d: DatosDePagina }) {
  return (
    <div style={{ flex: 1, minWidth: 280, padding: '26px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: '19px', fontWeight: 600 }}>Recibos · quincena {periodoCorto(d.desde, d.hasta)}</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {d.filas.map((f) => (
          <Link key={f.personaId} href={`${RUTA}?quincena=${d.desde}&persona=${f.personaId}`} data-testid={`lista-recibo-${f.personaId}`}
            style={{
              minHeight: 48, borderBottom: `1px solid ${V.lineaFila}`, display: 'flex', alignItems: 'center', gap: 12, fontSize: '13.5px',
              color: V.tinta, textDecoration: 'none', padding: '0 8px',
              background: d.elegida?.personaId === f.personaId ? QUIETO : undefined,
            }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.nombre} · {f.foto ? miles(f.foto.total) : 'no liquida'}
            </span>
            <span style={{ fontSize: '12px' }}><Punto tono={f.marca.tono}>{f.marca.texto}</Punto></span>
          </Link>
        ))}
      </div>
    </div>
  )
}

/** D12 · el panel derecho: el documento, y lo que se puede hacer con él. */
function Panel({ f, d }: { f: FilaDeRecibo; d: DatosDePagina }) {
  const r = f.recibo
  const foto: FotoDeRecibo | null = f.foto
  const puedeReemitir = r ? motivoParaNo('reemitir', r, 'administracion') == null && f.emitible : f.emitible
  const porQueNo = f.bloqueo ?? (!f.cerrada ? 'La quincena está abierta: el recibo sale de la foto sellada al cerrarla.' : 'Ya está vigente y al día.')
  return (
    <div style={{ width: 600, maxWidth: '100%', flexShrink: 0, padding: '26px 28px 30px', display: 'flex', flexDirection: 'column', gap: 20, background: QUIETO }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: '17px', fontWeight: 600 }}>Recibo de pago</div>
          <div style={{ fontSize: '12.5px', color: V.apagado }} data-testid="recibo-cabecera">
            {r ? `${r.codigo} · emitido ${diaHora(r.emitidoEn).slice(0, 5)} por ${d.nombreDe.get(r.emitidoPor) ?? 'Administración'}` : 'Vista previa · sale de la liquidación, todavía sin número'}
          </div>
        </div>
        <Link href={d.volver} aria-label="Cerrar" style={{ fontSize: '20px', color: V.apagado, textDecoration: 'none' }}>×</Link>
      </div>
      {r?.desactualizado && <Aviso tono="warn">Desactualizado: {r.desactualizado}. Reemitilo antes de firmar.</Aviso>}
      {r?.estado === 'observado' && <Aviso tono="neg">Observado: {r.observacion}</Aviso>}
      {foto
        ? <DocumentoRecibo d={{ codigo: r?.codigo ?? null, personaNombre: f.nombre, desde: d.desde, hasta: d.hasta, obra: f.obra, foto, trazo: r?.trazo }} />
        : <Aviso tono="neg">No liquida: {f.bloqueo ?? 'sin importe'}. Sin tarifa no hay recibo, y nunca en $ 0.</Aviso>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {(!r || puedeReemitir) && (
          <EnviarAFirmar desde={d.desde} hasta={d.hasta} persona={f.personaId} activo={puedeReemitir} porQueNo={porQueNo} testid="enviar-a-firmar-uno" />
        )}
        {r && r.estado === 'emitido' && !r.desactualizado && (
          <span style={{ fontSize: '13px', color: V.warn }} data-testid="esperando-firma">En el teléfono de la persona, esperando la firma</span>
        )}
        {r && (
          <>
            <Link href={`${RUTA}/imprimir?recibo=${r.id}`} style={BOTON_CONTORNO} data-testid="imprimir-recibo">Imprimir</Link>
            <Link href={`${RUTA}/imprimir?recibo=${r.id}&pdf=1`} style={BOTON_CONTORNO} data-testid="descargar-pdf">Descargar PDF</Link>
          </>
        )}
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: V.apagado }}>se guarda en el legajo al archivar el firmado</div>
      </div>
      {r && motivoParaNo('subir_papel', r, 'administracion') == null && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 600, padding: '6px 0' }}>Cargar el papel firmado que trajo</summary>
          <SubirPapel recibo={r.id} compacto />
        </details>
      )}
      <Historial d={d} />
      <div style={{ fontSize: '12.5px', color: V.apagado, lineHeight: 1.5 }}>
        El importe y la composición no se escriben acá: salen de la liquidación. Este panel sólo muestra lo que se va a firmar — y el recibo del estudio no es plata girada hasta que el extracto lo confirme.
      </div>
    </div>
  )
}

function Aviso({ tono, children }: { tono: 'warn' | 'neg'; children: React.ReactNode }) {
  return (
    <div data-testid={`aviso-recibo-${tono}`} style={{ fontSize: '12.5px', lineHeight: 1.45, color: tono === 'warn' ? V.warn : V.neg, padding: '10px 12px', background: '#FFFFFF', border: `1px solid ${V.linea}`, borderRadius: 8 }}>
      {children}
    </div>
  )
}

/** Las versiones anteriores de la persona: nada se borra, se ve qué reemplazó a qué. */
function Historial({ d }: { d: DatosDePagina }) {
  const persona = d.elegida?.personaId
  const viejos = d.historial.filter((h) => h.personaId === persona && !h.vigente)
  if (viejos.length === 0) return null
  return (
    <div style={{ fontSize: '12px', color: V.apagado, display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="versiones-anteriores">
      <div style={{ fontWeight: 600, color: V.tintaSuave }}>Versiones anteriores</div>
      {viejos.map((h) => (
        <div key={h.id} style={{ fontFamily: MONO }}>{h.codigo} · {h.estado.replace('_', ' ')} · $ {miles(h.total)}{h.observacion ? ` · ${h.observacion}` : ''}</div>
      ))}
    </div>
  )
}

/** D13 · izquierda: las formas de firma que tiene ESTE recibo, conviviendo, y dónde queda en Drive. */
function Firmado({ r, d }: { r: ReciboDePago; d: DatosDePagina }) {
  return (
    <div style={{ flex: 1, minWidth: 320, padding: '26px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div style={{ fontSize: '15px', fontWeight: 600 }}>Las dos formas de firma, conviviendo</div>
        <Link href={d.volver} style={{ marginLeft: 'auto', fontSize: '12.5px', color: V.apagado }}>Volver a la quincena</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 24 }}>
        <Forma titulo="Firmado en el teléfono" hay={r.trazo != null} testid="forma-telefono"
          nombre={`${r.personaNombre} · ${r.codigo}`}
          lineas={r.firmadoEn ? [`${diaHora(r.firmadoEn)} · desde el teléfono de ${r.personaNombre}`, 'Trazo y sello de tiempo guardados con el documento'] : ['Sin firma en el teléfono']}>
          <Trazo svg={r.trazo} alto={70} testid="trazo-firmado" />
        </Forma>
        <Forma titulo="Firmado en papel y fotografiado" hay={r.papelPath != null} testid="forma-papel"
          nombre={`${r.personaNombre} · ${r.codigo}`}
          lineas={r.papelSubidoEn
            ? [`${diaHora(r.papelSubidoEn)} · la subió ${r.papelSubidoPor ? d.nombreDe.get(r.papelSubidoPor) ?? 'Administración' : 'Administración'}`, 'El papel original queda en Administración']
            : ['Sin papel cargado']}>
          {d.urlPapel
            ? <a href={d.urlPapel} target="_blank" rel="noreferrer" style={{ color: V.tenue, fontSize: '12.5px' }}>Foto del recibo firmado ↗</a>
            : <span style={{ color: V.tenue, fontSize: '12.5px' }}>Foto del recibo firmado</span>}
        </Forma>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 18, borderTop: `1px solid ${V.linea}` }}>
        <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Dónde queda</div>
        <div style={{ fontSize: '12px', color: V.apagado, lineHeight: 1.5 }} data-testid="carpeta-legajo">
          Los recibos firmados NO van a la carpeta de la obra: van al legajo.{' '}
          <span style={{ fontFamily: MONO, fontSize: '11.5px' }}>{carpetaDelLegajo(r.personaNombre, r.desde).join(' / ')}</span>
          {' · '}{r.driveFileId
            ? <a href={`https://drive.google.com/file/d/${r.driveFileId}/view`} target="_blank" rel="noreferrer" style={{ color: V.tinta }}>abrir en Drive ↗</a>
            : r.estado === 'archivado' ? 'lo sube la VM en la próxima corrida' : 'se sube al archivar'}
        </div>
      </div>
      <DocumentoRecibo d={{ codigo: r.codigo, personaNombre: r.personaNombre, desde: r.desde, hasta: r.hasta, obra: r.obra, foto: r, trazo: r.trazo }} />
    </div>
  )
}

function Forma({ titulo, hay, nombre, lineas, children, testid }: {
  titulo: string; hay: boolean; nombre: string; lineas: string[]; children: React.ReactNode; testid: string
}) {
  return (
    <div data-testid={testid} style={{ border: `1px solid ${V.linea}`, borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, opacity: hay ? 1 : 0.5 }}>
      <span style={{ fontSize: '12.5px' }}><Punto tono={hay ? 'pos' : 'tenue'} fuerte>{titulo}</Punto></span>
      <div style={{ fontSize: '14px', fontWeight: 600 }}>{nombre}</div>
      <div style={{ height: 90, background: QUIETO, border: `1px solid ${V.linea}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {hay ? children : <span style={{ color: V.tenue, fontSize: '12.5px' }}>—</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '12.5px', color: V.apagado }}>
        {lineas.map((l) => <div key={l}>{l}</div>)}
      </div>
    </div>
  )
}

/** D13 · derecha: verificar antes de archivar. */
function Verificar({ r }: { r: ReciboDePago }) {
  const noArchiva = motivoParaNo('archivar', r, 'administracion')
  const noObserva = motivoParaNo('observar', r, 'administracion')
  return (
    <div style={{ width: 430, maxWidth: '100%', flexShrink: 0, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: '15px', fontWeight: 600 }}>{r.estado === 'archivado' ? 'Archivado' : 'Verificar antes de archivar'}</div>
      {r.estado === 'archivado'
        ? <div style={{ fontSize: '13px', color: V.apagado, lineHeight: 1.5 }} data-testid="recibo-archivado">
            {r.archivadoEn ? `Archivado el ${diaHora(r.archivadoEn)}. ` : ''}Es el documento vigente en el legajo; el emitido queda como versión anterior.
          </div>
        : <VerificarYArchivar recibo={r.id} puedeArchivar={noArchiva == null} porQueNo={noArchiva} puedeObservar={noObserva == null} />}
      <div style={{ fontSize: '12.5px', color: V.apagado, lineHeight: 1.5 }}>
        La firma con el dedo vale como conformidad interna y el papel firmado sigue siendo válido: conviven, y se archiva cualquiera de los dos.
      </div>
    </div>
  )
}
