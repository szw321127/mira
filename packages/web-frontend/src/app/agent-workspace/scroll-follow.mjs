export function isScrolledNearBottom(metrics, threshold = 48) {
  return (
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold
  );
}

export function scrollElementToBottom(element) {
  element.scrollTop = element.scrollHeight;
}
