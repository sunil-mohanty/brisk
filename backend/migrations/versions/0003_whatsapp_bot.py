"""WhatsApp bot: inbound message log, Meta message ids and quote links on outgoing messages.

Revision ID: 0003_whatsapp
Revises: 0002_booking
"""

import sqlalchemy as sa
from alembic import op

revision = "0003_whatsapp"
down_revision = "0002_booking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("outbound_messages", sa.Column("quote_id", sa.Integer(), nullable=True))
    op.add_column("outbound_messages", sa.Column("wa_message_id", sa.String(120), nullable=True))
    op.create_foreign_key("fk_outbound_messages_quote_id", "outbound_messages", "quotes", ["quote_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_outbound_messages_wa_message_id", "outbound_messages", ["wa_message_id"])
    op.create_table(
        "whatsapp_inbound",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("wa_message_id", sa.String(120), nullable=False, unique=True),
        sa.Column("from_phone", sa.String(40), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("payload", sa.String(500), nullable=True),
        sa.Column("business_id", sa.Integer(), sa.ForeignKey("businesses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_whatsapp_inbound_from_phone", "whatsapp_inbound", ["from_phone"])
    op.create_index("ix_whatsapp_inbound_created_at", "whatsapp_inbound", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_inbound_created_at", "whatsapp_inbound")
    op.drop_index("ix_whatsapp_inbound_from_phone", "whatsapp_inbound")
    op.drop_table("whatsapp_inbound")
    op.drop_index("ix_outbound_messages_wa_message_id", "outbound_messages")
    op.drop_constraint("fk_outbound_messages_quote_id", "outbound_messages", type_="foreignkey")
    op.drop_column("outbound_messages", "wa_message_id")
    op.drop_column("outbound_messages", "quote_id")
