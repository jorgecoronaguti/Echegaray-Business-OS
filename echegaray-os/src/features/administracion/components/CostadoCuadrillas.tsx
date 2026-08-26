// 21 v2 · EL COSTADO DE «CUADRILLAS Y HH» — `21 · Cuadrillas y HH v2.dc.html` (líneas 140-163).
//
// Dos bloques y un verbo: a dónde fueron las HH del período, y quién del plantel no está en ninguna
// cuadrilla. Los dos leen lo que la página YA leyó —el mismo agrupado que alimenta la columna HH de
// la tabla y la misma consulta del pool—, así que no puede haber un total del costado que discrepe
// con el de la lista.
//
// LAS BARRAS SON PROPORCIÓN CONTRA LA OBRA QUE MÁS HH TIENE, no contra un tope: comparan entre sí y
// no contra un plan. Por eso ninguna dice un porcentaje.

import Link from 'next/link'
import { RotuloPanel, V } from '@/shared/components/v2/patron'
import { BarraDeCostado } from '@/shared/components/v2/segundoNivel'
import type { SinCuadrilla } from '../types'

const horas = (n: number) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })} HH`

export function CostadoCuadrillas({ porObra, ventana, sueltos, sinLeerPool, hrefPool, fueraDeCuadrilla }: {
  /** Ordenado de más a menos. `nombre` en `null` = el registro no traía obra. */
  porObra: { obraId: string | null; nombre: string | null; horas: number }[] | null
  /** Las fechas del período, a la vista: un total sin ventana declarada no se verifica contra nada. */
  ventana: string
  sueltos: SinCuadrilla[]
  /** `true` cuando la consulta del pool falló. Una lista vacía por error NO es «no hay nadie suelto». */
  sinLeerPool: boolean
  hrefPool: string
  /** Personas con HH en el período que no están en ninguna cuadrilla visible. Explica el resto. */
  fueraDeCuadrilla: number | null
}) {
  const tope = porObra?.reduce((a, o) => Math.max(a, o.horas), 0) ?? 0

  return (
    <>
      <RotuloPanel>HH del período por obra</RotuloPanel>
      {porObra === null && (
        <p style={{ fontSize: '12px', color: V.tenue }} data-testid="hh-por-obra-sin-leer">
          No pude leer las horas del período. No es que no se haya trabajado.
        </p>
      )}
      {porObra?.length === 0 && (
        <p style={{ fontSize: '12px', color: V.tenue }} data-testid="hh-por-obra-vacio">
          Ningún parte diario cayó en {ventana}.
        </p>
      )}
      {porObra?.map((o) => (
        <div
          key={o.obraId ?? 'sin-obra'} data-testid="hh-obra"
          style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', borderBottom: `1px solid ${V.lineaPanel}` }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="truncate" style={{ fontSize: '12px', color: o.nombre ? V.tinta : V.warn }}>
              {o.nombre ?? 'Sin obra imputada'}
            </span>
            <span
              className="font-mono tabular-nums"
              style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.tinta, flexShrink: 0 }}
            >
              {horas(o.horas)}
            </span>
          </div>
          <BarraDeCostado
            fraccion={tope === 0 ? 0 : o.horas / tope}
            color={o.nombre ? V.inerte : '#E8C79A'}
          />
        </div>
      ))}
      {porObra && porObra.length > 0 && (
        <p style={{ fontSize: '11px', color: V.tenue, marginTop: 8, lineHeight: 1.6 }} data-testid="pie-hh-obra">
          {ventana}
          {fueraDeCuadrilla != null && fueraDeCuadrilla > 0 && (
            ` · ${fueraDeCuadrilla} ${fueraDeCuadrilla === 1 ? 'persona' : 'personas'} con horas fuera de toda cuadrilla`
          )}
        </p>
      )}

      <div style={{ marginTop: 22 }}>
        <RotuloPanel cuenta={sinLeerPool ? undefined : sueltos.length}>Sin cuadrilla</RotuloPanel>
      </div>
      {sinLeerPool
        ? (
            <p style={{ fontSize: '12px', color: V.tenue }} data-testid="pool-sin-leer">
              No pude leer el plantel. Esta pantalla no puede afirmar que esté todo encuadrado.
            </p>
          )
        : sueltos.length === 0
          ? (
              <p style={{ fontSize: '12px', color: V.tenue }} data-testid="pool-vacio">
                Todo el plantel en la empresa está en alguna cuadrilla.
              </p>
            )
          : sueltos.map((s) => (
              <div
                key={s.id} data-testid="persona-suelta"
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: `1px solid ${V.lineaPanel}` }}
              >
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: V.warn, flexShrink: 0 }} />
                <span className="truncate" style={{ fontSize: '12px', color: V.tinta, minWidth: 0 }}>
                  {s.nombre_completo}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: V.tenue, flexShrink: 0 }}>
                  {s.categoria ?? 'sin categoría'}
                </span>
              </div>
            ))}

      {!sinLeerPool && sueltos.length > 0 && (
        <Link
          href={hrefPool} prefetch={false} data-testid="abrir-pool"
          className="hover:text-[#30302F]"
          style={{ display: 'inline-block', fontSize: '12.5px', fontWeight: 500, color: V.tinta, marginTop: 10 }}
        >
          Asignar a una cuadrilla →
        </Link>
      )}
    </>
  )
}
