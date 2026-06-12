import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@databricks/design-system';
import { UpdateDescriptionModal } from './UpdateDescriptionModal';

const renderModal = (props: Partial<React.ComponentProps<typeof UpdateDescriptionModal>> = {}) =>
  render(
    <IntlProvider locale="en">
      <DesignSystemProvider>
        <UpdateDescriptionModal
          visible
          currentDescription="Original description"
          onUpdate={jest.fn()}
          onCancel={jest.fn()}
          {...props}
        />
      </DesignSystemProvider>
    </IntlProvider>,
  );

describe('UpdateDescriptionModal', () => {
  it('renders with current description', () => {
    renderModal();
    expect(screen.getByDisplayValue('Original description')).toBeInTheDocument();
  });

  it('does not render when not visible', () => {
    renderModal({ visible: false });
    expect(screen.queryByDisplayValue('Original description')).not.toBeInTheDocument();
  });

  it('calls onUpdate with null for empty description', async () => {
    const onUpdate = jest.fn();
    renderModal({ onUpdate, currentDescription: '' });
    await userEvent.click(screen.getByText('Save'));
    expect(onUpdate).toHaveBeenCalledWith(null);
  });

  it('calls onUpdate with text for non-empty description', async () => {
    const onUpdate = jest.fn();
    renderModal({ onUpdate });
    const textarea = screen.getByDisplayValue('Original description');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'New description');
    await userEvent.click(screen.getByText('Save'));
    expect(onUpdate).toHaveBeenCalledWith('New description');
  });

  it('calls onCancel when cancel is clicked', async () => {
    const onCancel = jest.fn();
    renderModal({ onCancel });
    await userEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows error alert when error is provided', () => {
    renderModal({ error: new Error('Update failed') });
    expect(screen.getByText('Update failed')).toBeInTheDocument();
  });

  it('resets draft when reopened with different description', () => {
    const { rerender } = render(
      <IntlProvider locale="en">
        <DesignSystemProvider>
          <UpdateDescriptionModal
            visible={false}
            currentDescription="First"
            onUpdate={jest.fn()}
            onCancel={jest.fn()}
          />
        </DesignSystemProvider>
      </IntlProvider>,
    );
    rerender(
      <IntlProvider locale="en">
        <DesignSystemProvider>
          <UpdateDescriptionModal visible currentDescription="Second" onUpdate={jest.fn()} onCancel={jest.fn()} />
        </DesignSystemProvider>
      </IntlProvider>,
    );
    expect(screen.getByDisplayValue('Second')).toBeInTheDocument();
  });
});
