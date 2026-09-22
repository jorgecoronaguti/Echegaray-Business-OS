// LO QUE SE LE DEBE, ARRIBA DE TODO Y SIN UN CLIC MÁS — «necesito q dentro de la ficha de cada
// proveedor pueda ver si tengo monto adeudado y cuanto» (dueño, 22/09/2026).
//
// ═══ NO CALCULA NADA ═══
//
// Recibe lo que `deudaEnLaFicha` tradujo de la fila que arma `deudaProveedores` — la MISMA regla y
// la misma fuente que la sección «A quién le debo». Acá sólo se elige qué se lee primero y de qué
// color: rojo lo VENCIDO (plata que ya había que pagar), tinta lo POR VENCER (un compromiso, no un
// problema) y ámbar lo SIN FECHA (se debe y no se sabe cuándo, que no se puede planificar).
//
// ═══ SIN CAJA, COMO EL RESTO DE LA FICHA v2 ═══
//
// Criterio 3 del patrón: filos, tipografía y números tabulares; el color sólo en la cifra. Va
// pegado debajo de la tira de cifras porque es la explicación del número grande que está arriba —
// «Adeudado» dice cuánto, esta línea dice de qué está hecho y desde cuándo.
//
// ═══ EL CERO QUE NO EXISTE ═══
//
// Los tres estados se dibujan distinto a propósito. «Al día» es una afirmación; «no pude mirar» es
// otra cosa y lleva su motivo. Lo que no hay es un `$ 0` mudo, que es lo único que las dos podrían
// parecer a la vez.

import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import { plataCentavos } from '@/shared/utils/format'
import { diaMesAnioISO } from '@/shared/utils/fecha'
import type { DeudaDeLaFicha } from '../../services/deudaEnLaFicha'

const LINEA = { fontSize: '12px', display: 'flex', alignItems: 'baseline', gap: 6 } as const
const MONO = 'font-mono tabular-nums'
const NOTA = { fontSize: '11px', lineHeight: 1.6, color: V.tenue, marginTop: 6 } as const

function Tramo({ rotulo, monto, cola, color, title, testid }: {
  rotulo: string
  monto: number
  /** Lo que sigue al importe: «desde el 12/08/26 · 41 días». */
  cola?: string | null
  color: string
  title?: string
  testid: string
}) {
  return (
    <span style={{ ...LINEA, color }} title={title} data-testid={testid}>
      <span style={{ color: V.tenue, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {rotulo}
      </span>
      <span className={MONO} style={{ fontWeight: 600 }}>{plataCentavos(monto)}</span>
      {cola && <span style={{ color: V.tenue }}>{cola}</span>}
    </span>
  )
}

export function DeudaDelProveedor({ deuda, detalleHref, testid = 'deuda-del-proveedor' }: {
  deuda: DeudaDeLaFicha
  /** «A quién le debo» con su fila abierta. `null` = no hay detalle que abrir. */
  detalleHref: string | null
  testid?: string
}) {
  const hoy = diaMesAnioISO(deuda.hoyISO)
  if (deuda.estado === 'sin-leer') {
    return (
      <div style={{ padding: '10px 20px 0' }} data-testid={testid} data-estado="sin-leer">
        <p style={{ fontSize: '12px', color: V.warn, margin: 0 }}>
          {deuda.motivo}
        </p>
      </div>
    )
  }
  if (deuda.estado === 'al-dia') {
    return (
      <div style={{ padding: '10px 20px 0' }} data-testid={testid} data-estado="al-dia">
        <p style={{ fontSize: '12px', color: V.apagado, margin: 0 }}>
          <strong style={{ color: V.tinta, fontWeight: 600 }}>Al día</strong>
          {` · ninguna compra suya tiene saldo pendiente al ${hoy}.`}
          {deuda.aFavor < 0 && ` Tiene ${plataCentavos(-deuda.aFavor)} a favor en notas de crédito sin aplicar.`}
        </p>
      </div>
    )
  }
  return (
    <div style={{ padding: '10px 20px 0' }} data-testid={testid} data-estado="debe">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 26, rowGap: 6 }}>
        {deuda.vencido > 0 && (
          <Tramo
            rotulo="Vencido" monto={deuda.vencido} color={V.neg} testid="deuda-vencido"
            cola={deuda.desde
              ? `desde el ${diaMesAnioISO(deuda.desde)}${deuda.diasDeAtraso !== null ? ` · ${deuda.diasDeAtraso} ${deuda.diasDeAtraso === 1 ? 'día' : 'días'}` : ''}`
              : null}
            title={`Saldo con fecha prevista anterior o igual al ${hoy}: ya había que pagarlo.`}
          />
        )}
        {deuda.porVencer > 0 && (
          <Tramo
            rotulo="Por vencer" monto={deuda.porVencer} color={V.tinta} testid="deuda-por-vencer"
            cola={deuda.proximo ? `próximo ${diaMesAnioISO(deuda.proximo)}` : null}
            title={`Fecha prevista posterior al ${hoy}: está comprometido, no es exigible hoy.`}
          />
        )}
        {deuda.sinFecha > 0 && (
          <Tramo
            rotulo="Sin fecha" monto={deuda.sinFecha} color={V.warn} testid="deuda-sin-fecha"
            title="Se debe, pero la fila de Compras no tiene fecha prevista: no está vencido, está sin fecha."
          />
        )}
        {deuda.aFavor < 0 && (
          <Tramo
            rotulo="Notas de crédito" monto={deuda.aFavor} color={V.pos} testid="deuda-a-favor"
            title="Notas de crédito suyas todavía abiertas en la pestaña Compras. Restan: es plata a favor de la empresa, no algo que haya que pagar."
          />
        )}
        {detalleHref && (
          <Link
            href={detalleHref} prefetch={false} data-testid="deuda-ver-detalle"
            style={{ fontSize: '12px', fontWeight: 500, color: V.tinta, textDecoration: 'underline' }}
          >
            Ver comprobante por comprobante →
          </Link>
        )}
      </div>

      <p style={NOTA} data-testid="deuda-origen">
        {`Al ${hoy}, del saldo pendiente de sus comprobantes en la pestaña Compras — la misma cuenta `}
        que la sección «A quién le debo».
      </p>

      {deuda.truncado && (
        <p style={{ ...NOTA, color: V.warn }} data-testid="deuda-truncada">
          La lista de compras con saldo llegó al tope de lectura: lo que se muestra puede quedar
          corto. El total de esta ficha no se puede dar por completo.
        </p>
      )}
      {deuda.cotejo && (
        <p style={{ ...NOTA, color: V.warn }} data-testid="deuda-no-cierra">{deuda.cotejo}</p>
      )}
    </div>
  )
}
