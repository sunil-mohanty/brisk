"""Campaigns sent from the WhatsApp Business number: which message belongs to which campaign, and "Stop offers".

Revision ID: 0013_wa_campaigns
Revises: 0012_campaign_draft
"""

import sqlalchemy as sa
from alembic import op

revision = "0013_wa_campaigns"
down_revision = "0012_campaign_draft"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("wa_opt_out", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("outbound_messages", sa.Column("campaign_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_outbound_messages_campaign_id", "outbound_messages", "campaigns", ["campaign_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_outbound_messages_campaign_id", "outbound_messages", ["campaign_id"])


def downgrade() -> None:
    op.drop_index("ix_outbound_messages_campaign_id", table_name="outbound_messages")
    op.drop_constraint("fk_outbound_messages_campaign_id", "outbound_messages", type_="foreignkey")
    op.drop_column("outbound_messages", "campaign_id")
    op.drop_column("customers", "wa_opt_out")
