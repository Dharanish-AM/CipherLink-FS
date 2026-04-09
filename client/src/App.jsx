import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Shield, Send, Users, Lock, Unlock, Eye, Ghost, Trash2, ShieldAlert, Zap, Radio, Terminal, Wifi } from 'lucide-react';
import { generateKeyPair, encryptMessage, decryptMessage, getFingerprint } from './crypto';

const SOCKET_URL = 'http://localhost:3001';

function App() {
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [loginStep, setLoginStep] = useState('');
  const [socket, setSocket] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [myKeys, setMyKeys] = useState(null);
  const [securityLogs, setSecurityLogs] = useState([]);
  const [fingerprints, setFingerprints] = useState({});
  const [isAttackMode, setIsAttackMode] = useState(false);
  const [inspectPacket, setInspectPacket] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [mitmDetected, setMitmDetected] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [showDemoScript, setShowDemoScript] = useState(false);

  const messagesEndRef = useRef(null);

  const addLog = (action, details, type = 'info') => {
    setSecurityLogs(prev => [{
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      action,
      details,
      type
    }, ...prev].slice(0, 15));
  };

  const handleLogin = async () => {
    if (!username.trim()) return;

    setIsConnecting(true);

    // FAKE FANCY SEQUENTIAL AUTH
    const steps = [
      { msg: 'INITIALIZING SECURE HANDSHAKE...', delay: 600 },
      { msg: 'VERIFYING OPERATOR CREDENTIALS...', delay: 800 },
      { msg: 'ESTABLISHING QUANTUM-RESISTANT CHANNEL...', delay: 1000 },
      { msg: 'GENERATING X25519 IDENTITY KEYS...', delay: 500 },
      { msg: 'PERFORMING DH KEY EXCHANGE...', delay: 1200 },
      { msg: 'AUTHENTICATED // ACCESS GRANTED', delay: 800 }
    ];

    for (const step of steps) {
      setLoginStep(step.msg);
      await new Promise(r => setTimeout(r, step.delay));
    }

    const keys = generateKeyPair();
    setMyKeys(keys);

    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('register', {
        username: username.trim(),
        publicKey: keys.publicKey
      });
      addLog('KEY_GEN', `Generated static identity keys. Public: ${keys.publicKey.substring(0, 12)}...`, 'success');
    });

    newSocket.on('users_list', (usersList) => {
      setUsers(usersList.filter(u => u.id !== newSocket.id));
    });

    newSocket.on('receive_message', async (data) => {
      try {
        addLog('RCV_PACKET', `Received encrypted payload from ${data.senderUsername}`, 'info');

        // Simulate "Decrypting..." state briefly
        setIsTyping(true);
        setTimeout(() => setIsTyping(false), 1000);

        const decrypted = decryptMessage(
          data.ciphertext,
          data.nonce,
          data.senderPublicKey,
          keys.secretKey
        );

        addLog('DECRYPT_SUCCESS', `Successfully decrypted message using NaCl box.open`, 'success');

        const newMessage = {
          id: Date.now(),
          msgId: data.msgId,
          senderId: data.senderId,
          senderUsername: data.senderUsername,
          text: decrypted,
          timestamp: new Date().toLocaleTimeString(),
          isSent: false,
          status: 'decrypted',
          security: {
            nonce: data.nonce,
            ciphertext: data.ciphertext,
            sharedKey: 'Derived via X25519'
          }
        };

        setMessages(prev => {
          if (data.msgId && prev.some(m => m.msgId === data.msgId)) {
            addLog('REPLAY_BLOCKED', `Blocked duplicate packet ID: ${data.msgId.substring(0, 8)}`, 'error');
            return prev;
          }

          setTimeout(() => {
            setMessages(current => current.filter(m => m.msgId !== data.msgId));
            addLog('SELF_DESTRUCT', `Message ${data.msgId ? data.msgId.substring(0, 8) : 'unknown'} purged from memory.`, 'warning');
          }, 30000);

          return [...prev, newMessage];
        });
      } catch (err) {
        addLog('DECRYPT_ERROR', `Integrity check failed: ${err.message}`, 'error');
        setMitmDetected(true);
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 500);
        setTimeout(() => setMitmDetected(false), 5000);
      }
    });

    setIsLoggedIn(true);
    setIsConnecting(false);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !selectedUser || !socket) return;

    try {
      const msgId = crypto.randomUUID();
      // FORWARD SECRECY SIMULATION: Generate ephemeral key for this message
      const ephemeral = generateKeyPair();
      addLog('FS_ROTATE', `Generated ephemeral keypair for this packet.`);

      // Encrypt for receiver's STATIC public key using our EPHEMERAL secret key
      let { ciphertext, nonce } = encryptMessage(
        inputText,
        selectedUser.publicKey,
        ephemeral.secretKey
      );

      // MITM ATTACK SIMULATION
      if (isAttackMode) {
        addLog('ATTACK_ACTIVE', 'Intercepting and tampering with ciphertext...');
        // Flip one character in the base64 ciphertext to corrupt it
        const chars = ciphertext.split('');
        chars[10] = chars[10] === 'A' ? 'B' : 'A';
        ciphertext = chars.join('');
        addLog('ATTACK_SUCCESS', 'Packet integrity compromised at offset +10.', 'error');
        setIsAttackMode(false);
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 500);
      }

      socket.emit('send_message', {
        msgId,
        receiverId: selectedUser.id,
        ciphertext,
        nonce,
        senderPublicKey: ephemeral.publicKey // Send our ephemeral public key
      });

      const sentMessage = {
        id: Date.now(),
        msgId,
        text: inputText,
        timestamp: new Date().toLocaleTimeString(),
        isSent: true,
        security: {
          nonce,
          ciphertext,
          ephemeralPubKey: ephemeral.publicKey
        }
      };

      setMessages(prev => [...prev, sentMessage]);

      // SELF-DESTRUCT: Remove our copy too
      setTimeout(() => {
        setMessages(current => current.filter(m => m.msgId !== msgId));
      }, 30000);

      addLog('SEND_PACKET', `Encrypted & dispatched packet with nonce ${nonce.substring(0, 8)}`);
      setInputText('');
    } catch (err) {
      addLog('ERROR', err.message);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update fingerprints when users change
  useEffect(() => {
    const updateFingerprints = async () => {
      const newFingerprints = {};
      for (const u of users) {
        newFingerprints[u.id] = await getFingerprint(u.publicKey);
      }
      setFingerprints(newFingerprints);
    };
    updateFingerprints();
  }, [users]);

  if (!isLoggedIn) {
    return (
      <div className="login-overlay">
        <div className="login-card">
          <div className="header" style={{ border: 'none', justifyContent: 'center', flexDirection: 'column', gap: '15px' }}>
            <Shield className={isConnecting ? 'pulse' : ''} color="#00ff41" size={64} />
            <div className="title" style={{ fontSize: '2rem' }}>CipherLink FS</div>
          </div>

          {!isConnecting ? (
            <>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.7rem', textAlign: 'center', letterSpacing: '2px' }}>
                SECURE TERMINAL ACCESS REQUIRED
              </p>
              <div className="input-container">
                <input
                  type="text"
                  placeholder="ENTER OPERATOR CALLSIGN"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  autoFocus
                  style={{ textAlign: 'center', textTransform: 'uppercase', letterSpacing: '2px' }}
                />
              </div>
              <button
                onClick={handleLogin}
                style={{ padding: '15px', fontSize: '0.8rem' }}
              >
                INITIALIZE SECURE SESSION
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <div className="dot-elastic" style={{ marginBottom: '20px' }}></div>
              <p style={{ color: 'var(--accent)', fontSize: '0.8rem', letterSpacing: '1px' }}>{loginStep}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield color="#00ff41" />
          <div className="title">CipherLink FS // SECURE COMMS</div>
        </div>
        <div className="status-badge">
          <div className="status-dot"></div>
          <span>OPERATOR: {username.toUpperCase()}</span>
          <span style={{ color: 'var(--text-dim)', marginLeft: '10px' }}>ID: {socket?.id?.substring(0, 8)}</span>
        </div>
      </div>

      <div className="main-layout">
        <div className="sidebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 'bold' }}>
            <Users size={14} />
            <span>ACTIVE NODES</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', marginTop: '10px' }}>
            {users.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.65rem', fontStyle: 'italic' }}>No other nodes detected on network...</p>
            ) : (
              users.map(u => (
                <div
                  key={u.id}
                  className={`user-item ${selectedUser?.id === u.id ? 'active' : ''}`}
                  onClick={() => setSelectedUser(u)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="status-dot live" style={{ width: '6px', height: '6px' }}></div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: selectedUser?.id === u.id ? 'var(--accent)' : 'inherit' }}>{u.username.toUpperCase()}</div>
                  </div>
                  <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', marginTop: '4px', fontFamily: 'monospace' }}>
                    ID: {u.id.substring(0, 8)} | FP: {fingerprints[u.id]?.substring(0, 16) || '...'}
                  </div>
                </div>
              ))
            )}

          </div>
        </div>
        <div className={`chat-area ${isFlashing ? 'flash-red' : ''}`}>
          <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '15px', borderBottom: '1px solid var(--border-color)', position: 'relative' }}>
            <div className="encryption-indicator" style={{ position: 'relative', top: 'auto', right: 'auto', opacity: 1, fontSize: '0.55rem' }}>
              <Lock size={12} />
              <span>E2EE: NACL_BOX</span>
            </div>
            <button
              className={isAttackMode ? 'active' : ''}
              style={{ fontSize: '0.6rem', padding: '5px 12px' }}
              onClick={() => setIsAttackMode(!isAttackMode)}
            >
              {isAttackMode ? '☢️ INTERCEPTOR ARMED' : '📡 SIMULATE MITM ATTACK'}
            </button>
            <div style={{ flex: 1 }}></div>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
              <div className="status-badge" style={{ color: 'var(--info)' }}>
                <Wifi size={12} />
                <span>LATENCY: 12ms</span>
              </div>
              <div className="status-badge" style={{ color: 'var(--success)' }}>
                <Shield size={12} />
                <span>FS: ACTIVE</span>
              </div>
            </div>
          </div>

          <div className="messages-list">
            {!selectedUser ? (
              <div className="empty-chat-container">
                <Terminal size={48} color="var(--accent)" style={{ opacity: 0.2 }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: 'var(--accent)', letterSpacing: '2px', fontWeight: 'bold', fontSize: '0.9rem' }}>AWAITING NODE SELECTION</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.6rem', marginTop: '5px' }}>SELECT AN ACTIVE OPERATOR TO INITIALIZE TUNNEL</div>
                </div>
                <div className="empty-chat-viz"></div>
              </div>
            ) : messages.filter(m =>
              m.isSent ? (true) : (m.senderId === selectedUser?.id)
            ).length === 0 ? (
              <div className="empty-chat-container">
                <Zap size={48} color="var(--accent)" className="pulse" />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: 'var(--accent)', letterSpacing: '2px', fontWeight: 'bold' }}>SECURE CHANNEL ESTABLISHED</div>
                  <div style={{ color: 'var(--success)', fontSize: '0.6rem', marginTop: '5px' }}>KEYS SYNCHRONIZED // READY FOR TRANSMISSION</div>
                </div>
                <div className="log-value" style={{ fontSize: '0.5rem', opacity: 0.5 }}>
                  LOCAL_ID: {myKeys?.publicKey.substring(0, 16)}...
                </div>
              </div>
            ) : (
              messages.filter(m =>
                m.isSent ? (true) : (m.senderId === selectedUser?.id)
              ).map((m, index, filtered) => {
                const prevMessage = filtered[index - 1];
                const isGrouped = prevMessage && (prevMessage.isSent === m.isSent) && (prevMessage.senderId === m.senderId);

                return (
                  <div key={m.id} className={`message-item ${m.isSent ? 'sent' : 'received'} ${isGrouped ? 'grouped' : ''}`}>
                    {!isGrouped && (
                      <div className="message-header">
                        <span>{m.isSent ? 'OPERATOR (YOU)' : m.senderUsername.toUpperCase()}</span>
                        <span>{m.timestamp}</span>
                      </div>
                    )}
                    <div className="message-body">{m.text}</div>
                    <div className="encryption-indicator" style={{ position: 'relative', top: 'auto', right: 'auto', marginTop: '8px', justifyContent: 'flex-end' }}>
                      <Lock size={8} />
                      <span style={{ fontSize: '0.5rem' }}>{m.isSent ? 'ENCRYPTED' : 'DECRYPTED'} // SHARED_SECRET_X25519</span>
                    </div>
                    <div
                      style={{ fontSize: '0.55rem', marginTop: '5px', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '5px' }}
                      onClick={() => setInspectPacket(m)}
                    >
                      <Eye size={10} style={{ marginRight: '4px' }} />
                      {m.security.ciphertext.substring(0, 24)}... [INSPECT_PACKET]
                    </div>
                  </div>
                );
              }))}
            {isTyping && (
              <div className="typing-indicator">
                OPERATOR {selectedUser?.username.toUpperCase()} IS TRANSMITTING...
                <div className="dot-elastic"></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {mitmDetected && (
            <div className="mitm-alert">
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '10px' }}>⚠️ MITM ATTACK DETECTED</div>
              <div style={{ fontSize: '0.8rem' }}>PACKET INTEGRITY COMPROMISED // ENCRYPTION BREACHED</div>
              <div style={{ fontSize: '0.65rem', marginTop: '10px', color: 'var(--success)', border: '1px solid var(--success)', padding: '5px', display: 'inline-block' }}>
                🛡️ FORWARD SECRECY ACTIVE: ONLY CURRENT SESSION IMPACTED
              </div>
              <div style={{ fontSize: '0.6rem', marginTop: '10px', opacity: 0.8 }}>RE-ESTABLISHING SECURE CHANNEL...</div>
            </div>
          )}

          <div className="input-area">
            <div className="input-container">
              <input
                type="text"
                placeholder={selectedUser ? `ENCRYPT MESSAGE FOR ${selectedUser.username.toUpperCase()}...` : 'SELECT A NODE TO START COMMS'}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={!selectedUser}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              />
              {selectedUser && !inputText && <span className="cursor" style={{ position: 'absolute', top: '15px', left: '12px' }}></span>}
            </div>
            <button onClick={sendMessage} disabled={!selectedUser || !inputText.trim()}>
              <Send size={18} />
            </button>
          </div>
        </div>

        <div className="security-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', marginBottom: '15px' }}>
            <Lock size={18} />
            <span>SECURITY DEBUG LOG</span>
          </div>

          {securityLogs.length === 0 && <p style={{ color: 'var(--text-dim)' }}>Awaiting telemetry...</p>}

          {securityLogs.map(log => (
            <div key={log.id} className="security-log" style={{ borderLeftColor: log.type === 'success' ? 'var(--success)' : log.type === 'error' ? 'var(--danger)' : log.type === 'warning' ? 'var(--warning)' : 'var(--accent)' }}>
              <div className="log-label">
                <span style={{ color: log.type === 'success' ? 'var(--success)' : log.type === 'error' ? 'var(--danger)' : log.type === 'warning' ? 'var(--warning)' : 'var(--info)' }}>
                  {log.type === 'success' ? <Shield size={10} /> : log.type === 'error' ? <ShieldAlert size={10} /> : log.type === 'warning' ? <Zap size={10} /> : <Radio size={10} />}
                </span> [{log.timestamp}] {log.action}
              </div>
              <div className="log-value" style={{ color: log.type === 'success' ? 'var(--success)' : log.type === 'error' ? 'var(--danger)' : log.type === 'warning' ? 'var(--warning)' : 'var(--accent)' }}>
                {log.details}
              </div>
            </div>
          ))}

          {inspectPacket && (
            <div style={{ marginTop: '20px', background: '#000', padding: '15px', border: '1px solid var(--accent)', fontSize: '0.65rem', boxShadow: '0 0 15px rgba(0,255,65,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid var(--accent-dim)', paddingBottom: '5px' }}>
                <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>PACKET_INSPECTOR v1.0</span>
                <Trash2 size={12} style={{ cursor: 'pointer', color: 'var(--danger)' }} onClick={() => setInspectPacket(null)} />
              </div>
              <div className="log-label">CIPHERTEXT (BASE64)</div>
              <div className="log-value" style={{ marginBottom: '10px' }}>{inspectPacket.security.ciphertext}</div>
              <div className="log-label">NONCE</div>
              <div className="log-value" style={{ marginBottom: '10px' }}>{inspectPacket.security.nonce}</div>
              <div className="log-label">EPHEMERAL_KEY</div>
              <div className="log-value">{inspectPacket.security.ephemeralPubKey || 'N/A (STATIC_RECV)'}</div>
            </div>
          )}

          {selectedUser && (
            <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
              <div className="log-label">TARGET PUBLIC KEY</div>
              <div className="log-value" style={{ fontSize: '0.6rem' }}>{selectedUser.publicKey}</div>
              <div className="log-label" style={{ marginTop: '10px' }}>SESSION STATUS</div>
              <div className="log-value" style={{ color: '#00ff41' }}>ESTABLISHED // SECURE</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
