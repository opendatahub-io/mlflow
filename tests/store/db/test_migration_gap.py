import pytest
import sqlalchemy as sa
from alembic import command
from alembic.migration import MigrationContext
from alembic.operations import Operations
from click.testing import CliRunner

import mlflow.db
from mlflow.store.db.migration_gap import (
    _WORKSPACE_HEAD_REVISION,
    _apply_migration_gap,
    _has_migration_gap,
    fix_migration_gap_if_needed,
)
from mlflow.store.db.utils import _get_alembic_config
from mlflow.store.tracking.dbmodels.initial_models import Base as InitialBase

from tests.store.db import rhoai_33_workspace_migration

pytestmark = pytest.mark.notrackingurimock

# The last migration before the 5 gap migrations (shared by 3.3 and 3.4).
_PRE_GAP_REVISION = "bf29a5ff90ea"

# Tables created by the 8 gap migrations.
_GAP_TABLES = {
    "secrets",
    "endpoints",
    "model_definitions",
    "endpoint_model_mappings",
    "endpoint_bindings",
    "endpoint_tags",
    "trace_metrics",
    "online_scoring_configs",
    "span_metrics",
}


def _create_engine(tmp_path, name="migration_gap.sqlite"):
    db_path = tmp_path / name
    url = f"sqlite:///{db_path}"
    return sa.create_engine(url), url


def _prepare_fresh_34_database(tmp_path):
    engine, url = _create_engine(tmp_path, "fresh_34.sqlite")
    InitialBase.metadata.create_all(engine)
    config = _get_alembic_config(url)
    command.upgrade(config, "head")
    return engine, url


def _prepare_pre_gap_database(tmp_path):
    engine, url = _create_engine(tmp_path, "pre_gap.sqlite")
    InitialBase.metadata.create_all(engine)
    config = _get_alembic_config(url)
    command.upgrade(config, _PRE_GAP_REVISION)
    return engine, url


def _simulate_rhoai_33_state(tmp_path):
    """Create a database that faithfully reproduces the RHOAI 3.3 state.

    Runs all migrations up to bf29a5ff90ea, then applies the frozen copy of the
    actual 3.3 workspace migration (including PK/FK restructuring), and stamps
    alembic_version to 1b5f0d9ad7c1.

    The 8 gap migrations (secrets tables, trace_metrics, job rename,
    routing strategy, online_scoring_configs, endpoint_bindings display_name,
    endpoints experiment_id/usage_tracking, span_metrics/dimension_attributes)
    have NOT been applied.
    """
    engine, url = _create_engine(tmp_path, "rhoai_33.sqlite")
    InitialBase.metadata.create_all(engine)
    config = _get_alembic_config(url)
    command.upgrade(config, _PRE_GAP_REVISION)

    with engine.begin() as conn:
        mc = MigrationContext.configure(conn)
        with Operations.context(mc):
            rhoai_33_workspace_migration.upgrade()

        # Stamp alembic_version to the shared HEAD
        conn.execute(
            sa.text("UPDATE alembic_version SET version_num = :rev"),
            {"rev": _WORKSPACE_HEAD_REVISION},
        )

    return engine, url


def _get_table_names(engine):
    inspector = sa.inspect(engine)
    return set(inspector.get_table_names())


def _get_column_names(engine, table_name):
    inspector = sa.inspect(engine)
    return {col["name"] for col in inspector.get_columns(table_name)}


def _get_index_info(engine, table_name, index_name):
    inspector = sa.inspect(engine)
    for idx in inspector.get_indexes(table_name):
        if idx["name"] == index_name:
            return idx
    return None


def _has_unique_constraint(engine, table_name, constraint_columns):
    inspector = sa.inspect(engine)
    for uc in inspector.get_unique_constraints(table_name):
        if uc.get("column_names") == constraint_columns:
            return True
    # Also check unique indexes (SQLite may report as indexes)
    for idx in inspector.get_indexes(table_name):
        if idx.get("unique") and idx.get("column_names") == constraint_columns:
            return True
    return False


def _snapshot_schema(engine):
    inspector = sa.inspect(engine)
    tables = {t for t in inspector.get_table_names() if not t.startswith("alembic_")}
    columns = {}
    indexes = {}
    for table_name in sorted(tables):
        columns[table_name] = {col["name"] for col in inspector.get_columns(table_name)}
        indexes[table_name] = {
            idx["name"]: sorted(idx.get("column_names", []))
            for idx in inspector.get_indexes(table_name)
        }
    return tables, columns, indexes


# ---------------------------------------------------------------------------
# Detection tests
# ---------------------------------------------------------------------------


def test_gap_detected_on_rhoai_33_state(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.connect() as conn:
            assert _has_migration_gap(conn) is True
    finally:
        engine.dispose()


def test_no_gap_on_fresh_34_install(tmp_path):
    engine, _ = _prepare_fresh_34_database(tmp_path)
    try:
        with engine.connect() as conn:
            assert _has_migration_gap(conn) is False
    finally:
        engine.dispose()


def test_no_gap_on_wrong_revision(tmp_path):
    engine, _ = _prepare_pre_gap_database(tmp_path)
    try:
        with engine.connect() as conn:
            assert _has_migration_gap(conn) is False
    finally:
        engine.dispose()


def test_no_gap_without_alembic_version(tmp_path):
    engine, _ = _create_engine(tmp_path, "empty.sqlite")
    try:
        with engine.connect() as conn:
            assert _has_migration_gap(conn) is False
    finally:
        engine.dispose()


# ---------------------------------------------------------------------------
# Fix tests
# ---------------------------------------------------------------------------


def test_creates_missing_tables(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.begin() as conn:
            _apply_migration_gap(conn)

        tables = _get_table_names(engine)
        for table in _GAP_TABLES:
            assert table in tables
    finally:
        engine.dispose()


def test_renames_job_column(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.begin() as conn:
            _apply_migration_gap(conn)

        columns = _get_column_names(engine, "jobs")
        assert "job_name" in columns
        assert "function_fullname" not in columns
    finally:
        engine.dispose()


def test_adds_workspace_columns(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.begin() as conn:
            _apply_migration_gap(conn)

        for table_name in ("secrets", "endpoints", "model_definitions"):
            columns = _get_column_names(engine, table_name)
            assert "workspace" in columns
    finally:
        engine.dispose()


def test_workspace_unique_constraints(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.begin() as conn:
            _apply_migration_gap(conn)

        assert _has_unique_constraint(engine, "secrets", ["workspace", "secret_name"])
        assert _has_unique_constraint(engine, "endpoints", ["workspace", "name"])
        assert _has_unique_constraint(engine, "model_definitions", ["workspace", "name"])
    finally:
        engine.dispose()


def test_workspace_indexes(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.begin() as conn:
            _apply_migration_gap(conn)

        assert _get_index_info(engine, "secrets", "idx_secrets_workspace") is not None
        assert _get_index_info(engine, "endpoints", "idx_endpoints_workspace") is not None
        assert (
            _get_index_info(engine, "model_definitions", "idx_model_definitions_workspace")
            is not None
        )
    finally:
        engine.dispose()


def test_jobs_index_includes_workspace(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.begin() as conn:
            _apply_migration_gap(conn)

        idx = _get_index_info(engine, "jobs", "index_jobs_name_status_creation_time")
        assert idx is not None
        assert idx["column_names"] == ["job_name", "workspace", "status", "creation_time"]
    finally:
        engine.dispose()


def test_adds_default_artifact_root_to_workspaces(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.begin() as conn:
            _apply_migration_gap(conn)

        columns = _get_column_names(engine, "workspaces")
        assert "default_artifact_root" in columns
    finally:
        engine.dispose()


def test_routing_strategy_columns(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.begin() as conn:
            _apply_migration_gap(conn)

        endpoint_cols = _get_column_names(engine, "endpoints")
        assert "routing_strategy" in endpoint_cols
        assert "fallback_config_json" in endpoint_cols

        mapping_cols = _get_column_names(engine, "endpoint_model_mappings")
        assert "linkage_type" in mapping_cols
        assert "fallback_order" in mapping_cols
    finally:
        engine.dispose()


def test_display_name_on_endpoint_bindings(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.begin() as conn:
            _apply_migration_gap(conn)

        cols = _get_column_names(engine, "endpoint_bindings")
        assert "display_name" in cols
    finally:
        engine.dispose()


def test_experiment_id_and_usage_tracking_on_endpoints(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.begin() as conn:
            _apply_migration_gap(conn)

        cols = _get_column_names(engine, "endpoints")
        assert "experiment_id" in cols
        assert "usage_tracking" in cols
    finally:
        engine.dispose()


def test_creates_span_metrics_table(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.begin() as conn:
            _apply_migration_gap(conn)

        tables = _get_table_names(engine)
        assert "span_metrics" in tables

        cols = _get_column_names(engine, "span_metrics")
        assert "trace_id" in cols
        assert "span_id" in cols
        assert "key" in cols
        assert "value" in cols
    finally:
        engine.dispose()


def test_adds_dimension_attributes_to_spans(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.begin() as conn:
            _apply_migration_gap(conn)

        cols = _get_column_names(engine, "spans")
        assert "dimension_attributes" in cols
    finally:
        engine.dispose()


def test_immutability_trigger_on_sqlite(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        with engine.begin() as conn:
            _apply_migration_gap(conn)

        # Insert a secret, then try to update secret_name — should fail
        with engine.begin() as conn:
            conn.execute(
                sa.text(
                    "INSERT INTO secrets "
                    "(secret_id, secret_name, encrypted_value, wrapped_dek, "
                    "kek_version, masked_value, created_at, last_updated_at, workspace) "
                    "VALUES ('id1', 'name1', X'00', X'00', 1, '***', 0, 0, 'default')"
                )
            )

        with pytest.raises(Exception, match="immutable"):
            with engine.begin() as conn:
                conn.execute(
                    sa.text("UPDATE secrets SET secret_name = 'changed' WHERE secret_id = 'id1'")
                )
    finally:
        engine.dispose()


# ---------------------------------------------------------------------------
# Idempotency and data preservation
# ---------------------------------------------------------------------------


def test_idempotent(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        fix_migration_gap_if_needed(engine)
        # Second call should be a no-op (secrets table now exists)
        fix_migration_gap_if_needed(engine)

        tables = _get_table_names(engine)
        for table in _GAP_TABLES:
            assert table in tables
    finally:
        engine.dispose()


def test_existing_data_preserved(tmp_path):
    engine, _ = _simulate_rhoai_33_state(tmp_path)
    try:
        # Seed data in the 3.3-state database
        with engine.begin() as conn:
            conn.execute(
                sa.text(
                    "INSERT INTO experiments "
                    "(experiment_id, name, artifact_location, lifecycle_stage, "
                    "creation_time, last_update_time, workspace) "
                    "VALUES (99, 'test-exp', '/artifacts', 'active', 0, 0, 'default')"
                )
            )
            conn.execute(
                sa.text(
                    "INSERT INTO registered_models "
                    "(name, creation_time, last_updated_time, description, workspace) "
                    "VALUES ('test-model', 0, 0, 'desc', 'default')"
                )
            )
            # Insert a job with the 3.3-era column names
            conn.execute(
                sa.text(
                    "INSERT INTO jobs "
                    "(id, function_fullname, params, status, creation_time, "
                    "retry_count, last_update_time, workspace) "
                    "VALUES ('j1', 'my.func', '{}', 0, 0, 0, 0, 'default')"
                )
            )

        fix_migration_gap_if_needed(engine)

        with engine.connect() as conn:
            exp = conn.execute(
                sa.text("SELECT experiment_id, name FROM experiments WHERE experiment_id = 99")
            ).fetchone()
            assert exp is not None
            assert exp[1] == "test-exp"

            rm = conn.execute(
                sa.text("SELECT name FROM registered_models WHERE name = 'test-model'")
            ).fetchone()
            assert rm is not None

            # Job data should be preserved with renamed column
            job = conn.execute(sa.text("SELECT id, job_name FROM jobs WHERE id = 'j1'")).fetchone()
            assert job is not None
            assert job[1] == "my.func"
    finally:
        engine.dispose()


# ---------------------------------------------------------------------------
# Schema comparison
# ---------------------------------------------------------------------------


def test_schema_matches_fresh_install(tmp_path):
    patched_dir = tmp_path / "patched"
    patched_dir.mkdir()
    patched_engine, _ = _simulate_rhoai_33_state(patched_dir)
    fix_migration_gap_if_needed(patched_engine)
    patched_tables, patched_columns, patched_indexes = _snapshot_schema(patched_engine)
    patched_engine.dispose()

    fresh_dir = tmp_path / "fresh"
    fresh_dir.mkdir()
    fresh_engine, _ = _prepare_fresh_34_database(fresh_dir)
    fresh_tables, fresh_columns, fresh_indexes = _snapshot_schema(fresh_engine)
    fresh_engine.dispose()

    assert patched_tables == fresh_tables, (
        f"Table mismatch.\n"
        f"  Missing from patched: {fresh_tables - patched_tables}\n"
        f"  Extra in patched: {patched_tables - fresh_tables}"
    )

    for table_name in sorted(fresh_tables):
        assert patched_columns[table_name] == fresh_columns[table_name], (
            f"Column mismatch in {table_name}.\n"
            f"  Missing from patched: {fresh_columns[table_name] - patched_columns[table_name]}\n"
            f"  Extra in patched: {patched_columns[table_name] - fresh_columns[table_name]}"
        )

    for table_name in ("secrets", "endpoints", "model_definitions", "jobs", "experiments"):
        assert patched_indexes[table_name] == fresh_indexes[table_name], (
            f"Index mismatch in {table_name}.\n"
            f"  Patched: {patched_indexes[table_name]}\n"
            f"  Fresh: {fresh_indexes[table_name]}"
        )


# ---------------------------------------------------------------------------
# CLI command tests
# ---------------------------------------------------------------------------


def test_fix_migration_gap_command_no_gap(tmp_path):
    engine, url = _prepare_fresh_34_database(tmp_path)
    engine.dispose()

    runner = CliRunner()
    result = runner.invoke(mlflow.db.commands, ["fix-migration-gap", url])
    assert result.exit_code == 0


def test_fix_migration_gap_command_with_gap(tmp_path):
    engine, url = _simulate_rhoai_33_state(tmp_path)
    engine.dispose()

    runner = CliRunner()
    result = runner.invoke(mlflow.db.commands, ["fix-migration-gap", url])
    assert result.exit_code == 0

    # Verify the fix was applied
    engine = sa.create_engine(url)
    try:
        tables = _get_table_names(engine)
        for table in _GAP_TABLES:
            assert table in tables
    finally:
        engine.dispose()


def test_fix_migration_gap_command_uses_env_var(tmp_path, monkeypatch):
    engine, url = _simulate_rhoai_33_state(tmp_path)
    engine.dispose()

    monkeypatch.setenv("MLFLOW_BACKEND_STORE_URI", url)
    runner = CliRunner()
    # No URL argument — should pick it up from env var
    result = runner.invoke(mlflow.db.commands, ["fix-migration-gap"])
    assert result.exit_code == 0

    engine = sa.create_engine(url)
    try:
        tables = _get_table_names(engine)
        for table in _GAP_TABLES:
            assert table in tables
    finally:
        engine.dispose()


def test_fix_migration_gap_env_var_takes_precedence(tmp_path, monkeypatch):
    engine, url = _simulate_rhoai_33_state(tmp_path)
    engine.dispose()

    monkeypatch.setenv("MLFLOW_BACKEND_STORE_URI", url)
    runner = CliRunner()
    # Pass a bogus URL as argument — env var should take precedence
    result = runner.invoke(mlflow.db.commands, ["fix-migration-gap", "sqlite:///bogus.db"])
    assert result.exit_code == 0

    engine = sa.create_engine(url)
    try:
        tables = _get_table_names(engine)
        for table in _GAP_TABLES:
            assert table in tables
    finally:
        engine.dispose()


def test_fix_migration_gap_command_no_url_fails(monkeypatch):
    monkeypatch.delenv("MLFLOW_BACKEND_STORE_URI", raising=False)
    runner = CliRunner()
    result = runner.invoke(mlflow.db.commands, ["fix-migration-gap"])
    assert result.exit_code != 0
    assert "No database URL provided" in result.output
