export const Timeout = {
  short: 5_000,
  medium: 10_000,
  long: 15_000,
} as const;

export const UrlPatterns = {
  experiment: /experiments\/(\d+)/,
  experimentModels: /experiments\/\d+\/models/,
  run: /runs\//,
  model: /models\//,
  prompt: (name: string) => {
    const escaped = encodeURIComponent(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`prompts/${escaped}`);
  },
};
