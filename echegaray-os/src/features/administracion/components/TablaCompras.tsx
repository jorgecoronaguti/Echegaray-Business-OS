// 24 · COMPRAS — porte literal de `echegaray-design/24 · Compras.dc.html`.
//
// EL ORDEN Y LOS ANCHOS SON LOS DEL CANÓNICO (línea 156):
// `62px minmax(0,1.2fr) minmax(0,1.4fr) minmax(0,1.1fr) 116px 116px 26px`.
//
// ═══ LA TERCERA COLUMNA DICE «COMPROBANTE» Y EL CANÓNICO DICE «CONCEPTO» ═══
//
// No es una traducción libre: el libro de ARCA NO trae el detalle de lo comprado. «Hormigón H17 ·
// 6 m³» es dato inventado del mockup. Lo que la fuente sí tiene en ese lugar es el número y el tipo
// del comprobante, que es con lo que se lo identifica contra el papel y contra el banco. Dibujar
// «CONCEPTO» y dejarla vacía haría parecer que falta cargar algo que no existe.
//
// ═══ LA NOTA DE CRÉDITO SE MUESTRA EN NEGATIVO ═══
//
// Es una columna de COMPRAS: una nota de crédito resta. Dibujarla como un importe positivo más es
// literalmente el defecto que costó $41.953.276 en el libro (`orquestador/lib/comprobante-arca.mjs`,
// 21/07) — cada nota entraba dos veces mal, sumando cuando debía restar. Acá el signo sale de la
// base (`comprobante_signo`), no de una tabla de códigos escrita en el front.
//
// Y cuando el signo es NULL —un código de ARCA que la tabla no conoce— el importe se muestra tal
// cual pero SIN signo asumido, y el estado de la fila dice «Sin clasificar». Tratar lo desconocido
// como lo habitual es el error de origen; mostrarlo como un problema es el arreglo.
//
// ═══ LA REGLA INTERIOR DE 3px SE VA, Y ES UNA PÉRDIDA CONOCIDA ═══
//
// La versión anterior marcaba la fila con problema con una regla de 3px en el borde izquierdo, con
// un argumento bueno: el ojo recorre el borde izquierdo sin leer nada. El canónico no la dibuja —
// marca la excepción con la pastilla de ESTADO (columna fija de 116px, siempre visible) y con el ⚠
// al lado de la OBRA, que es donde está el trabajo pendiente. Se porta el canónico. Queda dicho que
// se pierde el barrido por el borde: si el dueño lo extraña, vuelve.

import Link from 'next/link'
import { Estado } from '@/shared/components/ds'
import {
  ALTO, C, CeldaTexto, EncabezadoCanon, FilaCanon, PieCanon, TarjetaTabla, VacioCanon,
  IcoAlerta, diaMes, entero, pesos,
} from '@/shared/components/canon'
import { controlDe, totalDeLaVista, type Control } from '../services/comprasEstado'
import type { ComprobanteCompra } from '../services/comprasService'

/** `24`, línea 156. */
const COLS = '62px minmax(0,1.2fr) minmax(0,1.4fr) minmax(0,1.1fr) 116px 116px 26px'

function Importe({ c }: { c: ComprobanteCompra }) {
  if (c.imp_total == null) return <span style={{ color: C.tenue }}>sin importe</span>
  if (c.signo === null) {
    // El número existe; lo que no se sabe es si suma o resta. Apagado para que no se lea firme.
    return (
      <span
        style={{ color: C.tenue }}
        title="El tipo de comprobante no está en la tabla de ARCA: el signo no se puede afirmar."
      >
        {pesos(c.imp_total)}
      </span>
    )
  }
  const valor = c.signo * c.imp_total
  return <span style={{ color: valor < 0 ? C.pos : C.tinta }}>{pesos(valor)}</span>
}

/**
 * LA COLUMNA OBRA DICE DÓNDE LLEGA EL GASTO, NO QUÉ DICE EL PAPEL.
 *
 * «Sueldos» —imputado a Estructura, que no reclama nada— no puede verse igual que «Quattropani», y
 * un rótulo que el diccionario no conoce no puede verse igual que uno que sí: en los dos últimos
 * casos el gasto NO llega a ninguna obra. El texto sigue arriba (es lo que dice el papel) y debajo
 * va a dónde llegó.
 */
function Imputada({ c }: { c: ComprobanteCompra }) {
  const texto = c.obra_texto?.trim()
  const sinObra = c.imputacion === 'sin_identificar' || (!texto && !c.imputacion)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      <span style={{ minWidth: 0 }}>
        {sinObra ? (
          // «sin imputar» no es un vacío tipográfico: es trabajo pendiente, y por eso se escribe y
          // se pinta en vez de dejar un guion que se lee como «no aplica».
          <span className="block truncate" style={{ fontSize: '12px', color: C.neg }}>sin imputar</span>
        ) : (
          <>
            <span className="block truncate" style={{ fontSize: '12px', color: C.tinta }}>{texto}</span>
            {c.imputacion === 'estructura' && (
              <span
                className="block truncate"
                style={{ fontSize: '10.5px', color: C.tenue }}
                title="Imputado a Estructura: no es costo de ninguna obra."
              >
                Estructura
              </span>
            )}
            {c.imputacion === 'sin_resolver' && (
              <span
                className="block truncate"
                style={{ fontSize: '10.5px', color: C.warn }}
                title="Este rótulo no está en el diccionario de obras: el gasto no llega a ninguna obra. Se resuelve declarando el alias."
              >
                sin resolver
              </span>
            )}
          </>
        )}
      </span>
      {sinObra && (
        <span title="Sin imputar a obra" style={{ display: 'flex', color: C.neg, flexShrink: 0 }}>
          <IcoAlerta s={13} />
        </span>
      )}
    </div>
  )
}

export function TablaCompras({
  filas,
  seleccionado,
  hrefDe,
}: {
  filas: ComprobanteCompra[]
  seleccionado?: string
  hrefDe: (id: string) => string
}) {
  const suma = totalDeLaVista(filas)
  const afuera = suma.sinImporte + suma.sinSigno
  const sinObra = filas.filter((c) => c.imputacion === 'sin_identificar' || (!c.obra_texto?.trim() && !c.imputacion)).length

  return (
    <TarjetaTabla testid="tabla-compras" cols={COLS}>
      <EncabezadoCanon
        cols={COLS}
        columnas={[
          { rotulo: 'FECHA' },
          { rotulo: 'PROVEEDOR' },
          { rotulo: 'COMPROBANTE' },
          { rotulo: 'OBRA' },
          { rotulo: 'ESTADO' },
          { rotulo: 'MONTO', alineacion: 'derecha' },
          { rotulo: '', vacia: true },
        ]}
      />

      {filas.map((c) => {
        const control: Control = controlDe(c)
        return (
          <FilaCanon
            key={c.id}
            cols={COLS}
            alto={ALTO.fila}
            seleccionada={c.id === seleccionado}
            testid="fila-compra"
            // El estado va al DOM aunque la columna no lo dibuje: es lo que deja verificar una fila
            // normal desde un test sin depender de un texto que el diseño decidió no escribir.
            data-control={control.clave}
          >
            <CeldaTexto mono tam="11.5px" color={C.apagado}>{diaMes(c.fecha_emision) ?? '—'}</CeldaTexto>

            <span style={{ minWidth: 0 }}>
              <Link
                href={hrefDe(c.id)}
                prefetch={false}
                data-testid="abrir-compra"
                className="block truncate hover:underline"
                style={{ fontSize: '12.5px', color: c.emisor_nombre?.trim() ? C.tinta : C.tenue }}
              >
                {c.emisor_nombre?.trim() || 'sin proveedor'}
              </Link>
            </span>

            <span style={{ minWidth: 0 }}>
              <span className="block truncate font-mono tabular-nums" style={{ fontSize: '12px', color: c.comprobante ? C.tinta : C.tenue }}>
                {c.comprobante || 'sin número'}
              </span>
              <span className="block truncate" style={{ fontSize: '10.5px', color: C.tenue }}>{c.tipo_nombre}</span>
            </span>

            <Imputada c={c} />

            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
              {/* SINCRONIZADA NO DIBUJA NADA — `COMPONENTS.md` §Sync state, textual: «la
                  sincronización con el Sheet no se celebra». Era el estado de la enorme mayoría de
                  las filas, así que la columna decía lo mismo treinta veces y el problema real
                  quedaba escondido entre treinta confirmaciones de que todo va bien. Confirmada SÍ
                  se escribe: no es el estado de una máquina, es una persona que miró el papel. */}
              {control.clave !== 'sincronizada' && (
                <Estado tono={control.tono} clave={control.clave}>{control.etiqueta}</Estado>
              )}
            </div>

            <CeldaTexto mono alineacion="derecha"><Importe c={c} /></CeldaTexto>

            <span />
          </FilaCanon>
        )
      })}

      {filas.length === 0 && (
        <VacioCanon testid="compras-vacio">Ningún comprobante de compra coincide con este filtro.</VacioCanon>
      )}

      {/* EL PIE DICE «EN PANTALLA», NO «EL LIBRO». Con un filtro puesto o con el tope recortando,
          suma un subconjunto: rotularlo «Total» a secas lo convertiría en una afirmación sobre la
          empresa que no es cierta. Y los que no se pudieron sumar se cuentan al lado — un total que
          se come en silencio los comprobantes sin importe miente hacia abajo.

          DESVÍO DECLARADO: el canónico cierra con «A PAGAR» y «TOTAL DEL MES». Ninguno de los dos
          tiene fuente. El libro de ARCA no guarda si el comprobante está pagado —eso vive en el
          Flujo de Caja, que es percibido— y «del mes» sería una ventana de tiempo que esta lista no
          filtra: mezclarlas es la regla de oro 3. */}
      {filas.length > 0 && (
        <PieCanon
          totales={[
            { rotulo: 'EN PANTALLA', valor: entero(filas.length) ?? '0' },
            { rotulo: 'SIN IMPUTAR', valor: entero(sinObra) ?? '0', color: sinObra > 0 ? C.neg : C.tinta },
            ...(afuera > 0
              ? [{ rotulo: 'SIN SUMAR', valor: entero(afuera) ?? '0', color: C.warn, testid: 'total-fuera-de-suma' }]
              : []),
            {
              rotulo: 'TOTAL',
              valor: suma.total === null ? 'sin importes' : (pesos(suma.total) ?? 'sin importes'),
              color: suma.total !== null && suma.total < 0 ? C.pos : C.tinta,
              fuerte: true,
              testid: 'total-compras',
            },
          ]}
        />
      )}
    </TarjetaTabla>
  )
}
