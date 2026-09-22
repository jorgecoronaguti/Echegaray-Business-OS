// M09 · MI RECIBO DE PAGO y M10 · FIRMADO — las piezas del teléfono, sin estado.
//
// Valores literales del `.dc.html` a través de los tokens del teléfono (`movil/tokens.ts`), no del
// escritorio: es el mismo contrato que el resto de «Yo».

import Link from 'next/link'
import type { ReactNode } from 'react'
import { C, R } from '@/shared/components/movil/tokens'
import { MONO } from '@/shared/components/movil/Piezas'
import { diaHora, miles, periodoCorto } from '../logica'
import type { ReciboDePago } from '../datos'
import { Trazo } from './piezas'

const rotulo = { fontFamily: MONO, fontSize: 10.5, letterSpacing: '.06em', color: C.faint, textTransform: 'uppercase' as const }
const tarjeta = { background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta, padding: 18, display: 'flex', flexDirection: 'column' as const }

function Par({ texto, valor, tenue }: { texto: string; valor: string; tenue?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
      <span style={{ color: C.muted }}>{texto}</span>
      <span style={{ fontFamily: MONO, color: tenue ? C.faint : C.ink }}>{valor}</span>
    </div>
  )
}

/** M09 · la tarjeta: total a cobrar, la composición y cómo se paga. */
export function TarjetaDelRecibo({ r }: { r: ReciboDePago }) {
  const adelantos = r.adelanto + r.yaTransferido
  return (
    <div data-testid="mi-recibo-tarjeta" style={{ ...tarjeta, gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={rotulo}>Total a cobrar</div>
        <div data-testid="mi-recibo-total" style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-.02em', fontFamily: MONO }}>$ {miles(r.total)}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 14, borderTop: `1px solid ${C.divisorSuave}` }}>
        <Par texto={`Quincena${r.horas == null ? '' : ` · ${String(r.horas).replace('.', ',')} hs`}`} valor={miles(r.bruto)} />
        <Par texto="Adelantos" valor={adelantos > 0 ? `− ${miles(adelantos)}` : 'ninguno'} tenue={adelantos === 0} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 14, borderTop: `1px solid ${C.divisorSuave}` }}>
        <Par texto="Por banco" valor={miles(r.porBanco)} />
        <Par texto="En efectivo" valor={miles(r.enEfectivo)} />
      </div>
    </div>
  )
}

/** Un renglón que lleva a otra pantalla: «Ver el recibo completo ›», «Descargar el PDF ›». */
export function Enlace({ href, children, cuenta, testid }: { href: string; children: ReactNode; cuenta?: number; testid?: string }) {
  return (
    <Link href={href} data-testid={testid} style={{
      minHeight: 52, background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.control, padding: '0 16px',
      display: 'flex', alignItems: 'center', fontSize: 15, color: C.ink, textDecoration: 'none',
    }}>
      {children}
      {cuenta != null && <span style={{ fontFamily: MONO, fontSize: 12, color: C.faint, marginLeft: 8 }}>{cuenta}</span>}
      <span style={{ marginLeft: 'auto', color: C.tenue, fontSize: 18 }}>›</span>
    </Link>
  )
}

/** M10 · FIRMADO: el recibo ya tiene firma (con el dedo, en papel, o archivado). */
export function ReciboFirmado({ r, anteriores, base }: { r: ReciboDePago; anteriores: number; base: string }) {
  const cuando = r.firmadoEn ?? r.papelSubidoEn
  const como = r.firmadoEn ? 'desde tu teléfono' : 'en papel, con la foto subida'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="recibo-firmado">
      <div style={{ background: C.posFondo, border: `1px solid ${C.posBorde}`, borderRadius: R.tarjeta, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.pos }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: C.pos }}>{r.estado === 'archivado' ? 'Firmado y archivado' : 'Firmado'}</div>
        </div>
        <div style={{ fontSize: 13.5, color: C.inkSuave, lineHeight: 1.5 }}>
          {r.codigo} · quincena {periodoCorto(r.desde, r.hasta)} · $ {miles(r.total)}
        </div>
        {cuando && <div style={{ fontSize: 12.5, color: C.muted }}>{diaHora(cuando)} · {como}</div>}
      </div>
      {r.trazo && (
        <div style={{ ...tarjeta, gap: 12 }}>
          <div style={rotulo}>Tu firma</div>
          <div style={{ height: 96, background: C.quiet, border: `1px solid ${C.divisorSuave}`, borderRadius: R.controlChico, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trazo svg={r.trazo} alto={80} testid="mi-trazo" />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Enlace href={`${base}/completo?pdf=1`} testid="descargar-pdf">Descargar el PDF</Enlace>
        <Enlace href="/mi-informacion/recibos" cuenta={anteriores} testid="recibos-anteriores">Mis recibos anteriores</Enlace>
      </div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
        El firmado queda en tu legajo y ya lo tiene Administración. No hace falta llevar el papel.
      </div>
    </div>
  )
}

/** Lo que el recibo dice cuando no se puede firmar: observado, desactualizado o reemplazado. */
export function ReciboEnEspera({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div data-testid="recibo-en-espera" style={{ background: C.warnFondo, border: `1px solid ${C.warnBorde}`, borderRadius: R.tarjeta, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.warn }}>{titulo}</div>
      <div style={{ fontSize: 13, color: C.inkSuave, lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}
