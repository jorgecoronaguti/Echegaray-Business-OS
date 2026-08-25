// 17 · SOLAPA HISTORIAL — qué aprendimos, qué versiones hubo y dónde se usó.
//
// El canónico dibuja tres solapas (Resumen · Composición · Historial) y no detalla el contenido de
// esta última. Acá entra lo que el panel anterior tenía repartido en Esfuerzo, Versiones y Uso: son
// las tres respuestas a «qué pasó con esta tarea», y ninguna se tira por reducir de seis solapas a
// tres. El orden es el de la pregunta: primero la evidencia, después lo que se decidió con ella, y
// al final dónde está puesta hoy.
//
// `Secuencia` vive en este archivo pero se dibuja en **Composición**: cómo se ejecuta la tarea es
// parte de de qué está hecha, no de su historia. Está acá y no en `FichaTarea` sólo para que ese
// archivo no pase de 500 líneas.

import { C } from '@/shared/components/canon'
import { Aviso } from '@/shared/components/ds'
import type { FichaTarea as Ficha } from '../types'
import { fechaCorta, numero, pesosCierran, sumaDePesos } from '../services/reglas'
import { SolapaRendimiento } from './SolapaRendimiento'
import { FILA_PANEL, Linea, Seccion } from './panel'

export function SolapaHistorial({ ficha }: { ficha: Ficha }) {
  return (
    <div data-testid="historial-tarea">
      {/* LA CADENA DEL ESFUERZO SIN SU DECISIÓN: el formulario de aceptar/descartar vive en el
          Resumen, donde el canónico pone la sugerencia. Dos copias del mismo formulario en una
          ficha son dos maneras de hacer lo mismo, y la segunda es la que nadie prueba. */}
      <SolapaRendimiento ficha={ficha} conDecision={false} />

      <Seccion titulo="Versiones del análisis">
        {ficha.versiones.length === 0 ? (
          <Linea>Esta tarea tipo todavía no tiene ningún análisis cargado.</Linea>
        ) : (
          ficha.versiones.map((v) => (
            <div key={v.id} style={FILA_PANEL}>
              <span className="font-mono tabular-nums" style={{ fontSize: '11px', color: C.tenue, width: 52, flexShrink: 0 }}>
                {fechaCorta(v.creado_en) ?? 'sin fecha'}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: '12px', color: C.tinta }}>
                  Versión {v.version}{v.vigente ? ' · vigente' : ''}
                </span>
                <span style={{ display: 'block', fontSize: '10.5px', color: C.apagado, marginTop: 1 }}>
                  {v.motivo ?? 'sin motivo declarado'}
                </span>
              </span>
              <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: C.tintaSuave, flexShrink: 0 }}>
                {numero(v.hs_unitarias, 2) ?? '—'}
              </span>
            </div>
          ))
        )}
      </Seccion>

      <Seccion titulo="Dónde se usó">
        {ficha.uso.length === 0 ? (
          <Linea>
            Ninguna obra usa esta tarea tipo todavía. Se vinculan al convertir un presupuesto en plan de obra.
          </Linea>
        ) : (
          ficha.uso.map((u, i) => (
            <div key={`${u.obra_id}-${i}`} style={FILA_PANEL}>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: '12px', color: C.tinta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.obra_nombre}
                </span>
                <span style={{ display: 'block', fontSize: '10.5px', color: C.tenue, marginTop: 1 }}>
                  {[u.referencia, u.estado].filter(Boolean).join(' · ') || 'sin referencia'}
                </span>
              </span>
              <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: C.tintaSuave, flexShrink: 0 }}>
                {u.cantidad == null ? 'sin cantidad' : `${numero(u.cantidad, 2)} ${u.unidad ?? ''}`}
              </span>
            </div>
          ))
        )}
      </Seccion>
    </div>
  )
}

// ═══ SECUENCIA — se dibuja dentro de Composición ═══════════════════════════════════════════════

export function Secuencia({ ficha }: { ficha: Ficha }) {
  const p = ficha.plantilla
  if (!p) {
    return (
      <Seccion titulo="Cómo se ejecuta">
        <Linea>
          Esta tarea tipo no tiene plantilla de secuencia asignada: se mide por cantidad, no por pasos.
        </Linea>
      </Seccion>
    )
  }
  const suma = sumaDePesos(p.pasos)
  const cierra = pesosCierran(p.pasos)
  return (
    <Seccion titulo={`Cómo se ejecuta · ${p.nombre}`}>
      <div data-testid="secuencia-tarea">
        {p.pasos.map((paso) => (
          <div key={paso.orden} style={FILA_PANEL}>
            <span className="font-mono tabular-nums" style={{ fontSize: '10.5px', color: C.tenue, width: 14, flexShrink: 0 }}>
              {paso.orden}
            </span>
            <span style={{ minWidth: 0, flex: 1, fontSize: '12px', color: C.tinta }}>{paso.nombre}</span>
            {paso.tiempo_tecnico && (
              <span style={{ fontSize: '10.5px', color: C.warn, whiteSpace: 'nowrap', flexShrink: 0 }}>
                no comprimible{paso.dias_tecnicos != null ? ` · ${numero(paso.dias_tecnicos, 0)} d` : ''}
              </span>
            )}
            <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: C.tintaSuave, width: 42, textAlign: 'right', flexShrink: 0 }}>
              {numero(paso.peso, 0)} %
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 8 }}>
          <span style={{ fontSize: '12px', color: C.tintaSuave }}>Suma</span>
          <span className="font-mono tabular-nums" style={{ fontSize: '12.5px', fontWeight: 600, color: cierra ? C.pos : C.neg }}>
            {numero(suma, 0)} %
          </span>
        </div>
        {/* Si no cierran en 100, marcar todos los pasos NO daría 100 % de avance. Se dice. */}
        {!cierra && (
          <div style={{ marginTop: 8 }}>
            <Aviso tono="neg" titulo="Los pesos no cierran en 100">
              Marcar todos los pasos daría {numero(suma, 0)} % de avance, no 100 %.
            </Aviso>
          </div>
        )}
        {p.se_repite_por?.length ? (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: C.tenue }}>Se repite por</span>
            {p.se_repite_por.map((r) => (
              <span key={r} style={{ fontSize: '11.5px', color: C.apagado, border: `1px solid ${C.linea}`, borderRadius: 6, padding: '2px 8px' }}>
                {r}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Seccion>
  )
}
