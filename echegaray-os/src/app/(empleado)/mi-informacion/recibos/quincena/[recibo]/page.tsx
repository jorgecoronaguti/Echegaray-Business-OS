import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { PantallaEmpleado, Seccion } from '@/features/empleado/components/ShellEmpleado'
import { AvisoError } from '@/shared/components/movil/Piezas'
import { C } from '@/shared/components/movil/tokens'
import {
  AccionesDeMiRecibo, MiReciboFirmado,
} from '@/features/empleado/components/MiReciboDeQuincena'
import {
  getMiReciboDeQuincena, periodoCorto, periodoDicho,
} from '@/features/empleado/services/miReciboDeQuincena'
import { estaFirmado } from '@/shared/recibo/ciclo'
import { pesos } from '@/features/empleado/services/recibos'

// M09 · MI RECIBO DE PAGO — lo que la empresa me paga por la quincena, y la firma.
//
// ═══ ESTE ES EL ESLABÓN QUE FALTABA ═══
//
// El recibo que arma Liquidación se sellaba en `recibo_liquidacion` y NO llegaba al teléfono: la pantalla de
// Recibos lee `mi_recibo`, que son los PDF del estudio en Drive. Se pagaba la quincena, se imprimía un papel
// y del otro lado no había nada. Ahora sí llega, y desde acá se firma.
//
// ═══ LO QUE NO DICE EL PAPEL ═══
//
// Nada de blanco ni negro: el papel dice TOTAL de horas, total depositado y total en efectivo (dueño,
// 22/09). Acá se dibujan los mismos renglones sellados, sin agregar ni interpretar. Y NUNCA $ 0 por falta de
// dato: lo que el papel no decía se escribe «no lo decía», que es otra cosa que cero.

export const dynamic = 'force-dynamic'

const cifra = (n: number | null) => (n == null ? null : pesos(n))

export default async function MiReciboDeQuincenaPage({ params }: { params: Promise<{ recibo: string }> }) {
  const { recibo: id } = await params
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')

  const { data: r, error } = await getMiReciboDeQuincena(supabase, id)
  if (error) {
    return (
      <PantallaEmpleado titulo="Mi recibo" volver={{ href: '/mi-informacion/recibos', label: 'Recibos' }}>
        <AvisoError testid="mi-recibo-no-leido">{error}</AvisoError>
      </PantallaEmpleado>
    )
  }
  // NO ES TUYO O NO EXISTE: se contesta igual, y la policy ya lo decidió — no se dice cuál de las dos.
  if (!r) notFound()

  const firmado = estaFirmado(r)

  return (
    <PantallaEmpleado titulo="Mi recibo" sub={periodoCorto(r)}
      volver={{ href: '/mi-informacion/recibos', label: 'Recibos' }}>
      <div data-testid="mi-recibo-quincena" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.linea}`, borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: '.06em', color: C.faint, textTransform: 'uppercase' }}>
              Total a cobrar
            </div>
            {cifra(r.total) ? (
              <div data-testid="mi-recibo-total" style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-.02em', fontFamily: "'IBM Plex Mono', monospace", marginTop: 5 }}>
                {cifra(r.total)}
              </div>
            ) : (
              // NUNCA $ 0: un recibo sin total no dice cero, dice que no lo traía.
              <div data-testid="mi-recibo-sin-total" style={{ fontSize: 15, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
                El recibo no trae un total: preguntale a Administración antes de firmarlo.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 14, borderTop: `1px solid ${C.divisorSuave}` }}>
            <Renglon rotulo={`Quincena${r.horas == null ? '' : ` · ${String(r.horas).replace('.', ',')} hs`}`}
              valor={cifra(r.total)} falta="el recibo no lo decía" />
            <Renglon rotulo="Por banco" valor={cifra(r.banco)} falta="el recibo no lo decía" />
            <Renglon rotulo="En efectivo" valor={cifra(r.efectivo)} falta="el recibo no lo decía" />
          </div>
        </div>

        {/* EL PAPEL ENTERO, tal como se emitió: los mismos renglones sellados que se imprimieron. */}
        <Seccion titulo="El recibo completo">
          <div data-testid="mi-recibo-renglones" style={{ background: C.surface, border: `1px solid ${C.linea}`, borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {r.renglones.horas.map((x, i) => (
              <Renglon key={`h${i}`} rotulo={x.rotulo}
                valor={x.horas == null ? null : `${String(x.horas).replace('.', ',')} h`} falta="sin dato" sub={x.sub} />
            ))}
            {r.renglones.medios.map((x, i) => (
              <Renglon key={`m${i}`} rotulo={x.rotulo} valor={cifra(x.importe ?? null)} falta="sin dato" sub={x.sub} />
            ))}
            <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>
              {`${periodoDicho(r)}${r.codigo ? ` · ${r.codigo}` : ''}`}
            </div>
          </div>
        </Seccion>

        {r.observacion && (
          <div data-testid="mi-recibo-observado" style={{ fontSize: 13, color: C.warn, lineHeight: 1.5 }}>
            {`Avisaste que no coincide: «${r.observacion}». Administración lo está revisando.`}
          </div>
        )}

        {firmado ? <MiReciboFirmado recibo={r} /> : (
          <>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
              Si algo no coincide con lo que trabajaste, se avisa antes de firmar: después de firmar, el
              reclamo se hace por otra vía.
            </div>
            <AccionesDeMiRecibo recibo={r} />
          </>
        )}
      </div>
    </PantallaEmpleado>
  )
}

function Renglon({ rotulo, valor, falta, sub }: {
  rotulo: string; valor: string | null; falta: string; sub?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: sub ? 13 : 14, paddingLeft: sub ? 12 : 0 }}>
      <span style={{ color: C.muted }}>{rotulo}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: valor ? C.ink : C.faint }}>
        {valor ?? falta}
      </span>
    </div>
  )
}
