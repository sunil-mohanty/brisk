"""Per-request timing, so slowness can be traced from Railway's logs.

Every API response gets a `Server-Timing` header (visible in the browser's
Network tab), and requests slower than SLOW_MS are logged with how many
database queries they made and how long those took. If most of the time is
database time, the API and Postgres are probably in different regions.
"""

import logging
import time
from contextvars import ContextVar

from sqlalchemy import event
from sqlalchemy.engine import Engine
from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = logging.getLogger("salon.timing")
SLOW_MS = 500
_stats: ContextVar[dict | None] = ContextVar("db_stats", default=None)


@event.listens_for(Engine, "before_cursor_execute")
def _before(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault("_t0", []).append(time.perf_counter())


@event.listens_for(Engine, "after_cursor_execute")
def _after(conn, cursor, statement, parameters, context, executemany):
    t0 = conn.info["_t0"].pop()
    st = _stats.get()
    if st is not None:
        st["n"] += 1
        st["ms"] += (time.perf_counter() - t0) * 1000


class TimingMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        st = {"n": 0, "ms": 0.0}
        token = _stats.set(st)
        t0 = time.perf_counter()

        async def send_wrapper(message: Message):
            if message["type"] == "http.response.start":
                total = (time.perf_counter() - t0) * 1000
                header = f'app;dur={total:.0f}, db;dur={st["ms"]:.0f};desc="{st["n"]} queries"'
                message.setdefault("headers", []).append((b"server-timing", header.encode()))
                if total > SLOW_MS:
                    log.warning(
                        "SLOW %s %s took %.0fms (database: %d queries, %.0fms)",
                        scope["method"], scope["path"], total, st["n"], st["ms"],
                    )
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            _stats.reset(token)
