// 15 · EL PRESUPUESTO VIVO — la cola de atención y el gate de congelado (§22, §23, §24).
//
// ═══ QUÉ REEMPLAZA ═══
//
// La pantalla tenía tres contadores sueltos —«sin análisis», «sin cómputo», «subcontratadas sin
// precio»— que decían CUÁNTAS filas tienen un hueco pero no cuál mirar primero ni cuál impide
// mandar el presupuesto. Esto es la misma información ordenada por lo que el motor decidió: primero
// lo que bloquea, después por materialidad. La regla de qué bloquea NO vive acá (§23: no UI-only):
// la decide `atencion.bloquea()` con el costo total a la vista, que es la única escala en la que
// «material» significa algo.
//
// ═══ EL GATE DICE POR QUÉ NO ═══
//
// «Congelar» deshabilitado sin motivo obliga a adivinar qué falta. El gate devuelve
// `{ready, blocking_issues, warnings, porQue}` y acá se muestra entero. Un botón mudo es un control
// que no se puede resolver leyéndolo.
//
// ═══ LO QUE ESTA COLA NO VE, LO DICE ═══
//
// Sale de las FILAS de la base, no de las once etapas del orquestador —que necesitan documentos y
// composiciones, y son otro frente—. `parcial` viaja desde el motor hasta acá y se escribe en
// pantalla. Publicar «no hay nada bloqueando» sobre una cola que no miró la mitad del pipeline sería
// exactamente el defecto que el §24 prohíbe.

import { C, TARJETA, millones } from '@/shared/components/canon'
import type { Cola, Gate } from '../services/cotizadorPuente.ts'

/** La traducción de los estados de dominio a lo que se lee. El modelo es de dominio; la UI traduce. */
const ROTULO: Record<string, string> = {
  FALTA_DATO: 'Falta un dato',
  CONFLICTO: 'Conflicto',
  AMBIGUO: 'Ambiguo',
  SIN_PRECIO: 'Sin precio',
  PRECIO_DESACTUALIZADO: 'Precio viejo',
  SUBCONTRATO_SIN_PRECIO: 'Subcontrato sin precio',
  OUTLIER_PENDING: 'Cambio atípico sin resolver',
  COMMERCIAL_DECISION: 'Decisión comercial',
  UNIDAD_INCOMPATIBLE: 'Unidad incompatible',
  EXCLUSION_CON_COMPUTO: 'Excluido pero computado',
  SIN_PARTIDA: 'Sin partida',
  CANTIDAD_CRITICA_AUSENTE: 'Sin cantidad',
  FUGA_ENTRE_CLIENTES: 'Dato de otro cliente',
  SIN_PRECIO_CALCULABLE: 'Sin precio calculable',
}

const COLOR: Record<string, string> = {
  BLOQUEANTE: C.neg, ALTA: C.warn, MEDIA: C.info, BAJA: C.tenue,
}

export function ColaDeAtencion({ cola, gate, parcial }: {
  cola: Cola
  gate: Gate
  /** La cola sale de las filas y no de las once etapas: se dice, no se calla. */
  parcial: boolean
}) {
  return (
    <section style={TARJETA} data-testid="cola-atencion">
      <header style={{
        background: C.superficieTenue, borderBottom: `1px solid ${C.lineaBloque}`,
        padding: '9px 14px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
      }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: C.tinta }}>
          Qué falta {cola.total > 0 && <span style={{ color: C.tenue, fontWeight: 400 }}>· {cola.total}</span>}
        </span>
        <span
          style={{ fontSize: 11, color: gate.ready ? C.pos : C.neg }}
          data-testid="gate-freeze" data-ready={gate.ready ? '1' : '0'}
        >
          {gate.ready ? 'Listo para congelar' : `${gate.blocking_issues.length} bloqueo(s)`}
        </span>
      </header>

      <div style={{ padding: '10px 14px' }}>
        {/* EL MOTIVO DEL GATE, ENTERO. No es decoración: es lo que convierte un «no» en una tarea. */}
        <p style={{ margin: 0, fontSize: 12, color: gate.ready ? C.pos : C.tintaSuave, lineHeight: 1.45 }} data-testid="gate-porque">
          {gate.porQue}
        </p>

        {cola.plataEnRiesgo !== null && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: C.tintaSuave, fontVariantNumeric: 'tabular-nums' }}>
            Plata conocida que cuelga de un bloqueo: <strong>{millones(cola.plataEnRiesgo)}</strong>
          </p>
        )}
        {cola.bloqueantesSinMedir > 0 && (
          // §30: la métrica honesta no es tener menos NULL, es tener menos incertidumbre NO
          // DECLARADA. Un hueco sin medir no se puede llamar chico.
          <p style={{ margin: '4px 0 0', fontSize: 11.5, color: C.warn }} data-testid="bloqueos-sin-medir">
            {cola.bloqueantesSinMedir} bloqueo(s) sin medir: no se sabe cuánta plata cuelga de ellos.
          </p>
        )}

        {cola.issues.length === 0 ? (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: C.apagado }} data-testid="cola-vacia">
            Ningún hueco detectable desde las filas del presupuesto.
          </p>
        ) : (
          <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
            {cola.issues.map((i) => (
              <li
                // LA CLAVE ES EL TIPO **Y** LA FILA. Dos correcciones, las dos medidas:
                //
                //  · QA visual 29/08: era `${i.type}-${i.entity}` y `entity` cae a la descripción
                //    cuando la partida no tiene código — dos partidas iguales, misma clave.
                //  · Auditoría delta, el mismo día: pasó a ser sólo `partidaId`, y volvió a
                //    colisionar por el otro lado: UNA fila puede tener DOS huecos a la vez
                //    (cantidad ausente + subcontrato sin precio) y los dos daban `row-1`.
                //
                // Hacen falta los dos: qué le falta y a cuál. El índice del array habría callado a
                // React sin identificar nada, en las dos vueltas.
                key={`${i.type}-${i.evidence?.partidaId ?? i.entity}`}
                data-testid="issue-cola" data-tipo={i.type} data-bloquea={i.bloquea ? '1' : '0'}
                style={{ borderTop: `1px solid ${C.lineaTenue}`, padding: '7px 0' }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{
                    fontSize: 10, letterSpacing: '.04em', color: COLOR[i.severity] ?? C.tenue,
                    border: `1px solid ${C.linea}`, borderRadius: 999, padding: '1px 7px', whiteSpace: 'nowrap',
                  }}>
                    {ROTULO[i.type] ?? i.type}
                  </span>
                  <span style={{ fontSize: 12.5, color: C.tinta, fontWeight: 500 }}>{i.entity}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.tenue, fontVariantNumeric: 'tabular-nums' }}>
                    {/* `impact === null` es «no se midió», nunca $0: un cero lo mandaría al fondo de
                        la cola, que es exactamente donde no tiene que estar. */}
                    {i.impact === null ? 'sin medir' : millones(i.impact)}
                  </span>
                </div>
                {i.detalle && (
                  <p style={{ margin: '2px 0 0', fontSize: 11.5, color: C.apagado, lineHeight: 1.4 }}>{i.detalle}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {parcial && (
          <p style={{ marginTop: 10, fontSize: 11, color: C.tenue, lineHeight: 1.4 }} data-testid="cola-parcial">
            Esto es lo que se ve desde las filas del presupuesto. El cómputo, el alcance y los precios
            de la documentación los revisa el orquestador de once etapas, que todavía no corre desde
            esta pantalla: puede haber huecos que acá no figuran.
          </p>
        )}
      </div>
    </section>
  )
}
