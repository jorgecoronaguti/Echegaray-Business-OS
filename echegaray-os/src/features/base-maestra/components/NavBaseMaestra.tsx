import type { ReactNode } from 'react'
import Link from 'next/link'
import { C, IcoBaseMaestra, IcoCuadrilla, IcoMaterial, IcoPaquete, IcoRendimiento } from '@/shared/components/canon'
import type { VistaRecursos } from '../services/vistas'

// LA BANDA DE NIVEL 3 DE LA BASE MAESTRA — porte literal de `17`/`18`, línea 51 de los dos archivos.
//
// ═══ MEDIDO DEL CANÓNICO ═══
//
//   banda    `background:#FAFAF8;borderBottom:1px solid #E7E6E2;display:flex;alignItems:center;
//             gap:14px;padding:0 20px;flexWrap:wrap`
//   solapa   `display:flex;alignItems:center;gap:6px;fontSize:12.5px;padding:9px 10px`
//   activa   color #1F1F1E · peso 600 · `boxShadow:inset 0 -2px 0 #30302F`  ← GRAFITO, no amarillo
//   contador mono 10,5px · #6B6B67 en la activa, #91918B en el resto
//   derecha  `marginLeft:auto;display:flex;alignItems:center;gap:8px;padding:5px 0`
//
// Antes esto era `SubTabs` del design system —texto con subrayado fino, sin icono, sin contador y
// en su propia línea, con el buscador y los filtros en OTRA—. El canónico mete la navegación, el
// buscador, los chips y la acción primaria en UNA SOLA banda: es la diferencia entre «parecido» y
// «igual» que costó cuatro entregas rechazadas.
//
// ═══ POR QUÉ SON CINCO SOLAPAS Y NO LAS CUATRO DEL MOCKUP — DESVÍO DECLARADO ═══
//
// El canónico dibuja `Tareas · Recursos · Rendimientos · Composiciones`. Las dos primeras son estas
// dos pantallas. Las otras dos NO SE PORTAN, y por dos motivos distintos:
//
//   · el zip no trae ninguna pantalla para ellas —no hay `.dc.html` de Rendimientos ni de
//     Composiciones—, así que dibujarles la solapa sería un enlace a algo que nadie diseñó;
//   · en este modelo NO son entidades: el rendimiento y la composición son atributos DE LA TAREA, y
//     el propio canónico 17 los muestra adentro de esta pantalla (la columna REAL OBRA, la columna
//     COMPOSICIÓN, y las secciones «Composición por unidad» y «Rendimiento por obra» del panel).
//
// A cambio quedan tres solapas que el zip no tiene y que SÍ son pantallas construidas con datos
// reales —el convenio UOCRA del que sale el costo de la hora, las plantillas de secuencia y las
// versiones de precio—. Sacarlas de la banda no las mejoraría: las dejaría sin ninguna manera de
// llegar. Se declaran acá y en el informe, no se esconden.

export const RUTA_TAREAS = '/administracion/base-maestra/tareas'
export const RUTA_RECURSOS = '/administracion/base-maestra/recursos'

export const hrefRecursos = (v: VistaRecursos) =>
  v === 'recursos' ? RUTA_RECURSOS : `${RUTA_RECURSOS}?v=${v}`

export type SolapaBM = 'tareas' | VistaRecursos

const SOLAPAS: { clave: SolapaBM; rotulo: string; href: string; icono: ReactNode }[] = [
  { clave: 'tareas', rotulo: 'Tareas', href: RUTA_TAREAS, icono: <IcoBaseMaestra s={14} /> },
  { clave: 'recursos', rotulo: 'Recursos', href: RUTA_RECURSOS, icono: <IcoMaterial s={14} /> },
  { clave: 'mano-obra', rotulo: 'Mano de obra', href: hrefRecursos('mano-obra'), icono: <IcoCuadrilla s={14} /> },
  { clave: 'plantillas', rotulo: 'Plantillas', href: hrefRecursos('plantillas'), icono: <IcoPaquete s={14} /> },
  { clave: 'precios', rotulo: 'Versiones de precio', href: hrefRecursos('precios'), icono: <IcoRendimiento s={14} /> },
]

/**
 * @param cuentas el número al lado de cada solapa. `null` o ausente NO dibuja nada: el canónico
 *   pone un contador porque su dato de ejemplo lo tiene, y acá hay dos solapas —Mano de obra y
 *   Versiones de precio— cuyo número no es un `count` de una tabla sino el resultado de agrupar la
 *   escala vigente y las tandas de precio. Pedirlo en cada carga costaría dos lecturas enteras para
 *   pintar un número; ponerle el count de otra tabla parecida sería inventarlo.
 * @param children el buscador, los chips y la acción primaria: van DENTRO de la banda, a la derecha.
 */
export function BandaBaseMaestra({
  activa, cuentas = {}, children,
}: {
  activa: SolapaBM
  cuentas?: Partial<Record<SolapaBM, number | null>>
  children?: ReactNode
}) {
  return (
    <div
      data-testid="nav-base-maestra"
      style={{
        background: C.superficieTenue,
        borderBottom: `1px solid ${C.linea}`,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 20px',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', minWidth: 0, overflowX: 'auto' }}>
        {SOLAPAS.map((s) => {
          const viva = s.clave === activa
          const n = cuentas[s.clave]
          return (
            // `prefetch={false}`: son rutas `force-dynamic` y cada prefetch es un render completo
            // del servidor con su tanda de consultas, para bytes que se tiran.
            <Link
              key={s.clave}
              href={s.href}
              prefetch={false}
              data-testid={`bm-vista-${s.clave}`}
              aria-current={viva ? 'page' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '12.5px',
                padding: '9px 10px',
                whiteSpace: 'nowrap',
                color: viva ? C.tinta : C.apagado,
                fontWeight: viva ? 600 : 400,
                boxShadow: viva ? `inset 0 -2px 0 ${C.grafito}` : 'none',
              }}
            >
              <span style={{ display: 'flex' }}>{s.icono}</span>
              {s.rotulo}
              {n != null && (
                <span className="font-mono tabular-nums" style={{ fontSize: '10.5px', color: viva ? C.apagado : C.tenue }}>
                  {n}
                </span>
              )}
            </Link>
          )
        })}
      </div>
      {children && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', flexWrap: 'wrap' }}>
          {children}
        </div>
      )}
    </div>
  )
}
