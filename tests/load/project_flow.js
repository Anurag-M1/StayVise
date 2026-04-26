import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, THRESHOLDS } from './config.js';

const projectCreationTime = new Trend('project_creation_duration');
const paymentFlowTime = new Trend('payment_flow_duration');
const milestoneApprovalTime = new Trend('milestone_approval_duration');

export const options = {
  thresholds: {
    ...THRESHOLDS,
    'project_creation_duration': ['p(95)<500'],
    'payment_flow_duration': ['p(95)<1000'],
    'milestone_approval_duration': ['p(95)<300'],
  },
  scenarios: {
    steady_state: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
    }
  }
};

export function setup() {
  const users = [];
  console.log(`Setting up 10 test users at ${BASE_URL}`);
  
  for(let i=0; i<10; i++) {
    const phone = `+9199${Math.floor(Math.random()*100000000).toString().padStart(8,'0')}`;
    
    // 1. Send OTP
    const sendRes = http.post(`${BASE_URL}/auth/send-otp`, 
      JSON.stringify({phone_number: phone}),
      {headers: {'Content-Type': 'application/json'}}
    );
    
    // In staging/dev, we expect the OTP to be in the response for automation
    const otp = sendRes.json().otp || '123456'; 
    
    // 2. Verify OTP
    const verifyRes = http.post(`${BASE_URL}/auth/verify-otp`,
      JSON.stringify({
        phone_number: phone, 
        otp: otp, 
        full_name: `Load Test User ${i}`
      }),
      {headers: {'Content-Type': 'application/json'}}
    );
    
    if (verifyRes.status === 200) {
      users.push({
        token: verifyRes.json().access_token,
        id: verifyRes.json().user.id
      });
    } else {
      console.error(`Failed to setup user ${i}: ${verifyRes.body}`);
    }
  }
  
  if (users.length === 0) {
    throw new Error('Failed to setup any test users. Check if OTP is returned in response.');
  }
  
  return { users };
}

export default function(data) {
  const user = data.users[Math.floor(Math.random() * data.users.length)];
  const headers = { 
    'Authorization': `Bearer ${user.token}`,
    'Content-Type': 'application/json'
  };

  // 1. List projects
  const listRes = http.get(`${BASE_URL}/projects`, { headers });
  check(listRes, { 'list projects: 200': (r) => r.status === 200 });
  
  // 2. Create project
  const createStart = Date.now();
  const createRes = http.post(`${BASE_URL}/projects`,
    JSON.stringify({
      title: `Load test project ${Date.now()}`,
      description: 'Automatically generated load test project',
      budget: 10000,
      milestones: [{
        title: 'Initial Delivery', 
        amount: 10000, 
        sequence_number: 1,
        description: 'First milestone'
      }]
    }),
    { headers }
  );
  
  const duration = Date.now() - createStart;
  projectCreationTime.add(duration);
  
  check(createRes, { 
    'create project: 201': (r) => r.status === 201,
    'create project: < 500ms': () => duration < 500
  });

  if (createRes.status === 201) {
    const project = createRes.json();
    const projectId = project.id;
    const milestoneId = project.milestones[0].id;

    // 3. Payment Flow (Initiate order)
    const payStart = Date.now();
    const payRes = http.post(`${BASE_URL}/payments/create-order`,
      JSON.stringify({ project_id: projectId }),
      { headers }
    );
    paymentFlowTime.add(Date.now() - payStart);
    check(payRes, { 'initiate payment: 201': (r) => r.status === 201 });

    // 4. Milestone Approval
    const approveStart = Date.now();
    const approveRes = http.post(`${BASE_URL}/projects/${projectId}/milestones/${milestoneId}/approve`,
      null,
      { headers }
    );
    milestoneApprovalTime.add(Date.now() - approveStart);
    check(approveRes, { 'approve milestone: 200': (r) => r.status === 200 });
  }
  
  sleep(2);
}

export function teardown(data) {
  console.log(`Load test complete. Created ${data.users.length} user sessions.`);
}
