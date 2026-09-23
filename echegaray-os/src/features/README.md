# `features/` — un dominio de negocio por carpeta

Cada carpeta es un **dominio real de la empresa** (obras, clientes, compras, efectivo, liquidación),
no una feature de producto ni una pantalla. Si algo no se puede nombrar como lo nombra el negocio, no
es una feature: es `shared/`.

## Cómo se arma una

```
features/<dominio>/
  components/   React. Lo que se dibuja.
  services/     La lógica y las lecturas. Acá vive casi todo el valor.
  types/        Los tipos del dominio.
```

`hooks/` y `store/` sólo si hacen falta. **No hay Zustand ni ningún store global**: el estado de
servidor lo resuelve el App Router (Server Components y `revalidate`), y el de pantalla, la URL —los
filtros, la solapa abierta y la entrega elegida son parámetros, para que un enlace abra lo mismo que
la persona está viendo.

## Las tres reglas que se verifican solas

**1. La lógica va en un servicio PURO y probado.** Una función que recibe datos y devuelve datos, con
su `*.test.ts` al lado (`node --test`). El componente dibuja; no decide. Lo que un test no puede
tocar porque está adentro de un `.tsx` es lo que después sale mal en producción sin que nadie se
entere.

**2. Un módulo que cruzan el servidor y el cliente NO lleva `'use client'`.** Ya pasó: las columnas de
una grilla vivían adentro del componente cliente, el Server Component recibía una referencia de
cliente en vez del string y dibujaba el encabezado sin grilla. Un valor compartido por los dos lados
va en su propio archivo neutral; un archivo `'use client'` sólo exporta componentes.

**3. Una feature no importa de otra.** Lo que dos dominios necesitan es de `shared/` (o de
Postgres, si es un concepto del negocio). Un import cruzado convierte dos dominios en uno solo y
después no se puede tocar ninguno.

## Antes de crear una carpeta nueva

Preguntar qué existe hoy que hace eso y por qué no alcanza. La respuesta va escrita en el commit.
Dónde vive cada concepto y cuál es su fuente de verdad: **`.claude/MAPA.md`**.
