import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FolderPicker } from './FolderPicker';

describe('FolderPicker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('single-click selects while Open and double-click navigate into a folder', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const target = String(url);
      if (target.endsWith('path=.')) {
        return Response.json({
          workspaceRoot: '/workspace',
          currentPath: '.',
          absolutePath: '/workspace',
          parentPath: null,
          isProject: false,
          directories: [{ name: 'mad', path: 'mad', isProject: false }],
        });
      }
      if (target.endsWith('path=mad')) {
        return Response.json({
          workspaceRoot: '/workspace',
          currentPath: 'mad',
          absolutePath: '/workspace/mad',
          parentPath: '.',
          isProject: false,
          directories: [{ name: 'mad-test', path: 'mad/mad-test', isProject: true }],
        });
      }
      if (target.endsWith('path=mad%2Fmad-test')) {
        return Response.json({
          workspaceRoot: '/workspace',
          currentPath: 'mad/mad-test',
          absolutePath: '/workspace/mad/mad-test',
          parentPath: 'mad',
          isProject: true,
          directories: [],
        });
      }
      throw new Error(`Unexpected fetch ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const onChoose = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <FolderPicker open initialPath="." onClose={onClose} onChoose={onChoose} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Select mad' }));
    expect(onChoose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Open mad' }));
    await waitFor(() => expect(screen.getByText('mad-test')).toBeInTheDocument());

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Select mad-test' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('path=mad%2Fmad-test')));
    expect(onChoose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Use current folder' }));
    expect(onChoose).toHaveBeenCalledWith('mad/mad-test');
    expect(onClose).toHaveBeenCalled();
  });
});
