import { describe, it, expect } from '@jest/globals';
import { DesignSystemProvider } from '@databricks/design-system';
import { screen, renderWithIntl } from '@mlflow/mlflow/src/common/utils/TestUtils.react18';
import { PromptsListTableModelCell } from './PromptsListTableModelCell';

const ModelCell = PromptsListTableModelCell as React.FC<any>;

const renderModelCell = (modelName?: string) =>
  renderWithIntl(
    <DesignSystemProvider>
      <ModelCell getValue={() => modelName} />
    </DesignSystemProvider>,
  );

describe('PromptsListTableModelCell', () => {
  it('should render model name when model config tag is present', () => {
    renderModelCell('gpt-4');
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('should render "Not specified" when no model name', () => {
    renderModelCell(undefined);
    expect(screen.getByText('Not specified')).toBeInTheDocument();
  });

  it('should render "Not specified" when model name is empty string', () => {
    renderModelCell('');
    expect(screen.getByText('Not specified')).toBeInTheDocument();
  });

  it('should render long model names with truncation styles', () => {
    const longModelName = 'this-is-a-very-long-model-name-that-exceeds-fifty-characters-for-testing-truncation';
    renderModelCell(longModelName);
    const element = screen.getByText(longModelName);
    expect(element).toBeInTheDocument();
  });
});
