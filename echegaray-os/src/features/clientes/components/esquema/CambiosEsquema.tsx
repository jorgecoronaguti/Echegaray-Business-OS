// «CAMBIOS DEL ESQUEMA» (`32:503`–`32:540`).
//
//   fila     `padding:11px 0`, filo `#EFEEEA` (la última sin filo)
//   cuándo   mono 11px `#91918B`, ancho fijo 44px — «hoy» el mismo día, «20/08» antes
//   qué      12px `#1F1F1E`; debajo, el detalle en `#B54708` si todavía no lo vio el cliente
//
// LA HISTORIA SALE DE LAS REPROGRAMACIONES QUE CADA PAGO YA GUARDA. No hay tabla de auditoría del
// esquema, y reconstruir la historia desde el estado actual daría una lista que nadie escribió: si
// un pago no registró de dónde venía, acá no aparece — y eso es la verdad, no un bloque vacío.

import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { TituloBloque, Vacio } from '../canon/Piezas'
import { diaMes } from '../../services/cobranzaFormato'
import { cambiosDelEsquema } from '../../services/reglasEsquema'
import type { PagoEsquema } from '../../types/cobranzas'

export function CambiosEsquema({ pagos, hoy }: { pagos: PagoEsquema[]; hoy: string }) {
  const cambios = cambiosDelEsquema(pagos)
  return (
    <div data-testid="cambios-esquema">
      <TituloBloque icono={<Ico d={P.historial} s={15} />} titulo="Cambios del esquema" conFilo />
      {cambios.map((c, k) => (
        <div
          key={`${c.at}-${c.texto}`}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '11px', padding: '11px 0',
            borderBottom: k === cambios.length - 1 ? undefined : `1px solid ${C.bordeFila}`,
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue, width: '44px', flexShrink: 0 }}>
            {c.at.slice(0, 10) === hoy ? 'hoy' : diaMes(c.at.slice(0, 10))}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '12px', color: C.tinta }}>{c.texto}</div>
            <div style={{
              fontSize: '11px', marginTop: '1px', color: c.publicado ? C.tenue : C.warn,
            }}>{c.detalle}</div>
            {/* EL MOTIVO SE PIDE HASTA QUE ESTÉ. El movimiento se guarda sin él —el hecho no puede
                esperar a la explicación— pero un historial que no distingue «la chapa entró tarde»
                de «nadie dijo por qué» no sirve para volver a cotizarle a ese cliente. */}
            <div
              data-testid={c.motivo ? undefined : 'cambio-sin-motivo'}
              style={{ fontSize: '11.5px', marginTop: '1px', color: c.motivo ? C.tenue : C.warn }}
            >
              {c.motivo ?? 'sin motivo cargado'}
            </div>
          </div>
        </div>
      ))}
      {cambios.length === 0 && (
        <Vacio testid="cambios-vacio">
          Todavía no se movió ninguna fecha de este esquema.
        </Vacio>
      )}
    </div>
  )
}

/**
 * «AVISO AL CLIENTE» — cuántos días antes se le avisa cada cobro que ya vio.
 *
 * ═══ POR QUÉ SÓLO LOS PUBLICADOS ═══
 *
 * El aviso sale por el portal y por mail sobre un pago que el cliente YA tiene a la vista. Listar
 * acá los que nunca se publicaron prometería un mail que no se va a mandar, y esconde el aviso que
 * sí falta configurar entre diez filas que no corresponden.
 *
 * `aviso_dias` NULL es «sin aviso configurado» y va apagado, no en ámbar: no avisar es una
 * decisión legítima —hay clientes a los que se les llama— y no bloquea el cobro.
 */
export function AvisosAlCliente({ pagos }: { pagos: PagoEsquema[] }) {
  const publicados = pagos.filter((p) => p.visible_portal && p.publicado_at != null)
  if (publicados.length === 0) return null
  return (
    <div data-testid="avisos-al-cliente">
      <TituloBloque icono={<Ico d={P.mail} s={15} />} titulo="Aviso al cliente" conFilo />
      {publicados.map((p, k) => (
        <div
          key={p.id}
          style={{
            display: 'flex', alignItems: 'baseline', gap: '10px', padding: '9px 0',
            borderBottom: k === publicados.length - 1 ? undefined : `1px solid ${C.bordeFila}`,
          }}
        >
          <span style={{ fontSize: '12px', color: C.tinta, minWidth: 0, flex: 1 }}>{p.concepto}</span>
          <span
            data-testid={`aviso-${p.id}`}
            style={{ fontSize: '12px', color: p.aviso_dias == null ? C.tenue : C.tintaSuave, flexShrink: 0 }}
          >
            {p.aviso_dias == null ? 'sin aviso configurado' : `${p.aviso_dias} días antes`}
          </span>
        </div>
      ))}
    </div>
  )
}
