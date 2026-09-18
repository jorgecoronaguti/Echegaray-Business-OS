'use client'

// LA OBRA SE CAMBIA EN LA FILA — pedido del dueño, 15/09/2026, textual: *«tenés que permitirme
// cambiar la obra directamente con desplegable desde ahí sin necesidad de abrir menú de la
// derecha»*.
//
// ═══ ES EL MISMO CIRCUITO DEL PANEL, NO UNO SEGUNDO ═══
//
// Llama a `asignarObraDeCompra`, que entra por la ÚNICA puerta (`compra_obra_asignar`): la base
// valida el rol, que la celda no haya cambiado desde que se miró (`esperado`), guarda en
// `compra_sheet` y encola la escritura de la columna «Obra» del Sheet. La app no escribe el Sheet.
// Duplicar acá la validación o el rótulo sería crear una segunda definición de qué obra es válida.
//
// ═══ POR QUÉ GUARDA AL ELEGIR Y NO CON UN BOTÓN ═══
//
// El panel tiene «Guardar» porque ahí la elección convive con otras ocho propiedades y un botón
// separa mirar de decidir. En la fila no hay nada más que decidir: un botón por fila serían 200
// botones y dos gestos para un cambio de un gesto. El acuse va al lado del desplegable y el error
// de la base se muestra TAL CUAL — un «no se pudo» genérico esconde justamente el caso que importa,
// que es la celda pisada por otra persona mientras esta pantalla estaba abierta.
//
// ═══ EL MISMO CONTROL EN LA FICHA DEL PROVEEDOR (15/09/2026) ═══
//
// La lista de compras de un proveedor lo usa igual. Lo único que cambia es qué pantalla hay que
// refrescar después de guardar: `revalidarProveedor` lleva el id de la ficha abierta. Sin eso, el
// cambio se guarda pero la fila vuelve a dibujarse con lo viejo hasta que alguien recargue — y una
// pantalla que muestra lo viejo después de un ✓ es la pantalla desmintiendo su propio acuse.
//
// ═══ CMD/CTRL+Z Y CMD/CTRL+SHIFT+Z (dueño, 17/09/2026) ═══
//
// Cada elección pasa por `useGuardadoDeshacible`, la MISMA pila que `InlineEdit`. Deshacer vuelve a
// llamar a `asignarObraDeCompra` con la obra anterior y con `esperado` = la que acaba de quedar: si
// otra persona la movió en el medio, la base rechaza y el aviso lo dice, en vez de pisarla. Quien compare
// las cinco superficies: ésta no pasa por `actualizarSiSigueIgual` porque su RPC ya compara y escribe en
// una sola transacción — ver `obraDeCompraActions.ts`.
//
// LO QUE EL DESHACER NO DESHACE ACÁ: la escritura ENCOLADA de la celda del Sheet. Deshacer encola
// otra escritura con la obra anterior — el worker termina escribiendo lo correcto, pero la cola
// queda con los dos pasos. Es el precio de que el Sheet no lo escriba la app.
//
// ═══ LO QUE ESTE CONTROL NO PROMETE ═══
//
// Que la celda del Sheet ya diga eso. Queda guardada en el OS y encolada; el worker la escribe. El
// acuse dice «guardada», no «en el Sheet»: afirmar el efecto que todavía no ocurrió es exactamente
// lo que el principio de cierre prohíbe.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useEstadoDelServidor } from '@/shared/tiempo-real/useEstadoDelServidor'
import { useCeldaViva, useGuardadoDeshacible } from '@/shared/components/deshacer/DeshacerProvider'
import { V } from '@/shared/components/v2/patron'
import { asignarObraDeCompra } from '../services/obraDeCompraActions'

/** El valor con el que el desplegable dice «ninguna»: la fila vuelve a la inferencia del sync. */
const NINGUNA = ''

export function ObraEnLinea({
  fila, celda, rotulo, opciones, editable, inferida, cuerpo, revalidarProveedor,
}: {
  fila: number
  /** El texto de la celda «Obra» tal cual está en la base. Es el `esperado` del control optimista. */
  celda: string | null
  /** Lo que se ve cuando la fila NO se puede editar: el rótulo único ya resuelto. */
  rotulo: string | null
  opciones: string[]
  /** `false` = la base todavía no tiene la columna Obra. Se muestra el rótulo, no un control muerto. */
  editable: boolean
  /** La obra la adivinó el sync a partir de J y K: se dice, no se dibuja como una decisión. */
  inferida: boolean
  /** El cuerpo de la fila, para que el control no invente su propia tipografía. */
  cuerpo: string
  /** El proveedor cuya ficha hay que refrescar además de Compras. La acción sólo acepta un uuid. */
  revalidarProveedor?: string
}) {
  // La obra la puede cambiar otro usuario: se adopta al releer (tiempo real, 16/09/2026).
  const [valor, setValor] = useEstadoDelServidor(celda ?? NINGUNA)
  const [guardado, setGuardado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  // LO QUE LA BASE TIENE HOY según esta pantalla: es el `esperado` de la próxima escritura. Se lee de una
  // referencia y no del estado porque el deshacer lo consulta fuera del render.
  const enBase = useRef(celda ?? NINGUNA)
  const valorRef = useRef(valor)
  useEffect(() => {
    enBase.current = guardado ?? celda ?? NINGUNA
    valorRef.current = valor
  })
  const clave = `obra-de-la-compra-${fila}`

  async function escribir(nuevo: string, esperado?: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const r = await asignarObraDeCompra(fila, nuevo, esperado ?? enBase.current, revalidarProveedor)
    if (!r.ok) return { ok: false, error: r.error }
    setGuardado(nuevo)
    return { ok: true }
  }

  const guardarDeshacible = useGuardadoDeshacible({
    clave,
    rotulo: `Obra de la fila ${fila}`,
    valorAnterior: valor,
    guardar: (v, contexto) => escribir(v, contexto?.esperado),
    formato: (v) => (v === NINGUNA ? 'sin imputar' : v),
    protegido: true,
  })

  useCeldaViva(clave, { actual: () => valorRef.current, aplicar: (v) => setValor(v) })

  // TODOS LOS HOOKS ANTES DE ESTE CORTE: React los cuenta por orden, y un `return` en el medio
  // cambiaría ese orden entre un render y el siguiente.
  if (!editable) {
    return (
      <span className="truncate" style={{ fontSize: cuerpo, color: rotulo ? V.tintaSuave : V.neg }}>
        {rotulo || 'sin imputar'}
      </span>
    )
  }

  // La celda actual puede no estar entre las opciones (una obra fusionada, un texto que no se
  // entendió): se muestra igual para no perderla al dibujar la fila.
  const lista = valor && !opciones.includes(valor) ? [valor, ...opciones] : opciones

  function elegir(nuevo: string) {
    const anterior = valor
    setValor(nuevo)
    setError(null)
    setGuardado(null)
    empezar(async () => {
      const r = await guardarDeshacible(nuevo)
      if (!r.ok) {
        // Vuelve a lo que había: dejar en pantalla una obra que la base rechazó es la pantalla
        // afirmando un cambio que no ocurrió.
        setValor(anterior)
        setError(r.error)
      }
    })
  }

  return (
    <span className="flex min-w-0 items-center gap-[6px]">
      <select
        value={valor}
        disabled={pendiente}
        onChange={(e) => elegir(e.target.value)}
        aria-label={`Obra de la fila ${fila}`}
        data-testid="obra-en-linea"
        className="min-w-0 flex-1 truncate bg-transparent"
        style={{
          fontSize: cuerpo,
          color: valor ? V.tintaSuave : V.neg,
          border: `1px solid ${error ? V.neg : V.lineaFila}`,
          borderRadius: 6,
          padding: '2px 4px',
          cursor: pendiente ? 'wait' : 'pointer',
        }}
      >
        {/* SIN ELEGIR NO ES «SIN OBRA»: es que nadie decidió y manda lo que el sync infirió de J y K.
            El texto lo dice para que nadie lea el vacío como una imputación. */}
        <option value={NINGUNA}>{inferida ? `(inferida) ${rotulo ?? ''}`.trim() : 'sin imputar'}</option>
        {lista.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {/* EL ACUSE ES DE LA FILA Y VIVE EN LA FILA. `aria-live` para que el lector de pantalla lo
          diga sin mover el foco del desplegable, que es donde la persona sigue trabajando. */}
      <span
        aria-live="polite"
        className="shrink-0 truncate"
        style={{ fontSize: '11px', color: error ? V.neg : V.tenue, maxWidth: error ? 120 : 14 }}
        title={error ?? undefined}
        data-testid={error ? 'obra-en-linea-error' : guardado ? 'obra-en-linea-guardada' : undefined}
      >
        {pendiente ? '…' : error ? error : guardado ? '✓' : ''}
      </span>
    </span>
  )
}
