"""WhatsApp chats in Leads (auto-reply, the client's messages, unread) and the salon logo.

Revision ID: 0014_wa_chat_logo
Revises: 0013_wa_campaigns
"""

import sqlalchemy as sa
from alembic import op

revision = "0014_wa_chat_logo"
down_revision = "0013_wa_campaigns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("businesses", sa.Column("logo", sa.LargeBinary(), nullable=True))
    op.add_column("businesses", sa.Column("logo_type", sa.String(length=40), nullable=True))
    op.add_column("businesses", sa.Column("logo_version", sa.String(length=16), nullable=True))
    op.add_column("businesses", sa.Column("wa_auto_reply", sa.Text(), nullable=True))
    op.add_column("businesses", sa.Column("wa_home", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("leads", sa.Column("chat_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("whatsapp_inbound", sa.Column("body", sa.Text(), nullable=True))
    op.create_index("ix_whatsapp_inbound_business_id", "whatsapp_inbound", ["business_id"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_inbound_business_id", table_name="whatsapp_inbound")
    op.drop_column("whatsapp_inbound", "body")
    op.drop_column("leads", "chat_seen_at")
    op.drop_column("businesses", "wa_home")
    op.drop_column("businesses", "wa_auto_reply")
    op.drop_column("businesses", "logo_version")
    op.drop_column("businesses", "logo_type")
    op.drop_column("businesses", "logo")
