const CLIPPED_OVERFLOW_VALUES = new Set(["auto", "scroll", "hidden", "clip"]);

function clipsAxis(value) {
  return CLIPPED_OVERFLOW_VALUES.has(String(value || "visible"));
}

function isScrollableVertically(ancestor, tolerance) {
  return Number(ancestor.scrollHeight || 0) > Number(ancestor.clientHeight || 0) + tolerance;
}

function isScrollableHorizontally(ancestor, tolerance) {
  return Number(ancestor.scrollWidth || 0) > Number(ancestor.clientWidth || 0) + tolerance;
}

function isVerticallyWithinViewport(ancestor, viewport, tolerance) {
  return ancestor.top >= -tolerance && ancestor.bottom <= viewport.height + tolerance;
}

function isHorizontallyWithinViewport(ancestor, viewport, tolerance) {
  return ancestor.left >= -tolerance && ancestor.right <= viewport.width + tolerance;
}

function explainsVerticalOverflow(button, ancestor, viewport, tolerance) {
  if (!clipsAxis(ancestor.overflowY) || !isScrollableVertically(ancestor, tolerance)) {
    return false;
  }

  if (!isVerticallyWithinViewport(ancestor, viewport, tolerance)) {
    return false;
  }

  return button.top < ancestor.top - tolerance || button.bottom > ancestor.bottom + tolerance;
}

function explainsHorizontalOverflow(button, ancestor, viewport, tolerance) {
  if (!clipsAxis(ancestor.overflowX) || !isScrollableHorizontally(ancestor, tolerance)) {
    return false;
  }

  if (!isHorizontallyWithinViewport(ancestor, viewport, tolerance)) {
    return false;
  }

  return button.left < ancestor.left - tolerance || button.right > ancestor.right + tolerance;
}

export function isViewportButtonViolation(button, viewport, tolerance = 1) {
  const horizontalOverflow = button.left < -tolerance || button.right > viewport.width + tolerance;
  const verticalOverflow = button.top < -tolerance || button.bottom > viewport.height + tolerance;

  if (!horizontalOverflow && !verticalOverflow) {
    return false;
  }

  const clippingAncestors = Array.isArray(button.clippingAncestors)
    ? button.clippingAncestors
    : [];

  const horizontalExplained =
    !horizontalOverflow ||
    clippingAncestors.some((ancestor) =>
      explainsHorizontalOverflow(button, ancestor, viewport, tolerance)
    );

  const verticalExplained =
    !verticalOverflow ||
    clippingAncestors.some((ancestor) =>
      explainsVerticalOverflow(button, ancestor, viewport, tolerance)
    );

  return !(horizontalExplained && verticalExplained);
}

export function filterViewportButtonViolations(buttons, viewport, tolerance = 1) {
  return buttons.filter((button) => isViewportButtonViolation(button, viewport, tolerance));
}
