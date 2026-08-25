// «REGLAS DEL PORTAL» (`31:305`–`31:345`).
//
//   fila  `padding:12px 0`, filo `#EFEEEA`; título 12,5px y detalle 11px; interruptor de 36×20
//
// ═══ LOS TRES INTERRUPTORES ESTÁN DIBUJADOS Y NO SE PUEDEN TOCAR ═══
//
// «Publicar certificados al aprobarlos», «Mostrar el plazo real de la obra» y «Permitir pago
// online» son ajustes POR CLIENTE, y el CONTRATO-28-32 no tiene tabla donde guardarlos:
// `cliente_acceso` guarda permisos por persona, no reglas del cliente.
//
// Dibujar los tres encendidos —como el mockup, que muestra un ejemplo— sería afirmarle al admin que
// el portal se comporta de una manera que nadie configuró. Se dibujan apagados, sin manija, con la
// razón escrita: el bloque existe, se ve lo que va a haber, y no miente sobre lo que hay.
//
// LO QUE FALTA PARA QUE FUNCIONEN: una tabla `cliente_portal_regla` (cliente_id, clave, valor) con
// RLS de administración. Queda declarado para back-28-32.

import { C } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { Interruptor, TituloBloque } from '../canon/Piezas'

const REGLAS = [
  {
    titulo: 'Publicar certificados al aprobarlos internamente',
    detalle: 'antes de eso el cliente no los ve',
  },
  {
    titulo: 'Mostrar el plazo real de la obra',
    detalle: 'el cliente vería el desvío contra el plan',
  },
  {
    titulo: 'Permitir pago online',
    detalle: 'si está apagado solo informan la transferencia',
  },
]

export function ReglasDelPortal() {
  return (
    <div data-testid="reglas-portal">
      <TituloBloque icono={<Ico d={P.escudo} s={15} />} titulo="Reglas del portal" conFilo />
      {REGLAS.map((r, k) => (
        <div
          key={r.titulo}
          style={{
            display: 'flex', alignItems: 'center', gap: '11px', padding: '12px 0',
            borderBottom: k === REGLAS.length - 1 ? undefined : `1px solid ${C.bordeFila}`,
            opacity: 0.6,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '12.5px', color: C.tinta }}>{r.titulo}</div>
            <div style={{ fontSize: '11px', color: C.tenue, marginTop: '1px' }}>{r.detalle}</div>
          </div>
          <Interruptor encendido={false} etiqueta={`${r.titulo} · todavía sin fuente`} grande />
        </div>
      ))}
      <div style={{ fontSize: '11px', color: C.tenue, marginTop: '10px', lineHeight: 1.5 }}>
        Las tres reglas todavía no tienen dónde guardarse: falta la tabla que las sostiene. Se ven
        apagadas para no afirmar una configuración que nadie eligió.
      </div>
    </div>
  )
}
