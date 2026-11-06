from copy import deepcopy

import pytest

from mlflow.entities import MCPAccessEndpoint
from mlflow.exceptions import MlflowException
from mlflow.utils.validation import (
    MAX_MCP_MEMBER_NAME_LENGTH,
    MAX_MODEL_REGISTRY_TAG_VALUE_LENGTH,
    _validate_agent_plugin_mcp_servers,
    _validate_agent_plugin_name,
    _validate_organization_name,
    _validate_skill_alias,
    _validate_skill_artifact_path,
    _validate_skill_name,
    _validate_skill_tag,
    _validate_skill_version,
)


@pytest.mark.parametrize("name", ["code-review", "x", "123"])
def test_valid_skill_names(name):
    _validate_skill_name(name)


@pytest.mark.parametrize("name", ["", "@acme", "a/b", "a@b", "a#b", "a?b"])
def test_invalid_skill_names(name):
    with pytest.raises(MlflowException, match="[Ss]kill name"):
        _validate_skill_name(name)


@pytest.mark.parametrize(
    "name",
    ["Code-review", "code_review", "code.review", "code-review-", "code--review", "a" * 65],
)
def test_skill_name_rejects_values_outside_rfc_contract(name):
    with pytest.raises(MlflowException, match="[Ss]kill name"):
        _validate_skill_name(name)


@pytest.mark.parametrize("name", ["pr-workflow", "pr.workflow", "1.0.0", "acme"])
def test_valid_agent_plugin_names(name):
    _validate_agent_plugin_name(name)


def test_agent_plugin_name_rejects_reserved_chars():
    _validate_agent_plugin_name("pr-workflow")
    with pytest.raises(MlflowException, match="plugin name"):
        _validate_agent_plugin_name("pr/workflow")


@pytest.mark.parametrize(
    "name",
    ["PR-workflow", "pr_workflow", "pr-workflow-", "pr..workflow", "pr--workflow", "a" * 65],
)
def test_agent_plugin_name_rejects_values_outside_rfc_contract(name):
    with pytest.raises(MlflowException, match="plugin name"):
        _validate_agent_plugin_name(name)


@pytest.mark.parametrize(
    "organization",
    ["Acme.io", "acme_labs", "acme.io.", "acme..io", "acme--labs", "a" * 65],
)
def test_organization_rejects_values_outside_rfc_contract(organization):
    with pytest.raises(MlflowException, match="[Oo]rganization"):
        _validate_organization_name(organization)


@pytest.mark.parametrize("organization", ["", "acme", "acme.io", "acme-labs"])
def test_organization_accepts_rfc_examples(organization):
    _validate_organization_name(organization)


def test_organization_rejects_none():
    with pytest.raises(MlflowException, match="[Oo]rganization"):
        _validate_organization_name(None)


@pytest.mark.parametrize("org", ["", "acme", "acme.com", "acme-labs"])
def test_valid_organization_names(org):
    _validate_organization_name(org)


@pytest.mark.parametrize("org", ["@acme", "a/b", "a@b"])
def test_invalid_organization_names(org):
    with pytest.raises(MlflowException, match="[Oo]rganization"):
        _validate_organization_name(org)


@pytest.mark.parametrize("version", [1, 2, 999, 2_147_483_647])
def test_valid_skill_versions(version):
    _validate_skill_version(version)


@pytest.mark.parametrize("version", [0, -1, "1", 1.0, True, None, 2_147_483_648])
def test_invalid_skill_versions(version):
    with pytest.raises(MlflowException, match="positive integer"):
        _validate_skill_version(version)


def test_skill_alias_reuses_model_alias_rules():
    _validate_skill_alias("production")
    with pytest.raises(MlflowException, match="[Ll]atest"):
        _validate_skill_alias("latest")


def test_skill_tag_validates_key_and_value():
    _validate_skill_tag("team", "platform")
    with pytest.raises(MlflowException, match="Missing value for required parameter"):
        _validate_skill_tag(None, "v")
    with pytest.raises(MlflowException, match="Tag value cannot be None"):
        _validate_skill_tag("team", None)


def test_skill_tag_uses_registry_tag_value_limits():
    value = "x" * 9000
    assert _validate_skill_tag("team", value).value == value

    with pytest.raises(MlflowException, match="exceeds the maximum length"):
        _validate_skill_tag("team", "x" * (MAX_MODEL_REGISTRY_TAG_VALUE_LENGTH + 1))


@pytest.mark.parametrize("path", ["code-review", "a/b/c", "dir/file.md"])
def test_valid_artifact_paths(path):
    _validate_skill_artifact_path(path)


@pytest.mark.parametrize(
    "path",
    [
        "/abs",
        "../escape",
        "a/../b",
        "a//b",
        "",
        "a/%2e%2e/b",
        "C:\\evil",
        "a/%2e/b",
        "a%2f%2fb",
        "a\nb",
        "a%0Ab",
    ],
)
def test_invalid_artifact_paths(path):
    with pytest.raises(MlflowException, match="path"):
        _validate_skill_artifact_path(path)


def test_artifact_path_decode_limit_raises_mlflow_exception():
    path = "%25252525252525252525252e"
    with pytest.raises(MlflowException, match="path"):
        _validate_skill_artifact_path(path)


@pytest.mark.parametrize("members", [None, {}])
def test_plugin_without_mcp_members(members):
    _validate_agent_plugin_mcp_servers(members)


def test_plugin_mcp_members_preserve_new_and_fetched_values():
    reference = MCPAccessEndpoint(
        id="ae-existing", client_config={"unknown": "stored configuration"}, created_by="publisher"
    )
    members = {
        "Mixed Case / Local Name": reference,
        "second-reference": reference,
        "x" * MAX_MCP_MEMBER_NAME_LENGTH: MCPAccessEndpoint(id="opaque-id"),
        "remote": MCPAccessEndpoint(
            client_config={
                "type": "streamable-http",
                "url": "https://example.com/mcp",
                "headers": {
                    "X-Tenant": "public tenant",
                    "X-Empty": "",
                    "X-Tab": "internal\ttab",
                },
            }
        ),
        "local": MCPAccessEndpoint(
            client_config={
                "type": "stdio",
                "command": "./bin/my server",
                "args": ["${PLUGIN_ROOT}", "${UNKNOWN}"],
                "env": {"CONFIG": "literal"},
                "cwd": "${PLUGIN_DATA}/state",
            }
        ),
        "legacy": MCPAccessEndpoint(
            url="https://example.com", server_name="test/server", server_alias="latest"
        ),
    }
    original = deepcopy(members)
    _validate_agent_plugin_mcp_servers(members)
    assert members == original


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/mcp",
        "http://127.0.0.2/mcp",
        "http://[::1]/mcp",
        "http://[::1]:8080/mcp",
        "https://[2001:DB8::1]/mcp",
        "https://[2001:DB8::1]:8443/mcp",
        "https://example.com/mcp%20tools%2Fsearch?value=%2f%25",
    ],
)
def test_plugin_mcp_valid_remote_url(url):
    endpoint = MCPAccessEndpoint(client_config={"type": "sse", "url": url})
    _validate_agent_plugin_mcp_servers({"local": endpoint})
    assert endpoint.client_config["url"] == url


@pytest.mark.parametrize(
    ("members", "field"),
    [
        ([], "mcp_servers"),
        ({1: MCPAccessEndpoint(id="ae-1")}, "keys"),
        (
            {"x" * (MAX_MCP_MEMBER_NAME_LENGTH + 1): MCPAccessEndpoint(id="ae-1")},
            str(MAX_MCP_MEMBER_NAME_LENGTH),
        ),
        ({"search": {"id": "ae-1"}}, "MCPAccessEndpoint"),
        ({"search": MCPAccessEndpoint(id="")}, "id"),
        ({"search": MCPAccessEndpoint(id=1)}, "id"),
    ],
)
def test_plugin_mcp_invalid_members(members, field):
    with pytest.raises(MlflowException, match=field):
        _validate_agent_plugin_mcp_servers(members)


@pytest.mark.parametrize(
    ("fields", "error"),
    [
        ({}, "client_config.type"),
        ({"server_version": "1.0.0"}, "server_version requires server_name"),
        ({"server_alias": "latest"}, "server_alias requires server_name"),
        (
            {"server_name": "test/server", "server_version": "1", "server_alias": "latest"},
            "mutually exclusive",
        ),
        ({"server_name": 1}, "server_name"),
        (
            {
                "client_config": {"type": "sse", "url": "https://example.com"},
                "url": "https://other.example.com",
            },
            "url conflicts",
        ),
        (
            {"client_config": {"type": "stdio", "command": "server"}, "transport_type": "sse"},
            "transport_type conflicts",
        ),
    ],
)
def test_plugin_mcp_invalid_creation(fields, error):
    with pytest.raises(MlflowException, match=rf"mcp_servers\['search'\].*{error}"):
        _validate_agent_plugin_mcp_servers({"search": MCPAccessEndpoint(**fields)})


@pytest.mark.parametrize(
    ("config", "field"),
    [
        ([], "client_config"),
        ({"type": "unknown"}, "type"),
        (
            {"type": "stdio", "command": "server", "url": "https://example.com"},
            "unsupported fields",
        ),
        ({"type": "stdio"}, "command"),
        ({"type": "stdio", "command": "server --arg"}, "command"),
        ({"type": "stdio", "command": "/bin/server"}, "command"),
        ({"type": "stdio", "command": "server", "args": [1]}, "args"),
        ({"type": "stdio", "command": "server", "env": {"SETTING": 1}}, "env"),
        ({"type": "stdio", "command": "server", "env": {"PLUGIN_ROOT": "override"}}, "env"),
        ({"type": "stdio", "command": "server", "cwd": "relative"}, "cwd"),
        ({"type": "sse", "url": "https://example.com", "headers": []}, "headers"),
        (
            {
                "type": "sse",
                "url": "https://example.com",
                "headers": {"X-Test": "a", "x-test": "b"},
            },
            "headers",
        ),
        ({"type": "sse", "url": "https://example.com", "headers": {"Bad Name": "a"}}, "headers"),
        (
            {
                "type": "sse",
                "url": "https://example.com",
                "headers": {"X-Test": "private-value\r\n"},
            },
            "headers",
        ),
    ],
)
def test_plugin_mcp_invalid_configuration(config, field):
    with pytest.raises(MlflowException, match=rf"mcp_servers\['search'\].*{field}") as exc:
        _validate_agent_plugin_mcp_servers({"search": MCPAccessEndpoint(client_config=config)})
    assert "private-value" not in str(exc.value)


@pytest.mark.parametrize("value", [" leading", "trailing ", "\tleading", "trailing\t", " \t"])
def test_plugin_mcp_header_value_rejects_boundary_whitespace(value):
    config = {
        "type": "streamable-http",
        "url": "https://example.com/mcp",
        "headers": {"X-Test": value},
    }
    with pytest.raises(MlflowException, match=r"mcp_servers\['search'\].*header values"):
        _validate_agent_plugin_mcp_servers({"search": MCPAccessEndpoint(client_config=config)})


@pytest.mark.parametrize(
    "url",
    [
        "relative",
        "http://example.com",
        "http://localhost.example.com",
        "https://user:private-value@example.com",
        "https://example.com/#fragment",
        "https://example.com:invalid",
        "https://example.com/\nprivate-value",
        "http://[::1]example.com/mcp",
        "https://[::1]example.com/mcp",
        "https://example.com[::1]/mcp",
        "https://[::1]example.com:443/mcp",
        "https://example.com/mcp%zz",
        "https://example.com%/mcp",
        "https://example.com/mcp%",
        "https://example.com/mcp%A",
        "https://example.com/mcp?value=%2G",
    ],
)
def test_plugin_mcp_invalid_url_does_not_echo_values(url):
    with pytest.raises(MlflowException, match=r"mcp_servers\['search'\].*url") as exc:
        _validate_agent_plugin_mcp_servers({
            "search": MCPAccessEndpoint(client_config={"type": "streamable-http", "url": url})
        })
    assert "private-value" not in str(exc.value)
