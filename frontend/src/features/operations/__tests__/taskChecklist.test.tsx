import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskChecklist } from '../components/TaskChecklist';
import type { ChecklistItem } from '../api/types';

const doc: ChecklistItem = {
  id: 'a3512c21-578d-4194-82d9-ea56c4b367fe', text: 'Tax certificate', completed: false,
  category: 'document', periodYear: '2025/2026', assigneeId: 'owner-id', assigneeName: 'Filing owner',
  dependsOn: ['prerequisite-a', 'prerequisite-b'],
};

afterEach(cleanup);

function setup(overrides: Partial<Parameters<typeof TaskChecklist>[0]> = {}) {
  const onChange = vi.fn().mockResolvedValue(undefined);
  const onRetry = vi.fn();
  render(<TaskChecklist items={[]} canEdit ready loading={false} loadError={false}
    onRetry={onRetry} onChange={onChange} {...overrides} />);
  return { onChange, onRetry };
}

describe('Task checklist editing', () => {
  it('adds a document with its year while preserving all existing metadata', async () => {
    const { onChange } = setup({ items: [doc] });
    fireEvent.change(screen.getByLabelText('New checklist item'), { target: { value: 'Signed filing' } });
    fireEvent.change(screen.getByLabelText('New checklist item type'), { target: { value: 'document' } });
    fireEvent.change(screen.getByLabelText('New document year'), { target: { value: '2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(onChange.mock.calls[0]?.[0]).toEqual([doc, expect.objectContaining({
      text: 'Signed filing', category: 'document', periodYear: '2026', completed: false,
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    })]);
    await waitFor(() => expect(screen.getByLabelText('New checklist item')).toHaveValue(''));
  });

  it('adds a subtask by default and prevents a duplicate submission while saving', async () => {
    let finish!: () => void;
    const onChange = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    setup({ onChange });
    const input = screen.getByLabelText('New checklist item');
    fireEvent.change(input, { target: { value: 'Review records' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0][0]).toMatchObject({ category: 'subtask', periodYear: null });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    finish();
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('changes the type and document year without dropping other fields', async () => {
    const { onChange } = setup({ items: [doc] });
    const year = screen.getByLabelText('Document year for Tax certificate');
    fireEvent.change(year, { target: { value: '2027' } });
    fireEvent.blur(year);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([{ ...doc, periodYear: '2027' }]));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Change checklist type for Tax certificate' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Change checklist type for Tax certificate' }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([{ ...doc, category: 'subtask' }]));
  });

  it('keeps completion blocked until all checklist prerequisites are done', () => {
    setup({ items: [
      { id: 'prerequisite-a', text: 'Collect', completed: true },
      { id: 'prerequisite-b', text: 'Verify', completed: false }, doc,
    ] });
    expect(screen.getByRole('checkbox', { name: doc.text })).toBeDisabled();
  });

  it.each([
    { ready: false, loading: true, loadError: false },
    { ready: false, loading: false, loadError: true },
    { ready: false, loading: false, loadError: false },
  ])('blocks replacement saves until the checklist was successfully loaded (%j)', (state) => {
    const { onChange, onRetry } = setup(state);
    expect(screen.getByLabelText('New checklist item')).toBeDisabled();
    expect(screen.queryByText('No checklist items yet.')).not.toBeInTheDocument();
    if (!state.loading) {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(onRetry).toHaveBeenCalledOnce();
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows save failures and keeps the entered text for retry', async () => {
    setup({ onChange: vi.fn().mockRejectedValue(new Error('Checklist could not be saved')) });
    fireEvent.change(screen.getByLabelText('New checklist item'), { target: { value: 'Review records' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Checklist could not be saved');
    expect(screen.getByLabelText('New checklist item')).toHaveValue('Review records');
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  });

  it('honors completed-work-request and past-phase locks', () => {
    const { onChange } = setup({ items: [doc], disabled: true, disabledReason: 'This phase is locked' });
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByLabelText('New checklist item type')).toBeDisabled();
    expect(screen.getByLabelText('Document year for Tax certificate')).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
