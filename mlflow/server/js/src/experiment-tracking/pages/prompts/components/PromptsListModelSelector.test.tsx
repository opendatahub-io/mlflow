import { describe, it, expect, jest } from '@jest/globals';
import { PointerEventsCheckLevel } from '@testing-library/user-event';
import userEventGlobal from '@testing-library/user-event';
import { renderWithDesignSystem, screen } from '@mlflow/mlflow/src/common/utils/TestUtils.react18';
import type { RegisteredPrompt } from '../types';
import { PROMPT_MODEL_CONFIG_TAG_KEY } from '../utils';
import { PromptsListModelSelector } from './PromptsListModelSelector';

const userEvent = userEventGlobal.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

const mockPrompt = (name: string, modelName?: string): RegisteredPrompt =>
  ({
    name,
    latest_versions: [
      {
        version: 1,
        tags: modelName
          ? [
              {
                key: PROMPT_MODEL_CONFIG_TAG_KEY,
                value: JSON.stringify({ provider: 'openai', model_name: modelName }),
              },
            ]
          : [],
      },
    ],
  }) as unknown as RegisteredPrompt;

describe('PromptsListModelSelector', () => {
  it('shows the "Models" label and announces no selection when no model is chosen', () => {
    renderWithDesignSystem(
      <PromptsListModelSelector modelFilter={undefined} setModelFilter={jest.fn()} prompts={[]} />,
    );
    expect(screen.getByText('Models')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Models, no option selected' })).toBeInTheDocument();
  });

  it('lists distinct models sorted alphabetically, derived from the latest version of each prompt', async () => {
    const prompts = [
      mockPrompt('p1', 'gpt-4o'),
      mockPrompt('p2', 'claude-3'),
      mockPrompt('p3', 'gpt-4o'), // duplicate model, should not appear twice
      mockPrompt('p4'), // no model config, should not contribute an option
    ];
    renderWithDesignSystem(
      <PromptsListModelSelector modelFilter={undefined} setModelFilter={jest.fn()} prompts={prompts} />,
    );

    await userEvent.click(screen.getByRole('combobox'));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['claude-3', 'gpt-4o']);
  });

  it('calls setModelFilter with the selected model', async () => {
    const setModelFilter = jest.fn();
    renderWithDesignSystem(
      <PromptsListModelSelector
        modelFilter={undefined}
        setModelFilter={setModelFilter}
        prompts={[mockPrompt('p1', 'gpt-4o')]}
      />,
    );

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'gpt-4o' }));
    expect(setModelFilter).toHaveBeenCalledWith('gpt-4o');
  });

  it('clears the filter when the currently selected option is clicked again', async () => {
    const setModelFilter = jest.fn();
    renderWithDesignSystem(
      <PromptsListModelSelector
        modelFilter="gpt-4o"
        setModelFilter={setModelFilter}
        prompts={[mockPrompt('p1', 'gpt-4o')]}
      />,
    );

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'gpt-4o' }));
    expect(setModelFilter).toHaveBeenCalledWith(undefined);
  });

  it('does not offer an option for a model that no longer appears on any prompt', async () => {
    renderWithDesignSystem(
      <PromptsListModelSelector
        modelFilter={undefined}
        setModelFilter={jest.fn()}
        prompts={[mockPrompt('p1', 'gpt-4o')]}
      />,
    );

    await userEvent.click(screen.getByRole('combobox'));
    await screen.findByRole('option', { name: 'gpt-4o' });
    expect(screen.queryByRole('option', { name: 'claude-3' })).not.toBeInTheDocument();
  });
});
