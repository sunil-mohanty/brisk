"""Client tags (owner-made segments) and campaigns sent to clients on WhatsApp.

Revision ID: 0007_client_tags
Revises: 0006_quote_pics
"""

import sqlalchemy as sa
from alembic import op

revision = "0007_client_tags"
down_revision = "0006_quote_pics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"))
    op.create_table(
        "campaign_sends",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("campaign_id", "customer_id", name="uq_campaign_send"),
    )
    op.create_index("ix_campaign_sends_campaign_id", "campaign_sends", ["campaign_id"])
    op.create_index("ix_campaign_sends_customer_id", "campaign_sends", ["customer_id"])


def downgrade() -> None:
    op.drop_index("ix_campaign_sends_customer_id", "campaign_sends")
    op.drop_index("ix_campaign_sends_campaign_id", "campaign_sends")
    op.drop_table("campaign_sends")
    op.drop_column("customers", "tags")
