// The words each line of business sees. Same features, their own language.
import type { BusinessType } from "./types";

export type Vertical = "salon" | "real_estate";
export const verticalOf = (t: string | null | undefined): Vertical => (t === "real_estate" ? "real_estate" : "salon");

export interface Words {
  vertical: Vertical;
  business: string; // "salon" | "agency"
  Business: string;
  appointment: string; appointments: string; Appointment: string; Appointments: string;
  diary: string; // tab label on phones
  staffOne: string; staff: string; Staff: string; // "stylist" / "agent"
  service: string; services: string; Service: string; Services: string; // what you sell / show
  visit: string; visits: string; Visit: string; Visits: string; // a finished job
  finishVisit: string; // button: "Finish visit" / "Close the deal"
  bookTime: string; // public: "Book your time" / "Book a viewing"
  bookCta: string; // "Request an appointment" / "Book a viewing"
  rebook: string; // "Due to rebook" / "Follow-ups due"
  inventory: boolean; // salon stock
  profile: string; // menu: "Salon profile & hours"
}

const SALON: Words = {
  vertical: "salon", business: "salon", Business: "Salon",
  appointment: "appointment", appointments: "appointments", Appointment: "Appointment", Appointments: "Appointments", diary: "Diary",
  staffOne: "stylist", staff: "staff", Staff: "Staff",
  service: "service", services: "services", Service: "Service", Services: "Services",
  visit: "visit", visits: "visits", Visit: "Visit", Visits: "Visits", finishVisit: "Finish visit",
  bookTime: "Book your time", bookCta: "Request an appointment", rebook: "Due to rebook", inventory: true, profile: "Salon profile & hours",
};

const REAL_ESTATE: Words = {
  vertical: "real_estate", business: "agency", Business: "Agency",
  appointment: "viewing", appointments: "viewings", Appointment: "Viewing", Appointments: "Viewings", diary: "Viewings",
  staffOne: "agent", staff: "agents", Staff: "Agents",
  service: "listing", services: "listings", Service: "Listing", Services: "Listings",
  visit: "deal", visits: "deals", Visit: "Deal", Visits: "Deals", finishVisit: "Close the deal",
  bookTime: "Book a viewing", bookCta: "Book a viewing", rebook: "Follow-ups due", inventory: false, profile: "Agency profile & hours",
};

export const words = (t: BusinessType | string | null | undefined): Words => (verticalOf(t) === "real_estate" ? REAL_ESTATE : SALON);
