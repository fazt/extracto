# Extracto

App de una sola página (Next.js) para subir imágenes o PDFs, verlos en una vista
previa y extraer sus datos con un modelo de visión: clasifica el documento como
**factura**, **recibo** o **contrato**, valida los campos con Zod y deja corregir a
mano lo que esté mal, con el documento a la izquierda y el formulario a la derecha.
Al confirmar, los datos pasan a tablas de PostgreSQL y el texto del documento se
indexa como embeddings en **pgvector**; un chat responde preguntas sobre lo guardado
citando el documento de origen, con SQL cuando la pregunta es de cálculo y con
búsqueda semántica cuando va del contenido.

Los archivos y el JSON extraído se guardan en PostgreSQL con la extensión
**pgvector**, lista para añadir embeddings más adelante.

**En producción:** https://extracto.seenode.app

## Requisitos

- Node.js 20+
- Docker

## Puesta en marcha

```bash
cp .env.example .env.local   # DATABASE_URL + OPENROUTER_API_KEY
docker compose up -d         # PostgreSQL + pgvector en localhost:5435
npm install
npm run dev                  # http://localhost:3000
```

El esquema (`db/init/01-schema.sql`) se aplica automáticamente la primera vez que
se crea el volumen de la base de datos.

## Estructura

| Ruta | Descripción |
| --- | --- |
| `src/app/page.tsx` | Única página: subida, vista previa y datos |
| `src/app/datos-form.tsx` | Formulario editable con los campos inválidos en rojo |
| `src/app/chat.tsx` | Chat con citas clicables que abren el documento citado |
| `src/app/api/upload` | `POST` recibe el archivo y lo guarda en `documents` |
| `src/app/api/extract` | `POST {id}` envía el archivo al modelo de visión y guarda el JSON |
| `src/app/api/documents/[id]` | `PATCH` guarda el borrador con las correcciones |
| `src/app/api/confirm` | `POST {id}` valida, escribe en las tablas e indexa el texto |
| `src/app/api/registros` | `GET` lista de documentos confirmados |
| `src/app/api/chat` | `POST {pregunta, historial}` busca por similitud y responde citando |
| `src/lib/busqueda.ts` | Consulta de vecinos más próximos y armado del contexto |
| `src/lib/planificador.ts` | Decide SQL o embeddings y escribe la consulta |
| `src/lib/sql-seguro.ts` | Revisa y ejecuta el SQL generado en modo sólo lectura |
| `src/lib/embeddings.ts` | Troceado del texto y llamada a la API de embeddings |
| `src/lib/schemas/` | Esquemas Zod: forma laxa para el modelo y reglas por tipo |
| `src/app/api/documents` | `GET` lista los últimos 50 archivos |
| `src/app/api/files/[id]` | `GET` devuelve el binario para la vista previa |
| `src/lib/db.ts` | Pool de `pg` reutilizado entre recargas en desarrollo |

## Extracción

`POST /api/extract` manda el archivo a **OpenRouter** y fuerza la respuesta contra el
esquema de `src/lib/extraction-schema.ts` (structured outputs, `strict: true`); el
resultado se valida otra vez con Zod antes de guardarlo.

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | — | Obligatoria |
| `OPENROUTER_MODEL` | `deepseek/deepseek-v4.1-flash` | Modelo de visión |
| `OPENROUTER_PDF_ENGINE` | `mistral-ocr` | Motor con el que OpenRouter convierte los PDFs (`mistral-ocr` lee escaneos; `native` y `cloudflare-ai` son las otras opciones) |
| `OPENROUTER_EMBEDDING_MODEL` | `openai/text-embedding-3-small` | Debe dar 1536 dimensiones, las de la columna `vector(1536)` |

Las imágenes viajan como `image_url` en base64; los PDFs como parte `file` con el
plugin `file-parser`, así que también funcionan los PDFs escaneados. La petición lleva
`provider: { require_parameters: true }` para que OpenRouter no la enrute a un
proveedor que ignore el esquema y devuelva una respuesta vacía.

Campos extraídos: tipo de documento y confianza, emisor y receptor (nombre, NIF/CIF,
dirección), número, fechas, moneda, subtotal/impuestos/total, método de pago, líneas
de detalle y, para contratos, objeto, vigencia, importe, ley aplicable y cláusulas
destacadas. Lo que no aparece en el documento vuelve como `null`, y las dudas quedan
listadas en `notas`.

## Validación

`src/lib/schemas/tipos.ts` define un esquema Zod por tipo de documento; cada uno
decide qué es obligatorio:

| | Factura | Recibo | Contrato | Otro |
| --- | --- | --- | --- | --- |
| Emisor (nombre) | ✓ | ✓ | ✓ | — |
| Receptor (nombre) | ✓ | — | ✓ | — |
| Número | ✓ | — | — | — |
| Fecha de emisión | ✓ | ✓ | — | — |
| Moneda y total | ✓ | ✓ | — | — |
| Base y impuestos | ✓ | — | — | — |
| Al menos una línea | ✓ | — | — | — |
| Objeto e inicio de vigencia | — | — | ✓ | — |

Además se comprueban las reglas que cruzan campos:

- **Fechas**: formato `AAAA-MM-DD` y que la fecha exista (`2026-02-31` se rechaza).
- **Orden**: el vencimiento no puede preceder a la emisión, ni el fin de vigencia al inicio.
- **Aritmética**: `subtotal + impuestos = total`, con dos céntimos de tolerancia por
  redondeo; el mensaje dice la cuenta que sí sale.

Estas reglas cruzadas se evalúan aparte del `safeParse` porque Zod se salta sus
refinements en cuanto falla un campo, y en el formulario interesa ver todos los
problemas a la vez.

Nada de esto bloquea el guardado: un documento con problemas se guarda igual, con
los campos marcados en rojo, porque suelen ser correcciones en curso.

## Despliegue

Está desplegado en [Seenode](https://seenode.com) (Frankfurt) desde la rama `master`
de este repositorio:

| Recurso | Detalle |
| --- | --- |
| App web | Node 24, paquete Basic (0.25 CPU / 512 MB) |
| Base de datos | PostgreSQL 16.14 gestionado, paquete Basic (1 GB), con pgvector 0.8.6 |

- **Build:** `npm ci --include=dev && npm run build`. El `--include=dev` es
  obligatorio: con `NODE_ENV=production`, `npm ci` se saltaría Tailwind y PostCSS,
  que hacen falta para compilar.
- **Arranque:** `node scripts/migrate.mjs && npx next start`. El script aplica
  `db/init/*.sql` (todo idempotente) y deja escrito en el log qué versión de pgvector
  encontró; en local ese trabajo lo hace el entrypoint de Docker.
- **Variables:** `DATABASE_URL` la inyecta Seenode al enlazar la base;
  `OPENROUTER_API_KEY` va como secreto; `DATABASE_SSL=on` fuerza TLS, porque el
  Postgres gestionado rechaza las conexiones sin cifrar.

La entrega continua está activada: cada push a `master` dispara build y despliegue.
Conviene que `npm test` y `npm run build` pasen antes de empujar, porque esa rama es
la que sirve producción.

## Tests

```bash
npm test          # una pasada
npm run test:watch
```

`tests/` cubre los esquemas (cada tipo, fechas, cuadre, mensajes) y las tres rutas de
API con la base de datos y el modelo simulados: subida correcta de PDF e imagen,
tipo no permitido, archivo ausente, exceso de 20 MB, extracción completa, extracción
incompleta (se guarda y devuelve los campos que fallan), respuesta del modelo que no
es JSON, que no cumple el esquema, que llega vacía (se reintenta) o que se corta por
longitud, 401 de OpenRouter, documento inexistente, guardado de correcciones,
troceado y embeddings, y la confirmación completa: transacción con cabecera, líneas,
detalle de contrato y chunks, rechazo si hay campos inválidos, y ROLLBACK si algo
falla a mitad. El chat tiene los suyos: respuesta con cita, fragmentos numerados en el
prompt, fuentes filtradas a las citadas, umbral de similitud, base vacía, historial
recortado y saneado, y los errores del proveedor. El enrutado a SQL tiene los suyos:
consulta ejecutada y citada, transacción de sólo lectura con timeout, rechazo de
INSERT/UPDATE/DELETE/DROP/TRUNCATE, de sentencias encadenadas, de comentarios, del
catálogo del sistema y de tablas ajenas, y la caída a búsqueda semántica cuando la
consulta se rechaza o falla.

## Confirmar: de borrador a tablas

Mientras se revisa, la extracción vive como jsonb en `documents.extraction`; es un
borrador y se guarda tenga los problemas que tenga. **Confirmar y guardar** exige que
la validación esté limpia y entonces, en una única transacción:

1. escribe la cabecera en `registros` y el detalle en `registro_lineas` /
   `registro_contratos`;
2. trocea el texto del documento (~800 caracteres con solape) y guarda cada fragmento
   con su vector en `documento_chunks`.

Los embeddings se piden antes de abrir la transacción, para no dejarla esperando por
la red, y confirmar dos veces reemplaza lo anterior en lugar de duplicarlo.

Buscar por significado es entonces una consulta normal:

```sql
SELECT r.tipo_documento, r.numero_documento, c.texto
  FROM documento_chunks c
  JOIN registros r ON r.document_id = c.document_id
 ORDER BY c.embedding <=> $1   -- $1 = embedding de la consulta
 LIMIT 5;
```

## Chat sobre los documentos

Cada pregunta pasa primero por un planificador que elige el camino:

| Pregunta | Camino |
| --- | --- |
| "¿Cuánto suman las facturas?" · "¿Cuántos documentos hay de cada tipo?" · "¿Qué facturó X en 2026?" | **SQL** sobre las tablas |
| "¿Qué dice el contrato sobre la fianza?" · "¿Qué incluye el mantenimiento?" | **Embeddings** sobre el texto |

### Camino SQL

El planificador devuelve la consulta con structured output, y antes de tocar la base
pasa por `revisarConsulta`: una sola sentencia, sin comentarios ni punto y coma, que
empiece por SELECT o WITH, sin verbos de escritura, sin catálogo del sistema ni
funciones peligrosas, y sólo sobre las cuatro tablas del dominio (las CTE declaradas
en la propia consulta también valen).

La ejecución añade la defensa de verdad: `BEGIN READ ONLY`, `statement_timeout` de
5 s y las filas envueltas en un `LIMIT 100`. Aunque el modelo escribiera un `DELETE`,
Postgres lo rechazaría.

Del resultado se extraen los uuid de documento (por eso se pide `document_id` o
`array_agg(document_id)` en el SELECT), se convierten en las fuentes numeradas y el
modelo redacta la respuesta citándolas. En la interfaz, la consulta ejecutada queda
disponible en un desplegable bajo la respuesta.

Si la consulta se rechaza o falla en Postgres, la pregunta cae al camino semántico en
vez de dejar al usuario sin respuesta.

### Camino semántico

`POST /api/chat` embebe la pregunta, recupera los seis fragmentos más parecidos
(descartando los que bajan de 0,18 de similitud coseno) y se los pasa al modelo
numerados, con instrucción de responder sólo con lo que aparezca ahí y citar cada dato
como `[1]`. La respuesta vuelve con la lista de fuentes que realmente cita; en la
interfaz, cada `[n]` es un botón que abre ese documento en la vista previa.

Tres decisiones que importan:

- **Sin fragmentos relevantes no se llama al modelo**: responde que no encuentra nada,
  en vez de improvisar sobre contexto vacío.
- **Sólo documentos confirmados**: la consulta hace `JOIN` con `registros`, así que los
  borradores no contaminan las respuestas.
- **Sin tokens de razonamiento** (`reasoning: { enabled: false }`): el modelo gastaba la
  mitad del presupuesto razonando y la respuesta se cortaba a media frase.

El historial se reenvía recortado a los seis últimos turnos, y se filtran los mensajes
que no sean `user`/`assistant`.

## Base de datos

| Tabla | Contenido |
| --- | --- |
| `documents` | Archivo original (bytea), su tipo y el borrador `extraction` (jsonb) |
| `registros` | Una fila por documento confirmado: partes, fechas, importes |
| `registro_lineas` | Conceptos de facturas y recibos |
| `registro_contratos` | Objeto, vigencia, ley aplicable y cláusulas |
| `documento_chunks` | Fragmentos de texto y su `vector(1536)`, con índice HNSW |

El esquema se aplica solo (`db/init/*.sql`) la primera vez que se crea el volumen.

## Límites

PNG, JPG, WebP, GIF y PDF, hasta 20 MB por archivo.
