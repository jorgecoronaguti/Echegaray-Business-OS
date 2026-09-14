// LOS FILTROS DEL CUADRO DE LA QUINCENA. Mudados desde `GrillaEspejoQuincena.tsx`, que pasaba las
// 500 líneas: los rótulos y los recortes son los mismos.
//
// ═══ LOS ENLACES VAN CON `Link`, NO CON `<a href>` ═══
//
// Al mudarlos, `navegacion-sin-anchor-crudo.test.ts` los acusó: un `<a href>` interno tira el
// documento entero y lo vuelve a pedir (dueño, 08/09/2026: «cada vez que cambio de sección vuelve a
// hacer reload de toda la página»). Cambiar de quincena o de recorte es la navegación que más se
// repite en esta pantalla. El buscador sigue siendo un formulario GET: funciona sin JavaScript.

import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'

/**
 * El selector de quincena y de grupo. Dos recortes y nada más: el dueño pidió «quincena (anterior /
 * siguiente) y grupo. Nada más». Un panel de filtros al costado le roba 230 px a una tabla que ya
 * necesita 1.500.
 */
export function FiltrosDelEspejo({ periodos, grupos, busqueda, cerrar }: {
  periodos: { texto: string; activo: boolean; href: string }[]
  grupos: { texto: string; activo: boolean; href: string }[]
  /** Buscar por nombre. Formulario GET: sin JavaScript, y la URL queda compartible. */
  busqueda?: { valor: string; ocultos: Record<string, string>; limpiar: string | null }
  /** A dónde lleva «Cerrar quincena». El cierre vive en su pantalla: sella y no se deshace sin firma. */
  cerrar?: string
}) {
  return (
    <div data-testid="espejo-filtros" style={{
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '0 0 16px',
      fontSize: '12.5px',
    }}>
      <Grupo rotulo="Quincena" opciones={periodos} testid="espejo-quincenas" />
      <Grupo rotulo="Cobra" opciones={grupos} testid="espejo-grupos" />
      {busqueda && (
        <form method="get" data-testid="espejo-buscar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {Object.entries(busqueda.ocultos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {/* `key` = LO BUSCADO (QA, 14/09/2026: «limpiar» y enseguida «Mensuales» dejaba el texto pegado y 0
              personas). El campo no es controlado: en una navegación sin recarga React lo reusa y
              `defaultValue` no se vuelve a aplicar, así que el texto viejo quedaba escrito y el siguiente
              envío lo volvía a mandar. Con la clave, un valor distinto es otro campo. */}
          <input
            key={busqueda.valor}
            type="search" name="buscar" defaultValue={busqueda.valor} placeholder="Buscar persona…"
            aria-label="Buscar persona"
            style={{
              height: 32, width: 180, padding: '0 10px', borderRadius: 6, fontSize: '12.5px',
              border: `1px solid ${V.lineaFuerte}`, background: '#FFFFFF', color: V.tinta,
            }}
          />
          {busqueda.limpiar && (
            <Link href={busqueda.limpiar} prefetch={false} style={{ fontSize: '12px', color: V.apagado }}>limpiar</Link>
          )}
        </form>
      )}
      {cerrar && (
        <Link href={cerrar} prefetch={false} data-testid="espejo-ir-a-cerrar" style={{
          // GRAFITO, NO AMARILLO: el amarillo de marca da 1,6:1 contra blanco y con texto oscuro se
          // lee como advertencia. Acción = grafito (skill de diseño del OS, §1).
          marginLeft: 'auto', fontSize: '12.5px', fontWeight: 600, color: '#FFFFFF', textDecoration: 'none',
          padding: '6px 12px', borderRadius: 6, background: V.grafito,
        }}>Cerrar quincena →</Link>
      )}
    </div>
  )
}

function Grupo({ rotulo, opciones, testid }: {
  rotulo: string
  opciones: { texto: string; activo: boolean; href: string }[]
  testid: string
}) {
  if (opciones.length === 0) return null
  return (
    <div data-testid={testid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: V.tintaSuave }}>
        {rotulo}
      </span>
      {opciones.map((o) => (
        // LA CLAVE ES EL RÓTULO, NO EL ENLACE: dos opciones pueden apuntar al mismo lugar (Recibos las
        // armaba todas con `#`) y React avisaba claves repetidas en cada carga (QA, 14/09/2026).
        <Link key={o.texto} href={o.href} prefetch={false} style={{
          fontSize: '12px', textDecoration: 'none', padding: '4px 8px', borderRadius: 4,
          color: o.activo ? V.tinta : V.apagado,
          background: o.activo ? '#F1F0EC' : 'transparent',
          fontWeight: o.activo ? 600 : 400,
        }}>{o.texto}</Link>
      ))}
    </div>
  )
}
