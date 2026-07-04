import { describe, it, expect } from '@jest/globals';
import { DesignSystemProvider } from '@databricks/design-system';
import { screen, renderWithIntl } from '@mlflow/mlflow/src/common/utils/TestUtils.react18';
import type { RegisteredPrompt } from '../types';
import { PromptsListTableModelCell } from './PromptsListTableModelCell';
import { PROMPT_MODEL_CONFIG_TAG_KEY } from '../utils';

const createMockCellContext = (latestVersionTags?: Array<{ key: string; value: string }>) => ({
  row: {
    original: {
      name: 'test-prompt',
      latest_versions: latestVersionTags ? [{ version: '1', tags: latestVersionTags }] : [{ version: '1' }],
    } as RegisteredPrompt,
  },
  table: { options: { meta: {} } },
});

const ModelCell = PromptsListTableModelCell as React.FC<any>;

const renderModelCell = (latestVersionTags?: Array<{ key: string; value: string }>) =>
  renderWithIntl(
    <DesignSystemProvider>
      <ModelCell {...createMockCellContext(latestVersionTags)} />
    </DesignSystemProvider>,
  );

describe('PromptsListTableModelCell', () => {
  it('should render model name when model config tag is present', () => {
    renderModelCell([
      { key: PROMPT_MODEL_CONFIG_TAG_KEY, value: JSON.stringify({ provider: 'openai', model_name: 'gpt-4' }) },
    ]);
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('should render "Not specified" when no model config tag exists', () => {
    renderModelCell([]);
    expect(screen.getByText('Not specified')).toBeInTheDocument();
  });

  it('should render "Not specified" when latest version has no tags', () => {
    renderModelCell(undefined);
    expect(screen.getByText('Not specified')).toBeInTheDocument();
  });

  it('should render "Not specified" when tag value is invalid JSON', () => {
    renderModelCell([{ key: PROMPT_MODEL_CONFIG_TAG_KEY, value: 'not-valid-json' }]);
    expect(screen.getByText('Not specified')).toBeInTheDocument();
  });

  it('should render "Not specified" when model_name is empty', () => {
    renderModelCell([{ key: PROMPT_MODEL_CONFIG_TAG_KEY, value: JSON.stringify({ provider: 'openai' }) }]);
    expect(screen.getByText('Not specified')).toBeInTheDocument();
  });
});
