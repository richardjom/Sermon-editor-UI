// Inline-SVG icon set used by the Brief detail page.
// Ported from the prototype's shared.jsx — same shapes, ESM export.

import React from 'react'

export function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 1.75 }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
  }
  switch (name) {
    case 'play':
      return (<svg {...common}><path d="M6 4l14 8-14 8V4z" fill={color} stroke="none" /></svg>)
    case 'pause':
      return (
        <svg {...common}>
          <rect x="6" y="4" width="4" height="16" fill={color} stroke="none" />
          <rect x="14" y="4" width="4" height="16" fill={color} stroke="none" />
        </svg>
      )
    case 'skipB':
      return (
        <svg {...common}>
          <path d="M19 5L9 12l10 7V5z" fill={color} stroke="none" />
          <rect x="5" y="5" width="2" height="14" fill={color} stroke="none" />
        </svg>
      )
    case 'skipF':
      return (
        <svg {...common}>
          <path d="M5 5l10 7-10 7V5z" fill={color} stroke="none" />
          <rect x="17" y="5" width="2" height="14" fill={color} stroke="none" />
        </svg>
      )
    case 'search':
      return (<svg {...common}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>)
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      )
    case 'share':
      return (
        <svg {...common}>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
      )
    case 'scissors':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M8.1 8.1L20 20M8.1 15.9L20 4" />
        </svg>
      )
    case 'star':
      return (
        <svg {...common}>
          <path d="M12 3l2.7 5.7 6.3.9-4.5 4.4 1 6.3L12 17.3 6.5 20.3l1-6.3L3 9.6l6.3-.9L12 3z" />
        </svg>
      )
    case 'starFill':
      return (
        <svg {...common} fill={color} stroke="none">
          <path d="M12 3l2.7 5.7 6.3.9-4.5 4.4 1 6.3L12 17.3 6.5 20.3l1-6.3L3 9.6l6.3-.9L12 3z" />
        </svg>
      )
    case 'archive':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" />
          <path d="M10 12h4" />
        </svg>
      )
    case 'copy':
      return (
        <svg {...common}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 012-2h10" />
        </svg>
      )
    case 'more':
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.4" fill={color} />
          <circle cx="12" cy="12" r="1.4" fill={color} />
          <circle cx="19" cy="12" r="1.4" fill={color} />
        </svg>
      )
    case 'chev':
      return (<svg {...common}><path d="M6 9l6 6 6-6" /></svg>)
    case 'chevR':
      return (<svg {...common}><path d="M9 6l6 6-6 6" /></svg>)
    case 'x':
      return (<svg {...common}><path d="M5 5l14 14M19 5L5 19" /></svg>)
    case 'plus':
      return (<svg {...common}><path d="M12 5v14M5 12h14" /></svg>)
    case 'edit':
      return (<svg {...common}><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="M14 6l4 4" /></svg>)
    case 'back':
      return (<svg {...common}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>)
    case 'fullscreen':
      return (<svg {...common}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>)
    case 'vol':
      return (
        <svg {...common}>
          <path d="M4 10v4h4l5 4V6L8 10H4z" />
          <path d="M16 8a5 5 0 010 8" />
        </svg>
      )
    case 'wand':
      return (
        <svg {...common}>
          <path d="M5 19l9-9" />
          <path d="M16 5l3 3" />
          <path d="M14 3l1.5 1.5M19 8l1.5 1.5M3 14l1.5 1.5M9 4l-1 2-2 1 2 1 1 2 1-2 2-1-2-1z" />
        </svg>
      )
    case 'filter':
      return (<svg {...common}><path d="M3 5h18M6 12h12M10 19h4" /></svg>)
    case 'sort':
      return (
        <svg {...common}>
          <path d="M7 4v16M3 8l4-4 4 4" />
          <path d="M17 20V4M21 16l-4 4-4-4" />
        </svg>
      )
    case 'grid':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7" height="7" />
          <rect x="13" y="4" width="7" height="7" />
          <rect x="4" y="13" width="7" height="7" />
          <rect x="13" y="13" width="7" height="7" />
        </svg>
      )
    case 'list':
      return (<svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /></svg>)
    default:
      return null
  }
}
