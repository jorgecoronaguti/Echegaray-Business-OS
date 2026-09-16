// LA ESCALA UOCRA VIGENTE, AL LADO DE «MÁS» (dueño, 16/09/2026: «quiero ver al lado del "más" siempre la última
// escala salarial del CCT de UOCRA que nos corresponde, actualizada»).
//
// Una sola línea, texto secundario de verdad: qué CCT, qué zona, desde cuándo rige y el básico por hora de cada
// categoría. Es un enlace a «Costo y convenio», donde la escala se compara con lo que se paga. En pantalla angosta
// quedan sólo el convenio y el mes; los valores vuelven desde 768 px. Sin escala cargada, lo dice en `warn`: el
// dato que falta es un problema, no un adorno. Server Component: no hay estado ni JavaScript.

import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import type { EscalaVigente as Escala } from '../../../services/escalaUocra'

const pesos = (n: number): string => `$${Math.round(n).toLocaleString('es-AR')}`
const dia = (iso: string | null): string => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')

export function EscalaVigente({ escala, href }: { escala: Escala | null; href: string }) {
  if (!escala) {
    return (
      <span data-testid="escala-uocra" data-estado="sin-cargar" style={{ fontSize: '12px', color: V.warn, whiteSpace: 'nowrap' }}>
        Escala UOCRA sin cargar
      </span>
    )
  }
  const porHora = escala.valores.filter((v) => !v.porMes)
  const sereno = escala.valores.find((v) => v.porMes)
  const titulo = [
    `CCT ${escala.cct} · Zona A (San Juan) · rige desde ${dia(escala.desde)}`,
    ...porHora.map((v) => `${v.categoria}: ${pesos(v.valor)}/h`),
    sereno ? `${sereno.categoria}: ${pesos(sereno.valor)}/mes` : null,
    escala.fuente ? `Fuente: ${escala.fuente}` : null,
    `En la base desde ${dia(escala.cargadoEn)}`,
    'Abrir Costo y convenio',
  ].filter(Boolean).join('\n')
  return (
    <Link href={href} prefetch={false} data-testid="escala-uocra" data-estado="vigente" data-desde={escala.desde} title={titulo}
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 10, minWidth: 0,
        fontSize: '12px', color: V.apagado, textDecoration: 'none', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
      }}>
      <span style={{ color: V.tintaSuave, fontWeight: 600 }}>{`UOCRA ${escala.cct} · ${escala.rige}`}</span>
      {/* SIN `display` EN LÍNEA: un style pisa al `hidden` de la clase y los valores se veían a 390 px (medido 16/09). */}
      <span className="max-[767px]:hidden inline-flex gap-2.5">
        {porHora.map((v) => (
          <span key={v.corto} data-testid={`escala-uocra-${v.corto}`}>
            <span>{v.corto} </span>
            <span style={{ color: V.tinta }}>{pesos(v.valor)}</span>
          </span>
        ))}
        <span style={{ color: V.tenue }}>$/h</span>
      </span>
    </Link>
  )
}
