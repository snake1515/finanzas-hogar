# FinanzasHogar — Backend Flask + Supabase

## Estructura
```
finanzas-hogar/
├── app.py                 # arranca la app, sirve API + frontend
├── supabase_client.py     # cliente Supabase (service_role key)
├── decorators.py          # login_required, admin_required
├── routes/
│   ├── auth.py             # login PIN+hash, logout, /me
│   ├── gastos.py
│   ├── ingresos.py
│   ├── prestamos.py
│   ├── usuarios.py
│   ├── tarjetas.py         # sube y procesa PDF de extracto
│   └── porras.py
├── static/
│   └── index.html          # frontend (adaptar: fetch() en vez de localStorage)
├── schema.sql               # correr en Supabase SQL editor
├── requirements.txt
└── .env.example
```

## Setup local
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # y llena SUPABASE_URL / SUPABASE_SERVICE_KEY / SECRET_KEY
python app.py
```

## Antes del primer login
Los usuarios no traen PIN por defecto '1234' como antes — hay que crearlos con PIN
hasheado. Desde Python (o un script rápido):
```python
from routes.auth import hash_pin
print(hash_pin("1234"))
```
Inserta ese hash directamente en Supabase (tabla `usuarios`, columna `pin_hash`) para
el primer usuario admin, ya que crear usuarios normalmente requiere estar logueado
como admin (huevo y gallina la primera vez).

## Desplegar en Render
1. New → Web Service → conecta el repo.
2. Build Command: `pip install -r requirements.txt`
3. Start Command: `gunicorn app:app`
4. Environment → agrega `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SECRET_KEY`.
5. Deploy.

## Qué se generó desde cero (no existía en el repo original)
Como no se tuvo acceso al código JS completo del `index.html` original, estas
partes se **reconstruyeron desde cero** replicando el diseño visual y la
funcionalidad esperada, no copiadas del repo:
- `static/index.html` y `static/app.js` — frontend completo (login, dashboard,
  gastos, ingresos, préstamos, tarjetas, usuarios, porra, perfil), ya conectado
  a la API vía `fetch()`.

## Parser de extracto RappiCard/Davivienda — YA VALIDADO
`routes/tarjetas.py::extraer_movimientos_rappicard` se probó contra un extracto
real y extrajo correctamente los 17 movimientos, incluyendo el caso de
descripciones partidas en dos líneas. Detalles:
- El "monto" que se guarda es el **capital facturado del periodo** (lo que
  realmente se cobra este mes), no el valor total de la compra — para compras
  a cuotas eso es solo una fracción.
- Los pagos/abonos/ajustes (sin cuotas) se marcan con `es_pago_o_ajuste: true`
  para que el frontend no los sume como gasto si no quieres.
- Si Davivienda cambia el diseño del PDF en el futuro, puede que el regex deje
  de matchear — si eso pasa, pásame un extracto nuevo y lo reajusto.

## Pendiente / por probar
- Revisar que las clases CSS y el flujo visual coincidan con lo que tenías en
  mente — este HTML es una reconstrucción, no una copia exacta del original.
- Migrar comprobantes/adjuntos a Supabase Storage en vez de base64 (no
  implementado en esta versión).
- Crear el primer usuario admin manualmente en Supabase (ver sección de arriba).
