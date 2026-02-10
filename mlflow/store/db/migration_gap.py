"""RHOAI 3.3 -> 3.4 database migration gap detection and fix.

When upgrading from RHOAI 3.3 to 3.4, both releases share the same Alembic HEAD
revision (1b5f0d9ad7c1). Eight intermediate migrations were inserted during the 3.4
rebase but Alembic sees the DB as up-to-date and skips them. This module detects
that gap and programmatically applies the missing migrations + workspace delta.
"""

import importlib
import logging

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

_logger = logging.getLogger(__name__)

# The HEAD revision shared by both RHOAI 3.3 and 3.4.
_WORKSPACE_HEAD_REVISION = "1b5f0d9ad7c1"

# Advisory lock key for PostgreSQL (arbitrary fixed int64).
_PG_ADVISORY_LOCK_KEY = 8436209

# The eight intermediate migrations in dependency order.
_GAP_MIGRATIONS = [
    "1bd49d398cd23_add_secrets_tables",
    "b7c8d9e0f1a2_add_trace_metrics_table",
    "5d2d30f0abce_update_job_table",
    "c9d4e5f6a7b8_add_routing_strategy_to_endpoints",
    "2c33131f4dae_add_online_scoring_configs_table",
    "d3e4f5a6b7c8_add_display_name_to_endpoint_bindings",
    "d0e1f2a3b4c5_add_experiment_id_to_endpoints",
    "c8d9e0f1a2b3_add_span_metrics_and_dimension_attributes",
]

_NAMING_CONVENTION = {
    "pk": "pk_%(table_name)s",
    "fk": "fk_%(table_name)s_%(referred_table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
}

_SQLITE_SECRETS_IMMUTABILITY_TRIGGER = """
CREATE TRIGGER prevent_secrets_aad_mutation
BEFORE UPDATE ON secrets
FOR EACH ROW
WHEN OLD.secret_id != NEW.secret_id OR OLD.secret_name != NEW.secret_name
BEGIN
    SELECT RAISE(ABORT, 'secret_id and secret_name are immutable (used as AAD in encryption)');
END;
"""


def fix_migration_gap_if_needed(engine: sa.engine.Engine) -> None:
    """Detect and fix the RHOAI 3.3 -> 3.4 migration gap.

    Acquires a PostgreSQL advisory lock to prevent concurrent init containers
    from racing. For SQLite (dev/testing), no lock is needed.

    Safe to call on every startup: if no gap is detected, exits immediately.
    """
    dialect = engine.dialect.name

    with engine.begin() as connection:
        if dialect == "postgresql":
            connection.execute(sa.text(f"SELECT pg_advisory_xact_lock({_PG_ADVISORY_LOCK_KEY})"))

        if _has_migration_gap(connection):
            _logger.info(
                "Detected RHOAI 3.3 -> 3.4 migration gap: alembic_version matches HEAD "
                "but intermediate tables are missing. Applying fix..."
            )
            _apply_migration_gap(connection)
            _logger.info("Migration gap fix applied successfully.")
        else:
            _logger.info("No migration gap detected.")


def _has_migration_gap(connection: sa.engine.Connection) -> bool:
    """Detect the RHOAI 3.3 -> 3.4 migration gap.

    Returns True when:
    - alembic_version = '1b5f0d9ad7c1' (the shared HEAD revision)
    - The 'secrets' table does NOT exist (created by the first gap migration)

    This combination uniquely identifies a 3.3 database running 3.4 code.
    """
    mc = MigrationContext.configure(connection)
    current_rev = mc.get_current_revision()
    if current_rev != _WORKSPACE_HEAD_REVISION:
        return False

    inspector = sa.inspect(connection)
    existing_tables = set(inspector.get_table_names())
    return "secrets" not in existing_tables


def _apply_migration_gap(connection: sa.engine.Connection) -> None:
    """Execute the 8 gap migrations and apply workspace delta."""
    mc = MigrationContext.configure(connection)
    with Operations.context(mc):
        _run_gap_migrations()
        _apply_workspace_delta(connection)


def _run_gap_migrations() -> None:
    """Call upgrade() from each of the 8 intermediate migrations in order."""
    for i, module_name in enumerate(_GAP_MIGRATIONS, start=1):
        _logger.info("Applying gap migration %d/%d: %s", i, len(_GAP_MIGRATIONS), module_name)
        module = importlib.import_module(f"mlflow.store.db_migrations.versions.{module_name}")
        module.upgrade()


def _workspace_column():
    return sa.Column(
        "workspace",
        sa.String(length=63),
        nullable=False,
        server_default=sa.text("'default'"),
    )


def _detect_unique_on_column(inspector, table_name: str, column_name: str = "name"):
    """Detect whether uniqueness on a column is enforced via a constraint or index.

    Returns (constraint_name, None) or (None, index_name) or (None, None).
    """
    expected_name = _NAMING_CONVENTION["uq"] % {
        "table_name": table_name,
        "column_0_name": column_name,
    }

    for constraint in inspector.get_unique_constraints(table_name) or []:
        cols = constraint.get("column_names") or []
        name = constraint.get("name")
        if cols == [column_name] or name == expected_name:
            return name or expected_name, None

    for index in inspector.get_indexes(table_name) or []:
        if index.get("unique") and index.get("column_names") == [column_name]:
            return None, index["name"]

    return None, None


def _apply_workspace_delta(connection: sa.engine.Connection) -> None:
    """Apply workspace awareness to tables created by the gap migrations.

    This is the subset of the 3.4 workspace migration (1b5f0d9ad7c1) that was
    NOT in the 3.3 version: workspace columns/constraints on secrets, endpoints,
    model_definitions; fixing the jobs index; adding default_artifact_root to
    the workspaces table.
    """
    from alembic import op

    inspector = sa.inspect(connection)
    dialect_name = connection.dialect.name

    secrets_uc, secrets_ui = _detect_unique_on_column(inspector, "secrets", "secret_name")
    endpoints_uc, endpoints_ui = _detect_unique_on_column(inspector, "endpoints")
    model_defs_uc, model_defs_ui = _detect_unique_on_column(inspector, "model_definitions")

    def _with_batch(table_name):
        return op.batch_alter_table(
            table_name, recreate="auto", naming_convention=_NAMING_CONVENTION
        )

    if dialect_name == "sqlite":
        _apply_workspace_delta_sqlite(
            op,
            _with_batch,
            secrets_uc,
            secrets_ui,
            endpoints_uc,
            endpoints_ui,
            model_defs_uc,
            model_defs_ui,
        )
    else:
        _apply_workspace_delta_direct(
            op,
            secrets_uc,
            secrets_ui,
            endpoints_uc,
            endpoints_ui,
            model_defs_uc,
            model_defs_ui,
        )

    # Create workspace indexes for the new tables
    op.create_index("idx_secrets_workspace", "secrets", ["workspace"])
    op.create_index("idx_endpoints_workspace", "endpoints", ["workspace"])
    op.create_index("idx_model_definitions_workspace", "model_definitions", ["workspace"])

    # Fix the jobs index: migration 3 created it without workspace, restore it with workspace
    op.drop_index("index_jobs_name_status_creation_time", table_name="jobs")
    op.create_index(
        "index_jobs_name_status_creation_time",
        "jobs",
        ["job_name", "workspace", "status", "creation_time"],
    )

    # Add default_artifact_root column to workspaces table (new in 3.4)
    op.add_column(
        "workspaces",
        sa.Column("default_artifact_root", sa.Text(), nullable=True),
    )

    _logger.info(
        "Workspace delta applied to secrets, endpoints, model_definitions, jobs, workspaces"
    )


def _apply_workspace_delta_sqlite(
    op,
    _with_batch,
    secrets_uc,
    secrets_ui,
    endpoints_uc,
    endpoints_ui,
    model_defs_uc,
    model_defs_ui,
):
    """SQLite path: use batch_alter_table to rebuild tables."""
    with _with_batch("secrets") as batch_op:
        if secrets_uc:
            batch_op.drop_constraint(secrets_uc, type_="unique")
        elif secrets_ui:
            batch_op.drop_index(secrets_ui)
        batch_op.add_column(_workspace_column())
        batch_op.create_unique_constraint(
            "uq_secrets_workspace_secret_name",
            ["workspace", "secret_name"],
        )

    # Recreate immutability trigger (batch table rebuild drops triggers on SQLite)
    op.execute("DROP TRIGGER IF EXISTS prevent_secrets_aad_mutation;")
    op.execute(_SQLITE_SECRETS_IMMUTABILITY_TRIGGER)

    with _with_batch("endpoints") as batch_op:
        if endpoints_uc:
            batch_op.drop_constraint(endpoints_uc, type_="unique")
        elif endpoints_ui:
            batch_op.drop_index(endpoints_ui)
        batch_op.add_column(_workspace_column())
        batch_op.create_unique_constraint(
            "uq_endpoints_workspace_name",
            ["workspace", "name"],
        )

    with _with_batch("model_definitions") as batch_op:
        if model_defs_uc:
            batch_op.drop_constraint(model_defs_uc, type_="unique")
        elif model_defs_ui:
            batch_op.drop_index(model_defs_ui)
        batch_op.add_column(_workspace_column())
        batch_op.create_unique_constraint(
            "uq_model_definitions_workspace_name",
            ["workspace", "name"],
        )


def _apply_workspace_delta_direct(
    op,
    secrets_uc,
    secrets_ui,
    endpoints_uc,
    endpoints_ui,
    model_defs_uc,
    model_defs_ui,
):
    """Non-SQLite path (PostgreSQL, MySQL): direct ALTER TABLE statements."""

    def _drop_unique(table, uc, ui):
        if uc:
            op.drop_constraint(uc, table_name=table, type_="unique")
        elif ui:
            op.drop_index(ui, table_name=table)

    _drop_unique("secrets", secrets_uc, secrets_ui)
    op.add_column("secrets", _workspace_column())
    op.create_unique_constraint(
        "uq_secrets_workspace_secret_name",
        "secrets",
        ["workspace", "secret_name"],
    )

    _drop_unique("endpoints", endpoints_uc, endpoints_ui)
    op.add_column("endpoints", _workspace_column())
    op.create_unique_constraint(
        "uq_endpoints_workspace_name",
        "endpoints",
        ["workspace", "name"],
    )

    _drop_unique("model_definitions", model_defs_uc, model_defs_ui)
    op.add_column("model_definitions", _workspace_column())
    op.create_unique_constraint(
        "uq_model_definitions_workspace_name",
        "model_definitions",
        ["workspace", "name"],
    )
