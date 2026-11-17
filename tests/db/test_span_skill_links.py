import uuid
from importlib import import_module

import pytest
import sqlalchemy as sa
from alembic import command
from sqlalchemy.orm import Session

from mlflow.entities.trace_info import TraceInfo
from mlflow.entities.trace_location import TraceLocation
from mlflow.entities.trace_state import TraceState
from mlflow.environment_variables import MLFLOW_ENABLE_WORKSPACES, MLFLOW_TRACKING_URI
from mlflow.store.db.db_types import SQLITE
from mlflow.store.db.utils import _get_alembic_config
from mlflow.store.tracking.dbmodels.models import SqlExperiment, SqlSpanSkillLink, SqlTraceInfo
from mlflow.store.tracking.sqlalchemy_store import SqlAlchemyStore
from mlflow.store.tracking.sqlalchemy_workspace_store import WorkspaceAwareSqlAlchemyStore
from mlflow.utils.workspace_context import WorkspaceContext

pytestmark = pytest.mark.notrackingurimock

MIGRATION = import_module("mlflow.store.db_migrations.versions.c5a8f2d9e731_add_span_skill_links")


@pytest.fixture(params=[False, True], ids=["workspace-disabled", "workspace-enabled"])
def store(request, tmp_path, monkeypatch):
    monkeypatch.setenv(MLFLOW_ENABLE_WORKSPACES.name, str(request.param).lower())
    store_cls = WorkspaceAwareSqlAlchemyStore if request.param else SqlAlchemyStore
    artifact_uri = tmp_path / "artifacts"
    artifact_uri.mkdir()
    with WorkspaceContext("default"):
        store = store_cls(MLFLOW_TRACKING_URI.get(), artifact_uri.as_uri())
        if store.db_type == SQLITE:
            # Direct engine connections bypass ManagedSessionMaker's SQLite pragmas.
            @sa.event.listens_for(store.engine, "connect")
            def _enable_foreign_keys(dbapi_connection, _):
                dbapi_connection.execute("PRAGMA foreign_keys = ON")

        try:
            yield store
        finally:
            if store.db_type == SQLITE:
                sa.event.remove(store.engine, "connect", _enable_foreign_keys)
            store._dispose_engine()


def _start_trace(store, experiment_id):
    return store.start_trace(
        TraceInfo(
            trace_id=f"tr-{uuid.uuid4().hex}",
            trace_location=TraceLocation.from_experiment_id(experiment_id),
            request_time=1234,
            execution_duration=56,
            state=TraceState.OK,
            tags={"test-tag": "preserved"},
            trace_metadata={"test-metadata": "preserved"},
        )
    )


@pytest.fixture
def trace_info(store):
    experiment_id = store.create_experiment(f"skill-links-{uuid.uuid4().hex}")
    try:
        yield _start_trace(store, experiment_id)
    finally:
        with store.ManagedSessionMaker(read_only=False) as session:
            session.execute(
                sa.delete(SqlTraceInfo).where(SqlTraceInfo.experiment_id == int(experiment_id))
            )
            session.execute(
                sa.delete(SqlExperiment).where(SqlExperiment.experiment_id == int(experiment_id))
            )


def _link(trace_id):
    return {
        "trace_id": trace_id,
        "span_id": "unregistered-span",
        "skill_workspace": "unregistered-workspace",
        "skill_name": "unregistered-skill",
        "skill_version": 1,
        "role": "activation",
        "created_at": 1234,
    }


def test_span_skill_links_schema(store):
    inspector = sa.inspect(store.engine)
    columns = {column["name"]: column for column in inspector.get_columns("span_skill_links")}
    lengths = {
        "trace_id": 50,
        "span_id": 50,
        "skill_workspace": 63,
        "skill_organization": 64,
        "skill_name": 128,
        "role": 20,
    }
    assert set(columns) == {*lengths, "skill_version", "created_at"}
    assert all(not column["nullable"] for column in columns.values())
    for name, length in lengths.items():
        assert isinstance(columns[name]["type"], sa.String)
        assert columns[name]["type"].length == length
    assert isinstance(columns["skill_version"]["type"], sa.Integer)
    assert isinstance(columns["created_at"]["type"], sa.BigInteger)
    assert inspector.get_pk_constraint("span_skill_links")["constrained_columns"] == [
        "trace_id",
        "span_id",
        "skill_workspace",
        "skill_organization",
        "skill_name",
        "skill_version",
    ]
    indexes = {index["name"]: index for index in inspector.get_indexes("span_skill_links")}
    assert indexes["ix_span_skill_links_skill"]["column_names"] == [
        "skill_workspace",
        "skill_organization",
        "skill_name",
        "skill_version",
        "trace_id",
    ]
    assert not indexes["ix_span_skill_links_skill"]["unique"]
    (foreign_key,) = inspector.get_foreign_keys("span_skill_links")
    assert foreign_key["constrained_columns"] == ["trace_id"]
    assert foreign_key["referred_table"] == "trace_info"
    assert foreign_key["referred_columns"] == ["request_id"]
    assert foreign_key["options"]["ondelete"] == "CASCADE"


def test_span_skill_links_constraints(store, trace_info):
    # Reflect the table so the omitted organization exercises the database default.
    table = sa.Table("span_skill_links", sa.MetaData(), autoload_with=store.engine)
    link = _link(trace_info.trace_id)
    with store.engine.begin() as connection:
        connection.execute(table.insert(), link)
        assert (
            connection.execute(
                sa.select(table.c.skill_organization).where(table.c.trace_id == trace_info.trace_id)
            ).scalar_one()
            == ""
        )

    # Role is not part of the identity, so it cannot create a second observation.
    with (
        pytest.raises(sa.exc.IntegrityError, match="(?i)unique|duplicate|primary key"),
        store.engine.begin() as connection,
    ):
        connection.execute(table.insert(), {**link, "role": "usage"})
    with (
        pytest.raises(sa.exc.IntegrityError, match="(?i)foreign key"),
        store.engine.begin() as connection,
    ):
        connection.execute(table.insert(), {**link, "trace_id": "missing-trace"})


def test_span_skill_link_organization_default_without_returning(store, trace_info, monkeypatch):
    # MySQL cannot return the server-generated organization in the composite primary key.
    if hasattr(store.engine.dialect, "insert_returning"):
        monkeypatch.setattr(store.engine.dialect, "insert_returning", False)
    with Session(store.engine) as session:
        link = SqlSpanSkillLink(**_link(trace_info.trace_id))
        session.add(link)
        session.commit()

        # Access after commit refreshes the object using its ORM identity.
        assert link.skill_organization == ""


@pytest.mark.parametrize("orm_delete", [False, True], ids=["sql-delete", "orm-delete"])
def test_trace_deletion_removes_skill_links(store, trace_info, orm_delete):
    other_trace = _start_trace(store, trace_info.experiment_id)
    with Session(store.engine) as session, session.begin():
        session.add_all([
            SqlSpanSkillLink(**_link(trace_info.trace_id)),
            SqlSpanSkillLink(**_link(other_trace.trace_id)),
        ])

    with Session(store.engine) as session, session.begin():
        if orm_delete:
            session.delete(session.get(SqlTraceInfo, trace_info.trace_id))
        else:
            session.execute(
                sa.delete(SqlTraceInfo).where(SqlTraceInfo.request_id == trace_info.trace_id)
            )

    with Session(store.engine) as session:
        assert session.query(SqlSpanSkillLink).filter_by(trace_id=trace_info.trace_id).count() == 0
        assert session.query(SqlSpanSkillLink).filter_by(trace_id=other_trace.trace_id).count() == 1


def test_span_skill_links_migration_preserves_traces(store, trace_info):
    config = _get_alembic_config(MLFLOW_TRACKING_URI.get())
    before = store.get_trace_info(trace_info.trace_id).to_dict()
    try:
        command.downgrade(config, MIGRATION.down_revision)
        assert "span_skill_links" not in sa.inspect(store.engine).get_table_names()
        legacy_trace = _start_trace(store, trace_info.experiment_id)
        legacy_before = store.get_trace_info(legacy_trace.trace_id).to_dict()
        command.upgrade(config, MIGRATION.revision)
        assert store.get_trace_info(trace_info.trace_id).to_dict() == before
        assert store.get_trace_info(legacy_trace.trace_id).to_dict() == legacy_before

        new_trace = _start_trace(store, trace_info.experiment_id)
        assert store.get_trace_info(new_trace.trace_id).trace_id == new_trace.trace_id
        with Session(store.engine) as session, session.begin():
            session.add(SqlSpanSkillLink(**_link(trace_info.trace_id)))

        # A downgrade drops link data; re-upgrading restores the schema, not that data.
        command.downgrade(config, MIGRATION.down_revision)
        assert store.get_trace_info(trace_info.trace_id).to_dict() == before
        command.upgrade(config, MIGRATION.revision)
        with Session(store.engine) as session:
            assert (
                session.query(SqlSpanSkillLink).filter_by(trace_id=trace_info.trace_id).count() == 0
            )
        assert store.get_trace_info(new_trace.trace_id).trace_id == new_trace.trace_id
    finally:
        command.upgrade(config, "head")
