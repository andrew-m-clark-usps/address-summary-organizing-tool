export const USPS_COLORS = {
  navy: '#1B3A6B',
  blue: '#004B87',
  red: '#E31837',
  white: '#FFFFFF',
  gray: '#F5F5F5',
  darkNavy: '#15305A',
  orange: '#FF6B35',
  green: '#28A745',
};

export const SAMPLE_ADDRESSES = [
  { id: 1, street: '1234 Elm Street', city: 'Springfield', state: 'IL', zip: '62701', lat: 39.7817, lon: -89.6501, residential: true, commercial: false, active: true },
  { id: 2, street: '567 Oak Ave', city: 'Springfield', state: 'IL', zip: '62703', lat: 39.7565, lon: -89.6234, residential: true, commercial: false, active: true },
  { id: 3, street: '890 Pine Dr', city: 'Springfield', state: 'IL', zip: '62704', lat: 39.7952, lon: -89.6550, residential: false, commercial: true, active: true },
];

export const DASHBOARD_STATS = {
  totalAddresses: 1250,
  pendingEdits: 12,
  verifiedAddresses: 1210,
  issuesFound: 4,
};

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
  'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
  'TX','UT','VT','VA','WA','WV','WI','WY','DC','PR'
];
