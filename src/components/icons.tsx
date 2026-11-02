import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement> & { size?: number }
type IconPath = string

const makeIcon = (...paths: IconPath[]) => ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {paths.map((path, index) => <path d={path} key={index} />)}
  </svg>
)

export const Plus = makeIcon('M12 5v14M5 12h14')
export const X = makeIcon('M18 6 6 18M6 6l12 12')
export const Check = makeIcon('m5 12 4 4L19 6')
export const ChevronLeft = makeIcon('m15 18-6-6 6-6')
export const Menu = makeIcon('M4 6h16M4 12h16M4 18h16')
export const Search = makeIcon('m21 21-4.5-4.5M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0')
export const Pencil = makeIcon('m12 20 8-8-4-4-8 8-1 5zM14 6l4 4')
export const Trash2 = makeIcon('M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6')
export const Download = makeIcon('M12 3v12M7 10l5 5 5-5M5 21h14')
export const Share2 = makeIcon('M18 8a3 3 0 1 0-2.8-4M6 15a3 3 0 1 0 2.8 4M18 16a3 3 0 1 0 2.8 4M8.6 16.5l6.8 3M15.4 4.5l-6.8 3')
export const Cloud = makeIcon('M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 10a4 4 0 0 1-1 7.87H7')
export const CloudOff = makeIcon('m3 3 18 18M7 18a5 5 0 0 1-.6-9.96M10.2 4.4A6 6 0 0 1 18 10a4 4 0 0 1 .9 7.9')
export const FileText = makeIcon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6')
export const CalendarDays = makeIcon('M7 2v4M17 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01')
export const BarChart3 = makeIcon('M3 3v18h18M7 16v-5M12 16V7M17 16v-8')
export const Building2 = makeIcon('M3 21h18M5 21V5l7-3 7 3v16M9 21v-4h6v4M9 8h.01M15 8h.01M9 12h.01M15 12h.01')
export const ClipboardList = makeIcon('M9 5h6M9 3h6a2 2 0 0 1 2 2v2H7V5a2 2 0 0 1 2-2M5 7h14v14H5zM9 12h6M9 16h4')
export const MapPin = makeIcon('M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0M12 10a2 2 0 1 0 0 .01')
export const Users = makeIcon('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75')
export const Settings = makeIcon('M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.1 2.1-.06-.06A1.7 1.7 0 0 0 15.76 19l-.16.06V22h-3v-2.94L12.44 19a1.7 1.7 0 0 0-1.88.34l-.06.06-2.1-2.1.06-.06A1.7 1.7 0 0 0 8.8 15.4L8.74 15H5.8v-3h2.94l.06-.16a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.1-2.1.06.06a1.7 1.7 0 0 0 1.88.34L12.6 8.14V5.2h3v2.94l.16.06a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.1 2.1-.06.06a1.7 1.7 0 0 0-.34 1.88l.06.16h2.94v3z')
export const History = makeIcon('M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2')
export const ImagePlus = makeIcon('M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 13l3-3 3 3 2-2 3 3M15 7h.01M19 19v4M17 21h4')
export const Leaf = makeIcon('M20 3C10 4 4 9 4 17a4 4 0 0 0 4 4c7 0 11-7 12-18M4 17c4-4 8-6 13-8')
export const Sprout = makeIcon('M7 20h10M12 20v-6M12 14C8 14 5 11 5 7c4 0 7 3 7 7M12 14c0-4 3-7 7-7 0 4-3 7-7 7')
export const Loader2 = ({ className = '', ...props }: IconProps) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} {...props}><path d="M21 12a9 9 0 1 1-6.2-8.55"/></svg>
export const RefreshCw = makeIcon('M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3M3 4v4h4M21 20v-4h-4')
