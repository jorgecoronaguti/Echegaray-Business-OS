// EL HUECO DE LA FECHA EN LA PLANTILLA DEL DÍA — lo nombran los dos lados del borde.
//
// Vive en un módulo SIN `'use client'` porque el servidor arma la plantilla con él
// (`BloqueAsistenciaDia`) y el cliente lo reemplaza por la fecha elegida (`ElegirDia`). Cuando el
// valor vivía en `ElegirDia`, el Server Component importaba un VALOR de un módulo `'use client'`:
// eso arrastra el módulo entero al grafo del servidor y rompe el borde. Lo prohíbe
// `orquestador/lib/frontera-servidor-cliente.test.mjs`, que es quien encontró esto.
export const TOKEN_DIA = '__DIA__'
