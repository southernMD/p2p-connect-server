/*
 * @Description: create by southernMD
 */
const express = require('express');
const http = require('http');
const cors = require('cors');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);

app.use(cors());

const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
/*
  A类地址：10.0.0.0–10.255.255.255
  B类地址：172.16.0.0–172.31.255.255 
  C类地址：192.168.0.0–192.168.255.255
*/
function internalNet(ip) {
  if (ip.startsWith('10.')) {
    return true;
  }
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1]);
    if (second >= 16 && second <= 31) {
      return true;
    }
  }
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith("::1")) return true;
  return false;
}

function getKey(ip) {
  const isInternalNet = internalNet(ip);
  return isInternalNet ? ip : 'external'
}

io.on('connection', (socket) => {
  const baseIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.headers['x-real-ip'] || socket.handshake.address;
  const baseIplist = baseIp.split(',').map(ip => ip.trim());
  let roomId
  for (let i = 0; i < baseIplist.length; i++) {
    const ip = baseIplist[i];
    const cleanIp = ip.split('::ffff:').join('');
    const roomKey = getKey(cleanIp);
    const ipParts = cleanIp.split('.');
    const subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
    console.log(`用户ip: ${cleanIp}, 房间: ${roomKey}, 区域: ${subnet}`);
    roomId = roomKey !== 'external' ? subnet : 'external'
    if (roomId !== 'external') break;
  }
  socket.join(roomId);
  console.log(`Socket ${socket.id} joined room ${roomId}`);
  socket.emit("me", { id: socket.id, userList: Array.from(io.sockets.adapter.rooms.get(roomId) || []) });

  socket.on("one-user-join-room", ({ signal, newSocketId, oldSocketId }) => {
    socket.broadcast.to(roomId).emit("one-user-joined", { signal, newSocketId, oldSocketId });
    console.log('a user connected');
  });

  socket.on("give-new-user-signal", ({ newSocketId, signal, oldSocketId }) => {
    console.log(newSocketId);
    io.to(newSocketId).emit("get-old-user-signal", { signal, oldSocketId });
  });

  socket.on('disconnect', () => {
    console.log("disconnect");
    socket.leave(roomId);
    socket.broadcast.to(roomId).emit('user-leave', { id: socket.id });
  });
});

server.listen(5001, () => {
  console.log('listening on port 5001')
})