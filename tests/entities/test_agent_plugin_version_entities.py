from dataclasses import asdict

import pytest

from mlflow.entities.agent_plugin_version import AgentPluginVersion
from mlflow.entities.mcp_access_endpoint import MCPAccessEndpoint
from mlflow.entities.skill import SkillStatus
from mlflow.entities.skill_source import GitSource, MlflowSource, SkillSourceType
from mlflow.exceptions import MlflowException
from mlflow.utils.workspace_utils import resolve_entity_workspace_name


def test_agent_plugin_version_defaults():
    apv = AgentPluginVersion(name="pr-workflow", version="1.0.0")
    assert apv.organization == ""
    assert apv.plugin_json == {}
    assert apv.status == SkillStatus.ACTIVE
    assert apv.skills == []
    assert apv.mcp_servers == {}
    assert apv.status_reason is None
    assert apv.aliases == []
    assert apv.workspace == resolve_entity_workspace_name(None)


def test_agent_plugin_version_from_dict_flat_git_source():
    data = {
        "name": "pr-workflow",
        "version": "1.0.0",
        "organization": "acme",
        "plugin_json": {"name": "pr-workflow", "version": "1.0.0"},
        "source_type": "git",
        "source": "https://github.com/acme/plugins",
        "ref": "v1",
        "skills": ["skills:/code-review/1", "skills:/security-scan@production"],
        "aliases": ["production"],
    }
    apv = AgentPluginVersion.from_dict(data)
    assert apv.source == GitSource(url="https://github.com/acme/plugins", ref="v1")
    assert apv.source_type == SkillSourceType.GIT
    assert apv.mcp_servers == {}
    assert apv.status_reason is None
    assert apv.skills == ["skills:/code-review/1", "skills:/security-scan@production"]
    assert apv.plugin_json == {"name": "pr-workflow", "version": "1.0.0"}


def test_agent_plugin_version_from_dict_preserves_mlflow_subpath():
    data = {
        "name": "pr-workflow",
        "version": "1.0.0",
        "plugin_json": {"name": "pr-workflow", "version": "1.0.0"},
        "source_type": "mlflow",
        "source": "artifacts:/plugins/pr-workflow/1.0.0",
        "subpath": "package",
    }
    assert AgentPluginVersion.from_dict(data).source == MlflowSource(
        artifact_path="artifacts:/plugins/pr-workflow/1.0.0", subpath="package"
    )


@pytest.mark.parametrize("source", [None, "assembled://pr-workflow/1.0.0"])
def test_agent_plugin_version_from_dict_assembled_source(source):
    data = {
        "name": "pr-workflow",
        "version": "1.0.0",
        "plugin_json": {"name": "pr-workflow", "version": "1.0.0"},
        "source_type": "assembled",
        "source": source,
    }
    version = AgentPluginVersion.from_dict(data)
    assert version.source_type == SkillSourceType.ASSEMBLED
    assert version.source == source


def test_agent_plugin_version_from_dict_missing_field():
    with pytest.raises(MlflowException, match="missing required field"):
        AgentPluginVersion.from_dict({"name": "pr-workflow"})


@pytest.mark.parametrize("plugin_json", [None, [], "invalid"])
def test_agent_plugin_version_from_dict_rejects_invalid_plugin_json(plugin_json):
    data = {
        "name": "pr-workflow",
        "version": "1.0.0",
        "plugin_json": plugin_json,
    }
    with pytest.raises(MlflowException, match="plugin_json"):
        AgentPluginVersion.from_dict(data)


def test_agent_plugin_version_from_dict_requires_plugin_json():
    with pytest.raises(MlflowException, match="missing required field.*plugin_json"):
        AgentPluginVersion.from_dict({"name": "pr-workflow", "version": "1.0.0"})


@pytest.mark.parametrize("plugin_json", [{}, {"version": "2.0.0"}])
def test_agent_plugin_version_from_dict_requires_matching_plugin_json_version(plugin_json):
    data = {
        "name": "pr-workflow",
        "version": "1.0.0",
        "plugin_json": plugin_json,
    }
    with pytest.raises(MlflowException, match="plugin_json.*version"):
        AgentPluginVersion.from_dict(data)


@pytest.mark.parametrize("reason", [None, "", "Ready for review"])
def test_agent_plugin_version_status_reason_roundtrip(reason):
    version = AgentPluginVersion.from_dict({
        "name": "plugin",
        "version": "1.0.0",
        "plugin_json": {"version": "1.0.0"},
        "status": "draft",
        "status_reason": reason,
    })
    assert version.status == SkillStatus.DRAFT
    assert version.status_reason == reason
    assert AgentPluginVersion.from_dict(asdict(version)) == version


def test_agent_plugin_version_invalid_status_reason():
    with pytest.raises(MlflowException, match="status_reason must be a string or null"):
        AgentPluginVersion.from_dict({
            "name": "plugin",
            "version": "1.0.0",
            "plugin_json": {"version": "1.0.0"},
            "status_reason": 1,
        })


@pytest.mark.parametrize("skills", [[], ["skills:/review/1"]])
def test_agent_plugin_version_mcp_references_roundtrip(skills):
    version = AgentPluginVersion.from_dict({
        "name": "plugin",
        "version": "1.0.0",
        "plugin_json": {"version": "1.0.0"},
        "skills": skills,
        "mcp_servers": {"search": {"id": "ae-missing"}},
    })
    assert version.skills == skills
    assert version.mcp_servers == {"search": MCPAccessEndpoint(id="ae-missing")}
    assert AgentPluginVersion.from_dict(asdict(version)) == version


@pytest.mark.parametrize("fields", [{}, {"skills": None, "mcp_servers": None}])
def test_agent_plugin_version_empty_members(fields):
    version = AgentPluginVersion.from_dict({
        "name": "plugin",
        "version": "1.0.0",
        "plugin_json": {"version": "1.0.0"},
        **fields,
    })
    assert version.skills == []
    assert version.mcp_servers == {}


@pytest.mark.parametrize(
    "fields",
    [
        {"skills": "x"},
        {"skills": [1]},
        {"mcp_servers": []},
        {"mcp_servers": {1: {}}},
        {"mcp_servers": {"x": 1}},
        {"mcp_servers": {"x": {"id": "ae-1", "client_config": []}}},
    ],
)
def test_agent_plugin_version_invalid_members(fields):
    with pytest.raises(MlflowException, match="Failed to parse AgentPluginVersion response"):
        AgentPluginVersion.from_dict({
            "name": "plugin",
            "version": "1.0.0",
            "plugin_json": {"version": "1.0.0"},
            **fields,
        })


def test_agent_plugin_version_member_defaults_are_independent():
    first = AgentPluginVersion("first", "1.0.0")
    second = AgentPluginVersion("second", "1.0.0")
    first.mcp_servers["search"] = MCPAccessEndpoint(id="ae-1")
    assert second.mcp_servers == {}
