import type { IncomingJob } from '../workerTypes';

// Sample voice note URL (in production this would be actual recording URLs)
const SAMPLE_VOICE_NOTE = 'https://www.soundjay.com/human/sounds/male-voice-saying-hey-1.mp3';

// Demo jobs database - jobs for each skill type
export const DEMO_JOBS: Record<string, IncomingJob[]> = {
  'Carpenter': [
    { id: 'JOB-10001', customerName: 'Ramesh Sharma', phone: '98765xxxxx', service: 'Wooden Door Repair', skillType: 'Carpenter', address: '45, MG Road', area: 'Kodambakkam', distance: '2.3 km', estimatedPay: 800, description: 'Door hinge repair and polish needed', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-10002', customerName: 'Priya Menon', phone: '98432xxxxx', service: 'Cabinet Installation', skillType: 'Carpenter', address: '12, Lake View', area: 'T. Nagar', distance: '3.1 km', estimatedPay: 1500, description: 'Kitchen cabinet fitting work', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-10003', customerName: 'Arun Kumar', phone: '99887xxxxx', service: 'Furniture Repair', skillType: 'Carpenter', address: '78, Park Street', area: 'Anna Nagar', distance: '4.5 km', estimatedPay: 600, description: 'Wooden chair and table repair', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-10004', customerName: 'Rajesh Kumar', phone: '98123xxxxx', service: 'Window Installation', skillType: 'Carpenter', address: '102, Riverside Villas', area: 'Kasturba Nagar', distance: '3.2 km', estimatedPay: 1200, description: 'Wooden window fixtures for 4 windows', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-10005', customerName: 'Savithri', phone: '97654xxxxx', service: 'Shelf Installation', skillType: 'Carpenter', address: '234, Tower Block', area: 'Vepery', distance: '2.8 km', estimatedPay: 900, description: 'Wall shelves and bracket installation', voiceNote: SAMPLE_VOICE_NOTE },
  ],
  'Mason': [
    { id: 'JOB-20001', customerName: 'Suresh Patel', phone: '98234xxxxx', service: 'Wall Construction', skillType: 'Mason', address: '23, Industrial Area', area: 'Guindy', distance: '1.8 km', estimatedPay: 2000, description: 'Compound wall construction 10ft', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-20002', customerName: 'Lakshmi Devi', phone: '97654xxxxx', service: 'Plastering Work', skillType: 'Mason', address: '56, Temple Street', area: 'Mylapore', distance: '2.9 km', estimatedPay: 1200, description: 'Ceiling and wall plastering', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-20003', customerName: 'Venkat Rao', phone: '98123xxxxx', service: 'Brick Work', skillType: 'Mason', address: '89, Colony Road', area: 'Velachery', distance: '5.2 km', estimatedPay: 1800, description: 'Extension room brick work', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-20004', customerName: 'Ramakrishnan', phone: '99876xxxxx', service: 'Foundation Work', skillType: 'Mason', address: '167, Commercial Street', area: 'Purasawalkam', distance: '4.1 km', estimatedPay: 2500, description: 'House foundation leveling and work', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-20005', customerName: 'Sujatha', phone: '98345xxxxx', service: 'Tile Grouting', skillType: 'Mason', address: '89, Sector 5', area: 'Velachery', distance: '3.8 km', estimatedPay: 800, description: 'Tile grouting and joint finishing', voiceNote: SAMPLE_VOICE_NOTE },
  ],
  'Plumbing': [
    { id: 'JOB-30001', customerName: 'Anitha Krishnan', phone: '98567xxxxx', service: 'Pipe Leakage Fix', skillType: 'Plumbing', address: '34, Green Park', area: 'Adyar', distance: '1.5 km', estimatedPay: 500, description: 'Bathroom pipe leakage repair', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-30002', customerName: 'Mohammed Ali', phone: '99234xxxxx', service: 'Bathroom Fitting', skillType: 'Plumbing', address: '67, Beach Road', area: 'Besant Nagar', distance: '3.7 km', estimatedPay: 1500, description: 'New bathroom tap and shower installation', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-30003', customerName: 'Kavitha Raj', phone: '98789xxxxx', service: 'Water Tank Repair', skillType: 'Plumbing', address: '90, Main Road', area: 'Porur', distance: '6.1 km', estimatedPay: 800, description: 'Overhead tank leak sealing', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-30004', customerName: 'Dinesh Kumar', phone: '97567xxxxx', service: 'Kitchen Sink Installation', skillType: 'Plumbing', address: '123, Apartment Complex', area: 'T Nagar', distance: '2.5 km', estimatedPay: 700, description: 'Kitchen sink and drain installation', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-30005', customerName: 'Geeta Sharma', phone: '98234xxxxx', service: 'Water Filter Installation', skillType: 'Plumbing', address: '45, Housing Society', area: 'Saidapet', distance: '1.8 km', estimatedPay: 600, description: 'Whole house water filter setup', voiceNote: SAMPLE_VOICE_NOTE },
  ],
  'Tiles Laying': [
    { id: 'JOB-40001', customerName: 'Rajan Pillai', phone: '97890xxxxx', service: 'Floor Tiling', skillType: 'Tiles Laying', address: '12, Sunrise Apartments', area: 'Thoraipakkam', distance: '2.0 km', estimatedPay: 2500, description: 'Living room floor tiles - 200 sqft', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-40002', customerName: 'Deepa Nair', phone: '98456xxxxx', service: 'Bathroom Tiles', skillType: 'Tiles Laying', address: '45, Shanti Nagar', area: 'Tambaram', distance: '4.8 km', estimatedPay: 1800, description: 'Bathroom wall and floor tiles', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-40003', customerName: 'Ganesh Iyer', phone: '99123xxxxx', service: 'Kitchen Backsplash', skillType: 'Tiles Laying', address: '78, Teachers Colony', area: 'Chromepet', distance: '5.5 km', estimatedPay: 1200, description: 'Kitchen wall tiles installation', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-40004', customerName: 'Nitin Patel', phone: '98901xxxxx', service: 'External Paving', skillType: 'Tiles Laying', address: '201, Building C', area: 'OMR', distance: '4.2 km', estimatedPay: 3000, description: 'Outdoor patio tile laying', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-40005', customerName: 'Priya Singh', phone: '97345xxxxx', service: 'Tile Repair', skillType: 'Tiles Laying', address: '56, Main Plaza', area: 'Egmore', distance: '3.0 km', estimatedPay: 500, description: 'Broken tile replacement - 10 tiles', voiceNote: SAMPLE_VOICE_NOTE },
  ],
  'Electrical': [
    { id: 'JOB-50001', customerName: 'Sathish Kumar', phone: '98901xxxxx', service: 'Wiring Repair', skillType: 'Electrical', address: '23, Tech Park', area: 'Sholinganallur', distance: '1.2 km', estimatedPay: 700, description: 'Short circuit repair in bedroom', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-50002', customerName: 'Meena Sundaram', phone: '97678xxxxx', service: 'Fan Installation', skillType: 'Electrical', address: '56, Old Town', area: 'Triplicane', distance: '3.4 km', estimatedPay: 400, description: 'Ceiling fan installation - 2 units', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-50003', customerName: 'Prakash Reddy', phone: '98345xxxxx', service: 'Switchboard Repair', skillType: 'Electrical', address: '89, Market Street', area: 'Mambalam', distance: '2.8 km', estimatedPay: 600, description: 'Main switchboard replacement', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-50004', customerName: 'Harish Kumar', phone: '99234xxxxx', service: 'Light Installation', skillType: 'Electrical', address: '78, Residential Block', area: 'Besant Nagar', distance: '2.2 km', estimatedPay: 450, description: 'Living room ceiling light fixture setup', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-50005', customerName: 'Anjali Gupta', phone: '98567xxxxx', service: 'Power Outlet Installation', skillType: 'Electrical', address: '34, Tech Colony', area: 'Sholinganallur', distance: '1.5 km', estimatedPay: 350, description: 'Additional power outlet installation - 3x', voiceNote: SAMPLE_VOICE_NOTE },
  ],
  'Fabricator / Welder': [
    { id: 'JOB-60001', customerName: 'Karthik Murthy', phone: '98012xxxxx', service: 'Gate Fabrication', skillType: 'Fabricator / Welder', address: '34, Villa Road', area: 'ECR', distance: '4.0 km', estimatedPay: 3000, description: 'Main gate welding and repair', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-60002', customerName: 'Sundar Raj', phone: '97789xxxxx', service: 'Grill Work', skillType: 'Fabricator / Welder', address: '67, Apartments', area: 'OMR', distance: '2.5 km', estimatedPay: 2000, description: 'Window grills for 3 windows', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-60003', customerName: 'Jayanthi Devi', phone: '98567xxxxx', service: 'Railing Repair', skillType: 'Fabricator / Welder', address: '90, Housing Board', area: 'KK Nagar', distance: '3.9 km', estimatedPay: 1500, description: 'Staircase railing welding', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-60004', customerName: 'Mohamed Hassan', phone: '97123xxxxx', service: 'Metal Frame Work', skillType: 'Fabricator / Welder', address: '123, Industrial Park', area: 'Ambattur', distance: '6.5 km', estimatedPay: 2500, description: 'Industrial Metal frame welding', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-60005', customerName: 'Rajkumar', phone: '98901xxxxx', service: 'Gate Repair', skillType: 'Fabricator / Welder', address: '45, Residential Street', area: 'Kodambakkam', distance: '2.1 km', estimatedPay: 1200, description: 'Compound gate hinge welding repair', voiceNote: SAMPLE_VOICE_NOTE },
  ],
  'False Ceiling': [
    { id: 'JOB-70001', customerName: 'Vijay Anand', phone: '98678xxxxx', service: 'POP Ceiling', skillType: 'False Ceiling', address: '12, Corporate Tower', area: 'Nungambakkam', distance: '1.9 km', estimatedPay: 4000, description: 'Living room false ceiling - 300 sqft', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-70002', customerName: 'Revathi', phone: '97890xxxxx', service: 'Gypsum Board', skillType: 'False Ceiling', address: '45, Business Center', area: 'Egmore', distance: '2.7 km', estimatedPay: 3500, description: 'Office cabin ceiling work', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-70003', customerName: 'Senthil', phone: '99456xxxxx', service: 'Ceiling Repair', skillType: 'False Ceiling', address: '78, Mall Road', area: 'Phoenix', distance: '3.2 km', estimatedPay: 1500, description: 'Damaged ceiling panel replacement', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-70004', customerName: 'Anand Kumar', phone: '98234xxxxx', service: 'Acoustic Ceiling', skillType: 'False Ceiling', address: '202, Commercial Complex', area: 'OMR', distance: '4.8 km', estimatedPay: 2500, description: 'Acoustic false ceiling 250 sqft', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-70005', customerName: 'Lakshmi', phone: '97567xxxxx', service: 'Ceiling Painting', skillType: 'False Ceiling', address: '89, Park Avenue', area: 'T Nagar', distance: '3.4 km', estimatedPay: 1800, description: 'False ceiling painting and touch-up', voiceNote: SAMPLE_VOICE_NOTE },
  ],
  'Fence Work': [
    { id: 'JOB-80001', customerName: 'Murugan', phone: '98234xxxxx', service: 'Compound Fencing', skillType: 'Fence Work', address: '23, Farm House', area: 'Sriperumbudur', distance: '8.0 km', estimatedPay: 5000, description: 'Barbed wire fencing - 100m', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-80002', customerName: 'Kamal Hassan', phone: '97567xxxxx', service: 'Garden Fence', skillType: 'Fence Work', address: '56, Bungalow', area: 'Poes Garden', distance: '4.5 km', estimatedPay: 2500, description: 'Decorative garden fencing', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-80003', customerName: 'Priya Kumar', phone: '98901xxxxx', service: 'Wrought Iron Fence', skillType: 'Fence Work', address: '123, Estate Road', area: 'Injambakkam', distance: '5.2 km', estimatedPay: 3500, description: 'Wrought iron compound fencing - 80m', voiceNote: SAMPLE_VOICE_NOTE },
  ],
  'Gardening': [
    { id: 'JOB-90001', customerName: 'Nalini', phone: '98890xxxxx', service: 'Garden Maintenance', skillType: 'Gardening', address: '34, Green Villa', area: 'Boat Club', distance: '2.1 km', estimatedPay: 800, description: 'Monthly garden maintenance', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-90002', customerName: 'Raghavan', phone: '97123xxxxx', service: 'Plant Installation', skillType: 'Gardening', address: '67, Lake Estate', area: 'Injambakkam', distance: '5.8 km', estimatedPay: 1200, description: 'Balcony garden setup with pots', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-90003', customerName: 'Saroja', phone: '98456xxxxx', service: 'Lawn Work', skillType: 'Gardening', address: '90, Township', area: 'Pallavaram', distance: '6.5 km', estimatedPay: 1500, description: 'Lawn grass laying - 500 sqft', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-90004', customerName: 'Harish', phone: '99123xxxxx', service: 'Hedge Trimming', skillType: 'Gardening', address: '45, Villa Park', area: 'Kasturba Nagar', distance: '3.5 km', estimatedPay: 600, description: 'Large hedge trimming and shaping', voiceNote: SAMPLE_VOICE_NOTE },
  ],
  'AAC Panel Work': [
    { id: 'JOB-100001', customerName: 'Balaji', phone: '98567xxxxx', service: 'AAC Wall', skillType: 'AAC Panel Work', address: '12, Construction Site', area: 'Perungudi', distance: '3.0 km', estimatedPay: 3500, description: 'AAC block wall construction', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-100002', customerName: 'Shankar', phone: '97234xxxxx', service: 'Panel Installation', skillType: 'AAC Panel Work', address: '45, Factory', area: 'Ambattur', distance: '7.2 km', estimatedPay: 4500, description: 'AAC panel partition work', voiceNote: SAMPLE_VOICE_NOTE },
    { id: 'JOB-100003', customerName: 'Vikram', phone: '98678xxxxx', service: 'AAC Cladding', skillType: 'AAC Panel Work', address: '89, Office Complex', area: 'OMR', distance: '5.5 km', estimatedPay: 5500, description: 'External AAC cladding - 1000 sqft', voiceNote: SAMPLE_VOICE_NOTE },
  ],
};
