import { describe, it, expect } from '@jest/globals';
import { DesignSystemProvider } from '@databricks/design-system';
import { screen, renderWithIntl } from '@mlflow/mlflow/src/common/utils/TestUtils.react18';
import type { RegisteredPrompt } from '../types';
import { PromptsListTableModelCell } from './PromptsListTableModelCell';
import { PROMPT_MODEL_CONFIG_TAG_KEY } from '../utils';

const createMockPrompt = (latestVersionTags?: Array<{ key: string; value: string }>): RegisteredPrompt =>
  ({
    name: 'Test Prompt',
    tags: [],
    latest_versions: latestVersionTags ? [{ version: '1', tags: latestVersionTags }] : [],
  }) as unknown as RegisteredPrompt;

const ModelCell = PromptsListTableModelCell as React.FC<any>;

const renderModelCell = (latestVersionTags?: Array<{ key: string; value: string }>) =>
  renderWithIntl(
    <DesignSystemProvider>
      <ModelCell row={{ original: createMockPrompt(latestVersionTags) }} table={{ options: { meta: {} } }} />
    </DesignSystemProvider>,
  );

describe('PromptsListTableModelCell', () => {
  it('should render model name when model config tag is present', () => {
    renderModelCell([
      {
        key: PROMPT_MODEL_CONFIG_TAG_KEY,
        value: JSON.stringify({ provider: 'openai', model_name: 'gpt-4' }),
      },
    ]);
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('should render "Not specified" when no model config tag', () => {
    renderModelCell([{ key: 'some_other_tag', value: 'abc' }]);
    expect(screen.getByText('Not specified')).toBeInTheDocument();
  });

  it('should render "Not specified" when latest_versions is empty', () => {
    renderModelCell();
    expect(screen.getByText('Not specified')).toBeInTheDocument();
  });

  it('should render "Not specified" when model config has no model_name', () => {
    renderModelCell([
      {
        key: PROMPT_MODEL_CONFIG_TAG_KEY,
        value: JSON.stringify({ provider: 'openai' }),
      },
    ]);
    expect(screen.getByText('Not specified')).toBeInTheDocument();
  });

  it('should render long model names with truncation styles', () => {
    const longModelName = 'this-is-a-very-long-model-name-that-exceeds-fifty-characters-for-testing-truncation';
    renderModelCell([
      {
        key: PROMPT_MODEL_CONFIG_TAG_KEY,
        value: JSON.stringify({
          provider: 'openai',
          model_name: longModelName,
        }),
      },
    ]);
    const element = screen.getByText(longModelName);
    expect(element).toBeInTheDocument();
  });

  it('should handle invalid JSON in model config tag gracefully', () => {
    renderModelCell([
      {
        key: PROMPT_MODEL_CONFIG_TAG_KEY,
        value: 'not-valid-json',
      },
    ]);
    expect(screen.getByText('Not specified')).toBeInTheDocument();
  });
});
