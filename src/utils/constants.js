export const USPS_COLORS = {
  navy:     '#0d1b2e',
  navyMid:  '#1b3a6b',
  blue:     '#004b87',
  red:      '#e31837',
  white:    '#ffffff',
  gray:     '#f8f9fb',
  green:    '#15803d',
};

/* Seed data matching the wireframe (Kansas addresses) */
export const SAMPLE_ADDRESSES = [
  {
    id: 1, street: '1201 W Meadow Creek Dr', addressLine2: '',
    city: 'Wichita', state: 'KS', zip: '67203', zipPlus4: '',
    congressionalDistrict: 'KS-04', countyCode: 'KS-173', county: 'Sedgwick',
    lat: 37.7172, lon: -97.3301,
    residential: true, commercial: false, active: true,
    status: 'verified', submittedAt: '2026-03-10T14:22:00Z',
  },
  {
    id: 2, street: '1410 Cedar Run Ave', addressLine2: '',
    city: 'Wichita', state: 'KS', zip: '67212', zipPlus4: '',
    congressionalDistrict: 'KS-04', countyCode: 'KS-173', county: 'Sedgwick',
    lat: 37.7056, lon: -97.4210,
    residential: true, commercial: false, active: true,
    status: 'pending', submittedAt: '2026-03-11T09:10:00Z',
  },
  {
    id: 3, street: '88 N Ridgeview Ct Unit 2B', addressLine2: 'Unit 2B',
    city: 'Goddard', state: 'KS', zip: '67052', zipPlus4: '',
    congressionalDistrict: 'KS-04', countyCode: 'KS-173', county: 'Sedgwick',
    lat: 37.6611, lon: -97.5692,
    residential: true, commercial: false, active: true,
    status: 'pending', submittedAt: '2026-03-12T11:45:00Z',
  },
  {
    id: 4, street: '340 N Rock Rd', addressLine2: '',
    city: 'Wichita', state: 'KS', zip: '67206', zipPlus4: '3210',
    congressionalDistrict: 'KS-04', countyCode: 'KS-173', county: 'Sedgwick',
    lat: 37.7082, lon: -97.2534,
    residential: false, commercial: true, active: true,
    status: 'approved', submittedAt: '2026-03-08T08:30:00Z',
  },
  {
    id: 5, street: '2400 S Hydraulic Ave', addressLine2: '',
    city: 'Wichita', state: 'KS', zip: '67211', zipPlus4: '',
    congressionalDistrict: 'KS-04', countyCode: 'KS-173', county: 'Sedgwick',
    lat: 37.6723, lon: -97.3195,
    residential: false, commercial: true, active: false,
    status: 'rejected', submittedAt: '2026-03-07T16:05:00Z',
  },
];

export const DASHBOARD_STATS = {
  totalAddresses:    1250,
  pendingEdits:      12,
  verifiedAddresses: 1210,
  issuesFound:       4,
};

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
  'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
  'TX','UT','VT','VA','WA','WV','WI','WY','DC','PR',
];

export const PORTAL_CONFIG = {
  region:    'Sedgwick County',
  authority: 'Planning and GIS Office',
  userEmail: 'name@municipal.gov',
};
