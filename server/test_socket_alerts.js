const { io } = require('../client/node_modules/socket.io-client');

async function testSocketAlerts() {
  console.log('Testing Real-time Socket.IO Host Alerts...');
  const testRoomId = 'TRV-SOCKET-TEST';
  const testSessionId = `TRV-${testRoomId}-TESTSESS`;

  const hostSocket = io('http://127.0.0.1:5000', {
    path: '/socket.io',
    transports: ['websocket'],
  });

  const candidateSocket = io('http://127.0.0.1:5000', {
    path: '/socket.io',
    transports: ['websocket'],
  });

  await new Promise((resolve) => {
    let hostReady = false;
    let candidateReady = false;

    hostSocket.on('connect', () => {
      console.log('✓ Host Socket Connected:', hostSocket.id);
      hostSocket.emit('join_room', {
        roomId: testRoomId,
        sessionId: testRoomId,
        role: 'reviewer',
      });
      hostReady = true;
      if (candidateReady) resolve();
    });

    candidateSocket.on('connect', () => {
      console.log('✓ Candidate Socket Connected:', candidateSocket.id);
      candidateSocket.emit('join_room', {
        roomId: testRoomId,
        sessionId: testSessionId,
        role: 'participant',
        user: { id: 'cand_test_01', name: 'Test Candidate Rahul' },
      });
      candidateReady = true;
      if (hostReady) resolve();
    });
  });

  // Host registers alert listeners
  let alertReceived = false;
  let riskReceived = false;

  hostSocket.on('proctor_alert', (data) => {
    console.log('✓ [Host Received proctor_alert]:', data.type, 'from candidate:', data.candidateName, 'Severity:', data.severity, 'Risk:', data.riskScore);
    alertReceived = true;
  });

  hostSocket.on('participant_risk_updated', (data) => {
    console.log('✓ [Host Received participant_risk_updated]:', data.candidateName, 'Risk:', data.riskScore);
    riskReceived = true;
  });

  // Candidate emits AI event
  setTimeout(() => {
    console.log('Candidate emitting AI violation event...');
    candidateSocket.emit('ai_event', {
      sessionId: testSessionId,
      roomId: testRoomId,
      eventType: 'PHONE_DETECTED',
      type: 'PHONE_DETECTED',
      severity: 'HIGH',
      confidence: 0.95,
      evidence: 'Mobile device detected in camera frame',
      captureTimestamp: Date.now(),
    });
  }, 1000);

  // Wait and verify
  await new Promise((resolve, reject) => {
    setTimeout(() => {
      hostSocket.disconnect();
      candidateSocket.disconnect();
      if (alertReceived && riskReceived) {
        console.log('✓ SUCCESS: Real-Time Socket.IO Alert & Risk Update Flow Verified!');
        resolve();
      } else {
        reject(new Error(`Failed: alertReceived=${alertReceived}, riskReceived=${riskReceived}`));
      }
    }, 3000);
  });
}

testSocketAlerts()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
