"""Campaigns can be saved as a draft while the owner previews them in New campaign.

Revision ID: 0012_campaign_draft
Revises: 0011_offer_templates
"""

import sqlalchemy as sa
from alembic import op

revision = "0012_campaign_draft"
down_revision = "0011_offer_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("campaigns", sa.Column("draft", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("campaigns", "draft")
