// LO QUE SE LE ESTÁ PAGANDO POR HORA, ARRIBA DEL TODO. Dueño, 15/09/2026.
//
// ═══ POR QUÉ NO SON TRES TARJETAS ═══
//
// Regla del dueño: *«no tarjetas por cada dato»*, *«casi ninguna sombra»*. Tres números con su
// rótulo chico arriba, separados por aire, en la misma tipografía y el mismo ritmo que la tira de
// cifras que ya vive dos bloques más abajo (`CifrasDeFicha`): la jerarquía la dan el tamaño y el
// espacio, no un borde.
//
// ═══ Y POR QUÉ EL HISTORIAL ES UN `<details>` ═══
//
// *«no párrafos explicativos permanentes»*: el historial de tarifas interesa una vez cada tanto y
// clavarlo debajo del número lo convierte en ruido permanente. Un `<details>` nativo lo despliega
// sin una línea de JavaScript —esto es un componente de servidor— y no mueve nada de lo que está
// arriba: lo que se abre, se abre hacia abajo.
//
// LA REGLA NO ESTÁ ACÁ: este archivo pinta lo que `valorHoraDelLegajo.ts` ya armó. Ni una cuenta,
// ni un formato de moneda, ni una decisión sobre qué decir cuando falta un dato.

import { V } from '@/shared/components/v2/patron'
import type { DatoDelRotulo, RotuloValorHora } from '../services/valorHoraDelLegajo'

const COLOR_TONO = { normal: V.tinta, falta: V.tenue, warn: V.warn } as const

const testidDe = (rotulo: string): string =>
  rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** Un número de la tira: rótulo en versalitas, el valor a 19px mono, y el detalle chico debajo. */
function Dato({ d }: { d: DatoDelRotulo }) {
  const hay = d.valor !== null
  return (
    <div
      title={d.titulo ?? undefined}
      data-testid={`vh-${testidDe(d.rotulo)}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}
    >
      <span
        style={{
          fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em',
          color: V.tenue, whiteSpace: 'nowrap',
        }}
      >
        {d.rotulo}
      </span>
      <span
        className="font-mono tabular-nums"
        style={{
          // El valor ausente baja a 13px: un «sin permiso» a 19px compite con el número que sí está.
          fontSize: hay ? '19px' : '13px', fontWeight: 600,
          color: hay ? COLOR_TONO[d.tono] : COLOR_TONO[d.tono === 'normal' ? 'falta' : d.tono],
          letterSpacing: '-.01em', whiteSpace: 'nowrap',
        }}
      >
        {hay ? d.valor : (d.falta ?? 'sin dato')}
      </span>
      {d.detalle && (
        <span style={{ fontSize: '11px', color: V.apagado }}>{d.detalle}</span>
      )}
    </div>
  )
}

/**
 * LA TIRA DE $/H DEL LEGAJO.
 *
 * `error` es lo que NO se pudo leer. Va debajo y en su color: una lectura que falló no puede
 * dibujarse como un dato ausente, que diría que nadie lo cargó.
 */
export function ValorHoraDelLegajo({ rotulo, error, testid = 'valor-hora-legajo' }: {
  rotulo: RotuloValorHora
  error?: string | null
  testid?: string
}) {
  return (
    <div data-testid={testid} style={{ padding: '18px 20px 0' }}>
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 34,
          flexWrap: 'wrap', rowGap: 14,
        }}
      >
        <Dato d={rotulo.pactado} />
        <Dato d={rotulo.recibo} />
        <Dato d={rotulo.piso} />
      </div>

      {rotulo.hayHistorial && (
        <details data-testid="vh-historial" style={{ marginTop: 10 }}>
          <summary
            style={{
              fontSize: '11px', color: V.apagado, cursor: 'pointer',
              width: 'fit-content', listStyle: 'revert',
            }}
          >
            historial
          </summary>
          <ol
            style={{
              margin: '8px 0 0', padding: 0, listStyle: 'none',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {rotulo.historial.map((f) => (
              <li
                key={f.desde}
                title={f.origen ? `origen: ${f.origen}` : undefined}
                style={{
                  display: 'flex', alignItems: 'baseline', gap: 16, padding: '5px 0',
                  borderTop: `1px solid ${V.lineaFila}`, fontSize: '12px',
                }}
              >
                <span className="font-mono tabular-nums" style={{ color: V.tenue, minWidth: 78 }}>{f.desde}</span>
                <span className="font-mono tabular-nums" style={{ color: V.tinta, fontWeight: 600 }}>{f.valor}</span>
                {/* SIN VARIACIÓN NO SE ESCRIBE UN 0 %: la primera tarifa no subió ni bajó, no tenía
                    contra qué. */}
                {f.variacion && <span style={{ color: V.apagado }}>{f.variacion}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}

      {error && (
        <p data-testid="vh-error" style={{ margin: '10px 0 0', fontSize: '11px', color: V.warn }}>
          No pude leer {error}
        </p>
      )}
    </div>
  )
}
