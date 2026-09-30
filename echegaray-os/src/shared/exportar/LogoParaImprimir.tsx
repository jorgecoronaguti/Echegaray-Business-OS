// EL LOGO DE LA EMPRESA EN LO QUE SE IMPRIME DESDE EL NAVEGADOR (window.print). Regla del dueño: todo lo que se
// exporta o se imprime lleva el logo. En pantalla no se ve (la app ya tiene su cabecera): sólo sale en el papel.
// Para las hojas que ya lo dibujan como parte de su diseño (recibo, remito) no hace falta: esto es para las
// vistas que se imprimen tal como se ven y no tenían marca.

export function LogoParaImprimir({ alto = 44 }: { alto?: number }) {
  return (
    <>
      <style>{'.logo-solo-impresion { display: none } @media print { .logo-solo-impresion { display: block !important } }'}</style>
      <img className="logo-solo-impresion" src="/marca/logo.png" alt="Echegaray Construcciones S.A.S." height={alto}
        style={{ height: alto, width: 'auto', marginBottom: 6 }} />
    </>
  )
}
