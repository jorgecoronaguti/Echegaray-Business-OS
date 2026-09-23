import { Estado } from '@/shared/components/ds'
import { TarjetaLista, mono } from '@/shared/components/movil/Piezas'
import { C, diaMes } from '@/shared/components/movil/tokens'
import { rotuloUrgencia, textoCantidad, type Grupo } from '../logica/pedidos'

// MATERIAL EN EL TELÉFONO — lo pedido, para OPERAR: una tarjeta por pedido, sus ítems adentro, el
// estado en una pastilla. No hay filtros ni selector de estado: el jefe mira si llegó y pide lo que
// falta; el estado lo mueve Administración desde la computadora.
//
// Las piezas son las del mockup del teléfono (`shared/components/movil`): tarjeta de radio 14,
// divisor entre filas más claro que el borde, cifra en mono.

export function ListaMaterialTelefono({ grupos, variasObras }: { grupos: Grupo[]; variasObras: boolean }) {
  return (
    <div className="space-y-3" data-testid="lista-material">
      {grupos.map((g) => (
        <TarjetaLista key={g.clave} testid="pedido">
          <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.divisor}` }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {diaMes(g.fecha)}
                {rotuloUrgencia(g.urgencia) ? ` · ${rotuloUrgencia(g.urgencia)}` : ''}
                {variasObras && g.obra_rotulo ? ` · ${g.obra_rotulo}` : ''}
              </div>
            </div>
            <Estado tono={g.lectura.tono} clave={g.lectura.clave}>{g.lectura.label}</Estado>
          </div>
          <ul>
            {g.items.map((it, i) => (
              <li
                key={it.id_pedido}
                data-testid="item"
                style={{
                  minHeight: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '6px 14px',
                  borderBottom: i === g.items.length - 1 ? undefined : `1px solid ${C.divisor}`,
                }}
              >
                <span style={{ ...mono, fontSize: 14, color: C.ink, whiteSpace: 'nowrap' }}>{textoCantidad(it.cantidad, it.unidad)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: C.ink }}>{it.material ?? '—'}</span>
                {g.items.length > 1 && it.lectura.clave !== g.lectura.clave && (
                  <Estado tono={it.lectura.tono} clave={it.lectura.clave}>{it.lectura.label}</Estado>
                )}
              </li>
            ))}
          </ul>
          {g.nota && (
            <div style={{ padding: '8px 14px 10px', fontSize: 12.5, color: C.muted, borderTop: `1px solid ${C.divisor}` }}>{g.nota}</div>
          )}
        </TarjetaLista>
      ))}
    </div>
  )
}
