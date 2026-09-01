import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  notifyAcceptance,
  notifyCorrectionFailure,
  notifyImageUploadFallback,
  notifyUploadRejected,
  notifyReconstructionFailure,
  notifyReconstructionReady,
} from '../uploadNotifications';

const toast = {
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
};

describe('upload outcome notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('reports degraded uploads, reconstruction completion, and failures', () => {
    notifyImageUploadFallback(toast);
    notifyReconstructionReady(toast);
    notifyReconstructionFailure(toast);
    notifyCorrectionFailure(toast);

    expect(toast.warning).toHaveBeenCalledWith('Image upload unavailable. Continuing with limited scale data.');
    expect(toast.success).toHaveBeenCalledWith('Plan reconstructed. Review confidence before accepting.');
    expect(toast.error).toHaveBeenCalledWith('Reconstruction failed. Review the error and try again.');
    expect(toast.error).toHaveBeenCalledWith('Could not apply corrections. Review the error and retry.');
  });

  test('selects the acceptance copy for reconstruction and image retrace modes', () => {
    notifyAcceptance(toast, 'reconstruct');
    notifyAcceptance(toast, 'trace');

    expect(toast.success).toHaveBeenCalledWith('Reconstruction loaded into the editor.');
    expect(toast.success).toHaveBeenCalledWith('Reference image ready. Redraw it in the 2D editor.');
  });

  test('reports a rejected file using its safe validation message', () => {
    notifyUploadRejected(toast, 'Upload a PNG, JPEG, WebP, or PDF up to 25 MB.');

    expect(toast.error).toHaveBeenCalledWith('Upload a PNG, JPEG, WebP, or PDF up to 25 MB.');
  });
});
