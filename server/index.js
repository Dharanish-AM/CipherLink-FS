import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const users = new Map(); // socket.id -> { username, publicKey }

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register', ({ username, publicKey }) => {
    users.set(socket.id, { username, publicKey });
    console.log(`Registered: ${username} with key ${publicKey.substring(0, 10)}...`);
    io.emit('users_list', Array.from(users.entries()).map(([id, user]) => ({
      id,
      username: user.username,
      publicKey: user.publicKey
    })));
  });

  socket.on('send_message', (data) => {
    const { receiverId, ciphertext, nonce, senderPublicKey } = data;
    const sender = users.get(socket.id);

    if (sender && receiverId) {
      console.log(`Relaying message from ${sender.username} to ${receiverId}`);
      io.to(receiverId).emit('receive_message', {
        senderId: socket.id,
        senderUsername: sender.username,
        ciphertext,
        nonce,
        senderPublicKey // This is the ephemeral public key for this message/session
      });
    }
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`User disconnected: ${user.username}`);
      users.delete(socket.id);
      io.emit('users_list', Array.from(users.entries()).map(([id, user]) => ({
        id,
        username: user.username,
        publicKey: user.publicKey
      })));
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Secure Relay Server running on port ${PORT}`);
});
