"""Campaign headlines and the owner's own campaign templates.

Revision ID: 0011_offer_templates
Revises: 0010_campaigns_addon
"""

import sqlalchemy as sa
from alembic import op

revision = "0011_offer_templates"
down_revision = "0010_campaigns_addon"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("campaigns", sa.Column("headline", sa.String(length=120), nullable=True))
    op.add_column("businesses", sa.Column("offer_templates", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("businesses", "offer_templates")
    op.drop_column("campaigns", "headline")
