import {
  BusFront,
  Dumbbell,
  Utensils,
  Store,
  Eye,
  Accessibility,
  ShieldAlert,
  HeartPulse,
  BedDouble,
  DoorOpen,
  HelpCircle,
  Cctv,
  LayoutGrid,
  Users,
  Megaphone,
  Network,
  Ship,
  Warehouse,
  Truck,
  TrainFront,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import type { DestinationCategory } from "@/shared/types";

export interface CategoryMeta {
  key: DestinationCategory;
  /** Title shown in the panel header. */
  label: string;
  /** Short word used on the launcher button. */
  short: string;
  icon: LucideIcon;
  /** Subtitle noun, e.g. "12 {unit} · sorted by nearest". */
  unit: string;
  segmentBy?: "kind" | "sport" | "option";
  flatOptions?: boolean;
  notices?: { text: string; tone?: "ok" | "warn" | "alert" }[];
}

/** Canonical order + presentation for the three destination labels. */
export const DEST_CATEGORIES: CategoryMeta[] = [
  { key: "waterside", label: "Waterside",      short: "Waterside", icon: Ship,       unit: "layouts" },
  { key: "yard",      label: "Container Yard", short: "Yard",      icon: Warehouse,  unit: "layouts" },
  { key: "landside",  label: "Landside",       short: "Landside",  icon: Truck,      unit: "layouts" },
  { key: "rail",      label: "Rail",           short: "Rail",      icon: TrainFront, unit: "layouts" },
  { key: "executive", label: "Executive",      short: "Executive", icon: Gauge,      unit: "layouts" },

  { key: "layouts",      label: "Layouts & Wayfinding",   short: "Layouts",       icon: LayoutGrid,    unit: "points",  segmentBy: "option" },
  { key: "crowdflow",    label: "Crowd Flow",             short: "Crowd",         icon: Users,         unit: "zones",   segmentBy: "option" },
  { key: "seating",      label: "Seat Views",             short: "Seat Views",    icon: Eye,           unit: "views",   segmentBy: "option", flatOptions: true },
  { key: "accessibility",label: "Accessibility Planning", short: "Accessibility", icon: Accessibility, unit: "points",  segmentBy: "option" },
  // flatOptions: updates read as ONE notice-board list (option = the update's
  // type chip on each card), not sub-category tabs.
  { key: "eventupdates", label: "Event Updates",          short: "Updates",       icon: Megaphone,     unit: "updates", segmentBy: "option", flatOptions: true },
  { key: "services",     label: "Nearby Services",        short: "Services",      icon: Store,         unit: "places",  segmentBy: "option" },
  { key: "infra",        label: "IT Services",            short: "IT Services",   icon: Network,       unit: "systems", segmentBy: "option" },
  {
    key: "restaurants",
    label: "Dining",
    short: "Dining",
    icon: Utensils,
    unit: "places",
    segmentBy: "kind",
  },
  {
    key: "practice",
    label: "Practice Areas",
    short: "Practice",
    icon: Dumbbell,
    unit: "venues",
    // No list segmentation — the venue's sports show as pills in the directions
    // card, not as filter chips above the list.
  },
  {
    key: "wellness",
    label: "Wellness",
    short: "Wellness",
    icon: HeartPulse,
    unit: "centres",
  },
  {
    key: "hostel",
    label: "Athletes' Hostel",
    short: "Hostel",
    icon: BedDouble,
    unit: "locations",
  },
  {
    key: "entrance",
    label: "Entrances",
    short: "Entrances",
    icon: DoorOpen,
    unit: "points",
    segmentBy: "option",
  },
  {
    key: "discovery",
    label: "Help & Info",
    short: "Help",
    icon: HelpCircle,
    unit: "points",
    segmentBy: "option",
  },
  {
    key: "safety",
    label: "Safety & Guidance",
    short: "Safety",
    icon: ShieldAlert,
    unit: "points",
    segmentBy: "option",
    notices: [
      { text: "All exits operational · routes clear", tone: "ok" },
      { text: "Evacuation drill 15:00 — east concourse", tone: "warn" },
      { text: "EMS staged at the Medical Station · response under 3 min", tone: "ok" },
    ],
  },
  {
    key: "transit",
    label: "Transit & Parking",
    short: "Transit",
    icon: BusFront,
    unit: "points",
    segmentBy: "option",
  },
  {
    key: "cctv",
    label: "Surveillance",
    short: "Security",
    icon: Cctv,
    unit: "points",
    segmentBy: "option",
  },
  {
    key: "seatviews",
    label: "Seat Views",
    short: "Seats",
    icon: Eye,
    unit: "views",
  },
  {
    key: "transport",
    label: "Bus Stop",
    short: "Bus Stop",
    icon: BusFront,
    unit: "destinations",
  },
];

/** Fixed segment labels for the Dining "kind" split. */
export const DINING_SEGMENTS = [
  { id: "campus", label: "Campus Dining" },
  { id: "restaurant", label: "Restaurants" },
] as const;

export const CATEGORY_BY_KEY: Record<DestinationCategory, CategoryMeta> = Object.fromEntries(
  DEST_CATEGORIES.map((c) => [c.key, c]),
) as Record<DestinationCategory, CategoryMeta>;
