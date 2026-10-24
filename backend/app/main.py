from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import Base, engine
from .timing import TimingMiddleware
from .routers import admin, appointments, auth, campaigns, catalog, customers, dashboard, inventory, leads, linkpage, messages, public, qr, quotes, services, team


@asynccontextmanager
async def lifespan(app: FastAPI):
    if get_settings().create_tables_on_startup:
        Base.metadata.create_all(engine)  # local dev convenience; use Alembic in production
    yield


app = FastAPI(title=f"{get_settings().brand_name} API", version="0.1.0", lifespan=lifespan)
app.add_middleware(TimingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, customers, leads, qr, quotes, services, catalog, dashboard, public, admin, appointments, team, linkpage, campaigns, inventory, messages):
    app.include_router(r.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True}
