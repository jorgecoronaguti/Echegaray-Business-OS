// LOS FILTROS DEL CUADRO DE LA QUINCENA. Mudados enteros desde `GrillaEspejoQuincena.tsx`, que
// pasaba las 500 líneas: ni un rótulo ni un comportamiento cambió.

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
          <input
            type="search" name="buscar" defaultValue={busqueda.valor} placeholder="Buscar persona…"
            aria-label="Buscar persona"
            style={{
              height: 32, width: 180, padding: '0 10px', borderRadius: 6, fontSize: '12.5px',
              border: `1px solid ${V.lineaFuerte}`, background: '#FFFFFF', color: V.tinta,
            }}
          />
          {busqueda.limpiar && (
            <a href={busqueda.limpiar} style={{ fontSize: '12px', color: V.apagado }}>limpiar</a>
          )}
        </form>
      )}
      {cerrar && (
        <a href={cerrar} data-testid="espejo-ir-a-cerrar" style={{
          // GRAFITO, NO AMARILLO: el amarillo de marca da 1,6:1 contra blanco y con texto oscuro se
          // lee como advertencia. Acción = grafito (skill de diseño del OS, §1).
          marginLeft: 'auto', fontSize: '12.5px', fontWeight: 600, color: '#FFFFFF', textDecoration: 'none',
          padding: '6px 12px', borderRadius: 6, background: V.grafito,
        }}>Cerrar quincena →</a>
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
        <a key={o.href} href={o.href} style={{
          fontSize: '12px', textDecoration: 'none', padding: '4px 8px', borderRadius: 4,
          color: o.activo ? V.tinta : V.apagado,
          background: o.activo ? '#F1F0EC' : 'transparent',
          fontWeight: o.activo ? 600 : 400,
        }}>{o.texto}</a>
      ))}
    </div>
  )
}
