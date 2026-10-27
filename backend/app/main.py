from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .security import manager_writes, require_manager, require_perm
from .db import Base, engine
from .timing import TimingMiddleware
from .routers import admin, appointments, auth, campaigns, catalog, customers, dashboard, inventory, leads, linkpage, media, messages, public, qr, quotes, services, social, staff_routes, team, whatsapp_hook


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

# Who may use what. Staff logins get their own diary, clock-in and leave (see staff.py and the staff
# router); the rest is for owners and managers, or for staff the owner has given that permission.
_GUARDS = {
    customers: [Depends(require_perm("clients"))], leads: [Depends(require_perm("clients"))],
    quotes: [Depends(require_perm("clients"))], services: [Depends(require_perm("clients"))],
    qr: [Depends(require_manager)], dashboard: [Depends(require_manager)], linkpage: [Depends(require_manager)],
    campaigns: [Depends(require_manager)], inventory: [Depends(require_manager)], messages: [Depends(require_manager)],
    media: [Depends(require_manager)],  # social.py guards its own routes (its OAuth callback has no login)
    catalog: [Depends(manager_writes)], team: [Depends(manager_writes)],
}
for r in (auth, customers, leads, qr, quotes, services, catalog, dashboard, public, admin, appointments, team, linkpage, campaigns, inventory, messages, whatsapp_hook, social, media, staff_routes):
    app.include_router(r.router, prefix="/api", dependencies=_GUARDS.get(r, []))


@app.get("/api/health")
def health():
    return {"ok": True}
