/** Shared API response shapes, mirroring the server DTOs. */

export type UserRole =
  | 'STUDENT'
  | 'WARDEN'
  | 'SUPERVISOR'
  | 'SECURITY'
  | 'MESS_STAFF'
  | 'ADMIN';

export type AvailabilityStatus = 'GREEN' | 'YELLOW' | 'RED';

export type StudentGender = 'MALE' | 'FEMALE';
export type HostelGender = 'MALE' | 'FEMALE' | 'CO_ED';

/** Whether the signed-in user may book in a given block, and why not. */
export interface Eligibility {
  allowed: boolean;
  reason: string | null;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  studentId?: number;
  staffId?: number;
  hostelId?: number | null;
  currentRoomId?: number | null;
  /** Present for students; decides which blocks they may book. */
  gender?: StudentGender | null;
}

export interface Hostel {
  id: number;
  code: string;
  name: string;
  floors: number;
  roomsPerFloor: number;
  gender: HostelGender;
  genderLabel: string;
  eligibility: Eligibility;
  accentColor: string;
  totalRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  availableRooms: number;
  freeBeds: number;
  occupancyRate: number;
}

export interface FloorSummary {
  floor: number;
  totalRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  availableRooms: number;
  blockedRooms: number;
  freeBeds: number;
  status: AvailabilityStatus;
  isLocked: boolean;
}

export interface HostelStructure {
  hostel: {
    id: number;
    code: string;
    name: string;
    floors: number;
    roomsPerFloor: number;
    gender: HostelGender;
    genderLabel: string;
    accentColor: string;
  };
  eligibility: Eligibility;
  totals: {
    totalRooms: number;
    totalBeds: number;
    occupiedBeds: number;
    availableRooms: number;
    freeBeds: number;
    occupancyRate: number;
  };
  floors: FloorSummary[];
}

export interface RoomSummary {
  id: number;
  roomNumber: string;
  floor: number;
  capacity: number;
  occupiedBeds: number;
  isBlocked: boolean;
  notes: string | null;
  occupancyLabel: string;
  freeBeds: number;
  status: AvailabilityStatus;
  isLocked: boolean;
}

export interface BedOccupant {
  studentId: number;
  name: string;
  rollNumber: string;
  course: string;
  year: number;
  bookingDate: string;
  isYou: boolean;
}

export interface RoomDetail extends RoomSummary {
  hostelId: number;
  hostelCode: string;
  hostelName: string;
  hostelGender: HostelGender;
  eligibility: Eligibility;
  beds: { bedIndex: number; isOccupied: boolean; occupant: BedOccupant | null }[];
}

export interface Booking {
  id: number;
  bedIndex: number;
  bookingDate: string;
  status: string;
  roomId: number;
  roomNumber: string;
  floor: number;
  capacity: number;
  occupiedBeds: number;
  hostelId: number;
  hostelCode: string;
  hostelName: string;
}

export type RequestType = 'HOUSEKEEPING' | 'REPAIR';
export type RequestStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';

export interface ServiceRequest {
  id: number;
  type: RequestType;
  category: string | null;
  note: string | null;
  status: RequestStatus;
  priority: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  studentId: number;
  studentName: string;
  rollNumber: string;
  roomNumber: string | null;
  floor: number | null;
  hostelCode: string | null;
  handledBy: number | null;
}

export type GatepassStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHECKED_OUT'
  | 'CHECKED_IN'
  | 'EXPIRED';

export interface Gatepass {
  id: number;
  reference: string;
  reason: string;
  destination: string | null;
  fromTime: string;
  toTime: string;
  status: GatepassStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  checkedOutAt: string | null;
  checkedInAt: string | null;
  createdAt: string;
  studentId: number;
  studentName: string;
  rollNumber: string;
  hostelCode: string | null;
  roomNumber: string | null;
}

export interface GatepassVerification extends Omit<Gatepass, 'createdAt' | 'decisionNote' | 'decidedAt'> {
  verdict: 'VALID' | 'NOT_APPROVED' | 'NOT_YET_VALID' | 'EXPIRED' | 'ALREADY_RETURNED';
  isValid: boolean;
  contact: string | null;
  guardianContact: string | null;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  category: string;
  isPinned: boolean;
  createdAt: string;
  hostelId: number | null;
  hostelCode: string | null;
  postedBy: number;
  authorName: string;
  authorDesignation: string;
  isRead: boolean;
}

export interface ElectricityBill {
  id: number;
  period: string;
  unitsConsumed: string;
  ratePerUnit: string;
  amount: string;
  dueDate: string;
  isPaid: boolean;
  perHeadShare?: string;
  roomId?: number;
  roomNumber?: string;
  floor?: number;
  occupiedBeds?: number;
  hostelCode?: string;
}

export interface BillSummary {
  billCount: number;
  totalAmount: string;
  outstandingAmount: string;
  paidAmount: string;
  totalUnits: string;
}

export interface MessMenuDay {
  dayOfWeek: number;
  dayName: string;
  isToday: boolean;
  meals: {
    id: number;
    dayOfWeek: number;
    meal: string;
    items: string;
    servingTime: string | null;
    updatedAt: string;
  }[];
}

export interface Raid {
  id: number;
  floor: number | null;
  scheduledFor: string;
  purpose: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  findings: string | null;
  completedAt: string | null;
  createdAt: string;
  hostelId: number;
  hostelCode: string;
  conductedBy: number;
  conductorName: string;
}

export interface AppNotification {
  id: number;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface UnallocatedStudent {
  studentId: number;
  name: string;
  email: string;
  rollNumber: string;
  course: string;
  year: number;
  gender: StudentGender;
  hostelId: number | null;
  hostelCode: string | null;
}
