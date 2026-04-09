import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  fgRed: "\x1b[31m",
  fgGreen: "\x1b[32m",
  fgYellow: "\x1b[33m",
  fgBlue: "\x1b[34m",
  fgMagenta: "\x1b[35m",
  fgCyan: "\x1b[36m",
};

const logger = {
  getTimestamp: () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  },
  info: (tag, msg) => console.log(`${colors.dim}[${logger.getTimestamp()}]${colors.reset} ${colors.fgCyan}[${tag.padEnd(8)}]${colors.reset} ${msg}`),
  success: (tag, msg) => console.log(`${colors.dim}[${logger.getTimestamp()}]${colors.reset} ${colors.fgGreen}[${tag.padEnd(8)}]${colors.reset} ✔ ${msg}`),
  warn: (tag, msg) => console.log(`${colors.dim}[${logger.getTimestamp()}]${colors.reset} ${colors.fgYellow}[${tag.padEnd(8)}]${colors.reset} ⚠ ${msg}`),
  error: (tag, msg) => console.log(`${colors.dim}[${logger.getTimestamp()}]${colors.reset} ${colors.fgRed}[${tag.padEnd(8)}]${colors.reset} ✖ ${msg}`),
  relay: (msgId, from, to, size) => {
    console.log(`${colors.dim}[${logger.getTimestamp()}]${colors.reset} ${colors.fgMagenta}[RELAY   ]${colors.reset} ⚡ ${colors.bright}${msgId}${colors.reset} | ${colors.fgCyan}${from}${colors.reset} → ${colors.fgCyan}${to}${colors.reset} (${size} bytes)`);
  }
};

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const users = new Map();

io.on('connection', (socket) => {
  logger.info('NET_CONN', `New physical connection: ${colors.bright}${socket.id.substring(0, 8)}${colors.reset}`);

  socket.on('register', ({ username, publicKey }) => {
    users.set(socket.id, { username, publicKey });
    logger.success('REG_NODE', `Operator ${colors.bright}${username.toUpperCase()}${colors.reset} registered identity [Key: ${publicKey.substring(0, 12)}...]`);
    
    io.emit('users_list', Array.from(users.entries()).map(([id, user]) => ({
      id,
      username: user.username,
      publicKey: user.publicKey
    })));
  });

  socket.on('send_message', (data) => {
    const { msgId, receiverId, ciphertext, nonce, senderPublicKey } = data;
    const sender = users.get(socket.id);
    const receiver = users.get(receiverId);

    if (sender && receiverId) {
      const size = new TextEncoder().encode(ciphertext).length;
      logger.relay(msgId.substring(0, 8), sender.username.toUpperCase(), (receiver?.username || 'UNKNOWN').toUpperCase(), size);
      
      io.to(receiverId).emit('receive_message', {
        msgId,
        senderId: socket.id,
        senderUsername: sender.username,
        ciphertext,
        nonce,
        senderPublicKey
      });
    } else {
      logger.error('TX_FAIL', `Message from ${sender?.username || 'Unknown'} failed: Receiver ${receiverId.substring(0, 8)} not found.`);
    }
  });

  socket.on('disconnect', (reason) => {
    const user = users.get(socket.id);
    if (user) {
      logger.warn('NET_DISC', `Operator ${colors.bright}${user.username.toUpperCase()}${colors.reset} dropped connection. Reason: ${reason}`);
      users.delete(socket.id);
      io.emit('users_list', Array.from(users.entries()).map(([id, user]) => ({
        id,
        username: user.username,
        publicKey: user.publicKey
      })));
    } else {
      logger.info('NET_DISC', `Physical connection closed: ${socket.id.substring(0, 8)}`);
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`
${colors.fgCyan}  ____ _       _               _     _       _      
 / ___(_)_ __ | |__   ___ _ __| |   (_)_ __ | | __  
| |   | | '_ \\| '_ \\ / _ \\ '__| |   | | '_ \\| |/ /  
| |___| | |_) | | | |  __/ |  | |___| | | | |   <   
 \\____|_| .__/|_| |_|\\___|_|  |_____|_|_| |_|_|\\_\\  
        |_|                                         ${colors.reset}
  ${colors.bright}SECure RElay SERver v1.0.0${colors.reset}
  ${colors.dim}-----------------------------------------${colors.reset}
  ${colors.fgGreen}✔${colors.reset} WebSocket Protocol: v4
  ${colors.fgGreen}✔${colors.reset} Encryption Support: NaCl/X25519
  ${colors.fgGreen}✔${colors.reset} Status: Listening on port ${PORT}
  ${colors.dim}-----------------------------------------${colors.reset}
  `);
});

