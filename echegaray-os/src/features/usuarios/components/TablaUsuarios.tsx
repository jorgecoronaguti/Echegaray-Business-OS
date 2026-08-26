// U v2 · LA LISTA DE CUENTAS — `U · Usuarios y accesos.dc.html` (95-131).
//
// USUARIO · NIVEL · ALCANCE · ÚLT. ACCESO · $. Cinco columnas, sin caja, sin tarjetas por persona,
// sin contadores arriba y sin gráficos: son diez filas, la pregunta es «quién ve qué» y se contesta
// leyendo la fila.
//
// ═══ LA COLUMNA `$` ES LA QUE NO ESTABA ═══
//
// PERMISO OPERATIVO Y PERMISO ECONÓMICO SON DOS CAPACIDADES DISTINTAS, y hasta ahora la lista sólo
// mostraba el nivel — había que saberse de memoria cuál de los cinco ve margen. El mockup le da una
// columna propia, y es la más importante de la pantalla: es la que decide quién ve el precio de
// venta de una obra. Lo hace cumplir la base (`ve_economia()`), no este dibujo.
//
// ═══ LA CUENTA ES EL CORREO, NO EL NOMBRE ═══
//
// El correo es con lo que se entra y es lo único único: dos personas pueden llamarse igual y el
// nombre del perfil puede faltar. Cuando falta se ESCRIBE —«sin persona vinculada»—, porque una
// cuenta que puede entrar y no se sabe de quién es, es lo que esta pantalla existe para que no pase.

import Link from 'next/link'
import { CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, RotuloCol, V } from '@/shared/components/v2/patron'
import { ROL_LABEL } from '@/features/auth/types'
import { veEconomia } from '@/features/auth/types/areas'
import { ultimoIngresoDicho, veTodasLasObras } from '../services/reglas'
import type { UsuarioGestion } from '../types'

const COLS
  = 'grid-cols-[minmax(0,1.5fr)_minmax(0,150px)_minmax(0,1fr)_minmax(0,110px)_28px]'
  + ' max-[1249px]:grid-cols-[minmax(0,1.5fr)_minmax(0,150px)_28px]'
const SOLO_ANCHO = 'max-[1249px]:hidden'

/** Las iniciales de la cuenta. Del nombre si lo hay; si no, del correo — nunca vacío. */
function iniciales(u: UsuarioGestion): string {
  const base = u.nombre?.trim() || u.email?.trim() || '?'
  const partes = base.split(/[\s@._-]+/).filter(Boolean)
  return (partes[0]?.[0] ?? '?').toUpperCase() + (partes[1]?.[0] ?? '').toUpperCase()
}

/** Alcance: a qué obras entra. Quien entra a TODAS no las enumera —la lista mentiría por omisión el
 *  día que se agregue una obra— y se pregunta con el MISMO criterio que usa `ve_obra()` en la base. */
function alcanceDe(u: UsuarioGestion): { texto: string; falta: boolean } {
  if (veTodasLasObras(u.rol)) return { texto: 'todas las obras', falta: false }
  if (u.obras.length === 0) return { texto: 'sin obras asignadas', falta: true }
  return { texto: u.obras.map((o) => o.obraNombre).join(' · '), falta: false }
}

export function TablaUsuarios({ usuarios, abierto, hrefDe, vacio }: {
  usuarios: UsuarioGestion[]
  abierto?: string
  hrefDe: (id: string) => string
  vacio: string
}) {
  return (
    <div data-testid="tabla-usuarios">
      <div className={`grid gap-[14px] ${COLS}`} style={{ ...ENCABEZADO, paddingLeft: 13 }}>
        <RotuloCol>Usuario</RotuloCol>
        <RotuloCol>Nivel</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Alcance</RotuloCol></span>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol derecha>Últ. acceso</RotuloCol></span>
        <span title="Ve margen, precio de venta y rentabilidad" className="grid">
          <span
            style={{
              fontSize: '10px', letterSpacing: '.06em', color: V.tenue, textAlign: 'center',
              paddingBottom: 6,
            }}
          >
            $
          </span>
        </span>
      </div>

      {usuarios.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="sin-usuarios">
          {vacio}
        </p>
      )}

      {usuarios.map((u) => {
        const ingreso = ultimoIngresoDicho(u.ultimoIngreso)
        const alcance = alcanceDe(u)
        const economico = veEconomia(u.rol)
        const sinAcceso = u.estado !== 'activo'
        return (
          <Link
            key={u.id} href={hrefDe(u.id)} prefetch={false}
            data-testid={`fila-${u.email ?? u.id}`} data-estado={sinAcceso ? 'sin_acceso' : 'activa'}
            className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} hover:bg-[#F2F1ED]`}
            style={{
              height: 44, paddingLeft: 13, borderBottom: `1px solid ${V.lineaFila}`,
              background: u.id === abierto ? V.seleccion : 'transparent',
              // SIN NIVEL ASIGNADO BLOQUEA: la cuenta existe, entra, y la base la trata como la
              // menos privilegiada — o sea que nadie decidió qué ve.
              boxShadow: u.rol === null ? FILO_BLOQUEA : 'none',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span
                aria-hidden
                style={{
                  width: 26, height: 26, borderRadius: 14, flexShrink: 0,
                  background: sinAcceso ? '#F1F0EC' : V.grafito,
                  color: sinAcceso ? V.tenue : '#FFFFFF',
                  fontSize: '10px', fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {iniciales(u)}
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  className="block truncate"
                  style={{ fontSize: '12.5px', fontWeight: 500, color: sinAcceso ? V.apagado : V.tinta }}
                >
                  {u.email ?? 'sin correo'}
                </span>
                <span className="block truncate" style={{ fontSize: '11px', color: V.lupa, marginTop: 1 }}>
                  {u.nombre ?? 'sin persona vinculada'}
                  {sinAcceso && ' · sin acceso'}
                </span>
              </span>
            </span>

            <span className="truncate" style={{ fontSize: '12px', color: u.rol ? V.tintaSuave : V.warn }}>
              {u.rol ? ROL_LABEL[u.rol] : 'sin nivel asignado'}
            </span>

            <span className={`grid ${SOLO_ANCHO}`}>
              <span className="truncate" style={{ fontSize: '12px', color: alcance.falta ? V.warn : V.tintaSuave }}>
                {alcance.texto}
              </span>
            </span>

            <span className={`grid ${SOLO_ANCHO}`}>
              {/* NUNCA INGRESÓ NO ES UNA FECHA VIEJA: es que la cuenta se creó y nadie entró. */}
              <span
                className="font-mono tabular-nums"
                style={{ fontSize: '11.5px', color: ingreso ? V.apagado : V.tenue, textAlign: 'right' }}
              >
                {ingreso ?? 'nunca ingresó'}
              </span>
            </span>

            {/* EL PERMISO ECONÓMICO, CON SÍMBOLO Y CON `title`: nunca sólo color. */}
            <span
              title={economico ? 'Ve margen, precio de venta y rentabilidad' : 'No ve margen ni precio de venta'}
              data-economico={economico ? 'si' : 'no'}
              className="font-mono"
              style={{
                display: 'flex', justifyContent: 'center', fontSize: '12px', fontWeight: 600,
                color: economico ? V.tinta : V.cuentaApagada,
              }}
            >
              {economico ? '$' : '—'}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
