// LA CASCADA EN DOS BLOQUES — «Presupuestos v5 · entorno xsas», vista Costos y precio.
//
// ═══ POR QUÉ DOS BLOQUES Y NO UNA FILA DE DOCE ESCALONES ═══
//
// `CascadaPrecio` dibuja los doce escalones en una banda horizontal: sirve para VERIFICAR la
// aritmética, y por eso sigue viva en la pantalla de ficha. Acá la pregunta es otra —«¿qué de este
// precio es la obra y qué decidimos nosotros?»— y esa pregunta se contesta separando INGENIERÍA de
// DECISIÓN COMERCIAL. El reparto no se decide acá: lo hace `partirCascada()`, que tiene test.
//
// ═══ EL COEFICIENTE NO SE ESCRIBE ═══
//
// No hay input, ni slider, ni campo editable de coeficiente en ninguna pantalla del módulo
// (REGLAS-DATOS §7). Sale de la cascada, y el bloque lo dice literalmente para que nadie lo busque.
//
// ═══ MARGEN SOBRE VENTA ≠ BENEFICIO SOBRE COSTO ═══
//
// Son dos números distintos y uno es siempre menor que el otro. Ponerlos juntos sin decirlo es la
// forma más común de creer que se está ganando más de lo que se gana.

import { C } from '@/shared/components/canon'
import type { Escalon } from '../services/cascada'
import { escalonesDe } from '../services/cascada'
import { partirCascada } from '../services/vivo'
import { plata, porcentaje, porcentajeDeFraccion } from '../services/formato'
import type { PresupuestoCascada } from '../types'

const ROTULO: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '.08em', color: C.tenue,
}

export function CascadaDeDecision({ p }: { p: PresupuestoCascada }) {
  const { ingenieria, comercial, fiscal } = partirCascada(escalonesDe(p))
  const coef = p.coeficiente_sin_iva

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="cascada-decision">
      <span style={{ ...ROTULO, paddingBottom: 10 }}>INGENIERÍA</span>
      {ingenieria.map((e) => <Paso key={e.clave} e={e} />)}

      <span style={{ ...ROTULO, padding: '22px 0 10px' }}>DECISIÓN COMERCIAL</span>
      {comercial.map((e) => <Paso key={e.clave} e={e} />)}

      <div style={{
        marginTop: 18, display: 'flex', alignItems: 'flex-end', gap: 34, flexWrap: 'wrap',
        borderTop: `1px solid ${C.lineaFuerte}`, paddingTop: 16,
      }}>
        <Derivado
          rotulo="COEFICIENTE SIN IVA · DERIVADO"
          valor={coef === null ? null : coef.toLocaleString('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
          testid="coeficiente-derivado"
        />
        <Derivado
          rotulo="MARGEN REAL SOBRE VENTA"
          valor={porcentaje(p.margen_sobre_precio_pct, 1)}
          testid="margen-sobre-venta"
        />
        <span style={{ flex: 1, minWidth: 240, fontSize: 11.5, color: C.tenue, lineHeight: 1.7, maxWidth: 300 }}>
          El coeficiente no se escribe: sale de la cascada. Margen sobre venta no es lo mismo que
          beneficio sobre costo.
        </span>
      </div>

      {fiscal.length > 0 && (
        // El IVA no es una decisión de la empresa. Va abajo del cierre comercial, sin rótulo de
        // bloque, para que no se lea como una palanca que alguien puede mover.
        <div style={{ marginTop: 18, display: 'flex', gap: 30, flexWrap: 'wrap' }} data-testid="cascada-fiscal">
          {fiscal.map((e) => (
            <span key={e.clave} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ ...ROTULO, fontSize: 9.5 }}>
                {e.rotulo}{e.pct !== null && ` ${porcentajeDeFraccion(e.pct, 'auto')}`}
              </span>
              <span style={{ fontSize: 13, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', color: C.tintaSuave }}>
                {plata(e.monto) ?? 'sin cargar'}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Paso({ e }: { e: Escalon }) {
  const cierra = e.final || e.acumulado
  return (
    <div
      data-escalon={e.clave}
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 74px 140px', gap: 14,
        alignItems: 'center', minHeight: 46,
        borderTop: cierra ? `1px solid ${C.lineaFuerte}` : `1px solid ${C.lineaFila}`,
      }}
    >
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 13, fontWeight: cierra ? 600 : 400, color: C.tinta }}>{e.rotulo}</span>
        <span style={{ fontSize: 11, color: C.tenue, lineHeight: 1.4 }}>{e.subtitulo}</span>
      </span>
      <span style={{ textAlign: 'right', fontSize: 12, fontFamily: 'monospace', color: C.apagado, fontVariantNumeric: 'tabular-nums' }}>
        {e.pct === null ? '' : porcentajeDeFraccion(e.pct, 'auto')}
      </span>
      <span style={{
        textAlign: 'right', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums',
        fontSize: e.final ? 17 : 13.5, fontWeight: cierra ? 600 : 400,
        color: e.monto === null ? C.tenue : C.tinta,
      }}>
        {plata(e.monto) ?? 'sin cargar'}
      </span>
    </div>
  )
}

function Derivado({ rotulo, valor, testid }: { rotulo: string; valor: string | null; testid: string }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={ROTULO}>{rotulo}</span>
      <span
        data-testid={testid}
        style={{
          fontSize: 22, fontWeight: 600, fontFamily: 'monospace', letterSpacing: '-.01em',
          color: valor === null ? C.tenue : C.tinta,
        }}
      >
        {valor ?? 'sin calcular'}
      </span>
    </span>
  )
}
