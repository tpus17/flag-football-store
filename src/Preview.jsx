import React from 'react'

// Placement is stored as fractions of the image: x/y = center point, w = logo width.
export const DEFAULT_PLACEMENT = { x: 0.5, y: 0.38, w: 0.28 }

// Placements are keyed per (color × placement × logo) so each color can position/size
// the logo independently. Falls back to color-agnostic and legacy keys, so existing
// configs keep working until a color-specific position is set.
export function placementKey(color, place, logo) {
  return `${color || '_'}::${place || '_'}::${logo || '_'}`
}
export function lookupPlacement(placements, color, place, logo) {
  const p = placements || {}
  const pl = place || '_'
  const lo = logo || '_'
  return p[placementKey(color, place, logo)]   // color + placement + logo (most specific)
    || p[`${pl}::${lo}`]                        // legacy: placement + logo (color-agnostic)
    || p[`${pl}::_`]                            // legacy: placement only
    || (place && p[place])                     // oldest legacy
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
