export const isEmbeddedCheck = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin restrictions mean we're in an iframe
    return true;
  }
};
