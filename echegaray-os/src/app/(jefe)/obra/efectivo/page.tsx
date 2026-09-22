import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { contextoDeObra } from '@/features/jefe/services/contexto'
import { conObra } from '@/features/jefe/services/navegacion'
import { C } from '@/shared/components/movil/tokens'
import { AvisoError, TarjetaLista, TopBarDetalle, Vacio, mono } from '@/shared/components/movil/Piezas'
import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'
import { getMiEfectivo } from '@/features/efectivo/campo/datos'
import {
  abiertas, conVuelta, diaMes, pesos, resumenMiEfectivo, sufijoDeVuelta, tarjetaDeHoy,
} from '@/features/efectivo/campo/logica'
import type { EntregaSaldo } from '@/features/efectivo/campo/tipos'
import {
  Caja, FilaAcceso, FilaTicket, Pie, Primario, Rotulo, SinPublicar,
} from '@/features/efectivo/campo/components/Piezas'
import { SinEfectivo, TarjetaRecibir } from '@/features/efectivo/campo/components/TarjetasHoy'

// D15 · MI EFECTIVO DE LA OBRA — la misma entrega, vista por el jefe de obra.
//
// ═══ SÓLO LO SUYO, Y AHORA LO CIERRA LA BASE ═══
//
// Hasta el 22/09/2026 esto lo filtraba SÓLO la consulta: la 20260922T1500 abría las entregas a
// `es_administracion()`, que desde el 19/08 incluye al Jefe de obra, y PostgREST le devolvía el
// efectivo en la mano de toda la empresa. Lo cerró `20260922T2700`: la policy pasó a
// `ve_efectivo_entrega(persona_id, entregada_por)` — Dirección y Administración ven todo, cada uno
// ve lo suyo, y quien entregó ve lo que entregó. El `.eq('persona_id', …)` de `getMisEntregas` se
// queda como segunda vuelta, no como cerradura.
//
// El teléfono es de 390 px: la tabla del mockup (Fecha · Dónde · Importe · Estado) va como la lista
// de M06, que dice lo mismo en dos renglones sin desplazarse de costado.

export const dynamic = 'force-dynamic'

type Params = Promise<{ obra?: string }>

export default async function EfectivoJefePage({ searchParams }: { searchParams: Params }) {
  const { obra: pedida } = await searchParams
  const { obra } = await contextoDeObra(pedida)
  const auth = await createClient()
  const user = await getUsuarioActual(auth)
  const perfil = user ? await getPerfilPropio(auth, user.id) : null
  const personaId = perfil?.data?.persona_id ?? null
  const sufijo = sufijoDeVuelta('obra', obra?.id)
  const ruta = (h: string) => conVuelta(`/mi-informacion/efectivo${h}`, sufijo)

  const lectura = personaId ? await getMiEfectivo(auth, personaId) : null
  const todas = lectura?.estado === 'ok' ? lectura.dato.entregas : []
  const tickets = lectura?.estado === 'ok' ? lectura.dato.tickets : []
  const deLaObra = obra ? todas.filter((e) => e.obra_id === obra.id) : todas
  const otras = todas.filter((e) => !deLaObra.includes(e))
  const r = resumenMiEfectivo(deLaObra, tickets)
  const hoy = tarjetaDeHoy(deLaObra, tickets)
  const suyos = tickets.filter((t) => deLaObra.some((e) => e.id === t.entrega_id))
  const vivas = abiertas(deLaObra)

  return (
    <>
      <TopBarDetalle
        volver={{ href: conObra('/obra/hoy', obra?.id), label: 'Hoy' }}
        testidVolver="volver-jefe"
        titulo="Mi efectivo de la obra"
        sub={`${deLaObra[0]?.persona ?? perfil?.data?.nombre ?? 'jefe de obra'} · ${obra?.nombre ?? 'todas tus obras'}`}
      />
      <RefrescarEnVivo tablas={TABLAS_DE.efectivoCampo} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 'calc(100vh - 66px)' }}>
        {!personaId && <SinVinculo que="el efectivo que te entregaron" disponible={perfil?.data?.vinculoDisponible !== false} />}
        {lectura?.estado === 'sin-publicar' && <SinPublicar />}
        {lectura?.estado === 'error' && <AvisoError>{lectura.error}</AvisoError>}

        {lectura?.estado === 'ok' && (
          <>
            {hoy?.tipo === 'recibir' && <TarjetaRecibir t={hoy} sufijo={sufijo} />}
            {deLaObra.length === 0 ? <SinEfectivo /> : <Cifras r={r} entregas={deLaObra} />}

            {suyos.length > 0 && (
              <>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, marginTop: 4 }}>Lo que rendí</div>
                <TarjetaLista testid="jefe-lo-que-rendi">
                  {suyos.slice(0, 8).map((t, i, l) => (
                    <FilaTicket key={t.id} t={t} href={ruta(`/rendiciones/${t.id}`)} ultima={i === l.length - 1} />
                  ))}
                </TarjetaLista>
              </>
            )}
            {deLaObra.length > 0 && suyos.length === 0 && <Vacio>Todavía no mandaste ningún ticket de esta obra.</Vacio>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suyos.length > 0 && <FilaAcceso href={ruta('/rendiciones')} cuenta={r.piden.length}>Mis rendiciones</FilaAcceso>}
              {vivas.length > 0 && <FilaAcceso href={ruta('/devolver')}>Devolver efectivo</FilaAcceso>}
              {otras.some((e) => e.estado === 'abierta') && (
                <FilaAcceso href={ruta('')} testid="jefe-otras-entregas">Mi efectivo de otras obras</FilaAcceso>
              )}
            </div>

            {vivas.length > 0 && (
              <Pie>
                <Primario href={ruta(vivas.length === 1 ? `/rendir?entrega=${vivas[0].id}` : '/rendir')} icono="foto" testid="jefe-rendir">
                  Rendir un gasto
                </Primario>
              </Pie>
            )}
          </>
        )}
      </div>
    </>
  )
}

/** Recibí · Rendí · Me queda, con su renglón de detalle. En 390 px van de a una fila cada una. */
function Cifras({ r, entregas }: { r: ReturnType<typeof resumenMiEfectivo>; entregas: EntregaSaldo[] }) {
  const ultima = [...entregas].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  const comprobantes = r.entregas.reduce((s, e) => s + e.filas_rendidas, 0)
  const filas: [string, string, string][] = [
    ['Recibí', pesos(r.recibi), ultima ? `${diaMes(ultima.fecha)} · ${ultima.conformidad ? 'firmado' : 'sin firmar'}` : ''],
    ['Rendí', pesos(r.rendi), `${comprobantes} ${comprobantes === 1 ? 'comprobante' : 'comprobantes'} en Compras`],
    [r.tengoQueRendir < 0 ? 'Rendí de más' : 'Me queda', pesos(Math.abs(r.tengoQueRendir)),
      `${r.pendientes.length} ${r.pendientes.length === 1 ? 'foto' : 'fotos'} todavía no en Compras`],
  ]
  return (
    <Caja gap={14} testid="jefe-cifras">
      {filas.map(([rotulo, valor, detalle], i) => (
        <div key={rotulo} style={{
          display: 'flex', flexDirection: 'column', gap: 4, paddingTop: i ? 12 : 0,
          borderTop: i ? `1px solid ${C.divisorSuave}` : 'none',
        }}>
          <Rotulo>{rotulo}</Rotulo>
          <div style={{ ...mono, fontSize: 24, fontWeight: 600, color: C.ink }}>{valor}</div>
          {detalle && <div style={{ fontSize: 12.5, color: C.muted }}>{detalle}</div>}
        </div>
      ))}
    </Caja>
  )
}
