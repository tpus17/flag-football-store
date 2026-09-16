import React from 'react'

// Placement is stored as fractions of the image: x/y = center point, w = logo width.
export const DEFAULT_PLACEMENT = { x: 0.5, y: 0.38, w: 0.28 }

// Placements are keyed per (placement × logo) so each logo has an independent
// size/position at each placement. Falls back to placement-only and legacy keys.
export function placementKey(place, logo) {
  return `${place || '_'}::${logo || '_'}`
}
export function lookupPlacement(placements, place, logo) {
  const p = placements || {}
  return p[placementKey(place, logo)]
    || p[placementKey(place, '_')]
    || (place && p[place])
    || p.default
    || DEFAULT_PLACEMENT
}

// A garment base image with a logo overlaid at a placement. Pure CSS overlay
// (no canvas) so it's responsive and never taints. Used on the store and in admin.
export function PreviewImage({ base, logo, placement, alt }) {
  const p = placement || DEFAULT_PLACEMENT
  return (
    <div className="preview-wrap">
      {base ? <img className="preview-base" src={base} alt={alt || ''} /> : <div className="preview-empty">👕</div>}
      {logo && (
        <img
          className="preview-logo"
          src={logo}
          alt=""
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%` }}
        />
      )}
    </div>
  )
}
