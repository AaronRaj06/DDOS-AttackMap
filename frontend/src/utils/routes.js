// The same route, whether it came from the top-routes list or from one replayed event
export function routeFromEvent(event) {
  return {
    layer: event.layer,
    share: event.share,
    src: { code: event.src_country, name: event.src_name, lat: event.src_lat, lon: event.src_lon },
    dst: { code: event.dst_country, name: event.dst_name, lat: event.dst_lat, lon: event.dst_lon },
  };
}

// What to highlight on the map for a selection or a hovered list row
export function highlightFor(hoveredRoute, selection) {
  if (hoveredRoute) return { route: hoveredRoute };
  if (selection?.kind === 'route') return { route: selection.route };
  if (selection?.kind === 'arc') return { route: routeFromEvent(selection.event) };
  if (selection?.kind === 'network') return { point: selection.point };
  return null;
}
