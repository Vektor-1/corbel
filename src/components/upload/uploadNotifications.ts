export type UploadToast = {
  success(message: string): void;
  warning(message: string): void;
  error(message: string): void;
};

export function notifyImageUploadFallback(toast: UploadToast) {
  toast.warning('Image upload unavailable. Continuing with limited scale data.');
}

export function notifyReconstructionReady(toast: UploadToast) {
  toast.success('Plan reconstructed. Review confidence before accepting.');
}

export function notifyReconstructionFailure(toast: UploadToast) {
  toast.error('Reconstruction failed. Review the error and try again.');
}

export function notifyAcceptance(toast: UploadToast, mode: 'reconstruct' | 'trace') {
  toast.success(
    mode === 'trace'
      ? 'Trace baseline frozen. Redesign it in Studio.'
      : 'Reconstruction loaded into the editor.'
  );
}

export function notifyCorrectionFailure(toast: UploadToast) {
  toast.error('Could not apply corrections. Review the error and retry.');
}

export function notifyUploadRejected(toast: UploadToast, message: string) {
  toast.error(message);
}
