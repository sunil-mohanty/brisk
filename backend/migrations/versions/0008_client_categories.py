"""Owner-defined client categories (at most 4 per business). Tags already in use become the categories.

Revision ID: 0008_categories
Revises: 0007_client_tags
"""

import json
from collections import Counter

import sqlalchemy as sa
from alembic import op

revision = "0008_categories"
down_revision = "0007_client_tags"
branch_labels = None
depends_on = None


def _list(v):
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            return []
    return v or []


def upgrade() -> None:
    op.add_column("businesses", sa.Column("client_categories", sa.JSON(), nullable=False, server_default="[]"))
    conn = op.get_bind()
    biz = sa.table("businesses", sa.column("id", sa.Integer), sa.column("client_categories", sa.JSON))
    cus = sa.table("customers", sa.column("id", sa.Integer), sa.column("business_id", sa.Integer), sa.column("tags", sa.JSON))
    by_biz: dict[int, list] = {}
    for cid, bid, tags in conn.execute(sa.select(cus.c.id, cus.c.business_id, cus.c.tags)):
        by_biz.setdefault(bid, []).append((cid, _list(tags)))
    for bid, rows in by_biz.items():
        counts = Counter(t for _, tags in rows for t in tags)
        if not counts:
            continue
        keep = [t for t, _ in counts.most_common(4)]
        conn.execute(biz.update().where(biz.c.id == bid).values(client_categories=keep))
        for cid, tags in rows:
            if any(t not in keep for t in tags):
                conn.execute(cus.update().where(cus.c.id == cid).values(tags=[t for t in tags if t in keep]))


def downgrade() -> None:
    op.drop_column("businesses", "client_categories")
