import { describe, it, expect } from '@jest/globals';
import type { FC } from 'react';
import { DesignSystemProvider } from '@databricks/design-system';
import { screen, renderWithIntl } from '@mlflow/mlflow/src/common/utils/TestUtils.react18';
import { PromptsListTableModelCell } from './PromptsListTableModelCell';

const ModelCell = PromptsListTableModelCell as FC<{ getValue: () => unknown }>;

const renderModelCell = (modelName?: unknown) =>
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

  it('should render "-" when no model name', () => {
    renderModelCell(undefined);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('should render "-" when model name is empty string', () => {
    renderModelCell('');
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('should render "-" when model name is not a string', () => {
    renderModelCell({});
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
