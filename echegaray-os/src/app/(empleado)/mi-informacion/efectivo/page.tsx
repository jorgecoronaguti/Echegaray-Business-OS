import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { C } from '@/shared/components/movil/tokens'
import { AvisoError } from '@/shared/components/movil/Piezas'
import { contextoEfectivo } from '@/features/efectivo/campo/contexto'
import { getMiEfectivo } from '@/features/efectivo/campo/datos'
import {
  abiertas, cifra, conVuelta, destino, fraseTePiden, pesos, resumenMiEfectivo, tarjetaDeHoy, textoTengoQueRendir,
} from '@/features/efectivo/campo/logica'
import {
  Caja, CifraGrande, Contorno, FilaAcceso, Pie, Primario, Renglon, Rotulo, SinPublicar,
} from '@/features/efectivo/campo/components/Piezas'
import { SinEfectivo, TarjetaRecibir } from '@/features/efectivo/campo/components/TarjetasHoy'

// M03 · MI EFECTIVO — porte de `efectivo-a-rendir.dc.html`, pantalla M03.
//
// ═══ ES UNA PANTALLA DE DETALLE, NO UNA RAÍZ ═══
//
// El mockup la dibuja con el topbar de marca «Yo» y la barra abajo. «Yo» ya es M09 (la ficha) y el
// armazón del empleado tiene cuatro raíces fijas; una quinta cambiaría la barra, que el pedido prohíbe.
// Se entra desde la tarjeta de Hoy y desde la fila «Mi efectivo» de Yo, y se vuelve con la flecha.
//
// «Esperando revisión» del mockup se llama acá «Todavía no en Compras»: el ticket no espera que nadie
// lo revise (dueño, 22/09); espera que el circuito lo lea y lo cargue.

export const dynamic = 'force-dynamic'

type Params = Promise<{ desde?: string; obra?: string }>

export default async function MiEfectivoPage({ searchParams }: { searchParams: Params }) {
  const ctx = await contextoEfectivo(await searchParams)
  const volver = { href: ctx.sufijo ? ctx.volverA : '/mi-informacion', label: ctx.sufijo ? 'Mi efectivo de la obra' : 'Yo' }

  if (!ctx.personaId) {
    return (
      <PantallaEmpleado titulo="Mi efectivo" volver={{ ...volver }}>
        <SinVinculo que="el efectivo que te entregaron" disponible={ctx.vinculoDisponible} />
      </PantallaEmpleado>
    )
  }

  const lectura = await getMiEfectivo(ctx.supabase, ctx.personaId)
  if (lectura.estado !== 'ok') {
    return (
      <PantallaEmpleado titulo="Mi efectivo" volver={{ ...volver }}>
        {lectura.estado === 'sin-publicar' ? <SinPublicar /> : <AvisoError>{lectura.error}</AvisoError>}
      </PantallaEmpleado>
    )
  }

  const { entregas, tickets } = lectura.dato
  const r = resumenMiEfectivo(entregas, tickets)
  const numero = textoTengoQueRendir(r)
  const hoy = tarjetaDeHoy(entregas, tickets)
  const piden = r.piden[0] ?? null
  const ruta = (h: string) => conVuelta(`/mi-informacion/efectivo${h}`, ctx.sufijo)
  const puedeRendir = abiertas(entregas).length > 0

  return (
    <PantallaEmpleado titulo="Mi efectivo" volver={{ ...volver }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 'calc(100vh - 110px)' }}>
        {hoy?.tipo === 'recibir' && <TarjetaRecibir t={hoy} sufijo={ctx.sufijo} />}
        {entregas.length === 0 ? <SinEfectivo /> : (
          <Caja gap={16} testid="mi-efectivo-cuenta">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Rotulo>{numero.rotulo}</Rotulo>
              <CifraGrande testid="tengo-que-rendir">{numero.valor}</CifraGrande>
              {numero.detalle && <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{numero.detalle}</div>}
            </div>
            {r.entregas.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 14, borderTop: `1px solid ${C.divisorSuave}` }}>
                <Renglon rotulo="Recibí" valor={cifra(r.recibi)} numero />
                <Renglon rotulo="Rendí" valor={cifra(r.rendi)} numero />
                {r.devolvi > 0 && <Renglon rotulo="Devolví" valor={cifra(r.devolvi)} numero />}
                {r.pendientes.length > 0 && (
                  <Renglon
                    rotulo="Todavía no en Compras"
                    valor={r.pendienteSinTotal ? `${cifra(r.pendienteMonto)} + ${r.pendienteSinTotal} sin leer` : cifra(r.pendienteMonto)}
                    numero
                    color={C.warn}
                    testid="pendiente-compras"
                  />
                )}
              </div>
            )}
            {r.entregas.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 12, borderTop: `1px solid ${C.divisorSuave}` }}>
                {r.entregas.map((e) => (
                  <Renglon key={e.id} rotulo={`${e.codigo} · ${destino(e)}`} valor={pesos(e.en_su_poder)} numero />
                ))}
              </div>
            )}
          </Caja>
        )}

        {piden && (
          <Caja fondo={C.warnFondo} borde={C.warnBorde} gap={9} relleno="16px 18px" testid="te-piden-un-dato">
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.warn }}>Te piden un dato</div>
            <div style={{ fontSize: 13, color: C.inkSuave, lineHeight: 1.5 }}>{fraseTePiden(piden)}</div>
            <Contorno href={ruta(`/rendiciones/${piden.id}`)} testid="completar-dato">Completar</Contorno>
          </Caja>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <FilaAcceso href={ruta('/rendiciones')} cuenta={r.piden.length} testid="ir-rendiciones">Mis rendiciones</FilaAcceso>
          <FilaAcceso href="/mi-informacion/recibos" testid="ir-recibos-efectivo">Mis recibos</FilaAcceso>
          <FilaAcceso href={ruta('/devolver')} testid="ir-devolver">Devolver efectivo</FilaAcceso>
        </div>

        {puedeRendir && (
          <Pie>
            <Primario href={ruta('/rendir')} icono="foto" testid="rendir-un-gasto">Rendir un gasto</Primario>
          </Pie>
        )}
      </div>
    </PantallaEmpleado>
  )
}
