export type ScrollMetrics = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

export function isScrolledNearBottom(
  metrics: ScrollMetrics,
  threshold = 48,
) {
  return (
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold
  );
}

export function scrollElementToBottom(element: HTMLElement) {
  element.scrollTop = element.scrollHeight;
}
