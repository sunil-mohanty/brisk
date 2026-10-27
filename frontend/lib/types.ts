export type LeadStatus = "new" | "contacted" | "quoted" | "won" | "lost";
export type QuoteStatus = "sent" | "viewed" | "accepted" | "rejected";
export type QRDestination = "whatsapp" | "landing";

export interface Business {
  id: number;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  tagline: string | null;
  address: string | null;
  trn: string | null;
  currency: string;
  default_vat_rate: string;
  business_type: BusinessType;
  checklist_hidden: boolean;
  trial_ends_at: string | null;
  slug: string | null;
  link_page_enabled: boolean;
  open_time: string;
  close_time: string;
  closed_days: string;
}

export type BusinessType = "unisex" | "ladies" | "gents" | "spa" | "nails" | "home" | "real_estate";

export interface CatalogItem {
  id: number;
  name: string;
  unit_price: string;
  category: string | null;
  duration_min: number | null;
  price_from: boolean;
  on_page: boolean;
  uses: number;
}

export type Role = "owner" | "manager" | "staff";
export interface User { id: number; name: string; email: string; is_admin?: boolean; seen_tips?: string[]; role?: Role; permissions?: string[]; stylist_id?: number | null }
export interface AuthResponse { token: string; user: User; business: Business }

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  area: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
}

export interface TagCount { name: string; count: number }
export interface Categories { categories: TagCount[]; uncategorised: number; max: number }
export interface AudienceRow { customer_id: number; name: string; phone: string | null; tags: string[]; whatsapp_url: string | null; sent_at: string | null }
export interface Audience { campaign_id: number; title: string; tag: string | null; rows: AudienceRow[]; sent: number }

export interface CustomerSummary extends Customer {
  first_source: string | null;
  leads: number;
  quotes: number;
  services: number;
  lifetime_value: string;
  stage: "Acquire" | "Quote" | "Serve" | "Retain";
}

export interface NewCustomer { name: string; phone?: string | null; area?: string | null }
export interface CustomerRef { customer_id?: number | null; new_customer?: NewCustomer | null }

export interface Lead {
  id: number;
  customer: Customer;
  qr_id: number | null;
  source: string;
  requirement: string | null;
  service_interest: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  stylist_pref: string | null;
  status: LeadStatus;
  created_at: string;
  appointment_id: number | null;
}

export interface QR {
  id: number;
  code: string;
  name: string;
  campaign: string | null;
  destination: QRDestination;
  scans: number;
  clicks: number;
  leads: number;
  archived: boolean;
  created_at: string;
  target_url: string;
}

export interface QuoteItem { description: string; quantity: string; unit_price: string; line_total: string }
export interface Totals { subtotal: string; discount: string; taxable: string; vat: string; total: string }

export interface Quote {
  id: number;
  number: number;
  label: string;
  token: string;
  public_url: string;
  customer: Customer;
  lead_id: number | null;
  items: QuoteItem[];
  vat_rate: string;
  valid_days: number;
  valid_until: string;
  expired: boolean;
  notes: string | null;
  status: QuoteStatus;
  totals: Totals;
  view_count: number;
  views: string[];
  decided_at: string | null;
  shared_at: string | null;
  reference: string | null;
  created_at: string;
  service_record_id: number | null;
  share_message: string;
  kind: "direct" | "campaign";
  campaign_id: number | null;
  campaign_title: string | null;
  booking_status: "awaiting" | "confirmed" | null;
  appointment_id: number | null;
  appointment_at: string | null;
  whatsapp_url: string | null;
  wa_status: "sent" | "delivered" | "read" | "failed" | null;
  wa_error: string | null;
  design_style: "none" | "upload" | "bold" | "soft" | "classic" | "photo";
  theme: string;
  picture_url: string | null;
  attachment: Attachment | null;
  has_ai_art: boolean;
  ai_left: number | null;
}

export interface Attachment { id: number; name: string; url: string; content_type: string; is_pdf: boolean }

export interface ServiceRecord {
  id: number;
  token: string;
  public_url: string;
  customer: Customer;
  quote_id: number | null;
  service: string;
  service_date: string;
  amount: string;
  technician: string | null;
  notes: string | null;
  reference?: string | null;
  next_service_date: string | null;
  reminder_sent_at: string | null;
  created_at: string;
}

export interface Dashboard {
  leads: number;
  new_leads: number;
  quotes: number;
  open_quotes: number;
  services: number;
  due_soon: number;
  won_value: string;
  acceptance_rate: number | null;
  sources: { source: string; leads: number }[];
  recent_quotes: Quote[];
  due_services: ServiceRecord[];
  today: Appointment[];
  upcoming: number;
  link_views: number;
  link_views_7d: number;
  link_taps_7d: number;
  awaiting_booking: Quote[];
  to_send: Outbound[];
  low_stock: number;
  whatsapp_auto: boolean;
  setup: { profile?: boolean; menu?: boolean; link?: boolean; staff?: boolean; booked?: boolean };
}

export interface PublicBusiness {
  name: string;
  tagline: string | null;
  phone: string | null;
  whatsapp_url: string | null;
  address: string | null;
  trn: string | null;
  initials: string;
  business_type?: BusinessType;
  vertical?: "salon" | "real_estate";
  slug?: string | null;
}

export interface PublicQuote {
  label: string;
  business: PublicBusiness;
  customer_name: string;
  items: QuoteItem[];
  vat_rate: string;
  totals: Totals;
  currency: string;
  valid_until: string;
  expired: boolean;
  status: QuoteStatus;
  decided_at: string | null;
  notes: string | null;
  reference?: string | null;
  created_at: string;
  booking_status: "awaiting" | "confirmed" | null;
  appointment_at: string | null;
  appointment_token: string | null;
  stylist: string | null;
  duration_min: number;
  open_days: number[];
  picture_url: string | null;
  attachment: Attachment | null;
}

export interface Slots { day: string; duration_min: number; slots: string[] }

export interface Campaign {
  id: number;
  token: string;
  public_url: string;
  title: string;
  description: string | null;
  items: QuoteItem[];
  totals: Totals;
  vat_rate: string;
  valid_until: string | null;
  expired: boolean;
  duration_min: number;
  notes: string | null;
  active: boolean;
  views: number;
  accepted: number;
  booked: number;
  created_at: string;
  share_text: string;
  whatsapp_accept_url: string | null;
  image_version: string;
  post_caption: string;
  design_style: "classic" | "bold" | "soft" | "photo";
  theme: string;
  has_ai_art: boolean;
  ai_left: number | null;
  sent_whatsapp?: number;
}

export interface PublicCampaign {
  business: PublicBusiness;
  title: string;
  description: string | null;
  items: QuoteItem[];
  totals: Totals;
  vat_rate: string;
  currency: string;
  valid_until: string | null;
  expired: boolean;
  active: boolean;
  duration_min: number;
  notes: string | null;
  open_days: number[];
  whatsapp_accept_url: string | null;
  image_version?: string;
}

export interface InventoryItem {
  id: number;
  name: string;
  category: string | null;
  sku: string | null;
  unit: string;
  stock: string;
  low_stock: string;
  cost_price: string | null;
  sell_price: string | null;
  supplier: string | null;
  notes: string | null;
  updated_at: string;
  low: boolean;
}
export interface StockMove { id: number; change: string; reason: string; note: string | null; created_at: string }

export interface Outbound { id: number; appointment_id: number | null; to_name: string | null; to_phone: string | null; kind: string; body: string; status: string; created_at: string; whatsapp_url: string | null }

export interface PublicService {
  business: PublicBusiness;
  customer_name: string;
  service: string;
  service_date: string;
  amount: string;
  currency: string;
  technician: string | null;
  notes: string | null;
  reference?: string | null;
  next_service_date: string | null;
  history: { service: string; service_date: string; amount: string }[];
}

export interface PublicLanding { business: PublicBusiness; source: string; code: string; menu: PublicMenuItem[]; team: PublicStylist[] }

// ---------- salon ----------
export interface Stylist { id: number; name: string; role: string | null; color: string; on_page: boolean; active: boolean; position: number }

export type AppointmentStatus = "booked" | "confirmed" | "arrived" | "completed" | "no_show" | "cancelled";

export interface Appointment {
  id: number;
  token: string;
  public_url: string;
  customer: Customer;
  stylist: Stylist | null;
  lead_id: number | null;
  quote_id: number | null;
  service_record_id: number | null;
  service: string;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  price: string;
  location: "salon" | "home";
  address: string | null;
  notes: string | null;
  status: AppointmentStatus;
  confirmed_at: string | null;
  reminded_at: string | null;
  created_at: string;
}

export interface LinkItem { id: number; label: string; url: string; highlight: boolean; position: number; clicks: number }
export type LinkTheme = "clay" | "sand" | "rose" | "noir" | "sage" | "navy";
export type LinkMotion = "bloom" | "drift" | "shimmer" | "calm";

export interface LinkPage {
  slug: string | null;
  url: string | null;
  bio: string | null;
  instagram: string | null;
  tiktok: string | null;
  snapchat: string | null;
  facebook: string | null;
  maps_url: string | null;
  hours: string | null;
  link_theme: LinkTheme;
  link_motion: LinkMotion;
  link_show_prices: boolean;
  link_booking: boolean;
  links: LinkItem[];
  views: number;
  views_7d: number;
  taps_7d: Record<string, number>;
  bookings_30d: number;
}

export interface PublicMenuItem { name: string; price: string; price_from: boolean; duration_min: number | null; category: string | null }
export interface PublicStylist { id: number; name: string; role: string | null; color: string; initials: string }

export interface PublicLinkPage {
  business: PublicBusiness;
  bio: string | null;
  hours: string | null;
  socials: Partial<Record<"instagram" | "tiktok" | "snapchat" | "facebook", string>>;
  maps_url: string | null;
  theme: LinkTheme;
  motion: LinkMotion;
  currency: string;
  show_prices: boolean;
  booking: boolean;
  links: LinkItem[];
  menu: PublicMenuItem[];
  team: PublicStylist[];
}

export interface PublicAppointment {
  business: PublicBusiness;
  customer_name: string;
  service: string;
  starts_at: string;
  ends_at: string;
  duration_min: number;
  price: string;
  currency: string;
  stylist: string | null;
  location: "salon" | "home";
  address: string | null;
  status: AppointmentStatus;
  reschedule_url: string | null;
}

export interface ReminderOut { whatsapp_url: string | null; message: string }

export type ImportStatus = "new" | "existing" | "duplicate" | "no_phone";
export interface ImportRow { name: string; phone: string | null; email: string | null; area: string | null }
export interface ImportPreviewRow extends ImportRow { status: ImportStatus; existing_name: string | null }
export interface ImportPreview { rows: ImportPreviewRow[]; counts: Partial<Record<ImportStatus, number>> }

// ---------- admin ----------
export type Health = "active" | "new" | "slipping" | "dormant" | "never_started";
export type PayState = "paid" | "trial" | "trial_ended" | "overdue" | "suspended" | "no_plan";

export interface AdminSme {
  id: number;
  name: string;
  owner_name: string | null;
  owner_email: string | null;
  phone: string | null;
  invite_label: string | null;
  came_from: string | null;
  business_type: string;
  signed_up: string;
  days_since_signup: number;
  days_used: number;
  days_used_30: number;
  last_active: string | null;
  customers: number;
  leads: number;
  quotes: number;
  quotes_30: number;
  services: number;
  qr_codes: number;
  scans: number;
  plan: string | null;
  plan_amount: string | null;
  trial_ends_at: string | null;
  paid_until: string | null;
  status: "active" | "suspended";
  payment_state: PayState;
  health: Health;
  steps_done: number;
}

export interface AdminPayment { id: number; amount: string; paid_on: string; covers_until: string; method: string | null; note: string | null }

export interface AdminSmeDetail extends AdminSme {
  tagline: string | null;
  address: string | null;
  trn: string | null;
  admin_note: string | null;
  link_page_enabled: boolean;
  slug: string | null;
  steps: { key: string; label: string; done: boolean; date: string | null }[];
  active_days: string[];
  events: { kind: string; detail: string | null; at: string }[];
  payments: AdminPayment[];
}

export interface AdminOverview {
  smes: number;
  active_7d: number;
  paying: number;
  trial: number;
  overdue: number;
  suspended: number;
  mrr: string;
  trials_ending_7d: number;
  funnel: { key: string; label: string; count: number }[];
  weeks: { start: string; active: number; quotes: number; signups: number }[];
  attention: { id: number; name: string; kind: string; text: string }[];
  sources: { source: string; smes: number; active: number; paying: number }[];
}

export interface AdminInvite {
  id: number;
  code: string;
  label: string;
  note: string | null;
  trial_days: number;
  plan: string | null;
  plan_amount: string | null;
  revoked: boolean;
  used_at: string | null;
  used_by_business_id: number | null;
  used_by_name: string | null;
  signup_link: string;
  created_at: string;
}
export interface MessageLink { whatsapp_url: string | null; message: string }

export interface WhatsAppStatus { automatic: boolean; quotes: boolean; webhook: boolean; business_number: string | null }
export interface WhatsAppSend { status: "sent" | "failed" | "manual"; error: string | null; whatsapp_url: string | null }
export interface BulkSend { sent: number; failed: number; manual: number }

export type SocialProvider = "facebook" | "instagram" | "youtube";
export interface SocialAccount { id: number; provider: SocialProvider; name: string; handle: string | null; picture_url: string | null; selected: boolean; error: string | null; connected_at: string }
export interface SocialStatus { meta_ready: boolean; google_ready: boolean; accounts: SocialAccount[] }
export interface CampaignPost { id: number; provider: SocialProvider; account_name: string; status: "posting" | "posted" | "failed"; url: string | null; error: string | null; created_at: string; posted_at: string | null }

// ---------- staff management ----------
export type WeekHours = Record<string, [string, string] | null>; // "0" (Mon) .. "6" (Sun)
export type DayStatus = "working" | "present" | "late" | "absent" | "leave" | "off" | "upcoming";
export interface StaffToday { status: DayStatus; hours: [string, string] | null; clock_in: string | null; clock_out: string | null; appointments: number }
export interface Staff extends Stylist {
  phone: string | null; email: string | null; joined_on: string | null; notes: string | null;
  skill_ids: number[]; working_hours: WeekHours; custom_hours: boolean;
  commission_rate: string; commission_by_category: Record<string, string | null>;
  permissions: string[]; login_email: string | null; login_role: "staff" | "manager" | null; today: StaffToday | null;
}
export interface StaffList { staff: Staff[]; pending_leave: number; permissions: Record<string, string>; categories: string[] }
export interface Availability { stylist_id: number; name: string; color: string; ok: boolean; reason: string | null }
export interface StaffLogin { email: string; role: string; password: string | null; login_url: string; whatsapp_url: string | null }
export interface AttendanceDay { day: string; status: DayStatus; clock_in: string | null; clock_out: string | null; minutes: number; note: string | null; edited: boolean; hours: [string, string] | null }
export interface AttendanceRow { stylist_id: number; name: string; color: string; days: AttendanceDay[]; worked_minutes: number; late: number; absent: number; leave: number }
export type LeaveKind = "annual" | "sick" | "unpaid" | "other";
export interface Leave {
  id: number; stylist_id: number; name: string; color: string; kind: LeaveKind; start_date: string; end_date: string; days: number;
  reason: string | null; status: "pending" | "approved" | "rejected" | "cancelled"; reply: string | null; created_at: string; decided_at: string | null; clashes: number;
}
export interface CommissionLine { category: string; sales: string; rate: string; commission: string }
export interface CommissionRow { stylist_id: number; name: string; color: string; services: number; sales: string; net_sales: string; commission: string; lines: CommissionLine[] }
export interface Commission { start: string; end: string; rows: CommissionRow[]; total_sales: string; total_commission: string; vat_rate: string; unassigned_sales: string }
export interface PerformanceRow {
  stylist_id: number; name: string; color: string; booked: number; completed: number; no_shows: number; cancelled: number;
  sales: string; avg_ticket: string; commission: string; clients: number; repeat_clients: number;
  booked_hours: number; scheduled_hours: number; utilisation: number; worked_hours: number; late: number; absent: number; leave_days: number;
}
export interface Performance { start: string; end: string; rows: PerformanceRow[] }
export interface MyDay { staff: Staff; today: StaffToday; appointments: Appointment[]; leave: Leave[]; earnings: Commission | null; week: WeekHours }
