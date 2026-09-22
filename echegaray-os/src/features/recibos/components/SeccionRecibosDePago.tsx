// D11 · PERSONAL · LIQUIDACIÓN — los recibos de pago de la quincena: emitir, firmar, archivar.
//
// Vive en «Cierre y recibos» porque el recibo sale de la foto del sello: se mira después de cerrar.
// Las columnas son las del diseño —Persona, Obra de la quincena, Por banco, En efectivo, Total,
// Recibo— y los importes son los de la liquidación (vista previa) o los del recibo emitido (foto).
// Sin tarifa no dice $ 0: dice «no liquida», y el recibo no se puede emitir.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { esFechaISO, quincenaDe } from '@/features/administracion/services/quincena'
import { getQuincenaDeRecibos, type FilaDeRecibo } from '../quincena'
import { miles, periodoCorto, resumenDeQuincena } from '../logica'
import { EnviarAFirmar } from './Botones'
import { MONO, Punto } from './piezas'

const COLS = 'minmax(0,1.3fr) minmax(0,1fr) 120px 130px 130px 200px'
const RUTA = '/administracion/personas/recibos'

export async function SeccionRecibosDePago({ quincenaPedida, hoy }: { quincenaPedida?: string; hoy: string }) {
  const q = quincenaDe(esFechaISO(quincenaPedida) ? (quincenaPedida as string) : hoy)
  const supabase = await createClient()
  const { filas, errores } = await getQuincenaDeRecibos(supabase, q)
  const sinFirmar = filas.filter((f) => f.recibo?.estado === 'emitido' && !f.recibo.desactualizado).length
  const emitibles = filas.filter((f) => f.emitible).length
  const bloqueados = filas.filter((f) => f.marca.clave === 'bloqueado').length
  const hayCerrada = filas.some((f) => f.cerrada)
  const porQueNo = !hayCerrada ? 'La quincena está abierta: el recibo sale de la foto sellada al cerrarla.'
    : 'No hay recibos por emitir: los que se pueden ya están emitidos y al día.'

  return (
    <section data-testid="recibos-de-pago" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {errores.map((e) => (
        <Aviso key={e.que} tono="neg" testid="recibos-pago-error" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
      ))}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Recibos de pago · quincena {periodoCorto(q.desde, q.hasta)}</div>
          <div data-testid="recibos-pago-resumen" style={{ fontSize: '12.5px', color: V.apagado }}>
            {resumenDeQuincena(filas.map((f) => f.marca))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Link href={`${RUTA}/imprimir?quincena=${q.desde}`} data-testid="imprimir-sin-firmar" aria-disabled={sinFirmar === 0}
            style={{
              height: 34, padding: '0 14px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6, display: 'flex',
              alignItems: 'center', fontSize: '13px', color: V.tintaSuave, textDecoration: 'none',
              pointerEvents: sinFirmar === 0 ? 'none' : undefined, opacity: sinFirmar === 0 ? 0.45 : 1,
            }}>
            Imprimir {sinFirmar === 1 ? 'el' : `los ${sinFirmar}`}
          </Link>
          <EnviarAFirmar desde={q.desde} hasta={q.hasta} activo={emitibles > 0} porQueNo={porQueNo} />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 900 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: COLS, gap: 16, height: 32, alignItems: 'center',
            borderBottom: `1px solid ${V.lineaFuerte}`, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em',
            color: V.tenue, textTransform: 'uppercase',
          }}>
            <div>Persona</div><div>Obra de la quincena</div><div style={{ textAlign: 'right' }}>Por banco</div>
            <div style={{ textAlign: 'right' }}>En efectivo</div><div style={{ textAlign: 'right' }}>Total</div><div>Recibo</div>
          </div>
          {filas.length === 0 && (
            <div style={{ minHeight: 54, display: 'flex', alignItems: 'center', fontSize: '13px', color: V.tenue }}>
              Nadie en la liquidación de esta quincena.
            </div>
          )}
          {filas.map((f, i) => <Renglon key={f.personaId} f={f} ultima={i === filas.length - 1} desde={q.desde} />)}
        </div>
      </div>
      <div style={{ fontSize: '12.5px', color: V.apagado }}>
        {bloqueados} de {filas.length} · sin tarifa cargada no dice $ 0: dice que no liquida, y el recibo no se puede emitir.
      </div>
    </section>
  )
}

function Renglon({ f, ultima, desde }: { f: FilaDeRecibo; ultima: boolean; desde: string }) {
  const falta = f.sinTarifa ? 'sin tarifa' : '—'
  const cifra = (n: number | undefined, fuerte = false): ReactNode => (n == null
    ? <span style={{ color: V.tenue }}>{falta}</span>
    : <span style={{ fontWeight: fuerte ? 600 : undefined }}>{miles(n)}</span>)
  return (
    <Link href={`${RUTA}?quincena=${desde}&persona=${f.personaId}`} data-testid={`recibo-pago-${f.personaId}`}
      title={f.bloqueo ?? f.recibo?.desactualizado ?? undefined}
      style={{
        display: 'grid', gridTemplateColumns: COLS, gap: 16, minHeight: 54, alignItems: 'center', fontSize: '13.5px',
        borderBottom: ultima ? undefined : `1px solid ${V.lineaFila}`, color: V.tinta, textDecoration: 'none',
      }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</div>
        <div style={{ fontSize: '12px', color: V.tenue }}>{f.categoria ?? 'sin categoría de convenio'}</div>
      </div>
      <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: f.obra ? V.tinta : V.tenue }}>
        {f.obra ?? 'sin horas imputadas'}
      </div>
      <div style={{ textAlign: 'right', fontFamily: MONO }}>{cifra(f.foto?.porBanco)}</div>
      <div style={{ textAlign: 'right', fontFamily: MONO }}>{cifra(f.foto?.enEfectivo)}</div>
      <div style={{ textAlign: 'right', fontFamily: MONO }}>
        {f.foto ? cifra(f.foto.total, true) : <span style={{ color: V.tenue }}>no liquida</span>}
      </div>
      <div style={{ minWidth: 0, fontSize: '13px' }}><Punto tono={f.marca.tono}>{f.marca.texto}</Punto></div>
    </Link>
  )
}
