// 25 · CLIENTES v2 — la cartera sin caja, con las obras en ejecución COLGANDO de su cliente.
//
// ═══ QUÉ CAMBIÓ RESPECTO DEL PORTE DE AGOSTO (`ListaClientes`) ═══
//
//   · SE FUE LA CAJA (criterio 3). No hay tarjeta blanca con borde y radio, ni encabezado gris, ni
//     pie de totales adentro: filos, tipografía y números tabulares. Con el pie se fue el total
//     «CONTRATADO» de la cartera entera — lo que dice cuánto se está viendo es el `n/total` de los
//     recortes, arriba, y no un bloque gris al final.
//   · SE FUE LA COLUMNA «EN EJECUCIÓN», que era los nombres de las obras concatenados con « · ».
//     Cada obra en ejecución es ahora una FILA propia, indentada bajo su cliente y compartiendo sus
//     columnas: contratado es plata en las dos (criterio 4, jerarquía por indentación). Una lista de
//     tres obras metida en una celda no se puede leer ni ordenar ni comparar.
//   · SE FUE EL AVATAR DE INICIALES y el menú `···` de la fila. El mockup pone el icono de cliente
//     (§11, 15px) y el nombre; las acciones viven en el panel. Una columna de menús es una columna
//     de ruido en una lista que existe para encontrar y abrir.
//   · EL AVISO ES TEXTO, NO UN TRIÁNGULO: «sin CUIT» dicho con palabras al lado del nombre. Un
//     icono obliga a pasar el mouse para saber qué falta.
//
// ═══ EL NOMBRE NUNCA SE ESTRANGULA ═══
//
// Por debajo de 1250px se suelta OBRAS —nunca el cliente ni lo contratado (`25v2:154`)—. Lo decide
// una media query y no `window.innerWidth`, para no volver la tabla un componente de cliente.

import Link from 'next/link'
import { pesos, porcentajeCanon } from '@/shared/components/canon/formato'
import { IconoCliente, IconoObra } from '@/shared/components/iconos'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, RotuloCol, V } from '@/shared/components/v2/patron'
import type { ClienteEnCartera } from '@/features/administracion/services/homeCartera'

/** `25v2:154`. Literales porque Tailwind no compila una clase armada en runtime. */
const COLS
  = 'grid-cols-[minmax(240px,1.7fr)_minmax(0,110px)_minmax(0,150px)]'
  + ' max-[1249px]:grid-cols-[minmax(200px,1.7fr)_minmax(0,140px)]'
/** La celda que se suelta en angosto. Su `display` NUNCA va inline: un inline gana a la media query. */
const SOLO_ANCHO = 'max-[1249px]:hidden'

/**
 * LO QUE CUELGA DEL NOMBRE DE LA OBRA, y que en el teléfono se lo comía (medido a 390x844 el
 * 26/08/2026). La columna del nombre respeta su piso —`minmax(200px, ...)`, la media query hace su
 * trabajo—, pero DENTRO de esa celda la barra de avance declara `width: 80px` con `flex-shrink: 0`
 * y el porcentaje otro tanto: 128 de los 164px útiles. Al nombre le quedaban 36 y «Galpón 9» se
 * dibujaba «Galp…». Soltar la columna y estrangular el nombre adentro es el mismo defecto una capa
 * más abajo.
 *
 * Se suelta en el corte `lg` —no en el de columnas— porque entre 1024 y 1249 la celda mide ~660px y
 * todo entra holgado; el problema aparece de 1023 para abajo.
 */
const ADORNO_ANCHO = 'max-[1023px]:hidden'

/** Los tonos que el v2 usa en esta pantalla y el vocabulario todavía no tenía nombrados. */
const TONO = { divisorObra: '#F3F2EE', pista: '#EDECE8', textoObra: '#3A3A38' } as const

export function TablaClientes({
  clientes, seleccionado, hrefDe, veEconomia, obrasNoLeidas, limpiarHref, vacio,
}: {
  clientes: ClienteEnCartera[]
  seleccionado?: string
  /** Abre el panel de ese cliente SIN salir de la lista. */
  hrefDe: (clienteId: string) => string
  /** El jefe de obra no ve lo contratado. La cerradura es la RLS; acá se deja de ofrecer. */
  veEconomia: boolean
  /** `true` = la lectura de obras falló. Ninguna fila puede decir «ninguna en ejecución». */
  obrasNoLeidas: boolean
  limpiarHref: string
  /** Qué se escribe cuando el recorte no deja a nadie. */
  vacio: string
}) {
  return (
    <div data-testid="clientes-tabla">
      <div className={`grid gap-[14px] ${COLS}`} style={ENCABEZADO}>
        <RotuloCol>Cliente</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol derecha>Obras</RotuloCol></span>
        <RotuloCol derecha>{veEconomia ? 'Contratado' : ''}</RotuloCol>
      </div>

      {clientes.map((c) => {
        const elegido = c.cliente_id === seleccionado
        const aviso = c.avisoCorto
        return (
          <div key={c.cliente_id}>
            <Link
              href={hrefDe(c.cliente_id)}
              prefetch={false}
              role="row"
              data-testid="fila-cliente"
              data-seleccionada={elegido ? '' : undefined}
              className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} ${elegido ? '' : 'hover:bg-[#F2F1ED]'}`}
              style={{
                height: ALTO_V2.trabajo,
                // El divisor se afloja cuando abajo cuelgan obras: son el mismo bloque.
                borderBottom: `1px solid ${c.enCurso.length ? TONO.divisorObra : V.lineaFila}`,
                background: elegido ? V.seleccion : undefined,
                // El filo ámbar dice «esto bloquea» y sobrevive a la selección, que va sólo en el
                // fondo. Si compartieran canal, elegir la fila borraría su problema.
                boxShadow: c.faltaUnDato ? FILO_BLOQUEA : undefined,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                  <IconoCliente className="h-[15px] w-[15px]" />
                </span>
                <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta }}>
                  {c.nombre}
                </span>
                {aviso && (
                  <span
                    title={c.aviso ?? aviso}
                    data-testid="aviso-datos"
                    style={{ fontSize: '11px', color: V.warn, flexShrink: 0 }}
                  >
                    {aviso}
                  </span>
                )}
              </span>

              <span
                className={`font-mono tabular-nums ${SOLO_ANCHO}`}
                style={{ fontSize: '12px', color: V.apagado, textAlign: 'right' }}
              >
                {/* CERO OBRAS SE ESCRIBE CON PALABRAS: «0 obras» y «nadie le cargó ninguna» se leen
                    igual, y son cosas distintas. */}
                {c.obras ? `${c.obras} ${c.obras === 1 ? 'obra' : 'obras'}` : 'sin obras'}
              </span>

              <span
                className="font-mono tabular-nums"
                style={{ fontSize: '12px', textAlign: 'right', color: c.contratado === null ? V.warn : V.tinta }}
              >
                {veEconomia ? (c.contratado === null ? 'sin contrato' : pesos(c.contratado)) : ''}
              </span>
            </Link>

            {c.enCurso.map((o) => (
              <Link
                key={o.obra_id}
                href={`/obras/${o.obra_id}`}
                prefetch={false}
                role="row"
                data-testid="fila-obra"
                className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} hover:bg-[#FAFAF8]`}
                style={{ height: 30, borderBottom: `1px solid ${TONO.divisorObra}` }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, paddingLeft: 14 }}>
                  <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                    <IconoObra className="h-[13px] w-[13px]" />
                  </span>
                  <span className="truncate" style={{ fontSize: '12px', color: TONO.textoObra }}>{o.nombre}</span>
                  {/* BARRA SÓLO SI EL NÚMERO ES UNA FRACCIÓN 0–100. `null` no es cero: una obra sin
                      avance sincronizado no avanzó cero por ciento — no se sabe, y una barra vacía
                      dice que sí. */}
                  {/* EL `display` DE LO QUE SE SUELTA VA EN LA CLASE Y NUNCA INLINE: un
                      `display: 'flex'` en el atributo `style` le gana a `hidden` y la barra
                      seguiría ocupando sus 80px inelásticos. */}
                  {o.avance === null
                    ? <span className={ADORNO_ANCHO} style={{ fontSize: '11.5px', color: V.lupa, flexShrink: 0 }}>sin medir</span>
                    : (
                        <>
                          <span className={`flex ${ADORNO_ANCHO}`} style={{ height: 4, width: 80, borderRadius: 2, background: TONO.pista, flexShrink: 0, marginLeft: 2 }}>
                            <span style={{ width: `${Math.min(100, Math.max(0, o.avance))}%`, background: V.grafito, borderRadius: 2 }} />
                          </span>
                          <span className={`font-mono tabular-nums ${ADORNO_ANCHO}`} style={{ fontSize: '11.5px', color: V.apagado, flexShrink: 0 }}>
                            {porcentajeCanon(o.avance, 0)}
                          </span>
                        </>
                      )}
                </span>
                <span className={SOLO_ANCHO} />
                <span
                  className="font-mono tabular-nums"
                  style={{ fontSize: '11.5px', textAlign: 'right', color: o.contratado === null ? V.warn : V.apagado }}
                >
                  {veEconomia ? (o.contratado === null ? 'sin contrato' : pesos(o.contratado)) : ''}
                </span>
              </Link>
            ))}

            {c.enCurso.length === 0 && (
              <div
                className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS}`}
                style={{ height: 26, borderBottom: `1px solid ${TONO.divisorObra}` }}
              >
                {/* «NO PUDE LEERLAS» NO SE DIBUJA COMO «NO HAY»: es el defecto de un control que no
                    pudo mirar y afirma que no hay nada. */}
                <span style={{ fontSize: '11.5px', color: V.lupa, paddingLeft: 36 }}>
                  {obrasNoLeidas ? 'no pude leer sus obras' : 'ninguna obra en ejecución'}
                </span>
              </div>
            )}
          </div>
        )
      })}

      {clientes.length === 0 && (
        <div style={{ padding: '24px 2px', fontSize: '12.5px', color: V.apagado }} data-testid="sin-resultados">
          {vacio}{' '}
          <Link href={limpiarHref} data-testid="clientes-ver-todo" style={{ color: V.tinta, fontWeight: 500, textDecoration: 'underline' }}>
            Ver todos
          </Link>
        </div>
      )}
    </div>
  )
}
