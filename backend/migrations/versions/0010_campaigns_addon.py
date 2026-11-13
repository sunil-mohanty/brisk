"""Campaigns as an add-on that admins switch on or off per business.

Revision ID: 0010_campaigns_addon
Revises: 0009_staff
"""

import sqlalchemy as sa
from alembic import op

revision = "0010_campaigns_addon"
down_revision = "0009_staff"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Everyone who has it today keeps it.
    op.add_column("businesses", sa.Column("campaigns_enabled", sa.Boolean(), nullable=False, server_default="true"))


def downgrade() -> None:
    op.drop_column("businesses", "campaigns_enabled")
