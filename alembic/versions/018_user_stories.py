"""user_stories table

Revision ID: 018
Revises: 017
Create Date: 2026-05-12
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_stories",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("story_id", sa.String(50), nullable=False),
        sa.Column(
            "ur_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user_requirements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("persona", sa.String(500), nullable=False),
        sa.Column("goal", sa.Text, nullable=False),
        sa.Column("business_value", sa.Text, nullable=False),
        sa.Column("priority", sa.String(20), nullable=False, server_default="must"),
        sa.Column("estimate", sa.String(50), nullable=True),
        sa.Column("acceptance_criteria", sa.Text, nullable=False),
        sa.Column("invest_notes", sa.Text, nullable=True),
        sa.Column("split_recommendation", sa.Text, nullable=True),
        sa.Column("generated_by", sa.String(20), nullable=False, server_default="ai"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("story_id", name="uq_user_stories_story_id"),
    )
    op.create_index("ix_user_stories_ur_id", "user_stories", ["ur_id"])


def downgrade() -> None:
    op.drop_index("ix_user_stories_ur_id", table_name="user_stories")
    op.drop_table("user_stories")
