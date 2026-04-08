import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Shield, Send, Users, Lock, Unlock, Eye, Ghost, Trash2 } from 'lucide-react';
import { generateKeyPair, encryptMessage, decryptMessage, getFingerprint } from './crypto';

const SOCKET_URL = 'http://localhost:3001';

function App() {
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
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

  const messagesEndRef = useRef(null);

  const addLog = (action, details) => {
    setSecurityLogs(prev => [{
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      action,
      details
    }, ...prev].slice(0, 10));
  };

  const handleLogin = () => {
    if (!username.trim()) return;
    
    const keys = generateKeyPair();
    setMyKeys(keys);
    
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('register', {
        username: username.trim(),
        publicKey: keys.publicKey
      });
      addLog('KEY_GEN', `Generated static identity keys. Public: ${keys.publicKey.substring(0, 12)}...`);
    });

    newSocket.on('users_list', (usersList) => {
      setUsers(usersList.filter(u => u.id !== newSocket.id));
    });

    newSocket.on('receive_message', async (data) => {
      try {
        addLog('RCV_PACKET', `Received encrypted payload from ${data.senderUsername}`);
        
        const decrypted = decryptMessage(
          data.ciphertext,
          data.nonce,
          data.senderPublicKey,
          keys.secretKey
        );

        addLog('DECRYPT_SUCCESS', `Successfully decrypted message using NaCl box.open`);

        const newMessage = {
          id: Date.now(),
          msgId: data.msgId,
          senderId: data.senderId,
          senderUsername: data.senderUsername,
          text: decrypted,
          timestamp: new Date().toLocaleTimeString(),
          isSent: false,
          security: {
            nonce: data.nonce,
            ciphertext: data.ciphertext,
            sharedKey: 'Derived via X25519'
          }
        };

        setMessages(prev => {
          if (data.msgId && prev.some(m => m.msgId === data.msgId)) {
            addLog('REPLAY_BLOCKED', `Blocked duplicate packet ID: ${data.msgId.substring(0, 8)}`);
            return prev;
          }

          // SELF-DESTRUCT: Remove after 30 seconds
          setTimeout(() => {
            setMessages(current => current.filter(m => m.msgId !== data.msgId));
            addLog('SELF_DESTRUCT', `Message ${data.msgId ? data.msgId.substring(0, 8) : 'unknown'} has been purged from memory.`);
          }, 30000);

          return [...prev, newMessage];
        });
      } catch (err) {
        addLog('DECRYPT_ERROR', `Integrity check failed: ${err.message}`);
      }
    });

    setIsLoggedIn(true);
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
        addLog('ATTACK_SUCCESS', 'Packet integrity compromised at offset +10.');
        setIsAttackMode(false);
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
          <div className="header" style={{ border: 'none' }}>
            <Shield className="pulse" color="#00ff41" size={48} />
            <div className="title">CipherLink FS</div>
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center' }}>
            SECURE TERMINAL ACCESS REQUIRED
          </p>
          <input
            type="text"
            placeholder="ENTER OPERATOR CALLSIGN"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button onClick={handleLogin}>INITIALIZE SECURE SESSION</button>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)' }}>
            <Users size={18} />
            <span>ACTIVE NODES</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {users.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No other nodes detected...</p>
            ) : (
              users.map(u => (
                <div 
                  key={u.id} 
                  className={`user-item ${selectedUser?.id === u.id ? 'active' : ''}`}
                  onClick={() => setSelectedUser(u)}
                >
                  <div style={{ fontWeight: 'bold' }}>{u.username}</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>
                    FP: {fingerprints[u.id] || 'Calculating...'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="chat-area">
          <div className="encryption-indicator">
            <Lock size={12} />
            <span>E2EE ACTIVE // PACKET ENCRYPTION: NACL_BOX</span>
          </div>

          <div style={{ padding: '10px 20px', display: 'flex', gap: '15px', borderBottom: '1px solid var(--border-color)' }}>
            <button 
              className={isAttackMode ? 'active' : ''} 
              style={{ fontSize: '0.6rem', padding: '5px 10px', color: isAttackMode ? 'var(--danger)' : 'var(--accent)', borderColor: isAttackMode ? 'var(--danger)' : 'var(--accent)' }}
              onClick={() => setIsAttackMode(!isAttackMode)}
            >
              {isAttackMode ? '🔥 ATTACK MODE ARMED' : '👾 SIMULATE MITM ATTACK'}
            </button>
          </div>
          
          <div className="messages-list">
            {messages.filter(m => 
              m.isSent ? (true) : (m.senderId === selectedUser?.id)
            ).map((m) => (
              <div key={m.id} className={`message-item ${m.isSent ? 'sent' : 'received'}`}>
                <div className="message-header">
                  <span>{m.isSent ? 'YOU' : m.senderUsername}</span>
                  <span>{m.timestamp}</span>
                </div>
                <div className="message-body">{m.text}</div>
                <div 
                  style={{ fontSize: '0.6rem', marginTop: '5px', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'monospace' }}
                  onClick={() => setInspectPacket(m)}
                >
                  <Eye size={10} style={{ marginRight: '4px' }} />
                  {m.security.ciphertext.substring(0, 32)}... [INSPECT]
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-area">
            <input
              type="text"
              placeholder={selectedUser ? `ENCRYPT MESSAGE FOR ${selectedUser.username.toUpperCase()}...` : 'SELECT A NODE TO START COMMS'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={!selectedUser}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            />
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
            <div key={log.id} className="security-log">
              <div className="log-label">[{log.timestamp}] {log.action}</div>
              <div className="log-value">{log.details}</div>
            </div>
          ))}

          {inspectPacket && (
            <div style={{ marginTop: '20px', background: '#000', padding: '10px', border: '1px dashed var(--accent)', fontSize: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ color: 'var(--accent)' }}>PACKET_INSPECTOR v1.0</span>
                <Trash2 size={12} style={{ cursor: 'pointer' }} onClick={() => setInspectPacket(null)} />
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
